/**
 * pages/Expenses.jsx
 * Expense management: list, add, edit, upload receipt/PDF with OCR & editable fields, delete.
 *
 * OCR field mapping (all null-safe, no invented values):
 *   vendor       ← vendor (null → empty string → user sees it's missing)
 *   amount       ← total_amount (primary) → subtotal (fallback) → '' (never defaulted)
 *   receipt_date ← date from OCR (null → '' — never defaults to today)
 */

import { useState, useEffect } from 'react';
import { expenseService } from '../services/api';
import AIInvoiceStudio from '../components/AIInvoiceStudio';
import { fmt } from '../utils/format';
import '../styles/DataPage.css';

const PAYMENT_METHODS = ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'upi', 'other'];

const emptyForm = {
  title: '', amount: '', vendor: '', description: '',
  receipt_date: new Date().toISOString().split('T')[0],
  payment_method: 'upi'
};

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
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
    <line x1="5" y1="15" x2="9" y2="15" />
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

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Manual create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

  // OCR Upload modal state
  const [showUploadModal, setShowUploadModal] = useState(false);

  const fetchExpenses = async () => {
    try {
      const params = search ? { search } : {};
      const res = await expenseService.list(params);
      setExpenses(res.data.expenses);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchExpenses(); }, [search]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setAiResult(null);
    setError('');
    setShowModal(true);
  };

  const openEdit = (exp) => {
    setEditingId(exp.id);
    setForm({
      title: exp.title,
      amount: exp.amount,
      vendor: exp.vendor || '',
      description: exp.description || '',
      receipt_date: exp.receipt_date,
      payment_method: exp.payment_method || 'other',
    });
    setAiResult({ category: exp.ai_category, confidence: exp.ai_confidence });
    setError('');
    setShowModal(true);
  };

  const handleChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const amountNum = parseFloat(form.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Expense amount must be a positive number');
      return;
    }

    setSubmitting(true);
    try {
      const payload = { ...form, amount: amountNum };
      let res;
      if (editingId) {
        res = await expenseService.update(editingId, payload);
        setExpenses(exps => exps.map(ex => ex.id === editingId ? res.data.expense : ex));
      } else {
        res = await expenseService.create(payload);
        setAiResult(res.data.ai_category);
        setExpenses(exps => [res.data.expense, ...exps]);
      }
      if (!editingId) {
        setTimeout(() => { setShowModal(false); setForm(emptyForm); }, 1500);
      } else {
        setShowModal(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try {
      await expenseService.delete(id);
      setExpenses(exps => exps.filter(e => e.id !== id));
    } catch (err) {
      alert('Delete failed');
    }
  };

  // Compute total
  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

  return (
    <div className="data-page fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <h1>Expenses</h1>
          <p>Track spending with AI auto-categorization &amp; OCR receipt upload</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}>
            <span className="icon-svg"><IconSparkles /></span> AI Document Studio
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            + Add Expense
          </button>
        </div>
      </div>

      {/* OCR Receipt Upload / AI Expense Processing Studio Component */}
      {showUploadModal && (
        <AIInvoiceStudio
          mode="expense"
          onSaved={() => fetchExpenses()}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* Summary Strip */}
      {expenses.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '16px 24px', marginBottom: 24, border: '1px solid var(--border)', display: 'flex', gap: 40, boxShadow: 'var(--shadow-sm)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Total Tracked</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)', fontFamily: "'DM Mono', monospace", letterSpacing: -0.5 }}>{fmt(total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Entries</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>{expenses.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Avg. per Entry</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace", letterSpacing: -0.5 }}>
              {fmt(total / expenses.length)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-input-wrap">
          <span className="search-icon"><IconSearch /></span>
          <input className="search-input" placeholder="Search title or vendor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="table-wrapper">
          {loading ? (
            <div className="empty-state">
              <div className="skeleton" style={{ width: '100%', height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '100%', height: 40, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: '100%', height: 40 }} />
            </div>
          ) : expenses.length === 0 ? (
            <div className="empty-state">
              <IconEmpty />
              <h3>No expenses yet</h3>
              <p>Start tracking your spending or upload a receipt PDF/image</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Vendor</th>
                  <th>AI Category</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map(exp => (
                  <tr key={exp.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{exp.title}</div>
                      {exp.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{exp.description.slice(0, 50)}{exp.description.length > 50 ? '…' : ''}</div>}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{exp.vendor || '—'}</td>
                    <td>
                      {exp.ai_category && (
                        <div>
                          <span className="category-pill" style={{ background: `${exp.category_color || '#4F46E5'}18`, color: exp.category_color || '#4F46E5' }}>
                            <span className="icon-svg" style={{ marginRight: 4 }}><IconSparkles /></span>
                            {exp.ai_category}
                          </span>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                            {exp.ai_confidence}% confidence
                          </div>
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--danger)' }}>
                        -{fmt(exp.amount)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 11.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 10px', color: 'var(--text-secondary)', textTransform: 'capitalize', fontWeight: 500 }}>
                        {exp.payment_method?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-muted)' }}>
                      {exp.receipt_date}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="action-btn" onClick={() => openEdit(exp)} title="Edit">
                          <IconEdit />
                        </button>
                        <button className="action-btn delete" onClick={() => handleDelete(exp.id)} title="Delete">
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

      {/* Manual Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">{editingId ? 'Edit Expense' : 'Add Expense'}</div>
                <div className="modal-subtitle">AI will detect category automatically</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}><IconClose /></button>
            </div>

            <form className="modal-body modal-form" onSubmit={handleSubmit}>
              {error && <div className="error-message">{error}</div>}

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input" name="title" value={form.title} onChange={handleChange} placeholder="AWS Monthly Bill" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input className="form-input" type="number" name="amount" value={form.amount} onChange={handleChange} placeholder="2500" min="1" step="0.01" required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Vendor</label>
                  <input className="form-input" name="vendor" value={form.vendor} onChange={handleChange} placeholder="Amazon Web Services" />
                </div>
                <div className="form-group">
                  <label className="form-label">Receipt Date *</label>
                  <input className="form-input" type="date" name="receipt_date" value={form.receipt_date} onChange={handleChange} required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select className="form-select" name="payment_method" value={form.payment_method} onChange={handleChange}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" name="description" value={form.description} onChange={handleChange} placeholder="Cloud hosting, software subscription..." />
              </div>

              {/* Show AI result after creation */}
              {aiResult && !editingId && (
                <div className="ai-badge" style={{ marginTop: 0, marginBottom: 16 }}>
                  <span className="icon-svg"><IconSparkles /></span>
                  AI detected: {aiResult.category} ({aiResult.confidence}% confidence)
                </div>
              )}

              <div className="modal-footer" style={{ padding: 0, border: 'none', background: 'transparent', marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : (
                    editingId ? <><span className="icon-svg"><IconSave /></span> Update</> : <><span className="icon-svg"><IconSparkles /></span> Add & Categorize</>
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