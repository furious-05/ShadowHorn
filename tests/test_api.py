#!/usr/bin/env python3
"""ShadowHorn API test suite — verifies all endpoints are reachable and respond correctly."""

import sys
import json
import requests

BASE = "http://localhost:5000"
TOKEN = None
PASS = 0
FAIL = 0
SKIP = 0


def color(text, code):
    return f"\033[{code}m{text}\033[0m"

def green(t):  return color(t, 32)
def red(t):    return color(t, 31)
def yellow(t): return color(t, 33)
def cyan(t):   return color(t, 36)
def bold(t):   return color(t, 1)


def report(name, passed, detail=""):
    global PASS, FAIL
    if passed:
        PASS += 1
        print(f"  {green('PASS')}  {name}" + (f"  ({detail})" if detail else ""))
    else:
        FAIL += 1
        print(f"  {red('FAIL')}  {name}" + (f"  ({detail})" if detail else ""))


def headers():
    h = {"Content-Type": "application/json"}
    if TOKEN:
        h["Authorization"] = f"Bearer {TOKEN}"
    return h


def test_auth():
    global TOKEN
    print(f"\n{bold(cyan('--- Authentication ---'))}")

    # 1) Login with default credentials
    r = requests.post(f"{BASE}/api/auth/login", json={
        "username": "shadowhorn", "password": "ShadowHorn@2026"
    })
    if r.status_code == 200 and r.json().get("token"):
        TOKEN = r.json()["token"]
        report("POST /api/auth/login (default creds)", True, f"token={TOKEN[:20]}...")
    elif r.status_code == 401:
        # Password was already changed — try to get token with a common test password
        print(f"  {yellow('INFO')}  Default password already changed, trying common alternatives...")
        for pwd in ["ShadowHorn@2026!", "Test1234!", "Password123!"]:
            r2 = requests.post(f"{BASE}/api/auth/login", json={"username": "shadowhorn", "password": pwd})
            if r2.status_code == 200:
                TOKEN = r2.json()["token"]
                report("POST /api/auth/login (changed creds)", True)
                break
        else:
            report("POST /api/auth/login", False, f"HTTP {r.status_code}: {r.text[:100]}")
            print(f"\n  {red('Cannot proceed without auth token. Exiting.')}")
            return False
    else:
        report("POST /api/auth/login", False, f"HTTP {r.status_code}: {r.text[:100]}")
        return False

    # 2) Login with bad credentials
    r = requests.post(f"{BASE}/api/auth/login", json={"username": "bad", "password": "bad"})
    report("POST /api/auth/login (bad creds → 401)", r.status_code == 401)

    # 3) Login with empty body
    r = requests.post(f"{BASE}/api/auth/login", json={})
    report("POST /api/auth/login (empty → 400)", r.status_code == 400)

    # 4) Verify token
    r = requests.get(f"{BASE}/api/auth/verify", headers=headers())
    report("GET  /api/auth/verify", r.status_code == 200 and r.json().get("valid") is True,
           f"user={r.json().get('username')}")

    # 5) Verify with no token → 401
    r = requests.get(f"{BASE}/api/auth/verify")
    report("GET  /api/auth/verify (no token → 401)", r.status_code == 401)

    return True


def test_status_endpoints():
    print(f"\n{bold(cyan('--- Status & Config ---'))}")

    r = requests.get(f"{BASE}/api/status", headers=headers())
    report("GET  /api/status", r.status_code == 200 and "apis" in r.json(),
           f"mongo={r.json().get('mongodb')}")

    r = requests.get(f"{BASE}/api/get-keys", headers=headers())
    report("GET  /api/get-keys", r.status_code == 200,
           f"keys={list(r.json().keys()) if r.status_code == 200 else 'N/A'}")

    r = requests.get(f"{BASE}/api/correlation/backends", headers=headers())
    if r.status_code == 200:
        data = r.json()
        report("GET  /api/correlation/backends", True,
               f"default={data.get('default_backend')}")
    else:
        report("GET  /api/correlation/backends", False, f"HTTP {r.status_code}")


def test_dashboard_endpoints():
    print(f"\n{bold(cyan('--- Dashboard & Data ---'))}")

    r = requests.get(f"{BASE}/api/dashboard-summary", headers=headers())
    report("GET  /api/dashboard-summary", r.status_code == 200)

    r = requests.get(f"{BASE}/api/trends", headers=headers())
    report("GET  /api/trends", r.status_code == 200)

    r = requests.get(f"{BASE}/api/profiles", headers=headers())
    report("GET  /api/profiles", r.status_code == 200)

    r = requests.get(f"{BASE}/api/recent-top", headers=headers())
    report("GET  /api/recent-top", r.status_code == 200)

    r = requests.get(f"{BASE}/api/list-identifiers", headers=headers())
    data = r.json() if r.status_code == 200 else {}
    identifiers = list(data.get("identifiers", {}).keys()) if isinstance(data.get("identifiers"), dict) else []
    report("GET  /api/list-identifiers", r.status_code == 200,
           f"found {len(identifiers)} identifier(s)")

    return identifiers


