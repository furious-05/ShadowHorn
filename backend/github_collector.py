#!/usr/bin/env python3
"""
GitHub OSINT Collector (Flask + React Ready Version)
Usage: collect_osint(username, token)
"""

import time
import json
import logging
import requests
from pathlib import Path
from datetime import datetime

BASE = "https://api.github.com"
PER_PAGE = 100

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# -----------------------------
# OSINT Results Folder
# -----------------------------
OSINT_RESULTS_DIR = Path("osint_results")
OSINT_RESULTS_DIR.mkdir(exist_ok=True)

# -----------------------------
# Auth + Request Helper
# -----------------------------
def get_auth_headers(token):
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"
    return headers


def safe_get(url, token, params=None):
    headers = get_auth_headers(token)
    resp = requests.get(url, headers=headers, params=params)

    if resp.status_code == 200:
        return resp.json(), None, 0

    # Handle rate limit
    if resp.status_code == 403 and "X-RateLimit-Reset" in resp.headers:
        reset_time = int(resp.headers["X-RateLimit-Reset"])
        wait = max(reset_time - int(time.time()), 0)
        warning = f"GitHub rate limit reached. Try again in {wait} seconds."
        logging.warning(warning)
        return {}, warning, wait

    logging.error(f"Request failed: {resp.status_code} {resp.text}")
    return {}, f"Request failed: {resp.status_code}", 0


# -----------------------------
# OSINT Modules
# -----------------------------
def collect_user(username, token):
    data, warning, wait = safe_get(f"{BASE}/users/{username}", token)
    fields = [
        "login", "id", "name", "avatar_url", "html_url", "bio",
        "company", "blog", "location", "email", "twitter_username",
        "public_repos", "followers", "following",
        "created_at", "updated_at"
    ]
    return {k: data.get(k) for k in fields if k in data}, warning, wait


def collect_top_repos(username, token):
    url = f"{BASE}/users/{username}/repos"
    params = {"sort": "updated", "per_page": 5}
    repos, warning, wait = safe_get(url, token, params)
    result = []
    for r in repos or []:
        result.append({
            "name": r.get("name"),
            "html_url": r.get("html_url"),
            "description": r.get("description"),
            "language": r.get("language"),
            "created_at": r.get("created_at"),
            "updated_at": r.get("updated_at"),
            "stargazers_count": r.get("stargazers_count"),
            "forks_count": r.get("forks_count")
        })
    return result, warning, wait


def collect_followers_sample(username, token):
    url = f"{BASE}/users/{username}/followers"
    params = {"per_page": 10}
    data, warning, wait = safe_get(url, token, params)
    return [{"login": f.get("login"), "html_url": f.get("html_url")} for f in data], warning, wait


def collect_following_sample(username, token):
    url = f"{BASE}/users/{username}/following"
    params = {"per_page": 10}
    data, warning, wait = safe_get(url, token, params)
    return [{"login": f.get("login"), "html_url": f.get("html_url")} for f in data], warning, wait


def collect_orgs(username, token):
    data, warning, wait = safe_get(f"{BASE}/users/{username}/orgs", token)
    return [{"login": o.get("login"), "html_url": o.get("html_url")} for o in data], warning, wait


# -----------------------------
# MASTER AGGREGATOR
# -----------------------------
def collect_osint(username, token):
    logging.info(f"Collecting GitHub OSINT for: {username}")
    result = {}
    warnings = []
    max_wait = 0

    user_data, warning, wait = collect_user(username, token)
    result["user"] = user_data
    if warning:
        warnings.append(warning)
        max_wait = max(max_wait, wait)

    repos_data, warning, wait = collect_top_repos(username, token)
    result["repos"] = repos_data
    if warning:
        warnings.append(warning)
        max_wait = max(max_wait, wait)

    followers, warning, wait = collect_followers_sample(username, token)
    result["followers_sample"] = followers
    if warning:
        warnings.append(warning)
        max_wait = max(max_wait, wait)

    following, warning, wait = collect_following_sample(username, token)
    result["following_sample"] = following
    if warning:
        warnings.append(warning)
        max_wait = max(max_wait, wait)

    orgs, warning, wait = collect_orgs(username, token)
    result["orgs"] = orgs
    if warning:
        warnings.append(warning)
        max_wait = max(max_wait, wait)

    return {"data": result, "warnings": warnings, "wait_seconds": max_wait}


# -----------------------------
# Save JSON to osint_results
# -----------------------------
def save_github_result(username, data):
    # Remove previous files
    for old_file in OSINT_RESULTS_DIR.glob(f"{username}_GitHub_*.json"):
        try:
            old_file.unlink()
        except Exception as e:
            logging.warning(f"Failed to delete old file {old_file}: {e}")

    # Save new file
    timestamp = int(datetime.utcnow().timestamp())
    file_path = OSINT_RESULTS_DIR / f"{username}_GitHub_{timestamp}.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logging.info(f"Saved GitHub OSINT for {username} → {file_path}")
    except Exception as e:
        logging.error(f"Failed to save GitHub OSINT: {e}")
    return file_path


# -----------------------------
# CLI test mode
# -----------------------------
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python3 github_collector.py <username> <token>")
        exit(1)

    username = sys.argv[1]
    token = sys.argv[2]

    result = collect_osint(username, token)
    save_github_result(username, result)

    print(f"✔️ GitHub OSINT saved in osint_results folder")
    if result["warnings"]:
        print("⚠ Warnings:")
        for w in result["warnings"]:
            print(" -", w)
