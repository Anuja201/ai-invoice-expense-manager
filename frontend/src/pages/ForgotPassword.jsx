/**
 * pages/ForgotPassword.jsx
 * Expenza AI - Forgot Password Page
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/api';
import '../styles/Auth.css';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await authService.forgotPassword(email);
      setMessage(res.data.message || 'Reset instructions have been sent to your email.');
    } catch (err) {
      setError(
        err.response?.data?.error ||
        'Failed to process password reset. Please try again.'
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
            <p>Reset Your Password</p>
          </div>

          {/* Messages */}
          {error && <div className="login-error">{error}</div>}
          {message && (
            <div
              style={{
                backgroundColor: '#d1fae5',
                color: '#065f46',
                padding: '12px 16px',
                borderRadius: '8px',
                fontSize: '14px',
                marginBottom: '16px',
                border: '1px solid #a7f3d0',
              }}
            >
              {message}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div className="login-form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@expenza.com"
                required
                autoFocus
              />
            </div>

            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Sending Instructions...' : 'Reset Password'}
            </button>

            <p className="register-text" style={{ marginTop: '20px' }}>
              Remember your password?{' '}
              <Link to="/login" className="register-link">
                Back to Login
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
          <h2>Secure Account Recovery</h2>
          <p>
            Enter your registered email address and we'll send you instructions to safely reset your password.
          </p>
        </div>
      </div>
    </div>
  );
}
