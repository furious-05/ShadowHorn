import React, { useState, useEffect, useContext } from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { ThemeContext } from "../contexts/ThemeContext";
import { authFetch } from "../utils/auth";

const Settings = () => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [apiKeys, setApiKeys] = useState({
    twitter: "",
    github: "",
    breachDirectory: "",
    openRouter: "",
  });

  const [isLocked, setIsLocked] = useState(false);
  const [message, setMessage] = useState(""); // For success/error messages
  const [messageType, setMessageType] = useState("success"); // success or error

  // Load keys from backend on component mount
  useEffect(() => {
    const fetchKeys = async () => {
      try {
        const res = await authFetch("/api/get-keys");
        const data = await res.json();
        setApiKeys(data);
        setIsLocked(true);
      } catch (err) {
        console.error(err);
        setMessage("Failed to load API keys.");
        setMessageType("error");
      }
    };
    fetchKeys();
  }, []);

  const handleChange = (e) => {
    setApiKeys({ ...apiKeys, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    try {
      await authFetch("/api/save-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiKeys),
      });
      setIsLocked(true);
      setMessage("API keys saved successfully!");
      setMessageType("success");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      console.error(err);
      setMessage("Failed to save API keys.");
      setMessageType("error");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const handleEdit = () => {
    setIsLocked(false);
    setMessage("");
  };

  const inputClass = (locked) =>
    isDark
      ? `w-full mt-1 px-3 py-2 bg-black/40 border border-gray-600 rounded-lg text-white
     focus:outline-none focus:border-blue-400 transition ${locked ? "opacity-50 cursor-not-allowed" : ""}`
      : `w-full mt-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900
     focus:outline-none focus:border-blue-400 transition ${locked ? "opacity-50 cursor-not-allowed" : ""}`;

  return (
    <div
      className={
        isDark
          ? "flex h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white"
          : "flex h-screen bg-gray-50 text-gray-900"
      }
    >
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <Topbar />

        {/* Page Title */}
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          System Settings
        </h1>

        <div
          className={
            isDark
              ? "glass-card bg-white/5 border border-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-xl max-w-3xl mb-8"
              : "glass-card bg-white border border-gray-200 shadow-sm p-8 rounded-2xl max-w-3xl mb-8"
          }
        >
          <h2
            className={`text-xl font-semibold mb-6 ${isDark ? "text-gray-300" : "text-gray-800"}`}
          >
            API Key Configuration
          </h2>

          <p className={`text-xs mb-6 max-w-xl ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            All collectors use free API tiers where possible: Twitter, GitHub and OpenRouter can be used for free; only the BreachDirectory key requires a paid plan from the provider.
          </p>

          {/* Inputs */}
          {["twitter", "github", "breachDirectory", "openRouter"].map((key) => (
            <div className="mb-5" key={key}>
              <label className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{key} API Key</label>
              <input
                type="text"
                name={key}
                value={apiKeys[key]}
                onChange={handleChange}
                disabled={isLocked}
                placeholder={`Enter ${key} API Key`}
                className={inputClass(isLocked)}
              />
            </div>
          ))}

          {/* External Links */}
          <div className="mb-6 flex flex-col gap-1">
            <a
              href="https://rapidapi.com/rohan-patra/api/breachdirectory"
              target="_blank"
              rel="noopener noreferrer"
              className={
                isDark
                  ? "text-blue-400 text-sm underline hover:text-blue-300 transition"
                  : "text-blue-600 text-sm underline hover:text-blue-500 transition"
              }
            >
              ➜ Visit BreachDirectory Website
            </a>
            <a
              href="https://openrouter.ai/"
              target="_blank"
              rel="noopener noreferrer"
              className={
                isDark
                  ? "text-blue-400 text-sm underline hover:text-blue-300 transition"
                  : "text-blue-600 text-sm underline hover:text-blue-500 transition"
              }
            >
              ➜ Visit OpenRouter Website
            </a>
            <a
              href="https://youtu.be/Azkyhcxc1cE?si=uhW1wIuEiNxEW_c6"
              target="_blank"
              rel="noopener noreferrer"
              className={
                isDark
                  ? "text-blue-400 text-sm underline hover:text-blue-300 transition"
                  : "text-blue-600 text-sm underline hover:text-blue-500 transition"
              }
            >
              ➜ OpenRouter API key walkthrough (YouTube)
            </a>
          </div>

          {/* Buttons */}
          <div className="flex gap-4">
            {!isLocked ? (
              <button
                onClick={handleSave}
                className="bg-blue-600/80 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-semibold transition shadow-lg"
              >
                Save Keys
              </button>
            ) : (
              <button
                onClick={handleEdit}
                className="bg-yellow-600/80 hover:bg-yellow-500 text-white px-5 py-2 rounded-lg font-semibold transition shadow-lg"
              >
                Edit Keys
              </button>
            )}
          </div>

          {/* Message */}
          {message && (
            <p
              className={`mt-4 font-medium ${
                messageType === "success" ? "text-green-400" : "text-red-400"
              }`}
            >
              {message}
            </p>
          )}
        </div>

        {/* Footer */}
        <p className="text-gray-600 text-xs mt-8 text-center font-mono">
          © ShadowHorn — Secure Intelligence Platform 2026
        </p>
      </div>
    </div>
  );
};

export default Settings;
