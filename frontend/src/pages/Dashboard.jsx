/**
 * pages/Dashboard.jsx
 * Main dashboard with summary cards, charts, and recent transactions
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { dashboardService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import '../styles/Dashboard.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
);

const fmt = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sumRes, monthRes, catRes, recentRes] = await Promise.all([
          dashboardService.getSummary(),
          dashboardService.getMonthlyChart(),
          dashboardService.getCategoryChart(),
          dashboardService.getRecentTransactions(),
        ]);
        setSummary(sumRes.data);
        setMonthlyData(monthRes.data);
        setCategoryData(catRes.data);
        setRecent(recentRes.data.transactions);
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
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ width:32, height:32, border:'3px solid var(--border)', borderTopColor:'var(--primary)', borderRadius:'50%', animation:'spin 0.7s linear infinite', margin:'0 auto 12px' }} />
          <p style={{ color:'var(--text-muted)', fontSize:14 }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // Prepare bar chart data
  const barData = monthlyData ? (() => {
    const allMonths = [...new Set([
      ...monthlyData.expenses.map(e => e.month),
      ...monthlyData.invoices.map(i => i.month)
    ])].sort();

    const expMap = Object.fromEntries(monthlyData.expenses.map(e => [e.month, e.total]));
    const invMap = Object.fromEntries(monthlyData.invoices.map(i => [i.month, i.total]));

    return {
      labels: allMonths.map(m => {
        const [y, mo] = m.split('-');
        return new Date(+y, +mo - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
      }),
      datasets: [
        {
          label: 'Invoices',
          data: allMonths.map(m => invMap[m] || 0),
          backgroundColor: 'rgba(37,99,235,0.85)',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Expenses',
          data: allMonths.map(m => expMap[m] || 0),
          backgroundColor: 'rgba(239,68,68,0.75)',
          borderRadius: 6,
          borderSkipped: false,
        },
      ]
    };
  })() : null;

  // Prepare donut chart data
  const donutData = categoryData?.categories?.length ? {
    labels: categoryData.categories.map(c => c.category),
    datasets: [{
      data: categoryData.categories.map(c => c.total),
      backgroundColor: categoryData.categories.map(c => c.color || '#4F46E5'),
      borderWidth: 2,
      borderColor: '#fff',
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        padding: 10,
        cornerRadius: 8,
        callbacks: { label: ctx => ` ₹${ctx.parsed.y?.toLocaleString() || ctx.parsed}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94A3B8' } },
      y: { grid: { color: '#F1F5F9' }, ticks: { font: { size: 11 }, color: '#94A3B8', callback: v => `₹${(v/1000).toFixed(0)}k` } }
    }
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { font: { size: 11 }, color: '#475569', padding: 12, boxWidth: 10 }
      },
      tooltip: {
        backgroundColor: '#0F172A',
        callbacks: { label: ctx => ` ₹${ctx.parsed.toLocaleString()}` }
      }
    },
    cutout: '65%',
  };

  const growthDir = (summary?.monthly_growth || 0) >= 0 ? 'up' : 'down';
  const growthLabel = `${summary?.monthly_growth >= 0 ? '+' : ''}${summary?.monthly_growth || 0}%`;

  return (
    <div className="dashboard fade-in">
      <div className="dashboard-header">
        <h1>Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋</h1>
        <p>Here's your financial overview for today.</p>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon blue">💰</div>
            <span className={`stat-badge ${growthDir}`}>{growthLabel} MoM</span>
          </div>
          <div className="stat-value">{fmt(summary?.total_expenses || 0)}</div>
          <div className="stat-label">Total Expenses</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon green">🧾</div>
            <span className="stat-badge neutral">{summary?.invoice_count || 0} total</span>
          </div>
          <div className="stat-value">{fmt(summary?.total_invoices || 0)}</div>
          <div className="stat-label">Total Invoiced</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon purple">✅</div>
            <span className="stat-badge up">Collected</span>
          </div>
          <div className="stat-value">{fmt(summary?.paid_invoices || 0)}</div>
          <div className="stat-label">Revenue Received</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon yellow">⏳</div>
            <span className="stat-badge neutral">{summary?.pending_invoices || 0} pending</span>
          </div>
          <div className="stat-value">{fmt(summary?.current_month_expenses || 0)}</div>
          <div className="stat-label">This Month's Spend</div>
        </div>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">Revenue vs Expenses</div>
              <div className="chart-subtitle">Last 6 months comparison</div>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'rgba(37,99,235,0.85)' }} />
                Invoices
              </div>
              <div className="legend-item">
                <div className="legend-dot" style={{ background: 'rgba(239,68,68,0.75)' }} />
                Expenses
              </div>
            </div>
          </div>
          <div style={{ height: 240 }}>
            {barData ? (
              <Bar data={barData} options={chartOptions} />
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">📊</div>
                <h3>No data yet</h3>
                <p>Add invoices and expenses to see charts</p>
              </div>
            )}
          </div>
        </div>

        <div className="chart-card">
          <div className="chart-header">
            <div>
              <div className="chart-title">By Category</div>
              <div className="chart-subtitle">Expense breakdown</div>
            </div>
          </div>
          <div style={{ height: 240 }}>
            {donutData ? (
              <Doughnut data={donutData} options={donutOptions} />
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">🍩</div>
                <h3>No categories yet</h3>
                <p>Start adding expenses</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="transactions-card">
        <div className="card-header">
          <div className="card-title">Recent Transactions</div>
          <Link to="/invoices" className="view-all-link">View all →</Link>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3>No transactions yet</h3>
            <p>Create your first invoice or add an expense to get started</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Name / Client</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((tx, i) => (
                  <tr key={i}>
                    <td>
                      <div className="tx-name">{tx.name}</div>
                    </td>
                    <td>
                      <span className="tx-type">{tx.type}</span>
                    </td>
                    <td>
                      <span className="category-pill" style={{ background: `${tx.category_color}18`, color: tx.category_color }}>
                        {tx.category || 'Uncategorized'}
                      </span>
                    </td>
                    <td>
                      <span className={`tx-amount ${tx.type}`}>
                        {tx.type === 'expense' ? '-' : '+'}{fmt(tx.amount)}
                      </span>
                    </td>
                    <td><span className={`status-badge ${tx.status}`}>{tx.status}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace", fontSize: 12 }}>
                      {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
