'use strict';
// Functional regression tests for the existing API contract. These run against an isolated
// temporary data directory (see helpers.js); the real data/db.json is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client, seed } = require('./helpers');

let srv; let s;
test.before(async () => { srv = await startServer(); s = await seed(srv.base); });
test.after(async () => { await srv.stop(); });

test('server: health, static shell, manifest content-type, SPA fallback', async () => {
  const anon = client(srv.base);
  const h = await anon.get('/health');
  assert.equal(h.status, 200); assert.equal(h.json.ok, true);
  const idx = await anon.get('/');
  assert.equal(idx.status, 200); assert.match(idx.text, /<div id="appShell"/);
  const css = await anon.get('/css/styles.css'); assert.equal(css.status, 200);
  const js = await anon.get('/js/app.js'); assert.equal(js.status, 200);
  const man = await anon.get('/manifest.webmanifest');
  assert.equal(man.status, 200); assert.match(man.headers.get('content-type'), /manifest\+json/);
  const sw = await anon.get('/sw.js'); assert.equal(sw.status, 200);
  const deep = await anon.get('/some/client/route'); assert.equal(deep.status, 200); assert.match(deep.text, /appShell/);
});

test('auth: bootstrap public, protected routes need session, bad login rejected', async () => {
  const anon = client(srv.base);
  const b = await anon.get('/api/bootstrap'); assert.equal(b.status, 200); assert.equal(b.json.hasUsers, true);
  assert.equal((await anon.get('/api/data')).status, 401);
  assert.equal((await anon.get('/api/loads')).status, 401);
  assert.equal((await client(srv.base, 'deadbeef').get('/api/data')).status, 401);
  assert.equal((await anon.post('/api/login', { email: 'admin@test.local', password: 'wrong' })).status, 401);
  const second = await anon.post('/api/setup', { name: 'x', email: 'x@x.x', password: 'xxxxxxx' });
  assert.equal(second.status, 409);
});

test('auth: new users must change password first; logout invalidates token', async () => {
  const anon = client(srv.base);
  await s.admin.api.post('/api/users', { name: 'Temp User', email: 'temp@test.local', role: 'dispatcher', password: 'TempPass123' });
  const login = await anon.post('/api/login', { email: 'temp@test.local', password: 'TempPass123' });
  assert.equal(login.status, 200);
  const c = client(srv.base, login.json.token);
  const blocked = await c.get('/api/loads');
  assert.equal(blocked.status, 403); assert.equal(blocked.json.code, 'PASSWORD_CHANGE_REQUIRED');
  assert.equal((await c.post('/api/change-password', { currentPassword: 'TempPass123', newPassword: 'short' })).status, 400);
  assert.equal((await c.post('/api/change-password', { currentPassword: 'TempPass123', newPassword: 'LongEnough123' })).status, 200);
  assert.equal((await c.get('/api/loads')).status, 200);
  assert.equal((await c.post('/api/logout')).status, 200);
  assert.equal((await c.get('/api/loads')).status, 401);
});

test('roles: only admin manages users and company; drivers need a dispatcher', async () => {
  assert.equal((await s.disp1.api.post('/api/users', { name: 'n', email: 'n@n.n', role: 'admin', password: 'Password1' })).status, 403);
  assert.equal((await s.driver1.api.put('/api/company', { name: 'Hacked' })).status, 403);
  const noDisp = await s.admin.api.post('/api/users', { name: 'No Disp', email: 'nod@test.local', role: 'driver', password: 'Password1' });
  assert.equal(noDisp.status, 400);
  const dup = await s.admin.api.post('/api/users', { name: 'Dup', email: 'dana@test.local', role: 'dispatcher', password: 'Password1' });
  assert.equal(dup.status, 409);
  const data = await s.admin.api.get('/api/data');
  assert.ok(data.json.users.every(u => !('passwordHash' in u)), 'password hashes must never leave the server');
});

let loadId;
test('loads: create, read, assign, status, role visibility and financial redaction', async () => {
  const created = await s.disp1.api.post('/api/loads', { pickup: 'Gary, IN', delivery: 'Dallas, TX', broker: 'Acme Freight', rate: 2500, miles: 900, status: 'Open', cutPercent: 10 });
  assert.equal(created.status, 201); loadId = created.json.id; assert.ok(loadId);
  assert.equal((await s.driver1.api.post('/api/loads', { pickup: 'a', delivery: 'b' })).status, 403);
  assert.equal((await s.broker1.api.post('/api/loads', { pickup: 'a', delivery: 'b' })).status, 403);

  const assigned = await s.disp1.api.patch(`/api/loads/${loadId}`, { driver: 'Drew Driver', driverEmail: 'drew@test.local', status: 'Dispatched' });
  assert.equal(assigned.status, 200); assert.equal(assigned.json.driver, 'Drew Driver');

  // Driver sees own load, but not financial internals
  const dl = await s.driver1.api.get(`/api/loads/${loadId}`);
  assert.equal(dl.status, 200); assert.ok(!('cutPercent' in dl.json)); assert.ok(!('netProfit' in dl.json));
  // Other driver cannot see it
  assert.equal((await s.driver2.api.get(`/api/loads/${loadId}`)).status, 404);
  // Broker linked by name sees it without driver contact details; rival broker does not
  const bl = await s.broker1.api.get(`/api/loads/${loadId}`);
  assert.equal(bl.status, 200); assert.ok(!('driverEmail' in bl.json));
  assert.equal((await s.broker2.api.get(`/api/loads/${loadId}`)).status, 404);

  // Driver may only change status
  assert.equal((await s.driver1.api.patch(`/api/loads/${loadId}`, { rate: 1 })).status, 403);
  const st = await s.driver1.api.patch(`/api/loads/${loadId}`, { status: 'At Pickup' });
  assert.equal(st.status, 200); assert.equal(st.json.status, 'At Pickup');
  assert.equal((await s.driver2.api.patch(`/api/loads/${loadId}`, { status: 'Delivered' })).status, 403);

  // Second load for same driver is blocked while first is open
  const second = await s.disp1.api.post('/api/loads', { pickup: 'x', delivery: 'y', driver: 'Drew Driver', driverEmail: 'drew@test.local' });
  assert.equal(second.status, 409);

  // Activity timeline recorded
  const data = await s.admin.api.get('/api/data');
  assert.ok(data.json.activities.some(a => a.loadId === loadId && a.title === 'Load created'));
});

