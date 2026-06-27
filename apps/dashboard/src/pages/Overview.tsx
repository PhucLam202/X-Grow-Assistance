import { useState, useEffect } from 'react';
import { getGrowthReport, type GrowthReport } from '../api';

export default function Overview() {
  const [data, setData] = useState<GrowthReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getGrowthReport(30)
      .then(setData)
      .catch(() => setError('Failed to load overview'));
  }, []);

  if (error) return <div className="error-msg">{error}</div>;
  if (!data) return <div className="loading">Loading overview…</div>;

  const { totals, toneBreakdown, actionTypeBreakdown, timeline } = data;
  const maxTone = Math.max(...toneBreakdown.map(t => t.count), 1);
  const maxAction = Math.max(...actionTypeBreakdown.map(a => a.count), 1);

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = timeline.find(t => t.date === today);

  return (
    <div className="page">
      <h2>Overview — last 30 days</h2>

      {/* Today's briefing */}
      <div className="today-briefing">
        <div className="today-title">Today — {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        <div className="today-stats">
          <div className="today-stat">
            <span className="today-num">{todayStats?.analyzed ?? 0}</span>
            <span className="today-label">posts analyzed</span>
          </div>
          <div className="today-divider" />
          <div className="today-stat">
            <span className="today-num">{todayStats?.actions ?? 0}</span>
            <span className="today-label">comments used</span>
          </div>
          <div className="today-divider" />
          <div className="today-stat">
            <span className="today-num">{todayStats?.avgLatencyMs ? `${(todayStats.avgLatencyMs / 1000).toFixed(1)}s` : '—'}</span>
            <span className="today-label">avg AI latency</span>
          </div>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Posts Analyzed</span>
          <span className="stat-value">{totals.analyzed}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Comments Used</span>
          <span className="stat-value">{totals.actions}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Usage Rate</span>
          <span className="stat-value">{totals.usageRate}x</span>
        </div>
      </div>

      <div className="charts-row">
        <div className="chart-card">
          <h3>Tone Breakdown</h3>
          {toneBreakdown.length === 0 ? (
            <p className="no-data">No data yet</p>
          ) : (
            <div className="bar-list">
              {toneBreakdown.map(t => (
                <div key={t.tone} className="bar-row">
                  <span className="bar-label">{t.tone}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill"
                      style={{ width: `${(t.count / maxTone) * 100}%` }}
                    />
                  </div>
                  <span className="bar-count">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="chart-card">
          <h3>Action Type Breakdown</h3>
          {actionTypeBreakdown.length === 0 ? (
            <p className="no-data">No data yet</p>
          ) : (
            <div className="bar-list">
              {actionTypeBreakdown.map(a => (
                <div key={a.actionType} className="bar-row">
                  <span className="bar-label">{a.actionType}</span>
                  <div className="bar-track">
                    <div
                      className="bar-fill accent2"
                      style={{ width: `${(a.count / maxAction) * 100}%` }}
                    />
                  </div>
                  <span className="bar-count">{a.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
