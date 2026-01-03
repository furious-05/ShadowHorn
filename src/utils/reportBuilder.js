// Report Builder Utility
// Transforms correlation data into structured reports for 4 departments:
// OSINT, Threat Intelligence, Pentesting, Malware & Reverse Engineering

export const buildReport = (dept, data) => {
  const base = extractBase(data);
  let sections = [];
  const deptKey = (dept || 'osint').toLowerCase();

  switch ((dept || "osint").toLowerCase()) {
    case "osint":
      sections.push(...buildOsintSections(data));
      break;
    case "threat intel":
    case "threat-intel":
    case "threat_intel":
      sections.push(...buildThreatIntelSections(data));
      break;
    case "pentesting":
      sections.push(...buildPentestSections(data));
      break;
    case "malware":
    case "malware-rev":
    case "malware and rev":
    case "malware & rev":
    case "reverse":
    case "reverse engineering":
      sections.push(...buildMalwareRevSections(data));
      break;
    default:
      sections.push(...buildOsintSections(data));
      break;
  }

  // Filter out empty items and empty sections dynamically
  sections = sections
    .map(sec => ({
      title: sec.title,
      items: (sec.items || []).filter(it => isMeaningful(it?.value))
    }))
    .filter(sec => sec.items && sec.items.length > 0);

  return {
    meta: {
      department: labelForDept(deptKey),
      generated_at: new Date().toISOString(),
      compromised: !!base.compromised,
      identifier: base.identifier,
      name: base.name,
      location: base.location,
      sources: base.sources,
      mode: data?.mode || "",
      prompt: data?.prompt || "",
      counts: computeCounts(data?.result)
    },
    sections,
  };
};

function labelForDept(key) {
  switch (key) {
    case 'osint': return 'OSINT';
    case 'threat-intel':
    case 'threat intel':
    case 'threat_intel': return 'Threat Intelligence';
    case 'pentesting': return 'Pentesting';
    case 'malware-rev':
    case 'malware':
    case 'malware & rev':
    case 'malware and rev':
    case 'reverse':
    case 'reverse engineering': return 'Malware & Reverse Engineering';
    default: return 'OSINT';
  }
}

function extractBase(data) {
  const r = data?.result || {};
  const identifier = r?.identifier || r?.name || "Unknown";
  return {
    identifier,
    name: r?.name || identifier,
    location: r?.location || r?.profile?.location || "",
    compromised: !!r?.compromised || r?.status === "COMPROMISED",
    sources: Array.isArray(data?.platforms) && data.platforms.length
      ? data.platforms
      : Object.keys(r?.links || {}),
  };
}

function buildOsintSections(data) {
  const r = data?.result || {};
  const counts = computeCounts(r);
  const sources = Array.isArray(data?.platforms) && data.platforms.length ? data.platforms : Object.keys(r?.links || {});
  const risk = deriveRisk(r, counts);
  const displayName = r?.name || r?.identifier || "this profile";
  return [
    section("Executive Summary", [
      item(
        "Overall Assessment",
        `Current OSINT snapshot for ${displayName} indicates a ${risk.level.toUpperCase()}-level exposure profile with ${counts.emails} email(s), ${counts.usernames} username(s) and ${counts.posts} public post(s) across ${sources.length || 0} data source(s).`
      ),
      item("Risk Level", risk.level.toUpperCase()),
      item("Risk Drivers", risk.reason || "Insufficient signals to explain risk; exposure currently appears low."),
      item(
        "Compromise Status",
        r?.compromised
          ? "Evidence of compromise or leaked credentials was observed in one or more breach data sources."
          : "No direct compromise evidence detected in the current OSINT collection."
      ),
      item("Primary Handles", listify(flatUsernames(r?.usernames))),
      item("Emails", listify(r?.emails)),
    ]),
    section("Analyst Narrative", [
      item("Overview", r?.llm_analysis || "No narrative analysis available for this profile"),
    ]),
    section("Key Findings", [
      item("Digital Footprint", footprintSummary(r)),
      item("Interests", interestSummary(r)),
      item("Activity & Volume", activitySummary(r, counts)),
      item("Timeline", timelinesSummary(r)),
    ]),
    section("Evidence", evidenceItems(r)),
    section("Priority Actions (Next 7 Days)", recommendationsOsint(r, risk, counts)),
  ];
}

