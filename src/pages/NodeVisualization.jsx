import React, { useState, useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import CytoscapeComponent from "react-cytoscapejs";
import Cytoscape from "cytoscape";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { transformCorrelationToGraph, getCorrelationSummary } from "../utils/graphDataTransformer";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeContext } from "../contexts/ThemeContext";
import { authFetch } from "../utils/auth";

import githubIcon from "../assets/icons/github.png";
import twitterIcon from "../assets/icons/twitter.png";
import redditIcon from "../assets/icons/reddit.png";
import linkedinIcon from "../assets/icons/linkedin.png";
import mediumIcon from "../assets/icons/medium.png";
import stackOverflowIcon from "../assets/icons/stack-overflow.png";
import wikipediaIcon from "../assets/icons/wikipedia.png";
import arrobaIcon from "../assets/icons/arroba.png";
import profileImage from "../assets/icons/profile_image.png";
import mapIcon from "../assets/icons/map.png";
import snapchatIcon from "../assets/icons/snapchat.png";
import descriptionIcon from "../assets/icons/description.png";
import aboutIcon from "../assets/icons/about.png";

// Threat Intelligence icons
import shieldIcon from "../assets/icons/shield.png";
import virusTotalIcon from "../assets/icons/virustotal.png";
import shodanIcon from "../assets/icons/shodan.png";
import abuseipdbIcon from "../assets/icons/abuseipdb.png";
import alienvaultIcon from "../assets/icons/alienvault.png";
import abusechIcon from "../assets/icons/abusech.png";
import nvdIcon from "../assets/icons/nvd.png";
import ipAddressIcon from "../assets/icons/ip-address.png";
import domainIcon from "../assets/icons/domain.png";
import urlLinkIcon from "../assets/icons/url-link.png";
import hashIcon from "../assets/icons/hash.png";
import bugIcon from "../assets/icons/bug.png";
import severityCriticalIcon from "../assets/icons/severity-critical.png";
import severityHighIcon from "../assets/icons/severity-high.png";
import severityMediumIcon from "../assets/icons/severity-medium.png";
import severityCleanIcon from "../assets/icons/severity-clean.png";
import cyberSecurityIcon from "../assets/icons/cyber-security.png";

// Import layout algorithm
import cose from "cytoscape-cose-bilkent";

Cytoscape.use(cose);

