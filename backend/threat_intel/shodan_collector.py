"""
Shodan API collector.
Infrastructure reconnaissance: open ports, services, vulnerabilities, geolocation.
Free tier: 100 queries/month.
"""

import requests

SHODAN_BASE = "https://api.shodan.io"
TIMEOUT = 30


def lookup_ip(ip: str, api_key: str) -> dict:
    """Full host lookup for an IP address."""
    if not api_key:
        return {"error": "Shodan API key not configured"}

    try:
        resp = requests.get(
            f"{SHODAN_BASE}/shodan/host/{ip}",
            params={"key": api_key},
            timeout=TIMEOUT,
        )
        if resp.status_code == 404:
            return {"ip": ip, "found": False, "note": "No Shodan data for this IP"}
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json()
        ports = data.get("ports", [])
        vulns = data.get("vulns", [])

        services = []
        for svc in data.get("data", [])[:20]:
            services.append({
                "port": svc.get("port"),
                "transport": svc.get("transport", "tcp"),
                "product": svc.get("product", ""),
                "version": svc.get("version", ""),
                "module": svc.get("_shodan", {}).get("module", ""),
                "banner": (svc.get("data", "") or "")[:300],
                "cpe": svc.get("cpe", []),
                "vulns": list(svc.get("vulns", {}).keys()) if isinstance(svc.get("vulns"), dict) else [],
            })

        return {
            "ip": ip,
            "found": True,
            "hostnames": data.get("hostnames", []),
            "org": data.get("org", ""),
            "isp": data.get("isp", ""),
            "asn": data.get("asn", ""),
            "os": data.get("os", ""),
            "country": data.get("country_name", ""),
            "city": data.get("city", ""),
            "latitude": data.get("latitude"),
            "longitude": data.get("longitude"),
            "ports": ports,
            "open_port_count": len(ports),
            "vulns": vulns,
            "vuln_count": len(vulns),
            "services": services,
            "last_update": data.get("last_update", ""),
            "tags": data.get("tags", []),
        }
    except requests.RequestException as e:
        return {"error": str(e)}


def lookup_domain(domain: str, api_key: str) -> dict:
    """DNS and subdomain lookup for a domain."""
    if not api_key:
        return {"error": "Shodan API key not configured"}

    try:
        resp = requests.get(
            f"{SHODAN_BASE}/dns/domain/{domain}",
            params={"key": api_key},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json()
        subdomains = data.get("subdomains", [])
        records = []
        for rec in data.get("data", [])[:30]:
            records.append({
                "subdomain": rec.get("subdomain", ""),
                "type": rec.get("type", ""),
                "value": rec.get("value", ""),
                "last_seen": rec.get("last_seen", ""),
            })

        return {
            "domain": domain,
            "subdomains": subdomains[:50],
            "subdomain_count": len(subdomains),
            "dns_records": records,
            "tags": data.get("tags", []),
        }
    except requests.RequestException as e:
        return {"error": str(e)}


def search_query(query: str, api_key: str) -> dict:
    """Run a Shodan search query (e.g., 'apache country:US')."""
    if not api_key:
        return {"error": "Shodan API key not configured"}

    try:
        resp = requests.get(
            f"{SHODAN_BASE}/shodan/host/search",
            params={"key": api_key, "query": query},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json()
        results = []
        for match in data.get("matches", [])[:20]:
            results.append({
                "ip": match.get("ip_str", ""),
                "port": match.get("port"),
                "org": match.get("org", ""),
                "hostnames": match.get("hostnames", []),
                "product": match.get("product", ""),
                "os": match.get("os", ""),
                "country": match.get("location", {}).get("country_name", ""),
            })

        return {
            "query": query,
            "total": data.get("total", 0),
            "results": results,
        }
    except requests.RequestException as e:
        return {"error": str(e)}
