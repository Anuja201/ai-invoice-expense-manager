/**
 * pages/Insights.jsx
 * AI Business Insights & Predictions Dashboard
 */

import { useState, useEffect } from 'react';
import { dashboardService } from '../services/api';
import api from '../services/api';
import { fmt } from '../utils/format';
import '../styles/Insights.css';

/* ── SVG Icons ─────────────────────────────────────────────── */
const IconBot = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8" y2="16" />
    <line x1="16" y1="16" x2="16" y2="16" />
  </svg>
);
const IconTrendUp = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
const IconIdea = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
);
const IconAlert = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
const IconRepeat = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
const IconPieChart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);
const IconCheckCircleLarge = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);
const IconEmptyBarChart = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
);

function HealthGauge({ score, grade, label }) {
  const angle = (score / 100) * 180;
  const color = score >= 85 ? '#10b981' : score >= 70 ? '#6366f1' : score >= 55 ? '#f59e0b' : '#ef4444';

  return (
    <div className="health-gauge-wrap">
      <svg viewBox="0 0 200 110" className="health-gauge-svg">
        <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="var(--border)" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M 10 100 A 90 90 0 0 1 190 100"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${(angle / 180) * 283} 283`}
          style={{ transition: 'stroke-dasharray 1s ease, stroke 0.5s' }}
        />
        <text x="100" y="90" textAnchor="middle" fill="var(--text-primary)" fontSize="28" fontWeight="800">{score}</text>
        <text x="100" y="106" textAnchor="middle" fill="var(--text-muted)" fontSize="10">Financial Health</text>
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
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', badge: '#f59e0b', badgeText: 'Warning' },
    success: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', badge: '#10b981', badgeText: 'Good' },
    info:    { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.2)', badge: '#6366f1', badgeText: 'Info' },
  };
  const style = typeStyles[insight.type] || typeStyles.info;

  return (
    <div
      className="insight-card glass-card slide-in-card"
      style={{ background: style.bg, borderColor: style.border, animationDelay: `${delay}s` }}
    >
      <div className="insight-card-header">
        <div className="insight-badge" style={{ background: `${style.badge}18`, color: style.badge }}>
          {style.badgeText} · {insight.priority}
        </div>
      </div>
      <h3 className="insight-title">{insight.title}</h3>
      <p className="insight-desc">{insight.description}</p>
      {insight.action && (
        <div className="insight-action">
          <span className="icon-svg" style={{ marginRight: 6 }}><IconIdea /></span>
          {insight.action}
        </div>
      )}
    </div>
  );
}

function PredictionBar({ label, value, max, index }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="pred-bar-row slide-in-right" style={{ animationDelay: `${index * 0.1}s` }}>
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
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="icon-svg gradient-text" style={{ paddingBottom: 2 }}><IconBot /></span>
          AI Business Insights
        </h1>
        <p>Machine learning analysis of your financial patterns and predictions.</p>
      </div>

      {/* Top section: Health + Prediction */}
      <div className="insights-top-grid">
        {/* Financial Health */}
        <div className="insights-card">
          <div className="insights-card-title">Financial Health Score</div>
          <HealthGauge score={healthScore} grade={healthGrade} label={healthLabel} />
          <div className="health-legend">
            <div className="health-legend-item"><span className="status-dot green" /> 85+ Excellent</div>
            <div className="health-legend-item"><span className="status-dot blue" /> 70+ Good</div>
            <div className="health-legend-item"><span className="status-dot amber" /> 55+ Fair</div>
            <div className="health-legend-item"><span className="status-dot red" /> Below Attention</div>
          </div>
        </div>

        {/* Next Month Prediction */}
        {prediction && (
          <div className="insights-card prediction-card">
            <div className="insights-card-title">
              <span className="icon-svg" style={{ color: 'var(--primary)', marginRight: 6 }}><IconTrendUp /></span>
              Next Month Forecast
            </div>
            {prediction.prediction > 0 ? (
              <>
                <div className="prediction-main">
                  <div className="prediction-value gradient-text">{fmt(prediction.prediction)}</div>
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
                <IconEmptyBarChart />
                <p>{prediction.message}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="insights-tabs">
        {[
          { id: 'insights',   icon: <IconIdea />,      label: `Insights (${insights.length})` },
          { id: 'anomalies',  icon: <IconAlert />,     label: `Anomalies (${anomalies.length})` },
          { id: 'duplicates', icon: <IconRepeat />,    label: `Duplicates (${duplicates.length})` },
          { id: 'budgets',    icon: <IconPieChart />,  label: `Budget Plan (${budgets.length})` },
        ].map(t => (
          <button
            key={t.id}
            className={`insights-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span className="icon-svg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Insights Tab */}
      {activeTab === 'insights' && (
        <div className="insights-grid">
          {insights.length === 0 ? (
            <div className="empty-state">
              <IconCheckCircleLarge />
              <h3>All Clear!</h3>
              <p>No issues detected. Your finances look perfectly healthy.</p>
            </div>
          ) : (
            insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} delay={i * 0.05} />
            ))
          )}
        </div>
      )}

      {/* Anomalies Tab */}
      {activeTab === 'anomalies' && (
        <div className="insights-table-section slide-in-card">
          <div className="insights-table-header">
            <h3>Unusual Expenses Detected</h3>
            <span className="method-badge">Method: Statistical z-score analysis</span>
          </div>
          {anomalies.length === 0 ? (
            <div className="empty-state">
              <IconCheckCircleLarge />
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
                    <td><span className="cat-tag">{a.category}</span></td>
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
        <div className="insights-table-section slide-in-card">
          <div className="insights-table-header">
            <h3>Potential Duplicate Expenses</h3>
            <span className="method-badge">Matching by amount + date + vendor</span>
          </div>
          {duplicates.length === 0 ? (
            <div className="empty-state">
              <IconCheckCircleLarge />
              <h3>No Duplicates Found</h3>
              <p>All expenses appear to be completely unique.</p>
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
        <div className="insights-table-section slide-in-card">
          <div className="insights-table-header">
            <h3>AI Budget Recommendations</h3>
            <span className="method-badge">Based on 6 months historical spending</span>
          </div>
          {budgets.length === 0 ? (
            <div className="empty-state">
              <IconEmptyBarChart />
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
                  index={i}
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
