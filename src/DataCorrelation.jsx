import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import loaderVideoDark from "./assets/Video.mp4";
import loaderVideoLight from "./assets/WhiteTheme.mp4";
import { ThemeContext } from "./contexts/ThemeContext";

const DataCorrelation = () => {
  const [mergedProfile, setMergedProfile] = useState(null);
  const [correlationMode, setCorrelationMode] = useState("fast");
  const [customPrompt, setCustomPrompt] = useState("");
  const [existingIdentifier, setExistingIdentifier] = useState("");
  const [backendChoice, setBackendChoice] = useState("auto"); // auto | local_flan | openrouter
  const [modelChoice, setModelChoice] = useState("auto"); // specific OpenRouter model or auto
  const [backendStatus, setBackendStatus] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressSteps, setProgressSteps] = useState([]);
  const [deepCleanProgress, setDeepCleanProgress] = useState([]); // For deep_clean mode progress
  const [deepCleanAbortController, setDeepCleanAbortController] = useState(null); // For cancelling deep clean
  const [overwriteModal, setOverwriteModal] = useState({ show: false, identifier: "", existing_collected_at: null, payload: null });
  const [fallbackModal, setFallbackModal] = useState({ show: false, identifier: "", reason: "", payload: null });
  const { theme } = useContext(ThemeContext);

  const navigate = useNavigate();

  const steps = [
    "Loading data...",
    "Data loaded.",
    "Starting correlation...",
    "Correlation in progress...",
    "Correlation done."
  ];

  // ------------------------------------------------------------------
  // Load correlation backend capabilities once
  // ------------------------------------------------------------------
  React.useEffect(() => {
    const loadBackendStatus = async () => {
      try {
        const res = await fetch("http://localhost:5000/api/correlation/backends");
        const data = await res.json();
        setBackendStatus(data);
        if (data && data.default_backend) {
          setBackendChoice("auto");
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadBackendStatus();
  }, []);

  // ------------------------------------------------------------------
  // Run correlation via backend API with progress steps
  // ------------------------------------------------------------------
  const handleRunCorrelation = async () => {
    // If deep_clean mode, use SSE endpoint
    if (correlationMode === "deep_clean") {
      await handleDeepCleanCorrelation();
      return;
    }

    setIsProcessing(true);
    setMergedProfile(null);
    setProgressSteps([]);
    setDeepCleanProgress([]);

    // Animate steps sequentially
    for (let i = 0; i < steps.length - 1; i++) {
      setProgressSteps(prev => [...prev, steps[i]]);
      await new Promise(res => setTimeout(res, 700)); // 0.7s delay per step
    }

    try {
      // Build payload: allow user to supply an existing identifier to correlate old users
      const identifier = (existingIdentifier && existingIdentifier.trim()) || localStorage.getItem("last_identifier") || "";
      if (!identifier) {
        setMergedProfile({ error: "No identifier found. Run data collection first or provide identifier." });
        setIsProcessing(false);
        setProgressSteps(prev => [...prev, steps[steps.length - 1]]);
        return;
      }

      const payload = {
        identifier,
        mode: correlationMode,
        prompt: correlationMode === "self" ? customPrompt : "",
        backend: backendChoice,
        model: modelChoice === "auto" ? undefined : modelChoice,
      };
      // professional flag removed — payload contains identifier, mode and optional prompt

      const callCorrelation = async (body) => {
        const response = await fetch("http://localhost:5000/api/run-correlation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return await response.json();
      };

      let data = await callCorrelation(payload);

      // If backend indicates existing data, show in-app modal to confirm overwrite
      if (data && data.status === "exists") {
        setOverwriteModal({ show: true, identifier: payload.identifier, existing_collected_at: data.existing_collected_at || null, payload });
        // pause further processing until user responds
        return;
      }

      if (data && data.status === "success" && data.result) {
        setMergedProfile(data.result);
      } else if (data && data.status === "error") {
        // Surface the full error payload so diagnostics like raw_response
        // and cleaned_attempt from the backend are visible.
        setMergedProfile(data);
      } else if (data && data.error) {
        setMergedProfile({ error: data.error });
      } else if (data && data.result) {
        setMergedProfile(data.result);
      } else {
        setMergedProfile({ error: "Unknown response from server." });
      }
    } catch (err) {
      setMergedProfile({ error: "Server error — check backend." });
      console.error(err);
    } finally {
      // Final step
      setProgressSteps(prev => [...prev, steps[steps.length - 1]]);
      setIsProcessing(false);
    }
  };

  const continueOverwrite = async () => {
    if (!overwriteModal.payload) return;
    // hide modal immediately so UI is not blocked during network call
    setOverwriteModal({ show: false, identifier: "", existing_collected_at: null, payload: null });
    setIsProcessing(true);
    setProgressSteps([]);
    try {
      const body = { ...overwriteModal.payload, overwrite: true };
      const response = await fetch("http://localhost:5000/api/run-correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      if (data && data.status === "success" && data.result) {
        setMergedProfile(data.result);
      } else if (data && data.status === "error") {
        setMergedProfile(data);
      } else if (data && data.error) {
        setMergedProfile({ error: data.error });
      } else {
        setMergedProfile({ error: "Unknown response from server." });
      }
    } catch (err) {
      setMergedProfile({ error: "Server error — check backend." });
      console.error(err);
    } finally {
      setOverwriteModal({ show: false, identifier: "", existing_collected_at: null, payload: null });
      setProgressSteps(prev => [...prev, steps[steps.length - 1]]);
      setIsProcessing(false);
    }
  };

  const cancelOverwrite = () => {
    setOverwriteModal({ show: false, identifier: "", existing_collected_at: null, payload: null });
    setMergedProfile({ info: "Correlation aborted by user; existing data retained." });
    setIsProcessing(false);
    setProgressSteps(prev => [...prev, steps[steps.length - 1]]);
  };

  const confirmFallbackToLocal = async () => {
    if (!fallbackModal.payload) {
      setFallbackModal({ show: false, identifier: "", reason: "", payload: null });
      return;
    }
    setFallbackModal({ show: false, identifier: "", reason: "", payload: null });
    setIsProcessing(true);
    setProgressSteps([]);
    try {
      const body = { ...fallbackModal.payload, backend: "local_flan" };
      const response = await fetch("http://localhost:5000/api/run-correlation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data && data.status === "success" && data.result) {
        setMergedProfile(data.result);
      } else if (data && data.status === "error") {
        setMergedProfile(data);
      } else if (data && data.error) {
        setMergedProfile({ error: data.error });
      } else {
        setMergedProfile({ error: "Unknown response from server." });
      }
    } catch (err) {
      setMergedProfile({ error: "Server error — check backend." });
      console.error(err);
    } finally {
      setProgressSteps(prev => [...prev, steps[steps.length - 1]]);
      setIsProcessing(false);
    }
  };

  const cancelFallback = () => {
    setFallbackModal({ show: false, identifier: "", reason: "", payload: null });
  };

  // ------------------------------------------------------------------
  // Cancel Deep Clean Correlation
  // ------------------------------------------------------------------
  const handleCancelDeepClean = () => {
    if (deepCleanAbortController) {
      deepCleanAbortController.abort();
      setDeepCleanAbortController(null);
    }
    setIsProcessing(false);
    setDeepCleanProgress(prev => [...prev, {
      step: "cancelled",
      platform: "",
      status: "⚠️ Deep clean cancelled by user",
      timestamp: new Date().toISOString(),
    }]);
    setMergedProfile({ info: "Deep clean correlation was cancelled." });
  };

  // ------------------------------------------------------------------
  // Deep Clean Correlation with SSE progress
  // ------------------------------------------------------------------
  const handleDeepCleanCorrelation = async () => {
    const identifier = (existingIdentifier && existingIdentifier.trim()) || localStorage.getItem("last_identifier") || "";
    if (!identifier) {
      setMergedProfile({ error: "No identifier found. Run data collection first or provide identifier." });
      return;
    }

    // Create abort controller for cancellation
    const abortController = new AbortController();
    setDeepCleanAbortController(abortController);

    setIsProcessing(true);
    setMergedProfile(null);
    setProgressSteps([]);
    setDeepCleanProgress([]);

    try {
      const response = await fetch("http://localhost:5000/api/run-deep-clean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          model: modelChoice === "auto" ? undefined : modelChoice,
          overwrite: true,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errData = await response.json();
        setMergedProfile({ error: errData.error || "Failed to start deep clean" });
        setIsProcessing(false);
        setDeepCleanAbortController(null);
        return;
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === "progress") {
                setDeepCleanProgress(prev => [...prev, {
                  step: data.step,
                  platform: data.platform,
                  status: data.status,
                  timestamp: new Date().toISOString(),
                }]);
              } else if (data.type === "heartbeat") {
                // Ignore heartbeats
              } else if (data.status === "success") {
                setMergedProfile(data.result);
                setDeepCleanProgress(prev => [...prev, {
                  step: "complete",
                  platform: "",
                  status: "✓ Deep clean correlation complete!",
                  timestamp: new Date().toISOString(),
                }]);
              } else if (data.status === "error") {
                setMergedProfile({ error: data.error });
              }
            } catch (e) {
              console.error("Failed to parse SSE data:", e);
            }
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        // User cancelled - already handled in handleCancelDeepClean
        return;
      }
      setMergedProfile({ error: "Server error — check backend." });
      console.error(err);
    } finally {
      setIsProcessing(false);
      setDeepCleanAbortController(null);
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto relative">
        <Topbar />

        {/* Page Header */}
        <h1 className="text-3xl font-bold text-white mb-6">Data Correlation</h1>

        {/* Correlation Options */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {["fast", "deep", "deep_clean", "self"].map((mode) => (
            <div
              key={mode}
              role="button"
              tabIndex={0}
              onClick={() => setCorrelationMode(mode)}
              className={`glass-card p-5 rounded-2xl border border-white/10 backdrop-blur-md cursor-pointer transition active:scale-95 ${
                correlationMode === mode ? "border-blue-500 bg-gray-800" : "hover:border-blue-400"
              }`}
            >
              <h2 className="text-gray-200 text-lg font-semibold mb-2 flex items-center gap-2">
                {mode === "fast" && (
                  <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                )}
                {mode === "deep" && (
                  <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                )}
                {mode === "deep_clean" && (
                  <svg className="w-5 h-5 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                  </svg>
                )}
                {mode === "self" && (
                  <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
                {mode === "fast" 
                  ? "Fast" 
                  : mode === "deep" 
                  ? "Deep" 
                  : mode === "deep_clean" 
                  ? "Deep Clean" 
                  : "Self-defined"}
              </h2>
              <p className="text-gray-400 text-xs mb-2">
                {mode === "fast"
                  ? "Quick lightweight correlation."
                  : mode === "deep"
                  ? "Thorough analysis of all data."
                  : mode === "deep_clean"
                  ? "Cleans each platform's data first, then correlates. Best for detailed nodes."
                  : "Custom AI-powered correlation."}
              </p>
              {mode === "deep_clean" && correlationMode === "deep_clean" && (
                <div className="mt-2 p-2 bg-teal-900/30 rounded-lg border border-teal-500/30">
                  <p className="text-teal-300 text-[10px] flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Processes each platform one-by-one with live progress
                  </p>
                </div>
              )}

              {mode === "self" && correlationMode === "self" && (
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Describe your custom AI correlation..."
                  className="w-full p-2 rounded bg-gray-800 text-white border border-gray-600 mt-2"
                  rows={3}
                />
              )}
            </div>
          ))}
        </div>

        {/* Backend selection + status */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-gray-300 text-sm">Correlation Engine</label>
            <div className="mt-2 flex flex-wrap gap-3">
              {[
                { key: "auto", label: "Auto (Prefer Local)" },
                { key: "local_flan", label: "Local FLAN" },
                { key: "openrouter", label: "Remote OpenRouter" },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setBackendChoice(opt.key)}
                  className={`px-3 py-2 rounded-lg text-sm border transition ${
                    backendChoice === opt.key
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-black/40 border-gray-600 text-gray-200 hover:border-blue-400"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {backendStatus && (
              <p className="mt-2 text-xs text-gray-400">
                Default: {backendStatus.default_backend || "none"} · Local: {backendStatus.backends?.local_flan?.configured ? "ready" : "unavailable"} ·
                Remote: {backendStatus.backends?.openrouter?.configured ? "ready" : "unavailable"}
              </p>
            )}
          </div>
        </div>

        {/* OpenRouter model selection (when remote engine is in use) */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-gray-300 text-sm">OpenRouter Model</label>
            <select
              value={modelChoice}
              onChange={(e) => setModelChoice(e.target.value)}
              className="w-full mt-1 px-4 py-3 rounded-lg bg-black/30 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 transition"
            >
              <option value="auto">Auto (try best free models with fallback)</option>
              <option value="nex-agi/deepseek-v3.1-nex-n1:free">Nex AGI · DeepSeek V3.1 Nex N1 (free)</option>
              <option value="tngtech/deepseek-r1t2-chimera:free">TNG · DeepSeek R1T2 Chimera (free)</option>
              <option value="tngtech/deepseek-r1t-chimera:free">TNG · DeepSeek R1T Chimera (free)</option>
              <option value="deepseek/deepseek-r1-0528:free">DeepSeek · R1 0528 (free)</option>
              <option value="openai/gpt-oss-20b:free">OpenAI · gpt-oss-20b (free)</option>
              <option value="openai/gpt-oss-120b:free">OpenAI · gpt-oss-120b (free)</option>
            </select>
            <p className="mt-2 text-xs text-gray-400">
              When OpenRouter is used, the system will try your chosen model first and then fall back through other free models if it is unavailable or rate limited.
            </p>
          </div>
        </div>

        {/* Start Correlation Button */}
        {/* Identifier override + Professional option */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="text-gray-300 text-sm">Existing Identifier (username or email)</label>
            <input
              type="text"
              value={existingIdentifier}
              onChange={(e) => setExistingIdentifier(e.target.value)}
              placeholder="Optional: enter existing username or email to correlate"
              className="w-full mt-1 px-4 py-3 rounded-lg bg-black/30 border border-gray-600 text-white focus:outline-none focus:ring-2 focus:ring-gray-500 transition"
            />
          </div>
          {/* checkbox removed per UI feedback */}
        </div>

        <div className="mb-6">
          <button
            onClick={handleRunCorrelation}
            disabled={isProcessing}
            className={`px-6 py-3 rounded-lg font-semibold text-white ${
              isProcessing
                ? "bg-gray-700 cursor-not-allowed"
                : "bg-gray-700 hover:bg-gray-600"
            }`}
          >
            {isProcessing ? "Processing..." : "Start Correlation"}
          </button>
        </div>

        {/* Progress Steps */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-50">
              <div className="themed-modal">
                <div className="themed-card">
                  <video
                    src={theme === 'dark' ? loaderVideoDark : loaderVideoLight}
                    autoPlay muted loop
                    className={`w-full h-full ${theme === 'light' ? 'object-cover filter brightness-105 contrast-105' : 'object-contain'}`}
                  />
                </div>
                <div className="title">
                  {correlationMode === "deep_clean" ? "Deep Clean In Progress" : "Correlation In Progress"}
                </div>
                
                {/* Deep Clean Progress - Show live platform cleaning steps */}
                {correlationMode === "deep_clean" && deepCleanProgress.length > 0 && (
                  <div className="mt-4 w-full max-h-48 overflow-y-auto bg-black/30 rounded-lg p-3">
                    {deepCleanProgress.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`text-xs py-1 flex items-center gap-2 ${
                          item.step === "error" ? "text-red-400" : 
                          item.step === "cleaned" || item.step === "complete" ? "text-green-400" : 
                          "text-gray-300"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${
                          item.step === "error" ? "bg-red-500" : 
                          item.step === "cleaned" || item.step === "complete" ? "bg-green-500" : 
                          item.step === "cleaning" ? "bg-yellow-500 animate-pulse" : 
                          "bg-blue-500"
                        }`}></span>
                        <span>{item.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Regular progress for non-deep-clean modes */}
                {correlationMode !== "deep_clean" && (
                  <>
                    <div className="subtitle text-sm">{progressSteps.length ? progressSteps[progressSteps.length - 1] : 'Preparing...'}</div>
                    <div className="w-full mt-4">
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${Math.min(100, progressSteps.length / (steps.length - 1) * 100)}%` }} />
                      </div>
                    </div>
                  </>
                )}
                
                {/* Deep Clean current step indicator */}
                {correlationMode === "deep_clean" && deepCleanProgress.length > 0 && (
                  <div className="subtitle text-sm mt-2">
                    {deepCleanProgress[deepCleanProgress.length - 1]?.status || "Processing..."}
                  </div>
                )}

                {/* Cancel Button for Deep Clean */}
                {correlationMode === "deep_clean" && (
                  <button
                    onClick={handleCancelDeepClean}
                    className="mt-6 px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white rounded-lg font-medium transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-red-500/25"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overwrite Confirmation Modal */}
        <AnimatePresence>
          {overwriteModal.show && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-black/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl border border-white/10 max-w-sm text-center">
                <p className="text-white text-lg font-semibold mb-4">
                  Correlation data already exists for <span className="font-bold">{overwriteModal.identifier}</span>.
                </p>
                {overwriteModal.existing_collected_at && (
                  <p className="text-gray-300 text-sm mb-4">Existing collected at: {new Date(overwriteModal.existing_collected_at).toLocaleString()}</p>
                )}
                <p className="text-gray-300 text-sm mb-6">Do you want to overwrite the existing correlation data?</p>
                <div className="flex gap-4 mt-4">
                  <button onClick={cancelOverwrite} className="px-6 py-2 bg-red-600 rounded-lg font-semibold hover:bg-red-500">Cancel</button>
                  <button onClick={continueOverwrite} className="px-6 py-2 bg-green-600 rounded-lg font-semibold hover:bg-green-500">Continue</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* OpenRouter → Local FLAN Fallback Modal */}
        <AnimatePresence>
          {fallbackModal.show && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-black/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl border border-white/10 max-w-sm text-center">
                <p className="text-white text-lg font-semibold mb-4">
                  OpenRouter is unavailable for <span className="font-bold">{fallbackModal.identifier}</span>.
                </p>
                {fallbackModal.reason && (
                  <p className="text-gray-300 text-xs mb-4 break-words max-h-24 overflow-y-auto">{fallbackModal.reason}</p>
                )}
                <p className="text-gray-300 text-sm mb-6">Do you want to switch to the local FLAN engine instead?</p>
                <div className="flex gap-4 mt-4">
                  <button onClick={cancelFallback} className="px-6 py-2 bg-gray-700 rounded-lg font-semibold hover:bg-gray-600">Cancel</button>
                  <button onClick={confirmFallbackToLocal} className="px-6 py-2 bg-blue-600 rounded-lg font-semibold hover:bg-blue-500">Use Local Engine</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Display Output */}
        {mergedProfile && (
          <div className="flex flex-col md:flex-row gap-4">
            <div className="glass-card shadow-lg bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-6 flex-1 overflow-hidden relative">
              {/* Copy & Download Buttons */}
              <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                <button
                  onClick={() => {
                    const text = typeof mergedProfile === 'string' ? mergedProfile : JSON.stringify(mergedProfile, null, 2);
                    navigator.clipboard.writeText(text);
                    // Show brief feedback
                    const btn = document.getElementById('copy-btn-correlation');
                    if (btn) {
                      btn.classList.add('text-green-400');
                      setTimeout(() => btn.classList.remove('text-green-400'), 1500);
                    }
                  }}
                  id="copy-btn-correlation"
                  className="p-2 rounded-lg bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white transition-all duration-200 group"
                  title="Copy to clipboard"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    const text = typeof mergedProfile === 'string' ? mergedProfile : JSON.stringify(mergedProfile, null, 2);
                    const blob = new Blob([text], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${existingIdentifier || 'correlation'}_${correlationMode}_${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="p-2 rounded-lg bg-gray-700/80 hover:bg-gray-600 text-gray-300 hover:text-white transition-all duration-200"
                  title="Download as JSON"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>

              <h2 className="text-gray-300 font-semibold mb-4">
                Correlation Result ({correlationMode === "deep_clean" ? "DEEP CLEAN" : correlationMode.toUpperCase()})
              </h2>
              {correlationMode === "deep_clean" && mergedProfile._deep_clean_meta && (
                <div className="mb-3 text-xs text-teal-400 bg-teal-900/20 p-2 rounded-lg">
                  🧹 Platforms processed: {mergedProfile._deep_clean_meta.platforms_processed?.join(", ") || "N/A"}
                  <span className="ml-2">· Cleaned: {mergedProfile._deep_clean_meta.platforms_cleaned}</span>
                </div>
              )}
              {typeof mergedProfile === "object" && mergedProfile && (mergedProfile.backend_used || mergedProfile.fallback_from) && (
                <div className="mb-3 text-xs text-gray-400">
                  Engine: {mergedProfile.backend_used || "unknown"}
                  {mergedProfile.fallback_from && (
                    <span className="ml-2 text-[0.7rem] text-yellow-400">
                      (fell back from {mergedProfile.fallback_from})
                    </span>
                  )}
                </div>
              )}
              <div className="overflow-y-auto max-h-[600px] w-full bg-gray-800 rounded-xl p-4">
                <pre className="text-white whitespace-pre-wrap break-words">
{typeof mergedProfile === 'string' ? mergedProfile : JSON.stringify(mergedProfile, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        )}
        {/* Footer: sticks to bottom when content is short, flows after content when long */}
        <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center">
          <button onClick={() => navigate('/datacollection')} className="px-4 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-medium shadow">Back</button>
          <button onClick={() => navigate('/node-visualization')} className="px-5 py-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-semibold shadow-lg">Next</button>
        </div>
      </div>
    </div>
  );
};

export default DataCorrelation;
