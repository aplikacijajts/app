const CACHE_NAME = 'jts-tms-shell-v20';
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
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
  event.respondWith(fetch(request).then(response => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match(request).then(cached => cached || caches.match('/index.html'))));
});

self.addEventListener('push', event => {
  let payload = { title: 'JTS TMS', body: 'New operational update', url: '/?page=notifications' };
  try { payload = { ...payload, ...event.data.json() }; } catch (error) {}
  const isVoiceCall = Boolean(payload.isVoiceCall || payload.callId || /voice call|incoming call/i.test(`${payload.type || ''} ${payload.title || ''}`));
  const isChatMessage = Boolean(payload.chatContact || payload.page === 'chat' || /chat|message/i.test(`${payload.type || ''} ${payload.title || ''}`));
  const options = {
    body: payload.body || payload.message || 'New operational update',
    icon: '/assets/jts-logo.png',
    badge: '/assets/jts-logo.png',
    tag: isVoiceCall ? `voice-call-${payload.callId || payload.notificationId || 'incoming'}` : (isChatMessage ? `chat-${payload.chatContact || payload.notificationId || 'message'}` : (payload.notificationId || undefined)),
    renotify: Boolean(isVoiceCall || isChatMessage || payload.notificationId),
    requireInteraction: Boolean(isVoiceCall || isChatMessage),
    silent: false,
    vibrate: isVoiceCall ? [550, 220, 550, 700, 550, 220, 550] : (isChatMessage ? [220, 90, 220, 90, 320] : [180, 80, 180]),
    actions: isVoiceCall ? [
      { action: 'answer', title: 'Answer' },
      { action: 'decline', title: 'Decline' }
    ] : [],
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
  event.waitUntil(Promise.all([
    self.registration.showNotification(payload.title || (isVoiceCall ? 'Incoming voice call' : 'JTS TMS'), options),
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      clientList.forEach(client => client.postMessage({ type: 'PUSH_RECEIVED', payload }));
    })
  ]));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification?.data || {};
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