def test_osint_data(identifiers):
    print(f"\n{bold(cyan('--- OSINT Data Retrieval ---'))}")

    if not identifiers:
        global SKIP
        SKIP += 2
        print(f"  {yellow('SKIP')}  GET /api/get-osint-data/<id> — no identifiers collected yet")
        print(f"  {yellow('SKIP')}  GET /api/get-correlation/<id> — no identifiers collected yet")
        return

    ident = identifiers[0]

    r = requests.get(f"{BASE}/api/get-osint-data/{ident}", headers=headers())
    report(f"GET  /api/get-osint-data/{ident}", r.status_code == 200)

    r = requests.get(f"{BASE}/api/get-correlation/{ident}", headers=headers())
    report(f"GET  /api/get-correlation/{ident}", r.status_code in (200, 404),
           f"HTTP {r.status_code}")


def test_protected_routes_without_auth():
    print(f"\n{bold(cyan('--- Auth Protection (no token → 401) ---'))}")

    endpoints = [
        ("GET",  "/api/status"),
        ("GET",  "/api/get-keys"),
        ("GET",  "/api/dashboard-summary"),
        ("GET",  "/api/profiles"),
        ("GET",  "/api/list-identifiers"),
        ("POST", "/api/save-keys"),
        ("POST", "/api/collect-profile"),
        ("POST", "/api/run-correlation"),
    ]

    for method, path in endpoints:
        if method == "GET":
            r = requests.get(f"{BASE}{path}")
        else:
            r = requests.post(f"{BASE}{path}", json={})
        report(f"{method:4} {path} → 401", r.status_code == 401)


def test_input_validation():
    print(f"\n{bold(cyan('--- Input Validation ---'))}")

    # collect-profile with no identifier
    r = requests.post(f"{BASE}/api/collect-profile", headers=headers(), json={})
    report("POST /api/collect-profile (empty → 400)", r.status_code == 400)

    # run-correlation with no identifier
    r = requests.post(f"{BASE}/api/run-correlation", headers=headers(), json={})
    report("POST /api/run-correlation (empty → 400)", r.status_code == 400)

    # save-keys with empty body
    r = requests.post(f"{BASE}/api/save-keys", headers=headers())
    report("POST /api/save-keys (no json → 400)", r.status_code == 400)

    # cleanup with no body
    r = requests.post(f"{BASE}/api/cleanup", headers=headers(), json={})
    report("POST /api/cleanup (empty → 400)", r.status_code == 400)


def test_save_and_read_keys():
    print(f"\n{bold(cyan('--- Save & Read Keys Round-trip ---'))}")

    # Read current keys
    r1 = requests.get(f"{BASE}/api/get-keys", headers=headers())
    original = r1.json() if r1.status_code == 200 else {}

    # Save with a test marker
    test_keys = {**original, "correlationModel": "test-roundtrip"}
    r2 = requests.post(f"{BASE}/api/save-keys", headers=headers(), json=test_keys)
    report("POST /api/save-keys (round-trip write)", r2.status_code == 200)

    # Read back
    r3 = requests.get(f"{BASE}/api/get-keys", headers=headers())
    saved = r3.json() if r3.status_code == 200 else {}
    report("GET  /api/get-keys (round-trip read)", saved.get("correlationModel") == "test-roundtrip")

    # Restore original
    restore = {**original}
    restore.pop("_id", None)
    requests.post(f"{BASE}/api/save-keys", headers=headers(), json=restore)


def test_frontend():
    print(f"\n{bold(cyan('--- Frontend (Nginx) ---'))}")

    try:
        r = requests.get("http://localhost:8080/", timeout=5)
        report("GET  http://localhost:8080/ (frontend)", r.status_code == 200 and "html" in r.text.lower(),
               f"HTTP {r.status_code}, {len(r.text)} bytes")
    except Exception as e:
        report("GET  http://localhost:8080/ (frontend)", False, str(e))

    try:
        r = requests.get("http://localhost:8080/api/status", timeout=5)
        report("GET  http://localhost:8080/api/status (nginx proxy)", r.status_code == 401,
               f"HTTP {r.status_code}")
    except Exception as e:
        report("GET  http://localhost:8080/api/status (nginx proxy)", False, str(e))


def main():
    print(f"\n{bold('='*60)}")
    print(f"{bold('  ShadowHorn API Test Suite')}")
    print(f"{bold('='*60)}")
    print(f"  Target: {BASE}")

    # Check backend is reachable
    try:
        requests.get(f"{BASE}/api/auth/verify", timeout=5)
    except requests.ConnectionError:
        print(f"\n  {red('ERROR')}: Cannot connect to {BASE}")
        print(f"  Make sure the backend is running: docker compose up -d")
        sys.exit(1)

    if not test_auth():
        sys.exit(1)

    test_status_endpoints()
    identifiers = test_dashboard_endpoints()
    test_osint_data(identifiers)
    test_protected_routes_without_auth()
    test_input_validation()
    test_save_and_read_keys()
    test_frontend()

    print(f"\n{bold('='*60)}")
    total = PASS + FAIL + SKIP
    print(f"  {bold('Results')}: {green(f'{PASS} passed')}  {red(f'{FAIL} failed') if FAIL else f'{FAIL} failed'}  {yellow(f'{SKIP} skipped') if SKIP else ''}")
    print(f"  {bold('Total')} : {total} tests")
    print(f"{'='*60}\n")

    sys.exit(1 if FAIL > 0 else 0)


if __name__ == "__main__":
    main()
