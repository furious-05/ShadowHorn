import React from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Logo from "./assets/logo.png"; // replace with correct path if different

const About = () => {
  return (
    <div className="flex h-screen bg-gradient-to-b from-gray-900 via-black to-gray-950 text-white font-inter overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        {/* Top Bar */}
        <Topbar />

        {/* About Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Overview */}
          <div className="glass-card shadow-lg">
            <h2 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              What is ShadowHorn?
            </h2>
            <p className="text-gray-300 leading-relaxed">
              ShadowHorn is an end‑to‑end OSINT & Threat Intelligence platform that brings collection,
              correlation, visualization, and reporting into a single workflow. It helps analysts move
              from raw public data to an evidence‑backed intelligence report in just a few clicks, while
              keeping all data under their control.
            </p>
            <p className="text-gray-400 mt-3 text-sm leading-relaxed">
              The full pipeline — from first data collection through AI correlation and reporting — is
              built around free‑tier APIs. You can run ShadowHorn end‑to‑end without paying for external
              services (optional breach‑directory lookups stay billed by the data provider, if you choose
              to enable them).
            </p>
          </div>

          {/* Core Workflow */}
          <div className="glass-card shadow-lg">
            <h2 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Analyst Workflow
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-300 text-sm">
              <li><span className="font-semibold">Dashboard:</span> High‑level view of profiles, activity, and collection status.</li>
              <li><span className="font-semibold">Data Collection:</span> Run OSINT collectors against usernames and profiles across GitHub, Twitter/X, Reddit, Medium, StackOverflow, Snapchat, breach directories, and web search.</li>
              <li><span className="font-semibold">Data Management & Preview:</span> Inspect, filter, and clean the raw JSON stored in MongoDB before deeper analysis.</li>
              <li><span className="font-semibold">Data Correlation:</span> Use AI to merge multi‑platform signals into a single correlated identity with risk flags.</li>
              <li><span className="font-semibold">Node Visualization:</span> Explore relationships between identities, emails, domains, and platforms as an interactive graph.</li>
              <li><span className="font-semibold">Intelligence Reports:</span> Generate CPTS‑style reports with AI narratives and export them as PDF or JSON for stakeholders.</li>
            </ul>
          </div>

          {/* Collection & Correlation */}
          <div className="glass-card shadow-lg md:col-span-2">
            <h2 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              OSINT Collection & AI Correlation
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-3">
              ShadowHorn ships with a suite of focused collectors that pull OSINT from social networks,
              code repositories, breach‑lookups, and search engines. Collected data is normalized into
              MongoDB and then passed to the AI correlation engine, which builds a structured profile
              including identifiers, exposure, compromise indicators, and platform‑level context.
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-gray-300 text-sm">
              <li>Dedicated collectors for GitHub, Twitter/X, Reddit, Medium, StackOverflow, Snapchat, breach directories, compromise checks, and DuckDuckGo search.</li>
              <li>Configurable via the Settings page with API keys stored in a secure MongoDB collection.</li>
              <li>AI correlation powered by local models and OpenRouter/OpenAI backends, with a JSON schema tailored for downstream reporting.</li>
            </ul>
          </div>

          {/* Visualization & Reporting */}
          <div className="glass-card shadow-lg">
            <h2 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Graphs & Intelligence Reports
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-300 text-sm">
              <li>Cytoscape‑based node graphs that highlight identities, interests, timelines, and connections across platforms.</li>
              <li>Interactive layout with drag, zoom, and focus on individual nodes for deeper investigation.</li>
              <li>AI‑generated narratives that summarize exposure, risk, and recommended next steps for each profile.</li>
              <li>Professional, dark‑themed PDF exports suitable for executive or client‑facing reports.</li>
            </ul>
          </div>

          {/* Technology & Architecture */}
          <div className="glass-card shadow-lg">
            <h2 className="text-2xl font-bold mb-3 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Technology Stack
            </h2>
            <ul className="list-disc list-inside space-y-1.5 text-gray-300 text-sm">
              <li><span className="font-semibold">Frontend:</span> React + Vite with Tailwind‑style utility classes, Chart.js dashboards, and Cytoscape visualizations.</li>
              <li><span className="font-semibold">Backend:</span> Python Flask API exposing OSINT collectors, correlation, and reporting endpoints.</li>
              <li><span className="font-semibold">Data Layer:</span> MongoDB for storing raw collection results, settings, correlations, and report data.</li>
              <li><span className="font-semibold">AI Integrations:</span> OpenRouter / OpenAI for correlation and narrative generation, with support for local models via gpt4all and sentence‑transformers.</li>
              <li><span className="font-semibold">PDF Engine:</span> ReportLab for high‑fidelity, dark‑themed intelligence report generation.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 mt-8 text-xs">
          © 2026 ShadowHorn | All Rights Reserved
        </p>
      </div>
    </div>
  );
};

export default About;
