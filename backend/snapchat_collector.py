#!/usr/bin/env python3
"""Snapchat Scraper - Platform Independent Python Version

This tool collects comprehensive Snapchat user profile data.

Usage:
  Interactive mode: python snapchat_collector.py
  User mode: python snapchat_collector.py --user "username"
  Map mode: python snapchat_collector.py latitude longitude zoom
"""

import argparse
import datetime as dt
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# Platform-independent path handling
DEFAULT_OUTPUT_DIR = Path.home() / "SnapchatDownloads"
SESSION = requests.Session()

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
}


def setup_logging(log_dir: Optional[str] = None) -> str:
    """Initialize logging configuration."""
    if log_dir is None:
        log_dir = str(DEFAULT_OUTPUT_DIR / "logs")
    
    os.makedirs(log_dir, exist_ok=True)
    ts = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(log_dir, f"snapchat_scraper_{ts}.log")
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(path, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    logging.info("Snapchat Scraper initialized - Logging to: %s", path)
    return path


def extract_og_metadata(html: str) -> Dict[str, str]:
    """Extract Open Graph metadata from HTML."""
    data = {}
    og_fields = [
        "og:title", "og:description", "og:image", "og:url",
        "og:type", "twitter:creator", "twitter:image", "twitter:title"
    ]
    
    for field in og_fields:
        match = re.search(rf'{field}" content="([^"]+)"', html)
        if match:
            data[field.replace(":", "_")] = match.group(1)
    
    return data


def extract_page_metadata(html: str, username: str) -> Dict[str, Any]:
    """Extract additional metadata from page content."""
    data = {
        "has_display_name": False,
        "display_name": None,
        "has_bio": False,
        "bio": None,
        "is_verified": False,
        "has_story": False,
        "page_title": None
    }
    
    try:
        title_match = re.search(r"<title>([^<]+)</title>", html)
        if title_match:
            data["page_title"] = title_match.group(1)
        
        if 'verified' in html.lower() or '✓' in html:
            data["is_verified"] = True
        
        display_name_pattern = r'"displayName"\s*:\s*"([^"]+)"'
        match = re.search(display_name_pattern, html)
        if match:
            data["display_name"] = match.group(1)
            data["has_display_name"] = True
        
        bio_patterns = [
            r'"description"\s*:\s*"([^"]+)"',
            r'"bio"\s*:\s*"([^"]+)"',
            r'<meta name="description" content="([^"]+)"'
        ]
        
        for pattern in bio_patterns:
            match = re.search(pattern, html)
            if match:
                data["bio"] = match.group(1)
                data["has_bio"] = True
                break
        
        if 'story' in html.lower():
            data["has_story"] = True
        
    except Exception as e:
        logging.warning("Error extracting page metadata: %s", e)
    
    return data


def extract_schema_data(html: str) -> Optional[List[Dict[str, Any]]]:
    """Extract all structured data (JSON-LD) blocks from the HTML.

    Returns a list of parsed JSON objects (one per <script type="application/ld+json">).
    """
    try:
        json_ld_pattern = r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>'
        matches = re.findall(json_ld_pattern, html, re.DOTALL)

        if not matches:
            return None

        schema_data: List[Dict[str, Any]] = []
        for match in matches:
            try:
                data = json.loads(match)
                # Some pages wrap JSON-LD in arrays
                if isinstance(data, list):
                    for item in data:
                        if isinstance(item, dict):
                            schema_data.append(item)
                elif isinstance(data, dict):
                    schema_data.append(data)
            except json.JSONDecodeError:
                continue

        return schema_data or None

    except Exception as e:
        logging.warning("Error extracting schema data: %s", e)

    return None


def extract_follower_count_from_schema(schema_data: Dict[str, Any]) -> Optional[int]:
    """Extract follower count from schema.org JSON-LD if present.

    Snapchat exposes an interactionStatistic block with a userInteractionCount
    for FollowAction. We treat that as a public follower_count.
    """
    try:
        main_entity = schema_data.get("mainEntity") or schema_data
        stats = main_entity.get("interactionStatistic")

        if not stats:
            return None

        if isinstance(stats, dict):
            stats = [stats]

        for item in stats:
            if not isinstance(item, dict):
                continue

            interaction = item.get("interactionType") or {}
            interaction_type = interaction.get("@type") if isinstance(interaction, dict) else None

            if interaction_type == "FollowAction" and "userInteractionCount" in item:
                try:
                    return int(item["userInteractionCount"])
                except (TypeError, ValueError):
                    continue

    except Exception as e:
        logging.warning("Error extracting follower count from schema data: %s", e)

    return None


def fetch_user_api_data(username: str, headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """Fetch user data from Snapchat API endpoints."""
    try:
        api_endpoints = [
            f"https://map.snapchat.com/web/getUserData?username={username}",
            f"https://www.snapchat.com/api/user/{username}",
        ]
        
        for endpoint in api_endpoints:
            try:
                response = SESSION.get(endpoint, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    try:
                        return response.json()
                    except ValueError:
                        continue
                        
            except requests.RequestException:
                continue
    
    except Exception as e:
        logging.warning("Error fetching API data: %s", e)
    
    return None


def extract_snapchat_profile_data(html: str, username: str) -> Dict[str, Any]:
    """Extract all Snapchat-specific profile data."""
    profile_data = {
        "username": username,
        "display_name": None,
        "bio": None,
        "profile_image_url": None,
        "profile_snapcode": None,
        "location": None,
        "city": None,
        "country": None,
        "postal_code": None,
        "birthday": None,
        "age": None,
        "gender": None,
        "relationship_status": None,
        "phone": None,
        "email": None,
        "website": None,
        "interests": [],
        "verified": False,
        "ghostmode_enabled": False,
        "added_me": False,
        "added_by_me": False,
        "language": None,
        "timezone": None
    }
    
    try:
        patterns = {
            "display_name": [
                r'"displayName"\s*:\s*"([^"]+)"',
                r'"name"\s*:\s*"([^"]+)"',
                r'<meta property="og:title" content="([^"]+)"'
            ],
            "bio": [
                r'"bio"\s*:\s*"([^"]+)"',
                r'"description"\s*:\s*"([^"]+)"',
            ],
            "profile_image_url": [
                r'"image"\s*:\s*"([^"]+)"',
                r'og:image" content="([^"]+)"'
            ],
            "website": [
                r'"website"\s*:\s*"([^"]+)"',
                r'"url"\s*:\s*"(https?://[^"]+)"'
            ]
        }
        
        for field, pattern_list in patterns.items():
            for pattern in pattern_list:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    profile_data[field] = match.group(1)
                    break
        
        # Extract location information
        location_patterns = [
            r'"location"\s*:\s*"([^"]+)"',
            r'"city"\s*:\s*"([^"]+)"'
        ]
        for pattern in location_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["location"] = match.group(1)
                break
        
        # Extract postal code
        postal_patterns = [
            r'"postalCode"\s*:\s*"([^"]+)"',
            r'"zipCode"\s*:\s*"([^"]+)"'
        ]
        for pattern in postal_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["postal_code"] = match.group(1)
                break
        
        # Extract birthday
        birthday_patterns = [
            r'"birthday"\s*:\s*"(\d{4}-\d{2}-\d{2})"',
            r'"dob"\s*:\s*"(\d{4}-\d{2}-\d{2})"',
            r'"dateOfBirth"\s*:\s*"(\d{1,2}/\d{1,2}/\d{4})"'
        ]
        for pattern in birthday_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["birthday"] = match.group(1)
                break
        
        # Extract age
        age_patterns = [
            r'"age"\s*:\s*(\d+)',
            r'"years"\s*:\s*(\d+)',
            r'"age"\s*:\s*"(\d+)"'
        ]
        for pattern in age_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                try:
                    profile_data["age"] = int(match.group(1))
                    break
                except ValueError:
                    continue
        
        # Extract gender
        gender_patterns = [
            r'"gender"\s*:\s*"([MF])"',
            r'"gender"\s*:\s*"(Male|Female|Other)"'
        ]
        for pattern in gender_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["gender"] = match.group(1)
                break
        
        # Extract relationship status
        relationship_patterns = [
            r'"relationshipStatus"\s*:\s*"([^"]+)"',
            r'"relationship"\s*:\s*"([^"]+)"'
        ]
        for pattern in relationship_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["relationship_status"] = match.group(1)
                break
        
        # Extract phone
        phone_patterns = [
            r'"phone"\s*:\s*"([+\d\s\-().]+)"',
            r'"phoneNumber"\s*:\s*"([+\d\s\-().]+)"'
        ]
        for pattern in phone_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["phone"] = match.group(1)
                break
        
        # Extract email
        email_patterns = [
            r'"email"\s*:\s*"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})"',
            r'"contactEmail"\s*:\s*"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})"'
        ]
        for pattern in email_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["email"] = match.group(1)
                break
        
        # Extract interests
        interests_pattern = r'"interests"\s*:\s*\[(.*?)\]'
        match = re.search(interests_pattern, html, re.DOTALL)
        if match:
            interests_text = match.group(1)
            interests = re.findall(r'"([^"]+)"', interests_text)
            profile_data["interests"] = interests[:10]  # Top 10 interests
        
        # Extract verification status
        if 'verified' in html.lower():
            profile_data["verified"] = True
        
        # Extract ghost mode
        if 'ghost' in html.lower() or 'ghostmode' in html.lower():
            profile_data["ghostmode_enabled"] = True
        
        # NOTE: We intentionally do NOT infer user country or language
        # from global page config (e.g., x-snap-client-country, inLanguage),
        # because these reflect the viewer/session locale, not the profile
        # owner's actual country/language. Leaving these as None avoids
        # misleading OSINT signals.

        # Extract timezone only when explicitly present as a profile attribute
        timezone_patterns = [
            r'"timezone"\s*:\s*"([^"]+)"',
            r'"timeZone"\s*:\s*"([^"]+)"'
        ]
        for pattern in timezone_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                profile_data["timezone"] = match.group(1)
                break
        
    except Exception as e:
        logging.warning("Error extracting profile data: %s", e)
    
    return profile_data


def extract_snapchat_account_details(html: str, username: str) -> Dict[str, Any]:
    """Extract detailed Snapchat account information."""
    account_details = {
        "account_type": None,
        "account_status": None,
        "user_id": None,
        "snap_score": None,
        "app_version": None,
        "device_type": None,
        "last_login": None,
        "created_date": None,
    }
    
    try:
        # Extract user ID
        user_id_patterns = [
            r'"userId"\s*:\s*"([^"]+)"',
            r'"id"\s*:\s*"([^"]+)"',
            r'"uniqueId"\s*:\s*"([^"]+)"'
        ]
        
        for pattern in user_id_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                account_details["user_id"] = match.group(1)
                break
        
        # Extract snap score
        snap_score_pattern = r'"snapScore"\s*:\s*(\d+)'
        match = re.search(snap_score_pattern, html)
        if match:
            account_details["snap_score"] = int(match.group(1))
        
        # Extract account type
        if 'business' in html.lower():
            account_details["account_type"] = "business"
        elif 'verified' in html.lower():
            account_details["account_type"] = "verified"
        else:
            account_details["account_type"] = "personal"
        
        # Extract created date
        created_patterns = [
            r'"createdDate"\s*:\s*"([^"]+)"',
            r'"created"\s*:\s*"([^"]+)"',
            r'"joined"\s*:\s*"(\d{4}-\d{2}-\d{2})"'
        ]
        
        for pattern in created_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                account_details["created_date"] = match.group(1)
                break
        
        # Extract device type
        if 'iOS' in html or 'iPhone' in html:
            account_details["device_type"] = "iOS"
        elif 'Android' in html:
            account_details["device_type"] = "Android"
        elif 'Web' in html or 'web' in html.lower():
            account_details["device_type"] = "Web"
        
    except Exception as e:
        logging.warning("Error extracting account details: %s", e)
    
    return account_details


def extract_user_counts(html: str) -> Dict[str, Any]:
    """Extract user counts (friends, followers, following)."""
    data = {}
    
    try:
        count_patterns = {
            "follower_count": [
                r'"followers"\s*:\s*(\d+)',
                r'>(\d+)\s*followers?<'
            ],
            "following_count": [
                r'"following"\s*:\s*(\d+)',
                r'>(\d+)\s*following<'
            ],
            "friend_count": [
                r'"friends"\s*:\s*(\d+)'
            ]
        }
        
        for field, patterns in count_patterns.items():
            for pattern in patterns:
                match = re.search(pattern, html, re.IGNORECASE)
                if match:
                    try:
                        data[field] = int(match.group(1))
                        break
                    except (ValueError, IndexError):
                        continue
    
    except Exception as e:
        logging.warning("Error extracting user counts: %s", e)
    
    return data


def extract_linked_accounts(html: str, username: str) -> Dict[str, Any]:
    """Extract linked social media accounts and contact info."""
    data = {
        "accounts": [],
        "phones": [],
        "emails": [],
        "user_phone": None,
        "user_email": None
    }
    
    try:
        # Extract user's phone
        user_phone_patterns = [
            r'"phoneNumber"\s*:\s*"([+\d\s\-().]+)"',
            r'"phone"\s*:\s*"([+\d\s\-().]+)"',
            r'"userPhone"\s*:\s*"([+\d\s\-().]+)"'
        ]
        
        for pattern in user_phone_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                phone = match.group(1).strip()
                if phone and len(re.sub(r'\D', '', phone)) >= 10:
                    data["user_phone"] = phone
                    data["phones"].append(phone)
                    break
        
        # Extract user's email
        user_email_patterns = [
            r'"email"\s*:\s*"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})"',
            r'"userEmail"\s*:\s*"([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})"'
        ]
        
        for pattern in user_email_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                email = match.group(1).strip()
                data["user_email"] = email
                data["emails"].append(email)
                break
        
        # Extract linked social accounts
        social_patterns = {
            "instagram": [r'instagram\.com/([a-zA-Z0-9_.]+)', r'"instagram"\s*:\s*"([^"]+)"'],
            "twitter": [r'twitter\.com/([a-zA-Z0-9_]+)', r'"twitter"\s*:\s*"([^"]+)"'],
            "facebook": [r'facebook\.com/([a-zA-Z0-9.]+)', r'"facebook"\s*:\s*"([^"]+)"'],
            "tiktok": [r'tiktok\.com/@([a-zA-Z0-9_]+)', r'"tiktok"\s*:\s*"([^"]+)"'],
            "youtube": [r'youtube\.com/([a-zA-Z0-9_-]+)', r'"youtube"\s*:\s*"([^"]+)"']
        }
        
        for platform, patterns in social_patterns.items():
            for pattern in patterns:
                matches = re.findall(pattern, html, re.IGNORECASE)
                for match in matches:
                    handle = match if isinstance(match, str) else match[0] if match else None
                    if handle:
                        account = {
                            "platform": platform,
                            "handle": handle,
                            "url": f"https://{platform}.com/{'' if platform == 'tiktok' else ''}{handle}"
                        }
                        if not any(a["handle"] == handle for a in data["accounts"]):
                            data["accounts"].append(account)
        
        # Remove duplicates
        data["phones"] = list(set(data["phones"]))
        data["emails"] = list(set(data["emails"]))
        
    except Exception as e:
        logging.warning("Error extracting linked accounts: %s", e)
    
    return data


def extract_contact_from_bio(html: str, username: str) -> List[Dict[str, str]]:
    """Extract contact information from user bio."""
    contact_info = []
    
    try:
        bio_patterns = [
            r'"bio"\s*:\s*"([^"]+)"',
            r'"description"\s*:\s*"([^"]+)"'
        ]
        
        bio_text = ""
        for pattern in bio_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                bio_text = match.group(1)
                break
        
        if not bio_text:
            return contact_info
        
        # Extract phone numbers from various formats
        phone_patterns = [
            # International format: +1234567890, +92-300-1234567
            (r'\+?[\d\s\-().]{10,}', 'international'),
            # US format: (123) 456-7890, 123-456-7890
            (r'(?:\+?1[-.\s]?)?\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})', 'us'),
            # Pakistan format: 03001234567, +923001234567
            (r'(?:\+92|0)?3\d{2}[-.\s]?\d{7}', 'pakistan'),
            # Generic: Call/Contact/Phone followed by number
            (r'(?:Call|Contact|Phone|Tel|Mobile|WhatsApp)\s*[:=]?\s*([+\d\s\-().]+)', 'labeled')
        ]
        
        for pattern, phone_type in phone_patterns:
            matches = re.findall(pattern, bio_text)
            for match in matches:
                phone = match if isinstance(match, str) else '-'.join([m for m in match if m])
                if phone and len(re.sub(r'\D', '', phone)) >= 10:
                    # Avoid duplicates
                    phone_clean = re.sub(r'\D', '', phone)
                    if not any(re.sub(r'\D', '', c['value']) == phone_clean for c in contact_info if c.get('type') == 'phone'):
                        contact_info.append({
                            "type": "phone",
                            "value": phone.strip(),
                            "source": "bio",
                            "format": phone_type
                        })
        
        # Extract WhatsApp numbers
        whatsapp_patterns = [
            r'wa\.me/(\d+)',
            r'whatsapp\.com/send\?phone=(\d+)',
            r'(?:WhatsApp|wa)[\s:]*(\d+)',
            r'chat\.whatsapp\.com/([A-Za-z0-9_-]+)'
        ]
        
        for pattern in whatsapp_patterns:
            matches = re.findall(pattern, bio_text, re.IGNORECASE)
            for match in matches:
                contact_info.append({
                    "type": "whatsapp",
                    "value": match,
                    "source": "bio",
                    "whatsapp_link": f"https://wa.me/{match.lstrip('+')}"
                })
        
        # Extract Telegram handles
        telegram_patterns = [
            r't\.me/([a-zA-Z0-9_]+)',
            r'telegram\.me/([a-zA-Z0-9_]+)',
            r'(?:Telegram|TG)[\s:]*(@?[a-zA-Z0-9_]+)'
        ]
        
        for pattern in telegram_patterns:
            matches = re.findall(pattern, bio_text, re.IGNORECASE)
            for match in matches:
                contact_info.append({
                    "type": "telegram",
                    "value": match.lstrip('@'),
                    "source": "bio",
                    "telegram_link": f"https://t.me/{match.lstrip('@')}"
                })
        
        # Extract emails
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        emails = re.findall(email_pattern, bio_text)
        for email in emails:
            contact_info.append({
                "type": "email",
                "value": email,
                "source": "bio"
            })
        
        # Extract URLs
        url_pattern = r'https?://[^\s]+'
        urls = re.findall(url_pattern, bio_text)
        for url in urls:
            contact_info.append({
                "type": "website",
                "value": url,
                "source": "bio"
            })
    
    except Exception as e:
        logging.warning("Error extracting contact from bio: %s", e)
    
    return contact_info


def extract_activity_info(html: str) -> Dict[str, Any]:
    """Extract activity information."""
    data = {
        "last_seen": None,
        "account_created": None,
        "last_updated": dt.datetime.utcnow().isoformat()
    }
    
    try:
        last_seen_patterns = [
            r'last\s+(?:seen|active)["\']?\s*:\s*["\']?([^"\'<>]+)',
        ]
        
        for pattern in last_seen_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                data["last_seen"] = match.group(1)
                break
        
        creation_patterns = [
            r'joined["\']?\s*:\s*["\']?([^"\'<>]+)',
            r'created["\']?\s*:\s*["\']?(\d{4}-\d{2}-\d{2})'
        ]
        
        for pattern in creation_patterns:
            match = re.search(pattern, html, re.IGNORECASE)
            if match:
                data["account_created"] = match.group(1)
                break
    
    except Exception as e:
        logging.warning("Error extracting activity info: %s", e)
    
    return data


def fetch_stories_from_api(username: str, headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """Fetch story data from Snapchat API."""
    try:
        api_endpoints = [
            f"https://map.snapchat.com/web/getUserStories?username={username}",
        ]
        
        for endpoint in api_endpoints:
            try:
                response = SESSION.get(endpoint, headers=headers, timeout=10)
                
                if response.status_code == 200:
                    try:
                        data = response.json()
                        logging.info("Retrieved stories from API")
                        return data
                    except ValueError:
                        continue
                        
            except requests.RequestException:
                continue
    
    except Exception as e:
        logging.warning("Error fetching stories from API: %s", e)
    
    return None


def fetch_user_stories(username: str) -> Tuple[List[str], Dict[str, Any]]:
    """Fetch comprehensive Snapchat user data."""
    logging.info("Fetching comprehensive Snapchat data for user: %s", username)
    
    normalized = username.strip().lstrip("@").lower()
    
    headers = DEFAULT_HEADERS.copy()
    headers["Referer"] = "https://www.snapchat.com"
    
    user_metadata = {
        "username": normalized,
        "stories": [],
        "story_count": 0,
        "is_public": False,
        "profile_info": {},
        "account_details": {},
        "contact_from_bio": []
    }
    
    try:
        profile_url = f"https://www.snapchat.com/add/{normalized}"
        response = SESSION.get(profile_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            html = response.text
            
            # Extract all profile data
            user_metadata["profile_info"] = extract_snapchat_profile_data(html, normalized)
            user_metadata["account_details"] = extract_snapchat_account_details(html, normalized)

            # Derive follower_count and enrich OSINT from schema.org JSON-LD when available
            schema_blocks = extract_schema_data(html)
            if schema_blocks:
                # Find the ProfilePage block (fallback to first)
                profile_block = None
                for block in schema_blocks:
                    if isinstance(block, dict) and block.get("@type") == "ProfilePage":
                        profile_block = block
                        break
                if profile_block is None:
                    profile_block = next((b for b in schema_blocks if isinstance(b, dict)), None)

                # Follower count from interactionStatistic
                if profile_block is not None:
                    follower_from_schema = extract_follower_count_from_schema(profile_block)
                    if follower_from_schema is not None:
                        user_metadata["follower_count"] = follower_from_schema
                        if isinstance(user_metadata["account_details"], dict):
                            user_metadata["account_details"]["follower_count"] = follower_from_schema

                    # Use schema.org mainEntity for selected OSINT fields
                    main_entity = profile_block.get("mainEntity", {}) if isinstance(profile_block, dict) else {}
                    address = main_entity.get("address") if isinstance(main_entity, dict) else None

                    # We treat address as a descriptive location only if
                    # Snapchat exposes it explicitly on the profile. We still
                    # avoid inferring country/language from viewer/session
                    # locale (which is often incorrect for OSINT).
                    if isinstance(user_metadata["profile_info"], dict):
                        if address and not user_metadata["profile_info"].get("location"):
                            user_metadata["profile_info"]["location"] = address

                    # External sites (e.g., official website) from sameAs
                    same_as = main_entity.get("sameAs") if isinstance(main_entity, dict) else None
                    if isinstance(same_as, list) and same_as:
                        user_metadata["external_sites"] = same_as

                # Spotlight / video OSINT from VideoObject blocks
                spotlight_videos: List[Dict[str, Any]] = []
                spotlight_keywords: set = set()

                for block in schema_blocks:
                    if not isinstance(block, dict) or block.get("@type") != "VideoObject":
                        continue

                    video: Dict[str, Any] = {}
                    video["url"] = block.get("url") or block.get("contentUrl")
                    video["title"] = block.get("name")
                    video["description"] = block.get("description")
                    video["thumbnail_url"] = block.get("thumbnailUrl")
                    video["upload_date"] = block.get("uploadDate")

                    # Interaction statistics (views, likes, comments)
                    watch_count = None
                    like_count = None
                    comment_count = None

                    stats = block.get("interactionStatistic")
                    if isinstance(stats, dict):
                        stats = [stats]
                    if isinstance(stats, list):
                        for item in stats:
                            if not isinstance(item, dict):
                                continue
                            interaction = item.get("interactionType") or {}
                            interaction_type = interaction.get("@type") if isinstance(interaction, dict) else None
                            count = item.get("userInteractionCount")
                            try:
                                count_int = int(count) if count is not None else None
                            except (TypeError, ValueError):
                                count_int = None

                            if interaction_type == "WatchAction":
                                watch_count = count_int
                            elif interaction_type == "LikeAction":
                                like_count = count_int
                            elif interaction_type == "CommentAction":
                                comment_count = count_int

                    video["watch_count"] = watch_count
                    video["like_count"] = like_count
                    video["comment_count"] = comment_count

                    # Top-level keywords (interests / topics)
                    keywords = block.get("keywords")
                    if isinstance(keywords, list):
                        for kw in keywords:
                            if isinstance(kw, str):
                                spotlight_keywords.add(kw)

                    # Sample top comments (limited for size)
                    comments_data = []
                    comments = block.get("comment")
                    if isinstance(comments, dict):
                        comments = [comments]
                    if isinstance(comments, list):
                        for comment in comments[:10]:
                            if not isinstance(comment, dict):
                                continue
                            author = comment.get("author") or {}
                            if not isinstance(author, dict):
                                author = {}
                            interaction = comment.get("interactionStatistic") or {}
                            if isinstance(interaction, dict):
                                interaction = [interaction]
                            like_count_comment = None
                            if isinstance(interaction, list):
                                for it in interaction:
                                    if not isinstance(it, dict):
                                        continue
                                    it_type = it.get("interactionType") or {}
                                    it_type_name = it_type.get("@type") if isinstance(it_type, dict) else None
                                    if it_type_name == "LikeAction" and "userInteractionCount" in it:
                                        try:
                                            like_count_comment = int(it["userInteractionCount"])
                                        except (TypeError, ValueError):
                                            like_count_comment = None
                            comments_data.append(
                                {
                                    "text": comment.get("text"),
                                    "author_name": author.get("name"),
                                    "date_published": comment.get("datePublished"),
                                    "like_count": like_count_comment,
                                }
                            )

                    if comments_data:
                        video["top_comments"] = comments_data

                    spotlight_videos.append(video)

                if spotlight_videos:
                    user_metadata["spotlight_videos"] = spotlight_videos

                    # Use spotlight keywords to enrich profile interests
                    if isinstance(user_metadata["profile_info"], dict) and spotlight_keywords:
                        existing_interests = user_metadata["profile_info"].get("interests") or []
                        # Preserve original casing but avoid duplicates (case-insensitive)
                        existing_lower = {str(v).lower() for v in existing_interests}
                        for kw in sorted(spotlight_keywords):
                            if kw.lower() not in existing_lower:
                                existing_interests.append(kw)
                        user_metadata["profile_info"]["interests"] = existing_interests

            # Fallback: try to parse counts directly from HTML
            counts = extract_user_counts(html)
            if counts:
                # Populate top-level counts without overwriting schema-derived ones
                for key, value in counts.items():
                    if key not in user_metadata:
                        user_metadata[key] = value

                # Mirror counts into account_details where applicable
                acct = user_metadata.get("account_details")
                if isinstance(acct, dict):
                    for key, value in counts.items():
                        if key not in acct:
                            acct[key] = value
            
            linked = extract_linked_accounts(html, normalized)
            user_metadata["linked_accounts"] = linked.get("accounts", [])
            user_metadata["user_phone"] = linked.get("user_phone")
            user_metadata["user_email"] = linked.get("user_email")
            
            activity = extract_activity_info(html)
            user_metadata.update(activity)
            
            contact_from_bio = extract_contact_from_bio(html, normalized)
            user_metadata["contact_from_bio"] = contact_from_bio
            
            user_metadata["is_public"] = "public" in html.lower() or "private" not in html.lower()
            
            logging.info("Retrieved complete profile data for: %s", normalized)
        
        return [], user_metadata
        
    except requests.RequestException as e:
        logging.error("Error fetching data for %s: %s", username, e)
        return [], user_metadata


def search_snapchat_user(username: str) -> Optional[Dict[str, Any]]:
    """Search for a Snapchat user by username."""
    logging.info("Searching for Snapchat user: %s", username)
    
    normalized = username.strip().lstrip("@").lower()
    headers = DEFAULT_HEADERS.copy()
    headers["Referer"] = "https://www.snapchat.com"
    
    try:
        user_url = f"https://www.snapchat.com/add/{normalized}"
        response = SESSION.get(user_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            logging.info("Found user profile: %s", user_url)
            
            html_content = response.text
            
            user_data = {
                "username": normalized,
                "original_input": username,
                "profile_url": user_url,
                "found": True,
                "timestamp": dt.datetime.utcnow().isoformat(),
                "http_status": response.status_code
            }
            
            # Extract metadata
            og_data = extract_og_metadata(html_content)
            user_data.update(og_data)
            
            extra_data = extract_page_metadata(html_content, normalized)
            user_data.update(extra_data)
            
            schema_blocks = extract_schema_data(html_content)
            if schema_blocks:
                # Store all schema.org blocks for downstream OSINT processing
                user_data["schema_org"] = schema_blocks
            
            return user_data
        
        logging.warning("Could not find Snapchat user: %s", username)
        return None
        
    except Exception as e:
        logging.error("Error searching for user %s: %s", username, e)
        return None


def scrape_snapchat_user(username: str, output_dir: Optional[str] = None) -> Dict[str, Any]:
    """Scrape Snapchat user profile."""
    
    if output_dir is None:
        output_dir = str(DEFAULT_OUTPUT_DIR)
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    timestamp = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    normalized_username = username.strip().lstrip("@").lower()
    
    results = {
        "timestamp": timestamp,
        "input_username": username,
        "normalized_username": normalized_username,
        "user_found": False,
        "user_data": {},
        "errors": []
    }
    
    logging.info("Starting Snapchat user scrape for: %s", username)
    
    # Search for user
    user_data = search_snapchat_user(username)
    
    if user_data:
        results["user_found"] = True
        results["user_data"] = user_data
        
        # Fetch detailed stories and metadata
        stories, story_metadata = fetch_user_stories(username)
        results.update(story_metadata)
        
    else:
        results["errors"].append(f"Could not find Snapchat user: {username}")
    
    # Save results
    output_file = output_path / f"snapchat_{normalized_username}_{timestamp}.json"
    
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        logging.info("Results saved to: %s", output_file)
        results["output_file"] = str(output_file)
    except OSError as e:
        logging.error("Failed to save results: %s", e)
        results["errors"].append(f"Failed to save results: {e}")
    
    return results


def collect_osint(username: str, output_dir: Optional[str] = None) -> Dict[str, Any]:
    """Backend-friendly wrapper used by the Flask application.

    This mirrors the pattern used by other collectors: it accepts a
    username and optional output directory and returns a JSON-serializable
    dict with all scraped Snapchat OSINT data.
    """

    return scrape_snapchat_user(username, output_dir)


def interactive_mode():
    """Run in interactive mode."""
    print("\n" + "="*60)
    print("  Snapchat Scraper - Interactive Mode")
    print("="*60 + "\n")
    
    username = input("Enter Snapchat username or full name: ").strip()
    if not username:
        print("Error: Username cannot be empty")
        return
    
    output_dir = input(f"Enter output directory (default: {DEFAULT_OUTPUT_DIR}): ").strip()
    if not output_dir:
        output_dir = str(DEFAULT_OUTPUT_DIR)
    
    print("\nStarting user scrape...\n")
    results = scrape_snapchat_user(username, output_dir)
    
    print("\n" + "="*60)
    print("  Scrape Results")
    print("="*60)
    print(f"Username: {results.get('normalized_username', 'N/A')}")
    print(f"User Found: {results.get('user_found', False)}")
    print(f"Follower Count: {results.get('follower_count', 0)}")
    print(f"Following Count: {results.get('following_count', 0)}")
    
    if results.get('errors'):
        print("\nErrors:")
        for error in results['errors']:
            print(f"  - {error}")
    
    print(f"\nResults saved to: {results.get('output_file', 'N/A')}")
    print("="*60 + "\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Snapchat User Data Scraper",
        formatter_class=argparse.RawDescriptionHelpFormatter
    )
    
    parser.add_argument("--user", "-u", default=None, help="Snapchat username or full name")
    parser.add_argument("--output", "-o", default=None, help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--log-dir", default=None, help="Directory for log files")
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.log_dir)
    
    if args.user:
        logging.info("Running in USER mode")
        results = scrape_snapchat_user(args.user, args.output)
        
        # Output with UTF-8 encoding
        output = json.dumps(results, indent=2, ensure_ascii=False)
        sys.stdout.reconfigure(encoding='utf-8')
        print(output)
        
        if results.get("errors"):
            sys.exit(1)
    else:
        logging.info("Running in INTERACTIVE mode")
        interactive_mode()


if __name__ == "__main__":
    main()