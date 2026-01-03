import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom"; // import useNavigate
import logo from "./assets/logo.png";
import loadingVideo from "./assets/Video.mp4";

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [defaultPassword, setDefaultPassword] = useState(() => generateSecurePassword());
  const [isTyping, setIsTyping] = useState(false);
  // Typing animation for autofill
  // ...existing code...
  const [error, setError] = useState("");
  const navigate = useNavigate(); // hook to programmatically navigate

  const usernameRef = useRef(null);
  const passwordRef = useRef(null);

  const maskPassword = (p) => p.replace(/./g, "•").replace(/(.{4})/g, "$1 ").trim();

  // ...existing code...

  const typeInto = async (field, value, speed = 60) => {
    if (isTyping) return;
    setIsTyping(true);
    if (field === "username") {
      usernameRef.current?.focus();
      setUsername("");
    } else {
      passwordRef.current?.focus();
      setPassword("");
    }
    await new Promise((resolve) => {
      let i = 0;
      const step = () => {
        const v = value.slice(0, i + 1);
        if (field === "username") setUsername(v);
        else setPassword(v);
        i++;
        if (i < value.length) setTimeout(step, speed);
        else resolve();
      };
      setTimeout(step, speed);
    });
    setIsTyping(false);
  };

  const handleTypeCredentials = async () => {
    await typeInto("username", "furious");
    await typeInto("password", defaultPassword);
  };

  const handleLogin = (e) => {
    e.preventDefault();

    if (username === "furious" && password === defaultPassword) {
      onLogin(); // update App state
      // show loading animation/video then navigate
      setShowLoading(true);
      // short delay so the video appears to 'load' the app
      setTimeout(() => {
        setShowLoading(false);
        navigate("/dashboard");
      }, 2200);
    } else {
      setError("Invalid credentials. Use the secure assistant to autofill.");
    }
  };

  const [showLoading, setShowLoading] = React.useState(false);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-gray-900 via-black to-gray-950 text-white font-inter relative">

      {/* Background Glow */}
      <div className="absolute w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[180px]"></div>

      {/* Login Card */}
      <div className="relative glass-card bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-10 w-[380px] shadow-2xl z-10">

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img
            src={logo}
            alt="ShadowHorn"
            className="w-20 h-20 rounded-full shadow-lg"
          />
          <h1 className="mt-3 text-3xl font-bold bg-gradient-to-r from-blue-300 to-blue-500 bg-clip-text text-transparent">
            ShadowHorn
          </h1>
          <p className="text-gray-400 text-xs mt-2 tracking-wider">
            Secure Intelligence Framework
          </p>
        </div>

        {/* Default Credentials (static display + icon autofill) */}
        <div
          className="w-full text-left bg-gradient-to-r from-slate-900/60 to-blue-900/40 backdrop-blur-md border border-slate-700/40 text-blue-200 text-xs p-4 rounded-xl mb-6 font-mono shadow-lg select-none flex items-center justify-between"
          title="Default credentials for login"
        >
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-blue-400"><path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5Zm0 2c-4.418 0-8 2.239-8 5v2h16v-2c0-2.761-3.582-5-8-5Z" fill="currentColor"/></svg>
            <span className="tracking-wide">Default: furious / <span className="tracking-widest">{defaultPassword.slice(0,6)}{'*'.repeat(10)}</span></span>
          </div>
          <button
            type="button"
            className={`ml-2 p-2 bg-blue-700/60 hover:bg-blue-600/80 text-white rounded-full shadow-sm transition flex items-center justify-center ${isTyping ? 'opacity-60 cursor-not-allowed' : ''}`}
            onClick={handleTypeCredentials}
            title="Autofill credentials with typing animation"
            disabled={isTyping}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2M7 9V7a5 5 0 0 1 10 0v2M12 15v2M9 15v2m6-2v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {isTyping && <span className="ml-3 text-blue-300/80">Typing…</span>}
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
          <div>
            <label className="text-gray-300 text-sm">Username</label>
            <input
              type="text"
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-400 transition"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              ref={usernameRef}
              autoComplete="off"
              name={"user_" + defaultPassword.slice(0,4)}
            />
          </div>

          <div>
            <label className="text-gray-300 text-sm">Password</label>
            <input
              type="password"
              className="w-full mt-1 px-3 py-2 bg-black/40 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-400 transition"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              ref={passwordRef}
              autoComplete="off"
              name={"pass_" + defaultPassword.slice(-4)}
            />
          </div>

          {/* Honeypot anti-bot field (hidden) */}
          <input type="text" name="email" style={{display: 'none'}} tabIndex="-1" autoComplete="off" />
          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm font-semibold text-center">
              {error}
            </p>
          )}

          {/* Login Button */}
          <button
            type="submit"
            className="w-full bg-blue-600/80 hover:bg-blue-500 text-white py-2 rounded-lg font-semibold transition shadow-lg"
          >
            Login
          </button>
        </form>

        {/* Footer */}
        <p className="text-gray-500 text-center text-xs mt-4 font-mono">
          © ShadowHorn – Intelligence Dashboard 2026
        </p>
      </div>
      {/* Loading overlay (plays after successful login) */}
      {showLoading && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
          <video src={loadingVideo} autoPlay muted playsInline className="w-[420px] max-w-[90%] rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
};

export default Login;

// Generate a strong random password with mixed character classes
function generateSecurePassword(len = 16) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-";
  const all = upper + lower + digits + symbols;
  let result = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)]
  ].join("");
  for (let i = result.length; i < len; i++) {
    result += all[Math.floor(Math.random() * all.length)];
  }
  // shuffle
  return result.split("").sort(() => Math.random() - 0.5).join("");
}