test('documents: upload, visibility, approve permissions, preview and download', async () => {
  const fd = new FormData();
  fd.append('load', loadId); fd.append('type', 'BOL');
  fd.append('file', new Blob(['%PDF-1.4\n% test\n'], { type: 'application/pdf' }), 'bol.pdf');
  const up = await s.driver1.api.post('/api/upload', fd);
  assert.equal(up.status, 201); const doc = up.json.uploaded[0]; assert.ok(doc.fileUrl.startsWith('/uploads/'));
  // driver cannot approve
  assert.equal((await s.driver1.api.patch(`/api/docs/${doc.id}`, { status: 'Approved' })).status, 403);
  const ap = await s.disp1.api.patch(`/api/docs/${doc.id}`, { status: 'Approved' });
  assert.equal(ap.status, 200); assert.equal(ap.json.approvedBy, 'dana@test.local');
  const dl = await s.driver1.api.get(`/api/docs/${doc.id}/download`);
  assert.equal(dl.status, 200); assert.match(dl.headers.get('content-disposition'), /attachment/);
  assert.equal((await s.driver2.api.get(`/api/docs/${doc.id}/download`)).status, 404);
  assert.equal((await s.broker2.api.get(`/api/docs/${doc.id}/preview`)).status, 404);
  // only admin deletes
  assert.equal((await s.disp1.api.del(`/api/docs/${doc.id}`)).status, 403);
});

test('intake: text rate confirmation is parsed (dispatcher only)', async () => {
  const text = 'RATE CONFIRMATION\nLoad #: RC-55821\nBroker: Acme Freight\nPickup: 100 Main St, Chicago, IL 60601\nDelivery: 200 Elm St, Atlanta, GA 30301\nRate: $3,150.00\nMiles: 716\n';
  const fd = new FormData(); fd.append('file', new Blob([text], { type: 'text/plain' }), 'ratecon.txt');
  assert.equal((await s.driver1.api.post('/api/intake', fd)).status, 403);
  const fd2 = new FormData(); fd2.append('file', new Blob([text], { type: 'text/plain' }), 'ratecon.txt');
  const r = await s.disp1.api.post('/api/intake', fd2);
  assert.ok([200, 201].includes(r.status), r.text);
  assert.ok(JSON.stringify(r.json).includes('3150') || JSON.stringify(r.json).includes('3,150'), 'rate extracted');
});

test('chat: dedicated dispatcher scope enforced', async () => {
  const dir = (await s.driver1.api.get('/api/data')).json.chatDirectory;
  assert.equal(dir.length, 1); assert.equal(dir[0].label, 'Dana Dispatcher');
  const sent = await s.driver1.api.post('/api/chat', { contact: dir[0].key, text: 'At pickup, waiting on dock 4 — ETA 30m' });
  assert.ok([200, 201].includes(sent.status), sent.text);
  const dispData = (await s.disp1.api.get('/api/data')).json;
  const thread = dispData.chats[dir[0].key] || [];
  assert.ok(thread.some(m => m.text.includes('dock 4 — ETA')), 'UTF-8 text round-trips');
  // other dispatcher cannot post into this thread
  assert.equal((await s.disp2.api.post('/api/chat', { contact: dir[0].key, text: 'x' })).status, 403);
  // broker only reaches administration
  const bdir = (await s.broker1.api.get('/api/data')).json.chatDirectory;
  assert.equal(bdir.length, 1); assert.equal(bdir[0].label, 'Administration');
});

test('notifications: role audience required and read state works', async () => {
  assert.equal((await s.disp1.api.post('/api/notifications', { title: 'x', text: 'y' })).status, 403);
  const n = await s.disp1.api.post('/api/notifications', { title: 'Yard closes 6pm', text: 'Heads up', role: 'driver', target: 'drew@test.local' });
  assert.equal(n.status, 201);
  const mine = (await s.driver1.api.get('/api/data')).json.notifications;
  const found = mine.find(x => x.title === 'Yard closes 6pm'); assert.ok(found);
  assert.ok(!(await s.driver2.api.get('/api/data')).json.notifications.some(x => x.title === 'Yard closes 6pm'));
  assert.equal((await s.driver1.api.post(`/api/notifications/${found.id}/read`)).status, 200);
});

test('exports and backups are permission-scoped', async () => {
  const csv = await s.disp1.api.get('/api/export/loads');
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
  const full = await s.driver1.api.get('/api/export');
  assert.notEqual(full.status, 200, 'drivers must not download a full backup');
});

test('generic CRUD: unknown routes 404, delete is admin-only', async () => {
  assert.equal((await s.admin.api.get('/api/nope')).status, 404);
  const truck = await s.disp1.api.post('/api/fleet', { unit: 'T-101', type: 'Truck', status: 'Available' });
  assert.equal(truck.status, 201);
  assert.equal((await s.disp1.api.del(`/api/fleet/${truck.json.id}`)).status, 403);
  assert.equal((await s.admin.api.del(`/api/fleet/${truck.json.id}`)).status, 200);
});
