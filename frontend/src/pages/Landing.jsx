/**
 * pages/Landing.jsx
 * Marketing landing page for InvoiceAI - animated, professional
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Landing.css';

const FEATURES = [
  {
    icon: '🤖',
    title: 'AI Auto-Categorization',
    desc: 'Machine learning instantly categorizes every invoice and expense with 90%+ accuracy. No manual work required.',
    color: '#6366f1',
  },
  {
    icon: '📷',
    title: 'OCR Invoice Parsing',
    desc: 'Upload any invoice image or PDF. Our OCR engine extracts vendor, amounts, dates and line items automatically.',
    color: '#0ea5e9',
  },
  {
    icon: '📈',
    title: 'Expense Forecasting',
    desc: 'Time-series ML predicts next month\'s expenses with confidence intervals so you can budget proactively.',
    color: '#10b981',
  },
  {
    icon: '🚨',
    title: 'Anomaly Detection',
    desc: 'Statistical z-score analysis flags unusual or duplicate expenses before they slip through your books.',
    color: '#f59e0b',
  },
  {
    icon: '📊',
    title: 'Live Analytics Dashboard',
    desc: 'Real-time charts show revenue vs expenses, category breakdowns, and month-over-month trends.',
    color: '#8b5cf6',
  },
  {
    icon: '💡',
    title: 'AI Business Insights',
    desc: 'Get personalized recommendations: overdue invoices, cash flow alerts, budget suggestions, and profit analysis.',
    color: '#ec4899',
  },
];

const STEPS = [
  { num: '01', title: 'Upload Invoice', desc: 'Drag & drop any PDF or image invoice' },
  { num: '02', title: 'AI Extracts Data', desc: 'OCR + ML pulls all fields automatically' },
  { num: '03', title: 'Auto-Categorized', desc: 'Expense category assigned with confidence score' },
  { num: '04', title: 'Insights Generated', desc: 'Anomalies detected, forecasts updated instantly' },
];

const STATS = [
  { value: '98%', label: 'OCR Accuracy' },
  { value: '10x', label: 'Faster Processing' },
  { value: '90%', label: 'ML Categorization' },
  { value: '0', label: 'Manual Entry' },
];

function useCountUp(target, duration = 1500, trigger = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    const isPercent = String(target).includes('%');
    const isX = String(target).includes('x');
    const num = parseFloat(target);
    if (isNaN(num)) { setCount(target); return; }
    const step = num / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= num) {
        clearInterval(timer);
        setCount(isPercent ? `${num}%` : isX ? `${num}x` : num);
      } else {
        setCount(isPercent ? `${Math.floor(current)}%` : isX ? `${current.toFixed(1)}x` : Math.floor(current));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, trigger]);
  return count;
}

function StatCard({ value, label, triggered }) {
  const displayed = useCountUp(value, 1200, triggered);
  return (
    <div className="lp-stat">
      <div className="lp-stat-value">{triggered ? displayed : '0'}</div>
      <div className="lp-stat-label">{label}</div>
    </div>
  );
}

export default function Landing() {
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setStatsVisible(true); },
      { threshold: 0.3 }
    );
    if (statsRef.current) observer.observe(statsRef.current);
    return () => observer.disconnect();
  }, []);

  // Particle animation
  useEffect(() => {
    const canvas = document.getElementById('lp-particles');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const particles = Array.from({ length: 60 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.4,
      dy: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.4 + 0.1,
    }));

    let raf;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach(p => {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.dy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99,102,241,${p.alpha})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="lp-root">
      <canvas id="lp-particles" className="lp-particles" />

      {/* Navbar */}
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <div className="lp-nav-logo">IM</div>
          <span className="lp-nav-name">InvoiceAI</span>
        </div>
        <div className="lp-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it Works</a>
          <a href="#stats">Results</a>
          <Link to="/login" className="lp-nav-login">Sign In</Link>
          <Link to="/register" className="lp-nav-cta">Get Started Free →</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-hero-badge">✨ AI-Powered Financial Management</div>
        <h1 className="lp-hero-title">
          Turn Invoice Chaos<br />
          Into <span className="lp-gradient-text">Business Clarity</span>
        </h1>
        <p className="lp-hero-sub">
          Upload any invoice, auto-extract data with OCR, get AI categorization,
          detect anomalies, and predict future spending — all in one intelligent dashboard.
        </p>
        <div className="lp-hero-actions">
          <Link to="/register" className="lp-btn-primary">
            Start for Free <span>→</span>
          </Link>
          <Link to="/login" className="lp-btn-ghost">
            Sign In
          </Link>
        </div>

        {/* Mock dashboard preview */}
        <div className="lp-hero-preview">
          <div className="lp-preview-bar">
            <span className="lp-dot red" />
            <span className="lp-dot yellow" />
            <span className="lp-dot green" />
            <span className="lp-preview-label">InvoiceAI Dashboard</span>
          </div>
          <div className="lp-preview-content">
            <div className="lp-preview-cards">
              {[
                { label: 'Total Revenue', value: '₹4,82,000', badge: '+12%', color: '#10b981' },
                { label: 'Expenses', value: '₹1,24,500', badge: '-8%', color: '#6366f1' },
                { label: 'AI Insights', value: '6 Alerts', badge: 'Active', color: '#f59e0b' },
                { label: 'Invoices', value: '48 Sent', badge: '92% Paid', color: '#8b5cf6' },
              ].map((c, i) => (
                <div key={i} className="lp-preview-card" style={{ animationDelay: `${i * 0.1}s` }}>
                  <div className="lp-preview-card-label">{c.label}</div>
                  <div className="lp-preview-card-value">{c.value}</div>
                  <div className="lp-preview-card-badge" style={{ color: c.color }}>{c.badge}</div>
                </div>
              ))}
            </div>
            <div className="lp-preview-chart">
              {[40, 65, 45, 80, 60, 95, 70, 85, 55, 90, 75, 100].map((h, i) => (
                <div key={i} className="lp-preview-bar-item">
                  <div
                    className="lp-preview-bar-fill"
                    style={{ height: `${h}%`, animationDelay: `${i * 0.05}s` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="lp-stats-section" id="stats" ref={statsRef}>
        <div className="lp-stats-grid">
          {STATS.map((s, i) => (
            <StatCard key={i} value={s.value} label={s.label} triggered={statsVisible} />
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="lp-section" id="features">
        <div className="lp-section-header">
          <div className="lp-section-badge">Capabilities</div>
          <h2 className="lp-section-title">Everything Powered by AI</h2>
          <p className="lp-section-sub">
            From OCR extraction to ML forecasting — every feature is built to eliminate manual work.
          </p>
        </div>
        <div className="lp-features-grid">
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-feature-card" style={{ animationDelay: `${i * 0.1}s` }}>
              <div className="lp-feature-icon" style={{ background: `${f.color}18`, color: f.color }}>
                {f.icon}
              </div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="lp-section lp-section-dark" id="how-it-works">
        <div className="lp-section-header">
          <div className="lp-section-badge light">Process</div>
          <h2 className="lp-section-title light">From Upload to Insight in 4 Steps</h2>
        </div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div key={i} className="lp-step">
              <div className="lp-step-num">{s.num}</div>
              <div className="lp-step-connector" style={{ opacity: i < STEPS.length - 1 ? 1 : 0 }} />
              <h3 className="lp-step-title">{s.title}</h3>
              <p className="lp-step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="lp-cta-section">
        <div className="lp-cta-glow" />
        <h2 className="lp-cta-title">Ready to Automate Your Finances?</h2>
        <p className="lp-cta-sub">
          Join businesses already saving hours every week with AI invoice management.
        </p>
        <Link to="/register" className="lp-btn-primary large">
          Create Free Account →
        </Link>
        <p className="lp-cta-note">No credit card required. Setup in 60 seconds.</p>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <div className="lp-nav-brand">
          <div className="lp-nav-logo">IM</div>
          <span className="lp-nav-name">InvoiceAI</span>
        </div>
        <p className="lp-footer-copy">© 2025 InvoiceAI. Built with Flask + React + AI.</p>
      </footer>
    </div>
  );
}
