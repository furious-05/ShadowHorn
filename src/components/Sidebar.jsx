import React, { useState } from "react";
import { NavLink } from "react-router-dom";

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`${collapsed ? "w-16" : "w-64"} bg-gray-900 text-white flex flex-col p-4 h-screen transition-all duration-200 relative`}
    >
      <button
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={() => setCollapsed(!collapsed)}
        className="absolute left-3 top-3 bg-gray-800 border border-gray-700 text-white rounded-md p-2 w-10 h-10 flex items-center justify-center shadow hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 z-10"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transform transition-transform duration-150 ${collapsed ? "rotate-0" : "-rotate-180"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
      </button>

      <h1 className={`font-bold mb-6 mt-1 flex items-center ${collapsed ? "justify-center text-sm pl-0" : "justify-start text-2xl pl-12"}`}>
        <span className={`mr-2 ${collapsed ? "hidden" : "inline-block"}`}>ShadowHorn</span>
        {collapsed && <span className="text-white font-bold">SH</span>}
      </h1>

      <nav className="flex flex-col space-y-2 mt-4">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M13 5v6h6" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>Dashboard</span>
        </NavLink>
        <NavLink
          to="/datacollection"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="7" width="18" height="13" rx="2" ry="2" />
            <path d="M16 3v4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>Data Collection</span>
        </NavLink>
        <NavLink
          to="/datacorrelation"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10 14a3 3 0 100-6 3 3 0 000 6z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 14v7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M3 7v7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>Data Correlation</span>
        </NavLink>
        <NavLink
          to="/data-preview"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="16" rx="2" ry="2" />
            <path d="M3 10h18" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>Data Preview</span>
        </NavLink>
        <NavLink
          to="/node-visualization"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19 12a7 7 0 00-14 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>Node Visualization</span>
        </NavLink>
        <NavLink
          to="/reports"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 17v-6a2 2 0 012-2h6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 17v2a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>Reports</span>
        </NavLink>
        <NavLink
          to="/about"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isActive
                ? "bg-blue-600/20 text-blue-400 border-l-4 border-blue-500"
                : "text-gray-300 hover:text-blue-400 hover:bg-white/5"
            }`
          }
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 015.82 0" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 17h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={`${collapsed ? "hidden" : "inline"}`}>About</span>
        </NavLink>
      </nav>
    </aside>
  );
};

export default Sidebar;
