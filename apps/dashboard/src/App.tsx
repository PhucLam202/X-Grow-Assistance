import { useState, useEffect } from 'react';
import { login, getMe, type AuthUser } from './api';
import Overview from './pages/Overview';
import Activity from './pages/Activity';
import Performance from './pages/Performance';
import History from './pages/History';

type Tab = 'overview' | 'activity' | 'performance' | 'history';

const TABS: Tab[] = ['overview', 'activity', 'performance', 'history'];

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview',    label: 'Overview',    icon: '◻' },
  { id: 'activity',   label: 'Activity',    icon: '◈' },
  { id: 'performance',label: 'Performance', icon: '◇' },
  { id: 'history',    label: 'History',     icon: '◉' },
];

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return TABS.includes(h) ? h : 'overview';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (localStorage.getItem('accessToken')) {
      getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('accessToken'))
        .finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    function onHash() {
      const h = window.location.hash.slice(1) as Tab;
      if (TABS.includes(h)) setTab(h);
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  function navigate(t: Tab) {
    setTab(t);
    window.location.hash = t;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const me = await getMe();
      setUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('accessToken');
    setUser(null);
  }

  if (checking) return <div className="loading-screen">Loading…</div>;

  if (!user) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>X Comment Assistant</h1>
          <p className="login-subtitle">Analytics Dashboard</p>
          <form onSubmit={handleLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-top">
          <span className="logo">XCA</span>
        </div>
        <ul className="sidebar-nav">
          {NAV.map(n => (
            <li key={n.id}>
              <button
                className={`nav-btn ${tab === n.id ? 'active' : ''}`}
                onClick={() => navigate(n.id)}
              >
                <span className="nav-icon">{n.icon}</span>
                <span className="nav-label">{n.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-bottom">
          <span className="user-email">{user.email ?? user.userId}</span>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </nav>
      <main className="app-main">
        {tab === 'overview'    && <Overview />}
        {tab === 'activity'   && <Activity />}
        {tab === 'performance' && <Performance />}
        {tab === 'history'    && <History />}
      </main>
    </div>
  );
}
