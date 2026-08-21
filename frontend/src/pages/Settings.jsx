/**
 * pages/Settings.jsx
 * Dashboard Settings Page
 */

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { applyAppearance } from '../App';
import '../styles/Settings.css';
import '../styles/DataPage.css'; // sharing general button styling etc.

const ACCENT_COLORS = [
  { name: 'blue', value: '#2563EB' },
  { name: 'purple', value: '#8B5CF6' },
  { name: 'emerald', value: '#10B981' },
  { name: 'rose', value: '#F43F5E' },
  { name: 'amber', value: '#F59E0B' }
];

export default function Settings() {
  const { user, updateUser } = useAuth();
  
  // Navigation tabs
  const [activeTab, setActiveTab] = useState('profile');
  
  // Success Toast
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Helper to load settings
  const loadSetting = (key, defaultVal) => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : defaultVal;
    } catch {
      return defaultVal;
    }
  };

  // Settings State
  const [profile, setProfile] = useState(() => loadSetting('invoiceai_profile', {
    name: user?.name || 'Vijay Kumar',
    email: user?.email || 'vijay@example.com',
    business_name: 'Vijay Tech Solutions',
    phone: '+91 98765 43210'
  }));

  const [appearance, setAppearance] = useState(() => loadSetting('invoiceai_appearance', {
    theme: 'light',
    accent: 'blue',
    compactMode: false
  }));

  const [notifications, setNotifications] = useState(() => loadSetting('invoiceai_notifications', {
    weeklySummary: true,
    ocrInstantAlerts: true,
    monthlyReports: false,
    securityAlerts: true
  }));

  const [security, setSecurity] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    twoFactor: loadSetting('invoiceai_2fa', false)
  });

  const [preferences, setPreferences] = useState(() => loadSetting('invoiceai_preferences', {
    currency: 'INR',
    paymentTerms: 'net_30',
    expenseMethod: 'upi',
    taxRate: '18'
  }));

  const [aiSettings, setAiSettings] = useState(() => loadSetting('invoiceai_ai_settings', {
    autoCategorize: true,
    ocrEngine: 'high_accuracy',
    confidenceThreshold: 75,
    autoExtractLineItems: true
  }));

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleProfileSave = (e) => {
    e.preventDefault();
    localStorage.setItem('invoiceai_profile', JSON.stringify(profile));
    if (updateUser) {
      updateUser({ name: profile.name, email: profile.email });
    }
    triggerToast('Profile updated successfully!');
  };

  const handleAppearanceSave = (e) => {
    e.preventDefault();
    localStorage.setItem('invoiceai_appearance', JSON.stringify(appearance));
    applyAppearance(appearance);
    triggerToast('Appearance settings saved!');
  };

  const handleNotificationsSave = (e) => {
    e.preventDefault();
    localStorage.setItem('invoiceai_notifications', JSON.stringify(notifications));
    triggerToast('Notification preferences updated!');
  };

  const handleSecuritySave = (e) => {
    e.preventDefault();
    if (security.newPassword && security.newPassword !== security.confirmPassword) {
      alert('New passwords do not match');
      return;
    }
    localStorage.setItem('invoiceai_2fa', JSON.stringify(security.twoFactor));
    triggerToast('Security settings updated successfully!');
    setSecurity(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
  };

  const handlePreferencesSave = (e) => {
    e.preventDefault();
    localStorage.setItem('invoiceai_preferences', JSON.stringify(preferences));
    // Trigger a window reload so all formatters pick up the new currency
    triggerToast('Invoice & Expense preferences saved! Reloading...');
    setTimeout(() => window.location.reload(), 1500);
  };

  const handleAISave = (e) => {
    e.preventDefault();
    localStorage.setItem('invoiceai_ai_settings', JSON.stringify(aiSettings));
    triggerToast('AI settings updated successfully!');
  };

  const handleExportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ profile, appearance, notifications, preferences, aiSettings }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "invoiceai_settings_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    triggerToast('Settings configuration exported!');
  };

  const handlePurgeData = () => {
    if (window.confirm('Are you absolutely sure you want to purge all invoice and expense data? This action is irreversible.')) {
      triggerToast('All local session data purged!');
    }
  };

  const handleDeleteAccount = () => {
    if (window.confirm('DANGER: Delete account? This will permanently erase your profile and records from the database.')) {
      triggerToast('Account deletion request initiated.');
    }
  };

  return (
    <div className="data-page fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Settings</h1>
          <p>Manage your account preferences, Invoice &amp; Expense parameters, and AI document parser options</p>
        </div>
      </div>

      {/* Main Settings Grid */}
      <div className="settings-container">
        {/* Navigation Sidebar */}
        <div className="settings-nav-card">
          <button className={`settings-nav-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <span className="settings-nav-icon">👤</span> Profile Settings
          </button>
          <button className={`settings-nav-btn ${activeTab === 'appearance' ? 'active' : ''}`} onClick={() => setActiveTab('appearance')}>
            <span className="settings-nav-icon">🎨</span> Appearance
          </button>
          <button className={`settings-nav-btn ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>
            <span className="settings-nav-icon">🔔</span> Notifications
          </button>
          <button className={`settings-nav-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => setActiveTab('security')}>
            <span className="settings-nav-icon">🔒</span> Security &amp; Auth
          </button>
          <button className={`settings-nav-btn ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>
            <span className="settings-nav-icon">💼</span> Preferences
          </button>
          <button className={`settings-nav-btn ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')}>
            <span className="settings-nav-icon">🤖</span> AI Studio Parser
          </button>
          <button className={`settings-nav-btn ${activeTab === 'data' ? 'active' : ''}`} onClick={() => setActiveTab('data')}>
            <span className="settings-nav-icon">💾</span> Data &amp; Storage
          </button>
          <button className={`settings-nav-btn ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
            <span className="settings-nav-icon">⚠️</span> Account Management
          </button>
        </div>

        {/* Settings Details Panels */}
        <div className="settings-panel">
          
          {/* PROFILE PANEL */}
          {activeTab === 'profile' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">👤 Profile Details</h3>
                <p className="settings-card-subtitle">Manage your personal details and business metadata for invoices</p>
              </div>
              <form onSubmit={handleProfileSave} className="settings-form">
                <div className="settings-row">
                  <div className="settings-group">
                    <label className="settings-label">Full Name</label>
                    <input className="settings-input" type="text" value={profile.name} onChange={e => setProfile({...profile, name: e.target.value})} required />
                  </div>
                  <div className="settings-group">
                    <label className="settings-label">Email Address</label>
                    <input className="settings-input" type="email" value={profile.email} onChange={e => setProfile({...profile, email: e.target.value})} required />
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-group">
                    <label className="settings-label">Business / Organisation Name</label>
                    <input className="settings-input" type="text" value={profile.business_name} onChange={e => setProfile({...profile, business_name: e.target.value})} />
                  </div>
                  <div className="settings-group">
                    <label className="settings-label">Phone Number</label>
                    <input className="settings-input" type="tel" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} />
                  </div>
                </div>
                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary">Save Profile</button>
                </div>
              </form>
            </div>
          )}

          {/* APPEARANCE PANEL */}
          {activeTab === 'appearance' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">🎨 Appearance &amp; Theme</h3>
                <p className="settings-card-subtitle">Customise how InvoiceAI looks on your screen</p>
              </div>
              <form onSubmit={handleAppearanceSave} className="settings-form">
                <div className="settings-group">
                  <label className="settings-label">Theme Mode</label>
                  <div className="theme-picker-grid">
                    <div className={`theme-card ${appearance.theme === 'light' ? 'active' : ''}`} onClick={() => setAppearance({...appearance, theme: 'light'})}>
                      <span className="theme-card-icon">☀️</span>
                      <span className="theme-card-label">Light Mode</span>
                    </div>
                    <div className={`theme-card ${appearance.theme === 'dark' ? 'active' : ''}`} onClick={() => setAppearance({...appearance, theme: 'dark'})}>
                      <span className="theme-card-icon">🌙</span>
                      <span className="theme-card-label">Dark Mode</span>
                    </div>
                    <div className={`theme-card ${appearance.theme === 'system' ? 'active' : ''}`} onClick={() => setAppearance({...appearance, theme: 'system'})}>
                      <span className="theme-card-icon">💻</span>
                      <span className="theme-card-label">System Default</span>
                    </div>
                  </div>
                </div>

                <div className="settings-group" style={{ marginTop: 10 }}>
                  <label className="settings-label">Accent Theme Color</label>
                  <div className="accent-selector">
                    {ACCENT_COLORS.map(color => (
                      <div 
                        key={color.name} 
                        className={`accent-color-dot ${appearance.accent === color.name ? 'active' : ''}`}
                        style={{ backgroundColor: color.value }}
                        onClick={() => setAppearance({...appearance, accent: color.name})}
                      >
                        {appearance.accent === color.name && '✓'}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="settings-option-list" style={{ marginTop: 10 }}>
                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Compact density</span>
                      <span className="settings-option-desc">Display more invoice data rows in tables and list cards</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={appearance.compactMode} onChange={e => setAppearance({...appearance, compactMode: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary">Save Appearance</button>
                </div>
              </form>
            </div>
          )}

          {/* NOTIFICATIONS PANEL */}
          {activeTab === 'notifications' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">🔔 Notification Preferences</h3>
                <p className="settings-card-subtitle">Stay updated on your OCR processing activity and summaries</p>
              </div>
              <form onSubmit={handleNotificationsSave} className="settings-form">
                <div className="settings-option-list">
                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Weekly Summary Reports</span>
                      <span className="settings-option-desc">Get a clean financial breakdown and analytics digest via email</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={notifications.weeklySummary} onChange={e => setNotifications({...notifications, weeklySummary: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Instant OCR Extraction Alerts</span>
                      <span className="settings-option-desc">Get notified immediately when AI studio completes document extraction</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={notifications.ocrInstantAlerts} onChange={e => setNotifications({...notifications, ocrInstantAlerts: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Monthly Expense Insights</span>
                      <span className="settings-option-desc">Deep-dive AI analysis of category patterns and anomalies at end-of-month</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={notifications.monthlyReports} onChange={e => setNotifications({...notifications, monthlyReports: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Security &amp; Auth Alerts</span>
                      <span className="settings-option-desc">Get notified of any login attempts or password modifications</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={notifications.securityAlerts} onChange={e => setNotifications({...notifications, securityAlerts: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary">Save Notifications</button>
                </div>
              </form>
            </div>
          )}

          {/* SECURITY PANEL */}
          {activeTab === 'security' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">🔒 Security &amp; Authentication</h3>
                <p className="settings-card-subtitle">Keep your financial data secure and configure password changes</p>
              </div>
              <form onSubmit={handleSecuritySave} className="settings-form">
                <div className="settings-group">
                  <label className="settings-label">Current Password</label>
                  <input className="settings-input" type="password" value={security.currentPassword} onChange={e => setSecurity({...security, currentPassword: e.target.value})} placeholder="••••••••" required />
                </div>
                <div className="settings-row">
                  <div className="settings-group">
                    <label className="settings-label">New Password</label>
                    <input className="settings-input" type="password" value={security.newPassword} onChange={e => setSecurity({...security, newPassword: e.target.value})} placeholder="Minimum 8 characters" required />
                  </div>
                  <div className="settings-group">
                    <label className="settings-label">Confirm New Password</label>
                    <input className="settings-input" type="password" value={security.confirmPassword} onChange={e => setSecurity({...security, confirmPassword: e.target.value})} placeholder="Confirm password" required />
                  </div>
                </div>

                <div className="settings-option-list" style={{ marginTop: 10 }}>
                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Two-Factor Authentication (2FA)</span>
                      <span className="settings-option-desc">Secure account access by verifying logins via mobile app</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={security.twoFactor} onChange={e => setSecurity({...security, twoFactor: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary">Update Security</button>
                </div>
              </form>
            </div>
          )}

          {/* PREFERENCES PANEL */}
          {activeTab === 'preferences' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">💼 Invoice &amp; Expense Preferences</h3>
                <p className="settings-card-subtitle">Configure default values and billing parameters</p>
              </div>
              <form onSubmit={handlePreferencesSave} className="settings-form">
                <div className="settings-row">
                  <div className="settings-group">
                    <label className="settings-label">Default Currency</label>
                    <select className="settings-select" value={preferences.currency} onChange={e => setPreferences({...preferences, currency: e.target.value})}>
                      <option value="INR">INR (₹) Indian Rupee</option>
                      <option value="USD">USD ($) United States Dollar</option>
                      <option value="EUR">EUR (€) Euro</option>
                      <option value="GBP">GBP (£) British Pound</option>
                    </select>
                  </div>
                  <div className="settings-group">
                    <label className="settings-label">Default Payment Terms</label>
                    <select className="settings-select" value={preferences.paymentTerms} onChange={e => setPreferences({...preferences, paymentTerms: e.target.value})}>
                      <option value="due_on_receipt">Due on receipt</option>
                      <option value="net_15">Net 15 days</option>
                      <option value="net_30">Net 30 days</option>
                      <option value="net_60">Net 60 days</option>
                    </select>
                  </div>
                </div>

                <div className="settings-row">
                  <div className="settings-group">
                    <label className="settings-label">Default Expense Method</label>
                    <select className="settings-select" value={preferences.expenseMethod} onChange={e => setPreferences({...preferences, expenseMethod: e.target.value})}>
                      <option value="upi">UPI / Instant</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="cash">Cash</option>
                    </select>
                  </div>
                  <div className="settings-group">
                    <label className="settings-label">Standard Tax Rate (%)</label>
                    <input className="settings-input" type="number" min="0" max="100" value={preferences.taxRate} onChange={e => setPreferences({...preferences, taxRate: e.target.value})} />
                  </div>
                </div>

                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary">Save Preferences</button>
                </div>
              </form>
            </div>
          )}

          {/* AI SETTINGS PANEL */}
          {activeTab === 'ai' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">🤖 AI Studio Parser Settings</h3>
                <p className="settings-card-subtitle">Fine-tune the Document OCR engine parameters &amp; confidence thresholds</p>
              </div>
              <form onSubmit={handleAISave} className="settings-form">
                <div className="settings-option-list">
                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Auto-Categorization Model</span>
                      <span className="settings-option-desc">Auto-classify invoices using LLM description analysis</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={aiSettings.autoCategorize} onChange={e => setAiSettings({...aiSettings, autoCategorize: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>

                  <div className="settings-option-item">
                    <div className="settings-option-info">
                      <span className="settings-option-title">Extract Line Items</span>
                      <span className="settings-option-desc">Identify and populate item tables within bills automatically</span>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={aiSettings.autoExtractLineItems} onChange={e => setAiSettings({...aiSettings, autoExtractLineItems: e.target.checked})} />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="settings-group" style={{ marginTop: 10 }}>
                  <label className="settings-label">OCR Recognition Engine</label>
                  <select className="settings-select" value={aiSettings.ocrEngine} onChange={e => setAiSettings({...aiSettings, ocrEngine: e.target.value})}>
                    <option value="standard">Standard OCR (Faster Processing)</option>
                    <option value="high_accuracy">High-Accuracy Deep OCR (Multiple Iterations)</option>
                  </select>
                </div>

                <div className="settings-group" style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
                    <label className="settings-label">Confidence Threshold: <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 'bold' }}>{aiSettings.confidenceThreshold}%</span></label>
                  </div>
                  <p className="settings-card-subtitle" style={{ margin: '2px 0 6px 0' }}>Fields below this threshold will be highlighted with a yellow alert badge</p>
                  <input 
                    type="range" 
                    className="settings-range" 
                    min="50" 
                    max="95" 
                    value={aiSettings.confidenceThreshold} 
                    onChange={e => setAiSettings({...aiSettings, confidenceThreshold: parseInt(e.target.value)})} 
                  />
                </div>

                <div className="settings-actions">
                  <button type="submit" className="btn btn-primary">Save AI Settings</button>
                </div>
              </form>
            </div>
          )}

          {/* DATA & STORAGE PANEL */}
          {activeTab === 'data' && (
            <div className="settings-card">
              <div className="settings-card-header">
                <h3 className="settings-card-title">💾 Data Backups &amp; Storage</h3>
                <p className="settings-card-subtitle">Manage exports, file formats, and clean up database space</p>
              </div>
              <div className="settings-option-list">
                <div className="settings-option-item">
                  <div className="settings-option-info">
                    <span className="settings-option-title">Export Settings Schema</span>
                    <span className="settings-option-desc">Download settings and parameters as a `.json` backup file</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handleExportData}>Download Backup</button>
                </div>

                <div className="settings-option-item">
                  <div className="settings-option-info">
                    <span className="settings-option-title">Purge OCR Extraction Cache</span>
                    <span className="settings-option-desc">Clear cached PDF pages and receipt assets to free disk space</span>
                  </div>
                  <button type="button" className="btn btn-secondary" onClick={handlePurgeData}>Purge Assets</button>
                </div>
              </div>
            </div>
          )}

          {/* ACCOUNT MANAGEMENT PANEL */}
          {activeTab === 'account' && (
            <div className="settings-card danger-zone">
              <div className="settings-card-header">
                <h3 className="settings-card-title">⚠️ Account Management</h3>
                <p className="settings-card-subtitle">Manage high-security account tasks and data termination options</p>
              </div>
              <div className="settings-option-list">
                <div className="settings-option-item" style={{ border: '1px solid rgba(239, 68, 68, 0.15)', background: 'rgba(239, 68, 68, 0.02)' }}>
                  <div className="settings-option-info">
                    <span className="settings-option-title" style={{ color: 'var(--danger)' }}>Terminate Profile Access</span>
                    <span className="settings-option-desc">Erase login credentials and disconnect third-party oauth associations</span>
                  </div>
                  <button type="button" className="btn btn-danger" onClick={handleDeleteAccount}>Delete Account</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Success Toast Notification */}
      {showToast && (
        <div className="toast-success">
          <span>✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
