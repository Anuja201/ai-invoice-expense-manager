import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Navbar.css';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/invoices':  'Invoices',
  '/expenses':  'Expenses',
  '/insights':  'AI Insights',
};

const PAGE_SUBTITLES = {
  '/dashboard': 'Overview of your financial activity',
  '/invoices':  'Manage & process your invoices',
  '/expenses':  'Track and categorize your spending',
  '/insights':  'AI-powered financial intelligence',
  '/settings':  'Manage your account preferences',
};

const DUMMY_NOTIFICATIONS = [
  { id: 1, title: 'OCR Extraction Ready',    time: '10m ago', text: 'Invoice processing pipeline is active and ready.', read: false },
  { id: 2, title: 'System Security Updated', time: '1h ago',  text: 'Tenant isolation and environment variables verified.', read: false },
];

/* ── Inline SVG Icons ──────────────────────────────────────── */
const IconMenu = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6"  x2="21" y2="6"  />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const IconBell = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

export default function Navbar({ onMenuClick }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const title    = PAGE_TITLES[pathname]    || 'AI Invoice Manager';
  const subtitle = PAGE_SUBTITLES[pathname] || '';

  const [showNotifs, setShowNotifs]     = useState(false);
  const [notifications, setNotifications] = useState(DUMMY_NOTIFICATIONS);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
  });

  const toggleNotifs = () => setShowNotifs(!showNotifs);

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="navbar">
      <div className="navbar-left">
        <button className="hamburger" onClick={onMenuClick} aria-label="Toggle menu">
          <IconMenu />
        </button>
        <div>
          <div className="page-title">{title}</div>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
      </div>

      <div className="navbar-right">
        <span className="navbar-date">{today}</span>

        <div className="notif-wrapper" ref={notifRef}>
          <button
            className="notification-btn"
            title="Notifications"
            onClick={toggleNotifs}
          >
            <IconBell />
            {unreadCount > 0 && <span className="notif-dot" />}
          </button>

          {showNotifs && (
            <div className="notif-dropdown">
              <div className="notif-header">
                <span>Notifications ({unreadCount} unread)</span>
                {unreadCount > 0 && (
                  <button className="mark-read-btn" onClick={markAllAsRead}>
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notif-list">
                {notifications.length === 0 ? (
                  <div className="notif-empty">No notifications</div>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className={`notif-item ${n.read ? 'read' : 'unread'}`}>
                      <div className="notif-item-title">
                        <span>{n.title}</span>
                        <span className="notif-time">{n.time}</span>
                      </div>
                      <p className="notif-text">{n.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="navbar-avatar" title={user?.name}>
          {user?.initials || user?.name?.[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </nav>
  );
}
