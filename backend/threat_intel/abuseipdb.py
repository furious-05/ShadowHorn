"""
AbuseIPDB API v2 collector.
IP reputation and abuse reports from a global community.
Free tier: 1000 checks/day.
"""

import requests

ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"
TIMEOUT = 30


def lookup_ip(ip: str, api_key: str, max_age_days: int = 90) -> dict:
    """Check an IP address against AbuseIPDB."""
    if not api_key:
        return {"error": "AbuseIPDB API key not configured"}

    try:
        resp = requests.get(
            f"{ABUSEIPDB_BASE}/check",
            headers={
                "Key": api_key,
                "Accept": "application/json",
            },
            params={
                "ipAddress": ip,
                "maxAgeInDays": max_age_days,
                "verbose": "",
            },
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json().get("data", {})

        reports = []
        for r in data.get("reports", [])[:15]:
            reports.append({
                "reported_at": r.get("reportedAt", ""),
                "comment": (r.get("comment", "") or "")[:200],
                "categories": r.get("categories", []),
                "reporter_country": r.get("reporterCountryCode", ""),
            })

        return {
            "ip": data.get("ipAddress", ip),
            "is_public": data.get("isPublic", True),
            "abuse_confidence_score": data.get("abuseConfidenceScore", 0),
            "country": data.get("countryCode", ""),
            "isp": data.get("isp", ""),
            "domain": data.get("domain", ""),
            "usage_type": data.get("usageType", ""),
            "is_tor": data.get("isTor", False),
            "is_whitelisted": data.get("isWhitelisted", False),
            "total_reports": data.get("totalReports", 0),
            "num_distinct_users": data.get("numDistinctUsers", 0),
            "last_reported_at": data.get("lastReportedAt", ""),
            "reports": reports,
        }
    except requests.RequestException as e:
        return {"error": str(e)}


def check_cidr(network: str, api_key: str, max_age_days: int = 30) -> dict:
    """Check a CIDR network block for reported IPs."""
    if not api_key:
        return {"error": "AbuseIPDB API key not configured"}

    try:
        resp = requests.get(
            f"{ABUSEIPDB_BASE}/check-block",
            headers={
                "Key": api_key,
                "Accept": "application/json",
            },
            params={
                "network": network,
                "maxAgeInDays": max_age_days,
            },
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json().get("data", {})
        reported = data.get("reportedAddress", [])

        return {
            "network": network,
            "network_address": data.get("networkAddress", ""),
            "netmask": data.get("netmask", ""),
            "num_reported": len(reported),
            "reported_addresses": [
                {
                    "ip": addr.get("ipAddress", ""),
                    "abuse_confidence_score": addr.get("abuseConfidenceScore", 0),
                    "total_reports": addr.get("numReports", 0),
                    "country": addr.get("countryCode", ""),
                }
                for addr in reported[:20]
            ],
        }
    except requests.RequestException as e:
        return {"error": str(e)}
