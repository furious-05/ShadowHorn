#!/usr/bin/env python3
"""
Profile OSINT Collector (Flask + React Ready Version)
Usage: collect_osint(full_name, keywords='')
Saves results in osint_results folder with timestamped filenames
"""

import asyncio
import aiohttp
from bs4 import BeautifulSoup
from urllib.parse import quote, urlparse, parse_qs
from datetime import datetime
import re
import random
import os
import logging
import json
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# -----------------------------
# OSINT Results Folder
# -----------------------------
OSINT_RESULTS_DIR = Path("osint_results")
OSINT_RESULTS_DIR.mkdir(exist_ok=True)

# -----------------------------
# Profile OSINT Collector Class
# -----------------------------
class ProfileOSINT:
    def __init__(self, max_results=20):
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        ]
        self.platforms = {
            'linkedin.com': 'LinkedIn',
            'github.com': 'GitHub',
            'medium.com': 'Medium',
            'stackoverflow.com': 'StackOverflow',
            'twitter.com': 'Twitter',
            'instagram.com': 'Instagram',
            'facebook.com': 'Facebook',
            'snapchat.com': 'Snapchat'
        }
        self.max_results = max_results

    def get_headers(self):
        return {
            'User-Agent': random.choice(self.user_agents),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }

    def extract_entities(self, text):
        entities = []
        # Emails
        entities += [{'text': e, 'type': 'EMAIL', 'confidence': 0.95} for e in re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}', text)]
        # Handles
        entities += [{'text': h, 'type': 'HANDLE', 'confidence': 0.9} for h in re.findall(r'@\w{3,30}', text)]
        # URLs
        entities += [{'text': u, 'type': 'URL', 'confidence': 0.9} for u in re.findall(r'https?://[^\s]+', text)]
        # Names
        words = text.split()
        current = []
        stop_words = {'The','And','For','With','This','That','From','Was','Were','How','Use','Otherwise','Once','After','Not','Learn','Includes','Guest'}
        for word in words:
            clean_word = re.sub(r'[^\w\s-]', '', word)
            if clean_word and len(clean_word) > 2 and clean_word[0].isupper() and clean_word not in stop_words:
                current.append(clean_word)
            else:
                if len(current) >= 2:
                    entities.append({'text': ' '.join(current), 'type': 'NAME', 'confidence': 0.85})
                current = []
        if len(current) >= 2:
            entities.append({'text': ' '.join(current), 'type': 'NAME', 'confidence': 0.85})
        return entities

    async def fetch_duckduckgo(self, query):
        url = f"https://html.duckduckgo.com/html/?q={quote(query)}"
        results = []
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
                async with session.get(url, headers=self.get_headers()) as resp:
                    if resp.status != 200:
                        logging.warning(f"DuckDuckGo request failed: {resp.status}")
                        return results
                    html = await resp.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    divs = soup.select('div.result')
                    for div in divs[:self.max_results]:
                        link_tag = div.select_one('a.result__a')
                        snippet_tag = div.select_one('a.result__snippet')
                        if not link_tag:
                            continue
                        link = link_tag.get('href')
                        if 'duckduckgo.com/l/?uddg=' in link:
                            parsed = parse_qs(urlparse(link).query)
                            link = parsed.get('uddg', [link])[0]
                        title = link_tag.get_text()
                        snippet = snippet_tag.get_text() if snippet_tag else ''
                        domain = urlparse(link).netloc
                        platform = self.platforms.get(domain, 'Other')
                        entities = self.extract_entities(title + ' ' + snippet)
                        results.append({
                            'title': title,
                            'url': link,
                            'platform': platform,
                            'snippet': snippet,
                            'entities': entities
                        })
        except Exception as e:
            logging.error(f"DuckDuckGo fetch error: {e}")
        return results

    async def collect_profiles(self, links):
        return links  # extendable for platform-specific scrapers

    async def collect_osint(self, full_name, keywords=''):
        query = full_name + (' ' + keywords if keywords else '')
        logging.info(f"🔎 Collecting OSINT for: {query}")
        links = await self.fetch_duckduckgo(query)
        profiles = await self.collect_profiles(links)

        # Save JSON in osint_results folder with timestamp
        safe_name = '_'.join([full_name.replace(' ','_'), keywords.replace(' ','_')]) if keywords else full_name.replace(' ','_')
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filepath = OSINT_RESULTS_DIR / f"{safe_name}_{timestamp}.json"
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump({
                'params': {'full_name': full_name, 'keywords': keywords},
                'timestamp': datetime.now().isoformat(),
                'results': profiles
            }, f, indent=2, ensure_ascii=False)
        logging.info(f"✅ OSINT results saved to {filepath}")
        return filepath

# -----------------------------
# CLI
# -----------------------------
def main():
    import sys
    if len(sys.argv) < 2:
        print("Usage: python3 profile_osint.py <full_name> [keywords]")
        exit(1)

    full_name = sys.argv[1]
    keywords = sys.argv[2] if len(sys.argv) > 2 else ''

    tool = ProfileOSINT()
    loop = asyncio.get_event_loop()
    filepath = loop.run_until_complete(tool.collect_osint(full_name, keywords))
    print(f"✔️ Saved: {filepath}")

if __name__ == "__main__":
    main()
