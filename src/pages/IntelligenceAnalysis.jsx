import React from "react";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

const IntelligenceAnalysis = () => {
  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white">
      <Sidebar />
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <Topbar />
        <h1 className="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">
          Intelligence Analysis
        </h1>
        <div className="glass-card bg-white/5 border border-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-xl max-w-3xl">
          <p className="text-gray-400">
            Intelligence analysis module. Use the Reports page for comprehensive AI-powered reports.
          </p>
        </div>
      </div>
    </div>
  );
};

export default IntelligenceAnalysis;
