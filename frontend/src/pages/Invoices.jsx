/**
 * pages/Invoices.jsx
 * Invoice management page with AI Document Processing Studio integration
 * Supports Images, PDFs, and Word Documents (.doc, .docx)
 */

import { useState, useEffect } from 'react';
import { invoiceService } from '../services/api';
import AIInvoiceStudio from '../components/AIInvoiceStudio';
import { fmt } from '../utils/format';
import '../styles/DataPage.css';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

/* ── SVG Icons ─────────────────────────────────────────────── */
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
const IconEdit = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);
const IconTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
const IconSparkles = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);
const IconEmpty = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);
const IconClose = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconSave = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

/**
 * Returns an amber input style when the field's confidence is false (uncertain).
 */
function uncertainStyle(confident) {
  if (confident) return {};
  return {
    borderColor: '#F59E0B',
    boxShadow: '0 0 0 2px rgba(245,158,11,0.15)',
    background: 'rgba(245,158,11,0.04)',
  };
}

/**
 * Amber badge shown next to labels of uncertain OCR fields.
 */
function UncertainBadge() {
  return (
    <span style={{
      display: 'inline-block',
      marginLeft: 6,
      fontSize: 10,
      fontWeight: 700,
      color: '#92400E',
      background: '#FEF3C7',
      border: '1px solid #FDE68A',
      borderRadius: 4,
      padding: '1px 5px',
      verticalAlign: 'middle',
      letterSpacing: 0.2,
    }}>
      ⚠ Uncertain
    </span>
  );
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // AI Studio state
  const [showStudio, setShowStudio] = useState(false);

  // Manual Create/Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
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

  const openCreate = () => {
    setEditingId(null);
    setForm({ client_name: '', client_email: '', amount: '', tax: '', description: '', due_date: '', status: 'draft' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (inv) => {
    setEditingId(inv.id);
    setForm({
      client_name: inv.client_name || '',
      client_email: inv.client_email || '',
      amount: inv.amount || '',
      tax: inv.tax || '',
      description: inv.description || '',
      due_date: inv.due_date || '',
      status: inv.status || 'draft'
    });
    setError('');
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
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
      const payload = {
        ...form,
        amount: amountNum,
        tax: taxNum,
        total_amount: amountNum + taxNum,
      };

      if (editingId) {
        await invoiceService.update(editingId, payload);
      } else {
        await invoiceService.create(payload);
      }

      setShowModal(false);
      setForm({ client_name: '', client_email: '', amount: '', tax: '', description: '', due_date: '', status: 'draft' });
      await fetchInvoices();
    } catch (err) {
      setError(err.response?.data?.error || `Failed to ${editingId ? 'update' : 'create'} invoice`);
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
            <span className="icon-svg"><IconSparkles /></span> AI Document Studio
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + Add Invoice
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
          <span className="search-icon"><IconSearch /></span>
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
              <div className="skeleton" style={{ width: '100%', height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '100%', height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '100%', height: 40 }} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <IconEmpty />
              <h3>No invoices recorded</h3>
              <p>Upload a PDF, Image, or Word Document to test AI extraction</p>
              <button className="btn btn-primary" onClick={() => setShowStudio(true)} style={{ marginTop: 12 }}>
                <span className="icon-svg"><IconSparkles /></span> Launch AI Studio
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
                            <span className="icon-svg" style={{ marginRight: 4 }}><IconSparkles /></span>
                            {inv.ai_category}
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
                        <button className="action-btn" onClick={() => openEdit(inv)} title="Edit">
                          <IconEdit />
                        </button>
                        <button className="action-btn delete" onClick={() => handleDelete(inv.id)} title="Delete">
                          <IconTrash />
                        </button>
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
                <div className="modal-title">{editingId ? 'Edit Invoice' : 'Create Invoice'}</div>
                <div className="modal-subtitle">AI will auto-categorize based on description</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}><IconClose /></button>
            </div>
            <form className="modal-body modal-form" onSubmit={handleSubmit}>
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

              <div className="modal-footer" style={{ padding: 0, border: 'none', background: 'transparent' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : (
                    editingId ? <><span className="icon-svg"><IconSave /></span> Save Changes</> : <><span className="icon-svg"><IconSparkles /></span> Create & Categorize</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
