/**
 * components/ProtectedRoute.jsx
 * Redirects to /login if user is not authenticated
 */

import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh' }}>
        <div className="spinner" style={{ borderTopColor: 'var(--primary)', border: '3px solid var(--border)', width:32, height:32 }} />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
}
