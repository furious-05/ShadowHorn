#!/usr/bin/env python3
"""Medium Comprehensive Scraper - Extract detailed author and article data using GraphQL

This tool scrapes Medium profiles and articles to extract:
1. Author profile information via GraphQL
2. Complete article list with metadata  
3. Article content and engagement metrics
4. Author statistics and achievements

Usage:
  python medium_comprehensive_scraper.py --author "username"
  python medium_comprehensive_scraper.py --author "username" --articles
  python medium_comprehensive_scraper.py --interactive
"""

import argparse
import asyncio
import datetime as dt
import json
import logging
import os
import re
import sys
import time
import random
import aiohttp
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, quote, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET

# Platform-independent path handling
DEFAULT_OUTPUT_DIR = Path.home() / "MediumDownloads"

# Enhanced headers for Medium - using verified working User-Agent
DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua": '"Not_A_Brand";v="8", "Chromium";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Upgrade-Insecure-Requests": "1",
    "Connection": "keep-alive",
}

# GraphQL Headers for Medium API
GRAPHQL_HEADERS = {
    **DEFAULT_HEADERS,
    "Content-Type": "application/json",
    "Accept": "application/json",
}


def setup_logging(log_dir: Optional[str] = None) -> str:
    """Initialize logging configuration."""
    if log_dir is None:
        log_dir = str(DEFAULT_OUTPUT_DIR / "logs")
    
    os.makedirs(log_dir, exist_ok=True)
    ts = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(log_dir, f"medium_scraper_{ts}.log")
    
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(path, encoding="utf-8"),
            logging.StreamHandler(),
        ],
    )
    logging.info("Medium Comprehensive Scraper initialized")
    return path


async def find_medium_username_duckduckgo(full_name: str) -> Optional[str]:
    """Search for Medium username using DuckDuckGo with multiple search strategies."""
    
    logging.info("Searching for Medium username for: %s", full_name)
    
    user_agents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    ]
    
    # Try multiple search queries
    search_queries = [
        f'site:medium.com "{full_name}"',  # Exact match
        f'site:medium.com {full_name}',     # Without quotes
        f'medium.com {full_name}',          # Without site operator
    ]
    
    try:
        for query in search_queries:
            logging.info("Trying DuckDuckGo query: %s", query)
            url = f"https://html.duckduckgo.com/html/?q={quote(query)}"
            
            headers = {
                'User-Agent': random.choice(user_agents),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Referer': 'https://duckduckgo.com/',
            }
            
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
                async with session.get(url, headers=headers, allow_redirects=True) as resp:
                    # Accept any 2xx status code (200, 201, 202, 203, etc.)
                    if resp.status < 200 or resp.status >= 300:
                        logging.warning("DuckDuckGo query returned status %d", resp.status)
                        continue
                    
                    html = await resp.text()
                    
                    # If response is empty or minimal, skip
                    if not html or len(html) < 100:
                        logging.warning("DuckDuckGo returned minimal response for query: %s", query)
                        continue
                    
                    soup = BeautifulSoup(html, 'html.parser')
                    divs = soup.select('div.result')
                    
                    logging.info("Found %d results for query: %s", len(divs), query)
                    
                    # Extract Medium usernames from search results
                    for div in divs:
                        link_tag = div.select_one('a.result__a')
                        if not link_tag:
                            continue
                        
                        link = link_tag.get('href')
                        if not link:
                            continue
                            
                        if 'duckduckgo.com/l/?uddg=' in link:
                            try:
                                parsed = parse_qs(urlparse(link).query)
                                link = parsed.get('uddg', [link])[0]
                            except:
                                pass
                        
                        # Check if it's a Medium profile URL
                        if 'medium.com/@' in link:
                            # Extract username from URL
                            match = re.search(r'medium\.com/@([\w\-]+)', link)
                            if match:
                                username = match.group(1)
                                logging.info("Found Medium username via DuckDuckGo: %s", username)
                                return username
        
        logging.warning("No Medium profile found for: %s after all search attempts", full_name)
        return None
        
    except Exception as e:
        logging.error("Error searching DuckDuckGo: %s", e)
        return None


