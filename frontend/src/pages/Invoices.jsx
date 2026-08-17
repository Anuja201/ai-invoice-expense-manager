/**
 * pages/Invoices.jsx
 * Invoice management page with AI Document Processing Studio integration
 * Supports Images, PDFs, and Word Documents (.doc, .docx)
 */

import { useState, useEffect } from 'react';
import { invoiceService } from '../services/api';
import AIInvoiceStudio from '../components/AIInvoiceStudio';
import '../styles/DataPage.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // AI Studio state
  const [showStudio, setShowStudio] = useState(false);

  // Manual Create Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    client_name: '', client_email: '', amount: '',
    tax: '', description: '', due_date: '', status: 'draft'
  });

  const fetchInvoices = async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await invoiceService.list(params);
      setInvoices(res.data.invoices);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInvoices(); }, [search, statusFilter]);

  const handleFormChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setError('');

    const amountNum = parseFloat(form.amount);
    const taxNum = parseFloat(form.tax || 0);

    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Amount must be a positive number');
      return;
    }
    if (isNaN(taxNum) || taxNum < 0) {
      setError('Tax must be a non-negative number');
      return;
    }

    setSubmitting(true);
    try {
      await invoiceService.create({
        ...form,
        amount: amountNum,
        tax: taxNum,
        total_amount: amountNum + taxNum,
      });
      setShowModal(false);
      setForm({ client_name: '', client_email: '', amount: '', tax: '', description: '', due_date: '', status: 'draft' });
      await fetchInvoices();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this invoice?')) return;
    try {
      await invoiceService.delete(id);
      setInvoices(inv => inv.filter(i => i.id !== id));
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await invoiceService.update(id, { status });
      setInvoices(inv => inv.map(i => i.id === id ? { ...i, status } : i));
    } catch (err) {
      alert('Status update failed');
    }
  };

  return (
    <div className="data-page fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Invoices</h1>
          <p>AI document upload, multi-format OCR extraction, validation & financial insights</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowStudio(true)}>
            🤖 AI Document Studio (PDF, Images, DOCX)
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + New Invoice
          </button>
        </div>
      </div>

      {/* AI Invoice Processing Studio Component */}
      {showStudio && (
        <AIInvoiceStudio
          onInvoiceSaved={() => {
            fetchInvoices();
          }}
          onClose={() => setShowStudio(false)}
        />
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            placeholder="Search client or invoice number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      {/* Invoices Table */}
      <div className="table-card">
        <div className="table-wrapper">
          {loading ? (
            <div className="empty-state">
              <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--primary)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'48px auto' }} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px', textAlign: 'center' }}>
              <div className="empty-state-icon" style={{ fontSize: 42, marginBottom: 12 }}>🧾</div>
              <h3>No invoices recorded</h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Upload a PDF, Image, or Word Document to test AI extraction</p>
              <button className="btn btn-primary" onClick={() => setShowStudio(true)}>
                🤖 Launch AI Document Studio
              </button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client / Vendor</th>
                  <th>AI Category</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-muted)' }}>
                      {inv.invoice_number}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{inv.client_name}</div>
                      {inv.client_email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{inv.client_email}</div>}
                    </td>
                    <td>
                      {inv.ai_category && (
                        <div>
                          <span className="category-pill" style={{ background: `${inv.category_color || '#4F46E5'}18`, color: inv.category_color || '#4F46E5' }}>
                            🤖 {inv.ai_category}
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                            {inv.ai_confidence}% confidence
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--success)' }}>
                        {fmt(inv.total_amount)}
                      </div>
                      {inv.tax > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>incl. {fmt(inv.tax)} tax</div>}
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-muted)' }}>
                      {inv.due_date || '—'}
                    </td>
                    <td>
                      <select
                        className="filter-select"
                        style={{ height: 30, fontSize: 12, padding: '0 8px' }}
                        value={inv.status}
                        onChange={e => handleStatusUpdate(inv.id, e.target.value)}
                      >
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="action-btn delete" onClick={() => handleDelete(inv.id)} title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Manual Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">Create Invoice</div>
                <div className="modal-subtitle">AI will auto-categorize based on description</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form className="modal-body modal-form" onSubmit={handleCreate}>
              {error && <div className="error-message">{error}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Client / Vendor Name *</label>
                  <input className="form-input" name="client_name" value={form.client_name} onChange={handleFormChange} placeholder="Acme Corporation" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Client Email</label>
                  <input className="form-input" type="email" name="client_email" value={form.client_email} onChange={handleFormChange} placeholder="client@acme.com" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input className="form-input" type="number" name="amount" value={form.amount} onChange={handleFormChange} placeholder="5000" min="1" step="0.01" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax (₹)</label>
                  <input className="form-input" type="number" name="tax" value={form.tax} onChange={handleFormChange} placeholder="900" min="0" step="0.01" />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input className="form-input" type="date" name="due_date" value={form.due_date} onChange={handleFormChange} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" name="status" value={form.status} onChange={handleFormChange}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description (used for AI categorization)</label>
                <textarea className="form-textarea" name="description" value={form.description} onChange={handleFormChange} placeholder="Software development services, consulting..." />
              </div>

              <div className="modal-footer" style={{ padding: 0 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : '🤖 Create & Categorize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
