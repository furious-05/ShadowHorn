import React, { useEffect, useState, useContext, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeContext } from "../contexts/ThemeContext";
import { authFetch } from "../utils/auth";

import virusTotalIcon from "../assets/icons/virustotal.png";
import shodanIcon from "../assets/icons/shodan.png";
import abuseipdbIcon from "../assets/icons/abuseipdb.png";
import alienvaultIcon from "../assets/icons/alienvault.png";
import abusechIcon from "../assets/icons/abusech.png";
import nvdIcon from "../assets/icons/nvd.png";
import cyberSecurityIcon from "../assets/icons/cyber-security.png";

const SOURCE_ICONS = {
  virustotal: virusTotalIcon, shodan: shodanIcon, abuseipdb: abuseipdbIcon,
  alienvault_otx: alienvaultIcon, threatfox: abusechIcon, urlhaus: abusechIcon,
  malwarebazaar: abusechIcon, nvd: nvdIcon, abusech: abusechIcon,
};

const SEVERITY_CONFIG = {
  critical: { bg: "bg-red-500", ring: "ring-red-500", text: "text-red-400" },
  high: { bg: "bg-orange-500", ring: "ring-orange-400", text: "text-orange-400" },
  medium: { bg: "bg-yellow-500", ring: "ring-yellow-400", text: "text-yellow-400" },
  low: { bg: "bg-blue-500", ring: "ring-blue-400", text: "text-blue-400" },
  clean: { bg: "bg-green-500", ring: "ring-green-400", text: "text-green-400" },
  unknown: { bg: "bg-gray-500", ring: "ring-gray-400", text: "text-gray-400" },
};

const PLATFORM_STYLES = {
  github:        { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", label: "GitHub" },
  twitter:       { bg: "bg-sky-500/15",     border: "border-sky-500/30",     text: "text-sky-400",     label: "Twitter / X" },
  linkedin:      { bg: "bg-blue-500/15",    border: "border-blue-500/30",    text: "text-blue-400",    label: "LinkedIn" },
  reddit:        { bg: "bg-orange-500/15",  border: "border-orange-500/30",  text: "text-orange-400",  label: "Reddit" },
  medium:        { bg: "bg-gray-500/15",    border: "border-gray-500/30",    text: "text-gray-300",    label: "Medium" },
  snapchat:      { bg: "bg-yellow-500/15",  border: "border-yellow-500/30",  text: "text-yellow-400",  label: "Snapchat" },
  stackoverflow: { bg: "bg-amber-500/15",   border: "border-amber-500/30",   text: "text-amber-400",   label: "Stack Overflow" },
};

const getPlatformStyle = (key) => {
  const k = (key || "").toLowerCase().replace(/[^a-z]/g, "");
  return PLATFORM_STYLES[k] || { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-400", label: key };
};

const PRIORITY_STYLES = {
  critical: "bg-red-500/20 text-red-400 border-red-500/40",
  high:     "bg-orange-500/20 text-orange-400 border-orange-500/40",
  medium:   "bg-amber-500/20 text-amber-400 border-amber-500/40",
  ongoing:  "bg-blue-500/20 text-blue-400 border-blue-500/40",
  low:      "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
};

const getPriorityStyle = (label) => {
  const l = (label || "").toLowerCase();
  for (const [k, v] of Object.entries(PRIORITY_STYLES)) {
    if (l.includes(k)) return v;
  }
  return PRIORITY_STYLES.medium;
};

const riskMeterPercent = (level) => {
  const l = (level || "").toLowerCase();
  if (l === "critical") return 95;
  if (l === "high") return 75;
  if (l === "medium" || l === "moderate") return 50;
  return 20;
};

const riskColor = (level) => {
  const l = (level || "").toLowerCase();
  if (l === "critical" || l === "high") return { bar: "bg-red-500", text: "text-red-400" };
  if (l === "medium" || l === "moderate") return { bar: "bg-amber-500", text: "text-amber-400" };
  return { bar: "bg-emerald-500", text: "text-emerald-400" };
};

const SectionWrapper = ({ title, icon, children, isDark, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`rounded-xl border overflow-hidden ${isDark ? "bg-gray-900/50 border-white/8" : "bg-white border-gray-200"}`}
  >
    <div className={`px-6 py-4 flex items-center gap-3 border-b ${isDark ? "border-white/5" : "border-gray-100"}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isDark ? "bg-white/5" : "bg-gray-100"}`}>{icon}</div>
      <h3 className={`text-sm font-bold uppercase tracking-wider ${isDark ? "text-gray-300" : "text-gray-700"}`}>{title}</h3>
    </div>
    <div className="px-6 py-5">{children}</div>
  </motion.div>
);

const Pill = ({ children, className = "" }) => (
  <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-semibold border ${className}`}>{children}</span>
);

const KV = ({ label, value, isDark }) => {
  if (!value || value === "None" || value === "Unknown" || value === "—") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">{label}</span>
      <span className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-800"}`}>{value}</span>
    </div>
  );
};

