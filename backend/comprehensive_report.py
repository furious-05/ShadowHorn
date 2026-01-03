"""Comprehensive OSINT Intelligence Report Generation.

This module generates a single, complete, highly-detailed intelligence report
that combines all data from correlation into one powerful, actionable document.
"""

import json
from typing import Optional, Dict, Any
from datetime import datetime
from pymongo import MongoClient


def generate_comprehensive_report(
    identifier: str,
    mongo_uri: str = "mongodb://localhost:27017/",
) -> Dict[str, Any]:
    """Generate a single comprehensive intelligence report for a correlated profile."""
    identifier = (identifier or "").strip()
    if not identifier:
        return {"error": "Missing identifier for report generation"}

    try:
        client = MongoClient(mongo_uri)
        corr_db = client.get_database("data_correlation")
        corr_coll = corr_db.get_collection("correlations")
        doc = corr_coll.find_one({"identifier": identifier})
    except Exception as e:
        return {"error": f"Failed to load correlation document: {e}"}

    if not doc or not isinstance(doc.get("result"), dict):
        return {"error": "No existing correlation result found for this identifier"}

    profile = doc["result"]
    collected_at = doc.get("collected_at", "")
    mode = doc.get("mode", "")

    # Extract base metadata from structured correlation profile
    name = profile.get("name") or identifier
    location = profile.get("primary_location") or "Unknown"
    compromised = profile.get("compromised", False)
    profile_type = profile.get("profile_type") or "Unknown"
    about = profile.get("about") or profile.get("bio") or "No profile description available"
    
    # Get all platforms from usernames object
    usernames_obj = profile.get("usernames", {})
    platforms = []
    if isinstance(usernames_obj, dict):
        platforms = list(usernames_obj.keys())
    
    # Build comprehensive report structure
    report = {
        "meta": {
            "identifier": identifier,
            "name": name,
            "location": location,
            "generated_at": datetime.utcnow().isoformat(),
            "compromised": compromised,
            "sources": platforms,
            "type": "comprehensive",
            "collection_mode": mode,
            "profile_type": profile_type,
            "about": about,
        },
        "sections": [],
    }

    # 1. EXECUTIVE SUMMARY
    counts = compute_counts(profile)
    risk = derive_risk(profile, counts)
    
    report["sections"].append({
        "title": "Executive Summary",
        "items": [
            {"label": "Assessment", "value": f"Comprehensive intelligence profile for {name} ({profile_type}) indicating {risk['level'].upper()}-level exposure across {len(platforms)} platform(s)."},
            {"label": "Risk Level", "value": risk['level'].upper()},
            {"label": "Risk Factors", "value": risk['reason'] or "Minimal risk indicators identified"},
            {"label": "Compromise Status", "value": "⚠️ COMPROMISED" if compromised else "✓ SECURE"},
            {"label": "Location", "value": location},
            {"label": "Data Sources", "value": ", ".join(platforms) if platforms else "Unknown"},
            {"label": "Collection Mode", "value": mode or "standard"},
        ]
    })

    # 1b. SUBJECT PROFILE SNAPSHOT
    report["sections"].append({
        "title": "Subject Profile",
        "items": [
            {"label": "Name", "value": name},
            {"label": "Profile Type", "value": profile_type},
            {"label": "About", "value": about},
            {"label": "Primary Location", "value": location},
            {"label": "Primary Identifiers", "value": ", ".join(extract_usernames(profile)) or "None"},
            {"label": "Status", "value": "Compromised" if compromised else "Not Compromised"},
        ],
    })

    # 1c. CORRELATION SUMMARY (model-level)
    corr_summary = profile.get("summary")
    if isinstance(corr_summary, str) and corr_summary.strip():
        report["sections"].append({
            "title": "Correlation Summary",
            "items": [
                {"label": "Model Summary", "value": corr_summary},
            ],
        })

    # 2. DIGITAL IDENTIFIERS & FOOTPRINT
    usernames_list = extract_usernames(profile)
    report["sections"].append({
        "title": "Digital Identifiers & Footprint",
        "items": [
            {"label": "Primary Identifiers", "value": format_list(usernames_list) or "None found"},
            {"label": "Email Addresses", "value": format_list(profile.get("emails", [])) or "None collected"},
            {"label": "Repository Count", "value": str(counts['repos'])},
            {"label": "Total Stars", "value": str(counts['total_stars'])},
            {"label": "Online Presence", "value": footprint_summary(platforms)},
            {"label": "Account Timeline", "value": format_timelines(profile.get("key_timelines", []))},
        ]
    })

    # 3. PLATFORM PRESENCE & ACTIVITY
    platform_items = build_platform_items(profile)
    if platform_items:
        report["sections"].append({
            "title": "Platform Presence & Activity",
            "items": platform_items
        })

    # 4. REPOSITORIES & CODE ACTIVITY
    repos = profile.get("repositories", [])
    if isinstance(repos, list) and repos:
        repo_items = []
        for repo in repos[:5]:  # Top 5 repos
            if isinstance(repo, dict):
                repo_items.append({
                    "label": repo.get("name", "Unknown"),
                    "value": f"⭐ {repo.get('stars', 0)} | 🔄 {repo.get('forks', 0)} | {repo.get('description', 'No description')[:60]}"
                })
        if repo_items:
            report["sections"].append({
                "title": "Top Repositories",
                "items": repo_items
            })

    # 5. RELATIONSHIP INTELLIGENCE
    rel_graph = profile.get("relationship_graph", [])
    if isinstance(rel_graph, list) and rel_graph:
        followers = [r for r in rel_graph if isinstance(r, dict) and r.get("type") == "follower"]
        following = [r for r in rel_graph if isinstance(r, dict) and r.get("type") == "following"]
        
        rel_items = [
            {"label": "Total Connections", "value": str(len(rel_graph))},
            {"label": "Followers", "value": str(len(followers))},
            {"label": "Following", "value": str(len(following))},
        ]
        
        if followers:
            follower_list = [r.get("username", "Unknown") for r in followers[:5]]
            rel_items.append({
                "label": "Notable Followers",
                "value": format_list(follower_list)
            })
        if following:
            following_list = [r.get("username", "Unknown") for r in following[:5]]
            rel_items.append({
                "label": "Notable Following",
                "value": format_list(following_list)
            })
        
        report["sections"].append({
            "title": "Relationship Intelligence",
            "items": rel_items
        })

    # 6. BEHAVIOR & INTERESTS
    activity_patterns = profile.get("activity_patterns", "")
    behavioral_anomalies = profile.get("behavioral_anomalies", [])
    possible_interests = profile.get("possible_interests", [])
    
    behavior_items = []
    if activity_patterns:
        behavior_items.append({"label": "Activity Pattern", "value": str(activity_patterns)})
    if isinstance(possible_interests, list) and possible_interests:
        behavior_items.append({"label": "Identified Interests", "value": format_list(possible_interests)})
    if isinstance(behavioral_anomalies, list) and behavioral_anomalies:
        behavior_items.append({"label": "Behavioral Anomalies", "value": format_list(behavioral_anomalies)})
    
    if behavior_items:
        report["sections"].append({
            "title": "Behavior & Interests",
            "items": behavior_items
        })

    # 7. CONTENT & POSTS
    posts = profile.get("posts", [])
    if isinstance(posts, list) and posts:
        post_items = []
        # Overall count
        post_items.append({"label": "Total Collected Posts", "value": str(len(posts))})

        # Count per platform
        platform_counts = {}
        for p in posts:
            if isinstance(p, dict):
                plat = str(p.get("platform") or "Unknown")
                platform_counts[plat] = platform_counts.get(plat, 0) + 1
        if platform_counts:
            summary = "; ".join(f"{k}: {v}" for k, v in platform_counts.items())
            post_items.append({"label": "Posts by Platform", "value": summary})

        # Highlight a few posts
        highlights = []
        for p in posts[:5]:
            if isinstance(p, dict):
                plat = p.get("platform") or "Unknown"
                title = (p.get("title") or "").strip() or "(no title)"
                date = p.get("date") or "Unknown date"
                highlights.append(f"[{plat}] {title} ({date})")
        if highlights:
            post_items.append({
                "label": "Highlighted Posts",
                "value": format_list(highlights),
            })

        report["sections"].append({
            "title": "Content & Posts",
            "items": post_items,
        })

    # 8. EVIDENCE & SOURCE LINKS
    links_obj = profile.get("links", {})
    link_items = []
    if isinstance(links_obj, dict) and links_obj:
        # Flatten main links
        link_pairs = [f"{k}: {v}" for k, v in links_obj.items() if v]
        if link_pairs:
            link_items.append({
                "label": "Primary Links",
                "value": format_list(link_pairs),
            })

    # Also include per-platform profile URLs from usernames
    profile_urls = []
    if isinstance(usernames_obj, dict):
        for plat, data in usernames_obj.items():
            if isinstance(data, dict) and data.get("url"):
                profile_urls.append(f"{plat}: {data['url']}")
    if profile_urls:
        link_items.append({
            "label": "Verified Profile URLs",
            "value": format_list(profile_urls),
        })

    key_timelines = profile.get("key_timelines", [])
    if isinstance(key_timelines, list) and key_timelines:
        link_items.append({
            "label": "Timeline Highlights",
            "value": format_list(key_timelines[:5]),
        })

    if link_items:
        report["sections"].append({
            "title": "Evidence & Source Links",
            "items": link_items,
        })

    # 9. INTELLIGENCE INDICATORS (IOCs)
    ioc_items = build_ioc_items(profile)
    if ioc_items:
        report["sections"].append({
            "title": "Intelligence Indicators (IOCs)",
            "items": ioc_items
        })

    # 10. ATTACK SURFACE ANALYSIS
    attack_surface = analyze_attack_surface(profile, compromised, usernames_list, counts)
    report["sections"].append({
        "title": "Attack Surface Assessment",
        "items": [
            {"label": "Profile Exposure", "value": attack_surface['exposure']},
            {"label": "Code Repository Risk", "value": attack_surface['code_risk']},
            {"label": "Social Engineering", "value": attack_surface['social_vector']},
            {"label": "Account Takeover", "value": attack_surface['takeover_risk']},
            {"label": "Network Risk", "value": attack_surface['correlation_risk']},
        ]
    })

    # 11. THREAT ASSESSMENT
    threats = assess_threats(profile, compromised, counts)
    report["sections"].append({
        "title": "Threat Assessment",
        "items": [
            {"label": "Threat Level", "value": threats['priority'].upper()},
            {"label": "Primary Concerns", "value": threats['concerns']},
            {"label": "Frameworks", "value": "MITRE ATT&CK | NIST CSF"},
            {"label": "Activity Timeline", "value": format_timeline_summary(profile.get("key_timelines", []))},
        ]
    })

    # 12. AI-POWERED NARRATIVE ANALYSIS
    llm_analysis = profile.get("llm_analysis", "")
    if isinstance(llm_analysis, str) and llm_analysis and not llm_analysis.startswith("["):
        report["sections"].append({
            "title": "AI Analysis & Narrative",
            "items": [
                {"label": "Summary", "value": llm_analysis}
            ]
        })

    # 13. RECOMMENDATIONS
    recommendations = generate_recommendations(profile, risk, compromised, counts)
    report["sections"].append({
        "title": "Prioritized Recommendations",
        "items": recommendations
    })

    # 14. INVESTIGATION PIVOTS
    pivots = generate_pivots(profile, usernames_list)
    report["sections"].append({
        "title": "Investigation & Research Pivots",
        "items": pivots
    })

    # ------------------------------------------------------------------
    # Structured fields for PDF and advanced consumers
    # ------------------------------------------------------------------

    # Counts / metrics
    report["counts"] = {
        "identifiers": counts.get("usernames", 0),
        "platforms": len(platforms),
        "repositories": counts.get("repos", 0),
        "total_stars": counts.get("total_stars", 0),
        "connections": counts.get("connections", 0),
    }

    # Executive summary block
    risk_level = risk.get("level", "low").capitalize()
    compromise_text = "compromised" if compromised else "not compromised"
    exposure_text = footprint_summary(platforms)

    exec_lines = [
        f"Subject {name} is {compromise_text} with {len(usernames_list)} known identifier(s) "
        f"across {len(platforms)} platform(s).",
        f"Overall exposure is assessed as {risk_level.lower()} based on {risk.get('reason') or 'minimal risk indicators' }.",
        f"Digital footprint: {exposure_text}.",
    ]

    # If the correlation engine produced its own summary or narrative, fold a
    # concise version into the executive summary so it is always visible at
    # the top of the report and in the PDF cover.
    corr_summary = (profile.get("summary") or "").strip()
    if corr_summary:
        exec_lines.append(corr_summary)

    llm_analysis_text = profile.get("llm_analysis")
    if isinstance(llm_analysis_text, str) and llm_analysis_text.strip():
        # Keep only the first 2 sentences to avoid overwhelming the summary
        short = llm_analysis_text.strip()
        sentences = short.split(".")
        short = ".".join(sentences[:2]).strip()
        if short:
            if not short.endswith("."):
                short += "."
            exec_lines.append(short)

    report["executive_summary"] = {
        "summary": " ".join(exec_lines),
        "risk_level": risk_level,
        "risk_factors": risk.get("reason") or "Minimal risk indicators",
        "compromised": bool(compromised),
        "location": location,
        "sources": platforms,
        "profile_type": profile_type,
        "about": about,
    }

    # Digital footprint narrative
    repo_count = counts.get("repos", 0)
    conn_count = counts.get("connections", 0)
    timeline_summary = format_timeline_summary(profile.get("key_timelines", []))

    footprint_lines = [
        exposure_text,
        f"{repo_count} public code repositories detected." if repo_count else "No public code repositories detected.",
        f"{conn_count} mapped social connections." if conn_count else "No enriched relationship graph available.",
        f"Temporal activity: {timeline_summary}.",
    ]

    report["digital_footprint"] = {
        "analysis": " ".join(footprint_lines),
        "platforms_found": len(platforms),
        "accounts_identified": len(usernames_list),
    }

    # Platform presence list for PDF
    platform_presence = []
    usernames_obj = profile.get("usernames", {})
    if isinstance(usernames_obj, dict):
        for platform, data in usernames_obj.items():
            if isinstance(data, dict):
                platform_presence.append({
                    "platform": platform.title(),
                    "username": data.get("handle") or data.get("username") or "Unknown",
                    "url": data.get("url", ""),
                    "bio": data.get("bio", ""),
                })
            else:
                platform_presence.append({
                    "platform": platform.title(),
                    "username": str(data),
                    "url": "",
                    "bio": "",
                })

    report["platform_presence"] = platform_presence

    # Repositories list for PDF (full objects, not just top 5)
    repos_full = []
    if isinstance(repos, list):
        for r in repos:
            if isinstance(r, dict):
                repos_full.append({
                    "name": r.get("name", "Unknown"),
                    "stars": r.get("stars", 0),
                    "forks": r.get("forks", 0),
                    "language": r.get("language", "N/A"),
                    "description": r.get("description", ""),
                    "url": r.get("url", ""),
                })

    report["repositories"] = repos_full

    # Relationship analysis narrative
    rel_summary = "No relationship data available"
    if isinstance(rel_graph, list) and rel_graph:
        rel_summary = (
            f"Relationship graph contains {len(rel_graph)} total connection(s) "
            f"including followers and following across correlated platforms."
        )

    report["relationship_analysis"] = {
        "summary": rel_summary,
        "connection_count": counts.get("connections", 0),
    }

    # Attack surface narrative for PDF
    attack_surface_view = analyze_attack_surface(profile, compromised, usernames_list, counts)
    attack_lines = [
        attack_surface_view.get("exposure", ""),
        attack_surface_view.get("code_risk", ""),
        attack_surface_view.get("social_vector", ""),
        attack_surface_view.get("takeover_risk", ""),
        attack_surface_view.get("correlation_risk", ""),
    ]

    report["attack_surface"] = {
        "analysis": " ".join([t for t in attack_lines if t]),
    }

    # Threat analysis narrative for PDF
    threat_view = assess_threats(profile, compromised, counts)
    threat_priority = threat_view.get("priority", "medium").capitalize()
    threat_concerns = threat_view.get("concerns") or "Limited threat indicators"

    report["threat_analysis"] = {
        "analysis": f"Overall threat priority is {threat_priority.lower()} with concerns: {threat_concerns}.",
        "threat_count": len(threat_concerns.split("|")),
    }

    # IOC structure for PDF (simple grouped lists)
    ioc_emails = profile.get("emails", []) if isinstance(profile.get("emails"), list) else []
    ioc_accounts = usernames_list

    # Collect all relevant platform/profile URLs from both usernames and links,
    # de-duplicated so the report and PDF see the full evidence set.
    ioc_url_set = set()

    if isinstance(usernames_obj, dict):
        for _platform, data in usernames_obj.items():
            if isinstance(data, dict) and data.get("url"):
                ioc_url_set.add(str(data["url"]))

    links_obj = profile.get("links", {})
    if isinstance(links_obj, dict):
        for _label, url in links_obj.items():
            if url:
                ioc_url_set.add(str(url))

    ioc_urls = sorted(ioc_url_set)

    ioc_repo_urls = []
    for r in repos_full:
        if r.get("url"):
            ioc_repo_urls.append(r["url"])

    report["indicators_of_compromise"] = {
        "emails": ioc_emails,
        "accounts": ioc_accounts,
        "platform_urls": ioc_urls,
        "repository_urls": ioc_repo_urls,
    }

    # Recommendations for PDF (map existing label/value to priority/action)
    pdf_recs = []
    for rec in recommendations:
        if isinstance(rec, dict):
            pdf_recs.append({
                "priority": rec.get("label", ""),
                "action": rec.get("value", ""),
            })
    report["recommendations"] = pdf_recs

    # Investigation pivots for PDF (name/description)
    pdf_pivots = []
    for p in pivots:
        if isinstance(p, dict):
            pdf_pivots.append({
                "name": p.get("label", ""),
                "description": p.get("value", ""),
            })
    report["investigation_pivots"] = pdf_pivots

    # AI narrative (if any) as a single long-form string
    llm_analysis = profile.get("llm_analysis", "")
    if isinstance(llm_analysis, str) and llm_analysis:
        report["ai_narrative"] = llm_analysis

    return report