function buildThreatIntelSections(data) {
  const r = data?.result || {};
  const counts = computeCounts(r);
  const risk = deriveRisk(r, counts);
  const iocSummary = iocDetails(r);
  return [
    section("Executive Summary", [
      item("Risk Level", risk.level.toUpperCase()),
      item("Risk Drivers", risk.reason || "Limited hostile indicators; profile currently appears low risk."),
      item("IOC Volume", `${iocSummary.total} observables (emails, usernames, repositories, links)`),
      item("Relevant Sources", listify(Object.keys(r?.links || {}))),
    ]),
    section("Analyst Assessment", [
      item("Narrative", r?.llm_analysis || "No analyst assessment available; rely on structured indicators above."),
    ]),
    section("Observed TTPs", ttpItems(r)),
    section("Entities & Relations", relationItems(r?.relationship_graph)),
    section("Key IOCs", iocSummary.items),
    section("Evidence", evidenceItems(r)),
    section("Monitoring & Mitigations", mitigationsThreatIntel(r, risk, iocSummary)),
  ];
}

function buildPentestSections(data) {
  const r = data?.result || {};
  const counts = computeCounts(r);
   const risk = deriveRisk(r, counts);
  return [
    section("Executive Summary", [
      item(
        "Recon Summary",
        `From an attacker perspective, this profile exposes ${counts.emails} email(s), ${counts.usernames} username(s), ${counts.repos} public code repositories and ${counts.posts} social posts that can be leveraged for reconnaissance and phishing.`
      ),
      item("Risk Level (Recon)", risk.level.toUpperCase()),
      item("Primary Identifiers", listify([r?.name, ...flatUsernames(r?.usernames), ...(r?.emails || [])].filter(Boolean))),
      item("Public Attack Surface", listify(Object.values(r?.links || {}))),
    ]),
    section("Recon Narrative", [
      item("Attacker View", r?.llm_analysis || "No narrative recon view available; use the structured attack surface below."),
    ]),
    section("Repositories & Tech Stack", repoItems(r?.repositories)),
    section("Potential Weaknesses", pentestWeaknesses(r, counts)),
    section("Targets for Validation", validationTargets(r)),
    section("Evidence", evidenceItems(r)),
  ];
}

function buildMalwareRevSections(data) {
  const r = data?.result || {};
  const counts = computeCounts(r);
  const risk = deriveRisk(r, counts);
  return [
      section("Executive Summary", [
        item("Status", r?.compromised ? "COMPROMISED" : "SECURE"),
        item("Potential Stealer/Leakage", r?.hudsonrock_data ? `Services: ${r.hudsonrock_data.total_user_services || 0}` : "None"),
        item("Malware-Relevance", r?.compromised ? "Credentials or identifiers appear in breach/compromise datasets and are relevant to stealer or infostealer activity." : "No direct stealer-related evidence identified in the current snapshot."),
      ]),
    section("Analyst Commentary", [
      item("Malware-Relevant View", r?.llm_analysis || "No narrative malware-centric commentary available for this profile."),
    ]),
      section("Suspicious Artifacts", suspiciousArtifacts(r)),
      section("Code & Binaries", repoBinaryItems(r?.repositories)),
      section("Evidence", evidenceItems(r)),
      section("Recommendations", recommendationsMalware(r, risk, counts)),
  ];
}

// Helpers
function section(title, items) {
  return { title, items: items || [] };
}
function item(label, value) { return { label, value }; }

function listify(arr) {
  if (!arr) return "None";
  if (Array.isArray(arr)) return arr.length ? arr.join(", ") : "None";
  if (typeof arr === "object") return Object.values(arr).join(", ");
  return String(arr);
}

function isMeaningful(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (!s) return false;
  if (s.toLowerCase() === "none" || s === "—") return false;
  return true;
}

function flatUsernames(usernames) {
  if (!usernames) return [];
  if (Array.isArray(usernames)) return usernames.map(u => u?.handle || u).filter(Boolean);
  if (typeof usernames === "object") {
    return Object.values(usernames)
      .map(u => (u && typeof u === "object" ? u.handle || "" : u))
      .filter(Boolean)
      .map(String);
  }
  return [String(usernames)];
}

function iocCount(r) {
  const emails = r?.emails?.length || 0;
  const handles = flatUsernames(r?.usernames).length || 0;
  const repos = r?.repositories?.length || 0;
  return `${emails + handles + repos} observables`;
}

function computeCounts(r) {
  if (!r) return { emails: 0, usernames: 0, posts: 0, repos: 0 };
  return {
    emails: Array.isArray(r.emails) ? r.emails.length : 0,
    usernames: flatUsernames(r.usernames).length,
    posts: Array.isArray(r.posts) ? r.posts.length : 0,
    repos: Array.isArray(r.repositories) ? r.repositories.length : 0,
  };
}

function ttpItems(r) {
  const anomalies = r?.behavioral_anomalies || [];
  const patterns = r?.activity_patterns || [];
  const ttp = [...anomalies, ...patterns];
  return ttp.length ? ttp.map(v => item("Observed", v)) : [item("Observed", "None detected")];
}

