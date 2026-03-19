/**
 * pages/Expenses.jsx
 * Expense management: list, add, edit, delete with AI categorization
 */

import { useState, useEffect } from 'react';
import { expenseService } from '../services/api';
import '../styles/DataPage.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const PAYMENT_METHODS = ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'upi', 'other'];

const emptyForm = {
  title: '', amount: '', vendor: '', description: '',
  receipt_date: new Date().toISOString().split('T')[0],
  payment_method: 'upi'
};

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

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
    setSubmitting(true);
    try {
      const payload = { ...form, amount: parseFloat(form.amount) };
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
        // Show AI result briefly then close
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
          <p>Track spending with AI auto-categorization</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Expense</button>
      </div>

      {/* Summary Strip */}
      {expenses.length > 0 && (
        <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '14px 20px', marginBottom: 20, border: '1px solid var(--border)', display: 'flex', gap: 32, boxShadow: 'var(--shadow-sm)' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Total Tracked</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)', fontFamily: "'DM Mono', monospace" }}>{fmt(total)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Entries</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{expenses.length}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Avg. per Entry</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-secondary)', fontFamily: "'DM Mono', monospace" }}>
              {fmt(total / expenses.length)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-input-wrap">
          <span className="search-icon">🔍</span>
          <input className="search-input" placeholder="Search title or vendor..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Table */}
      <div className="table-card">
        <div className="table-wrapper">
          {loading ? (
            <div className="empty-state">
              <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--primary)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'48px auto' }} />
            </div>
          ) : expenses.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💳</div>
              <h3>No expenses yet</h3>
              <p>Start tracking your spending</p>
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
                            🤖 {exp.ai_category}
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
                      <span style={{ fontSize: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                        {exp.payment_method?.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: 'var(--text-muted)' }}>
                      {exp.receipt_date}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="action-btn" onClick={() => openEdit(exp)} title="Edit">✏️</button>
                        <button className="action-btn delete" onClick={() => handleDelete(exp.id)} title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">{editingId ? 'Edit Expense' : 'Add Expense'}</div>
                <div className="modal-subtitle">AI will detect category automatically</div>
              </div>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
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
                <div className="ai-badge">
                  <span className="ai-icon">🤖</span>
                  AI detected: <strong>{aiResult.category}</strong> ({aiResult.confidence}% confidence)
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="spinner" /> : editingId ? '💾 Update' : '🤖 Add & Categorize'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
