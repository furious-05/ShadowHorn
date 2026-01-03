#!/usr/bin/env python3
"""
Twitter OSINT Collector (Non-blocking, Flask-friendly)
Saves results in osint_results folder with timestamped filenames
"""

import time
import json
import logging
import requests
from pathlib import Path
from datetime import datetime

MAX_TWEETS = 50  # Number of recent tweets to fetch per user
MAX_FOLLOWERS = 50
MAX_FOLLOWING = 50

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# -----------------------------
# OSINT Results Folder
# -----------------------------
OSINT_RESULTS_DIR = Path("osint_results")
OSINT_RESULTS_DIR.mkdir(exist_ok=True)

# -----------------------------
# Auth + Request Helper
# -----------------------------
def get_headers(token):
    return {"Authorization": f"Bearer {token}"}


def safe_request(url, token, params=None):
    """Perform API request. Returns data or wait_seconds if rate limited."""
    headers = get_headers(token)
    resp = requests.get(url, headers=headers, params=params)

    if resp.status_code == 200:
        return {"data": resp.json().get("data", [])}

    if resp.status_code == 429:
        reset_time = int(resp.headers.get("x-rate-limit-reset", time.time() + 60))
        wait = max(reset_time - int(time.time()), 0)
        logging.warning(f"Rate limit hit. Need to wait {wait}s")
        return {"wait_seconds": wait + 1}  # add 1s buffer

    logging.error(f"Request failed: {resp.status_code} {resp.text}")
    return {"error": resp.text}


# -----------------------------
# OSINT Modules
# -----------------------------
def get_user(username, token):
    url = f"https://api.twitter.com/2/users/by/username/{username}"
    params = {
        "user.fields": (
            "id,name,username,created_at,description,location,url,"
            "verified,profile_image_url,public_metrics,pinned_tweet_id,protected"
        )
    }
    resp = safe_request(url, token, params)
    return resp.get("data") or resp


def get_user_tweets(user_id, token, max_results=MAX_TWEETS):
    url = f"https://api.twitter.com/2/users/{user_id}/tweets"
    params = {
        "max_results": min(max_results, 100),
        "tweet.fields": "id,text,created_at,public_metrics,entities,lang"
    }
    return safe_request(url, token, params)


def get_followers(user_id, token, limit=MAX_FOLLOWERS):
    url = f"https://api.twitter.com/2/users/{user_id}/followers"
    params = {"user.fields": "id,name,username,profile_image_url,verified,public_metrics", "max_results": limit}
    return safe_request(url, token, params)


def get_following(user_id, token, limit=MAX_FOLLOWING):
    url = f"https://api.twitter.com/2/users/{user_id}/following"
    params = {"user.fields": "id,name,username,profile_image_url,verified,public_metrics", "max_results": limit}
    return safe_request(url, token, params)


# -----------------------------
# MASTER AGGREGATOR
# -----------------------------
def collect_osint(username, token):
    logging.info(f"Collecting Twitter OSINT for: {username}")

    user = get_user(username, token)
    if not user or "error" in user or "wait_seconds" in user:
        return user

    user_id = user.get("id")
    data = {
        "meta": {"username": username, "collected_at": int(time.time())},
        "user": user
    }

    # Tweets
    tweets = get_user_tweets(user_id, token)
    if "wait_seconds" in tweets:
        data["tweets"] = tweets
        return data
    data["tweets"] = tweets.get("data", [])

    # Followers
    followers = get_followers(user_id, token)
    if "wait_seconds" in followers:
        data["followers"] = followers
        return data
    data["followers"] = followers.get("data", [])

    # Following
    following = get_following(user_id, token)
    if "wait_seconds" in following:
        data["following"] = following
        return data
    data["following"] = following.get("data", [])

    return data


# -----------------------------
# Save JSON to osint_results folder
# -----------------------------
def save_twitter_result(username, data):
    # Remove previous files
    for old_file in OSINT_RESULTS_DIR.glob(f"{username}_Twitter_*.json"):
        try:
            old_file.unlink()
        except Exception as e:
            logging.warning(f"Failed to delete old file {old_file}: {e}")

    # Save new file
    timestamp = int(datetime.utcnow().timestamp())
    file_path = OSINT_RESULTS_DIR / f"{username}_Twitter_{timestamp}.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logging.info(f"[+] Saved Twitter OSINT for {username} → {file_path}")
    except Exception as e:
        logging.error(f"[!] Failed to save Twitter OSINT: {e}")
    return file_path


# -----------------------------
# CLI test mode
# -----------------------------
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: python3 twitter_collector.py <username> <bearer_token>")
        exit(1)

    username = sys.argv[1]
    token = sys.argv[2]

    data = collect_osint(username, token)
    save_twitter_result(username, data)
    print(f"✔️ Twitter OSINT saved in osint_results folder")
