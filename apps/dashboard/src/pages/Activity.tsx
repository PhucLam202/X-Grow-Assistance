import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { getGrowthReport, type GrowthReport } from '../api';

const PERIODS = [7, 14, 30, 60, 90] as const;

export default function Activity() {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<GrowthReport | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    getGrowthReport(days)
      .then(setData)
      .catch(() => setError('Failed to load activity'));
  }, [days]);

  if (error) return <div className="error-msg">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Activity</h2>
        <div className="period-selector">
          {PERIODS.map(p => (
            <button
              key={p}
              className={`period-btn ${days === p ? 'active' : ''}`}
              onClick={() => setDays(p)}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          <div className="chart-card full-width">
            <h3>Analyzed vs Actions</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={data.timeline} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12 }} />
                <Line type="monotone" dataKey="analyzed" stroke="var(--accent)" strokeWidth={2} dot={false} name="Analyzed" />
                <Line type="monotone" dataKey="actions" stroke="var(--accent2)" strokeWidth={2} dot={false} name="Actions" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-card full-width">
            <h3>Avg Latency (ms)</h3>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.timeline} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}
                  labelStyle={{ color: 'var(--text)' }}
                />
                <Bar dataKey="avgLatencyMs" fill="var(--accent)" name="Latency ms" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
