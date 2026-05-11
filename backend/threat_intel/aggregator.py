"""
Threat Intelligence Aggregator.
Auto-detects IOC type, routes to appropriate collectors, merges results,
and computes a unified threat score (0-100).
"""

import re
import asyncio
from concurrent.futures import ThreadPoolExecutor

from . import virustotal
from . import shodan_collector
from . import abuseipdb
from . import alienvault_otx
from . import abusech
from . import nvd_cve

# ---------------------------------------------------------------------------
# IOC Type Detection
# ---------------------------------------------------------------------------

IPV4_RE = re.compile(
    r"^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$"
)
IPV6_RE = re.compile(r"^([0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}$")
MD5_RE = re.compile(r"^[a-fA-F0-9]{32}$")
SHA1_RE = re.compile(r"^[a-fA-F0-9]{40}$")
SHA256_RE = re.compile(r"^[a-fA-F0-9]{64}$")
CVE_RE = re.compile(r"^CVE-\d{4}-\d{4,}$", re.IGNORECASE)
URL_RE = re.compile(r"^https?://", re.IGNORECASE)
DOMAIN_RE = re.compile(
    r"^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}$"
)


def detect_ioc_type(value: str) -> str:
    """Detect the IOC type from user input.
    Returns one of: ip, domain, url, hash, cve, unknown
    """
    value = value.strip()
    if not value:
        return "unknown"

    if CVE_RE.match(value):
        return "cve"
    if URL_RE.match(value):
        return "url"
    if IPV4_RE.match(value) or IPV6_RE.match(value):
        return "ip"
    if SHA256_RE.match(value) or SHA1_RE.match(value) or MD5_RE.match(value):
        return "hash"
    if DOMAIN_RE.match(value):
        return "domain"

    return "unknown"


# ---------------------------------------------------------------------------
# Per-type routing
# ---------------------------------------------------------------------------

def _lookup_ip(ip: str, keys: dict) -> dict:
    """Query all IP-relevant sources in parallel."""
    results = {}

    def vt():
        results["virustotal"] = virustotal.lookup_ip(ip, keys.get("virusTotal", ""))

    def sh():
        results["shodan"] = shodan_collector.lookup_ip(ip, keys.get("shodan", ""))

    def ab():
        results["abuseipdb"] = abuseipdb.lookup_ip(ip, keys.get("abuseIPDB", ""))

    def otx():
        results["alienvault_otx"] = alienvault_otx.lookup_ip(ip, keys.get("alienVaultOTX", ""))

    def tf():
        results["threatfox"] = abusech.threatfox_search_ioc(ip)

    def uh():
        results["urlhaus"] = abusech.urlhaus_lookup_host(ip)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fn) for fn in [vt, sh, ab, otx, tf, uh]]
        for f in futures:
            f.result()

    return results


def _lookup_domain(domain: str, keys: dict) -> dict:
    results = {}

    def vt():
        results["virustotal"] = virustotal.lookup_domain(domain, keys.get("virusTotal", ""))

    def sh():
        results["shodan"] = shodan_collector.lookup_domain(domain, keys.get("shodan", ""))

    def otx():
        results["alienvault_otx"] = alienvault_otx.lookup_domain(domain, keys.get("alienVaultOTX", ""))

    def tf():
        results["threatfox"] = abusech.threatfox_search_ioc(domain)

    def uh():
        results["urlhaus"] = abusech.urlhaus_lookup_host(domain)

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(fn) for fn in [vt, sh, otx, tf, uh]]
        for f in futures:
            f.result()

    return results


def _lookup_url(url: str, keys: dict) -> dict:
    results = {}

    def vt():
        results["virustotal"] = virustotal.lookup_url(url, keys.get("virusTotal", ""))

    def otx():
        results["alienvault_otx"] = alienvault_otx.lookup_url(url, keys.get("alienVaultOTX", ""))

    def tf():
        results["threatfox"] = abusech.threatfox_search_ioc(url)

    def uh():
        results["urlhaus"] = abusech.urlhaus_lookup_url(url)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fn) for fn in [vt, otx, tf, uh]]
        for f in futures:
            f.result()

    return results


def _lookup_hash(file_hash: str, keys: dict) -> dict:
    results = {}

    def vt():
        results["virustotal"] = virustotal.lookup_hash(file_hash, keys.get("virusTotal", ""))

    def otx():
        results["alienvault_otx"] = alienvault_otx.lookup_hash(file_hash, keys.get("alienVaultOTX", ""))

    def tf():
        results["threatfox"] = abusech.threatfox_search_ioc(file_hash)

    def mb():
        results["malwarebazaar"] = abusech.malwarebazaar_lookup_hash(file_hash)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(fn) for fn in [vt, otx, tf, mb]]
        for f in futures:
            f.result()

    return results


def _lookup_cve(cve_id: str, _keys: dict) -> dict:
    return {"nvd": nvd_cve.lookup_cve(cve_id)}


# ---------------------------------------------------------------------------
# Threat Score Computation (0–100)
# ---------------------------------------------------------------------------

