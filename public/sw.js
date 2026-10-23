const CACHE_NAME = 'jts-tms-v302';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/theme-init.js',
  '/assets/jts-logo.png',
  '/assets/jts-icon-192.png',
  '/assets/jts-icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/') || url.pathname === '/health') return;
  if (url.origin !== self.location.origin) return;
  // Network-first for the public app shell only. API responses and uploaded files are never cached,
  // so one user's private data can never be served to another user from this cache.
  event.respondWith(fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html'))));
});

// ---- Push handling --------------------------------------------------------------------------
// Incoming voice calls re-alert (sound + vibration) every few seconds while the call is ringing, so a
// locked phone keeps signalling like a ringing call. Ringing stops when: the caller's server sends a
// call-status push (answered / declined / missed / cancelled / ended), the user taps or swipes away the
// notification, the app is open in the foreground (it plays its own ringtone), or the ring timeout passes.
const activeRings = new Map();
const RING_REPEAT_MS = 4500;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function notificationOptions(payload, isVoiceCall, isChatMessage) {
  return {
    body: payload.body || payload.message || 'New operational update',
    icon: '/assets/jts-icon-192.png',
    badge: '/assets/jts-icon-192.png',
    tag: isVoiceCall ? `voice-call-${payload.callId || payload.notificationId || 'incoming'}` : (isChatMessage ? `chat-${payload.chatContact || payload.notificationId || 'message'}` : (payload.notificationId || undefined)),
    renotify: Boolean(isVoiceCall || isChatMessage || payload.notificationId),
    requireInteraction: Boolean(isVoiceCall || isChatMessage),
    silent: false,
    vibrate: isVoiceCall ? [800, 300, 800, 300, 800, 300, 800] : (isChatMessage ? [220, 90, 220, 90, 320] : [180, 80, 180]),
    timestamp: Date.now(),
    actions: isVoiceCall ? [{ action: 'answer', title: 'Answer' }, { action: 'decline', title: 'Decline' }] : [],
    data: {
      url: payload.url || '/?page=notifications',
      notificationId: payload.notificationId || '',
      page: payload.page || '',
      loadId: payload.loadId || '',
      documentId: payload.documentId || '',
      chatContact: payload.chatContact || '',
      callId: payload.callId || '',
      isVoiceCall
    }
  };
}

async function appIsInForeground() {
  const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  return list.some(client => client.visibilityState === 'visible' && client.focused);
}

async function ringIncomingCall(payload, options) {
  const callId = payload.callId || payload.notificationId || 'incoming';
  const title = payload.title || 'Incoming voice call';
  const timeout = Math.min(Math.max(Number(payload.ringTimeoutMs) || 60000, 15000), 90000);
  const deadline = Date.now() + timeout;
  activeRings.set(callId, true);
  await self.registration.showNotification(title, options);
  while (Date.now() + RING_REPEAT_MS < deadline) {
    await sleep(RING_REPEAT_MS);
    if (!activeRings.get(callId)) return;
    if (await appIsInForeground()) continue; // the open app shows its own call screen and ringtone
    await self.registration.showNotification(title, { ...options, timestamp: Date.now(), renotify: true });
  }
  activeRings.delete(callId);
  const remaining = await self.registration.getNotifications({ tag: options.tag });
  remaining.forEach(item => item.close());
}

async function applyCallStatusUpdate(payload, isChatMessage) {
  const callId = payload.callId;
  activeRings.set(callId, false);
  const tag = `voice-call-${callId}`;
  const existing = await self.registration.getNotifications({ tag });
  existing.forEach(item => item.close());
  // A visible notification is required for every push; missed/cancelled calls are worth seeing anyway.
  const quiet = ['answered', 'ended', 'declined'].includes(payload.callStatus);
  if (quiet && await appIsInForeground()) return;
  const options = notificationOptions(payload, false, isChatMessage);
  await self.registration.showNotification(payload.title || 'Voice call update', { ...options, tag, renotify: !quiet, silent: quiet, requireInteraction: !quiet, vibrate: quiet ? [] : [200, 100, 200], actions: [] });
}

self.addEventListener('push', event => {
  let payload = { title: 'JTS TMS', body: 'New operational update', url: '/?page=notifications' };
  try { payload = { ...payload, ...event.data.json() }; } catch (error) {}
  const isVoiceCall = Boolean(payload.isVoiceCall || payload.callId || /voice call|incoming call/i.test(`${payload.type || ''} ${payload.title || ''}`));
  const isChatMessage = Boolean(payload.chatContact || payload.page === 'chat' || /chat|message/i.test(`${payload.type || ''} ${payload.title || ''}`));
  const notifyClients = clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => list.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED', payload })));
  let work;
  if (isVoiceCall && payload.callId && payload.callStatus && payload.callStatus !== 'ringing') work = applyCallStatusUpdate(payload, isChatMessage);
  else if (isVoiceCall && payload.callId) work = ringIncomingCall(payload, notificationOptions(payload, true, isChatMessage));
  else work = self.registration.showNotification(payload.title || 'JTS TMS', notificationOptions(payload, false, isChatMessage));
  event.waitUntil(Promise.all([work, notifyClients]));
});

self.addEventListener('notificationclose', event => {
  const callId = event.notification?.data?.callId;
  if (callId) activeRings.set(callId, false);
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification?.data || {};
  if (data.callId) activeRings.set(data.callId, false);
  const target = new URL(data.url || '/?page=notifications', self.location.origin);
  if (data.callId) {
    target.searchParams.set('page', 'chat');
    target.searchParams.set('call', data.callId);
    if (data.chatContact) target.searchParams.set('chat', data.chatContact);
    if (event.action === 'answer') target.searchParams.set('callAction', 'answer');
    if (event.action === 'decline') target.searchParams.set('callAction', 'decline');
  }
  const targetUrl = target.href;
  event.waitUntil((async () => {
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clientList.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      const navigated = 'navigate' in existing ? await existing.navigate(targetUrl).catch(() => existing) : existing;
      navigated?.postMessage({ type: 'NOTIFICATION_NAVIGATE', url: targetUrl });
      return navigated?.focus();
    }
    return clients.openWindow(targetUrl);
  })());
});
