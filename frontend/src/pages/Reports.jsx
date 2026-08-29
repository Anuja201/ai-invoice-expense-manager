/**
 * pages/Reports.jsx
 *
 * Full financial reporting page for Expenza.
 * – Filters: report type, date range (presets + custom), category, payment method
 * – Generate Report button → fetches /api/reports/data
 * – KPI cards: Total Expenses, Total Transactions, Avg Expense, Highest Expense
 * – Charts: Category Bar, Monthly Trend Line, Payment Method Doughnut
 * – Transaction table: sortable, paginated, with vendor/category/pm/amount/desc
 * – Export CSV (proper Blob download)
 * – Export PDF (jsPDF + html2canvas — full report with charts)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { reportsService, categoryService } from '../services/api';
import { fmt } from '../utils/format';
import '../styles/Reports.css';

ChartJS.register(
  CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, ArcElement,
  Tooltip, Legend, Filler
);

/* ── Date preset helpers ────────────────────────────────────── */
function toISO(d) { return d.toISOString().slice(0, 10); }

const DATE_PRESETS = {
  this_month: () => {
    const now = new Date();
    return {
      start: toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
      end:   toISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  },
  last_month: () => {
    const now = new Date();
    return {
      start: toISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end:   toISO(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  },
  last_3_months: () => {
    const now = new Date();
    return {
      start: toISO(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
      end:   toISO(now),
    };
  },
  last_6_months: () => {
    const now = new Date();
    return {
      start: toISO(new Date(now.getFullYear(), now.getMonth() - 5, 1)),
      end:   toISO(now),
    };
  },
  this_year: () => {
    const now = new Date();
    return {
      start: toISO(new Date(now.getFullYear(), 0, 1)),
      end:   toISO(now),
    };
  },
  all_time: () => ({ start: '', end: '' }),
  custom: null,
};

const PAYMENT_METHOD_LABELS = {
  cash:          'Cash',
  credit_card:   'Credit Card',
  debit_card:    'Debit Card',
  bank_transfer: 'Bank Transfer',
  upi:           'UPI',
  other:         'Other',
  invoice:       'Invoice',
};

const CHART_COLORS = [
  '#2563EB','#8B5CF6','#10B981','#F59E0B','#EF4444',
  '#06B6D4','#EC4899','#14B8A6','#F97316','#6366F1',
];

/* ── SVG Icons ──────────────────────────────────────────────── */
const IconReport = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const IconFilter = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);
const IconPrint = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);
const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const IconReset = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.5" />
  </svg>
);
const IconChevron = ({ dir }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: dir === 'up' ? 'rotate(180deg)' : 'none' }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const IconSort = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
  </svg>
);
const IconEmpty = () => (
  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
);
const IconWallet = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
  </svg>
);
const IconHash = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);
const IconAvg = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);
const IconTop = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

/* ── Pagination helper ──────────────────────────────────────── */
const PAGE_SIZE = 20;

/* ── Chart.js dark-mode aware options ──────────────────────── */
function chartDefaults() {
  const dark = document.body.classList.contains('dark-theme');
  return {
    gridColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    textColor:  dark ? '#94A3B8' : '#64748B',
  };
}

/* ══════════════════════════════════════════════════════════════
   Main Component
   ══════════════════════════════════════════════════════════════ */
