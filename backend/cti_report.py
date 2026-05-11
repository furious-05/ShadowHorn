"""CTI Report Generator for ShadowHorn.

Produces structured report dicts for:
  1. Investigation-scoped reports (multiple IOCs grouped by case)
  2. Individual IOC deep-dive reports
"""

import datetime
from pymongo import MongoClient
from bson import ObjectId

_SEVERITY_MAP = {
    "critical": 4,
    "high": 3,
    "medium": 2,
    "low": 1,
    "clean": 0,
    "info": 0,
    "unknown": -1,
}


def _severity_rank(label: str) -> int:
    return _SEVERITY_MAP.get((label or "unknown").lower().strip(), -1)


def _severity_color_name(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 40:
        return "medium"
    if score >= 20:
        return "low"
    return "clean"


def _safe(val, fallback="N/A"):
    if val is None or val == "":
        return fallback
    return str(val)


# ---------------------------------------------------------------------------
# Source summary extractors
# ---------------------------------------------------------------------------

def _extract_vt_summary(vt: dict) -> dict:
    stats = vt.get("last_analysis_stats", {})
    malicious = stats.get("malicious", 0)
    total = sum(stats.get(k, 0) for k in ("malicious", "suspicious", "undetected", "harmless"))
    return {
        "source": "VirusTotal",
        "detected": malicious,
        "total_engines": total,
        "reputation": vt.get("reputation", "N/A"),
        "tags": vt.get("tags", []),
    }


def _extract_shodan_summary(sh: dict) -> dict:
    return {
        "source": "Shodan",
        "org": sh.get("org", "N/A"),
        "os": sh.get("os", "N/A"),
        "ports": sh.get("ports", []),
        "vulns": sh.get("vulns", []),
        "country": sh.get("country_name", "N/A"),
        "isp": sh.get("isp", "N/A"),
    }


def _extract_abuseipdb_summary(ab: dict) -> dict:
    data = ab.get("data", ab)
    return {
        "source": "AbuseIPDB",
        "abuse_confidence": data.get("abuseConfidenceScore", 0),
        "total_reports": data.get("totalReports", 0),
        "country": data.get("countryCode", "N/A"),
        "isp": data.get("isp", "N/A"),
        "domain": data.get("domain", "N/A"),
        "is_tor": data.get("isTor", False),
    }


def _extract_otx_summary(otx: dict) -> dict:
    pulses = otx.get("pulse_info", {}).get("pulses", [])
    return {
        "source": "AlienVault OTX",
        "pulse_count": len(pulses),
        "pulse_names": [p.get("name", "") for p in pulses[:5]],
        "tags": list(set(t for p in pulses for t in p.get("tags", [])))[:10],
    }


def _extract_abusech_summary(ab: dict) -> dict:
    threats = []
    if isinstance(ab.get("threatfox"), list):
        threats.extend(ab["threatfox"])
    elif isinstance(ab.get("threatfox"), dict) and ab["threatfox"].get("data"):
        threats.extend(ab["threatfox"]["data"] if isinstance(ab["threatfox"]["data"], list) else [])

    urlhaus_count = 0
    if isinstance(ab.get("urlhaus"), dict):
        urlhaus_count = len(ab["urlhaus"].get("urls", []))

    bazaar_count = 0
    if isinstance(ab.get("malware_bazaar"), dict):
        bazaar_count = 1 if ab["malware_bazaar"].get("sha256_hash") else 0

    return {
        "source": "abuse.ch",
        "threatfox_hits": len(threats),
        "urlhaus_urls": urlhaus_count,
        "bazaar_samples": bazaar_count,
        "malware_families": list(set(
            t.get("malware", "unknown") for t in threats if t.get("malware")
        ))[:5],
    }


def _extract_nvd_summary(nvd: dict) -> dict:
    vulns = nvd.get("vulnerabilities", [])
    return {
        "source": "NVD/CVE",
        "cve_count": len(vulns),
        "cves": [
            {
                "id": v.get("cve", {}).get("id", "N/A"),
                "description": (v.get("cve", {}).get("descriptions", [{}])[0].get("value", "")[:200]
                                if v.get("cve", {}).get("descriptions") else "N/A"),
            }
            for v in vulns[:5]
        ],
    }


def _build_source_findings(sources: dict) -> list:
    findings = []
    if sources.get("virustotal"):
        findings.append(_extract_vt_summary(sources["virustotal"]))
    if sources.get("shodan"):
        findings.append(_extract_shodan_summary(sources["shodan"]))
    if sources.get("abuseipdb"):
        findings.append(_extract_abuseipdb_summary(sources["abuseipdb"]))
    if sources.get("alienvault_otx"):
        findings.append(_extract_otx_summary(sources["alienvault_otx"]))
    if sources.get("abuse_ch"):
        findings.append(_extract_abusech_summary(sources["abuse_ch"]))
    if sources.get("nvd"):
        findings.append(_extract_nvd_summary(sources["nvd"]))
    return findings


def _auto_recommendations(ioc_type: str, severity: str, sources: dict) -> list:
    recs = []
    sev = severity.lower()

    if sev in ("critical", "high"):
        recs.append(f"URGENT: Immediately block this {ioc_type} at perimeter firewalls and EDR solutions.")
        recs.append("Conduct a forensic investigation to determine the scope of exposure.")
        recs.append("Check internal logs for any communication with this indicator in the past 90 days.")

    if sev == "medium":
        recs.append(f"Monitor traffic involving this {ioc_type} closely for the next 72 hours.")
        recs.append("Add to watchlists in your SIEM platform for automated alerting.")

    if sev in ("low", "clean"):
        recs.append("No immediate action required. Continue standard monitoring.")

    vt = sources.get("virustotal", {})
    stats = vt.get("last_analysis_stats", {})
    if stats.get("malicious", 0) > 5:
        recs.append(f"VirusTotal flagged by {stats['malicious']} engines — consider adding to your blocklist.")

    ab = sources.get("abuseipdb", {})
    data = ab.get("data", ab)
    if data.get("abuseConfidenceScore", 0) >= 75:
        recs.append("High abuse confidence on AbuseIPDB — strong indicator of malicious activity.")
    if data.get("isTor"):
        recs.append("IP is a known Tor exit node — evaluate risk based on your threat model.")

    sh = sources.get("shodan", {})
    if sh.get("vulns"):
        recs.append(f"Shodan detected {len(sh['vulns'])} known vulnerabilities on this host.")

    return recs


def _auto_recommendations_investigation(severity_dist: dict, type_dist: dict, top_threats: list) -> list:
    recs = []
    critical = severity_dist.get("critical", 0)
    high = severity_dist.get("high", 0)

    if critical > 0:
        recs.append(f"CRITICAL: {critical} indicator(s) rated critical — initiate incident response procedures immediately.")
    if high > 0:
        recs.append(f"{high} high-severity indicator(s) detected — prioritize blocking and forensic review.")
    if critical + high == 0:
        recs.append("No critical or high-severity indicators found. Maintain standard monitoring posture.")

    if type_dist.get("ip", 0) > 3:
        recs.append("Multiple suspicious IPs identified — consider network segmentation review.")
    if type_dist.get("hash", 0) > 0:
        recs.append("Malicious file hashes detected — run endpoint scans with updated signatures.")
    if type_dist.get("domain", 0) > 0 or type_dist.get("url", 0) > 0:
        recs.append("Suspicious domains/URLs found — update DNS blocklists and web proxy rules.")

    if top_threats:
        names = [t.get("ioc", "?") for t in top_threats[:3]]
        recs.append(f"Top threats to prioritize: {', '.join(names)}")

    recs.append("Generate a follow-up report in 7 days to track remediation progress.")
    return recs


# ---------------------------------------------------------------------------
# Main report generators
# ---------------------------------------------------------------------------

def generate_investigation_report(investigation_id: str, mongo_uri: str) -> dict:
    client = MongoClient(mongo_uri)
    db = client["data_db"]
    inv_col = db["investigations"]
    ti_col = db["threat_intel"]

    inv = inv_col.find_one({"_id": ObjectId(investigation_id)})
    if not inv:
        return {"error": "Investigation not found"}

    iocs = list(ti_col.find({"investigation_id": investigation_id}))
    total_iocs = len(iocs)

    severity_dist = {"critical": 0, "high": 0, "medium": 0, "low": 0, "clean": 0}
    type_dist = {}
    scores = []
    top_threats = []
    detailed_findings = []
    sources_seen = set()

    for doc in iocs:
        ts = doc.get("threat_score", {})
        score = ts.get("score", 0) if isinstance(ts, dict) else 0
        sev = _severity_color_name(score)
        severity_dist[sev] = severity_dist.get(sev, 0) + 1
        scores.append(score)

        ioc_type = (doc.get("ioc_type") or "unknown").lower()
        type_dist[ioc_type] = type_dist.get(ioc_type, 0) + 1

        sources = doc.get("sources", {})
        for src_name in sources:
            sources_seen.add(src_name)

        top_threats.append({
            "ioc": doc.get("ioc", "?"),
            "ioc_type": ioc_type,
            "score": score,
            "severity": sev,
        })

        findings = _build_source_findings(sources)
        detailed_findings.append({
            "ioc": doc.get("ioc", "?"),
            "ioc_type": ioc_type,
            "score": score,
            "severity": sev,
            "source_findings": findings,
        })

    top_threats.sort(key=lambda x: x["score"], reverse=True)
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0
    max_score = max(scores) if scores else 0

    recs = _auto_recommendations_investigation(severity_dist, type_dist, top_threats)

    executive_summary = (
        f"Investigation \"{inv.get('name', 'Untitled')}\" contains {total_iocs} indicator(s) "
        f"of compromise. The average threat score is {avg_score}/100 with a maximum of "
        f"{max_score}/100. "
    )
    if severity_dist.get("critical", 0):
        executive_summary += f"{severity_dist['critical']} critical indicator(s) require immediate attention. "
    if severity_dist.get("high", 0):
        executive_summary += f"{severity_dist['high']} high-severity indicator(s) detected. "
    executive_summary += f"Data was gathered from {len(sources_seen)} unique intelligence source(s)."

    return {
        "type": "investigation",
        "meta": {
            "investigation_id": investigation_id,
            "investigation_name": inv.get("name", "Untitled"),
            "description": inv.get("description", ""),
            "tags": inv.get("tags", []),
            "status": inv.get("status", "active"),
            "generated_at": datetime.datetime.utcnow().isoformat(),
        },
        "executive_summary": executive_summary,
        "stats": {
            "total_iocs": total_iocs,
            "avg_score": avg_score,
            "max_score": max_score,
            "severity_distribution": severity_dist,
            "type_distribution": type_dist,
            "sources_used": sorted(sources_seen),
        },
        "top_threats": top_threats[:10],
        "detailed_findings": detailed_findings,
        "recommendations": recs,
    }


def generate_ioc_report(ioc_value: str, mongo_uri: str) -> dict:
    client = MongoClient(mongo_uri)
    db = client["data_db"]
    ti_col = db["threat_intel"]

    doc = ti_col.find_one({"ioc": ioc_value})
    if not doc:
        return {"error": f"No threat intelligence data found for IOC: {ioc_value}"}

    ts = doc.get("threat_score", {})
    score = ts.get("score", 0) if isinstance(ts, dict) else 0
    severity = _severity_color_name(score)
    ioc_type = (doc.get("ioc_type") or "unknown").lower()

    sources = doc.get("sources", {})
    source_findings = _build_source_findings(sources)

    score_breakdown = {}
    if isinstance(ts, dict):
        for k, v in ts.items():
            if k != "score":
                score_breakdown[k] = v

    recs = _auto_recommendations(ioc_type, severity, sources)

    key_findings = []
    for f in source_findings:
        src = f.get("source", "")
        if src == "VirusTotal" and f.get("detected", 0) > 0:
            key_findings.append(f"VirusTotal: {f['detected']}/{f['total_engines']} engines flagged as malicious")
        if src == "AbuseIPDB" and f.get("abuse_confidence", 0) > 0:
            key_findings.append(f"AbuseIPDB: {f['abuse_confidence']}% abuse confidence ({f['total_reports']} reports)")
        if src == "AlienVault OTX" and f.get("pulse_count", 0) > 0:
            key_findings.append(f"AlienVault OTX: Referenced in {f['pulse_count']} threat intelligence pulse(s)")
        if src == "Shodan":
            ports = f.get("ports", [])
            vulns = f.get("vulns", [])
            if ports:
                key_findings.append(f"Shodan: {len(ports)} open port(s) detected")
            if vulns:
                key_findings.append(f"Shodan: {len(vulns)} known vulnerability/ies")
        if src == "abuse.ch":
            if f.get("threatfox_hits", 0):
                key_findings.append(f"ThreatFox: {f['threatfox_hits']} threat(s) linked")
            if f.get("urlhaus_urls", 0):
                key_findings.append(f"URLhaus: {f['urlhaus_urls']} malicious URL(s)")
        if src == "NVD/CVE" and f.get("cve_count", 0):
            key_findings.append(f"NVD: {f['cve_count']} related CVE(s)")

    if not key_findings:
        key_findings.append("No significant findings across queried intelligence sources.")

    executive_summary = (
        f"IOC \"{ioc_value}\" (type: {ioc_type}) has an overall threat score of {score}/100, "
        f"classified as {severity.upper()} severity. "
    )
    if severity in ("critical", "high"):
        executive_summary += "This indicator poses a significant risk and warrants immediate investigation. "
    elif severity == "medium":
        executive_summary += "This indicator shows moderate risk and should be monitored. "
    else:
        executive_summary += "This indicator shows low risk based on available intelligence. "
    executive_summary += f"Analysis drew from {len(source_findings)} intelligence source(s)."

    return {
        "type": "ioc",
        "meta": {
            "ioc": ioc_value,
            "ioc_type": ioc_type,
            "generated_at": datetime.datetime.utcnow().isoformat(),
        },
        "executive_summary": executive_summary,
        "threat_score": score,
        "severity": severity,
        "score_breakdown": score_breakdown,
        "key_findings": key_findings,
        "source_findings": source_findings,
        "recommendations": recs,
    }
