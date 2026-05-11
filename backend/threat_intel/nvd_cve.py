"""
NVD (National Vulnerability Database) CVE API 2.0 collector.
Vulnerability lookup by CVE ID or keyword search.
Fully free, no API key required (rate limited to ~5 req/30s without key).
"""

import requests

NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0"
TIMEOUT = 30


def _parse_cve(item: dict) -> dict:
    """Parse a single CVE item from the NVD response."""
    cve = item.get("cve", {})
    cve_id = cve.get("id", "")

    descriptions = []
    for d in cve.get("descriptions", []):
        if d.get("lang") == "en":
            descriptions.append(d.get("value", ""))

    # CVSS v3.1 metrics
    cvss31 = {}
    for metric in cve.get("metrics", {}).get("cvssMetricV31", []):
        cvss_data = metric.get("cvssData", {})
        cvss31 = {
            "base_score": cvss_data.get("baseScore", 0),
            "base_severity": cvss_data.get("baseSeverity", ""),
            "vector_string": cvss_data.get("vectorString", ""),
            "attack_vector": cvss_data.get("attackVector", ""),
            "attack_complexity": cvss_data.get("attackComplexity", ""),
            "privileges_required": cvss_data.get("privilegesRequired", ""),
            "user_interaction": cvss_data.get("userInteraction", ""),
            "impact_score": metric.get("impactScore", 0),
            "exploitability_score": metric.get("exploitabilityScore", 0),
        }
        break

    # CVSS v2 fallback
    cvss2 = {}
    if not cvss31:
        for metric in cve.get("metrics", {}).get("cvssMetricV2", []):
            cvss_data = metric.get("cvssData", {})
            cvss2 = {
                "base_score": cvss_data.get("baseScore", 0),
                "base_severity": metric.get("baseSeverity", ""),
                "vector_string": cvss_data.get("vectorString", ""),
                "impact_score": metric.get("impactScore", 0),
                "exploitability_score": metric.get("exploitabilityScore", 0),
            }
            break

    references = []
    for ref in cve.get("references", [])[:10]:
        references.append({
            "url": ref.get("url", ""),
            "source": ref.get("source", ""),
            "tags": ref.get("tags", []),
        })

    weaknesses = []
    for w in cve.get("weaknesses", []):
        for desc in w.get("description", []):
            if desc.get("lang") == "en":
                weaknesses.append(desc.get("value", ""))

    # CPE (affected products)
    affected = []
    for config in cve.get("configurations", []):
        for node in config.get("nodes", []):
            for match in node.get("cpeMatch", [])[:10]:
                if match.get("vulnerable"):
                    criteria = match.get("criteria", "")
                    parts = criteria.split(":")
                    if len(parts) >= 5:
                        affected.append({
                            "vendor": parts[3] if len(parts) > 3 else "",
                            "product": parts[4] if len(parts) > 4 else "",
                            "version_start": match.get("versionStartIncluding", ""),
                            "version_end": match.get("versionEndIncluding", match.get("versionEndExcluding", "")),
                        })

    return {
        "cve_id": cve_id,
        "description": descriptions[0] if descriptions else "",
        "published": cve.get("published", ""),
        "last_modified": cve.get("lastModified", ""),
        "status": cve.get("vulnStatus", ""),
        "cvss_v31": cvss31,
        "cvss_v2": cvss2,
        "severity": cvss31.get("base_severity", cvss2.get("base_severity", "UNKNOWN")),
        "score": cvss31.get("base_score", cvss2.get("base_score", 0)),
        "references": references,
        "weaknesses": weaknesses,
        "affected_products": affected[:15],
    }


def lookup_cve(cve_id: str) -> dict:
    """Look up a specific CVE by its ID (e.g., CVE-2024-1234)."""
    cve_id = cve_id.strip().upper()
    try:
        resp = requests.get(
            NVD_BASE,
            params={"cveId": cve_id},
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json()
        vulns = data.get("vulnerabilities", [])
        if not vulns:
            return {"cve_id": cve_id, "found": False}

        result = _parse_cve(vulns[0])
        result["found"] = True
        return result
    except requests.RequestException as e:
        return {"error": str(e)}


def search_cves(keyword: str, limit: int = 20) -> dict:
    """Search CVEs by keyword (product name, description text, etc.)."""
    try:
        resp = requests.get(
            NVD_BASE,
            params={
                "keywordSearch": keyword,
                "resultsPerPage": min(limit, 50),
            },
            timeout=TIMEOUT,
        )
        if resp.status_code != 200:
            return {"error": f"HTTP {resp.status_code}", "detail": resp.text[:500]}

        data = resp.json()
        total = data.get("totalResults", 0)
        results = []
        for item in data.get("vulnerabilities", [])[:limit]:
            results.append(_parse_cve(item))

        return {
            "keyword": keyword,
            "total_results": total,
            "returned": len(results),
            "results": results,
        }
    except requests.RequestException as e:
        return {"error": str(e)}
