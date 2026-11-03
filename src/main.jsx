import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const request = async (path, { token, ...options } = {}) => {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
};

function Icon({ name, size = 20 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'sun') return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>;
  if (name === 'plus') return <svg {...common}><path d="M12 5v14m-7-7h14"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'trash') return <svg {...common}><path d="M3 6h18m-2 0-1 14H6L5 6m4 0V4h6v2m-5 4v6m4-6v6"/></svg>;
  if (name === 'arrow') return <svg {...common}><path d="M7 17 17 7M7 7h10v10"/></svg>;
  return null;
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('register');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const update = (event) => setValues({ ...values, [event.target.name]: event.target.value });
  const submit = async (event) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const data = await request(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(values) });
      onAuth(data);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <main className="auth-page">
    <div className="auth-left"><div className="brand"><span className="brand-mark"><Icon name="sun" size={19}/></span> daymark</div>
      <div className="auth-copy"><div className="eyebrow"><span className="eyebrow-line"/> A LITTLE MORE INTENTION</div><h1>Make room for<br/>what <em>matters.</em></h1><p>A calmer place for all the things you want to do. Start with one small step.</p>
        <div className="quote"><span className="quote-mark">“</span><div><p>It is not enough to be busy. So are the ants. The question is: What are we busy about?</p><small>HENRY DAVID THOREAU</small></div></div>
      </div><div className="auth-footer">A quieter kind of productivity <span>© DAYMARK 2026</span></div>
    </div>
    <div className="auth-right"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark"><Icon name="sun" size={18}/></span> daymark</div><div className="form-heading"><div className="eyebrow">YOUR NEXT CHAPTER</div><h2>{mode === 'register' ? 'A fresh start.' : 'Welcome back.'}</h2><p>{mode === 'register' ? 'Create your free account and find your flow.' : 'Sign in to pick up right where you left off.'}</p></div>
      <form onSubmit={submit} className="auth-form">{mode === 'register' && <label>Your name<input name="name" autoComplete="name" placeholder="Alex Morgan" value={values.name} onChange={update} required minLength="2" maxLength="80"/></label>}
        <label>Email address<input name="email" type="email" autoComplete="email" placeholder="you@example.com" value={values.email} onChange={update} required/></label>
        <label>Password<input name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} value={values.password} onChange={update} required minLength={mode === 'register' ? 8 : undefined} maxLength="128"/></label>
        {error && <div className="form-error" role="alert">{error}</div>}<button className="button button-dark auth-submit" disabled={busy}>{busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'}<Icon name="arrow" size={17}/></button>
      </form><div className="auth-switch">{mode === 'register' ? 'Already have an account?' : 'New to Daymark?'} <button onClick={() => { setError(''); setMode(mode === 'register' ? 'login' : 'register'); }}> {mode === 'register' ? 'Sign in' : 'Create account'}</button></div><div className="secure-note"><span>✳</span> Your plans are private, always.</div></div></div>
  </main>;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('daymark_token'));
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [date, setDate] = useState(new Date());
  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there';

  const logout = () => { localStorage.removeItem('daymark_token'); setToken(null); setUser(null); setTasks([]); };
  const acceptAuth = async (data) => { localStorage.setItem('daymark_token', data.token); setToken(data.token); setUser(data.user); };

  const load = async (authToken) => {
    try { const [me, taskData] = await Promise.all([request('/auth/me', { token: authToken }), request('/tasks', { token: authToken })]); setUser(me.user); setTasks(taskData.tasks); }
    catch { logout(); }
  };
  useEffect(() => { if (token) load(token); }, [token]);
  useEffect(() => { const timer = setInterval(() => setDate(new Date()), 60_000); return () => clearInterval(timer); }, []);

  const completed = tasks.filter((task) => task.completed).length;
  const visible = useMemo(() => tasks.filter((task) => filter === 'all' || (filter === 'open' ? !task.completed : task.completed)), [tasks, filter]);
  const addTask = async (event) => {
    event.preventDefault(); const title = draft.trim(); if (!title || !token) return;
    setBusy(true); setError('');
    try { const data = await request('/tasks', { token, method: 'POST', body: JSON.stringify({ title }) }); setTasks((items) => [data.task, ...items]); setDraft(''); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const toggleTask = async (task) => {
    try { const data = await request(`/tasks/${task.id}`, { token, method: 'PATCH', body: JSON.stringify({ completed: !task.completed }) }); setTasks((items) => items.map((item) => item.id === task.id ? data.task : item)); }
    catch (err) { setError(err.message); }
  };
  const deleteTask = async (id) => {
    const previous = tasks; setTasks((items) => items.filter((item) => item.id !== id)); setError('');
    try { await request(`/tasks/${id}`, { token, method: 'DELETE' }); } catch (err) { setTasks(previous); setError(err.message); }
  };

  if (!token) return <AuthScreen onAuth={acceptAuth}/>;
  if (!user) return <div className="loading"><span className="brand-mark"><Icon name="sun"/></span><span>Getting your day ready…</span></div>;
  const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(date);
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#top"><span className="brand-mark"><Icon name="sun" size={19}/></span> daymark</a><div className="side-label">YOUR SPACE</div><nav className="side-nav"><button className="nav-item active"><span className="nav-icon"><Icon name="check" size={17}/></span> My day <span className="nav-count">{tasks.filter((task) => !task.completed).length}</span></button></nav><div className="sidebar-bottom"><div className="side-note"><div className="note-spark">✳</div><div><strong>Slow is a pace.</strong><p>One thing at a time is still progress.</p></div></div><button className="user-menu" onClick={logout} title="Sign out"><span className="avatar">{firstName.slice(0, 1).toUpperCase()}</span><span className="user-copy"><strong>{user.name}</strong><small>Personal space</small></span><span className="logout-arrow">↗</span></button></div></aside>
    <main className="main-area" id="top"><header className="topbar"><span>MY DAY <span className="crumb-sep">/</span> OVERVIEW</span><div className="date-label"><span className="date-dot"/>{today}</div></header>
      <section className="content"><div className="welcome-row"><div><div className="eyebrow welcome-eye">A NEW DAY, A NEW POSSIBILITY</div><h1>Good {date.getHours() < 12 ? 'morning' : date.getHours() < 17 ? 'afternoon' : 'evening'}, {firstName}<span className="wave">✳</span></h1><p>Take a breath. Let's make today count.</p></div><div className="day-stamp"><span>{String(date.getDate()).padStart(2, '0')}</span><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(date).toUpperCase()}</small></div></div>
        <div className="progress-card"><div className="progress-copy"><span className="progress-icon"><Icon name="sun" size={19}/></span><div><strong>{completed === tasks.length && tasks.length > 0 ? 'Beautifully done.' : 'Your day, at your pace.'}</strong><p>{tasks.length === 0 ? 'A blank page can be a lovely thing.' : `${completed} of ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'} complete`}</p></div></div><div className="progress-right"><span>{tasks.length === 0 ? '0' : Math.round(completed / tasks.length * 100)}<small>%</small></span><div className="progress-track"><div style={{ width: `${tasks.length ? completed / tasks.length * 100 : 0}%` }}/></div></div></div>
        <section className="task-section"><div className="section-head"><div><div className="eyebrow">THE IMPORTANT THINGS</div><h2>Today’s focus<span className="task-total">{tasks.length}</span></h2></div><div className="filters" role="group" aria-label="Filter tasks">{[['all', 'All'], ['open', 'To do'], ['done', 'Done']].map(([key, label]) => <button key={key} className={filter === key ? 'filter active' : 'filter'} onClick={() => setFilter(key)}>{label}</button>)}</div></div>
          <form className="add-task" onSubmit={addTask}><span className="add-plus"><Icon name="plus" size={19}/></span><input aria-label="New task" placeholder="Add something to your day…" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength="160"/><button disabled={busy || !draft.trim()} aria-label="Add task"><Icon name="arrow" size={18}/></button></form>
          {error && <div className="inline-error" role="alert">{error}</div>}
          <div className="task-list">{visible.map((task) => <article className={`task-row ${task.completed ? 'completed' : ''}`} key={task.id}><button className="task-check" aria-label={task.completed ? 'Mark as not done' : 'Mark as done'} onClick={() => toggleTask(task)}>{task.completed && <Icon name="check" size={15}/>}</button><span className="task-title">{task.title}</span><button className="delete-task" aria-label={`Delete ${task.title}`} onClick={() => deleteTask(task.id)}><Icon name="trash" size={16}/></button></article>)}
            {visible.length === 0 && <div className="empty-state"><span className="empty-icon">{filter === 'done' ? '✧' : '☼'}</span><h3>{tasks.length === 0 ? 'Start with one small thing.' : filter === 'done' ? 'Your done list is waiting.' : 'You’re all caught up.'}</h3><p>{tasks.length === 0 ? 'Add a task above. The rest can wait.' : filter === 'done' ? 'Finished tasks will find a home here.' : 'Take a breath. You’ve made space.'}</p></div>}</div>
          <div className="list-foot"><span>SHOWING {visible.length} {visible.length === 1 ? 'THING' : 'THINGS'}</span><span>SMALL STEPS ADD UP <span className="foot-star">✳</span></span></div>
        </section>
      </section><footer className="main-footer"><span>Made for a more thoughtful day.</span><span>ONE THING AT A TIME <span className="footer-flower">✳</span></span></footer>
    </main></div>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
