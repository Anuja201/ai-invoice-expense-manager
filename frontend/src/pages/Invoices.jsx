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

  // Manual Create Modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    client_name: '', client_email: '', amount: '',
    tax: '', description: '', due_date: '', status: 'draft'
  });

  // Upload Modal & OCR state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [ocrForm, setOcrForm] = useState(null);
  const [fieldConf, setFieldConf] = useState({});

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

  const handleRealUpload = async (file) => {
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp', 'doc', 'docx'];
    if (!allowed.includes(ext)) {
      setUploadResult({ error: `Invalid file type '.${ext}'. Allowed types: ${allowed.join(', ')}` });
      return;
    }

    const maxSize = 16 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadResult({ error: 'File exceeds maximum limit of 16MB.' });
      return;
    }

    setUploadLoading(true);
    setUploadResult(null);
    setOcrForm(null);
    setFieldConf({});

    try {
      const res = await invoiceService.upload(file);
      const data = res.data.extracted_data || {};
      const conf = data.confidence_per_field || {};

      setUploadResult({
        ...data,
        extraction_method: res.data.extraction_method || data.extraction_method || 'AI OCR',
        file_name: res.data.file_name,
        file_url: res.data.file_url,
        message: res.data.message,
        needs_manual_review: res.data.needs_manual_review || data.needs_manual_review,
        manual_review_reason: data.manual_review_reason,
        validation_warnings: data.validation_warnings || [],
      });

      setFieldConf(conf);

      setOcrForm({
        client_name:    data.vendor || '',
        client_email:   '',
        invoice_number: data.invoice_number || '',
        date:           data.date || '',
        amount:         data.total_amount != null
                          ? data.total_amount
                          : (data.subtotal != null ? data.subtotal : ''),
        tax:            data.tax != null ? data.tax : '',
        due_date:       data.due_date || '',
        status:         'draft',
        description:    data.line_items && data.line_items.length > 0
                          ? data.line_items.map(i => i.description).filter(Boolean).join(', ')
                          : (data.description || `Uploaded invoice: ${file.name}`),
        ai_category:    data.ai_category || 'Uncategorized',
        ai_confidence:  data.ai_confidence || 0,
      });
    } catch (err) {
      const resp = err.response?.data;
      const data = resp?.extracted_data || {};
      const conf = data.confidence_per_field || {};

      setUploadResult({
        ...data,
        error: resp?.message || resp?.error || 'OCR extraction failed',
        needs_manual_review: true,
        manual_review_reason: data.manual_review_reason || 'OCR extraction failed',
        validation_warnings: data.validation_warnings || [],
        file_name: resp?.file_name,
        file_url: resp?.file_url,
        extraction_method: resp?.extraction_method || 'AI OCR',
      });
      setFieldConf(conf);

      setOcrForm({
        client_name:    data.vendor || '',
        client_email:   '',
        invoice_number: data.invoice_number || '',
        date:           data.date || '',
        amount:         data.total_amount != null
                          ? data.total_amount
                          : (data.subtotal != null ? data.subtotal : ''),
        tax:            data.tax != null ? data.tax : '',
        due_date:       data.due_date || '',
        status:         'draft',
        description:    data.description || `Uploaded invoice: ${file.name}`,
        ai_category:    data.ai_category || 'Uncategorized',
        ai_confidence:  data.ai_confidence || 0,
      });
    } finally {
      setUploadLoading(false);
    }
  };

  const handleSaveUploaded = async (e) => {
    if (e) e.preventDefault();
    if (!ocrForm) return;

    const amountNum = parseFloat(ocrForm.amount);
    const taxNum = parseFloat(ocrForm.tax || 0);

    if (!ocrForm.client_name.trim()) {
      setUploadResult(prev => ({ ...prev, error: 'Client Name is required — please fill it in before saving.' }));
      return;
    }
    if (isNaN(amountNum) || amountNum <= 0) {
      setUploadResult(prev => ({ ...prev, error: 'Amount must be a positive number — please fill it in before saving.' }));
      return;
    }

    setSubmitting(true);
    try {
      await invoiceService.create({
        ...ocrForm,
        amount: amountNum,
        tax: isNaN(taxNum) ? 0 : taxNum,
      });
      setShowUploadModal(false);
      setUploadResult(null);
      setOcrForm(null);
      setFieldConf({});
      await fetchInvoices();
    } catch (err) {
      setUploadResult(prev => ({ ...prev, error: err.response?.data?.error || 'Failed to save invoice' }));
    } finally {
      setSubmitting(false);
    }
  };

  const hasMissingRequired = ocrForm && (
    !ocrForm.client_name.trim() ||
    ocrForm.amount === '' || ocrForm.amount === null || parseFloat(ocrForm.amount) <= 0
  );

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
            🤖 AI Document Studio
          </button>
          <button className="btn btn-secondary" onClick={() => { setShowUploadModal(true); setUploadResult(null); setOcrForm(null); setFieldConf({}); }}>
            📄 Quick Upload PDF
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
      {/* Upload Modal with Editable OCR Fields */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUploadModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Upload Invoice PDF / Image</div>
                <div className="modal-subtitle">AI extracts fields — review &amp; correct highlighted fields before saving</div>
              </div>
              <button className="modal-close" onClick={() => { setShowUploadModal(false); setUploadResult(null); setOcrForm(null); setFieldConf({}); }}>✕</button>
            </div>
            <div className="modal-body">
              {/* Hard errors */}
              {uploadResult?.error && <div className="error-message" style={{ marginBottom: 14 }}>{uploadResult.error}</div>}

              {/* Upload zone */}
              {!ocrForm && !uploadLoading && (
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
                    input.accept = '.pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp';
                    input.onchange = e => handleRealUpload(e.target.files[0]);
                    input.click();
                  }}
                >
                  <div className="upload-zone-icon">📄</div>
                  <div className="upload-zone-title">Drop Invoice Image or PDF Here</div>
                  <div className="upload-zone-sub">Supports PDF, PNG, JPG, TIFF, WEBP — AI will extract fields</div>
                </div>
              )}

              {uploadLoading && (
                <div style={{ textAlign: 'center', padding: 28 }}>
                  <div style={{ width: 28, height: 28, border: '3px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI parsing invoice &amp; extracting fields...</p>
                </div>
              )}

              {ocrForm && !uploadLoading && (
                <form onSubmit={handleSaveUploaded} className="modal-form" style={{ marginTop: 4 }}>

                  {/* Status banner — amber if review needed, green if all clear */}
                  {uploadResult?.needs_manual_review ? (
                    <div style={{
                      background: '#FFFBEB',
                      border: '1px solid #FDE68A',
                      borderRadius: 'var(--radius-sm)',
                      padding: '10px 14px',
                      marginBottom: 16,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                        ⚠️ Manual Review Required ({uploadResult?.extraction_method || 'AI OCR'})
                      </div>
                      {uploadResult?.manual_review_reason && (
                        <div style={{ fontSize: 12, color: '#78350F' }}>
                          {uploadResult.manual_review_reason}
                        </div>
                      )}
                      {uploadResult?.validation_warnings?.length > 0 && (
                        <ul style={{ margin: '6px 0 0', padding: '0 0 0 16px', fontSize: 12, color: '#92400E' }}>
                          {uploadResult.validation_warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      )}
                      <div style={{ fontSize: 11, color: '#B45309', marginTop: 6 }}>
                        Fields with <strong>⚠ Uncertain</strong> badges could not be read from the document — please correct them before saving.
                      </div>
                    </div>
                  ) : (
                    <div style={{ background: 'var(--success-light)', border: '1px solid #A7F3D0', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)', marginBottom: 2 }}>
                        ✅ Invoice Extracted ({uploadResult?.extraction_method || 'AI OCR'})
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        All critical fields detected. Please review before saving.
                      </div>
                    </div>
                  )}

                  {/* Row: Client Name + Client Email */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        Client / Vendor Name *
                        {!fieldConf.vendor && <UncertainBadge />}
                      </label>
                      <input
                        className="form-input"
                        name="client_name"
                        value={ocrForm.client_name}
                        onChange={e => setOcrForm(f => ({ ...f, client_name: e.target.value }))}
                        placeholder="Enter vendor name"
                        style={uncertainStyle(fieldConf.vendor)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Client Email</label>
                      <input
                        className="form-input"
                        type="email"
                        name="client_email"
                        value={ocrForm.client_email}
                        onChange={e => setOcrForm(f => ({ ...f, client_email: e.target.value }))}
                        placeholder="client@acme.com"
                      />
                    </div>
                  </div>

                  {/* Row: Invoice Number + Invoice Date */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        Invoice Number
                        {!fieldConf.invoice_number && <UncertainBadge />}
                      </label>
                      <input
                        className="form-input"
                        name="invoice_number"
                        value={ocrForm.invoice_number}
                        onChange={e => setOcrForm(f => ({ ...f, invoice_number: e.target.value }))}
                        placeholder="INV-2024-0001"
                        style={uncertainStyle(fieldConf.invoice_number)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        Invoice Date
                        {!fieldConf.date && <UncertainBadge />}
                      </label>
                      <input
                        className="form-input"
                        type="date"
                        name="date"
                        value={ocrForm.date}
                        onChange={e => setOcrForm(f => ({ ...f, date: e.target.value }))}
                        style={uncertainStyle(fieldConf.date)}
                      />
                    </div>
                  </div>

                  {/* Row: Amount + Tax */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        Amount (₹) *
                        {!fieldConf.total_amount && <UncertainBadge />}
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        name="amount"
                        value={ocrForm.amount}
                        onChange={e => setOcrForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="Enter total amount"
                        min="0.01"
                        step="0.01"
                        style={uncertainStyle(fieldConf.total_amount)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        Tax (₹)
                        {!fieldConf.tax && <UncertainBadge />}
                      </label>
                      <input
                        className="form-input"
                        type="number"
                        name="tax"
                        value={ocrForm.tax}
                        onChange={e => setOcrForm(f => ({ ...f, tax: e.target.value }))}
                        placeholder="Enter tax amount"
                        min="0"
                        step="0.01"
                        style={uncertainStyle(fieldConf.tax)}
                      />
                    </div>
                  </div>

                  {/* Row: Due Date + Status */}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">
                        Due Date
                        {!fieldConf.due_date && <UncertainBadge />}
                      </label>
                      <input
                        className="form-input"
                        type="date"
                        name="due_date"
                        value={ocrForm.due_date}
                        onChange={e => setOcrForm(f => ({ ...f, due_date: e.target.value }))}
                        style={uncertainStyle(fieldConf.due_date)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-select"
                        name="status"
                        value={ocrForm.status}
                        onChange={e => setOcrForm(f => ({ ...f, status: e.target.value }))}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description / Line Items</label>
                    <textarea className="form-textarea" name="description" value={ocrForm.description} onChange={e => setOcrForm(f => ({ ...f, description: e.target.value }))} />
                  </div>

                  {ocrForm.ai_category && (
                    <div style={{ marginBottom: 14 }}>
                      <span className="category-pill" style={{ background: '#4F46E518', color: '#4F46E5', fontSize: 13 }}>
                        🤖 {ocrForm.ai_category}
                        {ocrForm.ai_confidence > 0 && ` (${ocrForm.ai_confidence}% confidence)`}
                      </span>
                    </div>
                  )}

                  {/* Inline save validation hint */}
                  {hasMissingRequired && (
                    <div style={{
                      background: '#FFF1F2',
                      border: '1px solid #FECDD3',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      fontSize: 12,
                      color: '#BE123C',
                      marginBottom: 12,
                    }}>
                      ⛔ <strong>Client Name</strong> and <strong>Amount</strong> are required before saving.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 20 }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setOcrForm(null); setUploadResult(null); setFieldConf({}); }}>
                      🔄 Re-scan / Select File
                    </button>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>Cancel</button>
                      <button type="submit" className="btn btn-primary" disabled={submitting || hasMissingRequired}>
                        {submitting ? <span className="spinner" /> : '💾 Save Invoice'}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
