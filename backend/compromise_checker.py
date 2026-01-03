#!/usr/bin/env python3
import requests
import json
from datetime import datetime
import re
from pathlib import Path
import shutil

# ----------------------------
# OSINT Results Folder
# ----------------------------
OSINT_RESULTS_DIR = Path("osint_results")
if not OSINT_RESULTS_DIR.exists():
    OSINT_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# ----------------------------
# Fetch COMB leaks from ProxyNova
# ----------------------------
def fetch_comb_leaks(username_or_email, limit=100):
    url = f"https://api.proxynova.com/comb?query={username_or_email}&start=0&limit={limit}"
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            leaks = data.get("lines", [])
            return {"comb_leaks_found": len(leaks), "comb_leaks": leaks}
    except Exception as e:
        print(f"[!] Error fetching COMB leaks: {e}")
    return {"comb_leaks_found": 0, "comb_leaks": []}

# ----------------------------
# Detect if input is email
# ----------------------------
def is_email(input_str):
    return re.match(r"[^@]+@[^@]+\.[^@]+", input_str) is not None

# ----------------------------
# Fetch HudsonRock info-stealer compromise
# ----------------------------
def fetch_hudsonrock(username_or_email):
    if is_email(username_or_email):
        url = f"https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email={username_or_email}"
    else:
        url = f"https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-username?username={username_or_email}"
    
    try:
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"[!] Error fetching HudsonRock data: {e}")
    return {"message": "No data found", "stealers": []}

# ----------------------------
# Compute simple compromise score
# ----------------------------
def compute_score(comb_data, hudson_data):
    score = 0
    status = "SAFE"
    
    if comb_data["comb_leaks_found"] > 0:
        score += min(comb_data["comb_leaks_found"], 50)
    if hudson_data.get("total_user_services", 0) > 0:
        score += min(hudson_data["total_user_services"], 50)
    
    if score >= 50:
        status = "COMPROMISED"
    elif score >= 20:
        status = "AT RISK"
    
    return score, status

# ----------------------------
# Save result JSON to folder
# ----------------------------
def save_compromise_result(username_or_email, result):
    # Delete previous files for this user
    for old_file in OSINT_RESULTS_DIR.glob(f"{username_or_email}_Compromise_*.json"):
        try:
            old_file.unlink()
        except Exception as e:
            print(f"Failed to delete old file {old_file}: {e}")
    
    # Save new result
    timestamp = int(datetime.utcnow().timestamp())
    file_path = OSINT_RESULTS_DIR / f"{username_or_email}_Compromise_{timestamp}.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=4)
        print(f"Saved compromise JSON for {username_or_email} at {file_path}")
    except Exception as e:
        print(f"Failed to save compromise JSON: {e}")

# ----------------------------
# Master function for Flask integration
# ----------------------------
def check_user_compromise(username_or_email):
    comb_data = fetch_comb_leaks(username_or_email)
    hudson_data = fetch_hudsonrock(username_or_email)
    
    score, status = compute_score(comb_data, hudson_data)
    
    result = {
        "username_or_email": username_or_email,
        "comb_leaks_found": comb_data["comb_leaks_found"],
        "comb_leaks": comb_data["comb_leaks"],
        "hudsonrock_data": hudson_data,
        "compromise_score": score,
        "status": status,
        "collected_at": datetime.now().isoformat()
    }

    # Save JSON file
    save_compromise_result(username_or_email, result)

    return result

# ----------------------------
# CLI fallback (optional)
# ----------------------------
if __name__ == "__main__":
    user = input("Enter username or email to check: ").strip()
    result = check_user_compromise(user)
    print(json.dumps(result, indent=2))