def compute_counts(profile: Dict) -> Dict[str, Any]:
    """Compute statistics from profile."""
    repos = profile.get("repositories", [])
    repos_list = repos if isinstance(repos, list) else []
    
    total_stars = sum(r.get("stars", 0) for r in repos_list if isinstance(r, dict))
    total_forks = sum(r.get("forks", 0) for r in repos_list if isinstance(r, dict))
    
    return {
        "usernames": len(extract_usernames(profile)),
        "repos": len(repos_list),
        "total_stars": total_stars,
        "total_forks": total_forks,
        "connections": len(profile.get("relationship_graph", [])) if isinstance(profile.get("relationship_graph"), list) else 0,
    }


def derive_risk(profile: Dict, counts: Dict) -> Dict[str, str]:
    """Derive risk level based on profile characteristics."""
    score = 0
    reasons = []
    
    if profile.get("compromised"):
        score += 50
        reasons.append("Compromise detected")
    
    if len(extract_usernames(profile)) >= 3:
        score += 15
        reasons.append("Multiple identifiers")
    
    if counts["repos"] >= 10:
        score += 10
        reasons.append("Significant code presence")
    
    if counts["total_stars"] >= 50:
        score += 5
        reasons.append("Popular repositories")
    
    if score >= 60:
        level = "critical"
    elif score >= 40:
        level = "high"
    elif score >= 20:
        level = "medium"
    else:
        level = "low"
    
    return {
        "level": level,
        "reason": " | ".join(reasons) if reasons else "Minimal risk indicators"
    }