const Report = () => {
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [reportMode, setReportMode] = useState("osint"); // "osint" or "cti"

  // OSINT state
  const [identifiers, setIdentifiers] = useState([]);
  const [selectedIdentifier, setSelectedIdentifier] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tiFindings, setTiFindings] = useState(null);

  // CTI state
  const [ctiSubMode, setCtiSubMode] = useState("investigation"); // "investigation" or "ioc"
  const [investigations, setInvestigations] = useState([]);
  const [selectedInvestigation, setSelectedInvestigation] = useState("");
  const [tiHistory, setTiHistory] = useState([]);
  const [selectedIOC, setSelectedIOC] = useState("");
  const [ctiReport, setCtiReport] = useState(null);
  const [ctiLoading, setCtiLoading] = useState(false);
  const [ctiError, setCtiError] = useState("");

  useEffect(() => {
    const fetchIdentifiers = async () => {
      try {
        const res = await authFetch("/api/list-identifiers");
        const data = await res.json();
        if (data.identifiers) {
          setIdentifiers(data.identifiers);
          if (data.identifiers.length > 0) {
            setSelectedIdentifier(data.identifiers[0].identifier);
          }
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load identifiers");
      }
    };
    fetchIdentifiers();
  }, []);

  const fetchCtiData = useCallback(async () => {
    try {
      const [invRes, histRes] = await Promise.all([
        authFetch("/api/investigations"),
        authFetch("/api/threat-intel/history?limit=50"),
      ]);
      const invData = await invRes.json();
      const histData = await histRes.json();
      setInvestigations(invData.investigations || []);
      setTiHistory(histData.history || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (reportMode === "cti") fetchCtiData();
  }, [reportMode, fetchCtiData]);

  const generateCtiReport = async () => {
    setCtiLoading(true);
    setCtiError("");
    setCtiReport(null);
    try {
      let res;
      if (ctiSubMode === "investigation") {
        if (!selectedInvestigation) { setCtiError("Select an investigation first"); setCtiLoading(false); return; }
        res = await authFetch("/api/report/cti/investigation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investigation_id: selectedInvestigation }),
        });
      } else {
        if (!selectedIOC) { setCtiError("Select an IOC first"); setCtiLoading(false); return; }
        res = await authFetch("/api/report/cti/ioc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ioc: selectedIOC }),
        });
      }
      const data = await res.json();
      if (data.error) { setCtiError(data.error); }
      else { setCtiReport(data.report); }
    } catch (e) {
      setCtiError(e.message || "Failed to generate CTI report");
    } finally { setCtiLoading(false); }
  };

  const exportCtiPDF = async () => {
    if (!ctiReport) return;
    setCtiLoading(true);
    try {
      const endpoint = ctiReport.report_type === "investigation"
        ? "/api/report/cti/investigation/pdf"
        : "/api/report/cti/ioc/pdf";
      const res = await authFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report: ctiReport }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CTI_Report_${Date.now()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setCtiError("PDF generation failed"); }
    finally { setCtiLoading(false); }
  };

  const downloadCtiJSON = () => {
    if (!ctiReport) return;
    const blob = new Blob([JSON.stringify(ctiReport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CTI_Report_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateReport = async () => {
    if (!selectedIdentifier) { setError("Select a profile first"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/report/comprehensive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: selectedIdentifier }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to generate report");
        return;
      }
      const data = await res.json();
      setReport(data.report);

      // Fetch TI data for this identifier's history
      try {
        const tiRes = await authFetch(`/api/threat-intel/history?limit=10`);
        const tiData = await tiRes.json();
        if (tiData.history?.length > 0) setTiFindings(tiData.history);
      } catch (_) { /* TI data is optional */ }
    } catch (err) {
      console.error(err);
      setError("Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const downloadJSON = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.meta?.identifier || "report"}-comprehensive.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    if (!report) return;
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const ident = (report?.meta?.identifier || "report").replace(/\s+/g, "_");
      const rand = Math.floor(100000 + Math.random() * 900000);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ident}_comprehensive_${rand}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError("Failed to generate PDF");
    } finally {
      setLoading(false);
    }
  };

  const r = report;
  const exec = r?.executive_summary;
  const meta = r?.meta;
  const platforms = r?.platform_presence || [];
  const repos = r?.repositories || [];
  const iocs = r?.indicators_of_compromise || {};
  const recs = r?.recommendations || [];
  const pivots = r?.investigation_pivots || [];
  const sections = r?.sections || [];

  const findSection = (kw) => sections.find(s => (s.title || "").toLowerCase().includes(kw));
  const postSection = findSection("content") || findSection("post");
  const behaviorSection = findSection("behavior");
  const timelineSection = findSection("evidence") || findSection("timeline");
  const relationshipSection = findSection("relationship");
  const subjectSection = findSection("subject profile");
  const correlationSection = findSection("correlation summary");

  return (
    <div className={`flex h-screen overflow-hidden ${isDark ? "bg-gradient-to-b from-gray-950 via-gray-900 to-black" : "bg-gray-50"}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 pb-0"><Topbar /></div>

        <div className="flex-1 flex overflow-hidden p-6 pt-4 gap-6">

          {/* ===== LEFT PANEL ===== */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-4">
            {/* Report Mode Toggle */}
            <div className={`rounded-2xl p-4 border ${isDark ? "bg-gradient-to-br from-gray-900 to-black border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${reportMode === "osint" ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                  {reportMode === "osint" ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  ) : (
                    <img src={cyberSecurityIcon} alt="" className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {reportMode === "osint" ? "OSINT Reports" : "CTI Reports"}
                  </h2>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">ShadowHorn Engine</p>
                </div>
              </div>
              <div className={`inline-flex w-full rounded-xl p-0.5 ${isDark ? "bg-gray-800/80 ring-1 ring-white/5" : "bg-gray-200"}`}>
                <button onClick={() => { setReportMode("osint"); setCtiReport(null); }} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${reportMode === "osint" ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg" : isDark ? "text-gray-400 hover:text-white" : "text-gray-600"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  OSINT
                </button>
                <button onClick={() => { setReportMode("cti"); setReport(null); }} className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${reportMode === "cti" ? "bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg" : isDark ? "text-gray-400 hover:text-white" : "text-gray-600"}`}>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                  CTI
                </button>
              </div>
            </div>

            {/* OSINT Controls */}
            {reportMode === "osint" && (
              <>
                <div className={`rounded-2xl border p-4 ${isDark ? "bg-gray-900/60 border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Target Profile</label>
                  <select value={selectedIdentifier} onChange={e => setSelectedIdentifier(e.target.value)} className={`w-full rounded-lg p-3 text-sm focus:border-cyan-500/50 focus:outline-none transition border ${isDark ? "bg-black/60 border-white/10 text-gray-200" : "bg-white border-gray-300 text-gray-900"}`}>
                    <option value="">-- Select Profile --</option>
                    {identifiers.map(id => <option key={id.identifier} value={id.identifier}>{id.identifier} ({id.platforms.length} sources)</option>)}
                  </select>
                  {identifiers.length > 0 && <p className="text-[0.65rem] text-gray-500 mt-2">{identifiers.length} profile{identifiers.length > 1 ? "s" : ""} available</p>}
                </div>

                <div className={`rounded-2xl border p-4 ${isDark ? "bg-gray-900/60 border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Report Type</label>
                  <div className={`rounded-lg border p-3 ${isDark ? "bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-500/40" : "bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200"}`}>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                      <span className="text-sm font-semibold text-cyan-600">Comprehensive Analysis</span>
                    </div>
                    <p className="text-[0.7rem] text-cyan-700/80 mt-1">Full intelligence assessment with all modules</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button onClick={generateReport} type="button" disabled={loading || !selectedIdentifier} className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all">
                    {loading ? (<><svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-30"/><path d="M4 12a8 8 0 018-8" strokeWidth="3"/></svg><span>Generating...</span></>) : (<><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg><span>Generate Report</span></>)}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={exportPDF} type="button" disabled={!report || loading} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition border border-white/5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>PDF
                    </button>
                    <button onClick={downloadJSON} type="button" disabled={!report || loading} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition border border-white/5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>JSON
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* CTI Controls */}
            {reportMode === "cti" && (
              <>
                <div className={`rounded-2xl border p-4 ${isDark ? "bg-gray-900/60 border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Report Type</label>
                  <div className="space-y-2">
                    <button onClick={() => setCtiSubMode("investigation")} className={`w-full rounded-lg border p-3 text-left transition ${ctiSubMode === "investigation" ? (isDark ? "bg-gradient-to-r from-red-600/20 to-orange-600/20 border-red-500/40" : "bg-red-50 border-red-300") : (isDark ? "bg-black/20 border-white/5 hover:border-white/10" : "bg-gray-50 border-gray-200 hover:border-gray-300")}`}>
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 ${ctiSubMode === "investigation" ? "text-red-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <span className={`text-sm font-semibold ${ctiSubMode === "investigation" ? "text-red-400" : isDark ? "text-gray-300" : "text-gray-700"}`}>Investigation Report</span>
                      </div>
                      <p className={`text-[0.65rem] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>All IOCs in a case</p>
                    </button>
                    <button onClick={() => setCtiSubMode("ioc")} className={`w-full rounded-lg border p-3 text-left transition ${ctiSubMode === "ioc" ? (isDark ? "bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-500/40" : "bg-cyan-50 border-cyan-300") : (isDark ? "bg-black/20 border-white/5 hover:border-white/10" : "bg-gray-50 border-gray-200 hover:border-gray-300")}`}>
                      <div className="flex items-center gap-2">
                        <svg className={`w-4 h-4 ${ctiSubMode === "ioc" ? "text-cyan-400" : "text-gray-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                        <span className={`text-sm font-semibold ${ctiSubMode === "ioc" ? "text-cyan-400" : isDark ? "text-gray-300" : "text-gray-700"}`}>IOC Deep-Dive</span>
                      </div>
                      <p className={`text-[0.65rem] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Single indicator analysis</p>
                    </button>
                  </div>
                </div>

                <div className={`rounded-2xl border p-4 ${isDark ? "bg-gray-900/60 border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
                  {ctiSubMode === "investigation" ? (
                    <>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select Investigation</label>
                      <select value={selectedInvestigation} onChange={e => setSelectedInvestigation(e.target.value)} className={`w-full rounded-lg p-3 text-sm focus:outline-none transition border ${isDark ? "bg-black/60 border-white/10 text-gray-200" : "bg-white border-gray-300 text-gray-900"}`}>
                        <option value="">-- Choose Investigation --</option>
                        {investigations.map(inv => (
                          <option key={inv.id} value={inv.id}>{inv.name} ({inv.ioc_count || 0} IOCs)</option>
                        ))}
                      </select>
                      {investigations.length === 0 && <p className="text-[0.65rem] text-gray-500 mt-2">No investigations yet. Create one from the Threat Intel page.</p>}
                    </>
                  ) : (
                    <>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Select IOC</label>
                      <select value={selectedIOC} onChange={e => setSelectedIOC(e.target.value)} className={`w-full rounded-lg p-3 text-sm focus:outline-none transition border ${isDark ? "bg-black/60 border-white/10 text-gray-200" : "bg-white border-gray-300 text-gray-900"}`}>
                        <option value="">-- Choose IOC --</option>
                        {tiHistory.map((item, i) => (
                          <option key={i} value={item.ioc}>{item.ioc} ({item.threat_score?.score ?? "?"}/100 - {item.ioc_type})</option>
                        ))}
                      </select>
                      {tiHistory.length === 0 && <p className="text-[0.65rem] text-gray-500 mt-2">No IOC lookups yet. Run some from the Threat Intel page.</p>}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  <button onClick={generateCtiReport} type="button" disabled={ctiLoading || (ctiSubMode === "investigation" ? !selectedInvestigation : !selectedIOC)} className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-red-500/20 flex items-center justify-center gap-2 transition-all">
                    {ctiLoading ? (<><svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-30"/><path d="M4 12a8 8 0 018-8" strokeWidth="3"/></svg><span>Generating...</span></>) : (<><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg><span>Generate CTI Report</span></>)}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={exportCtiPDF} type="button" disabled={!ctiReport || ctiLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition border border-white/5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>PDF
                    </button>
                    <button onClick={downloadCtiJSON} type="button" disabled={!ctiReport || ctiLoading} className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition border border-white/5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>JSON
                    </button>
                  </div>
                </div>
              </>
            )}

            <AnimatePresence>
              {(reportMode === "osint" ? error : ctiError) && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-xl bg-red-900/30 border border-red-500/40 p-3 text-red-300 text-sm">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    {reportMode === "osint" ? error : ctiError}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className={`mt-auto pt-4 flex gap-2 border-t ${isDark ? "border-white/5" : "border-gray-200"}`}>
              <button type="button" disabled={loading || ctiLoading} onClick={() => navigate("/node-visualization")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>&larr; Node Visualization</button>
              <button type="button" disabled={loading || ctiLoading} onClick={() => navigate("/dashboard")} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-300" : "bg-blue-600 hover:bg-blue-500 text-white"}`}>Dashboard &rarr;</button>
            </div>
          </div>

          {/* ===== RIGHT PANEL — REPORT DISPLAY ===== */}
          <div className={`flex-1 flex flex-col min-w-0 overflow-hidden rounded-2xl border ${isDark ? "bg-gradient-to-b from-gray-900/90 via-gray-950/95 to-black border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>

            {/* CTI Report Display */}
            {reportMode === "cti" && !ctiReport && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div className={`w-24 h-24 mx-auto mb-6 rounded-2xl border flex items-center justify-center ${isDark ? "bg-gradient-to-br from-gray-800 to-gray-900 border-white/10" : "bg-gray-100 border-gray-200"}`}>
                    <img src={cyberSecurityIcon} alt="" className="w-12 h-12 opacity-50" />
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${isDark ? "text-gray-300" : "text-gray-800"}`}>No CTI Report Generated</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {ctiSubMode === "investigation"
                      ? <>Select an investigation and click <span className="text-red-400 font-medium">Generate CTI Report</span> to analyze all IOCs in that case.</>
                      : <>Select an IOC and click <span className="text-red-400 font-medium">Generate CTI Report</span> for a deep-dive analysis.</>
                    }
                  </p>
                </div>
              </div>
            )}

            {reportMode === "cti" && ctiReport && (
              <div className="flex-1 overflow-y-auto">
                {/* CTI Report Header */}
                <div className={`px-8 py-6 border-b ${isDark ? "bg-gradient-to-r from-red-950/40 via-gray-900 to-gray-900 border-white/10" : "bg-gradient-to-r from-red-50 to-white border-gray-200"}`}>
                  <div className="flex items-center gap-3 mb-2">
                    <img src={cyberSecurityIcon} alt="" className="w-8 h-8" />
                    <div>
                      <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                        {ctiReport.report_type === "investigation" ? "CTI Investigation Report" : "IOC Analysis Report"}
                      </h1>
                      <p className="text-xs text-gray-500">
                        {ctiReport.report_type === "investigation"
                          ? ctiReport.meta?.investigation_name
                          : ctiReport.meta?.ioc
                        } &middot; Generated {new Date(ctiReport.meta?.generated_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Quick stats */}
                  <div className="flex gap-4 mt-4 flex-wrap">
                    {ctiReport.report_type === "investigation" && (
                      <>
                        <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                          <div className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{ctiReport.meta?.total_iocs || 0}</div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">IOCs</div>
                        </div>
                        <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                          <div className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{ctiReport.meta?.average_score || 0}</div>
                          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Avg Score</div>
                        </div>
                      </>
                    )}
                    {ctiReport.report_type === "ioc_deep_dive" && (
                      <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                        <div className={`text-lg font-bold ${(SEVERITY_CONFIG[ctiReport.meta?.severity] || SEVERITY_CONFIG.unknown).text}`}>{ctiReport.meta?.score || 0}/100</div>
                        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Threat Score</div>
                      </div>
                    )}
                    <div className={`px-4 py-2 rounded-xl ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                      <div className={`text-lg font-bold ${(SEVERITY_CONFIG[(ctiReport.meta?.risk_level || ctiReport.meta?.severity || "").toLowerCase()] || SEVERITY_CONFIG.unknown).text}`}>
                        {(ctiReport.meta?.risk_level || ctiReport.meta?.severity || "N/A").toUpperCase()}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">Risk Level</div>
                    </div>
                  </div>
                </div>

                {/* Report Body */}
                <div className="p-8 space-y-6">
                  {/* Executive Summary */}
                  <SectionWrapper title="Executive Summary" icon="📋" isDark={isDark}>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      {ctiReport.executive_summary?.summary}
                    </p>
                  </SectionWrapper>

                  {/* Severity Distribution (investigation only) */}
                  {ctiReport.severity_distribution && (
                    <SectionWrapper title="Severity Distribution" icon="📊" isDark={isDark} delay={0.05}>
                      <div className="space-y-3">
                        {["critical", "high", "medium", "low", "clean"].map(sev => {
                          const count = ctiReport.severity_distribution[sev] || 0;
                          const total = ctiReport.meta?.total_iocs || 1;
                          const pct = Math.round((count / total) * 100);
                          const sc = SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.unknown;
                          return (
                            <div key={sev}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className={`font-bold uppercase ${sc.text}`}>{sev}</span>
                                <span className={isDark ? "text-gray-400" : "text-gray-600"}>{count} ({pct}%)</span>
                              </div>
                              <div className={`w-full h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                                <div className={`h-full rounded-full transition-all duration-700 ${sc.bg}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Score Breakdown (IOC deep-dive only) */}
                  {ctiReport.threat_score?.breakdown && Object.keys(ctiReport.threat_score.breakdown).length > 0 && (
                    <SectionWrapper title="Score Breakdown" icon="🎯" isDark={isDark} delay={0.05}>
                      <div className="space-y-3">
                        {Object.entries(ctiReport.threat_score.breakdown).sort((a, b) => b[1] - a[1]).map(([src, srcScore]) => (
                          <div key={src}>
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className={`flex items-center gap-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                {SOURCE_ICONS[src] && <img src={SOURCE_ICONS[src]} alt="" className="w-4 h-4 rounded-sm" />}
                                {src}
                              </span>
                              <span className="font-bold">{srcScore}/100</span>
                            </div>
                            <div className={`w-full h-2 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                              <div className={`h-full rounded-full transition-all duration-700 ${srcScore >= 75 ? "bg-red-500" : srcScore >= 50 ? "bg-orange-500" : srcScore >= 25 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${srcScore}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Key Findings (IOC deep-dive) */}
                  {ctiReport.key_findings?.length > 0 && (
                    <SectionWrapper title="Key Findings" icon="🔍" isDark={isDark} delay={0.1}>
                      <div className="space-y-2">
                        {ctiReport.key_findings.map((f, i) => {
                          const sc = SEVERITY_CONFIG[f.severity] || SEVERITY_CONFIG.unknown;
                          return (
                            <div key={i} className="flex items-start gap-2">
                              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${sc.bg}`} />
                              <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>{f.text}</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Top Threats (investigation only) */}
                  {ctiReport.top_threats?.length > 0 && (
                    <SectionWrapper title={`Top Threats (${ctiReport.top_threats.length})`} icon="⚠️" isDark={isDark} delay={0.1}>
                      <div className={`rounded-lg border overflow-hidden ${isDark ? "border-white/10" : "border-gray-200"}`}>
                        <table className="w-full text-sm">
                          <thead><tr className={isDark ? "bg-white/5 text-gray-400" : "bg-gray-50 text-gray-600"}>
                            <th className="text-left px-4 py-2 font-medium">IOC</th>
                            <th className="text-left px-4 py-2 font-medium">Type</th>
                            <th className="text-left px-4 py-2 font-medium">Score</th>
                            <th className="text-left px-4 py-2 font-medium">Severity</th>
                          </tr></thead>
                          <tbody>{ctiReport.top_threats.map((t, i) => {
                            const sc = SEVERITY_CONFIG[t.severity] || SEVERITY_CONFIG.unknown;
                            return (
                              <tr key={i} className={`${isDark ? "border-t border-white/5" : "border-t border-gray-100"}`}>
                                <td className="px-4 py-2 font-mono text-xs truncate max-w-[200px]">{t.ioc}</td>
                                <td className="px-4 py-2 text-xs uppercase">{t.ioc_type}</td>
                                <td className="px-4 py-2 font-bold">{t.score}</td>
                                <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sc.bg} text-white`}>{(t.severity || "").toUpperCase()}</span></td>
                              </tr>
                            );
                          })}</tbody>
                        </table>
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Source Findings (IOC deep-dive) */}
                  {ctiReport.source_findings?.length > 0 && (
                    <SectionWrapper title={`Source Analysis (${ctiReport.source_findings.length})`} icon="🔬" isDark={isDark} delay={0.15}>
                      <div className="space-y-4">
                        {ctiReport.source_findings.map((sf, i) => (
                          <div key={i} className={`rounded-lg border p-4 ${isDark ? "border-white/10 bg-white/[0.02]" : "border-gray-200 bg-gray-50"}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {SOURCE_ICONS[sf.key] && <img src={SOURCE_ICONS[sf.key]} alt="" className="w-5 h-5 rounded" />}
                              <span className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{sf.source}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                sf.status === "malicious" || sf.status === "abusive" ? "bg-red-500/20 text-red-400" :
                                sf.status === "vulnerable" || sf.status === "found" || sf.status === "flagged" || sf.status === "suspicious" ? "bg-orange-500/20 text-orange-400" :
                                "bg-green-500/20 text-green-400"
                              }`}>{sf.status}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                              {Object.entries(sf.highlights || {}).map(([k, v]) => {
                                if (v === null || v === undefined || String(v).toLowerCase() === "none" || String(v) === "0" || String(v).toLowerCase() === "no") return null;
                                return (
                                  <div key={k} className="flex gap-2 text-xs">
                                    <span className="text-gray-500 flex-shrink-0">{k}:</span>
                                    <span className={`truncate ${isDark ? "text-gray-300" : "text-gray-700"}`}>{String(v)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Detailed Findings (investigation) */}
                  {ctiReport.detailed_findings?.length > 0 && (
                    <SectionWrapper title={`Detailed Findings (${ctiReport.detailed_findings.length} IOCs)`} icon="📑" isDark={isDark} delay={0.15}>
                      <div className="space-y-3">
                        {ctiReport.detailed_findings.slice(0, 20).map((d, i) => {
                          const sc = SEVERITY_CONFIG[d.severity] || SEVERITY_CONFIG.unknown;
                          return (
                            <div key={i} className={`rounded-lg border p-3 ${isDark ? "border-white/5 bg-white/[0.02]" : "border-gray-100 bg-gray-50"}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${sc.bg} text-white`}>{d.severity}</span>
                                <span className={`font-mono text-xs truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{d.ioc}</span>
                                <span className={`ml-auto text-xs font-bold ${sc.text}`}>{d.score}/100</span>
                              </div>
                              {d.key_findings?.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {d.key_findings.slice(0, 3).map((f, j) => (
                                    <p key={j} className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>• {f}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {ctiReport.detailed_findings.length > 20 && (
                          <p className="text-xs text-gray-500 text-center">... and {ctiReport.detailed_findings.length - 20} more IOCs</p>
                        )}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Recommendations */}
                  {ctiReport.recommendations?.length > 0 && (
                    <SectionWrapper title="Recommendations" icon="✅" isDark={isDark} delay={0.2}>
                      <div className="space-y-2">
                        {ctiReport.recommendations.map((rec, i) => {
                          const pColors = {
                            CRITICAL: "bg-red-500/20 text-red-400 border-red-500/40",
                            HIGH: "bg-orange-500/20 text-orange-400 border-orange-500/40",
                            MEDIUM: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
                            LOW: "bg-green-500/20 text-green-400 border-green-500/40",
                          };
                          return (
                            <div key={i} className="flex items-start gap-2">
                              <Pill className={pColors[rec.priority] || pColors.MEDIUM}>{rec.priority}</Pill>
                              <span className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{rec.action}</span>
                            </div>
                          );
                        })}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* Source Coverage (investigation) */}
                  {ctiReport.source_coverage?.length > 0 && (
                    <SectionWrapper title="Source Coverage" icon="📡" isDark={isDark} delay={0.25}>
                      <div className="flex flex-wrap gap-2">
                        {ctiReport.source_coverage.map((src, i) => (
                          <div key={i} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg ${isDark ? "bg-white/5" : "bg-gray-100"}`}>
                            {SOURCE_ICONS[src] && <img src={SOURCE_ICONS[src]} alt="" className="w-4 h-4 rounded-sm" />}
                            <span className="text-xs font-medium">{src}</span>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}
                </div>

                {/* CTI Footer */}
                <div className={`px-8 py-6 border-t text-xs ${isDark ? "border-white/10 bg-black/40 text-gray-500" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
                  <div className="flex items-center justify-between">
                    <span>ShadowHorn Intelligence Platform</span>
                    <span>Classification: <span className="text-red-400 font-semibold">CTI - Cyber Threat Intelligence</span></span>
                  </div>
                </div>
              </div>
            )}

            {/* OSINT Report Display */}
            {reportMode === "osint" && !report && (
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div className={`w-24 h-24 mx-auto mb-6 rounded-2xl border flex items-center justify-center ${isDark ? "bg-gradient-to-br from-gray-800 to-gray-900 border-white/10" : "bg-gray-100 border-gray-200"}`}>
                    <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <h3 className={`text-xl font-bold mb-2 ${isDark ? "text-gray-300" : "text-gray-800"}`}>No Report Generated</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">Select a target profile and click <span className="text-cyan-400 font-medium">Generate Report</span> to create a comprehensive intelligence assessment.</p>
                </div>
              </div>
            )}

            {reportMode === "osint" && report && (
              <div className="flex-1 overflow-auto">

                {/* ── COVER HEADER ── */}
                <div className="relative overflow-hidden">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-transparent to-purple-500/20"></div>
                  </div>
                  <div className="h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>
                  <div className="relative p-8">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                          Comprehensive Intelligence Report
                        </div>
                        <h1 className={`text-3xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
                          {meta?.name || meta?.identifier || "Intelligence Report"}
                        </h1>
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                          <span>{meta?.identifier}</span>
                          {meta?.profile_type && <><span className="text-gray-600">&middot;</span><span className="capitalize">{meta.profile_type}</span></>}
                          {meta?.location && meta.location !== "Unknown" && <><span className="text-gray-600">&middot;</span><span>{meta.location}</span></>}
                          {meta?.compromised && <><span className="text-gray-600">&middot;</span><span className="flex items-center gap-1 text-red-400 font-semibold"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>COMPROMISED</span></>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Generated</div>
                        <div className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-800"}`}>
                          {meta?.generated_at ? new Date(meta.generated_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"}
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="mt-6 grid grid-cols-4 gap-4">
                      {[
                        { label: "Platforms", value: platforms.length || meta?.sources?.length || 0, color: "text-cyan-400" },
                        { label: "Identifiers", value: r?.counts?.identifiers || 0, color: "text-blue-400" },
                        { label: "Repositories", value: repos.length, color: "text-purple-400" },
                        { label: "Connections", value: r?.counts?.connections || 0, color: "text-emerald-400" },
                      ].map((s, i) => (
                        <div key={i} className={`rounded-xl p-3 text-center border ${isDark ? "bg-gray-900/60 border-white/10" : "bg-gray-50 border-gray-200"}`}>
                          <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                          <div className="text-[0.65rem] text-gray-500 uppercase tracking-wider">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* ── REPORT BODY ── */}
                <div className="px-8 py-6 space-y-5">

                  {/* 1. EXECUTIVE SUMMARY */}
                  {exec && (
                    <SectionWrapper title="Executive Summary" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>} isDark={isDark} delay={0.05}>
                      <p className={`text-sm leading-relaxed mb-5 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{exec.summary}</p>
                      <div className="flex items-center gap-6 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Risk Level</span>
                            <span className={`text-sm font-bold ${riskColor(exec.risk_level).text}`}>{exec.risk_level}</span>
                          </div>
                          <div className={`w-full h-2.5 rounded-full ${isDark ? "bg-gray-800" : "bg-gray-200"}`}>
                            <motion.div initial={{ width: 0 }} animate={{ width: `${riskMeterPercent(exec.risk_level)}%` }} transition={{ duration: 1, ease: "easeOut" }} className={`h-full rounded-full ${riskColor(exec.risk_level).bar}`} />
                          </div>
                        </div>
                        <Pill className={meta?.compromised ? "bg-red-500/20 text-red-400 border-red-500/40" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"}>
                          {meta?.compromised ? "COMPROMISED" : "SECURE"}
                        </Pill>
                      </div>
                      {exec.risk_factors && exec.risk_factors !== "Minimal risk indicators" && (
                        <div className={`text-xs rounded-lg p-3 border ${isDark ? "bg-black/30 border-white/5 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-600"}`}>
                          <span className="font-semibold text-gray-500">Risk Factors: </span>{exec.risk_factors}
                        </div>
                      )}
                    </SectionWrapper>
                  )}

                  {/* 1b. SUBJECT PROFILE */}
                  {subjectSection?.items?.length > 0 && (
                    <SectionWrapper title="Subject Profile" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>} isDark={isDark} delay={0.07}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {subjectSection.items.filter(i => i.value && i.value !== "None" && i.value !== "Unknown").map((item, i) => (
                          <KV key={i} label={item.label} value={item.value} isDark={isDark} />
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 1c. CORRELATION SUMMARY */}
                  {correlationSection?.items?.length > 0 && (
                    <SectionWrapper title="Correlation Summary" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>} isDark={isDark} delay={0.08}>
                      {correlationSection.items.map((item, i) => (
                        <p key={i} className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{item.value}</p>
                      ))}
                    </SectionWrapper>
                  )}

                  {/* 2. AI NARRATIVE */}
                  {r?.ai_narrative && (
                    <SectionWrapper title="AI Intelligence Narrative" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>} isDark={isDark} delay={0.1}>
                      <p className={`text-sm leading-relaxed whitespace-pre-line ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.ai_narrative}</p>
                    </SectionWrapper>
                  )}

                  {/* 3. PLATFORM PRESENCE */}
                  {platforms.length > 0 && (
                    <SectionWrapper title="Platform Presence" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>} isDark={isDark} delay={0.15}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {platforms.map((p, i) => {
                          const s = getPlatformStyle(p.platform);
                          return (
                            <div key={i} className={`rounded-lg p-4 border ${s.bg} ${s.border}`}>
                              <div className="flex items-center justify-between mb-2">
                                <span className={`text-sm font-bold ${s.text}`}>{s.label}</span>
                                {p.url && <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-500 hover:text-cyan-400 transition truncate max-w-[140px]">{p.url.replace(/https?:\/\/(www\.)?/, "")}</a>}
                              </div>
                              <div className={`text-sm font-mono ${isDark ? "text-gray-200" : "text-gray-800"}`}>@{p.username || "unknown"}</div>
                              {p.bio && <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{p.bio}</p>}
                            </div>
                          );
                        })}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 4. DIGITAL FOOTPRINT */}
                  {r?.digital_footprint?.analysis && (
                    <SectionWrapper title="Digital Footprint" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>} isDark={isDark} delay={0.2}>
                      <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.digital_footprint.analysis}</p>
                      <div className="flex gap-4 mt-4">
                        <KV label="Platforms Found" value={String(r.digital_footprint.platforms_found || 0)} isDark={isDark} />
                        <KV label="Accounts Identified" value={String(r.digital_footprint.accounts_identified || 0)} isDark={isDark} />
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 5. REPOSITORIES */}
                  {repos.length > 0 && (
                    <SectionWrapper title={`Repositories (${repos.length})`} icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>} isDark={isDark} delay={0.25}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className={`text-xs uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                              <th className="text-left pb-3 font-semibold">Repository</th>
                              <th className="text-center pb-3 font-semibold w-16">Stars</th>
                              <th className="text-center pb-3 font-semibold w-16">Forks</th>
                              <th className="text-left pb-3 font-semibold w-24">Language</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {repos.map((repo, i) => (
                              <tr key={i} className={`${isDark ? "hover:bg-white/3" : "hover:bg-gray-50"} transition`}>
                                <td className="py-2.5 pr-4">
                                  <div className={`font-medium ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                                    {repo.url ? <a href={repo.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition">{repo.name}</a> : repo.name}
                                  </div>
                                  {repo.description && <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">{repo.description}</p>}
                                </td>
                                <td className="py-2.5 text-center text-yellow-400 font-medium">{repo.stars || 0}</td>
                                <td className="py-2.5 text-center text-gray-400">{repo.forks || 0}</td>
                                <td className="py-2.5">
                                  {repo.language && repo.language !== "N/A" && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${isDark ? "bg-white/5 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{repo.language}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 6. CONTENT & POSTS */}
                  {postSection?.items?.length > 0 && (
                    <SectionWrapper title="Content &amp; Posts" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>} isDark={isDark} delay={0.3}>
                      <div className="space-y-3">
                        {postSection.items.map((item, i) => (
                          <div key={i}>
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">{item.label}</span>
                            <p className={`text-sm mt-0.5 leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 7. BEHAVIOR & INTERESTS */}
                  {behaviorSection?.items?.length > 0 && (
                    <SectionWrapper title="Behavior &amp; Interests" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>} isDark={isDark} delay={0.33}>
                      <div className="space-y-3">
                        {behaviorSection.items.map((item, i) => (
                          <div key={i}>
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-gray-500">{item.label}</span>
                            <p className={`text-sm mt-0.5 leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 8. RELATIONSHIP INTELLIGENCE */}
                  {(r?.relationship_analysis?.connection_count > 0 || relationshipSection?.items?.length > 0) && (
                    <SectionWrapper title="Relationship Intelligence" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} isDark={isDark} delay={0.36}>
                      {r?.relationship_analysis?.summary && (
                        <p className={`text-sm leading-relaxed mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.relationship_analysis.summary}</p>
                      )}
                      {relationshipSection?.items?.length > 0 && (
                        <div className="space-y-2">
                          {relationshipSection.items.map((item, i) => (
                            <div key={i} className={`flex justify-between items-start rounded-lg px-3 py-2 border ${isDark ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-200"}`}>
                              <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider w-36 flex-shrink-0">{item.label}</span>
                              <span className={`text-sm leading-relaxed flex-1 text-right ${isDark ? "text-gray-300" : "text-gray-700"}`}>{item.value}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionWrapper>
                  )}

                  {/* 9. EVIDENCE & TIMELINE */}
                  {timelineSection?.items?.length > 0 && (
                    <SectionWrapper title="Evidence &amp; Timeline" icon={<svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} isDark={isDark} delay={0.39}>
                      <div className="relative ml-4">
                        <div className={`absolute left-0 top-2 bottom-2 w-px ${isDark ? "bg-cyan-500/30" : "bg-cyan-300/50"}`} />
                        {timelineSection.items.map((item, i) => (
                          <div key={i} className="relative pl-6 pb-4 last:pb-0">
                            <div className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 ${isDark ? "bg-gray-900 border-cyan-400" : "bg-white border-cyan-500"}`} style={{ transform: "translateX(-50%)" }} />
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-cyan-400">{item.label}</span>
                            <p className={`text-sm mt-0.5 leading-relaxed break-all ${isDark ? "text-gray-300" : "text-gray-700"}`}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 10. ATTACK SURFACE */}
                  {r?.attack_surface?.analysis && (
                    <SectionWrapper title="Attack Surface Assessment" icon={<svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>} isDark={isDark} delay={0.42}>
                      <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.attack_surface.analysis}</p>
                    </SectionWrapper>
                  )}

                  {/* 11. THREAT ASSESSMENT */}
                  {r?.threat_analysis?.analysis && (
                    <SectionWrapper title="Threat Assessment" icon={<svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>} isDark={isDark} delay={0.45}>
                      <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{r.threat_analysis.analysis}</p>
                    </SectionWrapper>
                  )}

                  {/* 12. INDICATORS OF COMPROMISE */}
                  {(iocs.emails?.length > 0 || iocs.accounts?.length > 0 || iocs.platform_urls?.length > 0 || iocs.repository_urls?.length > 0) && (
                    <SectionWrapper title="Indicators of Compromise (IOCs)" icon={<svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>} isDark={isDark} delay={0.48}>
                      <div className="space-y-4">
                        {[
                          { label: "Email Addresses", items: iocs.emails },
                          { label: "Accounts / Usernames", items: iocs.accounts },
                          { label: "Platform URLs", items: iocs.platform_urls },
                          { label: "Repository URLs", items: iocs.repository_urls },
                        ].filter(g => g.items?.length > 0).map((group, gi) => (
                          <div key={gi}>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">{group.label}</h4>
                            <div className={`rounded-lg border overflow-hidden ${isDark ? "border-white/5" : "border-gray-200"}`}>
                              {group.items.map((item, ii) => (
                                <div key={ii} className={`px-4 py-2 text-sm font-mono break-all ${isDark ? "text-gray-300 even:bg-white/3" : "text-gray-700 even:bg-gray-50"}`}>
                                  {item.startsWith?.("http") ? <a href={item} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition">{item}</a> : item}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 12b. THREAT INTELLIGENCE FINDINGS */}
                  {tiFindings?.length > 0 && (
                    <SectionWrapper title="Threat Intelligence Findings" icon={<svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" strokeLinecap="round" strokeLinejoin="round" /></svg>} isDark={isDark} delay={0.50}>
                      <p className={`text-xs mb-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                        IOC lookups from the Threat Intelligence module.
                      </p>
                      <div className={`rounded-lg border overflow-hidden ${isDark ? "border-white/5" : "border-gray-200"}`}>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className={`text-xs uppercase tracking-wider ${isDark ? "text-gray-500 bg-white/3" : "text-gray-400 bg-gray-50"}`}>
                              <th className="text-left px-4 py-2 font-semibold">IOC</th>
                              <th className="text-left px-4 py-2 font-semibold">Type</th>
                              <th className="text-center px-4 py-2 font-semibold">Score</th>
                              <th className="text-center px-4 py-2 font-semibold">Severity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tiFindings.map((item, idx) => {
                              const sevColors = { critical: "bg-red-500 text-white", high: "bg-orange-500 text-white", medium: "bg-yellow-500 text-black", low: "bg-blue-500 text-white", clean: "bg-green-500 text-white" };
                              const sev = item.threat_score?.severity || "unknown";
                              return (
                                <tr key={idx} className={isDark ? "border-t border-white/5" : "border-t border-gray-100"}>
                                  <td className={`px-4 py-2 font-mono text-xs break-all ${isDark ? "text-gray-300" : "text-gray-700"}`}>{item.ioc}</td>
                                  <td className={`px-4 py-2 text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.ioc_type}</td>
                                  <td className="px-4 py-2 text-center font-bold">{item.threat_score?.score ?? "-"}</td>
                                  <td className="px-4 py-2 text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${sevColors[sev] || "bg-gray-500 text-white"}`}>
                                      {(sev || "N/A").toUpperCase()}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 13. RECOMMENDATIONS */}
                  {recs.length > 0 && (
                    <SectionWrapper title="Prioritized Recommendations" icon={<svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>} isDark={isDark} delay={0.51}>
                      <div className="space-y-3">
                        {recs.map((rec, i) => (
                          <div key={i} className={`flex gap-3 items-start rounded-lg p-3 border ${isDark ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-200"}`}>
                            <Pill className={getPriorityStyle(rec.priority)}>{rec.priority}</Pill>
                            <p className={`text-sm leading-relaxed flex-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{rec.action}</p>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}

                  {/* 14. INVESTIGATION PIVOTS */}
                  {pivots.length > 0 && (
                    <SectionWrapper title="Investigation Pivots" icon={<svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} isDark={isDark} delay={0.54}>
                      <div className="space-y-3">
                        {pivots.map((p, i) => (
                          <div key={i}>
                            <span className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{p.name}</span>
                            <p className={`text-sm mt-0.5 leading-relaxed ${isDark ? "text-gray-400" : "text-gray-600"}`}>{p.description}</p>
                          </div>
                        ))}
                      </div>
                    </SectionWrapper>
                  )}
                </div>

                {/* ── FOOTER ── */}
                <div className={`px-8 py-6 border-t text-xs ${isDark ? "border-white/10 bg-black/40 text-gray-500" : "border-gray-200 bg-gray-50 text-gray-500"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span>ShadowHorn Intelligence Platform</span>
                      <span>&middot;</span>
                      <span>Report ID: {(meta?.identifier || "N/A").substring(0, 8)}-{Date.now().toString(36).toUpperCase()}</span>
                    </div>
                    <div>Classification: <span className="text-cyan-400 font-semibold">OSINT - Open Source</span></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;
