#!/usr/bin/env python3
"""
Reddit OSINT Collector (Flask + React Ready)
Usage: collect_osint(username)
"""

import requests
import json
import time
import re
from collections import Counter
from urllib.parse import urlparse
import logging
from pathlib import Path
from datetime import datetime

BASE = "https://www.reddit.com"
HEADERS = {"User-Agent": "Mozilla/5.0 (OSINT-Collector)"}

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# -----------------------------
# OSINT Results Folder
# -----------------------------
OSINT_RESULTS_DIR = Path("osint_results")
OSINT_RESULTS_DIR.mkdir(exist_ok=True)

# -----------------------------
# Helper Functions
# -----------------------------
def safe_get(url):
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        if resp.status_code == 200:
            return resp.json()
        else:
            logging.warning(f"Non-200 response for {url}: {resp.status_code}")
    except Exception as e:
        logging.error(f"Error fetching {url}: {e}")
    return {}


def extract_external_links(text):
    if not text:
        return []
    urls = re.findall(r'(https?://[^\s)]+)', text)
    filtered = []
    for u in urls:
        domain = urlparse(u).netloc.lower()
        if any(x in domain for x in ["github.com", "gitlab.com", "drive.google.com", "dropbox.com", "mediafire.com"]):
            filtered.append(u)
    return list(set(filtered))


# -----------------------------
# Fetch Data
# -----------------------------
def fetch_user_info(username):
    data = safe_get(f"{BASE}/user/{username}/about.json")
    if not data:
        return {}
    user = data.get("data", {})
    return {
        "username": user.get("name"),
        "id": user.get("id"),
        "account_created_utc": user.get("created_utc"),
        "account_creation_date": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(user.get("created_utc", 0))),
        "profile_image": user.get("icon_img"),
        "karma": {
            "total": user.get("total_karma"),
            "link_karma": user.get("link_karma"),
            "comment_karma": user.get("comment_karma")
        },
        "trophies": fetch_trophies(username)
    }


def fetch_trophies(username):
    data = safe_get(f"{BASE}/api/v1/user/{username}/trophies.json")
    if not data:
        return []
    trophies = data.get("data", {}).get("trophies", [])
    return [t["data"].get("name") for t in trophies]


def fetch_posts(username, limit=50):
    data = safe_get(f"{BASE}/user/{username}/submitted.json?limit={limit}")
    posts = []
    for p in data.get("data", {}).get("children", []):
        post = p["data"]
        posts.append({
            "id": post.get("id"),
            "title": post.get("title"),
            "body": post.get("selftext"),
            "subreddit": post.get("subreddit"),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(post.get("created_utc", 0))),
            "upvotes": post.get("ups"),
            "downvotes": post.get("downs"),
            "url": f"https://reddit.com{post.get('permalink')}",
            "media_url": post.get("url_overridden_by_dest"),
            "external_links": extract_external_links(post.get("selftext", "")),
        })
    return posts


def fetch_comments(username, limit=50):
    data = safe_get(f"{BASE}/user/{username}/comments.json?limit={limit}")
    comments = []
    for c in data.get("data", {}).get("children", []):
        comment = c["data"]
        comments.append({
            "id": comment.get("id"),
            "content": comment.get("body"),
            "subreddit": comment.get("subreddit"),
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(comment.get("created_utc", 0))),
            "score": comment.get("score"),
            "link_url": f"https://reddit.com{comment.get('permalink')}",
            "external_links": extract_external_links(comment.get("body", "")),
        })
    return comments


# -----------------------------
# Analytics
# -----------------------------
def analyze_activity(posts, comments):
    all_subs = [p["subreddit"] for p in posts] + [c["subreddit"] for c in comments]
    active_subs = Counter(all_subs).most_common(3)

    timestamps = [p["timestamp"] for p in posts + comments]
    hours = [int(t.split(" ")[1].split(":")[0]) for t in timestamps if " " in t]
    active_hours = Counter(hours).most_common(3)

    return {
        "most_active_subreddits": active_subs,
        "active_hours_utc": active_hours,
        "total_posts": len(posts),
        "total_comments": len(comments)
    }


def collect_external_links(posts, comments):
    links = []
    for p in posts + comments:
        links.extend(p.get("external_links", []))
    return list(set(links))


# -----------------------------
# Master Collector
# -----------------------------
def collect_osint(username):
    logging.info(f"[+] Collecting Reddit OSINT for user: {username}")
    user_info = fetch_user_info(username)
    posts = fetch_posts(username)
    comments = fetch_comments(username)
    activity = analyze_activity(posts, comments)
    external_links = collect_external_links(posts, comments)

    return {
        "meta": {
            "username": username,
            "collected_at": time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime())
        },
        "user_info": user_info,
        "posts": posts,
        "comments": comments,
        "activity_metrics": activity,
        "external_links": external_links
    }


# -----------------------------
# Save JSON to osint_results
# -----------------------------
def save_reddit_result(username, data):
    # Remove previous files
    for old_file in OSINT_RESULTS_DIR.glob(f"{username}_Reddit_*.json"):
        try:
            old_file.unlink()
        except Exception as e:
            logging.warning(f"Failed to delete old file {old_file}: {e}")

    # Save new file
    timestamp = int(datetime.utcnow().timestamp())
    file_path = OSINT_RESULTS_DIR / f"{username}_Reddit_{timestamp}.json"
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logging.info(f"[+] Saved Reddit OSINT for {username} → {file_path}")
    except Exception as e:
        logging.error(f"[!] Failed to save Reddit OSINT: {e}")
    return file_path


# -----------------------------
# CLI test mode
# -----------------------------
if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 reddit_collector.py <username>")
        exit(1)

    username = sys.argv[1]
    result = collect_osint(username)
    save_reddit_result(username, result)
    print(f"✔️ Reddit OSINT saved in osint_results folder")
