import React, { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { setAuth } from "../utils/auth";
import { ThemeContext } from "../contexts/ThemeContext";
import logo from "../assets/logo.png";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

const Login = ({ onLogin }) => {
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      if (data.must_change_password) {
        setToken(data.token);
        setCurrentPassword(password);
        setMustChangePassword(true);
        setLoading(false);
        return;
      }

      setAuth(data.token, data.username);
      onLogin();
      navigate("/dashboard");
    } catch (err) {
      setError("Unable to connect to server");
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Password change failed");
        setLoading(false);
        return;
      }

      setAuth(data.token, username);
      onLogin();
      navigate("/dashboard");
    } catch (err) {
      setError("Unable to connect to server");
      setLoading(false);
    }
  };

  const containerClass = isDark
    ? "flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-950 text-white relative"
    : "flex items-center justify-center min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-50 text-gray-900 relative";

  const cardClass = isDark
    ? "relative glass-card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 shadow-2xl z-10"
    : "relative bg-white border border-gray-200 rounded-2xl p-10 shadow-xl z-10";

  const inputClass = isDark
    ? "w-full mt-1 px-3 py-2.5 bg-black/40 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-400 transition"
    : "w-full mt-1 px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 transition";

  const labelClass = isDark ? "text-gray-300 text-sm font-medium" : "text-gray-600 text-sm font-medium";

  if (mustChangePassword) {
    return (
      <div className={containerClass}>
        {isDark && <div className="absolute w-[600px] h-[600px] bg-amber-600/10 rounded-full blur-[180px]"></div>}

        <div className={`${cardClass} w-[420px] max-w-[90vw]`}>
          <div className="flex flex-col items-center mb-8">
            <img src={logo} alt="ShadowHorn" className="w-28 h-auto object-contain mb-4" />
            <h1 className={`text-xl font-bold ${isDark ? "text-amber-300" : "text-amber-600"}`}>
              Password Change Required
            </h1>
            <p className={`text-sm mt-2 text-center ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              You must set a new password before continuing.
            </p>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-5">
            <div>
              <label className={labelClass}>New Password</label>
              <input
                type="password"
                className={inputClass}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoFocus
              />
            </div>

            <div>
              <label className={labelClass}>Confirm New Password</label>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm font-semibold text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white py-2.5 rounded-lg font-semibold transition shadow-lg disabled:opacity-50"
            >
              {loading ? "Updating..." : "Set New Password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      {isDark && <div className="absolute w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[180px]"></div>}

      <div className={`${cardClass} w-[400px] max-w-[90vw]`}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img
            src={logo}
            alt="ShadowHorn"
            className="w-32 h-auto object-contain"
          />
          <h1 className="mt-3 text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            ShadowHorn
          </h1>
          <p className={`text-xs mt-1 tracking-wider ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            Secure Intelligence Framework
          </p>
        </div>

        {/* Default Credentials */}
        <div className={`w-full text-xs p-4 rounded-xl mb-6 font-mono ${
          isDark
            ? "bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700/50"
            : "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60"
        }`}>
          <p className={`text-[10px] uppercase tracking-widest mb-2 font-sans font-semibold ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            Default Credentials
          </p>
          <p className="mb-1">
            <span className={isDark ? "text-gray-400" : "text-gray-500"}>Username: </span>
            <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>shadowhorn</span>
          </p>
          <p>
            <span className={isDark ? "text-gray-400" : "text-gray-500"}>Password: </span>
            <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>ShadowHorn@2026</span>
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
          <div>
            <label className={labelClass}>Username</label>
            <input
              type="text"
              className={inputClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoFocus
            />
          </div>

          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm font-semibold text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg font-semibold transition shadow-lg disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>

        <p className={`text-center text-xs mt-5 font-mono ${isDark ? "text-gray-600" : "text-gray-400"}`}>
          &copy; ShadowHorn &mdash; Intelligence Platform 2026
        </p>
      </div>
    </div>
  );
};

export default Login;