function relationItems(graph) {
  if (!Array.isArray(graph) || !graph.length) return [item("Relations", "No relationship graph available")];
  return graph.slice(0, 10).map(rel => item(`${rel?.relationship || "relation"}`, `${rel?.source} → ${rel?.target}`));
}

function evidenceItems(r) {
  const links = r?.links || {};
  const posts = r?.posts || [];
  const repos = r?.repositories || [];
  const ev = [];
  Object.entries(links).forEach(([k, v]) => ev.push(item(k, v)));
  posts.slice(0, 5).forEach(p => ev.push(item("Post", `${p?.platform || "post"}: ${p?.content || p?.title || ""}`)));
  repos.slice(0, 5).forEach(repo => ev.push(item("Repo", `${repo?.name || "repo"} • ⭐ ${repo?.stars || repo?.stargazers_count || 0}`)));
  return ev.length ? ev : [item("Evidence", "No external references")];
}

function repoItems(repos) {
  if (!Array.isArray(repos) || !repos.length) return [item("Repositories", "No repositories found")];
  return repos.slice(0, 8).map(repo => item(repo?.name || "repo", `Lang: ${repo?.language || "n/a"} • ⭐ ${repo?.stars || repo?.stargazers_count || 0} • Forks ${repo?.forks || repo?.forks_count || 0}`));
}

function repoBinaryItems(repos) {
  if (!Array.isArray(repos) || !repos.length) return [item("Code", "No repositories found")];
  return repos.slice(0, 8).map(repo => item(repo?.name || "repo", `${repo?.description || ""}`));
}

function suspiciousArtifacts(r) {
  const artifacts = [];
  const posts = r?.posts || [];
  posts.forEach(p => {
    const txt = `${p?.content || p?.title || ""}`.toLowerCase();
    if (/[stealer|crack|keygen|payload|dropper|loader]/.test(txt)) {
      artifacts.push(`Post: ${p?.platform || ""} • ${p?.title || p?.content?.slice(0, 60) || ""}`);
    }
  });
  return artifacts.length ? artifacts.map(v => item("Artifact", v)) : [item("Artifacts", "No suspicious content detected")];
}

function validationTargets(r) {
  const targets = [];
  Object.values(r?.links || {}).forEach(url => targets.push(url));
  (r?.repositories || []).forEach(repo => repo?.url && targets.push(repo.url));
  return targets.length ? targets.map(v => item("Target", v)) : [item("Targets", "No public targets identified")];
}

function recommendationsOsint(r, risk, counts) {
  const actions = [];
  if (r?.compromised) {
    actions.push("Immediately rotate credentials for all accounts associated with observed emails and usernames.");
    actions.push("Review sessions and login history for suspicious activity across primary platforms.");
  }
  if (counts.emails > 0) {
    actions.push("Separate public-facing contact emails from privileged or corporate identities.");
  }
  if (counts.repos > 0) {
    actions.push("Scan public repositories for secrets, tokens and environment files.");
  }
  if (!r?.compromised && actions.length === 0) {
    actions.push("Maintain current hygiene; periodically re-run OSINT correlation to catch new exposures.");
  }
  actions.push("Establish continuous monitoring for impersonation and domain-similar accounts.");
  return actions.map(v => item("Recommendation", v));
}

function recommendationsMalware(r, risk, counts) {
  const recs = [];
  if (counts.repos > 0) {
    recs.push("Inventory all public repositories and verify that no compiled binaries or installers are published without review.");
    recs.push("Add SECURITY.md and clear reporting channels for suspected malicious fork or abuse of code.");
  }
  recs.push("Run static and dependency analysis on any repositories that reference credential-stealing, cracking or loader-related tooling.");
  recs.push("Monitor threat intel feeds for malware campaigns abusing the observed handles or repositories as lures.");
  return recs.map(v => item("Recommendation", v));
}

// --- Higher-level narrative helpers ---

function deriveRisk(r, counts) {
  let score = 0;
  const reasons = [];

  if (r?.compromised) {
    score += 3;
    reasons.push("Profile marked as compromised in correlation output.");
  }

  const summary = (r?.summary || "").toLowerCase();
  if (summary.includes("breachdirectory")) {
    score += 2;
    reasons.push("BreachDirectory indicates leaked records for this identity.");
  }
  if (summary.includes("hudsonrock")) {
    score += 2;
    reasons.push("HudsonRock / compromise check flags elevated risk.");
  }

  if (counts.emails > 0) {
    score += 1;
    reasons.push(`${counts.emails} email address(es) observed in open sources.`);
  }
  if (counts.usernames > 1) {
    score += 1;
    reasons.push("Multiple reused usernames across platforms increase correlation and impersonation risk.");
  }
  if (counts.repos > 3) {
    score += 1;
    reasons.push("Developer footprint with several public repositories.");
  }
  if (counts.posts > 20) {
    score += 1;
    reasons.push("High volume of public social posts.");
  }

  let level = "Low";
  if (score >= 6) level = "Critical";
  else if (score >= 4) level = "High";
  else if (score >= 2) level = "Moderate";

  return { level, reason: reasons.join(" ") };
}

