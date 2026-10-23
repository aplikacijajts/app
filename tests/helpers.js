'use strict';
// Test harness: boots server.js against an isolated, temporary data directory so that
// tests NEVER read or modify the real data/db.json or uploads/ folder.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const ROOT = path.resolve(__dirname, '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function startServer(extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jts-test-'));
  const dataDir = path.join(dir, 'data');
  const uploadDir = path.join(dir, 'uploads');
  fs.mkdirSync(dataDir, { recursive: true });
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, UPLOAD_DIR: uploadDir, DB_FILE: path.join(dataDir, 'db.json'), NODE_ENV: 'test', ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', d => { output += d; });
  child.stderr.on('data', d => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try { const r = await fetch(`${base}/health`); if (r.ok) break; } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  return {
    base, dir, dataDir, uploadDir, child,
    output: () => output,
    async stop() { child.kill('SIGTERM'); await new Promise(r => setTimeout(r, 150)); fs.rmSync(dir, { recursive: true, force: true }); }
  };
}

function client(base, token = '') {
  const call = async (method, url, body, headers = {}) => {
    const opts = { method, headers: { ...headers } };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body instanceof FormData) opts.body = body;
    else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const res = await fetch(base + url, opts);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return {
    get: (u, h) => call('GET', u, undefined, h), post: (u, b, h) => call('POST', u, b, h),
    patch: (u, b) => call('PATCH', u, b), put: (u, b) => call('PUT', u, b), del: u => call('DELETE', u)
  };
}

// Seeds an admin plus one dispatcher, driver and broker per "team", all with changed passwords.
async function seed(base) {
  const anon = client(base);
  const setup = await anon.post('/api/setup', { name: 'Test Admin', email: 'admin@test.local', password: 'AdminPass123' });
  if (setup.status !== 201) throw new Error('setup failed ' + setup.text);
  const admin = client(base, setup.json.token);
  const mk = async (name, email, role, extra = {}) => {
    const r = await admin.post('/api/users', { name, email, role, password: 'TempPass123', status: 'Active', ...extra });
    if (r.status !== 201) throw new Error(`user ${email}: ${r.text}`);
    const login = await anon.post('/api/login', { email, password: 'TempPass123' });
    const c = client(base, login.json.token);
    const ch = await c.post('/api/change-password', { currentPassword: 'TempPass123', newPassword: 'FinalPass123' });
    if (ch.status !== 200) throw new Error('change pw ' + ch.text);
    return { user: r.json, api: c, token: login.json.token };
  };
  const disp1 = await mk('Dana Dispatcher', 'dana@test.local', 'dispatcher');
  const disp2 = await mk('Otto Other', 'otto@test.local', 'dispatcher');
  const driver1 = await mk('Drew Driver', 'drew@test.local', 'driver', { dispatcherId: disp1.user.id });
  const driver2 = await mk('Ivy Isolated', 'ivy@test.local', 'driver', { dispatcherId: disp2.user.id });
  const broker1 = await mk('Acme Freight', 'acme@test.local', 'broker');
  const broker2 = await mk('Rival Brokerage', 'rival@test.local', 'broker');
  return { admin: { api: admin, token: setup.json.token, user: setup.json.user }, disp1, disp2, driver1, driver2, broker1, broker2 };
}

module.exports = { startServer, client, seed, ROOT };
