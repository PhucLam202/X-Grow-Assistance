import { useState } from 'react';
import { draftPost } from '../api';

const LANGUAGES = [
  { value: 'ja', label: 'Japanese (日本語)' },
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
];

export default function PostDraft() {
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('ja');
  const [count, setCount] = useState(2);
  const [drafts, setDrafts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDrafts([]);
    try {
      const res = await draftPost({ topic: topic.trim() || undefined, language, count });
      setDrafts(res.drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, idx: number) {
    void navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Post Draft Generator</h2>
      </div>
      <p className="draft-desc">
        Generates native-sounding posts based on your collected data — vocabulary, style, and nuance learned from accounts you follow.
      </p>

      <form className="draft-form" onSubmit={handleGenerate}>
        <div className="draft-form-row">
          <label className="draft-label">Topic <span className="optional">(optional)</span></label>
          <input
            type="text"
            className="search-input"
            placeholder="e.g. AI, anime, daily reflection…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
        </div>

        <div className="draft-form-row">
          <label className="draft-label">Output language</label>
          <div className="filter-group">
            {LANGUAGES.map(l => (
              <button
                key={l.value}
                type="button"
                className={`filter-btn ${language === l.value ? 'active' : ''}`}
                onClick={() => setLanguage(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        <div className="draft-form-row">
          <label className="draft-label">Drafts</label>
          <div className="filter-group">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                type="button"
                className={`filter-btn ${count === n ? 'active' : ''}`}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" className="draft-generate-btn" disabled={loading}>
          {loading ? 'Generating…' : 'Generate drafts'}
        </button>
      </form>

      {error && <div className="error-msg">{error}</div>}

      {drafts.length > 0 && (
        <div className="draft-results">
          {drafts.map((draft, i) => (
            <div key={i} className="draft-card">
              <div className="draft-card-header">
                <span className="draft-num">Draft {i + 1}</span>
                <button
                  className={`copy-btn ${copied === i ? 'copied' : ''}`}
                  onClick={() => copy(draft, i)}
                >
                  {copied === i ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="draft-text">{draft}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
