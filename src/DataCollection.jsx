import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import loaderVideoDark from "./assets/Video.mp4";
import loaderVideoLight from "./assets/WhiteTheme.mp4";
import { ThemeContext } from "./contexts/ThemeContext";

const platforms = [
  "BreachDirectory",
  "Twitter",
  "Reddit",
  "Medium",
  "StackOverflow",
  "Snapchat",
  "Compromise Check",
  "Search Engines",
  "GitHub",
];

const DataCollection = () => {
  const [tab, setTab] = useState("complete");
  const [formData, setFormData] = useState({ username: "", email: "", fullname: "", keyword: "" });
  const [selectedPlatforms, setSelectedPlatforms] = useState(Object.fromEntries(platforms.map(p => [p, false])));
  const [submittedData, setSubmittedData] = useState([]);
  const [outputs, setOutputs] = useState(Array(platforms.length).fill("Waiting..."));
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [isProcessing, setIsProcessing] = useState(false);
  const [feedCollapsed, setFeedCollapsed] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [waitModal, setWaitModal] = useState({ show: false, platform: "", seconds: 0 });
  const [countdown, setCountdown] = useState(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentPlatform, setCurrentPlatform] = useState("");
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [overwriteModal, setOverwriteModal] = useState({ show: false, identifier: "", pendingAction: "", data: null });
  const [savedThisSession, setSavedThisSession] = useState(false);
  const [lastSavedIdent, setLastSavedIdent] = useState("");

  // Input change
  const handleChange = e => setFormData({ ...formData, [e.target.name]: e.target.value });

  // Platform toggle
  const togglePlatform = platform => setSelectedPlatforms({ ...selectedPlatforms, [platform]: !selectedPlatforms[platform] });

  // Save form data
  const handleSubmit = e => {
    e.preventDefault();

    const selected = tab === "complete"
      ? [...platforms]
      : Object.entries(selectedPlatforms).filter(([_, v]) => v).map(([k]) => k);

    if (selected.length === 0) {
      setMessage("Please select at least one platform.");
      setMessageType("error");
      return;
    }

    const filteredData = Object.fromEntries(Object.entries(formData).filter(([_, v]) => v.trim() !== ""));
    if (Object.keys(filteredData).length === 0) {
      setMessage("Please enter at least one field.");
      setMessageType("error");
      return;
    }

    // Always save without prompting; overwrite prompt will be shown when starting processing
    performSave(filteredData, selected);
  };

  const performSave = (filteredData, selected) => {
    setSubmittedData([{ ...filteredData, platforms: selected }]);
    // Persist last identifier (username preferred, then email, then fullname)
    try {
      const ident = filteredData.username || filteredData.email || filteredData.fullname || "";
      if (ident) {
        localStorage.setItem("last_identifier", ident);
        // store collected_profiles as object mapping ident->timestamp
        const raw = localStorage.getItem("collected_profiles");
        const map = raw ? JSON.parse(raw) : {};
        const ts = Date.now();
        map[ident] = ts;
        localStorage.setItem("collected_profiles", JSON.stringify(map));
        // mark saved in this session so immediate processing won't prompt overwrite
        setSavedThisSession(true);
        setLastSavedIdent(ident);
      }
    } catch (err) {
      // ignore storage errors
    }
    setFormData({ username: "", email: "", fullname: "", keyword: "" });
    setSelectedPlatforms(Object.fromEntries(platforms.map(p => [p, false])));
    setMessage("Data saved successfully!");
    setMessageType("success");
    setOutputs(Array(platforms.length).fill("Waiting..."));
  };

  // Countdown for rate-limit
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(prev => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const startCountdown = (platform, seconds) => {
    setWaitModal({ show: true, platform, seconds });
    setCountdown(seconds);
  };

  // Process data per platform
  const handleProcessing = async () => {
    if (submittedData.length === 0) {
      setMessage("No data to process. Please save some entries first.");
      setMessageType("error");
      return;
    }

    const data = submittedData[0];
    const ident = data.username || data.email || data.fullname || "";
    try {
      const raw = localStorage.getItem("collected_profiles");
      const list = raw ? JSON.parse(raw) : [];
      if (ident && list.includes(ident)) {
        setOverwriteModal({ show: true, identifier: ident, pendingAction: "process", data });
        return;
      }
    } catch (err) {
      // ignore
    }

    startProcessingActual();
  };

  const startProcessingActual = async () => {
    const data = submittedData[0];
    if (!data.platforms || data.platforms.length === 0) {
      setMessage("No platforms selected.");
      setMessageType("error");
      return;
    }
    // check for previous collection in storage, but don't prompt if it was just saved in this session
    const ident = data.username || data.email || data.fullname || "";
    try {
      const raw = localStorage.getItem("collected_profiles");
      const map = raw ? JSON.parse(raw) : {};
      const exists = ident && map && Object.prototype.hasOwnProperty.call(map, ident);
      if (exists && !(savedThisSession && lastSavedIdent === ident)) {
        setOverwriteModal({ show: true, identifier: ident, pendingAction: "process", data });
        return;
      }
    } catch (err) {
      // ignore
    }

    setIsProcessing(true);
    setShowPopup(true);
    setMessage("Collection started...");
    setMessageType("success");

    setProgressPercent(0);
    setCurrentPlatform("");

    const newOutputs = [...outputs];

    for (let i = 0; i < platforms.length; i++) {
      const platform = platforms[i];
      setCurrentPlatform(platform);
      if (!data.platforms.includes(platform)) {
        newOutputs[i] = "Skipped";
        setOutputs([...newOutputs]);
        setProgressPercent(Math.round(((i + 1) / platforms.length) * 100));
        continue;
      }

      try {
        const res = await fetch("http://localhost:5000/api/collect-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, platforms: [platform] }),
        });
        const result = await res.json();

        // Rate-limit
        if (result.results?.[platform]?.wait_seconds > 0) {
          newOutputs[i] = `${platform} delayed due to rate limit`;
          setOutputs([...newOutputs]);
          startCountdown(platform, result.results[platform].wait_seconds);
          continue;
        }

        // Empty or error
        if (!result.results?.[platform] || Object.keys(result.results[platform]).length === 0) {
          newOutputs[i] = `${platform}: No data`;
        } else {
          newOutputs[i] = `${platform}: ${JSON.stringify(result.results[platform], null, 2)}`;
        }
        setOutputs([...newOutputs]);
      } catch (err) {
        newOutputs[i] = `${platform}: Error connecting to backend`;
        setOutputs([...newOutputs]);
      }
      // update progress after each platform attempt
      setProgressPercent(Math.round(((i + 1) / platforms.length) * 100));
    }

    setMessage("Collection completed!");
    setMessageType("success");
    setSubmittedData([]);
    setIsProcessing(false);
    setShowPopup(false);
    setProgressPercent(100);
    setCurrentPlatform("");
  };

  const continueAfterWait = () => {
    setWaitModal({ show: false, platform: "", seconds: 0 });
    handleProcessing();
  };

  const cancelProcessing = () => {
    setWaitModal({ show: false, platform: "", seconds: 0 });
    setMessage("Processing cancelled by user.");
    setMessageType("error");
    setIsProcessing(false);
    setShowPopup(false);
  };

  const navigate = useNavigate();

  return (
    <div
      className={`flex h-screen overflow-hidden font-inter ${
        isDark
          ? "bg-gradient-to-b from-gray-900 via-black to-gray-950 text-white"
          : "bg-gray-50 text-gray-900"
      }`}
    >
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto relative">
        <Topbar />

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          {["complete", "selective"].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`py-2 px-6 rounded-t-lg font-semibold transition ${
                tab === t
                  ? isDark
                    ? "bg-gray-800 text-white"
                    : "bg-white text-gray-900 shadow-sm border-b border-gray-100"
                  : isDark
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t === "complete" ? "Complete Profiling" : "Selective Profiling"}
            </button>
          ))}
        </div>

        {/* Feed Panel */}
        <div
          className={`glass-card backdrop-blur-xl rounded-2xl p-6 mb-6 border ${
            isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex justify-between items-center mb-4">
            <h2
              className={`text-2xl font-bold ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              Data Feed
            </h2>
            <button
              type="button"
              onClick={() => setFeedCollapsed(!feedCollapsed)}
              className={`text-sm transition ${
                isDark
                  ? "text-gray-400 hover:text-white"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {feedCollapsed ? "Expand ▼" : "Collapse ▲"}
            </button>
          </div>

          {!feedCollapsed && (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {tab === "selective" && (
                <div className="flex flex-wrap gap-4 mb-2">
                  {platforms.map(p => (
                    <label key={p} className="flex items-center gap-2 cursor-pointer">
                      <span
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPlatforms[p]
                            ? isDark
                              ? "bg-gray-800 border-purple-500 border-purple-500"
                              : "bg-purple-100 border-purple-500"
                            : isDark
                            ? "border-gray-500"
                            : "border-gray-400"
                        }`}
                        onClick={() => togglePlatform(p)}
                      >
                        {selectedPlatforms[p] && (
                          <span
                            className={`w-3 h-3 rounded-full ${
                              isDark ? "bg-purple-500" : "bg-purple-500"
                            }`}
                          />
                        )}
                      </span>
                      <span className={isDark ? "text-gray-300" : "text-gray-800"}>{p}</span>
                    </label>
                  ))}
                </div>
              )}

              {["username", "email", "fullname", "keyword"].map(field => (
                <div key={field}>
                  <label
                    className={`block text-sm capitalize mb-1 ${
                      isDark ? "text-gray-300" : "text-gray-800"
                    }`}
                  >
                    {field}
                    {field === "username" && (
                      <span className="text-gray-500 text-xs ml-2 font-normal">
                        (single or query: github=user1;snapchat=user2;twitter=user3)
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    name={field}
                    placeholder={
                      field === "username" 
                        ? "Enter username or query (e.g., github=user1;snapchat=user2)" 
                        : `Enter ${field}`
                    }
                    value={formData[field]}
                    onChange={handleChange}
                    className={`w-full px-4 py-3 rounded-lg focus:outline-none focus:ring-2 transition border ${
                      isDark
                        ? "bg-black/30 border-gray-600 text-white focus:ring-gray-500"
                        : "bg-white border-gray-300 text-gray-900 focus:ring-blue-400"
                    }`}
                  />
                  {field === "username" && (
                    <p className="text-gray-500 text-xs mt-1">
                      💡 Use query syntax for different usernames per platform: <code className="bg-gray-800 px-1 rounded">generic=main;github=ghuser;snapchat=scuser</code>
                    </p>
                  )}
                </div>
              ))}

              {message && (
                <p className={`text-sm text-center ${messageType === "success" ? "text-green-400" : "text-red-400"}`}>{message}</p>
              )}

              <div className="flex gap-4 mt-2">
                <button
                  type="submit"
                  className={`flex-1 py-3 rounded-lg font-semibold shadow-md transition transform hover:-translate-y-0.5 ${
                    isDark
                      ? "bg-gray-800 hover:bg-gray-700 text-white"
                      : "bg-blue-600 hover:bg-blue-500 text-white"
                  }`}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleProcessing}
                  disabled={isProcessing}
                  className={`flex-1 py-3 rounded-lg font-semibold shadow-md transition transform hover:-translate-y-0.5 ${
                    isProcessing
                      ? isDark
                        ? "bg-gray-700 cursor-not-allowed text-gray-300"
                        : "bg-gray-200 cursor-not-allowed text-gray-500"
                      : isDark
                      ? "bg-gray-800 hover:bg-gray-700 text-white"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white"
                  }`}
                >
                  {isProcessing ? "Processing..." : "Start Processing"}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Output Panels */}
        <div className="grid grid-cols-2 grid-rows-2 gap-4 mb-6">
          {outputs.map((output, idx) => {
            const hasData = output && output !== "Waiting..." && output !== "Skipped" && !output.includes("No data") && !output.includes("Error");
            return (
              <div
                key={idx}
                className={`glass-card backdrop-blur-xl rounded-2xl p-4 h-44 overflow-auto relative group border ${
                  isDark
                    ? "bg-white/5 border-white/10"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold">{platforms[idx] || `Output Panel ${idx + 1}`}</h4>
                  {/* Copy & Download Buttons */}
                  {hasData && (
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(output);
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
                          const blob = new Blob([output], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${platforms[idx] || "output"}_data.json`;
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
                <pre
                  className={`text-sm whitespace-pre-wrap break-words ${
                    isDark ? "text-gray-300" : "text-gray-800"
                  }`}
                >
                  {output}
                </pre>
              </div>
            );
          })}
        </div>

        {/* Popup */}
        <AnimatePresence>
          {showPopup && (
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-50">
              <div className="themed-modal">
                <div className="themed-card">
                  <video
                    src={theme === 'dark' ? loaderVideoDark : loaderVideoLight}
                    autoPlay muted loop
                    className={`w-full h-full ${theme === 'light' ? 'object-cover filter brightness-105 contrast-105' : 'object-contain'}`}
                  />
                </div>
                <div className="title mt-2">Collection In Progress</div>
                <div className="subtitle text-sm">{currentPlatform ? `Processing: ${currentPlatform}` : "Preparing..."}</div>

                <div className="w-full mt-4">
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <div className="percent text-center mt-2">{progressPercent}%</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wait Modal */}
        <AnimatePresence>
          {waitModal.show && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-black/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl border border-white/10 max-w-sm text-center">
                <p className="text-white text-lg font-semibold mb-4">
                  Rate limit hit on {waitModal.platform}. Please wait {countdown} seconds or continue now.
                </p>
                <div className="flex gap-4 mt-4">
                  <button onClick={cancelProcessing} className="px-6 py-2 bg-red-600 rounded-lg font-semibold hover:bg-red-500">Cancel</button>
                  <button onClick={continueAfterWait} className="px-6 py-2 bg-green-600 rounded-lg font-semibold hover:bg-green-500">Continue</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Overwrite confirmation modal */}
        <AnimatePresence>
          {overwriteModal.show && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-black/90 backdrop-blur-xl rounded-3xl p-8 flex flex-col items-center justify-center shadow-2xl border border-white/10 max-w-sm text-center">
                <p className="text-white text-lg font-semibold mb-4">Profile "{overwriteModal.identifier}" already has collected data.</p>
                <p className="text-gray-300 text-sm">Do you want to overwrite existing results? This will replace previous collection for this profile.</p>
                <div className="flex gap-4 mt-6">
                  <button onClick={() => { setOverwriteModal({ show: false, identifier: "", pendingAction: "", data: null }); }} className="px-6 py-2 bg-gray-700 rounded-lg font-semibold hover:bg-gray-600">Cancel</button>
                  <button onClick={() => {
                    // perform the pending action
                    const action = overwriteModal.pendingAction;
                    const payload = overwriteModal.data;
                    setOverwriteModal({ show: false, identifier: "", pendingAction: "", data: null });
                    if (action === "save") {
                      performSave(payload.filteredData, payload.selected);
                    } else if (action === "process") {
                      // remove existing marker and proceed
                      startProcessingActual();
                    }
                  }} className="px-6 py-2 bg-green-600 rounded-lg font-semibold hover:bg-green-500">Overwrite</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-2 text-gray-400 text-xs">
          Ensure your API keys in <strong>Settings</strong> are filled for accurate data correlation.
        </p>
        {/* Footer: sticks to bottom when content is short, flows after content when long */}
        <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center">
          <button onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-medium shadow">Back</button>
          <button onClick={() => navigate('/datacorrelation')} className="px-5 py-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-semibold shadow-lg">Next</button>
        </div>
      </div>
    </div>
  );
};

export default DataCollection;
