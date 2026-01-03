import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { ThemeContext } from "./contexts/ThemeContext";

const DataPreview = () => {
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [identifiers, setIdentifiers] = useState([]);
  const [selectedIdentifier, setSelectedIdentifier] = useState("");
  const [osintData, setOsintData] = useState(null);
  const [correlationData, setCorrelationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load available identifiers once
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
      } catch (e) {
        console.error(e);
        setError("Failed to load identifiers");
      }
    };
    fetchIdentifiers();
  }, []);

  const loadPreviewData = async () => {
    if (!selectedIdentifier) {
      setError("Select a profile first");
      return;
    }
    setLoading(true);
    setError("");
    setOsintData(null);
    setCorrelationData(null);

    try {
      const [osintRes, corrRes] = await Promise.all([
        fetch(`http://localhost:5000/api/get-osint-data/${encodeURIComponent(selectedIdentifier)}`),
        fetch(`http://localhost:5000/api/get-correlation/${encodeURIComponent(selectedIdentifier)}`),
      ]);

      const osintJson = await osintRes.json();
      const corrJson = await corrRes.json();

      if (!osintRes.ok && !corrRes.ok) {
        setError(osintJson.error || corrJson.error || "Failed to load preview data");
        return;
      }

      if (osintRes.ok) {
        setOsintData(osintJson);
      } else if (osintJson.error) {
        setOsintData({ error: osintJson.error });
      }

      if (corrRes.ok) {
        setCorrelationData(corrJson);
      } else if (corrJson.error) {
        setCorrelationData({ error: corrJson.error });
      }
    } catch (e) {
      console.error(e);
      setError("Server error while loading preview data");
    } finally {
      setLoading(false);
    }
  };

  const renderJson = (data) => {
    if (!data) return <p className="text-gray-500 text-sm">No data loaded yet.</p>;
    if (typeof data === "string") {
      return <pre className="text-xs text-gray-100 whitespace-pre-wrap break-words">{data}</pre>;
    }
    return (
      <pre className="text-xs text-gray-100 whitespace-pre-wrap break-words">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <div
      className={`flex h-screen overflow-hidden ${
        isDark
          ? "bg-gradient-to-b from-gray-900 via-gray-900 to-black"
          : "bg-gray-50"
      }`}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto relative">
        <Topbar />

        <h1
          className={`text-3xl font-bold mb-1 ${
            isDark ? "text-white" : "text-gray-900"
          }`}
        >
          Data Preview
        </h1>
        <p
          className={`text-sm mb-6 max-w-3xl ${
            isDark ? "text-gray-400" : "text-gray-700"
          }`}
        >
          Inspect raw collected OSINT data and the correlated profile for any identifier. This view is
          read-only and is designed for analysts who want to verify inputs and correlation output.
        </p>

        {/* Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div
            className={`glass-card rounded-xl p-4 border ${
              isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span
                className={`block text-xs ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Profile
              </span>
              {identifiers.length > 0 && (
                <span className="text-[0.65rem] text-gray-500">
                  {identifiers.length} profile{identifiers.length > 1 ? "s" : ""} available
                </span>
              )}
            </div>
            <select
              value={selectedIdentifier}
              onChange={(e) => setSelectedIdentifier(e.target.value)}
              className={`w-full rounded-lg p-2.5 border ${
                isDark
                  ? "bg-black/40 border-white/10 text-gray-200"
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

          <div
            className={`glass-card rounded-xl p-4 border ${
              isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
            }`}
          >
            <div
              className={`text-xs uppercase tracking-wide mb-2 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Preview Type
            </div>
            <div
              className={`px-3 py-2 rounded-lg text-xs border ${
                isDark
                  ? "bg-gray-900/60 border-gray-700 text-gray-100"
                  : "bg-gray-50 border-gray-200 text-gray-800"
              }`}
            >
              <p className={`font-semibold text-sm ${isDark ? "" : "text-gray-900"}`}>
                Raw OSINT + Correlation
              </p>
              <p
                className={`mt-1 text-[0.7rem] ${
                  isDark ? "text-gray-300" : "text-gray-700"
                }`}
              >
                Shows the exact documents stored in data_db (collectors) and data_correlation (correlation engine).
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 lg:justify-end">
            <button
              onClick={loadPreviewData}
              type="button"
              aria-disabled={loading || !selectedIdentifier}
              disabled={loading || !selectedIdentifier}
              className={`px-4 py-2.5 rounded-lg font-semibold shadow flex items-center gap-2 disabled:opacity-50 ${
                isDark
                  ? "bg-gray-700 hover:bg-gray-600 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="3" className="opacity-30"/><path d="M4 12a8 8 0 018-8" strokeWidth="3"/></svg>
              )}
              <span>Load Data</span>
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className={`rounded-lg p-4 mb-4 text-sm border ${
              isDark
                ? "bg-red-900/20 border-red-500/30 text-red-300"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {error}
          </div>
        )}

        {/* Preview panels */}
        <div className="flex flex-col lg:flex-row gap-4 flex-1">
          {/* Raw OSINT */}
          <div
            className={`glass-card rounded-2xl p-4 flex-1 flex flex-col min-h-[260px] relative border ${
              isDark
                ? "bg-black/40 border-white/10"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-cyan-600">
                Raw OSINT Data (data_db)
              </h2>
              {/* Copy & Download Buttons */}
              {osintData && !osintData.error && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const text = typeof osintData === "string" ? osintData : JSON.stringify(osintData, null, 2);
                      navigator.clipboard.writeText(text);
                    }}
                    className="p-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white transition-all"
                    title="Copy to clipboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      const text = typeof osintData === "string" ? osintData : JSON.stringify(osintData, null, 2);
                      const blob = new Blob([text], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedIdentifier || "osint"}_raw_data.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="p-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white transition-all"
                    title="Download JSON"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0 0-4-4m4 4 4-4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div
              className={`flex-1 overflow-auto rounded-xl p-3 ${
                isDark ? "bg-gray-900/60" : "bg-gray-50"
              }`}
            >
              {renderJson(osintData)}
            </div>
          </div>

          {/* Correlation */}
          <div
            className={`glass-card rounded-2xl p-4 flex-1 flex flex-col min-h-[260px] relative border ${
              isDark
                ? "bg-black/40 border-white/10"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-cyan-600">
                Correlation Result (data_correlation)
              </h2>
              {/* Copy & Download Buttons */}
              {correlationData && !correlationData.error && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      const text = typeof correlationData === "string" ? correlationData : JSON.stringify(correlationData, null, 2);
                      navigator.clipboard.writeText(text);
                    }}
                    className="p-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white transition-all"
                    title="Copy to clipboard"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="10" height="10" rx="2" />
                      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      const text = typeof correlationData === "string" ? correlationData : JSON.stringify(correlationData, null, 2);
                      const blob = new Blob([text], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${selectedIdentifier || "correlation"}_result.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                      URL.revokeObjectURL(url);
                    }}
                    className="p-1.5 rounded-lg bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white transition-all"
                    title="Download JSON"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0 0-4-4m4 4 4-4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            <div
              className={`flex-1 overflow-auto rounded-xl p-3 ${
                isDark ? "bg-gray-900/60" : "bg-gray-50"
              }`}
            >
              {renderJson(correlationData)}
            </div>
          </div>
        </div>

        {/* Footer navigation */}
        <div
          className={`mt-4 pt-4 flex justify-between items-center border-t ${
            isDark ? "border-white/5" : "border-gray-200"
          }`}
        >
          <button
            type="button"
            disabled={loading}
            onClick={() => navigate("/datacorrelation")}
            className={`px-4 py-2 rounded-full font-medium shadow disabled:opacity-50 ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-800"
            }`}
          >
            Back to Correlation
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => navigate("/reports")}
            className={`px-5 py-3 rounded-full font-semibold shadow-lg disabled:opacity-50 ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            Go to Reports
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataPreview;