def _compute_threat_score(ioc_type: str, sources: dict) -> dict:
    """Compute a unified 0-100 threat score from all source results.
    Returns {"score": int, "severity": str, "breakdown": dict}
    """
    breakdown = {}
    scores = []

    # VirusTotal (weight: 35)
    vt = sources.get("virustotal", {})
    if vt and not vt.get("error"):
        malicious = vt.get("malicious", 0)
        total = vt.get("total_engines", 1) or 1
        ratio = malicious / total
        vt_score = min(ratio * 100 * 2.5, 100)
        if vt.get("suspicious", 0) > 0:
            vt_score = min(vt_score + 10, 100)
        breakdown["virustotal"] = round(vt_score)
        scores.append(("virustotal", vt_score, 35))

    # AbuseIPDB (weight: 25)
    abuse = sources.get("abuseipdb", {})
    if abuse and not abuse.get("error"):
        confidence = abuse.get("abuse_confidence_score", 0)
        breakdown["abuseipdb"] = confidence
        scores.append(("abuseipdb", confidence, 25))

    # Shodan (weight: 15) — based on vuln count and open ports
    shodan = sources.get("shodan", {})
    if shodan and not shodan.get("error") and shodan.get("found"):
        vuln_count = shodan.get("vuln_count", 0)
        port_count = shodan.get("open_port_count", 0)
        shodan_score = min(vuln_count * 15 + port_count * 2, 100)
        breakdown["shodan"] = round(shodan_score)
        scores.append(("shodan", shodan_score, 15))

    # AlienVault OTX (weight: 15) — based on pulse count
    otx = sources.get("alienvault_otx", {})
    if otx and not otx.get("error"):
        pulse_count = otx.get("pulse_count", 0)
        otx_score = min(pulse_count * 8, 100)
        breakdown["alienvault_otx"] = round(otx_score)
        scores.append(("alienvault_otx", otx_score, 15))

    # abuse.ch sources (weight: 10) — binary: found in threat feeds or not
    abusech_score = 0
    tf = sources.get("threatfox", {})
    if tf and tf.get("found"):
        abusech_score = max(abusech_score, 80)
    uh = sources.get("urlhaus", {})
    if uh and uh.get("found"):
        url_count = uh.get("url_count", 0) if isinstance(uh.get("url_count"), int) else 0
        abusech_score = max(abusech_score, min(60 + url_count * 5, 100))
    mb = sources.get("malwarebazaar", {})
    if mb and mb.get("found"):
        abusech_score = max(abusech_score, 90)
    if abusech_score > 0:
        breakdown["abusech"] = round(abusech_score)
        scores.append(("abusech", abusech_score, 10))

    # NVD/CVE score mapping
    nvd = sources.get("nvd", {})
    if nvd and not nvd.get("error") and nvd.get("found"):
        cvss_score = nvd.get("score", 0)
        nvd_mapped = cvss_score * 10
        breakdown["nvd"] = round(nvd_mapped)
        scores.append(("nvd", nvd_mapped, 100))

    # Weighted average
    if not scores:
        return {"score": 0, "severity": "unknown", "breakdown": breakdown}

    total_weight = sum(w for _, _, w in scores)
    weighted_sum = sum(s * w for _, s, w in scores)
    final_score = round(weighted_sum / total_weight) if total_weight else 0
    final_score = max(0, min(100, final_score))

    if final_score >= 80:
        severity = "critical"
    elif final_score >= 60:
        severity = "high"
    elif final_score >= 40:
        severity = "medium"
    elif final_score >= 20:
        severity = "low"
    else:
        severity = "clean"

    return {"score": final_score, "severity": severity, "breakdown": breakdown}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def lookup_ioc(value: str, keys: dict) -> dict:
    """Universal IOC lookup. Auto-detects type, queries relevant sources,
    computes threat score.

    Args:
        value: The IOC string (IP, domain, hash, URL, or CVE ID)
        keys: Dict of API keys from settings

    Returns:
        {
            "ioc": str,
            "ioc_type": str,
            "sources": { source_name: result_dict, ... },
            "threat_score": { "score": int, "severity": str, "breakdown": dict },
        }
    """
    value = value.strip()
    ioc_type = detect_ioc_type(value)

    if ioc_type == "unknown":
        return {
            "ioc": value,
            "ioc_type": "unknown",
            "error": "Could not determine IOC type. Supported: IPv4/IPv6 address, domain, URL, file hash (MD5/SHA1/SHA256), CVE ID.",
        }

    route = {
        "ip": _lookup_ip,
        "domain": _lookup_domain,
        "url": _lookup_url,
        "hash": _lookup_hash,
        "cve": _lookup_cve,
    }

    sources = route[ioc_type](value, keys)
    threat_score = _compute_threat_score(ioc_type, sources)

    return {
        "ioc": value,
        "ioc_type": ioc_type,
        "sources": sources,
        "threat_score": threat_score,
    }


# ---------------------------------------------------------------------------
# Threat Feeds (for /api/threat-intel/feeds)
# ---------------------------------------------------------------------------

def get_threat_feeds(keys: dict, limit: int = 20) -> dict:
    """Aggregate recent threat intelligence from multiple feed sources."""
    feeds = {}

    # ThreatFox recent IOCs
    try:
        feeds["threatfox"] = abusech.threatfox_recent(days=1, limit=limit)
    except Exception as e:
        feeds["threatfox"] = {"error": str(e)}

    # MalwareBazaar recent samples
    try:
        feeds["malwarebazaar"] = abusech.malwarebazaar_recent(limit=limit)
    except Exception as e:
        feeds["malwarebazaar"] = {"error": str(e)}

    # OTX subscribed pulses
    otx_key = keys.get("alienVaultOTX", "")
    if otx_key:
        try:
            feeds["alienvault_otx"] = alienvault_otx.get_subscribed_pulses(otx_key, limit=limit)
        except Exception as e:
            feeds["alienvault_otx"] = {"error": str(e)}

    return feeds
