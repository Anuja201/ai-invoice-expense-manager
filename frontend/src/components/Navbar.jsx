/**
 * components/Navbar.jsx
 * Top navigation bar with page title and user controls
 */

import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Navbar.css';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/invoices': 'Invoices',
  '/expenses': 'Expenses',
};

export default function Navbar({ onMenuClick }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] || 'InvoiceAI';

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button className="hamburger" onClick={onMenuClick} aria-label="Toggle menu">
          ☰
        </button>
        <div>
          <div className="page-title">{title}</div>
        </div>
      </div>

      <div className="navbar-right">
        <span className="navbar-date">{today}</span>

        <button className="notification-btn" title="Notifications">
          🔔
          <span className="notif-dot" />
        </button>

        <div className="navbar-avatar" title={user?.name}>
          {user?.initials || user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </nav>
  );
}
