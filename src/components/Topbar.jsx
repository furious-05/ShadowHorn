import React, { useState, useContext } from "react";
import { Link } from "react-router-dom";
import logo from "../assets/logo.png";
import { ThemeContext } from "../contexts/ThemeContext";

const Topbar = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const { theme, toggleTheme } = useContext(ThemeContext);

  return (
    <div className="flex justify-end items-center mb-6 relative">
      <div className="relative">
        {/* Logo Button */}
        <button
          className="w-12 h-12 rounded-full cursor-pointer ring-2 ring-transparent hover:ring-blue-400 focus:ring-blue-400 transition relative flex items-center justify-center"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <img src={logo} alt="ShadowHorn Logo" className="w-full h-full rounded-full" />
          <svg
            className="absolute bottom-0 right-0 w-3 h-3 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Tooltip */}
        <div className="absolute bottom-full right-1/2 transform translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 transition-opacity duration-200 pointer-events-none">
          Menu
        </div>

        {/* Dropdown Menu */}
        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-44 bg-gray-800 text-white rounded-lg shadow-lg z-50" onMouseLeave={() => setDropdownOpen(false)}>
            <div className="px-4 py-2 text-gray-300 text-xs uppercase font-semibold">User Menu</div>

            <button onClick={() => { toggleTheme(); setDropdownOpen(false); }} className="w-full text-left px-4 py-2 hover:bg-gray-700 rounded flex items-center gap-3">
              {theme === "dark" ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span className="flex-1">Mode</span>
            </button>

            <Link
              to="/settings"
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700 rounded cursor-pointer"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.65 1.65 0 0015 19.4a1.65 1.65 0 00-1 .6 1.65 1.65 0 00-.33 1.09V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-.33-1.09 1.65 1.65 0 00-1-.6 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-.6-1 1.65 1.65 0 00-1.09-.33H3a2 2 0 010-4h.09a1.65 1.65 0 001.09-.33 1.65 1.65 0 00.6-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-.6 1.65 1.65 0 00.33-1.09V3a2 2 0 014 0v.09a1.65 1.65 0 00.33 1.09 1.65 1.65 0 001 .6 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.36.27.8.43 1.26.43H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.09.33 1.65 1.65 0 00-.42 1.24z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Settings</span>
            </Link>

            <Link
              to="/data-management"
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700 rounded cursor-pointer"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <ellipse cx="12" cy="5" rx="7" ry="3" />
                <path d="M5 9c0 1.66 3.13 3 7 3s7-1.34 7-3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 13c0 1.66 3.13 3 7 3s7-1.34 7-3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5 9v10c0 1.66 3.13 3 7 3s7-1.34 7-3V9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Data Management</span>
            </Link>

            <Link
              to="/about"
              className="flex items-center gap-3 px-4 py-2 hover:bg-gray-700 rounded cursor-pointer"
              onClick={() => setDropdownOpen(false)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 015.82 0" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>About</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Topbar;
