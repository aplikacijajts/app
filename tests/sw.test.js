'use strict';
// Runs public/sw.js in a simulated service-worker environment to verify call ringing behaviour.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWorker({ foreground = false } = {}) {
  const listeners = {}; const shown = []; let open = [];
  const registration = {
    showNotification: async (title, options) => { shown.push({ title, options, at: Date.now() }); open = open.filter(n => n.tag !== options.tag); open.push({ tag: options.tag, close() { open = open.filter(x => x !== this); } }); },
    getNotifications: async ({ tag } = {}) => open.filter(n => !tag || n.tag === tag)
  };
  const sandbox = {
    self: { addEventListener: (type, fn) => { listeners[type] = fn; }, registration, location: { origin: 'https://jts.test' }, skipWaiting() {}, clients: {} },
    clients: { matchAll: async () => (foreground ? [{ visibilityState: 'visible', focused: true, postMessage() {} }] : [{ visibilityState: 'hidden', focused: false, postMessage() {} }]), openWindow: async () => {} },
    caches: {}, fetch: async () => ({}), URL, setTimeout, clearTimeout, console, Promise, Date, Math, Map, Number, String, Boolean, JSON
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8').replace('const RING_REPEAT_MS = 4500;', 'const RING_REPEAT_MS = 40;').replace('15000), 90000)', '100), 90000)'); // fast timings for tests
  vm.runInContext(source, sandbox);
  const push = payload => { let work; listeners.push({ data: { json: () => payload }, waitUntil: p => { work = p; } }); return work; };
  return { listeners, shown, push, open: () => open };
}

test('SW-1 incoming call re-alerts repeatedly until the ring timeout', async () => {
  const w = loadWorker();
  await w.push({ title: 'Incoming voice call', body: 'Dana is calling you', callId: 'c1', isVoiceCall: true, callStatus: 'ringing', ringTimeoutMs: 300 });
  const rings = w.shown.filter(n => n.options.tag === 'voice-call-c1');
  assert.ok(rings.length >= 3, `expected repeated alerts, got ${rings.length}`);
  assert.ok(rings.every(n => n.options.requireInteraction && n.options.vibrate.length > 0));
  assert.equal(JSON.stringify(rings[0].options.actions.map(a => a.action)), JSON.stringify(['answer', 'decline']));
});

test('SW-2 a call-status push stops the ringing and replaces the notification', async () => {
  const w = loadWorker();
  const ringing = w.push({ title: 'Incoming voice call', body: 'Dana is calling you', callId: 'c2', isVoiceCall: true, callStatus: 'ringing', ringTimeoutMs: 15000 });
  await new Promise(r => setTimeout(r, 120));
  await w.push({ title: 'Missed voice call', body: 'Missed call from Dana', callId: 'c2', isVoiceCall: true, callStatus: 'missed' });
  const countAfterStop = w.shown.length;
  await new Promise(r => setTimeout(r, 200));
  assert.equal(w.shown.length, countAfterStop, 'no further ringing after the status update');
  assert.equal(w.shown.at(-1).title, 'Missed voice call');
  void ringing;
});

test('SW-3 swiping the notification away stops the ringing', async () => {
  const w = loadWorker();
  w.push({ title: 'Incoming voice call', body: 'x', callId: 'c3', isVoiceCall: true, callStatus: 'ringing', ringTimeoutMs: 15000 });
  await new Promise(r => setTimeout(r, 60));
  w.listeners.notificationclose({ notification: { data: { callId: 'c3' } } });
  const n = w.shown.length;
  await new Promise(r => setTimeout(r, 200));
  assert.equal(w.shown.length, n);
});

test('SW-4 ordinary notifications are shown once with high-visibility defaults', async () => {
  const w = loadWorker();
  await w.push({ title: 'New load assigned', body: 'JTS-1001', notificationId: 'n1' });
  assert.equal(w.shown.length, 1); assert.equal(w.shown[0].title, 'New load assigned');
});
