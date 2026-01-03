import React, { useEffect, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';
import { ThemeContext } from "./contexts/ThemeContext";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

const StatusPill = ({ ok }) => (
  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${ok ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
    {ok ? 'OK' : 'DOWN'}
  </span>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const { theme } = useContext(ThemeContext);
  const isDark = theme === "dark";
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [profilesOpen, setProfilesOpen] = useState(false);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/dashboard-summary');
        const data = await res.json();
        setSummary(data);
      } catch (e) {
        console.error(e);
      }
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/status');
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        console.error(e);
      }
    };

    fetchSummary();
    fetchStatus();
    const fetchProfiles = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/profiles');
        const data = await res.json();
        setProfiles(data);
      } catch (e) {
        console.error(e);
      }
    };
    fetchProfiles();
  }, []);

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

        <div className="flex justify-end mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`text-sm ${
                isDark ? "text-gray-300" : "text-gray-700"
              }`}
            >
              APIs
            </div>
            {status ? (
              <div className="flex gap-2">
                <div className="flex items-center gap-2"><span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>GH</span><StatusPill ok={status.apis.github} /></div>
                <div className="flex items-center gap-2"><span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>TW</span><StatusPill ok={status.apis.twitter} /></div>
                <div className="flex items-center gap-2"><span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>BD</span><StatusPill ok={status.apis.breachDirectory} /></div>
                <div className="flex items-center gap-2"><span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>OR</span><StatusPill ok={status.apis.openRouter} /></div>
                <div className="flex items-center gap-2"><span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>DB</span><StatusPill ok={status.mongodb} /></div>
              </div>
            ) : (
              <div className={isDark ? "text-gray-500" : "text-gray-600"}>Loading...</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div
            className={`glass-card shadow-lg backdrop-blur-md rounded-2xl p-6 border ${
              isDark
                ? "bg-white/5 border-white/10"
                : "bg-white border-gray-200"
            }`}
          >
            <h3
              className={`text-sm ${
                isDark ? "text-gray-300" : "text-gray-900"
              }`}
            >
              Total Correlations
            </h3>
            <p
              className={`text-2xl font-bold ${
                isDark ? "text-white" : "text-gray-900"
              }`}
            >
              {summary?.correlation?.count ?? ''}
            </p>
            <p
              className={`text-xs mt-2 ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Last: {summary?.correlation?.last?.identifier ?? ''}
            </p>
            <div className="mt-4">
              <TrendSmall typeKey="Correlation" />
            </div>
          </div>

          <div
            className={`glass-card shadow-lg backdrop-blur-md rounded-2xl p-6 border ${
              isDark
                ? "bg-white/5 border-white/10"
                : "bg-white border-gray-200"
            }`}
          >
            <h3
              className={`text-sm ${
                isDark ? "text-gray-300" : "text-gray-900"
              }`}
            >
              Latest Collected (by collection)
            </h3>
            <div
              className={`mt-3 text-sm space-y-2 ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              {summary ? Object.entries(summary.collections).map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span className={isDark ? "text-gray-300" : "text-gray-800"}>{k}</span>
                  <span className={isDark ? "text-gray-400" : "text-gray-600"}>{v.last?.identifier ?? ''}</span>
                </div>
              )) : <div className={isDark ? "text-gray-400" : "text-gray-600"}>Loading...</div>}
            </div>
          </div>

          <div
            className={`glass-card shadow-lg backdrop-blur-md rounded-2xl p-6 border ${
              isDark
                ? "bg-white/5 border-white/10"
                : "bg-white border-gray-200"
            }`}
          >
            <h3
              className={`text-sm ${
                isDark ? "text-gray-300" : "text-gray-900"
              }`}
            >
              Collection Counts
            </h3>
            <div
              className={`mt-3 text-sm space-y-2 ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              {summary ? Object.entries(summary.collections).map(([k,v]) => (
                <div key={k} className="flex justify-between">
                  <span className={isDark ? "text-gray-300" : "text-gray-800"}>{k}</span>
                  <span className={isDark ? "text-gray-400" : "text-gray-600"}>{v.count}</span>
                </div>
              )) : <div className={isDark ? "text-gray-400" : "text-gray-600"}>Loading...</div>}
            </div>
            <div className="mt-4">
              <TrendSmall typeKey="GitHub" />
            </div>
          </div>
        </div>
        {/* Profiles section: full-width preview + expandable list */}
        <div
          className={`mt-6 glass-card shadow-lg backdrop-blur-md rounded-2xl p-6 w-full border ${
            isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-200"
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <h3
                className={`text-sm ${
                  isDark ? "text-gray-300" : "text-gray-900"
                }`}
              >
                Collected Profiles
              </h3>
              <p
                className={`text-2xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                {profiles?.total ?? ''}
              </p>
              <p
                className={`text-xs mt-2 ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                All identifiers collected across platforms
              </p>
            </div>
            <div className="flex flex-col items-end">
              <div className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>Latest</div>
              <div className={isDark ? "text-gray-200 font-semibold" : "text-gray-800 font-semibold"}>{profiles?.profiles?.[0]?.identifier ?? ''}</div>
              <button
                onClick={() => setProfilesOpen(!profilesOpen)}
                className={`mt-3 px-4 py-2 rounded-full text-sm transition ${
                  isDark
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-800"
                }`}
              >
                {profilesOpen ? 'Hide' : 'View All'}
              </button>
            </div>
          </div>

          <div className="mt-4">
            {profiles ? (
              <div className="flex gap-3 overflow-x-auto py-2">
                {profiles.profiles.slice(0, 10).map((p) => (
                  <div
                    key={p.identifier}
                    className={`min-w-[200px] p-3 rounded-lg ${
                      isDark
                        ? "bg-gray-800/40"
                        : "bg-gray-50 border border-gray-200"
                    }`}
                  >
                    <div className={`text-sm font-semibold truncate ${isDark ? "text-gray-300" : "text-gray-900"}`}>{p.identifier}</div>
                    <div className={`text-xs mt-1 truncate ${isDark ? "text-gray-400" : "text-gray-700"}`}>{(p.usernames && p.usernames[0]) || p.platforms.join(', ')}</div>
                    <div className={`text-xs mt-2 ${isDark ? "text-gray-500" : "text-gray-500"}`}>{p.platforms.join('  ')}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={isDark ? "text-gray-500" : "text-gray-600"}>Loading profiles...</div>
            )}
          </div>

          {profilesOpen && (
            <div className="mt-4 max-h-64 overflow-auto">
              <table className="w-full text-sm table-auto">
                <thead>
                  <tr
                    className={`text-left text-xs border-b ${
                      isDark
                        ? "text-gray-400 border-white/5"
                        : "text-gray-600 border-gray-200"
                    }`}
                  >
                    <th className="py-2">Identifier</th>
                    <th className="py-2">Usernames / Handles</th>
                    <th className="py-2">Platforms</th>
                    <th className="py-2">Last Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.profiles.map((p) => (
                    <tr
                      key={p.identifier}
                      className={`border-b ${
                        isDark ? "border-white/3" : "border-gray-100"
                      }`}
                    >
                      <td className={isDark ? "py-2 text-gray-200" : "py-2 text-gray-900"}>{p.identifier}</td>
                      <td className={isDark ? "py-2 text-gray-300" : "py-2 text-gray-800"}>{(p.usernames && p.usernames.join(', ')) || ''}</td>
                      <td className={isDark ? "py-2 text-gray-300" : "py-2 text-gray-800"}>{p.platforms.join(', ')}</td>
                      <td className={isDark ? "py-2 text-gray-400" : "py-2 text-gray-600"}>{p.last_collected ? new Date(p.last_collected).toLocaleString() : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {/* Footer: sticks to bottom when content is short, flows after content when long */}
        <div
          className={`mt-auto pt-4 flex justify-end border-t ${
            isDark ? "border-white/5" : "border-gray-200"
          }`}
        >
          <button
            onClick={() => navigate('/datacollection')}
            className={`px-5 py-3 rounded-full font-semibold shadow-lg transition ${
              isDark
                ? "bg-gray-700 hover:bg-gray-600 text-white"
                : "bg-blue-600 hover:bg-blue-500 text-white"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const TrendSmall = ({ typeKey = 'Correlation' }) => {
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/trends?days=14');
        const data = await res.json();
        if (data && data.dates && data.counts) {
          setTrend({ labels: data.dates, values: data.counts[typeKey] || Array(data.dates.length).fill(0) });
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
  }, [typeKey]);

  if (!trend) return <div className="text-gray-500 text-xs">Loading trend...</div>;

  const chartData = {
    labels: trend.labels,
    datasets: [
      {
        label: typeKey,
        data: trend.values,
        borderColor: 'rgba(99,102,241,0.9)',
        backgroundColor: 'rgba(99,102,241,0.12)',
        tension: 0.3,
        pointRadius: 0,
      }
    ]
  };

  const opts = { plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { display: false } }, maintainAspectRatio: false };

  return (
    <div style={{ height: 64 }}>
      <Line data={chartData} options={opts} />
    </div>
  );
};

export default Dashboard;