def extract_usernames(profile: Dict) -> list:
    """Extract all usernames from profile."""
    usernames_obj = profile.get("usernames", {})
    if isinstance(usernames_obj, dict):
        usernames = []
        for platform, data in usernames_obj.items():
            if isinstance(data, dict) and "handle" in data:
                usernames.append(data["handle"])
            elif isinstance(data, str):
                usernames.append(data)
        return usernames
    return []


def build_platform_items(profile: Dict) -> list:
    """Build platform intelligence items."""
    items = []
    usernames = profile.get("usernames", {})
    
    if isinstance(usernames, dict):
        for platform, data in usernames.items():
            if isinstance(data, dict):
                handle = data.get("handle", "Unknown")
                url = data.get("url", "")
                bio = data.get("bio", "")
                
                value = f"Handle: {handle}"
                if bio:
                    value += f" | Bio: {bio[:60]}"
                
                items.append({
                    "label": platform.title(),
                    "value": value
                })
    
    return items if items else []


def build_ioc_items(profile: Dict) -> list:
    """Build IOC items from profile."""
    items = []
    
    usernames = extract_usernames(profile)
    if usernames:
        items.append({"label": "Usernames", "value": format_list(usernames)})
    
    emails = profile.get("emails", [])
    if isinstance(emails, list) and emails:
        items.append({"label": "Email Addresses", "value": format_list(emails)})
    
    # Extract URLs from platforms
    urls = []
    usernames_obj = profile.get("usernames", {})
    if isinstance(usernames_obj, dict):
        for platform, data in usernames_obj.items():
            if isinstance(data, dict) and "url" in data:
                urls.append(data["url"])
    
    if urls:
        items.append({"label": "Platform URLs", "value": format_list(urls)})
    
    repos = profile.get("repositories", [])
    if isinstance(repos, list) and repos:
        repo_urls = [r.get("url") for r in repos if isinstance(r, dict) and "url" in r]
        if repo_urls:
            items.append({"label": "Repository URLs", "value": format_list(repo_urls[:5])})
    
    return items