def extract_json_ld_data(html: str) -> Optional[Dict[str, Any]]:
    """Extract JSON-LD structured data from HTML."""
    try:
        patterns = [
            r'<script type="application/ld\+json">(.*?)</script>',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, html, re.DOTALL)
            for match in matches:
                try:
                    data = json.loads(match)
                    return data
                except:
                    pass
        return None
    except Exception as e:
        logging.warning("Error extracting JSON-LD: %s", e)
        return None


def scrape_author_profile_html(username: str, session: requests.Session) -> Dict[str, Any]:
    """Scrape Medium author profile using RSS and HTML parsing with enhanced data extraction."""
    
    logging.info("Scraping Medium profile for author: %s", username)
    
    profile_data = {
        "username": username,
        "profile_url": f"https://medium.com/@{username}",
        "method": "rss+html",
        "basic_info": {},
        "bio": None,
        "followers": None,
        "following": None,
        "social_links": [],
        "join_date": None,
        "location": None,
        "profile_image": None,
        "articles_from_rss": [],
        "error": None
    }
    
    try:
        # First, try to get articles from RSS feed (bypasses 403)
        rss_url = f"https://medium.com/feed/@{username}"
        logging.info("Fetching RSS feed: %s", rss_url)
        
        rss_response = session.get(rss_url, headers=DEFAULT_HEADERS, timeout=15)
        
        if rss_response.status_code == 200:
            logging.info("Successfully fetched RSS feed")
            
            try:
                root = ET.fromstring(rss_response.content)
                
                # Extract channel-level info first
                channel = root.find('.//channel')
                if channel:
                    title_elem = channel.find('title')
                    if title_elem is not None and title_elem.text:
                        title_text = title_elem.text
                        profile_data["basic_info"]["name"] = title_text
                        
                        # Try to extract clean name (e.g., "Stories by John Doe on Medium" -> "John Doe")
                        name_match = re.search(r'Stories by (.+?) on Medium', title_text)
                        if name_match:
                            profile_data["basic_info"]["name"] = name_match.group(1)
                            profile_data["bio"] = f"Author: {name_match.group(1)}"
                
                # Parse RSS items
                author_names = set()
                for item in root.findall('.//item'):
                    title_elem = item.find('title')
                    link_elem = item.find('link')
                    pubdate_elem = item.find('pubDate')
                    description_elem = item.find('description')
                    author_elem = item.find('creator')
                    
                    # Collect author names from items
                    if author_elem is not None and author_elem.text:
                        author_names.add(author_elem.text)
                    
                    if title_elem is not None and link_elem is not None:
                        profile_data["articles_from_rss"].append({
                            "title": title_elem.text or "Untitled",
                            "url": link_elem.text,
                            "publish_date": pubdate_elem.text if pubdate_elem is not None else None,
                            "summary": description_elem.text if description_elem is not None else None,
                        })
                
                # Use author name from articles if available
                if author_names and not profile_data["basic_info"].get("name"):
                    author_name = list(author_names)[0]
                    profile_data["basic_info"]["name"] = author_name
                    profile_data["bio"] = f"Author: {author_name}"
                
                logging.info("Extracted %d articles from RSS feed", len(profile_data["articles_from_rss"]))
                
            except ET.ParseError as e:
                logging.warning("Error parsing RSS feed: %s", e)
        else:
            logging.warning("RSS feed returned status %d", rss_response.status_code)
        
        # Now try to get additional profile info from HTML (may be blocked but worth trying)
        html_url = f"https://medium.com/@{username}"
        logging.info("Attempting to fetch profile HTML from: %s", html_url)
        
        try:
            html_response = session.get(html_url, headers=DEFAULT_HEADERS, timeout=10)
            
            if html_response.status_code == 200:
                html = html_response.text
                soup = BeautifulSoup(html, 'html.parser')
                
                # Extract Open Graph metadata
                og_image = soup.find("meta", property="og:image")
                if og_image:
                    profile_data["profile_image"] = og_image.get("content")
                
                # Extract meta description (often contains author bio)
                meta_desc = soup.find("meta", attrs={"name": "description"})
                if meta_desc and meta_desc.get("content"):
                    desc = meta_desc.get("content").strip()
                    if desc and desc != "Medium":
                        profile_data["bio"] = desc
                
                # Extract title
                title_tag = soup.find("title")
                if title_tag and title_tag.string:
                    title = title_tag.string
                    name = re.sub(r'\s*(-\s*Medium|@\w+|-.*)', '', title).strip()
                    if name and not profile_data["basic_info"].get("name"):
                        profile_data["basic_info"]["name"] = name
                
                # Try to extract follower count from visible text
                page_text = soup.get_text()
                
                # Look for "X followers" pattern
                followers_match = re.search(r'(\d+)\s+followers?', page_text, re.IGNORECASE)
                if followers_match:
                    try:
                        followers_count = int(followers_match.group(1))
                        if followers_count > 0:
                            profile_data["followers"] = followers_count
                            logging.info("Found followers count: %d", followers_count)
                    except (ValueError, AttributeError):
                        pass
                
                # Extract social links from HTML
                social_patterns = [
                    (r'https?://twitter\.com/[\w]+', "twitter"),
                    (r'https?://linkedin\.com/in/[\w\-]+', "linkedin"),
                    (r'https?://github\.com/[\w\-]+', "github"),
                    (r'https?://instagram\.com/[\w\.]+', "instagram"),
                ]
                
                for pattern, platform in social_patterns:
                    matches = re.findall(pattern, html, re.IGNORECASE)
                    for match in set(matches):  # Use set to avoid duplicates
                        profile_data["social_links"].append({
                            "platform": platform,
                            "url": match
                        })
                
                if profile_data["social_links"]:
                    logging.info("Found %d social links", len(profile_data["social_links"]))
                
                logging.info("Successfully supplemented profile data from HTML")
        
        except Exception as html_error:
            logging.warning("Could not fetch HTML profile (expected if 403): %s", html_error)
        
        # Try to extract more info from first article page
        if profile_data["articles_from_rss"]:
            logging.info("Extracting enhanced info from first article...")
            try:
                first_article_url = profile_data["articles_from_rss"][0]["url"]
                time.sleep(0.3)  # Be nice to the server
                
                article_response = session.get(first_article_url, headers=DEFAULT_HEADERS, timeout=10)
                if article_response.status_code == 200:
                    article_soup = BeautifulSoup(article_response.text, 'html.parser')
                    
                    # Look for social links in article metadata
                    article_links = article_soup.find_all("a", href=True)
                    for link in article_links:
                        href = link.get("href", "").lower()
                        
                        if "twitter.com" in href and not any(s["platform"] == "twitter" for s in profile_data["social_links"]):
                            profile_data["social_links"].append({"platform": "twitter", "url": link.get("href")})
                        elif "linkedin.com" in href and not any(s["platform"] == "linkedin" for s in profile_data["social_links"]):
                            profile_data["social_links"].append({"platform": "linkedin", "url": link.get("href")})
                        elif "github.com" in href and not any(s["platform"] == "github" for s in profile_data["social_links"]):
                            profile_data["social_links"].append({"platform": "github", "url": link.get("href")})
                    
                    logging.info("Extracted additional info from first article")
            
            except Exception as article_error:
                logging.debug("Could not extract info from first article: %s", article_error)
        
        if profile_data["articles_from_rss"] or profile_data["basic_info"]:
            # We have at least some data
            pass
        else:
            profile_data["error"] = "No data could be extracted from RSS or HTML"
        
        logging.info("Successfully scraped profile for %s", username)
        
    except Exception as e:
        profile_data["error"] = str(e)
        logging.error("Error scraping profile: %s", e)
    
    return profile_data


