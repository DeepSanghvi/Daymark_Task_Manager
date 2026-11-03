import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, initializeDatabase } from './db.js';
import { requireAuth } from './auth.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
}

const app = express();
const port = Number(process.env.PORT) || 3000;
const here = path.dirname(fileURLToPath(import.meta.url));
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || false }));
app.use(express.json({ limit: '20kb' }));

function issueToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email }; }

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); return res.json({ status: 'ok' }); }
  catch { return res.status(503).json({ status: 'unavailable' }); }
});

app.post('/api/auth/register', async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Enter a name, valid email, and password between 8 and 128 characters.' });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query('INSERT INTO users(name, email, password_hash) VALUES($1, $2, $3) RETURNING id, name, email', [name, email, hash]);
    return res.status(201).json({ token: issueToken(rows[0]), user: publicUser(rows[0]) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with that email already exists.' });
    return next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  try {
    const { rows } = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);
    if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
    return res.json({ token: issueToken(rows[0]), user: publicUser(rows[0]) });
  } catch (error) { return next(error); }
});

app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) return res.status(401).json({ error: 'Account not found.' });
    return res.json({ user: rows[0] });
  } catch (error) { return next(error); }
});

app.get('/api/tasks', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, title, completed, created_at AS "createdAt" FROM tasks WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    return res.json({ tasks: rows });
  } catch (error) { return next(error); }
});

app.post('/api/tasks', requireAuth, async (req, res, next) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 160) return res.status(400).json({ error: 'Task title must be between 1 and 160 characters.' });
  try {
    const { rows } = await pool.query('INSERT INTO tasks(user_id, title) VALUES($1, $2) RETURNING id, title, completed, created_at AS "createdAt"', [req.user.id, title]);
    return res.status(201).json({ task: rows[0] });
  } catch (error) { return next(error); }
});

app.patch('/api/tasks/:id', requireAuth, async (req, res, next) => {
  const updates = [];
  const values = [req.user.id, req.params.id];
  if (typeof req.body?.title === 'string') {
    const title = req.body.title.trim();
    if (!title || title.length > 160) return res.status(400).json({ error: 'Task title must be between 1 and 160 characters.' });
    values.push(title); updates.push(`title = $${values.length}`);
  }
  if (typeof req.body?.completed === 'boolean') { values.push(req.body.completed); updates.push(`completed = $${values.length}`); }
  if (!updates.length) return res.status(400).json({ error: 'Provide a task title or completed status.' });
  try {
    const { rows } = await pool.query(`UPDATE tasks SET ${updates.join(', ')} WHERE user_id = $1 AND id = $2 RETURNING id, title, completed, created_at AS "createdAt"`, values);
    if (!rows[0]) return res.status(404).json({ error: 'Task not found.' });
    return res.json({ task: rows[0] });
  } catch (error) { return next(error); }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM tasks WHERE user_id = $1 AND id = $2', [req.user.id, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: 'Task not found.' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.resolve(here, '../dist'), { index: false, maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.resolve(here, '../dist/index.html')));
app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

await initializeDatabase();
app.listen(port, '0.0.0.0', () => console.log(`Daymark listening on ${port}`));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => { await pool.end(); process.exit(0); });
}
