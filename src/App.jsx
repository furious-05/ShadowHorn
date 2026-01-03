import { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Settings from "./Settings";
import DataManagement from "./DataManagement";
import DataCollection from "./DataCollection"; // <-- you must import it
import DataCorrelation from "./DataCorrelation"; // <-- you must import it
import NodeVisualization from "./NodeVisualization";
import Report from "./Report";
import About from "./About"; // <-- import About page
import DataPreview from "./DataPreview";
import ThemeProvider from './contexts/ThemeContext';
import ErrorBoundary from './ErrorBoundary';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Protected route wrapper
  const ProtectedRoute = ({ children }) => {
    return isLoggedIn ? children : <Navigate to="/login" replace />;
  };

  return (
    <ThemeProvider>
    <Router>
      <ErrorBoundary>
      <Routes>
        {/* Login Page */}
        <Route
          path="/login"
          element={<Login onLogin={() => setIsLoggedIn(true)} />}
        />

        {/* Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        {/* Settings */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/data-management"
          element={
            <ProtectedRoute>
              <DataManagement />
            </ProtectedRoute>
          }
        />
        <Route
        path="/datacollection"
        element={
          <ProtectedRoute>
            <DataCollection />
          </ProtectedRoute>
        }
      />
      <Route
        path="/datacorrelation"
        element={
          <ProtectedRoute>
            <DataCorrelation />
          </ProtectedRoute>
        }
      />
      <Route
        path="/node-visualization"
        element={
          <ProtectedRoute>
            <NodeVisualization />
          </ProtectedRoute>
        }
      />
      <Route
        path="/data-preview"
        element={
          <ProtectedRoute>
            <DataPreview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <ProtectedRoute>
            <Report />
          </ProtectedRoute>
        }
      />
              {/* About Page */}
        <Route
          path="/about"
          element={
            <ProtectedRoute>
              <About />
            </ProtectedRoute>
          }
        />

        {/* Redirect unknown routes to login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </ErrorBoundary>
    </Router>
    </ThemeProvider>
  );
}

export default App;