def scrape_author_articles(username: str, session: requests.Session, limit: Optional[int] = None) -> Dict[str, Any]:
    """Scrape Medium author's articles list from RSS feed."""
    
    logging.info("Scraping articles for author: %s via RSS", username)
    
    articles_data = {
        "username": username,
        "articles": [],
        "total_count": 0,
        "method": "rss",
        "error": None
    }
    
    try:
        rss_url = f"https://medium.com/feed/@{username}"
        response = session.get(rss_url, headers=DEFAULT_HEADERS, timeout=15)
        
        if response.status_code != 200:
            articles_data["error"] = f"RSS feed returned HTTP {response.status_code}"
            return articles_data
        
        try:
            root = ET.fromstring(response.content)
            
            article_count = 0
            for item in root.findall('.//item'):
                if limit and article_count >= limit:
                    break
                
                title_elem = item.find('title')
                link_elem = item.find('link')
                pubdate_elem = item.find('pubDate')
                description_elem = item.find('description')
                author_elem = item.find('creator')
                
                if title_elem is not None and link_elem is not None:
                    article_count += 1
                    articles_data["articles"].append({
                        "title": title_elem.text or "Untitled",
                        "url": link_elem.text,
                        "publish_date": pubdate_elem.text if pubdate_elem is not None else None,
                        "author": author_elem.text if author_elem is not None else username,
                        "summary": description_elem.text[:500] if description_elem is not None and description_elem.text else None,
                    })
            
            articles_data["total_count"] = len(articles_data["articles"])
            logging.info("Found %d articles from RSS", articles_data["total_count"])
            
        except ET.ParseError as e:
            articles_data["error"] = f"Error parsing RSS: {e}"
            logging.error("Error parsing RSS: %s", e)
        
    except Exception as e:
        articles_data["error"] = str(e)
        logging.error("Error scraping articles: %s", e)
    
    return articles_data


