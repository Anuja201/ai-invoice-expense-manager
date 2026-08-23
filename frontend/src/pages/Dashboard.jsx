// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { dashboardService, transactionService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { fmt } from '../utils/format';
import '../styles/Dashboard.css';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
);

/* ── Inline SVG stat icons ─────────────────────────────────── */
const IconTrend = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const IconReceipt = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
  </svg>
);

const IconCheckCircle = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconClock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary]                     = useState(null);
  const [monthlyData, setMonthlyData]             = useState(null);
  const [categoryData, setCategoryData]           = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [timeRange, setTimeRange]                 = useState('6M');
  const [loading, setLoading]                     = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sumRes, monthRes, catRes, transRes] = await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getMonthlyChart(),
          dashboardService.getCategoryChart(),
          transactionService?.getRecent ? transactionService.getRecent() : Promise.resolve({ data: [] })
        ]);

        if (sumRes.status   === 'fulfilled') setSummary(sumRes.value.data);
        if (monthRes.status === 'fulfilled') setMonthlyData(monthRes.value.data);
        if (catRes.status   === 'fulfilled') setCategoryData(catRes.value.data);
        if (transRes.status === 'fulfilled') setRecentTransactions(transRes.value.data.transactions || []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="dashboard-spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  // ── Chart Data ────────────────────────────────────────────
  const trendLabels = monthlyData?.expenses?.map(e => e.month) || [];
  const trendData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Expenses',
        data: monthlyData?.expenses?.map(e => e.total) || [],
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.07)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#EF4444',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      },
      {
        label: 'Invoices',
        data: monthlyData?.invoices?.map(i => i.total) || [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.07)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
      }
    ]
  };

  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        titleColor: '#94A3B8',
        bodyColor: '#F8FAFC',
        padding: 10,
        cornerRadius: 8,
        callbacks: { label: ctx => ` ${fmt(ctx.parsed.y)}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94A3B8' } },
      y: {
        grid: { color: '#F1F5F9', drawBorder: false },
        ticks: { font: { size: 11 }, color: '#94A3B8' }
      }
    }
  };

  const categoryLabels = categoryData?.categories?.length
    ? categoryData.categories.map(c => c.category)
    : ['No Data'];
  const categoryColors = categoryData?.categories?.length
    ? categoryData.categories.map(c => c.color || '#3B82F6')
    : ['#E2E8F0'];

  const donutData = {
    labels: categoryLabels,
    datasets: [{
      data: categoryData?.categories?.length ? categoryData.categories.map(c => c.total) : [1],
      backgroundColor: categoryColors,
      borderWidth: 3,
      borderColor: '#ffffff',
      hoverBorderWidth: 3,
    }]
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        titleColor: '#94A3B8',
        bodyColor: '#F8FAFC',
        padding: 10,
        cornerRadius: 8,
        callbacks: { label: ctx => ` ${fmt(ctx.parsed)}` }
      }
    },
    cutout: '72%',
  };

  const displayTransactions = recentTransactions || [];

  // Status badge helper
  const getStatusClass = (status) => {
    const s = status?.toLowerCase() || 'completed';
    if (s === 'completed' || s === 'paid') return 'status-badge completed';
    if (s === 'pending')  return 'status-badge pending';
    if (s === 'overdue')  return 'status-badge overdue';
    return 'status-badge';
  };

  return (
    <div className="dashboard-container">
      {/* Summary Cards */}
      <div className="stats-row">
        <div className="summary-card slide-in-card" style={{ animationDelay: '0s' }}>
          <div className="card-icon red-bg">
            <IconTrend />
          </div>
          <div className="card-info">
            <span className="card-title">Total Expenses</span>
            <div className="card-value-row">
              <span className="card-value">{fmt(summary?.total_expenses || 0)}</span>
              {summary?.monthly_growth > 0 ? (
                <span className="badge badge-down">▲ {summary?.monthly_growth}%</span>
              ) : summary?.monthly_growth < 0 ? (
                <span className="badge badge-up">▼ {Math.abs(summary?.monthly_growth)}%</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="summary-card slide-in-card" style={{ animationDelay: '0.05s' }}>
          <div className="card-icon green-bg">
            <IconReceipt />
          </div>
          <div className="card-info">
            <span className="card-title">Total Invoiced</span>
            <div className="card-value-row">
              <span className="card-value">{fmt(summary?.total_invoices || 0)}</span>
              <span className="badge badge-up">{summary?.invoice_count || 0} Invoices</span>
            </div>
          </div>
        </div>

        <div className="summary-card slide-in-card" style={{ animationDelay: '0.1s' }}>
          <div className="card-icon blue-bg">
            <IconCheckCircle />
          </div>
          <div className="card-info">
            <span className="card-title">Paid Invoices</span>
            <div className="card-value-row">
              <span className="card-value">{fmt(summary?.paid_invoices || 0)}</span>
            </div>
          </div>
        </div>

        <div className="summary-card slide-in-card" style={{ animationDelay: '0.15s' }}>
          <div className="card-icon purple-bg">
            <IconClock />
          </div>
          <div className="card-info">
            <span className="card-title">Pending Invoices</span>
            <div className="card-value-row">
              <span className="card-value pending-value">{summary?.pending_invoices || 0}</span>
              <span className="card-sub">pending</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-row">
        <div className="card category-card">
          <h3 className="card-heading">Category Breakdown</h3>
          <div className="donut-container">
            <Doughnut data={donutData} options={donutOptions} />
          </div>
          <div className="custom-legend">
            {categoryLabels.map((label, i) => (
              <div className="legend-item" key={label}>
                <span className="legend-box" style={{ backgroundColor: categoryColors[i] }}></span>
                <span className="legend-label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card trends-card">
          <div className="trends-header">
            <h3 className="card-heading">Expense Trends</h3>
            <div className="pill-toggle">
              {['6M', 'YTD', 'All'].map(range => (
                <button
                  key={range}
                  className={`pill-btn ${timeRange === range ? 'active' : ''}`}
                  onClick={() => setTimeRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>
          <div className="line-chart-container">
            <Line data={trendData} options={trendOptions} />
          </div>
          <div className="line-legend">
            <span className="legend-item"><span className="legend-dot red"></span> Expenses</span>
            <span className="legend-item"><span className="legend-dot green"></span> Invoices</span>
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card transactions-card">
        <div className="transactions-header">
          <h3 className="card-heading" style={{ margin: 0 }}>Recent Transactions</h3>
          <span className="transactions-count">{displayTransactions.length} entries</span>
        </div>
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {displayTransactions.map((tx, idx) => (
              <tr key={idx}>
                <td className="desc-cell">{tx.description}</td>
                <td className="cat-cell">
                  <span className="cat-tag">{tx.category}</span>
                </td>
                <td className={`amount-cell ${tx.amount < 0 || tx.type === 'expense' ? 'red' : 'green'}`}>
                  {tx.type === 'invoice' ? `+${fmt(Math.abs(tx.amount))}` : fmt(Math.abs(tx.amount))}
                </td>
                <td>
                  <span className={getStatusClass(tx.status)}>
                    {tx.status || 'Completed'}
                  </span>
                </td>
                <td className="date-cell">{tx.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayTransactions.length === 0 && (
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <p>No recent transactions found.</p>
          </div>
        )}
      </div>
    </div>
  );
}