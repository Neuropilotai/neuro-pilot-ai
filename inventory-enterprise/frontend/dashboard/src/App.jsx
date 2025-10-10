import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useThemeStore } from './stores/themeStore';
import Login from './pages/Login';
import DashboardLayout from './components/DashboardLayout';
import Overview from './pages/Overview';
import Tenants from './pages/Tenants';
import Roles from './pages/Roles';
import AIPerformance from './pages/AIPerformance';
import Security from './pages/Security';
import AILearning from './pages/AILearning';
import SystemHealth from './pages/SystemHealth';
import Governance from './pages/Governance';
import InventoryCount from './pages/InventoryCount';
import OwnerConsole from './pages/OwnerConsole';

function App() {
  const { isAuthenticated, initialize: initAuth } = useAuthStore();
  const { initialize: initTheme } = useThemeStore();

  useEffect(() => {
    initAuth();
    initTheme();
  }, [initAuth, initTheme]);

  return (
    <Routes>
      <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" />} />

      <Route
        path="/dashboard"
        element={isAuthenticated ? <DashboardLayout /> : <Navigate to="/login" />}
      >
        <Route index element={<Navigate to="/dashboard/overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="tenants" element={<Tenants />} />
        <Route path="roles" element={<Roles />} />
        <Route path="ai" element={<AIPerformance />} />
        <Route path="security" element={<Security />} />
        <Route path="ai-learning" element={<AILearning />} />
        <Route path="health" element={<SystemHealth />} />
        <Route path="governance" element={<Governance />} />
        <Route path="inventory-count" element={<InventoryCount />} />
        <Route path="owner-console" element={<OwnerConsole />} />
      </Route>

      <Route path="*" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} />} />
    </Routes>
  );
}

export default App;
