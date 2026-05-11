"""
AlienVault OTX (Open Threat Exchange) DirectConnect API collector.
Community-driven threat intelligence: IOCs, pulses, and related indicators.
Fully free with account signup.
"""

import requests

OTX_BASE = "https://otx.alienvault.com/api/v1"
TIMEOUT = 30


def _headers(api_key: str) -> dict:
    return {"X-OTX-API-KEY": api_key, "Accept": "application/json"}


def _safe_get(url: str, api_key: str) -> dict:
    try:
        resp = requests.get(url, headers=_headers(api_key), timeout=TIMEOUT)
        if resp.status_code == 200:
            return resp.json()
        return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}
    except requests.RequestException as e:
        return {"error": str(e)}


def _extract_pulses(data: dict) -> list:
    """Extract pulse summary from a general endpoint response."""
    pulses = []
    for p in data.get("pulse_info", {}).get("pulses", [])[:15]:
        pulses.append({
            "id": p.get("id", ""),
            "name": p.get("name", ""),
            "description": (p.get("description", "") or "")[:300],
            "created": p.get("created", ""),
            "modified": p.get("modified", ""),
            "tags": p.get("tags", [])[:10],
            "adversary": p.get("adversary", ""),
            "targeted_countries": p.get("targeted_countries", []),
            "malware_families": p.get("malware_families", []),
            "attack_ids": p.get("attack_ids", []),
            "references": p.get("references", [])[:5],
        })
    return pulses


def lookup_ip(ip: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "AlienVault OTX API key not configured"}

    general = _safe_get(f"{OTX_BASE}/indicators/IPv4/{ip}/general", api_key)
    if "error" in general and "pulse_info" not in general:
        return general

    reputation = general.get("reputation", 0) or 0
    pulse_count = general.get("pulse_info", {}).get("count", 0)
    pulses = _extract_pulses(general)

    geo = _safe_get(f"{OTX_BASE}/indicators/IPv4/{ip}/geo", api_key)
    geo_info = {}
    if "error" not in geo:
        geo_info = {
            "country": geo.get("country_name", ""),
            "city": geo.get("city", ""),
            "asn": geo.get("asn", ""),
            "latitude": geo.get("latitude"),
            "longitude": geo.get("longitude"),
        }

    malware = _safe_get(f"{OTX_BASE}/indicators/IPv4/{ip}/malware", api_key)
    malware_samples = []
    if "error" not in malware:
        for m in malware.get("data", [])[:10]:
            malware_samples.append({
                "hash": m.get("hash", ""),
                "datetime_int": m.get("datetime_int", ""),
            })

    return {
        "ip": ip,
        "reputation": reputation,
        "pulse_count": pulse_count,
        "pulses": pulses,
        "geo": geo_info,
        "malware_samples": malware_samples,
        "sections": general.get("sections", []),
    }


def lookup_domain(domain: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "AlienVault OTX API key not configured"}

    general = _safe_get(f"{OTX_BASE}/indicators/domain/{domain}/general", api_key)
    if "error" in general and "pulse_info" not in general:
        return general

    pulse_count = general.get("pulse_info", {}).get("count", 0)
    pulses = _extract_pulses(general)

    geo = _safe_get(f"{OTX_BASE}/indicators/domain/{domain}/geo", api_key)
    geo_info = {}
    if "error" not in geo:
        geo_info = {
            "country": geo.get("country_name", ""),
            "city": geo.get("city", ""),
            "asn": geo.get("asn", ""),
        }

    malware = _safe_get(f"{OTX_BASE}/indicators/domain/{domain}/malware", api_key)
    malware_count = 0
    if "error" not in malware:
        malware_count = len(malware.get("data", []))

    return {
        "domain": domain,
        "pulse_count": pulse_count,
        "pulses": pulses,
        "geo": geo_info,
        "malware_count": malware_count,
        "whois": (general.get("whois", "") or "")[:800],
    }


def lookup_hash(file_hash: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "AlienVault OTX API key not configured"}

    general = _safe_get(f"{OTX_BASE}/indicators/file/{file_hash}/general", api_key)
    if "error" in general and "pulse_info" not in general:
        return general

    pulse_count = general.get("pulse_info", {}).get("count", 0)
    pulses = _extract_pulses(general)

    analysis = _safe_get(f"{OTX_BASE}/indicators/file/{file_hash}/analysis", api_key)
    analysis_info = {}
    if "error" not in analysis:
        aresult = analysis.get("analysis", {})
        info = aresult.get("info", {}).get("results", {})
        analysis_info = {
            "file_type": info.get("file_type", ""),
            "file_class": info.get("file_class", ""),
            "md5": info.get("md5", ""),
            "sha1": info.get("sha1", ""),
            "sha256": info.get("sha256", ""),
        }

    return {
        "hash": file_hash,
        "pulse_count": pulse_count,
        "pulses": pulses,
        "analysis": analysis_info,
    }


def lookup_url(url: str, api_key: str) -> dict:
    if not api_key:
        return {"error": "AlienVault OTX API key not configured"}

    general = _safe_get(f"{OTX_BASE}/indicators/url/{url}/general", api_key)
    if "error" in general and "pulse_info" not in general:
        return general

    pulse_count = general.get("pulse_info", {}).get("count", 0)
    pulses = _extract_pulses(general)

    return {
        "url": url,
        "pulse_count": pulse_count,
        "pulses": pulses,
        "alexa": general.get("alexa", ""),
        "whois": (general.get("whois", "") or "")[:800],
    }


def get_subscribed_pulses(api_key: str, limit: int = 20) -> dict:
    """Fetch latest pulses from subscriptions (for threat feeds)."""
    if not api_key:
        return {"error": "AlienVault OTX API key not configured"}

    data = _safe_get(f"{OTX_BASE}/pulses/subscribed?limit={limit}", api_key)
    if "error" in data and "results" not in data:
        return data

    pulses = []
    for p in data.get("results", [])[:limit]:
        indicators = []
        for ind in p.get("indicators", [])[:20]:
            indicators.append({
                "indicator": ind.get("indicator", ""),
                "type": ind.get("type", ""),
                "description": (ind.get("description", "") or "")[:200],
            })
        pulses.append({
            "id": p.get("id", ""),
            "name": p.get("name", ""),
            "description": (p.get("description", "") or "")[:400],
            "created": p.get("created", ""),
            "tags": p.get("tags", [])[:10],
            "adversary": p.get("adversary", ""),
            "targeted_countries": p.get("targeted_countries", []),
            "indicator_count": len(p.get("indicators", [])),
            "indicators": indicators,
        })

    return {"count": len(pulses), "pulses": pulses}
