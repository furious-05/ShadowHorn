import React, { useState, useEffect, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { ThemeContext } from "../contexts/ThemeContext";
import { authFetch } from "../utils/auth";

import virusTotalIcon from "../assets/icons/virustotal.png";
import shodanIcon from "../assets/icons/shodan.png";
import abuseipdbIcon from "../assets/icons/abuseipdb.png";
import alienvaultIcon from "../assets/icons/alienvault.png";
import abusechIcon from "../assets/icons/abusech.png";
import nvdIcon from "../assets/icons/nvd.png";

const IOC_TYPES = {
  ip: { label: "IP Address", color: "blue" },
  domain: { label: "Domain", color: "purple" },
  url: { label: "URL", color: "cyan" },
  hash: { label: "File Hash", color: "orange" },
  cve: { label: "CVE", color: "red" },
  unknown: { label: "Unknown", color: "gray" },
};

const SEVERITY_CONFIG = {
  critical: { bg: "bg-red-600", ring: "ring-red-500", text: "text-red-400", label: "CRITICAL" },
  high: { bg: "bg-orange-500", ring: "ring-orange-400", text: "text-orange-400", label: "HIGH" },
  medium: { bg: "bg-yellow-500", ring: "ring-yellow-400", text: "text-yellow-400", label: "MEDIUM" },
  low: { bg: "bg-blue-500", ring: "ring-blue-400", text: "text-blue-400", label: "LOW" },
  clean: { bg: "bg-green-500", ring: "ring-green-400", text: "text-green-400", label: "CLEAN" },
  unknown: { bg: "bg-gray-500", ring: "ring-gray-400", text: "text-gray-400", label: "N/A" },
};

// Auto-detect IOC type on the client side for badge display
function detectIOCType(value) {
  value = value.trim();
  if (!value) return "unknown";
  if (/^CVE-\d{4}-\d{4,}$/i.test(value)) return "cve";
  if (/^https?:\/\//i.test(value)) return "url";
  if (/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(value)) return "ip";
  if (/^[0-9a-fA-F]{32}$/.test(value) || /^[0-9a-fA-F]{40}$/.test(value) || /^[0-9a-fA-F]{64}$/.test(value)) return "hash";
  if (/^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,}$/.test(value)) return "domain";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Score Gauge Component
// ---------------------------------------------------------------------------
const ScoreGauge = ({ score, severity }) => {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.unknown;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-gray-700/30" />
          <circle
            cx="70" cy="70" r={radius} fill="none"
            strokeWidth="10" strokeLinecap="round"
            stroke="currentColor"
            className={config.text}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold">{score}</span>
          <span className={`text-xs font-semibold ${config.text}`}>{config.label}</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Source Tab Component
// ---------------------------------------------------------------------------
const SourceTab = ({ name, icon, data, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;

  const hasError = data.error;
  const headerBg = isDark ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200";

  return (
    <div className={`rounded-xl border ${isDark ? "border-white/10" : "border-gray-200"} overflow-hidden mb-3`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between px-4 py-3 ${headerBg} transition`}
      >
        <div className="flex items-center gap-2">
          {icon ? (
            <img src={icon} alt="" className="w-5 h-5 rounded object-contain" />
          ) : (
            <span className={`w-2 h-2 rounded-full ${hasError ? "bg-red-500" : "bg-green-500"}`} />
          )}
          <span className="font-semibold text-sm">{name}</span>
          <span className={`w-2 h-2 rounded-full ${hasError ? "bg-red-500" : "bg-green-500"}`} />
        </div>
        <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <div className={`px-4 py-3 text-sm ${isDark ? "bg-black/20" : "bg-white"}`}>
          {hasError ? (
            <p className="text-red-400">{data.error}</p>
          ) : (
            <pre className={`whitespace-pre-wrap break-words text-xs max-h-96 overflow-auto font-mono ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Key Findings Summary
// ---------------------------------------------------------------------------
const KeyFindings = ({ result, isDark }) => {
  if (!result || !result.sources) return null;

  const findings = [];
  const sources = result.sources;

  // VirusTotal
  const vt = sources.virustotal;
  if (vt && !vt.error) {
    if (vt.malicious > 0) {
      findings.push({ severity: "critical", text: `VirusTotal: ${vt.detection_ratio} engines flagged as malicious` });
    } else if (vt.suspicious > 0) {
      findings.push({ severity: "medium", text: `VirusTotal: ${vt.suspicious} engines flagged as suspicious` });
    } else {
      findings.push({ severity: "clean", text: `VirusTotal: No detections (${vt.total_engines} engines scanned)` });
    }
  }

  // AbuseIPDB
  const abuse = sources.abuseipdb;
  if (abuse && !abuse.error) {
    if (abuse.abuse_confidence_score >= 75) {
      findings.push({ severity: "critical", text: `AbuseIPDB: ${abuse.abuse_confidence_score}% confidence of abuse, ${abuse.total_reports} reports` });
    } else if (abuse.abuse_confidence_score >= 25) {
      findings.push({ severity: "medium", text: `AbuseIPDB: ${abuse.abuse_confidence_score}% confidence, ${abuse.total_reports} reports` });
    } else {
      findings.push({ severity: "clean", text: `AbuseIPDB: Low abuse confidence (${abuse.abuse_confidence_score}%)` });
    }
    if (abuse.is_tor) findings.push({ severity: "high", text: "AbuseIPDB: This IP is a known Tor exit node" });
  }

  // Shodan
  const sh = sources.shodan;
  if (sh && !sh.error && sh.found) {
    const vulnCount = sh.vuln_count || 0;
    const portCount = sh.open_port_count || 0;
    if (vulnCount > 0) {
      findings.push({ severity: "high", text: `Shodan: ${vulnCount} known vulnerabilities, ${portCount} open ports` });
    } else {
      findings.push({ severity: "low", text: `Shodan: ${portCount} open ports, no known vulnerabilities` });
    }
    if (sh.os) findings.push({ severity: "low", text: `Shodan: Running ${sh.os}` });
  }

  // OTX
  const otx = sources.alienvault_otx;
  if (otx && !otx.error) {
    const pulseCount = otx.pulse_count || 0;
    if (pulseCount > 5) {
      findings.push({ severity: "high", text: `AlienVault OTX: Found in ${pulseCount} threat pulses` });
    } else if (pulseCount > 0) {
      findings.push({ severity: "medium", text: `AlienVault OTX: Found in ${pulseCount} threat pulse(s)` });
    } else {
      findings.push({ severity: "clean", text: "AlienVault OTX: Not found in any threat pulses" });
    }
  }

  // ThreatFox
  const tf = sources.threatfox;
  if (tf && tf.found) {
    findings.push({ severity: "critical", text: `ThreatFox: Found ${tf.count} IOC match(es) — linked to ${tf.results?.[0]?.malware || "malware"}` });
  }

  // URLhaus
  const uh = sources.urlhaus;
  if (uh && uh.found) {
    findings.push({ severity: "critical", text: `URLhaus: Listed as malicious (${uh.threat || "malware distribution"})` });
  }

  // MalwareBazaar
  const mb = sources.malwarebazaar;
  if (mb && mb.found) {
    findings.push({ severity: "critical", text: `MalwareBazaar: Known malware sample — ${mb.samples?.[0]?.signature || "unclassified"}` });
  }

  // NVD
  const nvd = sources.nvd;
  if (nvd && nvd.found) {
    findings.push({
      severity: nvd.score >= 9 ? "critical" : nvd.score >= 7 ? "high" : nvd.score >= 4 ? "medium" : "low",
      text: `NVD: ${nvd.cve_id} — CVSS ${nvd.score} (${nvd.severity}) — ${(nvd.description || "").substring(0, 120)}...`
    });
  }

  if (findings.length === 0) return null;

  return (
    <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"}`}>
      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider opacity-70">Key Findings</h3>
      <div className="space-y-2">
        {findings.map((f, i) => {
          const sev = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.unknown;
          return (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${sev.bg}`} />
              <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{f.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// History Table
// ---------------------------------------------------------------------------
const HistoryTable = ({ history, onSelect, isDark }) => {
  if (!history || history.length === 0) return null;

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? "border-white/10" : "border-gray-200"}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-600"}>
            <th className="text-left px-4 py-2 font-medium">IOC</th>
            <th className="text-left px-4 py-2 font-medium">Type</th>
            <th className="text-left px-4 py-2 font-medium">Score</th>
            <th className="text-left px-4 py-2 font-medium">Severity</th>
            <th className="text-left px-4 py-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {history.map((item, idx) => {
            const sev = SEVERITY_CONFIG[item.threat_score?.severity] || SEVERITY_CONFIG.unknown;
            return (
              <tr
                key={idx}
                onClick={() => onSelect(item.ioc)}
                className={`cursor-pointer transition ${isDark ? "hover:bg-white/5 border-t border-white/5" : "hover:bg-gray-50 border-t border-gray-100"}`}
              >
                <td className="px-4 py-2 font-mono text-xs truncate max-w-[240px]">{item.ioc}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium bg-${IOC_TYPES[item.ioc_type]?.color || "gray"}-500/20 text-${IOC_TYPES[item.ioc_type]?.color || "gray"}-400`}>
                    {IOC_TYPES[item.ioc_type]?.label || item.ioc_type}
                  </span>
                </td>
                <td className="px-4 py-2 font-bold">{item.threat_score?.score ?? "-"}</td>
                <td className="px-4 py-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sev.bg} text-white`}>
                    {sev.label}
                  </span>
                </td>
                <td className={`px-4 py-2 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {item.looked_up_at ? new Date(item.looked_up_at).toLocaleString() : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ---------------------------------------------------------------------------
// CVE Search Section
// ---------------------------------------------------------------------------
const CVESearch = ({ isDark }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      // If it looks like a CVE ID, do a direct lookup
      if (/^CVE-\d{4}-\d{4,}$/i.test(query.trim())) {
        const res = await authFetch(`/api/threat-intel/cve/${query.trim()}`);
        const data = await res.json();
        setResults(data.found ? { results: [data], total_results: 1 } : { results: [], total_results: 0 });
      } else {
        const res = await authFetch(`/api/threat-intel/cve/search?q=${encodeURIComponent(query.trim())}&limit=15`);
        const data = await res.json();
        setResults(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (sev) => {
    const s = (sev || "").toUpperCase();
    if (s === "CRITICAL") return "text-red-400";
    if (s === "HIGH") return "text-orange-400";
    if (s === "MEDIUM") return "text-yellow-400";
    if (s === "LOW") return "text-blue-400";
    return isDark ? "text-gray-400" : "text-gray-500";
  };

  return (
    <div className={`rounded-xl border p-5 ${isDark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"}`}>
      <h3 className="font-semibold mb-3">CVE / Vulnerability Search</h3>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="CVE-2024-1234 or keyword (e.g. apache, log4j)"
          className={`flex-1 px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-black/40 border-gray-600 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"} focus:outline-none focus:border-blue-400`}
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>
      {results && (
        <div>
          <p className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            {results.total_results || 0} result(s) found
          </p>
          <div className="space-y-2 max-h-96 overflow-auto">
            {(results.results || []).map((cve, i) => (
              <div key={i} className={`p-3 rounded-lg border ${isDark ? "border-white/10 bg-black/20" : "border-gray-200 bg-white"}`}>
                <div className="flex items-center gap-3 mb-1">
                  <span className="font-mono font-bold text-sm">{cve.cve_id}</span>
                  {cve.score > 0 && (
                    <span className={`text-sm font-semibold ${severityColor(cve.severity)}`}>
                      CVSS {cve.score} ({cve.severity})
                    </span>
                  )}
                  <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{cve.published?.split("T")[0]}</span>
                </div>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  {(cve.description || "").substring(0, 250)}{cve.description?.length > 250 ? "..." : ""}
                </p>
                {cve.affected_products?.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {cve.affected_products.slice(0, 5).map((p, j) => (
                      <span key={j} className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                        {p.vendor}/{p.product}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
const IntelligenceAnalysis = () => {
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [iocInput, setIocInput] = useState("");
  const [detectedType, setDetectedType] = useState("unknown");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("lookup");

  // Investigation system
  const [investigations, setInvestigations] = useState([]);
  const [activeInvestigation, setActiveInvestigation] = useState("");
  const [showNewInvModal, setShowNewInvModal] = useState(false);
  const [newInvName, setNewInvName] = useState("");
  const [newInvDesc, setNewInvDesc] = useState("");
  const [newInvTags, setNewInvTags] = useState("");
  const [invCreating, setInvCreating] = useState(false);

  const fetchInvestigations = useCallback(async () => {
    try {
      const res = await authFetch("/api/investigations");
      const data = await res.json();
      setInvestigations(data.investigations || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchInvestigations(); }, [fetchInvestigations]);

  const createInvestigation = async () => {
    if (!newInvName.trim()) return;
    setInvCreating(true);
    try {
      const res = await authFetch("/api/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newInvName.trim(),
          description: newInvDesc.trim(),
          tags: newInvTags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.id) {
        setActiveInvestigation(data.id);
        setShowNewInvModal(false);
        setNewInvName("");
        setNewInvDesc("");
        setNewInvTags("");
        fetchInvestigations();
      }
    } catch (e) { console.error(e); }
    finally { setInvCreating(false); }
  };

  const fetchHistory = useCallback(async () => {
    try {
      const url = activeInvestigation
        ? `/api/threat-intel/history?limit=30&investigation_id=${activeInvestigation}`
        : "/api/threat-intel/history?limit=30";
      const res = await authFetch(url);
      const data = await res.json();
      setHistory(data.history || []);
    } catch (e) {
      console.error(e);
    }
  }, [activeInvestigation]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    setDetectedType(detectIOCType(iocInput));
  }, [iocInput]);

  const handleLookup = async (iocOverride) => {
    const value = iocOverride || iocInput;
    if (!value.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const body = { ioc: value.trim(), force: !!iocOverride };
      if (activeInvestigation) body.investigation_id = activeInvestigation;
      const res = await authFetch("/api/threat-intel/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        if (iocOverride) setIocInput(value);
        fetchHistory();
        if (activeInvestigation) fetchInvestigations();
      }
    } catch (e) {
      setError(e.message || "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const handleHistorySelect = (ioc) => {
    setIocInput(ioc);
    handleLookup(ioc);
    setActiveTab("lookup");
  };

  const typeConfig = IOC_TYPES[detectedType] || IOC_TYPES.unknown;
  const score = result?.threat_score?.score ?? null;
  const severity = result?.threat_score?.severity || "unknown";
  const sourceNames = result?.sources ? Object.keys(result.sources) : [];

  const SOURCE_LABELS = {
    virustotal: "VirusTotal",
    shodan: "Shodan",
    abuseipdb: "AbuseIPDB",
    alienvault_otx: "AlienVault OTX",
    threatfox: "ThreatFox",
    urlhaus: "URLhaus",
    malwarebazaar: "MalwareBazaar",
    nvd: "NVD / CVE",
  };

  const SOURCE_ICONS = {
    virustotal: virusTotalIcon,
    shodan: shodanIcon,
    abuseipdb: abuseipdbIcon,
    alienvault_otx: alienvaultIcon,
    threatfox: abusechIcon,
    urlhaus: abusechIcon,
    malwarebazaar: abusechIcon,
    nvd: nvdIcon,
  };

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? "bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white" : "bg-gray-50 text-gray-900"}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto min-h-0">
        <Topbar />

        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          Threat Intelligence
        </h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: "lookup", label: "IOC Lookup" },
            { id: "cve", label: "CVE Search" },
            { id: "history", label: "History" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : isDark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* IOC Lookup Tab */}
        {activeTab === "lookup" && (
          <div className="space-y-6 max-w-5xl">
            {/* Investigation Selector */}
            <div className={`rounded-2xl border p-4 ${isDark ? "bg-gradient-to-r from-gray-800/50 to-gray-900/50 border-white/10 backdrop-blur-lg" : "bg-white border-gray-200 shadow-sm"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <svg className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>Investigation</span>
                </div>
                <select
                  value={activeInvestigation}
                  onChange={(e) => setActiveInvestigation(e.target.value)}
                  className={`flex-1 min-w-[200px] px-3 py-2 rounded-lg border text-sm ${isDark ? "bg-black/40 border-gray-600 text-white" : "bg-gray-50 border-gray-300 text-gray-900"} focus:outline-none focus:border-blue-400 transition`}
                >
                  <option value="">-- No Investigation (General) --</option>
                  {investigations.filter(inv => inv.status === "active").map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} ({inv.ioc_count || 0} IOCs)
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewInvModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg text-xs font-bold shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 transition whitespace-nowrap"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  New Investigation
                </button>
              </div>
              {activeInvestigation && (() => {
                const inv = investigations.find(i => i.id === activeInvestigation);
                return inv ? (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 uppercase">{inv.status}</span>
                    {inv.description && <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{inv.description}</span>}
                    {inv.tags?.map((tag, i) => (
                      <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isDark ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"}`}>#{tag}</span>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>

            {/* Search Bar */}
            <div className={`rounded-2xl border p-5 ${isDark ? "glass-card bg-white/5 border-white/10 backdrop-blur-lg" : "bg-white border-gray-200 shadow-sm"}`}>
              <div className="flex gap-3 items-center">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={iocInput}
                    onChange={(e) => setIocInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                    placeholder={activeInvestigation ? "Enter IOC to analyze (tagged to investigation)..." : "Enter IP, domain, URL, file hash, or CVE ID..."}
                    className={`w-full px-4 py-3 rounded-xl border text-sm pr-24 ${isDark ? "bg-black/40 border-gray-600 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400"} focus:outline-none focus:border-blue-400 transition`}
                  />
                  {iocInput && (
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs font-semibold bg-${typeConfig.color}-500/20 text-${typeConfig.color}-400`}>
                      {typeConfig.label}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleLookup()}
                  disabled={loading || !iocInput.trim()}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition shadow-lg whitespace-nowrap"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Analyzing...
                    </span>
                  ) : "Analyze IOC"}
                </button>
              </div>
              <p className={`mt-2 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                Queries VirusTotal, Shodan, AbuseIPDB, AlienVault OTX, ThreatFox, URLhaus, MalwareBazaar, and NVD based on IOC type.
              </p>
            </div>

            {error && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
            )}

            {/* Results */}
            {result && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Score + Info */}
                <div className="lg:col-span-1 space-y-4">
                  <div className={`rounded-2xl border p-6 text-center ${isDark ? "glass-card bg-white/5 border-white/10 backdrop-blur-lg" : "bg-white border-gray-200 shadow-sm"}`}>
                    <ScoreGauge score={score ?? 0} severity={severity} />
                    <p className="mt-3 font-mono text-sm truncate opacity-70">{result.ioc}</p>
                    <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {IOC_TYPES[result.ioc_type]?.label || result.ioc_type}
                      {result.cached && " (cached)"}
                    </p>
                  </div>

                  {/* Score Breakdown */}
                  {result.threat_score?.breakdown && Object.keys(result.threat_score.breakdown).length > 0 && (
                    <div className={`rounded-xl border p-4 ${isDark ? "border-white/10 bg-white/5" : "border-gray-200 bg-gray-50"}`}>
                      <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider opacity-70">Score Breakdown</h3>
                      <div className="space-y-2">
                        {Object.entries(result.threat_score.breakdown).map(([source, sourceScore]) => (
                          <div key={source}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className={`flex items-center gap-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                {SOURCE_ICONS[source] && <img src={SOURCE_ICONS[source]} alt="" className="w-4 h-4 rounded-sm object-contain" />}
                                {SOURCE_LABELS[source] || source}
                              </span>
                              <span className="font-semibold">{sourceScore}/100</span>
                            </div>
                            <div className={`w-full h-1.5 rounded-full ${isDark ? "bg-gray-700" : "bg-gray-200"}`}>
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  sourceScore >= 75 ? "bg-red-500" : sourceScore >= 50 ? "bg-orange-500" : sourceScore >= 25 ? "bg-yellow-500" : "bg-green-500"
                                }`}
                                style={{ width: `${sourceScore}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Findings + Sources */}
                <div className="lg:col-span-2 space-y-4">
                  <KeyFindings result={result} isDark={isDark} />

                  <div>
                    <h3 className="font-semibold mb-3 text-sm uppercase tracking-wider opacity-70">Source Results</h3>
                    {sourceNames.map(name => (
                      <SourceTab
                        key={name}
                        name={SOURCE_LABELS[name] || name}
                        icon={SOURCE_ICONS[name]}
                        data={result.sources[name]}
                        isDark={isDark}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CVE Tab */}
        {activeTab === "cve" && (
          <div className="max-w-4xl">
            <CVESearch isDark={isDark} />
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="max-w-5xl">
            <HistoryTable history={history} onSelect={handleHistorySelect} isDark={isDark} />
            {history.length === 0 && (
              <p className={`text-center mt-8 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                No lookups yet. Use the IOC Lookup tab to analyze your first indicator.
              </p>
            )}
          </div>
        )}

        {/* Spacer pushes footer to bottom */}
        <div className="flex-1" />

        {/* Navigation */}
        <div className={`mt-4 pt-4 flex justify-between items-center border-t ${isDark ? "border-white/5" : "border-gray-200"}`}>
          <button onClick={() => navigate('/data-preview')} className={`px-4 py-2 rounded-full font-medium shadow ${isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"}`}>
            &larr; Data Preview
          </button>
          <button onClick={() => navigate('/node-visualization')} className={`px-5 py-3 rounded-full font-semibold shadow-lg ${isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"}`}>
            Node Visualization &rarr;
          </button>
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs py-4 text-center font-mono">
          © ShadowHorn — Secure Intelligence Platform 2026
        </p>
      </div>

      {/* New Investigation Modal */}
      {showNewInvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${isDark ? "bg-gray-900 border-white/10" : "bg-white border-gray-200"}`}>
            <div className="flex items-center justify-between mb-5">
              <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>New Investigation</h2>
              <button onClick={() => setShowNewInvModal(false)} className="text-gray-500 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Name *</label>
                <input
                  type="text"
                  value={newInvName}
                  onChange={(e) => setNewInvName(e.target.value)}
                  placeholder="e.g., Firewall Alert Investigation"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm ${isDark ? "bg-black/40 border-gray-600 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900"} focus:outline-none focus:border-blue-400`}
                  autoFocus
                />
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Description</label>
                <textarea
                  value={newInvDesc}
                  onChange={(e) => setNewInvDesc(e.target.value)}
                  placeholder="Brief description of the investigation..."
                  rows={2}
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm resize-none ${isDark ? "bg-black/40 border-gray-600 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900"} focus:outline-none focus:border-blue-400`}
                />
              </div>
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newInvTags}
                  onChange={(e) => setNewInvTags(e.target.value)}
                  placeholder="apt, malware, phishing"
                  className={`w-full px-3 py-2.5 rounded-lg border text-sm ${isDark ? "bg-black/40 border-gray-600 text-white placeholder-gray-500" : "bg-gray-50 border-gray-300 text-gray-900"} focus:outline-none focus:border-blue-400`}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewInvModal(false)}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition ${isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                Cancel
              </button>
              <button
                onClick={createInvestigation}
                disabled={!newInvName.trim() || invCreating}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-lg text-sm font-bold shadow-lg disabled:opacity-50 transition"
              >
                {invCreating ? "Creating..." : "Create Investigation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligenceAnalysis;