def scrape_article_content(article_url: str, session: requests.Session) -> Dict[str, Any]:
    """Scrape individual article content."""
    
    article_data = {
        "url": article_url,
        "title": None,
        "content": None,
        "publish_date": None,
        "tags": [],
        "reading_time": None,
        "error": None
    }
    
    try:
        time.sleep(0.5)  # Add delay to avoid rate limiting
        
        response = session.get(article_url, headers=DEFAULT_HEADERS, timeout=15)
        
        if response.status_code != 200:
            article_data["error"] = f"HTTP {response.status_code}"
            return article_data
        
        html = response.text
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract title
        title_meta = soup.find("meta", property="og:title")
        if title_meta:
            article_data["title"] = title_meta.get("content")
        
        # Extract publish date
        date_meta = soup.find("meta", property="article:published_time")
        if date_meta:
            article_data["publish_date"] = date_meta.get("content")
        
        # Extract tags
        tag_metas = soup.find_all("meta", property="article:tag")
        article_data["tags"] = [tag.get("content") for tag in tag_metas if tag.get("content")]
        
        # Extract reading time
        reading_time_pattern = r'(\d+)\s+min\s+read'
        match = re.search(reading_time_pattern, html, re.IGNORECASE)
        if match:
            article_data["reading_time"] = int(match.group(1))
        
        # Extract main content
        article_body = soup.find("article")
        if article_body:
            # Remove script and style tags
            for tag in article_body.find_all(['script', 'style']):
                tag.decompose()
            
            # Get text content
            content = article_body.get_text(separator='\n', strip=True)
            article_data["content"] = content[:2000]  # Limit content size
        
        logging.info("Scraped article: %s", article_url)
        
    except Exception as e:
        article_data["error"] = str(e)
        logging.error("Error scraping article: %s", e)
    
    return article_data


def collect_medium_data(username: str, include_articles: bool = False, 
                       article_limit: Optional[int] = None) -> Dict[str, Any]:
    """Collect comprehensive Medium author data."""
    
    logging.info("Starting Medium data collection for: %s", username)
    
    results = {
        "timestamp": dt.datetime.utcnow().isoformat(),
        "username": username,
        "profile": {},
        "articles": {},
        "article_contents": [],
        "summary": {
            "profile_found": False,
            "articles_found": 0,
            "articles_with_content": 0,
        },
        "errors": []
    }
    
    session = requests.Session()
    
    try:
        # Scrape profile via HTML
        profile = scrape_author_profile_html(username, session)
        results["profile"] = profile
        
        if not profile.get("error"):
            results["summary"]["profile_found"] = True
        else:
            results["errors"].append(f"Profile error: {profile['error']}")
        
        # Scrape articles if requested
        if include_articles:
            articles = scrape_author_articles(username, session, limit=10)
            results["articles"] = articles
            results["summary"]["articles_found"] = len(articles.get("articles", []))
            
            if articles.get("error"):
                results["errors"].append(f"Articles error: {articles['error']}")
            
            # Scrape article contents
            for idx, article in enumerate(articles.get("articles", [])[:article_limit or 5]):
                logging.info("Scraping article %d/%d", idx + 1, min(article_limit or 5, len(articles["articles"])))
                content = scrape_article_content(article["url"], session)
                
                if not content.get("error"):
                    article["reading_time"] = content.get("reading_time")
                    article["publish_date"] = content.get("publish_date")
                    article["tags"] = content.get("tags")
                    results["summary"]["articles_with_content"] += 1
        
        logging.info("Data collection complete for %s", username)
        
    except Exception as e:
        logging.error("Error during data collection: %s", e)
        results["errors"].append(str(e))
    finally:
        session.close()
    
    return results


