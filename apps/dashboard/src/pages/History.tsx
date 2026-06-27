import { useState, useEffect, useCallback } from 'react';
import { getCommentHistory, type CommentHistoryItem } from '../api';

function DetailPanel({
  item,
  siblings,
  onClose,
  onSelect,
}: {
  item: CommentHistoryItem;
  siblings: CommentHistoryItem[];
  onClose: () => void;
  onSelect: (item: CommentHistoryItem) => void;
}) {
  const postUrl = item.postUrl ?? (item.tweetId ? `https://x.com/i/web/status/${item.tweetId}` : null);
  const lastAction = item.actions.at(-1);

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div className="detail-panel" onClick={e => e.stopPropagation()}>
        <div className="detail-header">
          <h3>Comment Detail</h3>
          <button className="detail-close" onClick={onClose}>✕</button>
        </div>

        <div className="detail-body">
          {/* Post */}
          <section className="detail-section">
            <div className="detail-section-title">Post</div>
            {item.authorName && (
              <div className="detail-row">
                <span className="detail-key">Author</span>
                <span className="detail-val">
                  {item.authorName}
                  {item.username && <span className="detail-username"> @{item.username}</span>}
                </span>
              </div>
            )}
            {postUrl && (
              <div className="detail-row">
                <span className="detail-key">Link</span>
                <a href={postUrl} target="_blank" rel="noopener noreferrer" className="detail-link">
                  Open on X ↗
                </a>
              </div>
            )}
            {item.postText && <div className="detail-post-text">{item.postText}</div>}
            {item.media.length > 0 && (
              <div className="detail-media">
                {item.media.map((m, i) =>
                  m.mediaUrl ? <img key={i} src={m.mediaUrl} alt={m.altText ?? ''} className="detail-thumb" /> : null
                )}
              </div>
            )}
          </section>

          {/* Analysis */}
          {item.analysis && (
            <section className="detail-section">
              <div className="detail-section-title">Post Analysis</div>
              {item.analysis.topic && (
                <div className="detail-row">
                  <span className="detail-key">Topic</span>
                  <span className="detail-val">{item.analysis.topic}</span>
                </div>
              )}
              {item.analysis.intent && (
                <div className="detail-row">
                  <span className="detail-key">Intent</span>
                  <span className="detail-val">{item.analysis.intent}</span>
                </div>
              )}
              {item.analysis.commentStrategy && (
                <div className="detail-row">
                  <span className="detail-key">Strategy</span>
                  <span className="detail-val">{item.analysis.commentStrategy}</span>
                </div>
              )}
              {item.analysis.textSummary && (
                <div className="detail-summary">{item.analysis.textSummary}</div>
              )}
            </section>
          )}

          {/* All suggestions for this post */}
          {siblings.length > 0 && (
            <section className="detail-section">
              <div className="detail-section-title">
                Other suggestions for this post ({siblings.length})
              </div>
              <div className="sibling-list">
                {siblings.map(s => (
                  <div
                    key={s.suggestionId}
                    className={`sibling-item ${s.used ? 'used' : ''}`}
                    onClick={() => onSelect(s)}
                  >
                    <div className="sibling-meta">
                      <span className="tone-tag">{s.tone}</span>
                      {s.optimizationScore != null && (
                        <span className="score-tag">{s.optimizationScore.toFixed(2)}</span>
                      )}
                      {s.used && <span className="used-badge yes">Used</span>}
                    </div>
                    <p className="sibling-text">{s.text}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* This comment */}
          <section className="detail-section">
            <div className="detail-section-title">This Comment</div>
            <div className="detail-row">
              <span className="detail-key">Tone</span>
              <span className="detail-val">{item.tone}</span>
            </div>
            <div className="detail-row">
              <span className="detail-key">Language</span>
              <span className="detail-val">{item.language}</span>
            </div>
            {item.optimizationScore != null && (
              <div className="detail-row">
                <span className="detail-key">Score</span>
                <span className="detail-val">{item.optimizationScore.toFixed(2)}</span>
              </div>
            )}
            {item.meaningVi && (
              <div className="detail-row">
                <span className="detail-key">Meaning</span>
                <span className="detail-val">{item.meaningVi}</span>
              </div>
            )}
            <div className="detail-comment-text">{item.text}</div>
            {item.optimizationReason && item.optimizationReason.length > 0 && (
              <ul className="detail-reasons">
                {item.optimizationReason.map((r, i) => <li key={i}>✓ {r}</li>)}
              </ul>
            )}
            {item.avoidReason && item.avoidReason.length > 0 && (
              <ul className="detail-reasons" style={{ color: 'var(--danger)' }}>
                {item.avoidReason.map((r, i) => <li key={i}>✕ {r}</li>)}
              </ul>
            )}
          </section>

          {/* Actions */}
          <section className="detail-section">
            <div className="detail-section-title">Actions Taken</div>
            {item.actions.length === 0 ? (
              <span className="detail-empty">No actions recorded</span>
            ) : (
              <div className="detail-actions">
                {item.actions.map((a, i) => (
                  <div key={i} className="detail-action-row">
                    <span className="action-type">{a.actionType}</span>
                    <span className="action-time">{new Date(a.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="detail-footer">
            <span>Generated {new Date(item.createdAt).toLocaleString()}</span>
            {lastAction && <span>Last action: <strong>{lastAction.actionType}</strong></span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function History() {
  const [items, setItems] = useState<CommentHistoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CommentHistoryItem | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params: { limit?: number; used?: boolean } = { limit: 100 };
    if (filter === 'used') params.used = true;
    if (filter === 'unused') params.used = false;
    getCommentHistory(params)
      .then(res => setItems(res.items))
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selected]);

  const filtered = items.filter(i => {
    if (search && !i.text.toLowerCase().includes(search.toLowerCase())
      && !i.postText?.toLowerCase().includes(search.toLowerCase())
      && !i.authorName?.toLowerCase().includes(search.toLowerCase())) return false;
    if (dateFilter && !i.createdAt.startsWith(dateFilter)) return false;
    return true;
  });

  // Unique dates for quick-select chips
  const uniqueDates = [...new Set(items.map(i => i.createdAt.slice(0, 10)))].sort().reverse().slice(0, 7);

  const siblings = selected
    ? items.filter(i => i.postId === selected.postId && i.suggestionId !== selected.suggestionId)
    : [];

  return (
    <div className="page">
      <div className="page-header">
        <h2>Comment History <span className="count">({filtered.length})</span></h2>
      </div>

      <div className="history-controls">
        <input
          type="search"
          placeholder="Search comments, posts, authors…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <div className="filter-group">
          {(['all', 'used', 'unused'] as const).map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Date chips */}
      {uniqueDates.length > 0 && (
        <div className="date-chips">
          <button
            className={`date-chip ${dateFilter === '' ? 'active' : ''}`}
            onClick={() => setDateFilter('')}
          >
            All dates
          </button>
          {uniqueDates.map(d => (
            <button
              key={d}
              className={`date-chip ${dateFilter === d ? 'active' : ''}`}
              onClick={() => setDateFilter(dateFilter === d ? '' : d)}
            >
              {new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </button>
          ))}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {loading && <div className="loading">Loading…</div>}

      {!loading && (
        <div className="history-list">
          {filtered.length === 0 ? (
            <p className="no-data">No comments found</p>
          ) : (
            filtered.map(item => (
              <div
                key={item.suggestionId}
                className={`history-item ${item.used ? 'used' : 'unused'} clickable`}
                onClick={() => setSelected(item)}
              >
                <div className="history-meta">
                  <span className={`used-badge ${item.used ? 'yes' : 'no'}`}>
                    {item.used ? 'Used' : 'Not used'}
                  </span>
                  <span className="tone-tag">{item.tone}</span>
                  <span className="lang-tag">{item.language}</span>
                  {item.optimizationScore != null && (
                    <span className="score-tag">{item.optimizationScore.toFixed(2)}</span>
                  )}
                  {item.actions.length > 0 && (
                    <span className="action-badge">{item.actions.at(-1)!.actionType}</span>
                  )}
                  <span className="date-tag">{new Date(item.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="history-text">{item.text}</p>
                {item.postText && (
                  <p className="post-snippet">
                    {item.authorName && <strong>{item.authorName}: </strong>}
                    {item.postText.slice(0, 120)}{item.postText.length > 120 ? '…' : ''}
                  </p>
                )}
                {item.analysis?.topic && (
                  <p className="post-snippet" style={{ marginTop: 2 }}>
                    Topic: {item.analysis.topic}
                    {item.analysis.intent && ` · ${item.analysis.intent}`}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {selected && (
        <DetailPanel
          item={selected}
          siblings={siblings}
          onClose={() => setSelected(null)}
          onSelect={setSelected}
        />
      )}
    </div>
  );
}