def analyze_attack_surface(profile: Dict, compromised: bool, usernames: list, counts: Dict) -> Dict[str, str]:
    """Analyze attack surface."""
    return {
        "exposure": f"Identity linked across {len(usernames)} platforms; highly recognizable" if len(usernames) >= 3 else "Limited public exposure",
        "code_risk": f"GitHub presence with {counts['repos']} repos and {counts['total_stars']} stars; potential supply chain vector" if counts['repos'] > 0 else "No code repositories detected",
        "social_vector": "High social engineering risk due to multiple platform presence" if len(usernames) >= 2 else "Moderate social engineering risk",
        "takeover_risk": "⚠️ CRITICAL - Compromised accounts increase takeover risk significantly" if compromised else "Account takeover risk exists across linked platforms",
        "correlation_risk": f"{counts['connections']} connections mapped; secondary attack vectors possible" if counts['connections'] > 0 else "Limited network visibility"
    }


def assess_threats(profile: Dict, compromised: bool, counts: Dict) -> Dict[str, str]:
    """Assess threats."""
    concerns = []
    
    if compromised:
        concerns.append("Credential compromise")
    if counts['repos'] > 0:
        concerns.append("Code/supply chain exposure")
    if counts['connections'] > 10:
        concerns.append("Network-based attack vectors")
    if len(extract_usernames(profile)) >= 3:
        concerns.append("Identity theft potential")
    
    priority = "critical" if compromised else "high" if len(concerns) >= 3 else "medium"
    
    return {
        "priority": priority,
        "concerns": " | ".join(concerns) if concerns else "Limited threat indicators"
    }


