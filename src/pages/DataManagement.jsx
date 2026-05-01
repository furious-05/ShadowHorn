import React, { useState, useContext } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { ThemeContext } from "../contexts/ThemeContext";
import { AnimatePresence, motion } from "framer-motion";
import { authFetch } from "../utils/auth";

const DataManagement = () => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [options, setOptions] = useState({
    collections: true,
    correlations: true,
    files: true,
  });
  const [identifier, setIdentifier] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info");
  const [loading, setLoading] = useState(false);

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState("");

  const REQUIRED_PHRASE = "clean all data";

  const handleOptionChange = (e) => {
    const { name, checked } = e.target;
    setOptions((prev) => ({ ...prev, [name]: checked }));
  };

  const runCleanup = async ({ all = false } = {}) => {
    const payload = all
      ? { collections: true, correlations: true, files: true, identifier: "", confirm_all: true }
      : {
          collections: options.collections,
          correlations: options.correlations,
          files: options.files,
          identifier: identifier.trim(),
        };

    if (!payload.collections && !payload.correlations && !payload.files) {
      setStatusMessage("Select at least one data category to clean.");
      setStatusType("error");
      return;
    }

    setLoading(true);
    setStatusMessage("");
    try {
      const res = await authFetch("/api/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.status === "success") {
        if (payload.identifier) {
          setStatusMessage("Cleanup completed for the specified identifier.");
        } else if (all) {
          setStatusMessage("Global cleanup completed. All selected data sets have been cleared.");
        } else {
          setStatusMessage("Cleanup completed for the selected data categories.");
        }
        setStatusType("success");
      } else {
        setStatusMessage(data?.error || "Cleanup finished with a warning.");
        setStatusType("error");
      }
    } catch (err) {
      setStatusMessage("Unable to complete cleanup operation.");
      setStatusType("error");
    } finally {
      setLoading(false);
      setTimeout(() => setStatusMessage(""), 6000);
    }
  };

  const handleScopedCleanup = () => {
    if (!identifier.trim()) {
      setStatusMessage("Enter an identifier to run targeted cleanup. Use 'Clean all data' to remove everything.");
      setStatusType("error");
      setTimeout(() => setStatusMessage(""), 6000);
      return;
    }
    runCleanup({ all: false });
  };

  const handleGlobalCleanup = () => {
    setConfirmText("");
    setConfirmError("");
    setShowConfirm(true);
  };

  const confirmGlobalCleanup = () => {
    const normalized = confirmText.trim().toLowerCase();
    if (normalized !== REQUIRED_PHRASE) {
      setConfirmError('To proceed, type "clean all data" exactly.');
      return;
    }
    setShowConfirm(false);
    setConfirmText("");
    setConfirmError("");
    runCleanup({ all: true });
  };

  const cancelGlobalCleanup = () => {
    setShowConfirm(false);
    setConfirmText("");
    setConfirmError("");
  };

  return (
    <div className={`flex h-screen ${isDark ? "bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white" : "bg-gray-50 text-gray-900"}`}>
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <Topbar />

        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          Data Management
        </h1>
        <p className={`text-sm mb-6 max-w-3xl ${isDark ? "text-gray-400" : "text-gray-600"}`}>
          Manage the lifecycle of collected data in ShadowHorn. Use this console to remove
          historical OSINT collections, correlation results, and generated OSINT files 
          for a specific profile or as a controlled environment reset.
        </p>

        <div className={`glass-card backdrop-blur-lg p-8 rounded-2xl shadow-xl max-w-4xl ${
          isDark ? "bg-white/5 border border-white/10" : "bg-white border border-gray-200 shadow-sm"
        }`}>
          <h2 className={`text-lg font-semibold mb-4 ${isDark ? "text-gray-200" : "text-gray-800"}`}>Cleanup scope</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <label className={`flex items-start gap-3 text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              <input
                type="checkbox"
                name="collections"
                checked={options.collections}
                onChange={handleOptionChange}
                className={`mt-1 h-4 w-4 rounded border-gray-500 ${isDark ? "bg-black/40" : "bg-white"}`}
              />
              <span>
                <span className="font-semibold">Collected OSINT datasets</span>
                <span className={`block text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  MongoDB collections: GitHub, Twitter, Reddit, ProfileOSINT, Search Engines,
                  BreachDirectory and Compromise.
                </span>
              </span>
            </label>

            <label className={`flex items-start gap-3 text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              <input
                type="checkbox"
                name="correlations"
                checked={options.correlations}
                onChange={handleOptionChange}
                className={`mt-1 h-4 w-4 rounded border-gray-500 ${isDark ? "bg-black/40" : "bg-white"}`}
              />
              <span>
                <span className="font-semibold">Correlation results</span>
                <span className={`block text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  AI correlation documents stored in the data_correlation database.
                </span>
              </span>
            </label>

            <label className={`flex items-start gap-3 text-sm md:col-span-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              <input
                type="checkbox"
                name="files"
                checked={options.files}
                onChange={handleOptionChange}
                className={`mt-1 h-4 w-4 rounded border-gray-500 ${isDark ? "bg-black/40" : "bg-white"}`}
              />
              <span>
                <span className="font-semibold">OSINT result files</span>
                <span className={`block text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  JSON artifacts written to the <span className="font-mono">backend/osint_results</span> directory.
                </span>
              </span>
            </label>
          </div>

          <div className="mb-6">
            <h3 className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>Optional identifier filter</h3>
            <p className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Provide an identifier (for example: email address, username, or profile key) to
              restrict cleanup to a single profile. Leave empty to apply cleanup to all profiles
              within the selected categories.
            </p>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="email / username / profile identifier"
              className={`w-full mt-1 px-3 py-2 rounded-lg border focus:outline-none focus:border-blue-400 transition text-sm ${
                isDark ? "bg-black/40 border-gray-600 text-white" : "bg-white border-gray-300 text-gray-900 placeholder:text-gray-500"
              }`}
            />
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex gap-3">
              <button
                onClick={handleScopedCleanup}
                disabled={loading}
                className={`px-5 py-2 rounded-lg font-semibold text-sm shadow-lg border transition ${
                  loading
                    ? isDark
                      ? "bg-blue-700/60 border-blue-500/60 text-gray-200 cursor-wait"
                      : "bg-blue-500/85 border-blue-400 text-white cursor-wait shadow-blue-500/20"
                    : "bg-blue-600/80 hover:bg-blue-500 border-blue-500/60 text-white"
                }`}
              >
                {loading ? "Running cleanup..." : "Run targeted cleanup"}
              </button>
              <button
                type="button"
                onClick={handleGlobalCleanup}
                disabled={loading}
                className={`px-5 py-2 rounded-lg font-semibold text-sm shadow-lg border transition ${
                  loading
                    ? isDark
                      ? "bg-gray-800/80 border-gray-600 text-gray-300 cursor-wait"
                      : "bg-gray-200 border-gray-400 text-gray-600 cursor-wait"
                    : isDark
                      ? "bg-transparent hover:bg-red-600/10 border-red-500/60 text-red-300"
                      : "bg-transparent hover:bg-red-50 border-red-500/60 text-red-600"
                }`}
              >
                Clean all data
              </button>
            </div>
            <p className="text-[11px] text-gray-500 max-w-xs text-left md:text-right">
              All cleanup operations are irreversible. Ensure any reports or exports you require
              have been generated before removing data.
            </p>
          </div>

          {statusMessage && (
            <p
              className={`mt-4 text-sm font-medium ${
                statusType === "success"
                  ? "text-green-400"
                  : statusType === "error"
                  ? "text-red-400"
                  : isDark
                  ? "text-gray-300"
                  : "text-gray-700"
              }`}
            >
              {statusMessage}
            </p>
          )}
        </div>

        <p className="text-gray-600 text-xs mt-8 text-center font-mono">
          © ShadowHorn — Secure Intelligence Platform 2026
        </p>
      </div>

      {/* Global cleanup confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md rounded-2xl bg-gray-900 text-white border border-white/10 shadow-2xl p-6"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
            >
              <h2 className="text-lg font-semibold mb-2">Confirm global cleanup</h2>
              <p className="text-sm text-gray-300 mb-3">
                This will remove all collected OSINT data, correlation results, and OSINT result files
                from the backend.
              </p>
              <p className="text-sm text-gray-300 mb-3">
                To confirm, type <span className="font-mono text-red-300">clean all data</span> in the box below.
                This action cannot be undone.
              </p>

              <input
                type="text"
                value={confirmText}
                onChange={(e) => {
                  setConfirmText(e.target.value);
                  if (confirmError) setConfirmError("");
                }}
                placeholder='Type "clean all data" to proceed'
                className="w-full mt-1 px-3 py-2 bg-black/40 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-red-400"
              />
              {confirmError && (
                <p className="mt-2 text-xs text-red-400">{confirmError}</p>
              )}

              <div className="mt-5 flex justify-end gap-3 text-sm">
                <button
                  type="button"
                  onClick={cancelGlobalCleanup}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-100 transition"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmGlobalCleanup}
                  disabled={loading}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  OK
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
