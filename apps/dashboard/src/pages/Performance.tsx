import { useState, useEffect } from 'react';
import { getPersonalProfile, type PersonalProfile } from '../api';

function TagRow({ label, items, accent }: { label: string; items: string[]; accent?: boolean }) {
  return (
    <div className="perf-row">
      <span className="perf-row-label">{label}</span>
      <div className="tag-list">
        {items.length === 0
          ? <span className="no-data">—</span>
          : items.map(n => <span key={n} className={`tag ${accent ? 'accent' : ''}`}>{n}</span>)
        }
      </div>
    </div>
  );
}

const EMPTY_PROFILE: PersonalProfile = {
  targetNiches: [], strongNiches: [], weakNiches: [],
  preferredLanguages: [], bestLanguages: [],
  tonePreferences: [], successfulTones: [],
  accountWatchlist: [], commentMemory: null,
};

export default function Performance() {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getPersonalProfile()
      .then(setProfile)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading performance…</div>;
  if (error) return <div className="error-msg">{error}</div>;

  const p = profile ?? EMPTY_PROFILE;
  const mem = p.commentMemory;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Performance</h2>
      </div>

      <div className="perf-grid">
        <div className="chart-card">
          <h3>Niches</h3>
          <TagRow label="Targeting" items={p.targetNiches} />
          <TagRow label="Strong" items={p.strongNiches} accent />
          <TagRow label="Weak" items={p.weakNiches} />
        </div>

        <div className="chart-card">
          <h3>Language & Tone</h3>
          <TagRow label="Languages" items={p.preferredLanguages} />
          <TagRow label="Best" items={p.bestLanguages} accent />
          <TagRow label="Tones" items={p.tonePreferences} />
          <TagRow label="Successful" items={p.successfulTones} accent />
        </div>
      </div>

      <div className="chart-card">
        <h3>Account Watchlist</h3>
        {p.accountWatchlist.length === 0 ? (
          <p className="no-data">No accounts tracked yet — analyze posts to build your watchlist</p>
        ) : (
          <table className="accounts-table">
            <thead>
              <tr><th>Account</th><th>Priority</th><th>Score</th></tr>
            </thead>
            <tbody>
              {p.accountWatchlist.map(a => (
                <tr key={a.username}>
                  <td>
                    <a
                      href={`https://x.com/${a.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="username"
                    >
                      @{a.username}
                    </a>
                  </td>
                  <td>
                    <span className={`priority-badge ${a.priority === 'high' ? 'p1' : a.priority === 'medium' ? 'p2' : 'p3'}`}>
                      {a.priority}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{a.successScore.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {mem && (
        <div className="chart-card">
          <h3>Comment Style Memory</h3>
          <TagRow label="Pref. lang" items={mem.preferredLanguages} />
          <TagRow label="Pref. tones" items={mem.preferredTones} accent />
          <TagRow label="Post types" items={mem.commonPostTypes} />
          {mem.styleNotes && (
            <div className="perf-row" style={{ marginTop: 8 }}>
              <span className="perf-row-label">Style notes</span>
              <p className="style-text">{mem.styleNotes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