def format_list(items: list) -> str:
    """Format list for display."""
    if not items:
        return "None"
    return "; ".join([str(i) for i in items[:10]])


def format_timelines(timelines: list) -> str:
    """Format timeline data."""
    if not timelines or not isinstance(timelines, list) or len(timelines) == 0:
        return "No timeline data"
    return format_list(timelines[:3])


def format_timeline_summary(timelines: list) -> str:
    """Format timeline summary."""
    if not timelines or not isinstance(timelines, list) or len(timelines) == 0:
        return "No historical activity recorded"
    
    first = str(timelines[0]).split(": ")[1] if ": " in str(timelines[0]) else str(timelines[0])
    last = str(timelines[-1]).split(": ")[1] if ": " in str(timelines[-1]) else str(timelines[-1])
    return f"Activity span from {first} to {last}"


def footprint_summary(platforms: list) -> str:
    """Generate footprint summary."""
    if not platforms:
        return "Minimal online presence"
    elif len(platforms) <= 2:
        return f"Limited presence on {len(platforms)} platform(s)"
    elif len(platforms) <= 4:
        return f"Moderate presence on {len(platforms)} platform(s)"
    else:
        return f"Extensive presence across {len(platforms)} platform(s)"


def generate_recommendations(profile: Dict, risk: Dict, compromised: bool, counts: Dict) -> list:
    """Generate prioritized recommendations."""
    recs = []
    
    if compromised:
        recs.append({"label": "1. CRITICAL", "value": "Immediately review all linked accounts for unauthorized access and unusual activity"})
        recs.append({"label": "2. CRITICAL", "value": "Force password resets on all platforms; enable 2FA where available"})
    
    if counts['repos'] > 0:
        recs.append({"label": "3. HIGH", "value": "Audit all public repositories for exposed secrets, API keys, or credentials"})
        recs.append({"label": "4. HIGH", "value": "Review commit history for sensitive data leakage across all repositories"})
    
    if len(extract_usernames(profile)) >= 3:
        recs.append({"label": "5. MEDIUM", "value": "Monitor all linked accounts for suspicious activity and unauthorized profile changes"})
    
    if counts['connections'] > 0:
        recs.append({"label": "6. MEDIUM", "value": "Review follower/connection lists for suspicious accounts or potential threat actors"})
    
    recs.append({"label": "7. ONGOING", "value": "Establish continuous monitoring across all identified platforms and repositories"})
    
    return recs if recs else [{"label": "Assessment", "value": "Profile appears low-risk; maintain standard security hygiene"}]


