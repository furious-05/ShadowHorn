import { useState, useEffect, lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import DataManagement from "./pages/DataManagement";
import DataCollection from "./pages/DataCollection";
import DataCorrelation from "./pages/DataCorrelation";
import DataPreview from "./pages/DataPreview";
import Report from "./pages/Report";
import About from "./pages/About";
import ThemeProvider from "./contexts/ThemeContext";
import ErrorBoundary from "./ErrorBoundary";
import { getToken, clearAuth, verifyToken } from "./utils/auth";

const NodeVisualization = lazy(() => import("./pages/NodeVisualization"));
const IntelligenceAnalysis = lazy(() => import("./pages/IntelligenceAnalysis"));

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!getToken());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    verifyToken().then((result) => {
      if (!result) {
        clearAuth();
        setIsLoggedIn(false);
      }
      setChecking(false);
    });
  }, []);

  const ProtectedRoute = ({ children }) => {
    if (checking) return null;
    return isLoggedIn ? children : <Navigate to="/login" replace />;
  };

  return (
    <ThemeProvider>
      <Router>
        <ErrorBoundary>
          <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">Loading...</div>}>
            <Routes>
              <Route
                path="/login"
                element={
                  isLoggedIn && !checking ? (
                    <Navigate to="/dashboard" replace />
                  ) : (
                    <Login onLogin={() => setIsLoggedIn(true)} />
                  )
                }
              />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/data-management" element={<ProtectedRoute><DataManagement /></ProtectedRoute>} />
              <Route path="/datacollection" element={<ProtectedRoute><DataCollection /></ProtectedRoute>} />
              <Route path="/datacorrelation" element={<ProtectedRoute><DataCorrelation /></ProtectedRoute>} />
              <Route path="/node-visualization" element={<ProtectedRoute><NodeVisualization /></ProtectedRoute>} />
              <Route path="/data-preview" element={<ProtectedRoute><DataPreview /></ProtectedRoute>} />
              <Route path="/intelligence" element={<ProtectedRoute><IntelligenceAnalysis /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Report /></ProtectedRoute>} />
              <Route path="/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Router>
    </ThemeProvider>
  );
}

export default App;
