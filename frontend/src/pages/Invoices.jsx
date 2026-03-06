/**
 * pages/Invoices.jsx
 * Invoice management: list, create, upload (simulate), delete, status update
 */

import { useState, useEffect, useRef } from 'react';
import { invoiceService, ocrService } from '../services/api';
import '../styles/DataPage.css';

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [editInvoice, setEditInvoice] = useState(null); // for status update
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
    setSubmitting(true);
    try {
      await invoiceService.create({
        ...form,
        amount: parseFloat(form.amount),
        tax: parseFloat(form.tax || 0),
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

  const handleUploadSimulate = async () => {
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const res = await invoiceService.upload(new File([], 'sample.pdf'));
      setUploadResult(res.data.extracted_data);
    } catch (err) {
      setUploadResult({ error: 'Upload simulation failed' });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleRealUpload = async (file) => {
    if (!file) return;
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const res = await ocrService.extract(file);
      const data = res.data.extracted_data;
      // Normalize OCR result to match invoice fields
      setUploadResult({
        client_name: data.vendor || 'Unknown Vendor',
        amount: data.subtotal || data.total || 0,
        tax: data.tax || 0,
        total_amount: data.total || data.subtotal || 0,
        description: `Imported from ${file.name}`,
        ai_category: data.ai_category || 'Office Supplies',
        ai_confidence: data.ai_confidence || 75,
        extraction_method: data.extraction_method || 'simulation',
        raw: data,
      });
    } catch (err) {
      setUploadResult({ error: 'OCR extraction failed. Please try again.' });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleSaveUploaded = async () => {
    if (!uploadResult) return;
    setSubmitting(true);
    try {
      await invoiceService.create({
        client_name: uploadResult.client_name,
        amount: uploadResult.amount,
        tax: uploadResult.tax,
        description: uploadResult.description,
        status: 'draft',
      });
      setShowUploadModal(false);
      setUploadResult(null);
      await fetchInvoices();
    } catch (err) {
      alert('Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="data-page fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1>Invoices</h1>
          <p>Manage client invoices with AI categorization</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}>
            📄 Upload PDF
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + New Invoice
          </button>
        </div>
      </div>

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

      {/* Table */}
      <div className="table-card">
        <div className="table-wrapper">
          {loading ? (
            <div className="empty-state">
              <div style={{ width:28, height:28, border:'3px solid var(--border)', borderTopColor:'var(--primary)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'48px auto' }} />
            </div>
          ) : invoices.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">🧾</div>
              <h3>No invoices found</h3>
              <p>Create your first invoice or change filters</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Client</th>
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

      {/* Create Modal */}
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
                  <label className="form-label">Client Name *</label>
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

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUploadModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <div>
                <div className="modal-title">Upload Invoice PDF</div>
                <div className="modal-subtitle">AI will extract and categorize invoice data</div>
              </div>
              <button className="modal-close" onClick={() => { setShowUploadModal(false); setUploadResult(null); }}>✕</button>
            </div>
            <div className="modal-body">
              <div
                className="upload-zone"
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('dragover'); }}
                onDragLeave={e => e.currentTarget.classList.remove('dragover')}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('dragover');
                  const file = e.dataTransfer.files[0];
                  if (file) handleRealUpload(file);
                }}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.pdf,.png,.jpg,.jpeg,.tiff,.bmp';
                  input.onchange = e => handleRealUpload(e.target.files[0]);
                  input.click();
                }}
              >
                <div className="upload-zone-icon">📄</div>
                <div className="upload-zone-title">Drop PDF or Image Here</div>
                <div className="upload-zone-sub">Supports PDF, PNG, JPG, TIFF — AI will extract all details via OCR</div>
              </div>

              {uploadLoading && (
                <div style={{ textAlign:'center', padding: 20 }}>
                  <div style={{ width:24, height:24, border:'3px solid var(--border)', borderTopColor:'var(--primary)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 8px' }} />
                  <p style={{ fontSize:13, color:'var(--text-muted)' }}>AI parsing invoice...</p>
                </div>
              )}

              {uploadResult && !uploadResult.error && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ background: 'var(--success-light)', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                      ✅ Invoice Extracted — {uploadResult.extraction_method || 'AI'}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <b>Vendor/Client:</b> {uploadResult.client_name}<br />
                      <b>Amount:</b> ₹{(uploadResult.amount || 0).toLocaleString()}<br />
                      <b>Tax:</b> ₹{(uploadResult.tax || 0).toLocaleString()}<br />
                      <b>AI Category:</b> {uploadResult.ai_category} ({uploadResult.ai_confidence}% confidence)
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setUploadResult(null)}>Re-scan</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSaveUploaded} disabled={submitting}>
                      {submitting ? <span className="spinner" /> : 'Save Invoice'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
