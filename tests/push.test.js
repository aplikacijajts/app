'use strict';
// Push delivery tests against a local HTTPS mock push service (web-push always uses HTTPS).
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { startServer, seed } = require('./helpers');

let srv; let s; let mock; let mockPort; const received = [];
function fakeSubscription(pathName) {
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  return { endpoint: `https://127.0.0.1:${mockPort}${pathName}`, keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
}
const waitFor = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

test.before(async () => {
  mock = https.createServer({ key: fs.readFileSync(path.join(__dirname, 'fixtures/mock-push-key.pem')), cert: fs.readFileSync(path.join(__dirname, 'fixtures/mock-push-cert.pem')) }, (req, res) => {
    req.resume();
    req.on('end', () => {
      received.push({ path: req.url, urgency: req.headers.urgency, ttl: Number(req.headers.ttl), topic: req.headers.topic || '' });
      res.writeHead(req.url.startsWith('/gone') ? 410 : 201); res.end();
    });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r)); mockPort = mock.address().port;
  srv = await startServer({ NODE_TLS_REJECT_UNAUTHORIZED: '0' });
  s = await seed(srv.base);
});
test.after(async () => { await srv.stop(); mock.close(); });

test('PUSH-1 test endpoint reports when a device is not registered', async () => {
  const r = await s.driver1.api.post('/api/push/test', {});
  assert.equal(r.status, 404);
});

test('PUSH-2 pushes are sent with high urgency so locked Android phones receive them', async () => {
  assert.equal((await s.driver1.api.post('/api/push/subscribe', { subscription: fakeSubscription('/driver1') })).status, 201);
  const r = await s.driver1.api.post('/api/push/test', {});
  assert.equal(r.status, 200); assert.equal(r.json.sent, 1);
  const hit = received.find(x => x.path === '/driver1');
  assert.ok(hit); assert.equal(hit.urgency, 'high');
});

test('PUSH-3 an incoming call rings the callee with a short TTL and a topic; ending it sends a replacement push', async () => {
  received.length = 0;
  const contact = (await s.disp1.api.get('/api/data')).json.chatDirectory.find(c => c.label === 'Drew Driver');
  const start = await s.disp1.api.post('/api/calls/start', { contact: contact.key, offer: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' } });
  assert.ok([200, 201].includes(start.status), start.text);
  assert.ok(await waitFor(() => received.some(x => x.path === '/driver1')), 'callee received ring push');
  const ring = received.find(x => x.path === '/driver1');
  assert.equal(ring.urgency, 'high'); assert.ok(ring.ttl > 0 && ring.ttl <= 90, `ttl ${ring.ttl}`); assert.ok(ring.topic.length > 0);
  const callId = start.json.call?.id || start.json.id;
  assert.ok(callId);
  const end = await s.disp1.api.post(`/api/calls/${callId}/end`, {});
  assert.equal(end.status, 200, end.text);
  assert.ok(await waitFor(() => received.filter(x => x.path === '/driver1').length >= 2), 'status push after the call stops ringing');
  const update = received.filter(x => x.path === '/driver1')[1];
  assert.equal(update.topic, ring.topic, 'same topic replaces an undelivered ring');
});

test('PUSH-4 expired subscriptions (410) are removed instead of failing forever', async () => {
  assert.equal((await s.driver2.api.post('/api/push/subscribe', { subscription: fakeSubscription('/gone') })).status, 201);
  const r = await s.driver2.api.post('/api/push/test', {});
  assert.equal(r.json.failed, 1); assert.equal(r.json.results[0].removed, true);
  const again = await s.driver2.api.post('/api/push/test', {});
  assert.equal(again.status, 404, 'device must re-register');
});
