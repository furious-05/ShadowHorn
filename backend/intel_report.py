"""AI-powered intelligence report generation for ShadowHorn Reports page.

This module is intentionally separate from the correlation engine so that the
responsibility is clear:

- openai_correlation.py  -> builds structured correlation JSON (local rule-based + LLM)
- intel_report.py        -> takes an existing correlation document and produces
                            narrative intelligence briefs for different teams.

The intelligence reports prefer the local FLAN model first for privacy and
offline use, and only fall back to the remote OpenRouter/DeepSeek model when
needed.
"""

import json
from typing import Optional, Dict, Any

from openai import APIError, OpenAI

from openai_correlation import (
    detect_backends,
    get_openrouter_key_from_db,
    _call_local_flan,
    MODEL,
    OPENAI_BASE_URL,
)


def _dept_instruction(department: str) -> str:
    """Return high-level instructions for the requested intelligence focus.

    "combined" (or aliases) means a single holistic brief that covers all four
    report perspectives: OSINT exposure, Threat Intel, Offensive Recon and
    Malware/RE. This is used by the Intelligence Reports page when generating
    the AI Intelligence Brief for an identifier.
    """

    key = (department or "osint").strip().lower()

    # Combined / holistic brief over all four report tracks
    if key in {"combined", "all", "summary", "intel", "intelligence"}:
        return (
            "Write a single holistic cyber-intelligence brief for this profile. "
            "Cover four perspectives in one flowing narrative: "
            "(1) OSINT exposure and public footprint, "
            "(2) Threat intelligence relevance and key indicators, "
            "(3) offensive security / recon value for attackers, and "
            "(4) any malware or stealer ecosystem relevance. "
            "Tie these together into a coherent story and finish with 3-5 clear next actions."
        )
    if key in {"osint", "overview"}:
        return (
            "Write an OSINT-focused intelligence brief for this profile. "
            "Explain overall exposure, key public identifiers, notable repositories and social posts, "
            "and whether any breach/compromise evidence materially increases risk."
        )
    if key in {"threat-intel", "threat intel", "ti"}:
        return (
            "Write a threat-intelligence brief for a SOC audience. "
            "Highlight indicators of compromise (emails, usernames, URLs, repositories), likely TTPs, "
            "and how this identity could intersect with ongoing or future campaigns."
        )
    if key in {"pentesting", "offensive", "recon"}:
        return (
            "Write an offensive security / red-team recon brief. "
            "Describe what an attacker can learn from this profile, including attack surface, "
            "potential phishing angles, and technical footprint."
        )
    if key in {"malware-rev", "malware", "reverse", "re"}:
        return (
            "Write a malware and reverse-engineering oriented brief. "
            "Discuss any relevance to stealers, loaders or tooling, and how this identity's assets "
            "could be abused in malware ecosystems."
        )
    return (
        "Write a concise cyber-intelligence brief suitable for senior stakeholders. "
        "Summarize exposure, risk and recommended next actions."
    )


def generate_intel_report(
    identifier: str,
    department: str = "osint",
    backend: Optional[str] = None,
    mongo_uri: str = "mongodb://localhost:27017/",
) -> Dict[str, Any]:
    """Generate a narrative intelligence report for a correlated profile.

    This does NOT perform correlation again. It expects an existing correlation document in
    the `data_correlation.correlations` collection and uses that structured JSON as input.

    Backend strategy for intelligence reporting prefers the local FLAN backend first,
    then OpenRouter/DeepSeek as a fallback.
    """
    identifier = (identifier or "").strip()
    if not identifier:
        return {"error": "Missing identifier for intelligence report generation"}

    try:
        from pymongo import MongoClient

        client = MongoClient(mongo_uri)
        corr_db = client.get_database("data_correlation")
        corr_coll = corr_db.get_collection("correlations")
        doc = corr_coll.find_one({"identifier": identifier})
    except Exception as e:
        return {"error": f"Failed to load correlation document: {e}"}

    if not doc or not isinstance(doc.get("result"), dict):
        return {"error": "No existing correlation result found for this identifier"}

    profile = doc["result"]

    # Build department-specific instructions
    dept_instr = _dept_instruction(department)
    prompt = (
        "You are the ShadowHorn reporting assistant. "
        "Given the following correlated OSINT profile JSON, write a single cohesive prose briefing. "
        "Use 8-14 sentences, avoid bullet points and markdown, and answer in English only. "
        + dept_instr
        + "\n\nCorrelation JSON profile:\n" + json.dumps(profile, indent=2)
    )

    status = detect_backends(mongo_uri=mongo_uri)

    # Decide backend: prefer explicit hint if valid, else local_flan, else openrouter.
    chosen: Optional[str] = None
    if backend and backend != "auto" and status.get(backend, {}).get("configured"):
        chosen = backend
    elif status.get("local_flan", {}).get("configured"):
        chosen = "local_flan"
    elif status.get("openrouter", {}).get("configured"):
        chosen = "openrouter"

    if not chosen:
        return {"error": "No intelligence-report backend is configured (local FLAN or OpenRouter)"}

    # Local FLAN path
    if chosen == "local_flan":
        try:
            text = _call_local_flan(prompt, max_new_tokens=768)
            return {
                "narrative": (text or "").strip(),
                "backend_used": "local_flan",
            }
        except Exception as e:
            return {
                "error": f"Local FLAN error while generating intelligence report: {e}",
                "backend_used": "local_flan",
            }

    # OpenRouter / DeepSeek path
    api_key = get_openrouter_key_from_db(mongo_uri=mongo_uri)
    if not api_key:
        return {
            "error": "OpenRouter/OpenAI API key not found in environment or database (api_keys.openRouter)",
            "backend_used": "openrouter",
        }

    client = OpenAI(base_url=OPENAI_BASE_URL, api_key=api_key)
    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
        try:
            raw_content = resp.choices[0].message.content
        except Exception:
            raw_content = str(resp)

        narrative_text = (raw_content or "").strip()
        return {"narrative": narrative_text, "backend_used": "openrouter"}
    except APIError as e:
        return {
            "error": f"OpenRouter API error while generating intelligence report: {e}",
            "backend_used": "openrouter",
        }
    except Exception as e:
        return {
            "error": f"Provider error while generating intelligence report: {e}",
            "backend_used": "openrouter",
        }
