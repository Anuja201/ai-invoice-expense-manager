/**
 * pages/Insights.jsx
 * AI Business Insights & Predictions Dashboard
 */

import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import api from '../services/api';
import '../styles/Insights.css';

const fmt = (n) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

function HealthGauge({ score, grade, label }) {
  const angle = (score / 100) * 180;
  const color = score >= 85 ? '#10b981' : score >= 70 ? '#6366f1' : score >= 55 ? '#f59e0b' : '#ef4444';

  return (
    <div className="health-gauge-wrap">
      <svg viewBox="0 0 200 110" className="health-gauge-svg">
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="#1e293b" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 283} 283`}
          style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s' }}
        />
        <text x="100" y="90" textAnchor="middle" fill="#f8fafc" fontSize="28" fontWeight="800">{score}</text>
        <text x="100" y="106" textAnchor="middle" fill="#64748b" fontSize="10">Financial Health</text>
      </svg>
      <div className="health-grade" style={{ color }}>
        <span className="health-grade-letter">{grade}</span>
        <span className="health-grade-label">{label}</span>
      </div>
    </div>
  );
}

function InsightCard({ insight, delay }) {
  const typeStyles = {
    warning: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.25)', badge: '#f59e0b', badgeText: 'Warning' },
    success: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.25)', badge: '#10b981', badgeText: 'Good' },
    info: { bg: 'rgba(99,102,241,0.08)', border: 'rgba(99,102,241,0.2)', badge: '#6366f1', badgeText: 'Info' },
  };
  const style = typeStyles[insight.type] || typeStyles.info;

  return (
    <div
      className="insight-card"
      style={{ background: style.bg, borderColor: style.border, animationDelay: `${delay}s` }}
    >
      <div className="insight-card-header">
        <span className="insight-icon">{insight.icon}</span>
        <div className="insight-badge" style={{ background: `${style.badge}18`, color: style.badge }}>
          {style.badgeText} · {insight.priority}
        </div>
      </div>
      <h3 className="insight-title">{insight.title}</h3>
      <p className="insight-desc">{insight.description}</p>
      {insight.action && (
        <div className="insight-action">💡 {insight.action}</div>
      )}
    </div>
  );
}

function PredictionBar({ label, value, max }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="pred-bar-row">
      <span className="pred-bar-label">{label}</span>
      <div className="pred-bar-track">
        <div className="pred-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="pred-bar-value">{fmt(value)}</span>
    </div>
  );
}

export default function Insights() {
  const [insights, setInsights] = useState([]);
  const [healthScore, setHealthScore] = useState(0);
  const [healthGrade, setHealthGrade] = useState('A');
  const [healthLabel, setHealthLabel] = useState('Excellent');
  const [prediction, setPrediction] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [duplicates, setDuplicates] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('insights');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [insRes, predRes, anomRes, dupRes, budRes] = await Promise.all([
          api.get('/insights/'),
          api.get('/predictions/next-month'),
          api.get('/predictions/anomalies'),
          api.get('/predictions/duplicates'),
          api.get('/predictions/budget-recommendation'),
        ]);
        const ins = insRes.data;
        setInsights(ins.insights || []);
        setHealthScore(ins.financial_health_score || 0);
        setHealthGrade(ins.financial_health_grade || 'A');
        setHealthLabel(ins.financial_health_label || 'Excellent');
        setPrediction(predRes.data);
        setAnomalies(anomRes.data.anomalies || []);
        setDuplicates(dupRes.data.duplicates || []);
        setBudgets(budRes.data.recommendations || []);
      } catch (err) {
        console.error('Insights fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) {
    return (
      <div className="insights-loading">
        <div className="insights-spinner" />
        <p>Analyzing your financial data…</p>
      </div>
    );
  }

  const maxBudget = budgets.reduce((m, b) => Math.max(m, b.recommended_budget), 0);

  return (
    <div className="insights-page fade-in">
      <div className="insights-header">
        <h1>🤖 AI Business Insights</h1>
        <p>Machine learning analysis of your financial patterns and predictions.</p>
      </div>

      {/* Top section: Health + Prediction */}
      <div className="insights-top-grid">
        {/* Financial Health */}
        <div className="insights-card">
          <div className="insights-card-title">Financial Health Score</div>
          <HealthGauge score={healthScore} grade={healthGrade} label={healthLabel} />
          <div className="health-legend">
            <div className="health-legend-item"><span style={{ color: '#10b981' }}>●</span> 85+ Excellent</div>
            <div className="health-legend-item"><span style={{ color: '#6366f1' }}>●</span> 70+ Good</div>
            <div className="health-legend-item"><span style={{ color: '#f59e0b' }}>●</span> 55+ Fair</div>
            <div className="health-legend-item"><span style={{ color: '#ef4444' }}>●</span> Below Attention</div>
          </div>
        </div>

        {/* Next Month Prediction */}
        {prediction && (
          <div className="insights-card prediction-card">
            <div className="insights-card-title">📈 Next Month Forecast</div>
            {prediction.prediction > 0 ? (
              <>
                <div className="prediction-main">
                  <div className="prediction-value">{fmt(prediction.prediction)}</div>
                  <div className="prediction-label">Expected Expenses — {prediction.next_month}</div>
                </div>
                <div className="prediction-bounds">
                  <div className="pred-bound low">
                    <span>Lower</span>
                    <strong>{fmt(prediction.lower_bound)}</strong>
                  </div>
                  <div className="pred-bound mid">
                    <span>Predicted</span>
                    <strong>{fmt(prediction.prediction)}</strong>
                  </div>
                  <div className="pred-bound high">
                    <span>Upper</span>
                    <strong>{fmt(prediction.upper_bound)}</strong>
                  </div>
                </div>
                <div className="prediction-meta">
                  <div className="pred-meta-item">
                    <span>Trend</span>
                    <strong className={prediction.trend === 'increasing' ? 'trend-up' : prediction.trend === 'decreasing' ? 'trend-down' : ''}>
                      {prediction.trend === 'increasing' ? '↑' : prediction.trend === 'decreasing' ? '↓' : '→'} {prediction.trend}
                    </strong>
                  </div>
                  <div className="pred-meta-item">
                    <span>Confidence</span>
                    <strong>{prediction.confidence}%</strong>
                  </div>
                  <div className="pred-meta-item">
                    <span>Data Points</span>
                    <strong>{prediction.data_points} months</strong>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-insight">
                <div className="empty-insight-icon">📊</div>
                <p>{prediction.message}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="insights-tabs">
        {[
          { id: 'insights', label: `💡 Insights (${insights.length})` },
          { id: 'anomalies', label: `🚨 Anomalies (${anomalies.length})` },
          { id: 'duplicates', label: `🔁 Duplicates (${duplicates.length})` },
          { id: 'budgets', label: `💰 Budget Plan (${budgets.length})` },
        ].map(t => (
          <button
            key={t.id}
            className={`insights-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="insights-grid">
          {insights.length === 0 ? (
            <div className="empty-insights">
              <div className="empty-insight-icon">✨</div>
              <h3>All Clear!</h3>
              <p>No issues detected. Your finances look healthy.</p>
            </div>
          ) : (
            insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} delay={i * 0.07} />
            ))
          )}
        </div>
      )}

      {/* Anomalies Tab */}
      {activeTab === 'anomalies' && (
        <div className="insights-table-section">
          <div className="insights-table-header">
            <h3>Unusual Expenses Detected</h3>
            <span className="method-badge">Method: Statistical z-score analysis</span>
          </div>
          {anomalies.length === 0 ? (
            <div className="empty-insights">
              <div className="empty-insight-icon">✅</div>
              <h3>No Anomalies Found</h3>
              <p>All expenses appear within normal range.</p>
            </div>
          ) : (
            <table className="insights-table">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Vendor</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Z-Score</th>
                  <th>Deviation</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={i}>
                    <td><strong>{a.title}</strong></td>
                    <td>{a.vendor || '—'}</td>
                    <td>{a.category}</td>
                    <td className="amount-cell">{fmt(a.amount)}</td>
                    <td>
                      <span className="z-score-badge">{a.z_score}σ</span>
                    </td>
                    <td className={a.deviation_pct > 0 ? 'dev-positive' : 'dev-negative'}>
                      {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Duplicates Tab */}
      {activeTab === 'duplicates' && (
        <div className="insights-table-section">
          <div className="insights-table-header">
            <h3>Potential Duplicate Expenses</h3>
            <span className="method-badge">Matching by amount + date + vendor</span>
          </div>
          {duplicates.length === 0 ? (
            <div className="empty-insights">
              <div className="empty-insight-icon">✅</div>
              <h3>No Duplicates Found</h3>
              <p>All expenses appear unique.</p>
            </div>
          ) : (
            <div className="duplicates-list">
              {duplicates.map((d, i) => (
                <div key={i} className="duplicate-pair">
                  <div className="dup-confidence">
                    {Math.round(d.confidence * 100)}% match — {d.reason}
                  </div>
                  <div className="dup-expenses">
                    {[d.expense_1, d.expense_2].map((exp, j) => (
                      <div key={j} className="dup-expense">
                        <strong>{exp.title}</strong>
                        <span>{fmt(exp.amount)}</span>
                        <span>{exp.date}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Budgets Tab */}
      {activeTab === 'budgets' && (
        <div className="insights-table-section">
          <div className="insights-table-header">
            <h3>AI Budget Recommendations</h3>
            <span className="method-badge">Based on 6 months historical spending</span>
          </div>
          {budgets.length === 0 ? (
            <div className="empty-insights">
              <div className="empty-insight-icon">📊</div>
              <h3>Not Enough Data</h3>
              <p>Add more expenses to generate budget recommendations.</p>
            </div>
          ) : (
            <div className="budgets-list">
              {budgets.map((b, i) => (
                <PredictionBar
                  key={i}
                  label={b.category}
                  value={b.recommended_budget}
                  max={maxBudget}
                />
              ))}
              <div className="budget-total">
                <strong>Total Recommended Monthly Budget:</strong>
                <span>{fmt(budgets.reduce((s, b) => s + b.recommended_budget, 0))}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
