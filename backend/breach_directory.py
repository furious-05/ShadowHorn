#!/usr/bin/env python3
import requests
from urllib.parse import quote
from pathlib import Path
import datetime
import json
import shutil

# Folder to save OSINT results
OSINT_RESULTS_DIR = Path("osint_results")

def fetch_breachdirectory(username_or_email: str, api_key: str):
    """
    Query BreachDirectory API for email/username leaks.
    Saves JSON result to osint_results folder.
    Removes any previous BreachDirectory file for this identifier.
    """
    # --- Ensure folder exists ---
    if OSINT_RESULTS_DIR.exists():
        # Remove previous files for this identifier & platform
        for old_file in OSINT_RESULTS_DIR.glob(f"{username_or_email}_BreachDirectory_*.json"):
            try:
                old_file.unlink()
            except Exception as e:
                print(f"Failed to delete old file {old_file}: {e}")
    else:
        OSINT_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    encoded_term = quote(username_or_email)
    url = f"https://breachdirectory.p.rapidapi.com/?func=auto&term={encoded_term}"
    headers = {
        "x-rapidapi-host": "breachdirectory.p.rapidapi.com",
        "x-rapidapi-key": api_key
    }

    result = {}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code == 200:
            result = resp.json()
        else:
            result = {"success": False, "found": 0, "result": [], "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        result = {"success": False, "found": 0, "result": [], "error": str(e)}

    # --- Save JSON to file ---
    timestamp = int(datetime.datetime.utcnow().timestamp())
    file_path = OSINT_RESULTS_DIR / f"{username_or_email}_BreachDirectory_{timestamp}.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=4)
        print(f"Saved BreachDirectory JSON for {username_or_email} at {file_path}")
    except Exception as e:
        print(f"Failed to save BreachDirectory JSON: {e}")

    return result
