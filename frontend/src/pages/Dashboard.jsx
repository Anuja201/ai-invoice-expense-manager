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

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [monthlyData, setMonthlyData] = useState(null);
  const [categoryData, setCategoryData] = useState(null);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [timeRange, setTimeRange] = useState('6M');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sumRes, monthRes, catRes, transRes] = await Promise.allSettled([
          dashboardService.getSummary(),
          dashboardService.getMonthlyChart(),
          dashboardService.getCategoryChart(),
          transactionService?.getRecent ? transactionService.getRecent() : Promise.resolve({ data: [] })
        ]);

        if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data);
        if (monthRes.status === 'fulfilled') setMonthlyData(monthRes.value.data);
        if (catRes.status === 'fulfilled') setCategoryData(catRes.value.data);
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
        <div className="spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // Multi-line / Area Chart Data for Expense Trends
  const trendLabels = monthlyData?.expenses?.map(e => e.month) || [];
  const trendData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Expenses',
        data: monthlyData?.expenses?.map(e => e.total) || [],
        borderColor: '#EF4444',
        backgroundColor: 'rgba(239, 68, 68, 0.08)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Invoices',
        data: monthlyData?.invoices?.map(i => i.total) || [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.08)',
        fill: true,
        tension: 0.3,
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
        callbacks: { label: ctx => ` ${fmt(ctx.parsed.y)}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#94A3B8' } },
      y: {
        grid: { color: '#F1F5F9' },
        ticks: { font: { size: 11 }, color: '#94A3B8' }
      }
    }
  };

  const categoryLabels = categoryData?.categories?.length ? categoryData.categories.map(c => c.category) : ['No Data'];
  const categoryColors = categoryData?.categories?.length ? categoryData.categories.map(c => c.color || '#3B82F6') : ['#E2E8F0'];

  const donutData = {
    labels: categoryLabels,
    datasets: [{
      data: categoryData?.categories?.length ? categoryData.categories.map(c => c.total) : [1],
      backgroundColor: categoryColors,
      borderWidth: 2,
      borderColor: '#ffffff',
    }]
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0F172A',
        callbacks: { label: ctx => ` ${fmt(ctx.parsed)}` }
      }
    },
    cutout: '70%',
  };

  const displayTransactions = recentTransactions || [];

  return (
    <div className="dashboard-container">
      {/* Summary Cards */}
      <div className="stats-row">
        <div className="summary-card">
          <div className="card-icon red-bg">📉</div>
          <div className="card-info">
            <span className="card-title">Total Expenses</span>
            <div className="card-value-row">
              <span className="card-value">{fmt(summary?.total_expenses || 0)}</span>
              {summary?.monthly_growth > 0 ? (
                <span className="badge badge-up">▲ {summary?.monthly_growth}%</span>
              ) : summary?.monthly_growth < 0 ? (
                <span className="badge badge-down">▼ {Math.abs(summary?.monthly_growth)}%</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon green-bg">💵</div>
          <div className="card-info">
            <span className="card-title">Total Invoiced</span>
            <div className="card-value-row">
              <span className="card-value">{fmt(summary?.total_invoices || 0)}</span>
              <span className="badge badge-up">{summary?.invoice_count || 0} Invoices</span>
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon blue-bg">✅</div>
          <div className="card-info">
            <span className="card-title">Paid Invoices</span>
            <div className="card-value-row">
              <span className="card-value">{fmt(summary?.paid_invoices || 0)}</span>
            </div>
          </div>
        </div>

        <div className="summary-card">
          <div className="card-icon purple-bg">⏳</div>
          <div className="card-info">
            <span className="card-title">Pending Invoices</span>
            <div className="card-value-row">
              <span className="card-value">{summary?.pending_invoices || 0} Pending</span>
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
        <h3 className="card-heading">Recent Transactions</h3>
        <table className="transactions-table">
          <thead>
            <tr>
              <th>DESCRIPTION</th>
              <th>CATEGORY</th>
              <th>AMOUNT</th>
              <th>STATUS</th>
              <th>DATE</th>
            </tr>
          </thead>
          <tbody>
            {displayTransactions.map((tx, idx) => (
              <tr key={idx}>
                <td className="desc-cell">{tx.description}</td>
                <td className="cat-cell">{tx.category}</td>
                <td className={`amount-cell ${tx.amount < 0 || tx.type === 'expense' ? 'red' : 'green'}`}>
                  {tx.type === 'invoice' ? `+${fmt(Math.abs(tx.amount))}` : fmt(Math.abs(tx.amount))}
                </td>
                <td>
                  <span className={`status-badge ${tx.status?.toLowerCase() || 'completed'}`}>
                    {tx.status === 'Completed' && '✔ '}
                    {tx.status === 'Pending' && '⚙ '}
                    {tx.status || 'Completed'}
                  </span>
                </td>
                <td className="date-cell">{tx.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}