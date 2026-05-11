import React, { useState, useEffect, useContext, useCallback } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { ThemeContext } from "../contexts/ThemeContext";
import { AnimatePresence, motion } from "framer-motion";
import { authFetch } from "../utils/auth";

const OSINT_SOURCES = [
  { key: "GitHub", icon: "GH", color: "#333" },
  { key: "Twitter", icon: "TW", color: "#1DA1F2" },
  { key: "Reddit", icon: "RD", color: "#FF4500" },
  { key: "Medium", icon: "MD", color: "#00AB6C" },
  { key: "StackOverflow", icon: "SO", color: "#F48024" },
  { key: "Snapchat", icon: "SC", color: "#FFFC00" },
  { key: "ProfileOSINT", icon: "PO", color: "#6366f1" },
  { key: "Search Engines", icon: "SE", color: "#4285F4" },
  { key: "BreachDirectory", icon: "BD", color: "#ef4444" },
  { key: "Compromise Check", icon: "CC", color: "#f97316" },
];

const DataManagement = () => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [investigations, setInvestigations] = useState([]);
  const [tiHistory, setTiHistory] = useState([]);
  const [identifiers, setIdentifiers] = useState([]);

  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [actionLoading, setActionLoading] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const [selectedOsint, setSelectedOsint] = useState({});
  const [selectedIdentifier, setSelectedIdentifier] = useState("");
  const [selectedInvs, setSelectedInvs] = useState({});
  const [selectedIocs, setSelectedIocs] = useState({});

  const flash = (msg, type = "success") => {
    setStatusMessage(msg);
    setStatusType(type);
    setTimeout(() => setStatusMessage(""), 5000);
  };

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await authFetch("/api/data-stats");
      const data = await res.json();
      if (!data.error) setStats(data);
    } catch { /* ignore */ }
    finally { setStatsLoading(false); }
  }, []);

  const fetchInvestigations = useCallback(async () => {
    try {
      const res = await authFetch("/api/investigations");
      const data = await res.json();
      setInvestigations(data.investigations || []);
    } catch { /* ignore */ }
  }, []);

  const fetchTiHistory = useCallback(async () => {
    try {
      const res = await authFetch("/api/threat-intel/history?limit=200");
      const data = await res.json();
      setTiHistory(data.history || []);
    } catch { /* ignore */ }
  }, []);

  const fetchIdentifiers = useCallback(async () => {
    try {
      const res = await authFetch("/api/list-identifiers");
      const data = await res.json();
      setIdentifiers(data.identifiers || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchInvestigations();
    fetchTiHistory();
    fetchIdentifiers();
  }, [fetchStats, fetchInvestigations, fetchTiHistory, fetchIdentifiers]);

  const refreshAll = () => {
    fetchStats();
    fetchInvestigations();
    fetchTiHistory();
    fetchIdentifiers();
  };

  const runCleanup = async (payload) => {
    setActionLoading(true);
    try {
      const res = await authFetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.status === "success") {
        const d = data.details || {};
        const parts = [];
        const colTotal = Object.values(d.collections || {}).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
        if (colTotal) parts.push(`${colTotal} OSINT records`);
        if (d.correlations) parts.push(`${d.correlations} correlations`);
        if (d.files_removed) parts.push(`${d.files_removed} files`);
        if (d.threat_intel) parts.push(`${d.threat_intel} IOC lookups`);
        if (d.investigations) parts.push(`${d.investigations} investigations`);
        if (d.cve_lookups) parts.push(`${d.cve_lookups} CVE lookups`);
        flash(parts.length ? `Deleted: ${parts.join(", ")}` : "Cleanup complete (nothing to remove).");
        refreshAll();
      } else {
        flash(data?.error || "Cleanup finished with a warning.", "error");
      }
    } catch {
      flash("Unable to complete cleanup operation.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const openConfirm = (action) => {
    setConfirmAction(() => action);
    setConfirmText("");
    setConfirmError("");
    setShowConfirm(true);
  };

  const executeConfirm = () => {
    if (confirmText.trim().toLowerCase() !== "confirm") {
      setConfirmError('Type "confirm" to proceed.');
      return;
    }
    setShowConfirm(false);
    if (confirmAction) confirmAction();
  };

  const totalOsint = stats ? Object.values(stats.osint || {}).reduce((a, b) => a + b, 0) : 0;
  const totalAll = totalOsint + (stats?.correlations || 0) + (stats?.files || 0)
    + (stats?.threat_intel || 0) + (stats?.investigations || 0) + (stats?.cve_lookups || 0);

  const handleDeleteSelectedOsint = () => {
    const names = Object.keys(selectedOsint).filter(k => selectedOsint[k]);
    if (!names.length) return flash("Select at least one data category.", "error");
    const hasSource = names.some(k => !k.startsWith("_"));
    const payload = {
      collections: hasSource,
      correlations: !!selectedOsint._correlations,
      files: !!selectedOsint._files,
      identifier: selectedIdentifier || "",
      confirm_all: !selectedIdentifier,
    };
    if (!payload.collections && !payload.correlations && !payload.files) {
      return flash("Select at least one data category.", "error");
    }
    openConfirm(() => runCleanup(payload));
  };

  const handleDeleteProfile = () => {
    if (!selectedIdentifier) return flash("Select a profile first.", "error");
    openConfirm(() => runCleanup({ collections: true, correlations: true, files: true, identifier: selectedIdentifier }));
  };

  const handleDeleteSelectedInvs = () => {
    const ids = Object.keys(selectedInvs).filter(k => selectedInvs[k]);
    if (!ids.length) return flash("Select at least one investigation.", "error");
    openConfirm(() => runCleanup({ investigations: true, threat_intel: true, investigation_ids: ids }));
  };

  const handleDeleteSelectedIocs = () => {
    const vals = Object.keys(selectedIocs).filter(k => selectedIocs[k]);
    if (!vals.length) return flash("Select at least one IOC.", "error");
    openConfirm(() => runCleanup({ threat_intel: true, ioc_values: vals }));
  };

  const handleNukeAll = () => {
    openConfirm(() => runCleanup({
      collections: true, correlations: true, files: true,
      threat_intel: true, investigations: true, cve_lookups: true,
      confirm_all: true,
    }));
  };

  const cardBase = `rounded-2xl border p-5 transition-all ${isDark ? "bg-white/[0.03] border-white/10 hover:border-white/20" : "bg-white border-gray-200 hover:border-gray-300 shadow-sm"}`;
  const badge = (count, color = "blue") => (
    <span className={`ml-auto px-2 py-0.5 text-xs font-bold rounded-full bg-${color}-500/15 text-${color}-400 ring-1 ring-${color}-500/20`}>
      {count}
    </span>
  );

  const Checkbox = ({ checked, onChange, label, sub, count }) => (
    <label className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer transition ${checked ? (isDark ? "bg-blue-500/10 ring-1 ring-blue-500/30" : "bg-blue-50 ring-1 ring-blue-200") : (isDark ? "hover:bg-white/5" : "hover:bg-gray-50")}`}>
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 h-4 w-4 rounded accent-blue-500" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{label}</span>
          {count !== undefined && <span className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${isDark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}>{count}</span>}
        </div>
        {sub && <span className={`text-xs leading-snug ${isDark ? "text-gray-500" : "text-gray-500"}`}>{sub}</span>}
      </div>
    </label>
  );

  const SectionTitle = ({ icon, title, count, children }) => (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${isDark ? "bg-white/10" : "bg-gray-100"}`}>{icon}</div>
      <div className="flex-1">
        <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{title}</h2>
        {count !== undefined && <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{count} records</p>}
      </div>
      {children}
    </div>
  );

  const DangerBtn = ({ onClick, disabled, children, small }) => (
    <button onClick={onClick} disabled={disabled || actionLoading}
      className={`${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-semibold transition
        ${actionLoading ? "opacity-50 cursor-wait" : ""}
        ${isDark ? "bg-red-600/20 text-red-400 hover:bg-red-600/30 ring-1 ring-red-500/30" : "bg-red-50 text-red-600 hover:bg-red-100 ring-1 ring-red-200"}`}>
      {actionLoading ? "Working..." : children}
    </button>
  );

  const InfoBtn = ({ onClick, disabled, children, small }) => (
    <button onClick={onClick} disabled={disabled || actionLoading}
      className={`${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"} rounded-lg font-semibold transition
        ${actionLoading ? "opacity-50 cursor-wait" : ""}
        ${isDark ? "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 ring-1 ring-blue-500/30" : "bg-blue-50 text-blue-600 hover:bg-blue-100 ring-1 ring-blue-200"}`}>
      {children}
    </button>
  );

  return (
    <div className={`flex h-screen ${isDark ? "bg-gradient-to-b from-gray-950 via-gray-900 to-black text-white" : "bg-gray-50 text-gray-900"}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className={`px-6 py-4 flex-shrink-0 border-b ${isDark ? "bg-gradient-to-r from-gray-900 to-gray-800 border-white/10" : "bg-white border-gray-200 shadow-sm"}`}>
          <Topbar />
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                Data Management
              </h1>
              <p className={`text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                Full visibility and control over all OSINT and CTI data stored in ShadowHorn.
              </p>
            </div>

            {/* Status banner */}
            <AnimatePresence>
              {statusMessage && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                  className={`rounded-xl px-4 py-3 text-sm font-medium ${statusType === "success" ? "bg-green-500/15 text-green-400 ring-1 ring-green-500/30" : statusType === "error" ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30" : isDark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                  {statusMessage}
                </motion.div>
              )}
            </AnimatePresence>

            {/* ═══ Overview Cards ═══ */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: "OSINT Records", value: totalOsint, color: "blue", icon: "🔍" },
                { label: "Correlations", value: stats?.correlations || 0, color: "purple", icon: "🔗" },
                { label: "Result Files", value: stats?.files || 0, color: "cyan", icon: "📄" },
                { label: "TI Lookups", value: stats?.threat_intel || 0, color: "red", icon: "🛡️" },
                { label: "Investigations", value: stats?.investigations || 0, color: "amber", icon: "📂" },
                { label: "CVE Lookups", value: stats?.cve_lookups || 0, color: "orange", icon: "🐛" },
              ].map((c) => (
                <div key={c.label} className={cardBase}>
                  <div className="text-lg mb-1">{c.icon}</div>
                  <div className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {statsLoading ? "—" : c.value.toLocaleString()}
                  </div>
                  <div className={`text-[11px] font-medium ${isDark ? "text-gray-500" : "text-gray-500"}`}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* ═══ OSINT Section ═══ */}
            <div className={cardBase}>
              <SectionTitle icon="🔍" title="OSINT Data" count={totalOsint}>
                <InfoBtn small onClick={refreshAll}>Refresh</InfoBtn>
              </SectionTitle>

              {/* Profile selector */}
              <div className="mb-4">
                <label className={`text-xs font-semibold uppercase tracking-wider block mb-1.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  Scope by Profile
                </label>
                <select value={selectedIdentifier} onChange={(e) => setSelectedIdentifier(e.target.value)}
                  className={`w-full max-w-md px-3 py-2 rounded-lg text-sm border focus:outline-none transition ${isDark ? "bg-black/40 border-gray-600 text-white focus:border-blue-400" : "bg-white border-gray-300 text-gray-900 focus:border-blue-500"}`}>
                  <option value="">All profiles (global)</option>
                  {identifiers.map((id) => (
                    <option key={id.identifier} value={id.identifier}>
                      {id.identifier} ({id.platforms?.length || 0} sources)
                    </option>
                  ))}
                </select>
              </div>

              {/* Per-source grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                {OSINT_SOURCES.map((src) => (
                  <Checkbox key={src.key}
                    checked={!!selectedOsint[src.key]}
                    onChange={(e) => setSelectedOsint(p => ({ ...p, [src.key]: e.target.checked }))}
                    label={src.key}
                    count={stats?.osint?.[src.key] ?? "—"}
                  />
                ))}
              </div>

              {/* OSINT auxiliary data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                <Checkbox checked={!!selectedOsint._correlations}
                  onChange={(e) => setSelectedOsint(p => ({ ...p, _correlations: e.target.checked }))}
                  label="Correlation Results" sub="AI-generated correlations" count={stats?.correlations ?? "—"} />
                <Checkbox checked={!!selectedOsint._files}
                  onChange={(e) => setSelectedOsint(p => ({ ...p, _files: e.target.checked }))}
                  label="OSINT Result Files" sub="JSON files on disk" count={stats?.files ?? "—"} />
              </div>

              <div className="flex flex-wrap gap-3">
                <DangerBtn small onClick={handleDeleteSelectedOsint}>
                  Delete Selected OSINT Data
                </DangerBtn>
                {selectedIdentifier && (
                  <DangerBtn small onClick={handleDeleteProfile}>
                    Delete Entire Profile: {selectedIdentifier}
                  </DangerBtn>
                )}
                <button onClick={() => {
                  const all = {};
                  OSINT_SOURCES.forEach(s => all[s.key] = true);
                  all._correlations = true;
                  all._files = true;
                  setSelectedOsint(all);
                }} className={`px-3 py-1.5 text-xs rounded-lg transition ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
                  Select All
                </button>
                <button onClick={() => setSelectedOsint({})}
                  className={`px-3 py-1.5 text-xs rounded-lg transition ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
                  Clear Selection
                </button>
              </div>
            </div>

            {/* ═══ CTI Section ═══ */}
            <div className={cardBase}>
              <SectionTitle icon="🛡️" title="Threat Intelligence Data" count={(stats?.threat_intel || 0) + (stats?.investigations || 0) + (stats?.cve_lookups || 0)} />

              {/* Investigations */}
              <div className="mb-5">
                <h3 className={`text-sm font-bold mb-2 ${isDark ? "text-gray-300" : "text-gray-800"}`}>
                  Investigations ({investigations.length})
                </h3>
                {investigations.length === 0 ? (
                  <p className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>No investigations created yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 mb-3">
                    {investigations.map((inv) => (
                      <Checkbox key={inv.id}
                        checked={!!selectedInvs[inv.id]}
                        onChange={(e) => setSelectedInvs(p => ({ ...p, [inv.id]: e.target.checked }))}
                        label={inv.name}
                        sub={`${inv.status || "active"} · ${inv.ioc_count || 0} IOCs${inv.tags?.length ? " · " + inv.tags.map(t => "#" + t).join(" ") : ""}`}
                        count={inv.ioc_count || 0}
                      />
                    ))}
                  </div>
                )}
                {investigations.length > 0 && (
                  <div className="flex gap-2">
                    <DangerBtn small onClick={handleDeleteSelectedInvs}>Delete Selected Investigations + IOCs</DangerBtn>
                    <button onClick={() => { const a = {}; investigations.forEach(i => a[i.id] = true); setSelectedInvs(a); }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
                      Select All
                    </button>
                    <button onClick={() => setSelectedInvs({})}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* IOC Lookups */}
              <div className="mb-5">
                <h3 className={`text-sm font-bold mb-2 ${isDark ? "text-gray-300" : "text-gray-800"}`}>
                  IOC Lookups ({tiHistory.length})
                </h3>
                {tiHistory.length === 0 ? (
                  <p className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>No IOC lookups yet.</p>
                ) : (
                  <div className="space-y-1 max-h-56 overflow-y-auto pr-1 mb-3">
                    {tiHistory.map((ioc) => {
                      const score = ioc.threat_score?.score ?? 0;
                      const sev = score >= 80 ? "critical" : score >= 60 ? "high" : score >= 40 ? "medium" : score >= 20 ? "low" : "clean";
                      const sevColor = { critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400", low: "text-blue-400", clean: "text-green-400" }[sev];
                      return (
                        <Checkbox key={ioc.ioc}
                          checked={!!selectedIocs[ioc.ioc]}
                          onChange={(e) => setSelectedIocs(p => ({ ...p, [ioc.ioc]: e.target.checked }))}
                          label={ioc.ioc}
                          sub={<span>{ioc.ioc_type?.toUpperCase()} · <span className={sevColor}>{sev.toUpperCase()} ({score}/100)</span></span>}
                        />
                      );
                    })}
                  </div>
                )}
                {tiHistory.length > 0 && (
                  <div className="flex gap-2">
                    <DangerBtn small onClick={handleDeleteSelectedIocs}>Delete Selected IOCs</DangerBtn>
                    <button onClick={() => { const a = {}; tiHistory.forEach(i => a[i.ioc] = true); setSelectedIocs(a); }}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
                      Select All
                    </button>
                    <button onClick={() => setSelectedIocs({})}
                      className={`px-3 py-1.5 text-xs rounded-lg transition ${isDark ? "text-gray-400 hover:text-white hover:bg-white/10" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"}`}>
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* CVE quick-clean */}
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <h3 className={`text-sm font-bold ${isDark ? "text-gray-300" : "text-gray-800"}`}>
                    CVE Lookups
                  </h3>
                  <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                    {stats?.cve_lookups ?? "—"} cached CVE lookup records
                  </p>
                </div>
                {(stats?.cve_lookups || 0) > 0 && (
                  <DangerBtn small onClick={() => openConfirm(() => runCleanup({ cve_lookups: true, confirm_all: true }))}>
                    Clear All CVEs
                  </DangerBtn>
                )}
              </div>
            </div>

            {/* ═══ Danger Zone ═══ */}
            <div className={`rounded-2xl border-2 p-5 ${isDark ? "border-red-500/30 bg-red-950/10" : "border-red-200 bg-red-50/50"}`}>
              <SectionTitle icon="⚠️" title="Danger Zone" />
              <p className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                Permanently delete <strong>all</strong> data from ShadowHorn — OSINT collections, correlations, result files,
                threat intelligence lookups, investigations, and CVE caches. This cannot be undone.
              </p>
              <div className="flex items-center gap-4">
                <DangerBtn onClick={handleNukeAll}>
                  Delete All Data ({totalAll.toLocaleString()} records)
                </DangerBtn>
                <span className={`text-xs ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  You will be asked to type "confirm" before proceeding.
                </span>
              </div>
            </div>

            {/* Footer */}
            <p className={`text-xs text-center pb-4 ${isDark ? "text-gray-700" : "text-gray-400"}`}>
              © ShadowHorn — Secure Intelligence Platform 2026
            </p>
          </div>
        </div>
      </div>

      {/* ═══ Confirm Modal ═══ */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 ${isDark ? "bg-gray-900 border-white/10 text-white" : "bg-white border-gray-200 text-gray-900"}`}
              initial={{ scale: 0.9, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 20 }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-xl">⚠️</div>
                <h2 className="text-lg font-bold">Confirm Deletion</h2>
              </div>
              <p className={`text-sm mb-3 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                This action is <strong>irreversible</strong>. Selected data will be permanently removed.
              </p>
              <p className={`text-sm mb-3 ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                Type <span className="font-mono font-bold text-red-400">confirm</span> below to proceed.
              </p>
              <input type="text" value={confirmText}
                onChange={(e) => { setConfirmText(e.target.value); if (confirmError) setConfirmError(""); }}
                placeholder='Type "confirm"'
                className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${isDark ? "bg-black/40 border-gray-600 text-white focus:border-red-400" : "bg-white border-gray-300 text-gray-900 focus:border-red-500"}`}
                onKeyDown={(e) => e.key === "Enter" && executeConfirm()}
              />
              {confirmError && <p className="mt-2 text-xs text-red-400">{confirmError}</p>}
              <div className="mt-5 flex justify-end gap-3">
                <button onClick={() => setShowConfirm(false)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-100" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}>
                  Cancel
                </button>
                <button onClick={executeConfirm} disabled={actionLoading}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-sm shadow-md disabled:opacity-60 transition">
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default DataManagement;