const NodeVisualization = () => {
  const navigate = useNavigate();
  const cyRef = useRef();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  // State
  const [identifiers, setIdentifiers] = useState([]);
  const [selectedIdentifier, setSelectedIdentifier] = useState("");
  const [correlationData, setCorrelationData] = useState(null);
  const [elements, setElements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [noCorrelation, setNoCorrelation] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showNodeDetails, setShowNodeDetails] = useState(false);
  const [showTopPanel, setShowTopPanel] = useState(true);
  const [graphMode, setGraphMode] = useState("osint"); // "osint" or "cti"
  const [tiElements, setTiElements] = useState([]);
  const [tiLoading, setTiLoading] = useState(false);
  const [ctiInvestigations, setCtiInvestigations] = useState([]);
  const [selectedInvestigation, setSelectedInvestigation] = useState(""); // "" = all lookups

  // Icon maps for CTI graph nodes
  const iocTypeIcons = { ip: ipAddressIcon, domain: domainIcon, url: urlLinkIcon, hash: hashIcon, cve: bugIcon };
  const iocTypeColors = { ip: "#3b82f6", domain: "#8b5cf6", url: "#06b6d4", hash: "#f59e0b", cve: "#ef4444" };
  const sevIcons = { critical: severityCriticalIcon, high: severityHighIcon, medium: severityMediumIcon, low: shieldIcon, clean: severityCleanIcon };
  const sevColors = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6", clean: "#22c55e" };

  const fetchCtiInvestigations = async () => {
    try {
      const res = await authFetch("/api/investigations");
      const data = await res.json();
      setCtiInvestigations(data.investigations || []);
    } catch (e) {
      console.error("Failed to fetch CTI investigations:", e);
    }
  };

  const loadCTIGraph = async (investigationId) => {
    setTiLoading(true);
    try {
      let url = "/api/threat-intel/history?limit=100";
      if (investigationId) url += `&investigation_id=${investigationId}`;
      const res = await authFetch(url);
      const data = await res.json();
      const history = data.history || [];
      if (history.length === 0) {
        setTiElements([]);
        setTiLoading(false);
        return;
      }

      const els = [];

      const inv = investigationId ? ctiInvestigations.find(i => i.id === investigationId) : null;
      const rootLabel = inv ? inv.name : "All IOC Lookups";
      const rootColor = inv ? "#7c3aed" : "#3b82f6";

      // ── Root hub ──
      els.push({ data: { id: "ti-root", label: rootLabel, type: "threat_intel_hub", icon: cyberSecurityIcon, brandColor: rootColor } });

      // ── Source ring (connected to hub) ──
      const sourceNodes = [
        { id: "src-vt", label: "VirusTotal", icon: virusTotalIcon, color: "#394EFF" },
        { id: "src-sh", label: "Shodan", icon: shodanIcon, color: "#D1232A" },
        { id: "src-ab", label: "AbuseIPDB", icon: abuseipdbIcon, color: "#e74c3c" },
        { id: "src-otx", label: "AlienVault OTX", icon: alienvaultIcon, color: "#00B388" },
        { id: "src-ac", label: "abuse.ch", icon: abusechIcon, color: "#ff6600" },
        { id: "src-nvd", label: "NVD / CVE", icon: nvdIcon, color: "#002868" },
      ];
      sourceNodes.forEach(s => {
        els.push({ data: { ...s, type: "threat_intel_source" } });
        els.push({ data: { id: `e-root-${s.id}`, source: "ti-root", target: s.id, relationship: "feeds" } });
      });

      // ── IOC type groups ──
      const typeGroups = {};
      history.forEach(item => {
        const t = item.ioc_type || "unknown";
        if (!typeGroups[t]) typeGroups[t] = [];
        typeGroups[t].push(item);
      });

      const typeLabels = { ip: "IP Addresses", domain: "Domains", url: "URLs", hash: "File Hashes", cve: "CVEs" };

      Object.entries(typeGroups).forEach(([type, items]) => {
        const groupId = `type-${type}`;
        els.push({
          data: {
            id: groupId,
            label: `${typeLabels[type] || type} (${items.length})`,
            type: "threat_intel_group",
            icon: iocTypeIcons[type] || shieldIcon,
            brandColor: iocTypeColors[type] || "#6b7280",
          }
        });
        els.push({ data: { id: `e-root-${groupId}`, source: "ti-root", target: groupId, relationship: `${items.length} IOCs` } });

        // ── Severity subgroups within each type ──
        const sevGroups = {};
        items.forEach(item => {
          const sev = item.threat_score?.severity || "unknown";
          if (!sevGroups[sev]) sevGroups[sev] = [];
          sevGroups[sev].push(item);
        });

        // Sort severity: critical first
        const sevOrder = ["critical", "high", "medium", "low", "clean", "unknown"];
        const sortedSevEntries = Object.entries(sevGroups).sort(
          (a, b) => sevOrder.indexOf(a[0]) - sevOrder.indexOf(b[0])
        );

        sortedSevEntries.forEach(([sev, sevItems]) => {
          const sevId = `${groupId}-${sev}`;
          els.push({
            data: {
              id: sevId,
              label: `${sev.toUpperCase()} (${sevItems.length})`,
              type: "threat_intel_severity",
              icon: sevIcons[sev] || shieldIcon,
              brandColor: sevColors[sev] || "#6b7280",
              severity: sev,
            }
          });
          els.push({ data: { id: `e-${groupId}-${sevId}`, source: groupId, target: sevId, relationship: sev } });

          // ── Individual IOC leaf nodes ──
          sevItems.forEach((item, idx) => {
            const score = item.threat_score?.score ?? 0;
            const iocId = `ioc-${type}-${sev}-${idx}`;
            const iocLabel = item.ioc.length > 30 ? item.ioc.substring(0, 30) + "..." : item.ioc;
            els.push({
              data: {
                id: iocId,
                label: iocLabel,
                type: "threat_intel",
                ioc_type: type,
                threat_score: score,
                severity: sev,
                icon: iocTypeIcons[type] || shieldIcon,
                brandColor: sevColors[sev] || "#6b7280",
                fullIoc: item.ioc,
              }
            });
            els.push({ data: { id: `e-${sevId}-${iocId}`, source: sevId, target: iocId, relationship: `${score}/100` } });
          });
        });
      });

      setTiElements(els);
    } catch (e) {
      console.error("Failed to load CTI graph:", e);
      setTiElements([]);
    } finally {
      setTiLoading(false);
    }
  };

  // Fetch available identifiers on mount
  useEffect(() => {
    const fetchIdentifiers = async () => {
      try {
        const res = await authFetch("/api/list-identifiers");
        const data = await res.json();
        if (data.identifiers && data.identifiers.length) {
          setIdentifiers(data.identifiers);
          setSelectedIdentifier(data.identifiers[0].identifier);
        }
      } catch (err) {
        console.error("Error fetching identifiers:", err);
        setError("Failed to load identifiers");
      }
    };

    fetchIdentifiers();
  }, []);

  // Fetch correlation data when identifier changes
  useEffect(() => {
    if (!selectedIdentifier) return;

    const fetchCorrelation = async () => {
      setLoading(true);
      setError("");
      setNoCorrelation(false);
      setSelectedNode(null);
      try {
        const res = await authFetch(
          `/api/get-correlation/${selectedIdentifier}`
        );
        if (res.status === 404) {
          setNoCorrelation(true);
          setCorrelationData(null);
          setElements([]);
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setCorrelationData(null);
          setElements([]);
        } else {
          setCorrelationData(data);
          const graph = transformCorrelationToGraph(data);
          const cytoscapeElements = convertGraphToCytoscape(graph);
          setElements(cytoscapeElements);
        }
      } catch (err) {
        console.error("Error fetching correlation:", err);
        setError("Failed to load correlation data");
      } finally {
        setLoading(false);
      }
    };

    fetchCorrelation();
  }, [selectedIdentifier]);

  const runCorrelationForCurrentIdentifier = async () => {
    if (!selectedIdentifier) return;
    setLoading(true);
    setError("");
    setNoCorrelation(false);
    try {
      const res = await authFetch("/api/run-correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: selectedIdentifier,
          mode: "deep",
          backend: "auto",
        }),
      });
      const data = await res.json();
      if (data && data.status === "success" && data.result) {
        const full = { identifier: selectedIdentifier, result: data.result };
        setCorrelationData(full);
        const graph = transformCorrelationToGraph(full);
        const cytoscapeElements = convertGraphToCytoscape(graph);
        setElements(cytoscapeElements);
        setNoCorrelation(false);
      } else if (data && data.status === "error") {
        setError(data.error || "Correlation failed.");
      } else if (data && data.error) {
        setError(data.error);
      } else {
        setError("Unknown response while running correlation.");
      }
    } catch (e) {
      console.error("Error running correlation from visualization:", e);
      setError("Server error while running correlation.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch investigations when switching to CTI mode
  useEffect(() => {
    if (graphMode === "cti") {
      fetchCtiInvestigations();
    }
  }, [graphMode]);

  // Load CTI graph when mode, investigation, or investigation list changes
  useEffect(() => {
    if (graphMode === "cti") {
      loadCTIGraph(selectedInvestigation || undefined);
    }
  }, [graphMode, selectedInvestigation, ctiInvestigations]);

  // Handle node selection
  const handleNodeSelect = (node) => {
    if (node && node.isNode && !node.isEdge()) {
      setSelectedNode({
        id: node.id(),
        label: node.data("label"),
        type: node.data("type"),
        bio: node.data("bio"),
        location: node.data("location"),
        platform: node.data("platform"),
        compromised: node.data("compromised"),
        url: node.data("url"),
        stars: node.data("stars"),
        description: node.data("description"),
        date: node.data("date"),
        relationship: node.data("relationship"),
        metrics: node.data("metrics"),
      });
      setShowNodeDetails(true);
      node.select();
    }
  };

  // (Export/download controls removed per latest requirements)

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? "bg-gray-950" : "bg-gray-100"}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Compact Top Bar */}
        {showTopPanel && (
          <motion.div
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            className={`px-6 py-4 flex-shrink-0 border-b ${
              isDark
                ? "bg-gradient-to-r from-gray-900 to-gray-800 border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            <Topbar />
          </motion.div>
        )}

        {/* Control Header - Compact */}
        {!loading && !error && (
          <div
            className={`border-b px-6 py-3 flex-shrink-0 flex items-center gap-6 ${
              isDark ? "bg-gray-900 border-white/10" : "bg-white border-gray-200"
            }`}
          >
            {/* Graph Mode Toggle */}
            <div className="flex-shrink-0">
              <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">
                Graph Mode
              </label>
              <div className={`inline-flex rounded-xl p-0.5 ${isDark ? "bg-gray-800/80 ring-1 ring-white/5" : "bg-gray-200 ring-1 ring-gray-300"}`}>
                <button
                  onClick={() => setGraphMode("osint")}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                    graphMode === "osint"
                      ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/30"
                      : isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  OSINT
                </button>
                <button
                  onClick={() => setGraphMode("cti")}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 ${
                    graphMode === "cti"
                      ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-600/30"
                      : isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  Threat Intel
                </button>
              </div>
            </div>

            {/* Profile selector — only for OSINT mode */}
            {graphMode === "osint" && (
            <div className="flex-1">
              <label className="text-xs text-gray-500 uppercase tracking-wide block mb-1">
                Select Profile
              </label>
              <select
                value={selectedIdentifier}
                onChange={(e) => setSelectedIdentifier(e.target.value)}
                className={`px-3 py-1.5 rounded text-sm focus:outline-none focus:border-blue-400 transition w-full md:w-64 border ${
                  isDark
                    ? "bg-black/40 border-gray-600 text-white"
                    : "bg-white border-gray-300 text-gray-900"
                }`}
              >
                <option value="">-- Choose profile --</option>
                {identifiers.map((ident) => (
                  <option key={ident.identifier} value={ident.identifier}>
                    {ident.identifier} ({ident.platforms.length} sources)
                  </option>
                ))}
              </select>
            </div>
            )}

            {/* Investigation selector — only for CTI mode */}
            {graphMode === "cti" && (
              <div className="flex-1 flex items-center gap-4">
                <div className="flex-1 max-w-sm">
                  <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1 font-bold">
                    View Scope
                  </label>
                  <select
                    value={selectedInvestigation}
                    onChange={(e) => setSelectedInvestigation(e.target.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm focus:outline-none transition w-full border ${
                      isDark
                        ? "bg-black/40 border-gray-600 text-white focus:border-purple-400"
                        : "bg-white border-gray-300 text-gray-900 focus:border-purple-500"
                    }`}
                  >
                    <option value="">All IOC Lookups (Global)</option>
                    {ctiInvestigations.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name} ({inv.ioc_count || 0} IOCs)
                      </option>
                    ))}
                  </select>
                </div>
                {selectedInvestigation && (() => {
                  const inv = ctiInvestigations.find(i => i.id === selectedInvestigation);
                  if (!inv) return null;
                  return (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30">
                        {inv.status || "active"}
                      </span>
                      {inv.tags?.map((tag, i) => (
                        <span key={i} className={`px-1.5 py-0.5 rounded text-[10px] ${isDark ? "bg-gray-800 text-gray-400" : "bg-gray-200 text-gray-600"}`}>
                          #{tag}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Quick Summary (OSINT mode only) */}
                {graphMode === "osint" && correlationData && (
                  <div className="flex-shrink-0 flex gap-4 items-center">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Profile</div>
                      <div
                        className={`text-sm font-semibold ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}
                      >
                    {correlationData.result?.name || selectedIdentifier}
                  </div>
                </div>
                {correlationData.result?.usernames && (
                  <div className="hidden md:block text-right max-w-xs">
                    <div className="text-xs text-gray-500">Usernames</div>
                        <div
                          className={`text-[11px] truncate ${
                            isDark ? "text-gray-300" : "text-gray-700"
                          }`}
                        >
                      {(() => {
                        const u = correlationData.result.usernames;
                        if (Array.isArray(u)) return u.join(", ");
                        if (typeof u === "object") {
                          const parts = Object.entries(u)
                            .map(([plat, obj]) => {
                              const h = obj?.handle || obj;
                              return h ? `${plat}: @${String(h).replace(/^@/, "")}` : null;
                            })
                            .filter(Boolean);
                          return parts.join(" b7 ");
                        }
                        return String(u);
                      })()}
                    </div>
                  </div>
                )}
                {correlationData.result?.compromised && (
                  <div className="bg-gradient-to-r from-red-950 to-red-900 border border-red-600/60 px-3 py-1.5 rounded-md text-red-200 text-xs font-bold shadow-lg flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></span>
                    COMPROMISED
                  </div>
                )}
                <button
                  onClick={() => setShowTopPanel(!showTopPanel)}
                  className="text-gray-500 hover:text-white text-xs"
                >
                  {showTopPanel ? "Hide" : "Show"}
                </button>
              </div>
            )}

            {/* CTI mode summary stats */}
            {graphMode === "cti" && tiElements.length > 0 && (
              <div className="flex items-center gap-4 flex-shrink-0">
                {(() => {
                  const nodes = tiElements.filter(e => e.data && !e.data.source);
                  const iocs = nodes.filter(n => n.data.type === "threat_intel");
                  const crit = iocs.filter(n => n.data.severity === "critical").length;
                  const high = iocs.filter(n => n.data.severity === "high").length;
                  return (
                    <>
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">IOCs</div>
                        <div className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{iocs.length}</div>
                      </div>
                      {crit > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-500/10 ring-1 ring-red-500/20">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-xs font-bold text-red-400">{crit} Critical</span>
                        </div>
                      )}
                      {high > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-500/10 ring-1 ring-orange-500/20">
                          <div className="w-2 h-2 bg-orange-500 rounded-full" />
                          <span className="text-xs font-bold text-orange-400">{high} High</span>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Sources</div>
                        <div className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>6</div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Page navigation */}
            <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
              <button onClick={() => navigate("/intelligence")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
                &larr; Threat Intel
              </button>
              <button onClick={() => navigate("/reports")} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-blue-600 hover:bg-blue-500 text-white"}`}>
                Reports &rarr;
              </button>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {/* Error State */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-20">
              <div className="bg-gradient-to-br from-red-950 via-slate-900 to-slate-950 border border-red-600/40 rounded-lg p-8 max-w-md shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-red-600/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-red-300">Error</h3>
                </div>
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={() => navigate("/datacorrelation")}
                  className="w-full px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-medium transition"
                >
                  Go to Correlation
                </button>
              </div>
            </div>
          )}

          {/* No-correlation State with quick action (OSINT mode only) */}
          {graphMode === "osint" && noCorrelation && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-20">
              <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-blue-500/40 rounded-lg p-8 max-w-md shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-blue-600/30 rounded-lg flex items-center justify-center">
                    <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M13 7H7v6h6V7z" />
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-3-9a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H8a1 1 0 01-1-1V9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-blue-300">No Correlation Yet</h3>
                </div>
                <p className="text-blue-100 mb-4 text-sm">
                  OSINT has been collected for this profile, but no correlation analysis exists yet. You can run a deep correlation now using the current
                  backend strategy, or open the Data Correlation page for advanced options.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={runCorrelationForCurrentIdentifier}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium transition"
                  >
                    Run Deep Correlation Now
                  </button>
                  <button
                    onClick={() => navigate("/datacorrelation")}
                    className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded font-medium transition"
                  >
                    Go to Data Correlation
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-20">
              <div className="text-center">
                <div className="inline-block animate-spin mb-4">
                  <div className="text-5xl">⚙️</div>
                </div>
                <p className="text-gray-300 text-lg">Loading intelligence graph...</p>
              </div>
            </div>
          )}

          {/* CTI Graph Mode */}
          {graphMode === "cti" && !tiLoading && tiElements.length > 0 && (
            <>
              <CytoscapeComponent
                elements={tiElements}
                style={{ width: "100%", height: "100%" }}
                layout={{
                  name: "cose-bilkent",
                  animate: "end",
                  animationDuration: 600,
                  fit: true,
                  padding: 70,
                  nodeDimensionsIncludeLabels: true,
                  nodeRepulsion: 14000,
                  idealEdgeLength: 160,
                  edgeElasticity: 0.35,
                  nestingFactor: 0.1,
                  gravity: 0.15,
                  numIter: 3000,
                  tile: true,
                  tilingPaddingVertical: 30,
                  tilingPaddingHorizontal: 30,
                  gravityRangeCompound: 1.5,
                  gravityCompound: 1.0,
                  gravityRange: 4.0,
                  initialEnergyOnIncremental: 0.3,
                }}
                stylesheet={[
                  // ── Base node styling ──
                  {
                    selector: "node",
                    style: {
                      "background-color": (ele) => ele.data("brandColor") || "#6b7280",
                      "background-opacity": 0.95,
                      "label": "data(label)",
                      "font-size": (ele) => {
                        const t = ele.data("type");
                        if (t === "threat_intel_hub") return 13;
                        if (t === "threat_intel_source") return 10;
                        if (t === "threat_intel_group") return 11;
                        if (t === "threat_intel_severity") return 10;
                        return 9;
                      },
                      "font-weight": "bold",
                      "color": isDark ? "#e5e7eb" : "#1e293b",
                      "text-valign": "bottom",
                      "text-halign": "center",
                      "text-margin-y": 8,
                      "text-outline-color": isDark ? "#020617" : "#f8fafc",
                      "text-outline-width": 2.5,
                      "border-width": (ele) => {
                        const t = ele.data("type");
                        if (t === "threat_intel_hub") return 3;
                        if (t === "threat_intel_source" || t === "threat_intel_group") return 2.5;
                        return 2;
                      },
                      "border-color": (ele) => ele.data("brandColor") || "#64748b",
                      "border-opacity": 0.8,
                      "width": (ele) => {
                        const t = ele.data("type");
                        if (t === "threat_intel_hub") return 64;
                        if (t === "threat_intel_source") return 44;
                        if (t === "threat_intel_group") return 48;
                        if (t === "threat_intel_severity") return 38;
                        return 28;
                      },
                      "height": (ele) => {
                        const t = ele.data("type");
                        if (t === "threat_intel_hub") return 64;
                        if (t === "threat_intel_source") return 44;
                        if (t === "threat_intel_group") return 48;
                        if (t === "threat_intel_severity") return 38;
                        return 28;
                      },
                      "shape": (ele) => {
                        const t = ele.data("type");
                        if (t === "threat_intel_hub") return "hexagon";
                        if (t === "threat_intel_source") return "round-rectangle";
                        if (t === "threat_intel_group") return "round-rectangle";
                        if (t === "threat_intel_severity") return "diamond";
                        return "ellipse";
                      },
                      "overlay-padding": 5,
                      "overlay-opacity": 0,
                    },
                  },
                  // ── Icon nodes ──
                  {
                    selector: "node[icon]",
                    style: {
                      "background-image": "data(icon)",
                      "background-fit": "contain",
                      "background-position-x": "50%",
                      "background-position-y": "50%",
                      "background-clip": "node",
                      "background-image-containment": "over",
                      "background-width": "65%",
                      "background-height": "65%",
                    },
                  },
                  // ── Hover / select ──
                  {
                    selector: "node:hover, node:selected",
                    style: {
                      "overlay-opacity": 0.2,
                      "overlay-color": "#3b82f6",
                      "z-index": 9999,
                      "text-opacity": 1,
                      "border-width": 3,
                    },
                  },
                  // ── Edges ──
                  {
                    selector: "edge",
                    style: {
                      "width": (ele) => {
                        const src = ele.source().data("type");
                        if (src === "threat_intel_hub") return 2.5;
                        if (src === "threat_intel_group" || src === "threat_intel_source") return 2;
                        return 1.5;
                      },
                      "line-color": (ele) => {
                        const tgtColor = ele.target().data("brandColor");
                        return tgtColor ? tgtColor + "60" : (isDark ? "rgba(100,116,139,0.3)" : "rgba(148,163,184,0.4)");
                      },
                      "curve-style": "bezier",
                      "target-arrow-shape": "triangle",
                      "target-arrow-color": (ele) => {
                        const tgtColor = ele.target().data("brandColor");
                        return tgtColor ? tgtColor + "80" : (isDark ? "rgba(100,116,139,0.5)" : "rgba(148,163,184,0.6)");
                      },
                      "arrow-scale": 0.8,
                      "label": "data(relationship)",
                      "font-size": 7,
                      "text-rotation": "autorotate",
                      "text-opacity": 0.4,
                      "color": isDark ? "#64748b" : "#94a3b8",
                      "text-outline-color": isDark ? "#020617" : "#f8fafc",
                      "text-outline-width": 1,
                    },
                  },
                ]}
                cy={(cy) => {
                  cyRef.current = cy;
                  cy.on("tap", "node", (e) => {
                    const node = e.target;
                    setSelectedNode({
                      id: node.id(),
                      label: node.data("label"),
                      type: node.data("type"),
                      severity: node.data("severity"),
                      threat_score: node.data("threat_score"),
                      ioc_type: node.data("ioc_type"),
                      fullIoc: node.data("fullIoc"),
                    });
                    setShowNodeDetails(true);
                  });
                  cy.on("tap", (e) => {
                    if (e.target === cy) {
                      setShowNodeDetails(false);
                      setSelectedNode(null);
                    }
                  });
                }}
              />
            </>
          )}

          {/* CTI Graph Legend */}
          {graphMode === "cti" && !tiLoading && tiElements.length > 0 && (
            <div className={`absolute bottom-4 left-4 z-20 rounded-xl p-3 border backdrop-blur-md ${isDark ? "bg-gray-900/80 border-white/10" : "bg-white/90 border-gray-200 shadow-lg"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>CTI Graph Legend</p>
              <div className="space-y-1.5">
                <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Node Shapes</p>
                {[
                  { shape: "hexagon", color: "#7c3aed", label: "Hub (root)" },
                  { shape: "rounded-rect", color: "#394EFF", label: "Source" },
                  { shape: "rounded-rect", color: "#3b82f6", label: "IOC Type Group" },
                  { shape: "diamond", color: "#f97316", label: "Severity Group" },
                  { shape: "circle", color: "#ef4444", label: "IOC (leaf)" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-3 h-3 flex-shrink-0" style={{ backgroundColor: item.color, borderRadius: item.shape === "circle" ? "50%" : item.shape === "diamond" ? "2px" : "3px", transform: item.shape === "diamond" ? "rotate(45deg) scale(0.8)" : "none" }} />
                    <span className={`text-[10px] ${isDark ? "text-gray-400" : "text-gray-600"}`}>{item.label}</span>
                  </div>
                ))}
                <div className={`border-t pt-1.5 mt-1.5 ${isDark ? "border-white/10" : "border-gray-200"}`}>
                  <p className={`text-[9px] uppercase tracking-wider font-semibold mb-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Severity</p>
                  {[
                    { color: "#ef4444", label: "Critical" },
                    { color: "#f97316", label: "High" },
                    { color: "#eab308", label: "Medium" },
                    { color: "#3b82f6", label: "Low" },
                    { color: "#22c55e", label: "Clean" },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                      <span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-500"}`}>{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {graphMode === "cti" && !tiLoading && tiElements.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <svg xmlns="http://www.w3.org/2000/svg" className={`w-16 h-16 mx-auto mb-4 ${isDark ? "text-gray-600" : "text-gray-400"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <h3 className={`text-lg font-semibold mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  {selectedInvestigation ? "No IOCs in This Investigation" : "No Threat Intel Data"}
                </h3>
                <p className={`text-sm mb-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {selectedInvestigation
                    ? "This investigation has no IOC lookups yet. Go to Threat Intel, select this investigation, and analyze some IOCs."
                    : "Run IOC lookups on the Threat Intel page first. You can also create an Investigation to organize IOCs into focused groups."}
                </p>
                {ctiInvestigations.length > 0 && !selectedInvestigation && (
                  <p className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                    You have {ctiInvestigations.length} investigation(s) — try selecting one from the dropdown above.
                  </p>
                )}
              </div>
            </div>
          )}

          {graphMode === "cti" && tiLoading && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <svg className="w-8 h-8 animate-spin mx-auto mb-3 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-25"/><path d="M4 12a8 8 0 018-8" strokeWidth="3"/></svg>
                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>Loading CTI graph...</p>
              </div>
            </div>
          )}

          {/* OSINT Graph Container */}
          {graphMode === "osint" && !loading && !error && elements.length > 0 && (
            <>
              <CytoscapeComponent
                elements={elements}
                style={{ width: "100%", height: "100%" }}
                layout={{
                  name: "cose-bilkent",
                  animate: "end",
                  animationDuration: 500,
                  fit: true,
                  padding: 60,
                  nodeDimensionsIncludeLabels: true,
                  nodeRepulsion: 8000,
                  idealEdgeLength: 120,
                  edgeElasticity: 0.45,
                  nestingFactor: 0.1,
                  gravity: 0.25,
                  numIter: 2500,
                  tile: true,
                  tilingPaddingVertical: 20,
                  tilingPaddingHorizontal: 20,
                  gravityRangeCompound: 1.5,
                  gravityCompound: 1.0,
                  gravityRange: 3.8,
                  initialEnergyOnIncremental: 0.3,
                }}
                stylesheet={[
                  {
                    selector: "node",
                    style: {
                      "background-color": (ele) => getNodeColor(ele.data("type")),
                      "background-opacity": 0.95,
                      "label": "data(label)",
                      "font-size": 11,
                      "font-weight": "bold",
                      "color": isDark ? "#e5e7eb" : "#0f172a",
                      "text-valign": "center",
                      "text-halign": "center",
                      "text-outline-color": isDark ? "#020617" : "#e5e7eb",
                      "text-outline-width": 2,
                      "text-opacity": 0,
                      "border-width": 1.5,
                      "border-color": "rgba(148, 163, 184, 0.6)",
                      "width": (ele) => {
                        const type = ele.data("type");
                        if (type === "user") return 44;
                        if (["repository", "post", "connection"].includes(type)) return 32;
                        return 24;
                      },
                      "height": (ele) => {
                        const type = ele.data("type");
                        if (type === "user") return 44;
                        if (["repository", "post", "connection"].includes(type)) return 32;
                        return 24;
                      },
                      "overlay-padding": 4,
                      "overlay-color": "rgba(15, 23, 42, 0.5)",
                      "overlay-opacity": 0,
                    },
                  },
                  {
                    selector: "node:hover, node:selected",
                    style: {
                      "text-opacity": 1,
                      "z-index": 9999,
                      "overlay-opacity": 0.35,
                    },
                  },
                  {
                    selector: "node[icon]",
                    style: {
                      "background-image": "data(icon)",
                      // Professional, centered glyph inside a flat dark tile
                      "background-fit": "contain",
                      "background-position-x": "50%",
                      "background-position-y": "50%",
                      "background-clip": "node",
                      "background-color": "#020617",
                      "background-opacity": 1,
                      "shape": "ellipse",
                      "border-width": 2,
                      "border-color": "#020617",
                      "width": 44,
                      "height": 44,
                      "label": "data(label)",
                      "font-size": 9,
                      "color": isDark ? "#e5e7eb" : "#0f172a",
                      "text-valign": "bottom",
                      "text-halign": "center",
                      "text-margin-y": 10,
                      "text-outline-width": 0,
                      "text-opacity": 1,
                      // Minimal shadow for subtle separation (more professional)
                      "shadow-blur": 6,
                      "shadow-color": "rgba(15,23,42,0.9)",
                      "shadow-opacity": 0.6,
                      "shadow-offset-x": 0,
                      "shadow-offset-y": 2,
                      "z-index": 9999,
                    },
                  },
                  {
                    // Make X/Twitter nodes extra crisp: dark circle, no glow.
                    selector: "node[platformSlug = 'x']",
                    style: {
                      "border-color": "#020617",
                      "border-width": 2,
                      "shadow-blur": 0,
                      "shadow-opacity": 0,
                    },
                  },
                  {
                    // Improve LinkedIn contrast: dark center with blue ring
                    selector: "node[platformSlug = 'linkedin']",
                    style: {
                      "border-color": "#0A66C2",
                      "border-width": 2.5,
                    },
                  },
                  {
                    // Nudge Wikipedia icon slightly so the W feels centered
                    selector: "node[platformSlug = 'wikipedia']",
                    style: {
                      "background-position-y": "55%",
                      "background-fit": "contain",
                    },
                  },
                  {
                    // Location node: teal border with map icon styling
                    selector: "node[platformSlug = 'location']",
                    style: {
                      "border-color": "#14b8a6",
                      "border-width": 3,
                      "background-color": "#020617",
                      "shadow-blur": 10,
                      "shadow-color": "rgba(20, 184, 166, 0.6)",
                      "shadow-opacity": 1,
                    },
                  },
                  {
                    // Snapchat node: yellow border
                    selector: "node[platformSlug = 'snapchat']",
                    style: {
                      "border-color": "#FFFC00",
                      "border-width": 2.5,
                      "background-color": "#020617",
                    },
                  },
                  {
                    // About/Interest node: lime green border
                    selector: "node[platformSlug = 'about']",
                    style: {
                      "border-color": "#84cc16",
                      "border-width": 2.5,
                      "background-color": "#020617",
                      "shadow-blur": 8,
                      "shadow-color": "rgba(132, 204, 22, 0.5)",
                      "shadow-opacity": 1,
                    },
                  },
                  {
                    // Description/Timeline node: fuchsia border
                    selector: "node[platformSlug = 'description']",
                    style: {
                      "border-color": "#d946ef",
                      "border-width": 2.5,
                      "background-color": "#020617",
                      "shadow-blur": 8,
                      "shadow-color": "rgba(217, 70, 239, 0.5)",
                      "shadow-opacity": 1,
                    },
                  },
                  {
                    selector: "node[type = 'user']",
                    style: {
                      "width": 54,
                      "height": 54,
                      "border-width": 4,
                      "border-color": "#eab308",
                      // Show profile image in center with subtle glow
                      "background-image": profileImage,
                      "background-fit": "cover",
                      "background-position-x": "50%",
                      "background-position-y": "50%",
                      "background-clip": "node",
                      "background-color": "#020617",
                      "shadow-blur": 12,
                      "shadow-color": "rgba(56,189,248,0.7)",
                      "shadow-opacity": 1,
                      "shadow-offset-x": 0,
                      "shadow-offset-y": 0,
                      // Put the name below the circle for a cleaner look
                      "text-valign": "bottom",
                      "text-halign": "center",
                      "text-margin-y": 10,
                      "text-outline-width": 0,
                      "text-opacity": 1,
                    },
                  },
                  {
                    selector: "edge",
                    style: {
                      "width": 2,
                      "line-color": isDark
                        ? "rgba(148, 163, 184, 0.35)"
                        : "rgba(100, 116, 139, 0.85)",
                      "target-arrow-color": isDark
                        ? "rgba(148, 163, 184, 0.45)"
                        : "rgba(100, 116, 139, 0.95)",
                      "target-arrow-shape": "triangle",
                      "curve-style": "bezier",
                      "label": "data(relationship)",
                      "font-size": 9,
                      "color": isDark
                        ? "rgba(226, 232, 240, 0.75)"
                        : "rgba(31, 41, 55, 0.9)",
                      "edge-text-rotation": "autorotate",
                      "text-opacity": 0,
                      "text-background-color": isDark
                        ? "rgba(15, 23, 42, 0.9)"
                        : "rgba(255, 255, 255, 0.95)",
                      "text-background-padding": 3,
                      "text-background-opacity": 1,
                      "text-border-color": isDark
                        ? "rgba(71, 85, 105, 0.6)"
                        : "rgba(148, 163, 184, 0.7)",
                      "text-border-width": 1,
                    },
                  },
                  {
                    selector: "edge:selected",
                    style: {
                      "line-color": "rgba(6, 182, 212, 0.9)",
                      "target-arrow-color": "rgba(6, 182, 212, 0.9)",
                      "width": 3,
                      "text-opacity": 1,
                      "shadow-blur": 18,
                      "shadow-color": "rgba(6, 182, 212, 0.8)",
                      "shadow-opacity": 1,
                    },
                  },
                ]}
                cy={(cy) => {
                  cyRef.current = cy;
                  cy.on("tap", "node", (evt) => handleNodeSelect(evt.target));
                  cy.layout({ name: "concentric", animate: true, animationDuration: 500 }).run();
                }}
              />

              {/* Info Panel - Top Right */}
              {correlationData && (
                <div
                  className={`absolute top-6 right-6 backdrop-blur-md rounded-lg p-4 max-w-sm z-10 text-xs ${
                    isDark
                      ? "bg-black/70 border border-blue-500/30 text-gray-300"
                      : "bg-white/95 border border-blue-200 text-gray-800 shadow-lg"
                  }`}
                >
                  <h3
                    className={`text-sm font-bold mb-3 ${
                      isDark ? "text-blue-300" : "text-blue-700"
                    }`}
                  >
                    📋 Intelligence Summary
                  </h3>
                  <p
                    className={`leading-relaxed mb-3 ${
                      isDark ? "text-gray-300" : "text-gray-700"
                    }`}
                  >
                    {correlationData.result?.summary}
                  </p>
                  {correlationData.result?.primary_location && (
                    <div className="mb-2">
                      <span className="text-gray-500">📍 Location:</span>
                      <span
                        className={`ml-2 ${isDark ? "text-gray-300" : "text-gray-800"}`}
                      >
                        {correlationData.result.primary_location}
                      </span>
                    </div>
                  )}
                  {correlationData.result?.possible_interests && (
                    <div>
                      <span className="text-gray-500">🎯 Interests:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {correlationData.result.possible_interests.slice(0, 3).map((interest, i) => (
                          <span
                            key={i}
                            className={`px-2 py-1 rounded text-xs ${
                              isDark
                                ? "bg-blue-900/40 text-blue-300"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Social Icon Legend - Bottom Right */}
              <div
                className={`absolute bottom-6 right-6 backdrop-blur-md rounded-lg p-3 text-[11px] z-10 ${
                  isDark
                    ? "bg-black/70 border border-white/10 text-gray-300"
                    : "bg-white/95 border border-gray-200 text-gray-700 shadow-lg"
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <img
                      src={
                        isDark
                          ? "https://cdn.simpleicons.org/github/ffffff"
                          : "https://cdn.simpleicons.org/github/000000"
                      }
                      alt="GitHub"
                      className={`w-5 h-5 rounded-full border ${
                        isDark ? "border-white bg-black" : "border-gray-800 bg-white"
                      }`}
                    />
                    <span>GitHub</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://cdn.simpleicons.org/x/1DA1F2"
                      alt="X"
                      className="w-5 h-5 rounded-full border border-black"
                    />
                    <span>X</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://cdn.simpleicons.org/reddit/FF4500"
                      alt="Reddit"
                      className="w-5 h-5 rounded-full border border-black"
                    />
                    <span>Reddit</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png"
                      alt="LinkedIn"
                      className="w-5 h-5 rounded border border-black bg-black"
                    />
                    <span>LinkedIn</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://cdn.simpleicons.org/snapchat/FFFC00"
                      alt="Snapchat"
                      className="w-5 h-5 rounded-full border border-black bg-yellow-400"
                    />
                    <span>Snapchat</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://cdn.simpleicons.org/stackoverflow/F48024"
                      alt="StackOverflow"
                      className="w-5 h-5 rounded border border-black"
                    />
                    <span>SO</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://cdn.simpleicons.org/youtube/FF0000"
                      alt="YouTube"
                      className="w-5 h-5 rounded-full border border-black"
                    />
                    <span>YouTube</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <img
                      src="https://cdn.simpleicons.org/wikipedia/000000"
                      alt="Wikipedia"
                      className="w-5 h-5 rounded-full border border-black bg-white"
                    />
                    <span>Wiki</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs">📍</span>
                    <span>Location</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Empty State (OSINT mode only) */}
          {graphMode === "osint" && !loading && !error && elements.length === 0 && selectedIdentifier && (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-black/60 via-slate-900/40 to-black/60 backdrop-blur-sm">
              <div className="text-center bg-slate-900/40 backdrop-blur-sm border border-white/5 rounded-2xl p-12 max-w-md">
                <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-gray-300 text-lg font-semibold">No intelligence graph available</p>
                <p className="text-gray-500 text-sm mt-2">Run data correlation first to visualize the network</p>
              </div>
            </div>
          )}
        </div>

        {/* Node Details Sidebar */}
        <AnimatePresence>
          {showNodeDetails && selectedNode && (
            <motion.div
              initial={{ x: 500, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 500, opacity: 0 }}
              transition={{ type: "spring", damping: 25 }}
              className={`absolute right-0 top-0 bottom-0 w-96 border-l shadow-2xl overflow-y-auto z-30 ${
                isDark
                  ? "bg-gradient-to-b from-gray-800 via-gray-900 to-black border-white/10"
                  : "bg-white border-gray-200"
              }`}
            >
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowNodeDetails(false);
                  if (cyRef.current) {
                    cyRef.current.$(`#${selectedNode.id}`).unselect();
                  }
                }}
                className="absolute top-4 right-4 bg-gradient-to-br from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white rounded-lg w-8 h-8 flex items-center justify-center transition shadow-lg z-10"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              {/* Content */}
              <div className="p-6 pt-12">
                {/* Title */}
                <h2
                  className={`text-2xl font-bold mb-1 ${
                    isDark ? "text-white" : "text-gray-900"
                  }`}
                >
                  {selectedNode.label}
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Type: <span className="text-blue-300 font-semibold capitalize">{selectedNode.type?.replace(/_/g, " ")}</span>
                </p>

                {/* TI-specific details */}
                {(selectedNode.type?.startsWith("threat_intel")) && (
                  <div className="mb-4 space-y-3">
                    {/* Threat Score Gauge */}
                    {selectedNode.threat_score !== undefined && selectedNode.threat_score !== null && (
                      <div className={`p-4 rounded-xl border ${isDark ? "bg-gray-800/60 border-white/5" : "bg-gray-50 border-gray-200"}`}>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Threat Score</p>
                        <div className="flex items-end gap-3">
                          <span className="text-4xl font-black tabular-nums" style={{
                            color: selectedNode.threat_score >= 80 ? "#ef4444" : selectedNode.threat_score >= 60 ? "#f97316" : selectedNode.threat_score >= 40 ? "#eab308" : selectedNode.threat_score >= 20 ? "#3b82f6" : "#22c55e"
                          }}>
                            {selectedNode.threat_score}
                          </span>
                          <span className="text-xs text-gray-500 mb-1.5">/ 100</span>
                        </div>
                        <div className={`mt-2 h-2 rounded-full overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-200"}`}>
                          <div className="h-full rounded-full transition-all duration-500" style={{
                            width: `${selectedNode.threat_score}%`,
                            background: selectedNode.threat_score >= 80 ? "linear-gradient(90deg, #ef4444, #dc2626)" : selectedNode.threat_score >= 60 ? "linear-gradient(90deg, #f97316, #ea580c)" : selectedNode.threat_score >= 40 ? "linear-gradient(90deg, #eab308, #ca8a04)" : selectedNode.threat_score >= 20 ? "linear-gradient(90deg, #3b82f6, #2563eb)" : "linear-gradient(90deg, #22c55e, #16a34a)"
                          }} />
                        </div>
                      </div>
                    )}

                    {/* Severity Badge */}
                    {selectedNode.severity && (
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide ${
                          selectedNode.severity === "critical" ? "bg-red-500/20 text-red-400 ring-1 ring-red-500/30" :
                          selectedNode.severity === "high" ? "bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30" :
                          selectedNode.severity === "medium" ? "bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500/30" :
                          selectedNode.severity === "low" ? "bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30" :
                          "bg-green-500/20 text-green-400 ring-1 ring-green-500/30"
                        }`}>{selectedNode.severity}</span>
                      </div>
                    )}

                    {/* Full IOC */}
                    {selectedNode.fullIoc && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Indicator of Compromise</p>
                        <p className={`text-sm font-mono break-all p-2 rounded-lg ${isDark ? "text-cyan-300 bg-gray-800/80" : "text-cyan-700 bg-gray-100"}`}>{selectedNode.fullIoc}</p>
                      </div>
                    )}

                    {/* IOC Type */}
                    {selectedNode.ioc_type && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">IOC Type</p>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${isDark ? "bg-gray-800 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: iocTypeColors[selectedNode.ioc_type] || "#6b7280" }} />
                          {selectedNode.ioc_type.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Main Info */}
                <div className="space-y-4">
                  {/* Compromise Status */}
                  {selectedNode.compromised !== undefined && (
                    <div className="p-3 rounded-lg" style={{
                      backgroundColor: selectedNode.compromised ? "rgba(220, 38, 38, 0.1)" : "rgba(34, 197, 94, 0.1)",
                      borderColor: selectedNode.compromised ? "rgba(220, 38, 38, 0.3)" : "rgba(34, 197, 94, 0.3)",
                      borderWidth: 1,
                    }}>
                      <div className="flex items-center gap-2">
                        {selectedNode.compromised ? (
                          <>
                            <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse"></div>
                            <span className="text-sm font-bold text-red-300">COMPROMISED</span>
                          </>
                        ) : (
                          <>
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            <span className="text-sm font-bold text-green-300">SECURE</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Bio */}
                  {selectedNode.bio && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        📝 Bio
                      </p>
                      <p className="text-sm text-gray-300 leading-relaxed">{selectedNode.bio}</p>
                    </div>
                  )}

                  {/* Location */}
                  {selectedNode.location && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        📍 Location
                      </p>
                      <p className="text-sm text-gray-300">{selectedNode.location}</p>
                    </div>
                  )}

                  {/* Platform */}
                  {selectedNode.platform && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        🌐 Platform
                      </p>
                      <p className="text-sm text-blue-300 font-semibold">{selectedNode.platform}</p>
                    </div>
                  )}

                  {/* URL */}
                  {selectedNode.url && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        🔗 URL
                      </p>
                      <a
                        href={selectedNode.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 break-all"
                      >
                        {selectedNode.url}
                      </a>
                    </div>
                  )}

                  {/* Stars (for repos) */}
                  {selectedNode.stars !== undefined && (
                    <div className="flex gap-4">
                      <div>
                        <p className="text-xs text-gray-500">⭐ Stars</p>
                        <p className="text-lg font-bold text-yellow-400">{selectedNode.stars}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">🍴 Forks</p>
                        <p className="text-lg font-bold text-green-400">{selectedNode.forks || "—"}</p>
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  {selectedNode.description && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        ℹ️ Description
                      </p>
                      <p className="text-sm text-gray-300 leading-relaxed">{selectedNode.description}</p>
                    </div>
                  )}

                  {/* Date */}
                  {selectedNode.date && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
                        📅 Date
                      </p>
                      <p className="text-sm text-gray-300">{selectedNode.date}</p>
                    </div>
                  )}

                  {/* Metrics */}
                  {selectedNode.metrics && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                        📊 Metrics
                      </p>
                      <div className="space-y-1">
                        {Object.entries(selectedNode.metrics).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="text-gray-500">{key}:</span>
                            <span className="text-blue-300 font-semibold">
                              {typeof value === "number" ? value : JSON.stringify(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Relationship */}
                  {selectedNode.relationship && (
                    <div className="bg-purple-900/20 border border-purple-500/30 p-2 rounded">
                      <p className="text-xs font-semibold text-purple-300">
                        🔗 {selectedNode.relationship}
                      </p>
                    </div>
                  )}
                </div>

                {/* Node ID */}
                <div className="mt-6 pt-4 border-t border-gray-700 text-xs text-gray-600">
                  ID: {selectedNode.id}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

/**
 * Convert graph data to Cytoscape format
 * and attach official social icons where possible
 */
const convertGraphToCytoscape = (graph) => {
  const elements = [];

  if (!graph) return elements;

  // Brand colors for Simple Icons CDN
  const brandColors = {
    github: "000000",
    twitter: "1DA1F2",
    x: "1DA1F2",
    reddit: "FF4500",
    linkedin: "0A66C2",
    youtube: "FF0000",
    wikipedia: "000000",
    website: "0ea5e9",
    medium: "000000",
    stackoverflow: "F48024",
    snapchat: "FFFC00",
    location: "14b8a6",
  };

  const hostToSlug = (url) => {
    try {
      if (!url) return null;
      const u = new URL(url);
      const h = u.hostname.toLowerCase();
      if (h.includes("github.com")) return "github";
      if (h.includes("twitter.com") || h.includes("x.com")) return "x";
      if (h.includes("reddit.com")) return "reddit";
      if (h.includes("linkedin.com")) return "linkedin";
      if (h.includes("youtube.com") || h.includes("youtu.be")) return "youtube";
      if (h.includes("wikipedia.org")) return "wikipedia";
      if (h.includes("medium.com")) return "medium";
      if (h.includes("stackoverflow.com")) return "stackoverflow";
      if (h.includes("snapchat.com")) return "snapchat";
      return null;
    } catch {
      return null;
    }
  };

  const platformToSlug = (p) => {
    if (!p) return null;
    const s = String(p).toLowerCase();
    if (s === "github" || s === "gh") return "github";
    if (s === "twitter" || s === "x") return "x";
    if (s === "reddit") return "reddit";
    if (s === "linkedin") return "linkedin";
    if (s === "youtube") return "youtube";
    if (s === "wikipedia" || s === "wiki") return "wikipedia";
    if (s === "website" || s === "personal_site" || s === "site") return "website";
    if (s === "medium") return "medium";
    if (s === "stack_overflow" || s === "stackoverflow") return "stackoverflow";
    if (s === "snapchat" || s === "snap") return "snapchat";
    return null;
  };

  const resolvedSlug = (platform, url) => platformToSlug(platform) || hostToSlug(url);

  const iconUrlFor = (platform, url) => {
    const slug = resolvedSlug(platform, url);
    if (!slug) return null;
    // Use local PNGs where available for consistent centering
    // GitHub: use your new local PNG icon
    if (slug === "github") return githubIcon;
    if (slug === "twitter" || slug === "x") return twitterIcon;
    if (slug === "reddit") return redditIcon;
    if (slug === "linkedin") return linkedinIcon;
    if (slug === "medium") return mediumIcon;
    if (slug === "stackoverflow") return stackOverflowIcon;
    if (slug === "wikipedia") return wikipediaIcon;
    if (slug === "snapchat") return snapchatIcon;
    // Personal website: keep globe emoji PNG (no local asset yet)
    if (slug === "website") {
      return "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f310.png";
    }
    // Wikipedia / YouTube: fall back to Simple Icons glyphs
    // (work well enough visually and are rarely off-center)
    return `https://cdn.simpleicons.org/${slug}/ffffff`;
  };

  const brandColorFor = (platform, url) => {
    const slug = resolvedSlug(platform, url);
    if (!slug) return "#0ea5e9";
    const hex = brandColors[slug] || "0ea5e9";
    return `#${hex}`;
  };

  if (graph.nodes) {
    graph.nodes.forEach((node) => {
      const data = {
        id: node.id,
        label: node.label,
        type: node.type,
        bio: node.bio,
        location: node.location,
        platform: node.platform,
        compromised: node.compromised,
        url: node.url,
        stars: node.stars,
        forks: node.forks,
        description: node.description,
        date: node.date,
        metrics: node.metrics,
      };

      const slug = resolvedSlug(node.platform, node.url);
      const icon = iconUrlFor(node.platform, node.url);
      if (icon) {
        data.icon = icon;
        data.brandColor = brandColorFor(node.platform, node.url);
        if (slug) {
          data.platformSlug = slug;
        }
      } else if (node.type === "email") {
        // Email nodes: use local arroba icon
        data.icon = arrobaIcon;
        data.brandColor = "#38bdf8";
        data.platformSlug = "email";
      } else if (node.type === "username") {
        // Generic handle/@ node: use local arroba icon
        data.icon = arrobaIcon;
        data.brandColor = "#38bdf8";
        data.platformSlug = "arroba";
      } else if (node.type === "location") {
        // Location nodes: use map icon
        data.icon = mapIcon;
        data.brandColor = "#14b8a6";
        data.platformSlug = "location";
      } else if (node.type === "post" || node.type === "source") {
        // For posts/sources without URL-based detection, check platform string
        const platLower = String(node.platform || "").toLowerCase();
        if (platLower === "snapchat" || platLower === "snap") {
          data.icon = snapchatIcon;
          data.brandColor = "#FFFC00";
          data.platformSlug = "snapchat";
        }
      } else if (node.type === "interest" || node.type === "activity") {
        data.icon = aboutIcon;
        data.brandColor = "#84cc16";
        data.platformSlug = "about";
      } else if (node.type === "timeline" || node.type === "description") {
        data.icon = descriptionIcon;
        data.brandColor = "#d946ef";
        data.platformSlug = "description";
      } else if (node.type === "threat_intel_hub") {
        data.brandColor = "#3b82f6";
        data.platformSlug = "threat_intel";
      } else if (node.type === "threat_intel") {
        const score = node.threat_score || 0;
        data.threat_score = score;
        data.severity = node.severity;
        data.ioc_type = node.ioc_type;
        data.brandColor = score >= 80 ? "#ef4444" : score >= 60 ? "#f97316" : score >= 40 ? "#eab308" : score >= 20 ? "#3b82f6" : "#22c55e";
        data.platformSlug = "threat_intel";
      }

      elements.push({ data });
    });
  }

  if (graph.links) {
    graph.links.forEach((link, idx) => {
      elements.push({
        data: {
          id: `edge-${idx}`,
          source: link.source,
          target: link.target,
          relationship: link.relationship,
        },
      });
    });
  }

  return elements;
};

/**
 * Get color for different node types
 */
const getNodeColor = (type) => {
  const colors = {
    user: "#3b82f6",
    username: "#8b5cf6",
    email: "#ec4899",
    post: "#f59e0b",
    repository: "#10b981",
    source: "#06b6d4",
    connection: "#f97316",
    interest: "#84cc16",
    activity: "#6366f1",
    timeline: "#d946ef",
    location: "#14b8a6",
    threat_intel_hub: "#3b82f6",
    threat_intel: "#ef4444",
  };
  return colors[type] || "#9ca3af";
};

export default NodeVisualization;