def collect_osint(
    username: Optional[str] = None,
    full_name: Optional[str] = None,
    include_articles: bool = True,
    article_limit: int = 5,
) -> Dict[str, Any]:
    """Application-facing wrapper used by the Flask app.

    This resolves a Medium username (optionally from a full name),
    runs the comprehensive scraper, and returns a compact OSINT-style
    payload similar to other collectors.
    """

    if not username and not full_name:
        raise ValueError("Either username or full_name must be provided")

    search_query = full_name or username
    resolved_username = username
    resolution_error: Optional[str] = None

    # If only full_name is provided, try to resolve Medium username via DuckDuckGo
    if not resolved_username and full_name:
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            resolved_username = loop.run_until_complete(
                find_medium_username_duckduckgo(full_name)
            )
        except Exception as e:
            logging.error("Error resolving Medium username for '%s': %s", full_name, e)
            resolution_error = str(e)
        finally:
            try:
                loop.close()
            except Exception:
                pass

    if not resolved_username:
        # Could not resolve a usable Medium handle
        return {
            "platform": "Medium",
            "query": search_query,
            "collected_at": dt.datetime.utcnow().isoformat(),
            "resolved_username": None,
            "profile": {},
            "articles": {},
            "summary": {
                "profile_found": False,
                "articles_found": 0,
                "articles_with_content": 0,
            },
            "errors": [
                "Could not resolve Medium username from input",
            ]
            + ([resolution_error] if resolution_error else []),
        }

    # Run the main scraper using the resolved username
    raw_results = collect_medium_data(
        resolved_username,
        include_articles=include_articles,
        article_limit=article_limit,
    )

    return {
        "platform": "Medium",
        "query": search_query,
        "collected_at": raw_results.get("timestamp", dt.datetime.utcnow().isoformat()),
        "resolved_username": resolved_username,
        "profile": raw_results.get("profile", {}),
        "articles": raw_results.get("articles", {}),
        "summary": raw_results.get("summary", {}),
        "errors": raw_results.get("errors", []),
    }


def save_results(results: Dict[str, Any], output_dir: Optional[str] = None) -> str:
    """Save results to JSON file."""
    
    if output_dir is None:
        output_dir = str(DEFAULT_OUTPUT_DIR)
    
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    timestamp = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    username = results.get("username", "unknown")
    
    output_file = output_path / f"medium_{username}_{timestamp}.json"
    
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        
        logging.info("Results saved to: %s", output_file)
        return str(output_file)
    
    except OSError as e:
        logging.error("Failed to save results: %s", e)
        raise


