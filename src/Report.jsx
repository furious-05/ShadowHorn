import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeContext } from "./contexts/ThemeContext";

const Report = () => {
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [identifiers, setIdentifiers] = useState([]);
  const [selectedIdentifier, setSelectedIdentifier] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState(0);
  const [expandedSections, setExpandedSections] = useState({});

  useEffect(() => {
    const fetchIdentifiers = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/list-identifiers");
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

  const generateReport = async () => {
    if (!selectedIdentifier) {
      setError("Select a profile first");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`http://localhost:5000/api/report/comprehensive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: selectedIdentifier })
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        setError(errorData.error || "Failed to generate report");
        setLoading(false);
        return;
      }
      
      const data = await res.json();
      setReport(data.report);
      // Expand all sections by default
      const expanded = {};
      data.report?.sections?.forEach((_, idx) => { expanded[idx] = true; });
      setExpandedSections(expanded);
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
    a.download = `${report.meta.identifier || "report"}-comprehensive.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = async () => {
    if (!report) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("http://localhost:5000/api/report/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report })
      });
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();

      // Build filename: username_comprehensive_random.pdf
      const ident = (report?.meta?.identifier || "report").replace(/\s+/g, "_");
      const rand = Math.floor(100000 + Math.random() * 900000);
      const name = `${ident}_comprehensive_${rand}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setError("Failed to generate PDF");
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (idx) => {
    setExpandedSections(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getRiskColor = (level) => {
    const l = (level || "").toLowerCase();
    if (l === "high" || l === "critical") return "text-red-400 bg-red-500/20 border-red-500/50";
    if (l === "medium" || l === "moderate") return "text-amber-400 bg-amber-500/20 border-amber-500/50";
    return "text-emerald-400 bg-emerald-500/20 border-emerald-500/50";
  };

  const getSectionIcon = (title) => {
    const t = (title || "").toLowerCase();
    if (t.includes("executive") || t.includes("summary")) return "📊";
    if (t.includes("profile") || t.includes("identity")) return "👤";
    if (t.includes("digital") || t.includes("footprint")) return "🌐";
    if (t.includes("platform")) return "📱";
    if (t.includes("repository") || t.includes("code")) return "💻";
    if (t.includes("relationship") || t.includes("network")) return "🔗";
    if (t.includes("timeline") || t.includes("activity")) return "📅";
    if (t.includes("attack") || t.includes("surface")) return "🎯";
    if (t.includes("threat") || t.includes("risk")) return "⚠️";
    if (t.includes("indicator") || t.includes("ioc")) return "🔍";
    if (t.includes("recommend")) return "💡";
    if (t.includes("breach") || t.includes("compromise")) return "🔓";
    return "📋";
  };

  return (
    <div
      className={`flex h-screen overflow-hidden ${
        isDark
          ? "bg-gradient-to-b from-gray-950 via-gray-900 to-black"
          : "bg-gray-50"
      }`}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 pb-0">
          <Topbar />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden p-6 pt-4 gap-6">
          
          {/* Left Panel - Controls */}
          <div className="w-80 flex-shrink-0 flex flex-col gap-4">
            {/* Header Card */}
            <div
              className={`rounded-2xl p-5 border ${
                isDark
                  ? "bg-gradient-to-br from-gray-900 to-black border-white/10"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border text-cyan-400 ${
                    isDark
                      ? "bg-cyan-500/10 border-cyan-500/20"
                      : "bg-cyan-50 border-cyan-200"
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h2
                    className={`text-lg font-bold ${
                      isDark ? "text-white" : "text-gray-900"
                    }`}
                  >
                    Intelligence Reports
                  </h2>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">ShadowHorn Engine</p>
                </div>
              </div>
              
              <p
                className={`text-xs leading-relaxed ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Generate comprehensive threat intelligence reports from correlated OSINT data with AI-powered analysis.
              </p>
            </div>

            {/* Profile Selector */}
            <div
              className={`rounded-2xl border p-4 ${
                isDark
                  ? "bg-gray-900/60 border-white/10"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Target Profile
              </label>
              <select
                value={selectedIdentifier}
                onChange={(e) => setSelectedIdentifier(e.target.value)}
                className={`w-full rounded-lg p-3 text-sm focus:border-cyan-500/50 focus:outline-none transition border ${
                  isDark
                    ? "bg-black/60 border-white/10 text-gray-200"
                    : "bg-white border-gray-300 text-gray-900"
                }`}
              >
                <option value="">-- Select Profile --</option>
                {identifiers.map((ident) => (
                  <option key={ident.identifier} value={ident.identifier}>
                    {ident.identifier} ({ident.platforms.length} sources)
                  </option>
                ))}
              </select>
              {identifiers.length > 0 && (
                <p className="text-[0.65rem] text-gray-500 mt-2">
                  {identifiers.length} profile{identifiers.length > 1 ? "s" : ""} available
                </p>
              )}
            </div>

            {/* Report Type */}
            <div
              className={`rounded-2xl border p-4 ${
                isDark
                  ? "bg-gray-900/60 border-white/10"
                  : "bg-white border-gray-200 shadow-sm"
              }`}
            >
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Report Type
              </label>
              <div
                className={`rounded-lg border p-3 ${
                  isDark
                    ? "bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border-cyan-500/40"
                    : "bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></div>
                  <span className="text-sm font-semibold text-cyan-600">Comprehensive Analysis</span>
                </div>
                <p className="text-[0.7rem] text-cyan-700/80 mt-1">
                  Full intelligence assessment with all modules
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={generateReport}
                type="button"
                disabled={loading || !selectedIdentifier}
                className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition-all"
              >
                {loading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-30"/>
                      <path d="M4 12a8 8 0 018-8" strokeWidth="3"/>
                    </svg>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>Generate Report</span>
                  </>
                )}
              </button>
              
              <div className="flex gap-2">
                <button
                  onClick={exportPDF}
                  type="button"
                  disabled={!report || loading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition border border-white/5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF
                </button>
                <button
                  onClick={downloadJSON}
                  type="button"
                  disabled={!report || loading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition border border-white/5"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  JSON
                </button>
              </div>
            </div>

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-xl bg-red-900/30 border border-red-500/40 p-3 text-red-300 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation */}
            <div
              className={`mt-auto pt-4 flex gap-2 border-t ${
                isDark ? "border-white/5" : "border-gray-200"
              }`}
            >
              <button
                type="button"
                disabled={loading}
                onClick={() => navigate('/node-visualization')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  isDark
                    ? "bg-gray-800 hover:bg-gray-700 text-gray-300"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                ← Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => navigate('/dashboard')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                  isDark
                    ? "bg-gray-800 hover:bg-gray-700 text-gray-300"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                Dashboard →
              </button>
            </div>
          </div>

          {/* Right Panel - Report Display */}
          <div
            className={`flex-1 flex flex-col min-w-0 overflow-hidden rounded-2xl border ${
              isDark
                ? "bg-gradient-to-b from-gray-900/90 via-gray-950/95 to-black border-white/10"
                : "bg-white border-gray-200 shadow-sm"
            }`}
          >
            
            {!report ? (
              /* Empty State */
              <div className="flex-1 flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div
                    className={`w-24 h-24 mx-auto mb-6 rounded-2xl border flex items-center justify-center ${
                      isDark
                        ? "bg-gradient-to-br from-gray-800 to-gray-900 border-white/10"
                        : "bg-gray-100 border-gray-200"
                    }`}
                  >
                    <svg className="w-12 h-12 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3
                    className={`text-xl font-bold mb-2 ${
                      isDark ? "text-gray-300" : "text-gray-800"
                    }`}
                  >
                    No Report Generated
                  </h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    Select a target profile and click <span className="text-cyan-400 font-medium">Generate Report</span> to create a comprehensive intelligence assessment.
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                    {[
                      { icon: "👤", label: "Subject Profile" },
                      { icon: "🌐", label: "Digital Footprint" },
                      { icon: "⚠️", label: "Threat Analysis" },
                      { icon: "💡", label: "Recommendations" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-gray-500">
                        <span>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Report Content */
              <div className="flex-1 overflow-auto">
                {/* Cover Header */}
                <div className="relative overflow-hidden">
                  {/* Background Pattern */}
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 via-transparent to-purple-500/20"></div>
                    <div className="absolute top-0 left-0 w-full h-full" style={{
                      backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.1) 1px, transparent 0)`,
                      backgroundSize: '32px 32px'
                    }}></div>
                  </div>
                  
                  {/* Top Accent Bar */}
                  <div className="h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500"></div>
                  
                  <div className="relative p-8">
                    <div className="flex items-start justify-between">
                      <div>
                        {/* Classification Badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                          Comprehensive Intelligence Report
                        </div>
                        
                        {/* Title */}
                        <h1
                          className={`text-3xl font-bold mb-2 ${
                            isDark ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {report.meta?.name || report.meta?.identifier || "Intelligence Report"}
                        </h1>
                        
                        {/* Subtitle */}
                        <div className="flex items-center gap-3 text-sm text-gray-400">
                          <span>{report.meta?.identifier}</span>
                          {report.meta?.compromised && (
                            <>
                              <span className="text-gray-600">•</span>
                              <span className="flex items-center gap-1 text-red-400 font-semibold">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                COMPROMISED
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* Report Metadata */}
                      <div className="text-right">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Generated</div>
                        <div className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-800"}`}>
                          {new Date(report.meta?.generated_at).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'long', day: 'numeric'
                          })}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(report.meta?.generated_at).toLocaleTimeString('en-US', {
                            hour: '2-digit', minute: '2-digit'
                          })} UTC
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats Bar */}
                    <div className="mt-6 grid grid-cols-4 gap-4">
                      {[
                        { label: "Platforms", value: report.meta?.platforms_count || report.sections?.length || 0, color: "cyan" },
                        { label: "Data Points", value: report.sections?.reduce((acc, s) => acc + (s.items?.length || 0), 0) || 0, color: "blue" },
                        { label: "Risk Level", value: report.executive_summary?.risk_level || "N/A", color: report.executive_summary?.risk_level?.toLowerCase() === "high" ? "red" : "emerald" },
                        { label: "Status", value: report.meta?.compromised ? "At Risk" : "Secure", color: report.meta?.compromised ? "red" : "emerald" },
                      ].map((stat, i) => (
                        <div
                          key={i}
                          className={`rounded-xl p-3 text-center border ${
                            isDark
                              ? "bg-gray-900/60 border-white/10"
                              : "bg-gray-50 border-gray-200"
                          }`}
                        >
                          <div className={`text-lg font-bold ${stat.color === 'cyan' ? 'text-cyan-400' : stat.color === 'blue' ? 'text-blue-400' : stat.color === 'red' ? 'text-red-400' : 'text-emerald-400'}`}>{stat.value}</div>
                          <div className="text-xs text-gray-500 uppercase tracking-wider">{stat.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* AI Narrative */}
                {report.ai_narrative && (
                  <div
                    className={`px-8 py-6 border-t bg-gradient-to-r from-cyan-500/5 via-transparent to-blue-500/5 ${
                      isDark ? "border-white/5" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                        <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div>
                        <h2
                          className={`text-lg font-bold ${
                            isDark ? "text-cyan-300" : "text-cyan-700"
                          }`}
                        >
                          AI Intelligence Narrative
                        </h2>
                        <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                          Automated threat assessment powered by ShadowHorn
                        </p>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none">
                      <p
                        className={`leading-relaxed whitespace-pre-line ${
                          isDark ? "text-gray-300" : "text-gray-800"
                        }`}
                      >
                        {report.ai_narrative}
                      </p>
                    </div>
                  </div>
                )}

                {/* Report Sections */}
                <div className="px-8 py-6 space-y-4">
                  {report.sections?.map((section, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`rounded-xl overflow-hidden border ${
                        isDark
                          ? "bg-gray-900/40 border-white/10"
                          : "bg-white border-gray-200"
                      }`}
                    >
                      {/* Section Header */}
                      <button
                        onClick={() => toggleSection(idx)}
                        className={`w-full px-5 py-4 flex items-center justify-between transition ${
                          isDark ? "hover:bg-white/5" : "hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{getSectionIcon(section.title)}</span>
                          <div className="text-left">
                            <h3
                              className={`text-base font-bold ${
                                isDark ? "text-white" : "text-gray-900"
                              }`}
                            >
                              {section.title}
                            </h3>
                            <p className="text-xs text-gray-500">{section.items?.length || 0} data points</p>
                          </div>
                        </div>
                        <svg 
                          className={`w-5 h-5 text-gray-400 transition-transform ${expandedSections[idx] ? 'rotate-180' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Section Content */}
                      <AnimatePresence>
                        {expandedSections[idx] && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-5 pt-2">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {section.items?.map((item, j) => (
                                  <div 
                                    key={j} 
                                    className={`rounded-lg p-4 border transition ${
                                      isDark
                                        ? "bg-black/40 border-white/5 hover:border-cyan-500/30"
                                        : "bg-gray-50 border-gray-200 hover:border-cyan-300/70"
                                    }`}
                                  >
                                    <div className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-1">
                                      {item.label}
                                    </div>
                                    <div
                                      className={`text-sm whitespace-pre-line break-words leading-relaxed ${
                                        isDark ? "text-gray-200" : "text-gray-800"
                                      }`}
                                    >
                                      {item.value || "—"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  ))}
                </div>

                {/* Footer */}
                <div
                  className={`px-8 py-6 border-t text-xs ${
                    isDark
                      ? "border-white/10 bg-black/40 text-gray-500"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span>ShadowHorn Intelligence Platform</span>
                      <span>•</span>
                      <span>Report ID: {report.meta?.identifier?.substring(0, 8) || 'N/A'}-{Date.now().toString(36).toUpperCase()}</span>
                    </div>
                    <div>
                      Classification: <span className="text-cyan-400 font-semibold">OSINT - Open Source</span>
                    </div>
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