function footprintSummary(r) {
  const usernames = r?.usernames || {};
  const handles = [];
  if (typeof usernames === "object") {
    Object.entries(usernames).forEach(([platform, obj]) => {
      const handle = obj?.handle || obj;
      if (handle) {
        handles.push(`${capitalize(platform)} (@${String(handle).replace(/^@/, "")})`);
      }
    });
  }
  const links = Object.values(r?.links || {}) || [];
  const parts = [];
  if (handles.length) parts.push(`Active handles on ${handles.join(", ")}.`);
  if (links.length) parts.push(`Key public URLs: ${links.slice(0, 5).join(", ")}.`);
  return parts.length ? parts.join(" ") : "No resolvable public profiles or links were identified in this snapshot.";
}

function interestSummary(r) {
  const raw = r?.possible_interests || r?.interests || [];
  if (!raw || (Array.isArray(raw) && !raw.length)) {
    return "No clear thematic interests could be inferred from the available OSINT.";
  }
  const arr = Array.isArray(raw) ? raw : Object.values(raw);
  return `Observed interests include: ${arr.slice(0, 8).join(", ")}.`;
}

function activitySummary(r, counts) {
  const bits = [];
  if (r?.activity_patterns) bits.push(r.activity_patterns);
  bits.push(`Collected: ${counts.posts} post(s), ${counts.repos} repository(ies) and ${counts.usernames} distinct username(s).`);
  return bits.join(" ") || "No activity metrics available.";
}

function timelinesSummary(r) {
  const t = r?.key_timelines || r?.timelines || [];
  if (!Array.isArray(t) || t.length === 0) return "Not enough temporal data to build a meaningful activity timeline.";
  const first = t[0];
  const last = t[t.length - 1];
  if (first === last) {
    return `Earliest observed milestone: ${first}.`;
  }
  return `Observed activity window from "${first}" through "${last}" (see detailed timeline in correlation data for granular events).`;
}

function iocDetails(r) {
  const emails = r?.emails || [];
  const handles = flatUsernames(r?.usernames);
  const repos = r?.repositories || [];
  const links = Object.values(r?.links || {});
  const total = (emails?.length || 0) + (handles?.length || 0) + (repos?.length || 0) + (links?.length || 0);

  const items = [];
  emails.slice(0, 3).forEach(e => items.push(item("Email IOC", e)));
  handles.slice(0, 3).forEach(h => items.push(item("Handle IOC", h)));
  repos.slice(0, 3).forEach(rp => items.push(item("Repo IOC", rp?.name || rp?.url || "repository")));
  links.slice(0, 3).forEach(u => items.push(item("URL IOC", u)));

  return { total, items: items.length ? items : [item("IOCs", "No clear indicators or observables were derived from this snapshot.")] };
}

function pentestWeaknesses(r, counts) {
  const weaknesses = [];
  if (counts.emails > 0) {
    weaknesses.push("Public email addresses are available and could be targeted for phishing and password spray campaigns.");
  }
  if (counts.repos > 0) {
    weaknesses.push("Public repositories may expose technology stack details, default configs or historical secrets.");
  }
  if (counts.posts > 0) {
    weaknesses.push("Social posts may leak routine, tooling preferences or internal vocabulary useful for spear-phishing.");
  }
  if (!weaknesses.length) {
    weaknesses.push("No obvious weaknesses identified from recon data in this snapshot.");
  }
  return weaknesses.map(v => item("Weakness", v));
}

function mitigationsThreatIntel(r, risk, iocSummary) {
  const recs = [];
  if (risk.level === "Critical" || risk.level === "High") {
    recs.push("Prioritize this identity in threat-hunting backlogs and correlate with internal telemetry.");
  }
  if (iocSummary.total > 0) {
    recs.push("Onboard extracted emails, usernames and URLs as IOCs into SIEM/SOAR detection pipelines.");
  }
  recs.push("Monitor for new lookalike accounts, domains and repositories reusing these identifiers.");
  recs.push("Establish a feedback loop between SOC and OSINT teams to continuously refresh this profile.");
  return recs.map(v => item("Mitigation", v));
}

function capitalize(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}
