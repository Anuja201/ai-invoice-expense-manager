/**
 * pages/Register.jsx
 * New user registration form
 */

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Auth.css';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      {/* Left panel */}
      <div className="auth-left">
        <div className="auth-left-content">
          <div className="auth-brand">
            <div className="auth-brand-icon">IM</div>
            <span className="auth-brand-name">InvoiceAI</span>
          </div>

          <h1 className="auth-headline">
            Join Thousands of<br />
            <span>Finance Teams</span>
          </h1>

          <p className="auth-sub">
            Get started for free. No credit card required. Set up in under 2 minutes.
          </p>

          <div className="auth-features">
            {[
              { icon: '✅', text: 'Free to get started, no credit card needed' },
              { icon: '🚀', text: 'Set up in minutes, not hours' },
              { icon: '🤖', text: 'AI processes your first invoice instantly' },
              { icon: '📈', text: 'Comprehensive expense analytics dashboard' },
            ].map((f, i) => (
              <div key={i} className="auth-feature">
                <div className="auth-feature-icon">{f.icon}</div>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="auth-right">
        <div className="auth-form-container">
          <h2 className="auth-form-title">Create account</h2>
          <p className="auth-form-sub">Start managing your finances smarter</p>

          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  className="form-input"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">Company (optional)</label>
                <input
                  className="form-input"
                  type="text"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  placeholder="Acme Corp"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                className="form-input"
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@company.com"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Min. 6 characters"
                required
              />
            </div>

            <button className="btn-primary" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Account →'}
            </button>
          </form>

          <div className="auth-switch">
            Already have an account?{' '}
            <Link to="/login">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
