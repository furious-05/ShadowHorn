import argparse
import datetime as dt
import json
import logging
import os
import random
from typing import Any, Dict, List

import requests

API_BASE = "https://api.stackexchange.com/2.3"
SITE = "stackoverflow"

# Rotate User-Agent on each request from a small pool
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
]


def _random_headers() -> Dict[str, str]:
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "application/json, text/plain, */*",
    }


def setup_logging(log_dir: str) -> str:
    os.makedirs(log_dir, exist_ok=True)
    timestamp = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    log_path = os.path.join(log_dir, f"stackoverflow_{timestamp}.log")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(log_path, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    logging.info("Logging initialized: %s", log_path)
    return log_path


def search_users(display_name: str, max_results: int = 10) -> List[Dict[str, Any]]:
    """Search Stack Overflow users whose display name matches the query.

    This uses the official Stack Exchange API and respects its rate limits.
    """
    url = f"{API_BASE}/users"
    params = {
        "order": "desc",
        "sort": "reputation",
        "inname": display_name,
        "site": SITE,
        "pagesize": max_results,
    }

    logging.info("Querying Stack Overflow users: %s", display_name)
    resp = requests.get(url, params=params, timeout=15, headers=_random_headers())
    resp.raise_for_status()

    data = resp.json()
    items = data.get("items", [])
    logging.info("Found %d matching users", len(items))
    return items


def fetch_top_tags(user_id: int, max_tags: int = 10) -> List[Dict[str, Any]]:
    """Fetch a user's top tags (skills/topics)."""
    url = f"{API_BASE}/users/{user_id}/top-tags"
    params = {
        "site": SITE,
        "pagesize": max_tags,
    }

    logging.info("Fetching top tags for user_id=%s", user_id)
    resp = requests.get(url, params=params, timeout=15, headers=_random_headers())
    resp.raise_for_status()
    data = resp.json()
    return data.get("items", [])


def enrich_users_with_tags(users: List[Dict[str, Any]], max_tags: int = 10) -> None:
    for user in users:
        uid = user.get("user_id")
        if not uid:
            continue
        try:
            user["top_tags"] = fetch_top_tags(uid, max_tags=max_tags)
        except requests.RequestException as exc:
            logging.warning("Failed to fetch tags for user_id=%s: %s", uid, exc)


def summarize_collectives(user: Dict[str, Any], max_tags: int = 5) -> List[Dict[str, Any]]:
    """Return a compact view of the user's collectives.

    The raw API includes huge tag lists for each collective. For OSINT, we
    mostly care about which collectives they belong to and a small sample of
    technology areas, not hundreds of tags.
    """
    result: List[Dict[str, Any]] = []
    for entry in user.get("collectives", []) or []:
        coll = entry.get("collective", {}) or {}
        tags = coll.get("tags") or []
        result.append(
            {
                "name": coll.get("name"),
                "slug": coll.get("slug"),
                "description": coll.get("description"),
                # Keep only a short sample of tags to avoid huge noise
                "tags": tags[:max_tags],
            }
        )
    return result


def normalize_user(user: Dict[str, Any], max_collective_tags: int = 5) -> Dict[str, Any]:
    """Reduce raw Stack Overflow user JSON to OSINT-relevant fields.

    This keeps identity, profile URLs, basic reputation and activity, top
    tags, and a compact summary of collectives. Very verbose fields like
    massive collective tag lists are trimmed.
    """

    return {
        # Identity & profile
        "user_id": user.get("user_id"),
        "account_id": user.get("account_id"),
        "display_name": user.get("display_name"),
        "profile_url": user.get("link"),
        "profile_image": user.get("profile_image"),
        "user_type": user.get("user_type"),
        "is_employee": user.get("is_employee"),

        # Reputation / activity
        "reputation": user.get("reputation"),
        "badge_counts": user.get("badge_counts"),
        "creation_date": user.get("creation_date"),
        "last_access_date": user.get("last_access_date"),

        # Self-declared metadata
        "location": user.get("location"),
        "website_url": user.get("website_url"),
        "about_me": user.get("about_me"),

        # Skills / topics
        "top_tags": user.get("top_tags", []),
        "collectives": summarize_collectives(user, max_tags=max_collective_tags),
    }


def save_results(username: str, results: List[Dict[str, Any]], output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    timestamp = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    safe_username = username.replace("/", "_").replace("\\", "_")
    out_path = os.path.join(output_dir, f"stackoverflow_{safe_username}_{timestamp}.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"query": username, "results": results}, f, indent=2, ensure_ascii=False)

    logging.info("Saved results to %s", out_path)
    return out_path


def collect_osint(
    username: str,
    max_users: int = 5,
    max_tags: int = 10,
    max_collective_tags: int = 5,
) -> Dict[str, Any]:
    """Collect Stack Overflow OSINT for integration with the Flask backend.

    Mirrors the CLI behaviour but returns a compact JSON structure instead of
    writing to disk. Other collectors in the app expect a dictionary with the
    original query and a list of normalized results.
    """

    if not username:
        raise ValueError("username is required for Stack Overflow OSINT collection")

    # Search users and enrich with top tags
    users = search_users(username, max_results=max_users)
    enrich_users_with_tags(users, max_tags=max_tags)

    normalized = [normalize_user(u, max_collective_tags=max_collective_tags) for u in users]

    # Compact payload similar to other collectors
    return {
        "platform": "StackOverflow",
        "query": username,
        "total_results": len(normalized),
        "results": normalized,
        "collected_at": dt.datetime.utcnow().isoformat() + "Z",
    }


def cli() -> None:
    parser = argparse.ArgumentParser(
        description="Search and enrich Stack Overflow profiles for OSINT purposes using the official API.",
    )
    parser.add_argument("username", help="Display name / handle to search on Stack Overflow")
    parser.add_argument(
        "--max-users",
        type=int,
        default=5,
        help="Maximum number of matching users to return (default: 5)",
    )
    parser.add_argument(
        "--max-tags",
        type=int,
        default=10,
        help="Maximum number of top tags per user (default: 10)",
    )
    parser.add_argument(
        "--log-dir",
        default="logs",
        help="Directory to store log files (default: logs)",
    )
    parser.add_argument(
        "--output-dir",
        default="output",
        help="Directory to store JSON output (default: output)",
    )
    parser.add_argument(
        "--max-collective-tags",
        type=int,
        default=5,
        help="Maximum number of tags to keep per collective (default: 5)",
    )

    args = parser.parse_args()
    setup_logging(args.log_dir)

    try:
        users = search_users(args.username, max_results=args.max_users)
        enrich_users_with_tags(users, max_tags=args.max_tags)

        # Normalize to a compact OSINT-friendly schema
        normalized = [
            normalize_user(u, max_collective_tags=args.max_collective_tags)
            for u in users
        ]

        save_results(args.username, normalized, args.output_dir)

        # Short console summary
        for u in normalized:
            print(
                "-",
                u.get("display_name"),
                "| rep:",
                u.get("reputation"),
                "| id:",
                u.get("user_id"),
            )
    except requests.RequestException as exc:
        logging.error("HTTP error while talking to Stack Exchange API: %s", exc)
    except Exception as exc:  # noqa: BLE001
        logging.exception("Unexpected error: %s", exc)


if __name__ == "__main__":
    cli()