"""
abuse.ch collectors: ThreatFox, URLhaus, and MalwareBazaar.
All fully free, no API key required.
"""

import requests

TIMEOUT = 30


# ---------------------------------------------------------------------------
# ThreatFox — IOC sharing platform (IPs, domains, URLs, hashes)
# ---------------------------------------------------------------------------
THREATFOX_API = "https://threatfox-api.abuse.ch/api/v1/"


def threatfox_search_ioc(ioc: str) -> dict:
    """Search ThreatFox for a specific IOC (IP, domain, hash, URL)."""
    try:
        resp = requests.post(
            THREATFOX_API,
            json={"query": "search_ioc", "search_term": ioc},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        if data.get("query_status") == "no_result":
            return {"ioc": ioc, "found": False, "results": []}

        results = []
        for item in (data.get("data") or [])[:20]:
            results.append({
                "ioc": item.get("ioc", ""),
                "ioc_type": item.get("ioc_type", ""),
                "threat_type": item.get("threat_type", ""),
                "malware": item.get("malware", ""),
                "malware_alias": item.get("malware_alias", ""),
                "confidence_level": item.get("confidence_level", 0),
                "first_seen": item.get("first_seen_utc", ""),
                "last_seen": item.get("last_seen_utc", ""),
                "reporter": item.get("reporter", ""),
                "tags": item.get("tags") or [],
                "reference": item.get("reference", ""),
            })

        return {"ioc": ioc, "found": True, "count": len(results), "results": results}
    except requests.RequestException as e:
        return {"error": str(e)}


def threatfox_recent(days: int = 1, limit: int = 30) -> dict:
    """Fetch recent IOCs from ThreatFox (for threat feeds)."""
    try:
        resp = requests.post(
            THREATFOX_API,
            json={"query": "get_iocs", "days": days},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        items = (data.get("data") or [])[:limit]
        results = []
        for item in items:
            results.append({
                "ioc": item.get("ioc", ""),
                "ioc_type": item.get("ioc_type", ""),
                "threat_type": item.get("threat_type", ""),
                "malware": item.get("malware", ""),
                "confidence_level": item.get("confidence_level", 0),
                "first_seen": item.get("first_seen_utc", ""),
                "tags": item.get("tags") or [],
            })

        return {"days": days, "count": len(results), "results": results}
    except requests.RequestException as e:
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# URLhaus — Malicious URL tracking
# ---------------------------------------------------------------------------
URLHAUS_API = "https://urlhaus-api.abuse.ch/v1"


def urlhaus_lookup_url(url: str) -> dict:
    """Look up a specific URL in URLhaus."""
    try:
        resp = requests.post(
            f"{URLHAUS_API}/url/",
            data={"url": url},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        if data.get("query_status") == "no_results":
            return {"url": url, "found": False}

        return {
            "url": url,
            "found": True,
            "url_status": data.get("url_status", ""),
            "threat": data.get("threat", ""),
            "host": data.get("host", ""),
            "date_added": data.get("date_added", ""),
            "last_online": data.get("last_online", ""),
            "tags": data.get("tags") or [],
            "blacklists": data.get("blacklists", {}),
            "reporter": data.get("reporter", ""),
            "payloads": [
                {
                    "filename": p.get("filename", ""),
                    "file_type": p.get("file_type", ""),
                    "sha256": p.get("sha256_hash", ""),
                    "signature": p.get("signature", ""),
                    "virustotal_percent": p.get("virustotal", {}).get("percent", 0) if p.get("virustotal") else 0,
                }
                for p in (data.get("payloads") or [])[:10]
            ],
        }
    except requests.RequestException as e:
        return {"error": str(e)}


def urlhaus_lookup_host(host: str) -> dict:
    """Look up a host (IP or domain) in URLhaus."""
    try:
        resp = requests.post(
            f"{URLHAUS_API}/host/",
            data={"host": host},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        if data.get("query_status") in ("no_results", "invalid_host"):
            return {"host": host, "found": False}

        urls = []
        for u in (data.get("urls") or [])[:20]:
            urls.append({
                "url": u.get("url", ""),
                "url_status": u.get("url_status", ""),
                "threat": u.get("threat", ""),
                "date_added": u.get("date_added", ""),
                "tags": u.get("tags") or [],
            })

        return {
            "host": host,
            "found": True,
            "url_count": data.get("urls_online", 0),
            "blacklists": data.get("blacklists", {}),
            "urls": urls,
        }
    except requests.RequestException as e:
        return {"error": str(e)}


# ---------------------------------------------------------------------------
# MalwareBazaar — Malware sample sharing
# ---------------------------------------------------------------------------
MALWAREBAZAAR_API = "https://mb-api.abuse.ch/api/v1/"


def malwarebazaar_lookup_hash(file_hash: str) -> dict:
    """Look up a file hash (MD5, SHA1, SHA256) in MalwareBazaar."""
    try:
        resp = requests.post(
            MALWAREBAZAAR_API,
            data={"query": "get_info", "hash": file_hash},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        if data.get("query_status") in ("hash_not_found", "no_results"):
            return {"hash": file_hash, "found": False}

        samples = []
        for item in (data.get("data") or [])[:5]:
            samples.append({
                "sha256": item.get("sha256_hash", ""),
                "sha1": item.get("sha1_hash", ""),
                "md5": item.get("md5_hash", ""),
                "file_type": item.get("file_type", ""),
                "file_size": item.get("file_size", 0),
                "signature": item.get("signature", ""),
                "first_seen": item.get("first_seen", ""),
                "last_seen": item.get("last_seen", ""),
                "reporter": item.get("reporter", ""),
                "tags": item.get("tags") or [],
                "intelligence": {
                    "clamav": item.get("intelligence", {}).get("clamav") or [],
                    "downloads": item.get("intelligence", {}).get("downloads", 0),
                    "uploads": item.get("intelligence", {}).get("uploads", ""),
                    "mail": item.get("intelligence", {}).get("mail") if item.get("intelligence") else None,
                },
                "delivery_method": item.get("delivery_method", ""),
                "origin_country": item.get("origin_country", ""),
            })

        return {
            "hash": file_hash,
            "found": True,
            "count": len(samples),
            "samples": samples,
        }
    except requests.RequestException as e:
        return {"error": str(e)}


def malwarebazaar_recent(limit: int = 20) -> dict:
    """Fetch recent malware samples (for threat feeds)."""
    try:
        resp = requests.post(
            MALWAREBAZAAR_API,
            data={"query": "get_recent", "selector": "time"},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}"}

        data = resp.json()
        samples = []
        for item in (data.get("data") or [])[:limit]:
            samples.append({
                "sha256": item.get("sha256_hash", ""),
                "file_type": item.get("file_type", ""),
                "file_size": item.get("file_size", 0),
                "signature": item.get("signature", ""),
                "first_seen": item.get("first_seen", ""),
                "tags": item.get("tags") or [],
                "origin_country": item.get("origin_country", ""),
            })

        return {"count": len(samples), "samples": samples}
    except requests.RequestException as e:
        return {"error": str(e)}