def interactive_mode():
    """Run in interactive mode."""
    print("\n" + "="*70)
    print("  Medium Comprehensive Scraper - Interactive Mode")
    print("="*70 + "\n")
    
    search_method = input("Search by (1) username or (2) full name? [1/2, default: 2]: ").strip() or "2"
    
    username = None
    
    if search_method == "2":
        # Search by full name using DuckDuckGo
        full_name = input("Enter full name (e.g., 'Muneeb Nawaz'): ").strip()
        if not full_name:
            print("Error: Full name cannot be empty")
            return
        
        print(f"\nSearching for Medium username for '{full_name}'...")
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        username = loop.run_until_complete(find_medium_username_duckduckgo(full_name))
        loop.close()
        
        if not username:
            print(f"[!] No Medium profile found for '{full_name}'")
            return
        else:
            print(f"[+] Found username: {username}")
    else:
        # Direct username input
        username = input("Enter Medium username (without @): ").strip()
        if not username:
            print("Error: Username cannot be empty")
            return
    
    include_articles = input("Scrape articles? (y/n) [default: y]: ").strip().lower() != 'n'
    
    print("\nCollecting Medium data...\n")
    results = collect_medium_data(username, include_articles=include_articles)
    
    # Save results
    try:
        output_file = save_results(results)
    except Exception as e:
        print(f"Error saving results: {e}")
        output_file = None
    
    # Print summary
    print("\n" + "="*70)
    print("  Medium Data Collection Results")
    print("="*70 + "\n")
    
    print(f"Username: {username}")
    print(f"Profile found: {results['summary']['profile_found']}")
    print(f"Articles found: {results['summary']['articles_found']}")
    print(f"Articles with content: {results['summary']['articles_with_content']}")
    
    if results["profile"].get("basic_info"):
        print("\n[+] Profile Information:")
        for key, value in results["profile"]["basic_info"].items():
            if value:
                print(f"  • {key.replace('_', ' ').title()}: {value}")
    
    if results["profile"].get("bio"):
        print(f"\nBio: {results['profile']['bio']}")
    
    if results["profile"].get("social_links"):
        print("\n[+] Social Links:")
        for link in results["profile"]["social_links"]:
            print(f"  • {link['platform']}: {link['url']}")
    
    if results["articles"].get("articles"):
        print(f"\n[+] Articles ({len(results['articles']['articles'])} total):")
        for idx, article in enumerate(results["articles"]["articles"][:10], 1):
            print(f"\n  {idx}. {article.get('title', 'Unknown')}")
            if article.get("reading_time"):
                print(f"     Reading Time: {article['reading_time']} min")
            if article.get("publish_date"):
                print(f"     Published: {article['publish_date']}")
    
    if results.get("errors"):
        print("\n⚠️ Errors/Warnings:")
        for error in results["errors"]:
            print(f"  • {error}")
    
    if output_file:
        print(f"\n📁 Full results saved to: {output_file}")
    
    print("\n" + "="*70 + "\n")


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Medium Comprehensive Scraper - Extract author and article data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Interactive mode
  python medium_comprehensive_scraper.py
  
  # Scrape by username
  python medium_comprehensive_scraper.py --author "username"
  
  # Search by full name and scrape
  python medium_comprehensive_scraper.py --fullname "Muneeb Nawaz"
  
  # Scrape profile and articles
  python medium_comprehensive_scraper.py --author "username" --articles
  
  # Limit article scraping
  python medium_comprehensive_scraper.py --author "username" --articles --limit 10
  
  # Custom output directory
  python medium_comprehensive_scraper.py --author "username" --output ~/Downloads
        """
    )
    
    parser.add_argument("--author", "-a", help="Medium username (without @)")
    parser.add_argument("--fullname", "-fn", help="Full name to search for Medium profile (e.g., 'Muneeb Nawaz')")
    parser.add_argument("--articles", action="store_true", help="Scrape author's articles")
    parser.add_argument("--limit", "-l", type=int, help="Limit number of articles to scrape")
    parser.add_argument("--output", "-o", help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})")
    parser.add_argument("--log-dir", help="Log directory")
    
    args = parser.parse_args()
    
    # Setup logging
    setup_logging(args.log_dir)
    
    username = None
    
    # Handle full name search via DuckDuckGo
    if args.fullname:
        logging.info("Searching for Medium username for: %s", args.fullname)
        print(f"\n[*] Searching DuckDuckGo for Medium profile of '{args.fullname}'...\n")
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        username = loop.run_until_complete(find_medium_username_duckduckgo(args.fullname))
        loop.close()
        
        if not username:
            print(f"[!] No Medium profile found for '{args.fullname}'")
            print("Try searching with --author <username> directly or use interactive mode")
            sys.exit(1)
        else:
            print(f"[+] Found Medium username: {username}\n")
    elif args.author:
        username = args.author
    
    if username:
        logging.info("Running in AUTHOR mode for: %s", username)
        
        results = collect_medium_data(username, include_articles=args.articles, article_limit=args.limit)
        
        try:
            output_file = save_results(results, args.output)
            print(f"[+] Results saved to: {output_file}\n")
        except Exception as e:
            print(f"[!] Error saving results: {e}\n")
        
        # Print results
        sys.stdout.reconfigure(encoding='utf-8')
        output = json.dumps(results, indent=2, ensure_ascii=False)
        print(output)
        
        if results.get("errors") and not results["summary"]["profile_found"]:
            sys.exit(1)
    else:
        logging.info("Running in INTERACTIVE mode")
        interactive_mode()


if __name__ == "__main__":
    main()
