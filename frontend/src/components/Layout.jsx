/**
 * components/Layout.jsx
 * Shell layout wrapping Sidebar + Navbar + main content
 */

import { useState } from 'react';
import Sidebar from './Sidebar';
import Navbar from './Navbar';
import '../styles/Layout.css';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="layout-content">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
