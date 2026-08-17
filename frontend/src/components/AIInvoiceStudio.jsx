/**
 * components/AIInvoiceStudio.jsx
 * Comprehensive AI Invoice Studio & Processing Pipeline Component
 * Supports Images (.jpg, .jpeg, .png, .webp), PDFs (.pdf), and Word Documents (.doc, .docx).
 * Features:
 * - Drag-and-Drop & File Picker
 * - Validation & Progress Indicator
 * - Document Preview (Image/PDF/Word)
 * - Text Extraction & Pipeline Method Status
 * - Validation Engine Dashboard (Math checks, duplicates, missing fields)
 * - AI-Powered Financial & Payment Insights
 * - Interactive Editable Invoice Form with Real-Time Recalculations
 * - Professional Printable Invoice Generator
 */

import { useState, useEffect } from 'react';
import { invoiceService } from '../services/api';
import '../styles/AIInvoiceStudio.css';

const fmt = (n, curr = 'INR') => {
  const cMap = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB' };
  const locale = cMap[curr] || 'en-IN';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: curr, maximumFractionDigits: 2 }).format(n || 0);
  } catch (e) {
    return `₹${(n || 0).toFixed(2)}`;
  }
};

export default function AIInvoiceStudio({ onInvoiceSaved, onClose }) {
  // Processing stages: 1. upload | 2. extracting | 3. review | 4. preview
  const [stage, setStage] = useState(1);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileError, setFileError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [progressMsg, setProgressMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Raw OCR & Pipeline Output
  const [ocrResult, setOcrResult] = useState(null);
  const [showRawText, setShowRawText] = useState(false);

  // Editable Form State
  const [form, setForm] = useState({
    invoice_number: '',
    invoice_date: '',
    due_date: '',
    vendor_name: '',
    vendor_address: '',
    vendor_tax_id: '',
    customer_name: '',
    customer_address: '',
    customer_tax_id: '',
    payment_status: 'unpaid',
    payment_method: 'upi',
    currency: 'INR',
    ai_category: 'Services',
    ai_confidence: 90,
    items: [],
    subtotal: 0,
    tax_amount: 0,
    discount_amount: 0,
    total_amount: 0,
    file_name: '',
    file_url: ''
  });

  // Validations & AI Insights
  const [validations, setValidations] = useState([]);
  const [insights, setInsights] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Handle Drag & Drop / File Select
  const handleFileSelect = (file) => {
    setFileError('');
    if (!file) return;

    const allowed = ['pdf', 'png', 'jpg', 'jpeg', 'tiff', 'bmp', 'webp', 'doc', 'docx'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!allowed.includes(ext)) {
      setFileError(`Unsupported file format '.${ext}'. Allowed types: ${allowed.join(', ').toUpperCase()}`);
      return;
    }

    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      setFileError('File exceeds maximum limit of 16MB.');
      return;
    }

    setSelectedFile(file);

    if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }

    // Auto-start pipeline
    startProcessingPipeline(file);
  };

  // Run Pipeline
  const startProcessingPipeline = async (file) => {
    setLoading(true);
    setStage(2);
    setUploadProgress(10);
    setProgressMsg('Uploading...');

    try {
      setTimeout(() => { setUploadProgress(25); setProgressMsg('Processing document...'); }, 300);
      setTimeout(() => { setUploadProgress(50); setProgressMsg('Extracting text...'); }, 700);
      setTimeout(() => { setUploadProgress(75); setProgressMsg('Analyzing invoice with AI...'); }, 1100);
      setTimeout(() => { setUploadProgress(90); setProgressMsg('Validating extracted data...'); }, 1500);

      const res = await invoiceService.upload(file);

      const success = res.data.success !== false;
      const inv = res.data.invoice || res.data.extracted_data?.structured_data || res.data.structured_data || {};
      const data = res.data.extracted_data || {};
      const valList = res.data.validations || data.validations || [];
      const insObj = res.data.insights || data.insights || {};
      const rawText = res.data.extracted_text || data.raw_text || '';

      setOcrResult({
        ...data,
        raw_text: rawText,
        extraction_method: res.data.extraction_method || data.extraction_method || 'OCR Pipeline'
      });
      setValidations(valList);
      setInsights(insObj);

      // Populate Editable Form from AI Structured JSON
      const rawItems = inv.items || data.line_items || [];
      const formattedItems = rawItems.length > 0 ? rawItems.map(item => ({
        description: item.description || 'Invoice Line Item',
        quantity: parseFloat(item.quantity || 1),
        unit_price: parseFloat(item.unit_price || 0),
        discount: parseFloat(item.discount || 0),
        tax: parseFloat(item.tax || 0),
        total: parseFloat(item.total || item.total_price || (item.quantity * item.unit_price))
      })) : [];

      const vName = inv.vendor?.name || data.vendor || '';
      const cName = inv.customer?.name || data.customer || '';

      const rawSubtotal = inv.subtotal !== null && inv.subtotal !== undefined ? parseFloat(inv.subtotal) : parseFloat(data.subtotal || 0);
      const rawTax = inv.tax_amount !== null && inv.tax_amount !== undefined ? parseFloat(inv.tax_amount) : parseFloat(data.tax || 0);
      const rawTotal = inv.total_amount !== null && inv.total_amount !== undefined ? parseFloat(inv.total_amount) : parseFloat(data.total_amount || 0);

      const computedTotal = rawTotal > 0 ? rawTotal : (rawSubtotal + rawTax);
      const computedSubtotal = rawSubtotal > 0 ? rawSubtotal : Math.max(0, computedTotal - rawTax);

      let statusVal = (inv.payment_status || data.payment_status || 'unpaid').toLowerCase();
      if (!['unpaid', 'paid', 'overdue', 'draft', 'sent', 'cancelled'].includes(statusVal)) {
        statusVal = 'unpaid';
      }

      setForm({
        invoice_number: inv.invoice_number || data.invoice_number || '',
        invoice_date: inv.invoice_date || data.date || '',
        due_date: inv.due_date || data.due_date || '',
        vendor_name: vName,
        vendor_address: inv.vendor?.address || data.vendor_address || '',
        vendor_tax_id: inv.vendor?.tax_id || data.vendor_tax_id || '',
        customer_name: cName,
        customer_address: inv.customer?.address || data.customer_address || '',
        customer_tax_id: inv.customer?.tax_id || data.customer_tax_id || '',
        payment_status: statusVal,
        payment_method: data.payment_method || 'upi',
        currency: inv.currency || data.currency || 'INR',
        ai_category: data.ai_category || 'General',
        ai_confidence: data.ai_confidence || 90,
        items: formattedItems,
        subtotal: round2(computedSubtotal),
        tax_amount: round2(rawTax),
        discount_amount: round2(inv.discount_amount !== null && inv.discount_amount !== undefined ? parseFloat(inv.discount_amount) : parseFloat(data.discount || 0)),
        total_amount: round2(computedTotal),
        file_name: res.data.file_name || '',
        file_url: res.data.file_url || ''
      });

      setUploadProgress(100);
      setProgressMsg('Extraction completed');
      setTimeout(() => {
        setLoading(false);
        setStage(3);
      }, 400);

    } catch (err) {
      console.error(err);
      const resp = err.response?.data;
      const errorMsg = resp?.error || resp?.details || resp?.message || 'OCR failed: Unable to process document';
      setFileError(errorMsg);
      setLoading(false);
      setStage(1);
    }
  };

  // Recalculate totals whenever items, tax, or discount are changed
  const updateItem = (index, field, value) => {
    const updated = [...form.items];
    updated[index][field] = value;

    const qty = parseFloat(updated[index].quantity || 0);
    const unitPrice = parseFloat(updated[index].unit_price || 0);
    const disc = parseFloat(updated[index].discount || 0);
    const tax = parseFloat(updated[index].tax || 0);

    updated[index].total = Math.max(0, (qty * unitPrice) - disc + tax);

    recalculateFormTotals(updated, form.tax_amount, form.discount_amount);
  };

  const addItem = () => {
    const updated = [...form.items, { description: 'New Line Item', quantity: 1, unit_price: 1000, discount: 0, tax: 180, total: 1180 }];
    recalculateFormTotals(updated, form.tax_amount, form.discount_amount);
  };

  const removeItem = (index) => {
    const updated = form.items.filter((_, i) => i !== index);
    recalculateFormTotals(updated, form.tax_amount, form.discount_amount);
  };

  const recalculateFormTotals = (itemsList, manualTax, manualDiscount, manualSubtotal, manualTotal) => {
    if (itemsList && itemsList.length > 0) {
      const calculatedSubtotal = itemsList.reduce((acc, i) => acc + (parseFloat(i.quantity || 0) * parseFloat(i.unit_price || 0)), 0);
      const calculatedTax = itemsList.reduce((acc, i) => acc + parseFloat(i.tax || 0), 0);
      const calculatedDiscount = itemsList.reduce((acc, i) => acc + parseFloat(i.discount || 0), 0);

      const taxVal = calculatedTax > 0 ? calculatedTax : parseFloat(manualTax || 0);
      const discVal = calculatedDiscount > 0 ? calculatedDiscount : parseFloat(manualDiscount || 0);
      const totalVal = Math.max(0, calculatedSubtotal + taxVal - discVal);

      setForm(prev => ({
        ...prev,
        items: itemsList,
        subtotal: round2(calculatedSubtotal),
        tax_amount: round2(taxVal),
        discount_amount: round2(discVal),
        total_amount: round2(totalVal)
      }));
    } else {
      setForm(prev => {
        const subVal = manualSubtotal !== undefined ? parseFloat(manualSubtotal || 0) : prev.subtotal;
        const taxVal = manualTax !== undefined ? parseFloat(manualTax || 0) : prev.tax_amount;
        const discVal = manualDiscount !== undefined ? parseFloat(manualDiscount || 0) : prev.discount_amount;
        let totVal = manualTotal !== undefined ? parseFloat(manualTotal || 0) : prev.total_amount;
        if (totVal <= 0 && subVal > 0) {
          totVal = subVal + taxVal - discVal;
        }
        return {
          ...prev,
          items: itemsList || [],
          subtotal: round2(subVal),
          tax_amount: round2(taxVal),
          discount_amount: round2(discVal),
          total_amount: round2(totVal)
        };
      });
    }
  };

  const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Save to DB
  const handleSaveInvoice = async () => {
    setSaveError('');
    const clientName = (form.vendor_name || form.customer_name || '').trim();
    if (!clientName) {
      setSaveError('Client / Vendor name is required');
      return;
    }

    const finalSubtotal = parseFloat(form.subtotal) || 0;
    const finalTax = parseFloat(form.tax_amount) || 0;
    let finalTotal = parseFloat(form.total_amount) || 0;

    if (finalTotal <= 0 && finalSubtotal > 0) {
      finalTotal = finalSubtotal + finalTax;
    }

    if (finalTotal <= 0) {
      setSaveError('Total amount must be greater than zero');
      return;
    }

    const sanitizedItems = (form.items || []).map(item => ({
      description: (item.description || 'Line Item').trim(),
      quantity: parseFloat(item.quantity) || 1,
      unit_price: parseFloat(item.unit_price) || 0,
      tax: parseFloat(item.tax) || 0,
      total: parseFloat(item.total) || ((parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price) || 0))
    }));

    let clientEmail = '';
    const nameForEmail = form.customer_name || form.vendor_name || '';
    if (nameForEmail) {
      const cleanName = nameForEmail.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanName) clientEmail = `${cleanName}@client.com`;
    }

    setSubmitting(true);
    try {
      await invoiceService.create({
        client_name: clientName,
        client_email: clientEmail,
        amount: finalSubtotal > 0 ? finalSubtotal : Math.max(0, finalTotal - finalTax),
        tax: finalTax,
        total_amount: finalTotal,
        invoice_number: form.invoice_number,
        due_date: form.due_date,
        status: form.payment_status || 'draft',
        description: `Vendor: ${form.vendor_name || ''} | Customer: ${form.customer_name || ''}`,
        file_name: form.file_name,
        ai_category: form.ai_category,
        ai_confidence: form.ai_confidence,
        items: sanitizedItems
      });

      if (onInvoiceSaved) onInvoiceSaved();
      if (onClose) onClose();
    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save invoice record');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="studio-card fade-in">
      {/* Studio Header */}
      <div className="studio-header">
        <div className="studio-title-wrap">
          <div className="studio-icon">🤖</div>
          <div>
            <h2 className="studio-title">AI Invoice Processing Studio</h2>
            <p className="studio-subtitle">Upload Images, PDFs, or Word Docs (.doc, .docx) — AI extracts, validates & generates insights</p>
          </div>
        </div>
        {onClose && (
          <button className="studio-close-btn" onClick={onClose}>✕</button>
        )}
      </div>

      {/* Stage Progress Bar */}
      <div className="stage-nav">
        <div className={`stage-step ${stage >= 1 ? 'active' : ''}`}>
          <span className="step-num">1</span> 📂 Upload & Validate
        </div>
        <div className={`stage-step ${stage >= 2 ? 'active' : ''}`}>
          <span className="step-num">2</span> ⚡ OCR & Text Extract
        </div>
        <div className={`stage-step ${stage >= 3 ? 'active' : ''}`}>
          <span className="step-num">3</span> 🛡️ Validation & Insights
        </div>
        <div className={`stage-step ${stage >= 4 ? 'active' : ''}`}>
          <span className="step-num">4</span> 📄 Generator & Export
        </div>
      </div>

      {/* Stage 1: File Upload */}
      {stage === 1 && (
        <div className="studio-body">
          {fileError && <div className="studio-error">{fileError}</div>}

          <div
            className="drop-zone"
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
            onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
              const file = e.dataTransfer.files[0];
              if (file) handleFileSelect(file);
            }}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.pdf,.png,.jpg,.jpeg,.tiff,.bmp,.webp,.doc,.docx';
              input.onchange = e => handleFileSelect(e.target.files[0]);
              input.click();
            }}
          >
            <div className="drop-icon">📑</div>
            <h3 className="drop-title">Drag & Drop Invoice Document Here</h3>
            <p className="drop-desc">Supports Images (JPG, PNG, WEBP), PDFs, and Word Documents (.DOC, .DOCX)</p>
            <div className="file-badges">
              <span className="badge">🖼️ PNG / JPG / WEBP</span>
              <span className="badge">📄 PDF</span>
              <span className="badge">📝 DOC / DOCX</span>
              <span className="badge max">Max 16 MB</span>
            </div>
          </div>
        </div>
      )}

      {/* Stage 2: Processing Progress */}
      {stage === 2 && (
        <div className="studio-body text-center" style={{ padding: '48px 24px' }}>
          <div className="studio-spinner" />
          <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 16 }}>{progressMsg}</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Executing multi-engine OCR, image enhancement, and structured AI parser...</p>

          <div className="progress-container" style={{ marginTop: 24 }}>
            <div className="progress-bar-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', marginTop: 8, display: 'block' }}>{uploadProgress}% Completed</span>
        </div>
      )}

      {/* Stage 3: Review & Edit Invoice Data */}
      {stage === 3 && (
        <div className="studio-body">
          {saveError && <div className="studio-error">{saveError}</div>}

          {/* Validation Alerts Bar */}
          {validations.length > 0 ? (
            <div className="validation-alert-box">
              <div className="alert-box-header">
                <span>🛡️ AI Validation Engine Analysis ({validations.length} Notification{validations.length > 1 ? 's' : ''})</span>
              </div>
              <ul className="alert-list">
                {validations.map((val, idx) => (
                  <li key={idx} className={`alert-item ${val.severity || 'warning'}`}>
                    <span className="alert-badge">{val.severity?.toUpperCase() || 'CHECK'}</span>
                    <span className="alert-text">{val.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="validation-success-box">
              ✅ Document validated cleanly! All line items, subtotal math, and fields passed automatic checks.
            </div>
          )}

          {/* AI Insights Summary Cards */}
          {insights && (
            <div className="insights-grid">
              {/* Financial Insights */}
              <div className="insight-card financial">
                <div className="insight-card-title">💰 Financial Insights</div>
                <div className="insight-stat">
                  <div className="stat-label">Total Amount</div>
                  <div className="stat-value">{fmt(insights.financial_insights?.total_amount, form.currency)}</div>
                </div>
                <div className="stat-row">
                  <span>Tax ({insights.invoice_analysis?.tax_percentage || 0}%)</span>
                  <span>{fmt(insights.financial_insights?.tax_amount, form.currency)}</span>
                </div>
                <div className="stat-row">
                  <span>Subtotal</span>
                  <span>{fmt(insights.financial_insights?.subtotal, form.currency)}</span>
                </div>
                <div className="stat-row">
                  <span>Avg Item Price</span>
                  <span>{fmt(insights.financial_insights?.average_item_price, form.currency)}</span>
                </div>
              </div>

              {/* Payment Insights */}
              <div className="insight-card payment">
                <div className="insight-card-title">💳 Payment Insights</div>
                <div className="insight-stat">
                  <div className="stat-label">Payment Status</div>
                  <div className={`status-pill ${insights.payment_insights?.payment_status || 'unpaid'}`}>
                    {(insights.payment_insights?.payment_status || 'unpaid').toUpperCase()}
                  </div>
                </div>
                <div className="stat-row">
                  <span>Due Date</span>
                  <span>{insights.payment_insights?.due_date || 'N/A'}</span>
                </div>
                <div className="stat-row">
                  <span>Payment Method</span>
                  <span style={{ textTransform: 'uppercase' }}>{insights.payment_insights?.payment_method || 'UPI'}</span>
                </div>
                {insights.payment_insights?.days_remaining !== null && (
                  <div className="stat-row">
                    <span>Days Remaining</span>
                    <span>{insights.payment_insights?.days_remaining} Days</span>
                  </div>
                )}
              </div>

              {/* AI Natural Language Summary */}
              <div className="insight-card summary">
                <div className="insight-card-title">🤖 AI Document Summary</div>
                <p className="summary-text">{insights.ai_summary || 'Document extracted cleanly.'}</p>
                <div className="extraction-meta">
                  Extraction Engine: <strong>{ocrResult?.extraction_method || 'AI Multi-Engine OCR'}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Raw Text Expander */}
          <div className="raw-text-section" style={{ marginBottom: 20 }}>
            <button className="raw-text-toggle" onClick={() => setShowRawText(!showRawText)} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, background: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600, textAlign: 'left', cursor: 'pointer' }}>
              {showRawText ? '▼ Hide Extracted Text' : '► View Extracted Text'}
            </button>
            {showRawText && (
              <pre className="raw-text-box" style={{ marginTop: 8, padding: 16, background: '#0f172a', color: '#38bdf8', borderRadius: 8, fontSize: 13, overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                {ocrResult?.raw_text || ocrResult?.extracted_text || 'No text extracted from document.'}
              </pre>
            )}
          </div>

          {/* Document Preview & Editable Form Layout */}
          <div className="editor-grid">
            {/* Left Column: Preview */}
            <div className="preview-container">
              <div className="preview-header">
                <span>📄 Uploaded Document Preview</span>
                <span className="file-name-label">{selectedFile?.name || form.file_name}</span>
              </div>
              <div className="preview-body">
                {previewUrl ? (
                  <img src={previewUrl} alt="Invoice Document Preview" className="preview-img" />
                ) : selectedFile?.name?.toLowerCase().endsWith('.pdf') ? (
                  <div className="preview-doc-placeholder">
                    <div className="doc-icon">📄</div>
                    <p style={{ fontWeight: 600 }}>PDF Document Uploaded</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedFile?.name}</p>
                  </div>
                ) : (
                  <div className="preview-doc-placeholder">
                    <div className="doc-icon">📝</div>
                    <p style={{ fontWeight: 600 }}>Word Document (.DOC/.DOCX)</p>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedFile?.name || form.file_name}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Editable Invoice Form */}
            <div className="form-container">
              <h3 className="section-title">✏️ Review & Edit Extracted Fields</h3>

              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Vendor / Seller Name *</label>
                  <input
                    className="form-input"
                    value={form.vendor_name}
                    onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                    placeholder="Acme Corp"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Customer / Client Name *</label>
                  <input
                    className="form-input"
                    value={form.customer_name}
                    onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))}
                    placeholder="Customer Ltd"
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Invoice #</label>
                  <input
                    className="form-input"
                    value={form.invoice_number}
                    onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Invoice Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.invoice_date}
                    onChange={e => setForm(f => ({ ...f, invoice_date: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Due Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.due_date}
                    onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
                  />
                </div>
              </div>

              <div className="form-row-3">
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <select
                    className="form-select"
                    value={form.currency}
                    onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={form.payment_status}
                    onChange={e => setForm(f => ({ ...f, payment_status: e.target.value }))}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="draft">Draft</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    className="form-select"
                    value={form.payment_method}
                    onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                  >
                    <option value="upi">UPI / GPay</option>
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>

              <div className="form-row-3" style={{ marginTop: 8 }}>
                <div className="form-group">
                  <label className="form-label">Subtotal ({form.currency})</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    value={form.subtotal}
                    onChange={e => recalculateFormTotals(form.items, form.tax_amount, form.discount_amount, parseFloat(e.target.value) || 0, form.total_amount)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tax Amount ({form.currency})</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    value={form.tax_amount}
                    onChange={e => recalculateFormTotals(form.items, parseFloat(e.target.value) || 0, form.discount_amount, form.subtotal, form.total_amount)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Amount ({form.currency}) *</label>
                  <input
                    className="form-input"
                    type="number"
                    step="0.01"
                    value={form.total_amount}
                    onChange={e => recalculateFormTotals(form.items, form.tax_amount, form.discount_amount, form.subtotal, parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              {/* Line Items Table */}
              <div className="items-section">
                <div className="items-header">
                  <span style={{ fontWeight: 700, fontSize: 14 }}>📋 Line Items (Real-Time Recalculation)</span>
                  <button className="btn btn-secondary btn-sm" onClick={addItem}>+ Add Item</button>
                </div>

                <div className="table-wrapper">
                  <table className="studio-items-table">
                    <thead>
                      <tr>
                        <th>Description</th>
                        <th style={{ width: 70 }}>Qty</th>
                        <th style={{ width: 110 }}>Price</th>
                        <th style={{ width: 90 }}>Tax</th>
                        <th style={{ width: 110 }}>Total</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, idx) => (
                        <tr key={idx}>
                          <td>
                            <input
                              className="table-input"
                              value={item.description}
                              onChange={e => updateItem(idx, 'description', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              className="table-input"
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              className="table-input"
                              type="number"
                              step="0.01"
                              value={item.unit_price}
                              onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              className="table-input"
                              type="number"
                              step="0.01"
                              value={item.tax}
                              onChange={e => updateItem(idx, 'tax', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            {fmt(item.total, form.currency)}
                          </td>
                          <td>
                            <button className="remove-item-btn" onClick={() => removeItem(idx)}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals Summary */}
                <div className="totals-summary-card">
                  <div className="total-line">
                    <span>Subtotal:</span>
                    <span>{fmt(form.subtotal, form.currency)}</span>
                  </div>
                  <div className="total-line">
                    <span>Tax Total:</span>
                    <span>{fmt(form.tax_amount, form.currency)}</span>
                  </div>
                  <div className="total-line grand-total">
                    <span>Grand Total:</span>
                    <span>{fmt(form.total_amount, form.currency)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="studio-actions">
                <button className="btn btn-secondary" onClick={() => setStage(1)}>
                  🔄 Re-upload File
                </button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-secondary" onClick={() => setStage(4)}>
                    👁️ Preview Printable Invoice
                  </button>
                  <button className="btn btn-primary" onClick={handleSaveInvoice} disabled={submitting}>
                    {submitting ? <span className="spinner" /> : '💾 Save Invoice Record'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage 4: Professional Printable Invoice Generator */}
      {stage === 4 && (
        <div className="studio-body">
          <div className="printable-actions-bar">
            <button className="btn btn-secondary" onClick={() => setStage(3)}>
              ✏️ Back to Edit
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" onClick={() => window.print()}>
                🖨️ Print / Download PDF
              </button>
              <button className="btn btn-primary" onClick={handleSaveInvoice} disabled={submitting}>
                {submitting ? <span className="spinner" /> : '💾 Save & Finalize Invoice'}
              </button>
            </div>
          </div>

          {/* Printable Template Paper */}
          <div className="invoice-print-paper" id="printable-invoice">
            {/* Header */}
            <div className="print-header">
              <div>
                <h1 className="print-brand">{form.vendor_name || 'Vendor Company'}</h1>
                <p className="print-sub">{form.vendor_address || '123 Tech Park, Suite 400'}</p>
                {form.vendor_tax_id && <p className="print-sub">Tax ID / GSTIN: {form.vendor_tax_id}</p>}
              </div>
              <div className="print-inv-meta">
                <h2 className="print-inv-title">INVOICE</h2>
                <div className="meta-row"><strong>Invoice #:</strong> {form.invoice_number}</div>
                <div className="meta-row"><strong>Date:</strong> {form.invoice_date}</div>
                <div className="meta-row"><strong>Due Date:</strong> {form.due_date || 'On Receipt'}</div>
                <div className="meta-row"><strong>Status:</strong> <span style={{ textTransform: 'uppercase', color: form.payment_status === 'paid' ? 'green' : 'red' }}>{form.payment_status}</span></div>
              </div>
            </div>

            {/* Customer Bill To */}
            <div className="print-bill-to">
              <div>
                <span className="bill-label">Billed To:</span>
                <h3 className="bill-name">{form.customer_name || 'Valued Customer'}</h3>
                <p className="bill-sub">{form.customer_address || 'Customer Address'}</p>
                {form.customer_tax_id && <p className="bill-sub">Tax ID: {form.customer_tax_id}</p>}
              </div>
            </div>

            {/* Line Items Table */}
            <table className="print-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Tax</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {form.items.map((item, idx) => (
                  <tr key={idx}>
                    <td>{item.description}</td>
                    <td>{item.quantity}</td>
                    <td>{fmt(item.unit_price, form.currency)}</td>
                    <td>{fmt(item.tax, form.currency)}</td>
                    <td>{fmt(item.total, form.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Breakdown */}
            <div className="print-footer-grid">
              <div className="print-notes">
                <h4>Payment Instructions & Notes</h4>
                <p>Payment Method: {form.payment_method?.toUpperCase()}</p>
                <p>Thank you for your business! Please remit payment prior to due date.</p>
              </div>
              <div className="print-totals">
                <div className="p-row"><span>Subtotal:</span> <span>{fmt(form.subtotal, form.currency)}</span></div>
                <div className="p-row"><span>Tax Total:</span> <span>{fmt(form.tax_amount, form.currency)}</span></div>
                <div className="p-row p-grand"><span>Total Due:</span> <span>{fmt(form.total_amount, form.currency)}</span></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