export default function Reports() {
  /* ── Filter state ─────────────────────────────────────────── */
  const [reportType,     setReportType]     = useState('expenses');
  const [datePreset,     setDatePreset]     = useState('this_month');
  const [startDate,      setStartDate]      = useState(() => DATE_PRESETS.this_month().start);
  const [endDate,        setEndDate]        = useState(() => DATE_PRESETS.this_month().end);
  const [categoryId,     setCategoryId]     = useState('');
  const [paymentMethod,  setPaymentMethod]  = useState('');
  const [categories,     setCategories]     = useState([]);

  /* ── Report data state ────────────────────────────────────── */
  const [reportData,  setReportData]  = useState(null);   // null = not yet generated
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [pdfLoading,  setPdfLoading]  = useState(false);
  const hasGenerated = reportData !== null;

  /* ── Table state ──────────────────────────────────────────── */
  const [sortKey,  setSortKey]  = useState('date');
  const [sortDir,  setSortDir]  = useState('desc');
  const [page,     setPage]     = useState(1);

  /* ── Refs ─────────────────────────────────────────────────── */
  const chartKey   = useRef(0);
  const resultsRef = useRef(null);   // ref for the PDF capture area

  /* ── Load categories on mount — deduplicate by name ───────── */
  useEffect(() => {
    categoryService.list()
      .then(r => {
        const raw = r.data.categories || [];
        // Keep only the first occurrence of each category name
        const seen = new Set();
        const unique = raw.filter(c => {
          if (seen.has(c.name)) return false;
          seen.add(c.name);
          return true;
        });
        setCategories(unique);
      })
      .catch(() => {});
  }, []);

  /* ── Apply date preset ────────────────────────────────────── */
  const applyPreset = useCallback((preset) => {
    setDatePreset(preset);
    if (preset !== 'custom' && DATE_PRESETS[preset]) {
      const { start, end } = DATE_PRESETS[preset]();
      setStartDate(start);
      setEndDate(end);
    }
  }, []);

  /* ── Generate report ──────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError('');
    setPage(1);
    try {
      const params = { report_type: reportType };
      if (startDate) params.start_date = startDate;
      if (endDate)   params.end_date   = endDate;
      if (categoryId) params.category_id = categoryId;
      if (paymentMethod) params.payment_method = paymentMethod;

      const res = await reportsService.getData(params);
      setReportData(res.data);
      chartKey.current += 1;   // force Chart.js re-init
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate report. Please try again.');
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }, [reportType, startDate, endDate, categoryId, paymentMethod]);

  /* ── Reset filters ────────────────────────────────────────── */
  const handleReset = () => {
    setReportType('expenses');
    applyPreset('this_month');
    setCategoryId('');
    setPaymentMethod('');
    setReportData(null);
    setError('');
    setPage(1);
  };

  /* ── Sort + paginate transactions ─────────────────────────── */
  const transactions = reportData?.transactions || [];
  const sorted = [...transactions].sort((a, b) => {
    let va = a[sortKey], vb = b[sortKey];
    if (sortKey === 'amount') { va = parseFloat(va); vb = parseFloat(vb); }
    else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 :  1;
    if (va > vb) return sortDir === 'asc' ?  1 : -1;
    return 0;
  });
  const totalPages   = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated    = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageTotal    = paginated.reduce((s, t) => s + t.amount, 0);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  /* ── Export CSV ───────────────────────────────────────────── */
  const exportCSV = () => {
    if (!reportData) return;
    const rows = [
      ['Date', 'Vendor', 'Category', 'Payment Method', 'Amount', 'Type', 'Description'],
      ...sorted.map(t => [
        t.date,
        `"${(t.vendor || '').replace(/"/g, '""')}"`,
        `"${(t.category || '').replace(/"/g, '""')}"`,
        PAYMENT_METHOD_LABELS[t.payment_method] || t.payment_method,
        t.amount.toFixed(2),
        t.type,
        `"${(t.description || '').replace(/"/g, '""')}"`,
      ]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `expenza-report-${startDate || 'all'}-to-${endDate || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  };

  /* ── Export PDF — jsPDF + html2canvas ─────────────────────── */
  const exportPDF = async () => {
    if (!reportData || !resultsRef.current) return;
    setPdfLoading(true);
    try {
      // Temporarily expand the table to show all rows (no pagination in PDF)
      const el = resultsRef.current;

      // Use html2canvas to capture the entire results area
      const canvas = await html2canvas(el, {
        scale: 1.8,          // high-DPI for crisp text & charts
        useCORS: true,
        allowTaint: true,
        backgroundColor: document.body.classList.contains('dark-theme')
          ? '#1E293B' : '#F8FAFC',
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });

      const imgData   = canvas.toDataURL('image/png');
      const pdfW      = 210;   // A4 mm width
      const pdfH      = 297;   // A4 mm height
      const margin    = 12;
      const usableW   = pdfW - margin * 2;

      // Scale the image to fit the page width
      const imgW   = canvas.width;
      const imgH   = canvas.height;
      const ratio  = usableW / (imgW / 3.7795); // px → mm at 96dpi
      const scaledH = (imgH / 3.7795) * ratio;   // mm

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      /* ── Cover header ────────────────────────────────────── */
      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, 0, pdfW, 22, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Expenza — Financial Report', margin, 14);

      // Filter summary on cover
      const filterLine = [
        `Type: ${reportType === 'both' ? 'Expenses + Invoices' : reportType.charAt(0).toUpperCase() + reportType.slice(1)}`,
        startDate ? `From: ${startDate}` : '',
        endDate   ? `To: ${endDate}`     : '',
        categoryId ? `Category ID: ${categoryId}` : '',
        paymentMethod ? `Payment: ${PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}` : '',
      ].filter(Boolean).join('   |   ');

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(219, 234, 254);
      pdf.text(filterLine || 'All data', margin, 20);

      /* ── KPI summary block ───────────────────────────────── */
      const headerH = 26;
      pdf.setTextColor(30, 41, 59);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');

      const s = reportData.summary;
      const kpis = [
        ['Total Amount',        fmt(s.total_expenses)],
        ['Transactions',        s.total_transactions.toLocaleString()],
        ['Average Amount',      fmt(s.avg_expense)],
        ['Highest Transaction', fmt(s.highest_expense)],
      ];
      const kpiW  = usableW / kpis.length;
      kpis.forEach(([label, value], i) => {
        const x = margin + i * kpiW;
        pdf.setFillColor(239, 246, 255);
        pdf.roundedRect(x, headerH, kpiW - 3, 18, 2, 2, 'F');
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text(label.toUpperCase(), x + 3, headerH + 7);
        pdf.setTextColor(15, 23, 42);
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text(value, x + 3, headerH + 14);
      });

      /* ── Generated-on line ───────────────────────────────── */
      const nowStr = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
      pdf.setFontSize(7.5);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(148, 163, 184);
      pdf.text(`Generated on ${nowStr}`, margin, headerH + 24);

      /* ── Charts + table image ────────────────────────────── */
      const contentStartY = headerH + 30;
      const availableH    = pdfH - contentStartY - margin;

      // Place image. If it fits on one page, keep it; else tile across pages.
      const imgMmW = usableW;
      const imgMmH = imgMmW * (imgH / imgW);

      if (imgMmH <= availableH) {
        pdf.addImage(imgData, 'PNG', margin, contentStartY, imgMmW, imgMmH);
      } else {
        // Multi-page: slice the canvas row by row
        const rowH = availableH;              // mm per page
        const rowPx = Math.floor((rowH / imgMmH) * imgH); // source px per slice
        let srcY = 0;
        let firstSlice = true;
        while (srcY < imgH) {
          const sliceH = Math.min(rowPx, imgH - srcY);
          // Draw slice onto a temporary canvas
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width  = imgW;
          sliceCanvas.height = sliceH;
          const ctx = sliceCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH);
          const sliceData = sliceCanvas.toDataURL('image/png');
          const sliceMmH  = (sliceH / imgH) * imgMmH;

          if (!firstSlice) pdf.addPage();
          const yOffset = firstSlice ? contentStartY : margin;
          pdf.addImage(sliceData, 'PNG', margin, yOffset, imgMmW, sliceMmH);

          srcY += sliceH;
          firstSlice = false;
        }
      }

      /* ── Transaction table (text-based, always shows all rows) */
      if (sorted.length > 0) {
        pdf.addPage();
        pdf.setFillColor(37, 99, 235);
        pdf.rect(0, 0, pdfW, 16, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(11);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Transaction Details', margin, 11);

        const cols = [
          { label: 'Date',           key: 'date',           w: 22 },
          { label: 'Vendor/Client',  key: 'vendor',         w: 45 },
          { label: 'Category',       key: 'category',       w: 32 },
          { label: 'Payment',        key: 'payment_method', w: 28 },
          { label: 'Amount',         key: 'amount',         w: 28 },
          { label: 'Description',    key: 'description',    w: 43 },
        ];

        let cy = 22;
        const rowH2 = 7;
        const padX  = 2;

        // Table header
        pdf.setFillColor(241, 245, 249);
        pdf.rect(margin, cy, usableW, rowH2, 'F');
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        let cx = margin;
        cols.forEach(col => {
          pdf.text(col.label.toUpperCase(), cx + padX, cy + 5);
          cx += col.w;
        });
        cy += rowH2;

        // Rows
        pdf.setFont('helvetica', 'normal');
        sorted.forEach((t, idx) => {
          if (cy + rowH2 > pdfH - margin) {
            pdf.addPage();
            cy = margin;
          }
          if (idx % 2 === 0) {
            pdf.setFillColor(248, 250, 252);
            pdf.rect(margin, cy, usableW, rowH2, 'F');
          }
          pdf.setTextColor(30, 41, 59);
          pdf.setFontSize(7);
          cx = margin;
          cols.forEach(col => {
            let val = String(t[col.key] || '—');
            if (col.key === 'amount') val = fmt(t.amount);
            if (col.key === 'payment_method') val = PAYMENT_METHOD_LABELS[val] || val;
            // Truncate to fit column
            const maxChars = Math.floor(col.w / 1.6);
            if (val.length > maxChars) val = val.slice(0, maxChars - 1) + '…';
            if (col.key === 'amount') {
              pdf.setTextColor(t.type === 'invoice' ? 16 : 239, t.type === 'invoice' ? 185 : 68, t.type === 'invoice' ? 129 : 68);
            } else {
              pdf.setTextColor(30, 41, 59);
            }
            pdf.text(val, cx + padX, cy + 5);
            cx += col.w;
          });
          cy += rowH2;
        });

        // Grand total row
        pdf.setFillColor(219, 234, 254);
        pdf.rect(margin, cy, usableW, rowH2, 'F');
        pdf.setTextColor(37, 99, 235);
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Total  (${sorted.length} transactions)`, margin + padX, cy + 5);
        const amtX = margin + cols.slice(0, 4).reduce((s, c) => s + c.w, 0);
        pdf.text(fmt(sorted.reduce((s, t) => s + t.amount, 0)), amtX + padX, cy + 5);
      }

      /* ── Save ────────────────────────────────────────────── */
      const filename = `expenza-report-${startDate || 'all'}-to-${endDate || 'all'}.pdf`;
      pdf.save(filename);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('PDF export failed. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  /* ── Chart data builders ──────────────────────────────────── */
  const { gridColor, textColor } = chartDefaults();
  const commonTooltip = {
    backgroundColor: 'rgba(15,23,42,0.92)',
    titleColor: '#F8FAFC',
    bodyColor: '#94A3B8',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    padding: 12,
    cornerRadius: 8,
  };

  // Category bar chart
  const catData = reportData?.by_category || [];
  const barData = {
    labels: catData.map(c => c.category),
    datasets: [{
      label: 'Total Amount',
      data:  catData.map(c => c.total),
      backgroundColor: catData.map((c, i) => c.color || CHART_COLORS[i % CHART_COLORS.length]),
      borderRadius: 6,
      borderSkipped: false,
    }],
  };
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...commonTooltip,
        callbacks: {
          label: ctx => ` ${fmt(ctx.raw)}  (${catData[ctx.dataIndex]?.count || 0} txn)`,
        },
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, maxRotation: 40 } },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: textColor, font: { size: 11 },
          callback: v => {
            if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
            if (v >= 1000)   return `${(v / 1000).toFixed(0)}K`;
            return v;
          },
        },
      },
    },
  };

  // Monthly trend line chart
  const trendData = reportData?.monthly_trend || [];
  const monthLabels = trendData.map(m => {
    const [y, mo] = m.month.split('-');
    return new Date(y, parseInt(mo) - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
  });
  const lineData = {
    labels: monthLabels,
    datasets: [{
      label: 'Monthly Total',
      data:  trendData.map(m => m.total),
      fill: true,
      borderColor: '#2563EB',
      backgroundColor: 'rgba(37,99,235,0.1)',
      pointBackgroundColor: '#2563EB',
      pointRadius: 5,
      pointHoverRadius: 7,
      tension: 0.35,
    }],
  };
  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...commonTooltip,
        callbacks: {
          label: ctx => ` ${fmt(ctx.raw)}  (${trendData[ctx.dataIndex]?.count || 0} txn)`,
        },
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: textColor, font: { size: 11 },
          callback: v => {
            if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
            if (v >= 1000)   return `${(v / 1000).toFixed(0)}K`;
            return v;
          },
        },
      },
    },
  };

  // Payment method doughnut chart
  const pmData = reportData?.by_payment_method || [];
  const doughnutData = {
    labels: pmData.map(p => PAYMENT_METHOD_LABELS[p.method] || p.method),
    datasets: [{
      data:            pmData.map(p => p.total),
      backgroundColor: pmData.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
      borderWidth: 0,
      hoverOffset: 8,
    }],
  };
  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: { display: false },
      tooltip: {
        ...commonTooltip,
        callbacks: {
          label: ctx => {
            const pm = pmData[ctx.dataIndex];
            const pct = reportData?.summary?.total_expenses > 0
              ? ((pm.total / reportData.summary.total_expenses) * 100).toFixed(1)
              : 0;
            return ` ${fmt(pm.total)}  (${pct}%)`;
          },
        },
      },
    },
  };

  /* ── Column header helper ────────────────────────────────── */
  const TH = ({ colKey, label }) => (
    <th
      className={sortKey === colKey ? 'sorted' : ''}
      onClick={() => handleSort(colKey)}
    >
      {label}
      {' '}
      {sortKey === colKey
        ? <IconChevron dir={sortDir === 'asc' ? 'up' : 'down'} />
        : <IconSort />}
    </th>
  );

  /* ── Determine if paymentMethod filter is visible ─────────── */
  const showPmFilter = reportType !== 'invoices';

  /* ════════════════════════════════════════════════════════════
     Render
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="reports-page fade-in" id="reports-print-area">

      {/* ── Page Header ─────────────────────────────────────── */}
      <div className="reports-header">
        <div className="reports-header-left">
          <h1>
            <span className="icon-svg gradient-text"><IconReport /></span>
            Reports
          </h1>
          <p>Generate filtered financial reports from your expense and invoice data.</p>
        </div>

        {hasGenerated && (
          <div className="reports-export-btns">
            <button
              id="btn-export-csv"
              className="rpt-btn rpt-btn-outline"
              onClick={exportCSV}
              disabled={!hasGenerated}
            >
              <IconDownload /> Export CSV
            </button>
            <button
              id="btn-export-pdf"
              className="rpt-btn rpt-btn-outline"
              onClick={exportPDF}
              disabled={!hasGenerated || pdfLoading}
            >
              {pdfLoading ? (
                <>
                  <span className="reports-spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
                  Building PDF…
                </>
              ) : (
                <><IconPrint /> Export PDF</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Filter Panel ────────────────────────────────────── */}
      <div className="reports-filter-panel">
        <div className="filter-panel-title">
          <IconFilter /> Report Filters
        </div>

        <div className="filter-grid">
          {/* Report Type */}
          <div className="filter-field">
            <label className="filter-label" htmlFor="rpt-type">Report Type</label>
            <select
              id="rpt-type"
              className="filter-select"
              value={reportType}
              onChange={e => setReportType(e.target.value)}
            >
              <option value="expenses">Expenses Only</option>
              <option value="invoices">Invoices Only</option>
              <option value="both">Expenses + Invoices</option>
            </select>
          </div>

          {/* Date Preset */}
          <div className="filter-field">
            <label className="filter-label" htmlFor="rpt-date-preset">Date Range</label>
            <select
              id="rpt-date-preset"
              className="filter-select"
              value={datePreset}
              onChange={e => applyPreset(e.target.value)}
            >
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="this_year">This Year</option>
              <option value="all_time">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom dates (shown when preset = custom) */}
          {datePreset === 'custom' && (
            <>
              <div className="filter-field">
                <label className="filter-label" htmlFor="rpt-start">Start Date</label>
                <input
                  id="rpt-start"
                  type="date"
                  className="filter-input"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                />
              </div>
              <div className="filter-field">
                <label className="filter-label" htmlFor="rpt-end">End Date</label>
                <input
                  id="rpt-end"
                  type="date"
                  className="filter-input"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Category */}
          <div className="filter-field">
            <label className="filter-label" htmlFor="rpt-cat">Category</label>
            <select
              id="rpt-cat"
              className="filter-select"
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Payment Method (expenses / both only) */}
          {showPmFilter && (
            <div className="filter-field">
              <label className="filter-label" htmlFor="rpt-pm">Payment Method</label>
              <select
                id="rpt-pm"
                className="filter-select"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit Card</option>
                <option value="debit_card">Debit Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="upi">UPI</option>
                <option value="other">Other</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="filter-field filter-actions">
            <button
              id="btn-generate-report"
              className="generate-btn"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="reports-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Generating…
                </>
              ) : (
                <>
                  <IconPlay /> Generate Report
                </>
              )}
            </button>
            {hasGenerated && (
              <button className="reset-btn" onClick={handleReset} title="Reset filters">
                <IconReset />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="reports-error">
          ⚠ {error}
        </div>
      )}

      {/* ── Loading state ───────────────────────────────────── */}
      {loading && (
        <div className="reports-loading">
          <div className="reports-spinner" />
          <p>Fetching report data…</p>
        </div>
      )}

      {/* ── Prompt (not yet generated) ──────────────────────── */}
      {!loading && !hasGenerated && !error && (
        <div className="reports-prompt">
          <IconEmpty />
          <h3>No Report Generated Yet</h3>
          <p>
            Set your filters above and click{' '}
            <strong>Generate Report</strong> to view detailed financial analysis.
          </p>
        </div>
      )}

      {/* ── Report Results ──────────────────────────────────── */}
      {!loading && hasGenerated && (
        <div ref={resultsRef}>
          {/* ── KPI Cards ─────────────────────────────────── */}
          <div className="reports-kpi-row">
            <div className="rpt-kpi-card">
              <div className="rpt-kpi-icon blue"><IconWallet /></div>
              <div className="rpt-kpi-body">
                <div className="rpt-kpi-label">Total Amount</div>
                <div className="rpt-kpi-value">{fmt(reportData.summary.total_expenses)}</div>
                <div className="rpt-kpi-sub">across all transactions</div>
              </div>
            </div>

            <div className="rpt-kpi-card">
              <div className="rpt-kpi-icon green"><IconHash /></div>
              <div className="rpt-kpi-body">
                <div className="rpt-kpi-label">Total Transactions</div>
                <div className="rpt-kpi-value">{reportData.summary.total_transactions.toLocaleString()}</div>
                <div className="rpt-kpi-sub">in selected period</div>
              </div>
            </div>

            <div className="rpt-kpi-card">
              <div className="rpt-kpi-icon purple"><IconAvg /></div>
              <div className="rpt-kpi-body">
                <div className="rpt-kpi-label">Average Amount</div>
                <div className="rpt-kpi-value">{fmt(reportData.summary.avg_expense)}</div>
                <div className="rpt-kpi-sub">per transaction</div>
              </div>
            </div>

            <div className="rpt-kpi-card">
              <div className="rpt-kpi-icon amber"><IconTop /></div>
              <div className="rpt-kpi-body">
                <div className="rpt-kpi-label">Highest Transaction</div>
                <div className="rpt-kpi-value">{fmt(reportData.summary.highest_expense)}</div>
                <div className="rpt-kpi-sub">single transaction</div>
              </div>
            </div>
          </div>

          {/* ── Charts ────────────────────────────────────── */}
          {transactions.length > 0 && (
            <div className="reports-charts-grid">

              {/* Monthly Trend — full width */}
              <div className="rpt-chart-card reports-chart-wide">
                <div className="rpt-chart-header">
                  <div className="rpt-chart-title">Monthly Expense Trend</div>
                  <span className="rpt-chart-badge">{trendData.length} month{trendData.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="rpt-chart-canvas">
                  {trendData.length > 0 ? (
                    <Line key={`line-${chartKey.current}`} data={lineData} options={lineOptions} />
                  ) : (
                    <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
                      <p>Not enough data for trend chart.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Category Bar */}
              <div className="rpt-chart-card">
                <div className="rpt-chart-header">
                  <div className="rpt-chart-title">Category Breakdown</div>
                  <span className="rpt-chart-badge">{catData.length} categories</span>
                </div>
                <div className="rpt-chart-canvas">
                  {catData.length > 0 ? (
                    <Bar key={`bar-${chartKey.current}`} data={barData} options={barOptions} />
                  ) : (
                    <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
                      <p>No category data available.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method Doughnut */}
              <div className="rpt-chart-card">
                <div className="rpt-chart-header">
                  <div className="rpt-chart-title">Payment Methods</div>
                  <span className="rpt-chart-badge">{pmData.length} method{pmData.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="rpt-chart-canvas">
                  {pmData.length > 0 ? (
                    <Doughnut key={`donut-${chartKey.current}`} data={doughnutData} options={doughnutOptions} />
                  ) : (
                    <div className="empty-state" style={{ height: '100%', justifyContent: 'center' }}>
                      <p>No payment method data.</p>
                    </div>
                  )}
                </div>
                {pmData.length > 0 && (
                  <div className="pm-legend">
                    {pmData.map((p, i) => (
                      <div key={p.method} className="pm-legend-item">
                        <span className="pm-dot" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        {PAYMENT_METHOD_LABELS[p.method] || p.method}
                        {' '}
                        <span style={{ color: 'var(--text-muted)' }}>({fmt(p.total)})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Transaction Table ─────────────────────────── */}
          <div className="reports-table-card">
            <div className="rpt-table-header">
              <div className="rpt-table-title">Transaction Details</div>
              <div className="rpt-table-meta">
                <span className="rpt-table-count">
                  {sorted.length} transaction{sorted.length !== 1 ? 's' : ''}
                </span>
                <div className="rpt-sort-wrap">
                  Sort by
                  <select
                    className="rpt-sort-select"
                    value={`${sortKey}:${sortDir}`}
                    onChange={e => {
                      const [k, d] = e.target.value.split(':');
                      setSortKey(k); setSortDir(d); setPage(1);
                    }}
                  >
                    <option value="date:desc">Date (Newest)</option>
                    <option value="date:asc">Date (Oldest)</option>
                    <option value="amount:desc">Amount (High→Low)</option>
                    <option value="amount:asc">Amount (Low→High)</option>
                    <option value="vendor:asc">Vendor (A→Z)</option>
                    <option value="category:asc">Category (A→Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {sorted.length === 0 ? (
              <div className="empty-state">
                <IconEmpty />
                <h3>No Transactions Found</h3>
                <p>No data matches your selected filters for this period.</p>
              </div>
            ) : (
              <>
                <div className="rpt-scroll-wrap">
                  <table className="rpt-table">
                    <thead>
                      <tr>
                        <TH colKey="date"           label="Date"           />
                        <TH colKey="vendor"         label="Vendor / Client" />
                        <TH colKey="category"       label="Category"       />
                        <TH colKey="payment_method" label="Payment Method" />
                        <TH colKey="amount"         label="Amount"         />
                        <th>Description</th>
                        {reportType === 'both' && <th>Type</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((t, i) => (
                        <tr key={`${t.type}-${t.id}-${i}`}>
                          <td className="rpt-td-date">{t.date || '—'}</td>
                          <td className="rpt-td-vendor">{t.vendor || t.title || '—'}</td>
                          <td>
                            <span
                              className="rpt-cat-pill"
                              style={{
                                background: `${t.category_color}18`,
                                color: t.category_color || 'var(--text-secondary)',
                                border: `1px solid ${t.category_color || 'var(--border)'}40`,
                              }}
                            >
                              {t.category}
                            </span>
                          </td>
                          <td>
                            <span className="rpt-pm-badge">
                              {PAYMENT_METHOD_LABELS[t.payment_method] || t.payment_method}
                            </span>
                          </td>
                          <td className={`rpt-td-amount${t.type === 'invoice' ? ' invoice' : ''}`}>
                            {fmt(t.amount)}
                          </td>
                          <td>
                            <div className="rpt-td-desc" title={t.description || '—'}>
                              {t.description || '—'}
                            </div>
                          </td>
                          {reportType === 'both' && (
                            <td>
                              <span className={`rpt-type-badge ${t.type}`}>{t.type}</span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={reportType === 'both' ? 4 : 3} style={{ paddingLeft: 20, fontWeight: 700 }}>
                          Page Total ({paginated.length} rows)
                        </td>
                        <td className="rpt-td-amount" style={{ color: 'var(--text-primary)' }}>
                          {fmt(pageTotal)}
                        </td>
                        <td colSpan={reportType === 'both' ? 2 : 1} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="rpt-pagination">
                    <span className="rpt-page-info">
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} of {sorted.length}
                    </span>
                    <div className="rpt-page-btns">
                      <button
                        className="rpt-page-btn"
                        onClick={() => setPage(1)}
                        disabled={page === 1}
                        title="First page"
                      >«</button>
                      <button
                        className="rpt-page-btn"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >‹</button>

                      {/* Page number pills */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
                        let pg;
                        if (totalPages <= 5) pg = idx + 1;
                        else if (page <= 3)  pg = idx + 1;
                        else if (page >= totalPages - 2) pg = totalPages - 4 + idx;
                        else pg = page - 2 + idx;
                        if (pg < 1 || pg > totalPages) return null;
                        return (
                          <button
                            key={pg}
                            className={`rpt-page-btn ${page === pg ? 'active' : ''}`}
                            onClick={() => setPage(pg)}
                          >{pg}</button>
                        );
                      })}

                      <button
                        className="rpt-page-btn"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >›</button>
                      <button
                        className="rpt-page-btn"
                        onClick={() => setPage(totalPages)}
                        disabled={page === totalPages}
                        title="Last page"
                      >»</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
