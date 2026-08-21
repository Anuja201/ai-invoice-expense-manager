import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';

import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import Expenses from './pages/Expenses';
import Insights from './pages/Insights';
import Settings from './pages/Settings';

export const applyAppearance = (appearance) => {
  if (!appearance) return;
  const root = document.documentElement;
  
  if (appearance.theme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }
  
  if (appearance.compactMode) {
    document.body.classList.add('compact-mode');
  } else {
    document.body.classList.remove('compact-mode');
  }
  
  const ACCENT_MAP = {
    blue: { primary: '#2563EB', dark: '#1D4ED8', light: '#EFF6FF', mid: '#BFDBFE' },
    purple: { primary: '#8B5CF6', dark: '#7C3AED', light: '#F5F3FF', mid: '#DDD6FE' },
    emerald: { primary: '#10B981', dark: '#059669', light: '#ECFDF5', mid: '#A7F3D0' },
    rose: { primary: '#F43F5E', dark: '#E11D48', light: '#FFF1F2', mid: '#FECDD3' },
    amber: { primary: '#F59E0B', dark: '#D97706', light: '#FFFBEB', mid: '#FDE68A' }
  };
  
  const colors = ACCENT_MAP[appearance.accent] || ACCENT_MAP.blue;
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-dark', colors.dark);
  root.style.setProperty('--primary-light', colors.light);
  root.style.setProperty('--primary-mid', colors.mid);
};

export default function App() {
  useEffect(() => {
    try {
      const saved = localStorage.getItem('invoiceai_appearance');
      if (saved) applyAppearance(JSON.parse(saved));
    } catch (e) {}
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>

        <Routes>

          {/* Public pages */}
          <Route path="/" element={<Landing />} />

          <Route path="/login" element={<Login />} />

          <Route path="/register" element={<Register />} />

          <Route path="/forgot-password" element={<ForgotPassword />} />



          {/* Protected pages */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/invoices"
            element={
              <ProtectedRoute>
                <Layout>
                  <Invoices />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <Layout>
                  <Expenses />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights"
            element={
              <ProtectedRoute>
                <Layout>
                  <Insights />
                </Layout>
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <Settings />
                </Layout>
              </ProtectedRoute>
            }
          />


          {/* Unknown URL → Home */}
          <Route
            path="*"
            element={<Navigate to="/" replace />}
          />

        </Routes>

      </AuthProvider>
    </BrowserRouter>
  );
}