'use strict';
// Security regression tests. Each test encodes a vulnerability found during the audit
// (see docs/AUDIT_REPORT.md). They failed against the original v2.6.2 code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, client, seed } = require('./helpers');

let srv; let s;
test.before(async () => { srv = await startServer(); s = await seed(srv.base); });
test.after(async () => { await srv.stop(); });

async function uploadAs(api, name, content, type, fields = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  fd.append('file', new Blob([content], { type }), name);
  return api.post('/api/upload', fd);
}

test('SEC-1 uploaded files are not readable without a session', async () => {
  const up = await uploadAs(s.driver1.api, 'cdl.pdf', '%PDF-1.4 private', 'application/pdf');
  assert.equal(up.status, 201);
  const anon = await fetch(srv.base + up.json.uploaded[0].fileUrl);
  assert.equal(anon.status, 401, 'anonymous request for a private upload must be refused');
});

test('SEC-2 uploaded files are only readable by users allowed to see the record', async () => {
  const up = await uploadAs(s.driver1.api, 'medical.pdf', '%PDF-1.4 medical', 'application/pdf');
  const url = up.json.uploaded[0].fileUrl;
  // the session cookie is issued at login
  const loginOwner = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'drew@test.local', password: 'FinalPass123' }) });
  const ownerCookie = loginOwner.headers.get('set-cookie');
  assert.ok(ownerCookie && /HttpOnly/i.test(ownerCookie), 'login must set an HttpOnly session cookie');
  const own = await fetch(srv.base + url, { headers: { Cookie: ownerCookie.split(';')[0] } });
  assert.equal(own.status, 200);
  const loginOther = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ivy@test.local', password: 'FinalPass123' }) });
  const other = await fetch(srv.base + url, { headers: { Cookie: loginOther.headers.get('set-cookie').split(';')[0] } });
  assert.equal(other.status, 404, 'another driver must not read this file');
});

test('SEC-3 active content (HTML/SVG/JS) cannot be uploaded as a document', async () => {
  const html = await uploadAs(s.broker1.api, 'invoice.html', '<script>alert(localStorage.jtsToken)</script>', 'text/html', { type: 'Invoice' });
  assert.equal(html.status, 400);
  const svg = await uploadAs(s.disp1.api, 'x.svg', '<svg onload="alert(1)"/>', 'image/svg+xml');
  assert.equal(svg.status, 400);
});

test('SEC-4 a rejected upload leaves no orphan file on disk', async () => {
  const before = countFiles(srv.uploadDir);
  // broker has no visible load with this id -> not permitted
  const r = await uploadAs(s.broker2.api, 'x.pdf', '%PDF-1.4', 'application/pdf', { load: 'does-not-exist' });
  assert.ok([400, 403].includes(r.status));
  assert.equal(countFiles(srv.uploadDir), before);
});

test('SEC-5 stored HTML (e.g. intake) is never rendered inline from /uploads', async () => {
  const fd = new FormData();
  fd.append('file', new Blob(['<html><body>Load #: 1<script>alert(1)</script></body></html>'], { type: 'text/html' }), 'tender.html');
  const r = await s.admin.api.post('/api/intake', fd);
  assert.ok([200, 201].includes(r.status), r.text);
  const files = listFiles(srv.uploadDir).filter(f => f.endsWith('.html'));
  assert.ok(files.length >= 1);
  const rel = '/uploads/' + path.relative(srv.uploadDir, files[0]).split(path.sep).join('/');
  const login = await fetch(srv.base + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@test.local', password: 'AdminPass123' }) });
  const res = await fetch(srv.base + rel, { headers: { Cookie: login.headers.get('set-cookie').split(';')[0] } });
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.headers.get('content-type') || '', /text\/html/);
  assert.match(res.headers.get('content-disposition') || '', /attachment/);
});

test('SEC-6 repeated failed logins are throttled', async () => {
  const anon = client(srv.base);
  let last;
  for (let i = 0; i < 12; i++) last = await anon.post('/api/login', { email: 'dana@test.local', password: 'nope' + i });
  assert.equal(last.status, 429);
  // throttling is per account+address and does not lock out other accounts
  const ok = await anon.post('/api/login', { email: 'otto@test.local', password: 'FinalPass123' });
  assert.equal(ok.status, 200);
});

test('SEC-7 internal error details are not leaked to clients', async () => {
  const r = await fetch(srv.base + '/api/loads', { method: 'POST', headers: { Authorization: `Bearer ${s.disp1.token}`, 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(r.status, 400);
  const body = await r.json();
  assert.doesNotMatch(body.error, /Unexpected token|JSON at position|SyntaxError/);
});

test('SEC-8 admin user update cannot inject a password hash directly', async () => {
  const target = s.disp2.user;
  const r = await s.admin.api.patch(`/api/users/${target.id}`, { passwordHash: 'aa:bb' });
  assert.equal(r.status, 200);
  const relog = await client(srv.base).post('/api/login', { email: 'otto@test.local', password: 'FinalPass123' });
  assert.equal(relog.status, 200, 'password must be unchanged');
});

test('SEC-11 dispatcher sees the unassigned pool but not another team\'s loads, and cannot edit them', async () => {
  const pool = await s.disp1.api.post('/api/loads', { pickup: 'Pool A', delivery: 'Pool B', status: 'Open' });
  assert.equal(pool.status, 201);
  assert.equal((await s.disp1.api.get(`/api/loads/${pool.json.id}`)).status, 200, 'creator sees new unassigned load');
  assert.equal((await s.disp2.api.get(`/api/loads/${pool.json.id}`)).status, 200, 'unassigned pool is shared');
  const other = await s.disp2.api.post('/api/loads', { pickup: 'C', delivery: 'D', driver: 'Ivy Isolated', driverEmail: 'ivy@test.local' });
  assert.equal(other.status, 201);
  assert.equal((await s.disp1.api.get(`/api/loads/${other.json.id}`)).status, 404);
  assert.equal((await s.disp1.api.patch(`/api/loads/${other.json.id}`, { rate: 1 })).status, 403);
});

test('SEC-12 spoofed file signature is rejected', async () => {
  const r = await uploadAs(s.driver1.api, 'photo.jpg', '<html>not an image</html>', 'image/jpeg');
  assert.equal(r.status, 400);
});

test('SEC-9 responses carry hardening headers', async () => {
  const r = await fetch(srv.base + '/');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('permissions-policy'));
  assert.ok(r.headers.get('content-security-policy'));
});

test('SEC-10 a corrupt database file is preserved, never silently overwritten', async () => {
  const own = await startServer();
  try {
    await seed(own.base);
    const dbFile = path.join(own.dataDir, 'db.json');
    fs.writeFileSync(dbFile, fs.readFileSync(dbFile, 'utf8').slice(0, 200)); // truncate = corrupt
    await fetch(own.base + '/api/bootstrap');
    const leftovers = fs.readdirSync(own.dataDir);
    assert.ok(leftovers.some(f => f.startsWith('db.json.corrupt-')), 'corrupt copy must be kept for recovery');
    const boot = await (await fetch(own.base + '/api/bootstrap')).json();
    assert.equal(boot.hasUsers, true, 'should recover from the last good backup rather than an empty DB');
  } finally { await own.stop(); }
});

function listFiles(dir) { if (!fs.existsSync(dir)) return []; return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
function countFiles(dir) { return listFiles(dir).length; }
