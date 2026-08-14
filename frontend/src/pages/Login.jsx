/**
 * pages/Login.jsx
 * Expenza AI - Login Page
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Auth.css';

export default function Login() {
  const [form, setForm] = useState({
    email: localStorage.getItem('remembered_email') || '',
    password: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(Boolean(localStorage.getItem('remembered_email')));

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {
      await login(form.email, form.password);
      if (rememberMe) {
        localStorage.setItem('remembered_email', form.email);
      } else {
        localStorage.removeItem('remembered_email');
      }
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Login failed. Please check your email and password.'
      );
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="login-page">

      {/* LEFT SIDE */}
      <div className="login-left">

        <div className="login-form-container">

          {/* Logo */}
          <div className="login-logo">
            <h1>Expenza</h1>
            <p>AI Invoice & Expense Manager for Businesses</p>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit}>

            {/* Email */}
            <div className="login-form-group">
              <label>Email</label>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="business.email@expenza.com"
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div className="login-form-group password-group">

              <label>Password</label>

              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>

            </div>

            {/* Remember / Forgot */}
            <div className="login-options">

              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span>Remember Me</span>
              </label>

              <Link
                to="/forgot-password"
                className="forgot-link"
              >
                Forgot Your Password?
              </Link>

            </div>

            {/* Login Button */}
            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Log In'}
            </button>

            {/* Register */}
            <p className="register-text">
              Don't Have An Account?{' '}
              <Link to="/register" className="register-link">
                Register Now.
              </Link>
            </p>

          </form>

        </div>
      </div>


      {/* RIGHT SIDE */}
      <div className="login-right">

        <div className="login-decoration decoration-one"></div>
        <div className="login-decoration decoration-two"></div>

        <div className="login-promo">

          <h2>
            Intelligently track and manage finances
          </h2>

          <p>
            Log in to access your Expenza dashboard and streamline
            your invoice and expense management.
          </p>


          {/* Dashboard Preview */}
          <div className="dashboard-preview">

            <div className="preview-cards">

              <div className="preview-card">
                <span>Total Sales</span>
                <strong>₹1,89,374</strong>
              </div>

              <div className="preview-card">
                <span>Profit</span>
                <strong>₹25,684</strong>
              </div>

            </div>


            {/* Chart */}
            <div className="preview-chart">

              <div
                className="chart-bar chart-bar-1"
              ></div>

              <div
                className="chart-bar chart-bar-2"
              ></div>

              <div
                className="chart-bar chart-bar-3"
              ></div>

              <div
                className="chart-bar chart-bar-4"
              ></div>

              <div
                className="chart-bar chart-bar-5"
              ></div>

            </div>

          </div>

        </div>

      </div>

    </div>
  );
}