def generate_pivots(profile: Dict, usernames: list) -> list:
    """Generate investigation pivots."""
    pivots = []
    
    if usernames:
        pivots.append({
            "label": "Username Cross-Reference",
            "value": f"Search '{usernames[0]}' across additional platforms (Patreon, LinkedIn, Discord, TikTok, etc.)"
        })
    
    repos = profile.get("repositories", [])
    if isinstance(repos, list) and repos:
        pivots.append({
            "label": "Code Analysis",
            "value": "Perform SAST on public repos to identify coding patterns, dependencies, and potential vulnerabilities"
        })
    
    connections = profile.get("relationship_graph", [])
    if isinstance(connections, list) and connections:
        pivots.append({
            "label": "Network Expansion",
            "value": f"Map secondary connections from {len(connections)} known associates to expand threat landscape"
        })
    
    emails = profile.get("emails", [])
    if isinstance(emails, list) and emails:
        pivots.append({
            "label": "Email Reconnaissance",
            "value": f"Run {emails[0]} through breach databases and OSINT tools for related accounts"
        })
    
    pivots.append({
        "label": "Timeline Analysis",
        "value": "Correlate account creation dates to identify coordinated identity creation or account takeover events"
    })
    
    return pivots if pivots else [{"label": "Limited Data", "value": "Insufficient data for advanced pivots; expand collection for more vectors"}]
