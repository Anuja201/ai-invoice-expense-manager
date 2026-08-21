
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Auth.css';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    company: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { register } = useAuth();
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

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      await register(form);
      navigate('/dashboard');
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">

      {/* =====================================================
          LEFT SIDE - REGISTER FORM
          ===================================================== */}

      <div className="login-left">

        <div className="login-form-container">

          <div className="login-logo">
            <h1>Expenza</h1>
            <p>AI-Powered Finance Manager for Modern Teams</p>
          </div>


          {/* Error Message */}
          {error && (
            <div className="login-error">
              {error}
            </div>
          )}


          {/* Register Form */}
          <form onSubmit={handleSubmit}>

            {/* Name + Company */}
            <div className="register-two-column">

              {/* Full Name */}
              <div className="login-form-group">

                <label>Full Name</label>

                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  autoFocus
                />

              </div>


              {/* Company */}
              <div className="login-form-group">

                <label>Company</label>

                <input
                  type="text"
                  name="company"
                  value={form.company}
                  onChange={handleChange}
                  placeholder="Acme Corp"
                />

              </div>

            </div>


            {/* Email */}
            <div className="login-form-group">

              <label>Email Address</label>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@company.com"
                required
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
                placeholder="Min. 6 characters"
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


            {/* Password Information */}
            <div className="password-hint">
              Password must contain at least 6 characters.
            </div>


            {/* Create Account */}
            <button
              type="submit"
              className="login-button"
              disabled={loading}
            >
              {loading ? 'Creating Account...' : 'Create Account →'}
            </button>


            {/* Login Link */}
            <p className="register-text">

              Already have an account?{' '}

              <Link to="/login" className="signin-link">
                Sign in
              </Link>

            </p>

          </form>

        </div>

      </div>


      {/* =====================================================
          RIGHT SIDE - PROMOTIONAL PANEL
          ===================================================== */}

      <div className="login-right">
        <div className="login-decoration decoration-one"></div>
        <div className="login-decoration decoration-two"></div>
        
        <div className="login-promo">
          <h2>Start managing your finances smarter</h2>
          <p>Join Expenza and simplify invoice management, expense tracking, and financial insights with AI.</p>
          
          <div className="dashboard-preview">
            <div className="preview-cards">
              <div className="preview-card">
                <span>Monthly Expenses</span>
                <strong>₹42,850</strong>
              </div>
              <div className="preview-card">
                <span>Budget Used</span>
                <strong>68%</strong>
              </div>
            </div>
            
            <div className="preview-chart">
              <div className="chart-bar chart-bar-1"></div>
              <div className="chart-bar chart-bar-2"></div>
              <div className="chart-bar chart-bar-3"></div>
              <div className="chart-bar chart-bar-4"></div>
              <div className="chart-bar chart-bar-5"></div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}