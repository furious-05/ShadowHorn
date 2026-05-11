"""
VirusTotal API v3 collector.
Supports IP, domain, URL, and file hash lookups.
Free tier: 4 requests/minute, 500/day.
"""

import requests
import base64
import time

VT_BASE = "https://www.virustotal.com/api/v3"
TIMEOUT = 30


def _headers(api_key: str) -> dict:
    return {"x-apikey": api_key, "Accept": "application/json"}


def _safe_get(url: str, api_key: str) -> dict:
    try:
        resp = requests.get(url, headers=_headers(api_key), timeout=TIMEOUT)
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}
    except requests.RequestException as e:
        return {"error": str(e)}


def _extract_stats(data: dict) -> dict:
    """Pull last_analysis_stats and reputation from a VT object."""
    attrs = data.get("data", {}).get("attributes", {})
    stats = attrs.get("last_analysis_stats", {})
    total = sum(stats.values()) if stats else 0
    malicious = stats.get("malicious", 0)
    suspicious = stats.get("suspicious", 0)

    return {
        "malicious": malicious,
        "suspicious": suspicious,
        "harmless": stats.get("harmless", 0),
        "undetected": stats.get("undetected", 0),
        "total_engines": total,
        "detection_ratio": f"{malicious}/{total}" if total else "0/0",
        "reputation": attrs.get("reputation", 0),
        "tags": attrs.get("tags", []),
    }


def lookup_ip(ip: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "VirusTotal API key not configured"}

    raw = _safe_get(f"{VT_BASE}/ip_addresses/{ip}", api_key)
    if "error" in raw and "data" not in raw:
        return raw

    attrs = raw.get("data", {}).get("attributes", {})
    result = _extract_stats(raw)
    result.update({
        "ip": ip,
        "country": attrs.get("country", ""),
        "continent": attrs.get("continent", ""),
        "as_owner": attrs.get("as_owner", ""),
        "asn": attrs.get("asn", 0),
        "network": attrs.get("network", ""),
        "whois": (attrs.get("whois", "") or "")[:1000],
    })
    return result


def lookup_domain(domain: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "VirusTotal API key not configured"}

    raw = _safe_get(f"{VT_BASE}/domains/{domain}", api_key)
    if "error" in raw and "data" not in raw:
        return raw

    attrs = raw.get("data", {}).get("attributes", {})
    result = _extract_stats(raw)
    result.update({
        "domain": domain,
        "registrar": attrs.get("registrar", ""),
        "creation_date": attrs.get("creation_date", 0),
        "last_dns_records": attrs.get("last_dns_records", [])[:10],
        "categories": attrs.get("categories", {}),
        "popularity_ranks": attrs.get("popularity_ranks", {}),
    })
    return result


def lookup_hash(file_hash: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "VirusTotal API key not configured"}

    raw = _safe_get(f"{VT_BASE}/files/{file_hash}", api_key)
    if "error" in raw and "data" not in raw:
        return raw

    attrs = raw.get("data", {}).get("attributes", {})
    result = _extract_stats(raw)
    result.update({
        "hash": file_hash,
        "md5": attrs.get("md5", ""),
        "sha1": attrs.get("sha1", ""),
        "sha256": attrs.get("sha256", ""),
        "file_type": attrs.get("type_description", ""),
        "file_size": attrs.get("size", 0),
        "meaningful_name": attrs.get("meaningful_name", ""),
        "names": attrs.get("names", [])[:10],
        "creation_date": attrs.get("creation_date", 0),
        "last_analysis_date": attrs.get("last_analysis_date", 0),
        "type_tags": attrs.get("type_tags", []),
        "magic": attrs.get("magic", ""),
        "popular_threat_classification": attrs.get("popular_threat_classification", {}),
    })
    return result


def lookup_url(url: str, api_key: str) -> dict:
    """Look up a URL. VT requires base64url-encoded URL as the identifier."""
    if not api_key:
        return {"error": "VirusTotal API key not configured"}

    url_id = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    raw = _safe_get(f"{VT_BASE}/urls/{url_id}", api_key)

    if "error" in raw and "data" not in raw:
        # URL may not have been scanned yet — submit it
        try:
            submit = requests.post(
                f"{VT_BASE}/urls",
                headers=_headers(api_key),
                data={"url": url},
                timeout=TIMEOUT,
            )
            if submit.status_code in (200, 201):
                time.sleep(3)
                raw = _safe_get(f"{VT_BASE}/urls/{url_id}", api_key)
            else:
                return {"error": f"URL submission failed: HTTP {submit.status_code}"}
        except requests.RequestException as e:
            return {"error": f"URL submission failed: {e}"}

    if "error" in raw and "data" not in raw:
        return raw

    attrs = raw.get("data", {}).get("attributes", {})
    result = _extract_stats(raw)
    result.update({
        "url": url,
        "final_url": attrs.get("last_final_url", ""),
        "title": attrs.get("title", ""),
        "last_http_response_code": attrs.get("last_http_response_code", 0),
        "categories": attrs.get("categories", {}),
        "trackers": attrs.get("trackers", {}),
    })
    return result
