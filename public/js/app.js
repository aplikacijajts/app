const state = {
  page: 'dashboard',
  role: 'admin',
  sidebarCollapsed: false,
  selectedChat: '',
  selectedLoadId: '',
  selectedDocId: '',
  pendingDeepLink: null,
  postRenderTarget: null,
  currentUser: null,
  authToken: localStorage.getItem('jtsToken') || '',
  search: '',
  intakeResults: [],
  pageHistory: [],
  systemHealth: null,
  floatingChatOpen: false,
  fuelHelp: { lat: null, lng: null, accuracy: null, brand: 'any', radiusKm: 50, stations: [], loading: false, error: '' },
  liveGpsWatchId: null,
  gpsSharing: false,
  deferredInstallPrompt: null,
  installPromptDismissed: false,
  bootstrap: { push: { enabled: false, publicKey: '' }, rtc: { iceServers: [], turnConfigured: false, ringTimeoutMs: 60000 } },
  liveDataRevision: '',
  reportFilter: { preset: 'month-to-date', from: '', to: '' },
  docsHub: null,
  driverLoadDetailId: '',
  dispatchBoard: { tab: 'open', search: '' },
  dashboardTab: 'my',
  loadEditor: null,
  tables: { loads: { query: '', page: 1, pageSize: 25 } }
};

const PERSONAL_DOC_TYPES = ['CDL', 'Medical', 'Drug Test', 'Insurance', 'IFTA', 'CAB Card', 'Trailer Registration', 'TITLE', 'Other'];
const OPERATIONAL_DOC_TYPES = ['Truck', 'Trailer', 'Plates', 'Truck with JTS', 'VIN', 'Other'];
const REMINDER_CATEGORIES = ['Truck inspection', 'Trailer inspection', 'Medical', 'Scheduled drug test'];
const REMINDER_LEAD_DAYS = 30;

// Install prompt listeners MUST be registered synchronously, as early as possible (before any await in init()).
// Chrome/Android can fire "beforeinstallprompt" almost immediately once PWA install criteria are met, especially
// on repeat visits where the service worker is already cached. If the listener is attached later (e.g. after an
// awaited service worker registration), the event is missed forever and the Install Now button silently does
// nothing. (On Samsung/Chrome devices such as the Galaxy S23 Ultra this was combined with a second, more
// fundamental bug: manifest.webmanifest being served with the wrong Content-Type on the server, which stops
// Chrome from ever firing "beforeinstallprompt" in the first place — fixed server-side in server.js.)
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  try { renderMobilePrompt(); } catch (error) { /* DOM may not be ready yet; init() will render it later */ }
});
window.addEventListener('appinstalled', () => {
  try { markInstallAcknowledged(); } catch (error) {}
  try { renderMobilePrompt(); } catch (error) {}
  try { toast('JTS TMS installed'); } catch (error) {}
});

let appData = emptyData();
let activeModalSave = null;
let liveDataTimer = null;
let liveDataSyncBusy = false;
const LIVE_DATA_SYNC_MS = 15000;
const voiceSession = {
  call: null,
  peer: null,
  localStream: null,
  remoteStream: null,
  processedCandidates: new Set(),
  pendingCandidates: [],
  pollTimer: null,
  toneTimer: null,
  toneContext: null,
  terminalTimer: null,
  muted: false,
  busy: false,
  lastDataRefreshKey: ''
};

const AUTH_TOKEN_KEY = 'jtsToken';
const AUTH_USER_KEY = 'jtsUser';
const PWA_INSTALL_ACK_KEY = 'jtsPwaInstallAcknowledged';
const PWA_INSTALL_DISMISS_KEY = 'jtsPwaInstallDismissedAt';
const NOTIFICATION_OK_KEY = 'jtsNotificationAccepted';
const NOTIFICATION_DENIED_AT_KEY = 'jtsNotificationDeniedAt';
const NOTIFICATION_LAUNCH_COUNT_KEY = 'jtsNotificationLaunchCount';
const NOTIFICATION_LAST_PROMPT_COUNT_KEY = 'jtsNotificationLastPromptCount';

function emptyData() {
  return {
    company: { name: 'JTS Logistics Inc', description: 'JTS Logistics Inc is the leading and fast growing logistics company in the Midwest. JTS Logistics operates as a 100% Owner Operator company with Dry Vans, Flat Beds and reefers, dedicated to professionalism, dependable service, customized solutions and cutting-edge tracking technology.', address: '2138 W 47th Avenue Gary IN 46408', mcNumber: 'MC-1574089', dotNumber: 'DOT-4117506', supportEmail: 'peak@dispatch.com', phone: '', timezone: 'America/Chicago', primaryColor: '#0aa9a5', secondaryColor: '#5f6267', loadPrefix: 'JTS', gpsProvider: 'Live GPS iframe', gpsProviderName: 'Live GPS', gpsIframeUrl: '', gpsOpenUrl: '', gpsIframeHtml: '', gpsLastUpdated: '', gpsRefreshSeconds: 60, liveGpsUrl: '' },
    users: [], loads: [], drivers: [], fleet: [], brokers: [], docs: [], chats: {}, chatDirectory: [], calls: [], notifications: [], activities: [], locations: [], hosLogs: [], intake: [], auditLog: [], reminders: [], docFolders: []
  };
}

const navGroups = [
  {
    title: 'Operations',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'grid', kicker: 'Operations' },
      { id: 'dispatch', label: 'Dispatcher', icon: 'board', kicker: 'Live board' },
      { id: 'intake', label: 'Doc Intake', icon: 'doc', kicker: 'Auto-fill' },
      { id: 'loads', label: 'Loads', icon: 'loads', kicker: 'Load management' },
      { id: 'driver-mobile', label: 'Current Load', icon: 'phone', kicker: 'Driver workspace' }
    ]
  },
      {
    title: 'Resources',
    items: [
      { id: 'drivers', label: 'Drivers', icon: 'drivers', kicker: 'People' },
      { id: 'fleet', label: 'Trucks / Trailers', icon: 'truck', kicker: 'Fleet' },
      { id: 'brokers', label: 'Brokers / Customers', icon: 'briefcase', kicker: 'Partners' },
      { id: 'documents', label: 'Documents', icon: 'doc', kicker: 'BOL / POD' },
      { id: 'fuel', label: 'Fuel', icon: 'fuel', kicker: 'Fuel stations' }
    ]
  },
  {
    title: 'Control',
    items: [
      { id: 'chat', label: 'Chat', icon: 'chat', kicker: 'Communication' },
      { id: 'notifications', label: 'Notifications', icon: 'bell', kicker: 'Alerts' },
      { id: 'gps', label: 'GPS / Location', icon: 'pin', kicker: 'Location' },
      { id: 'eld', label: 'ELD / HOS', icon: 'report', kicker: 'Compliance report' },
      { id: 'dispatchers', label: 'Dispatchers', icon: 'chart', kicker: 'Payout performance' },
      { id: 'reports', label: 'Reports', icon: 'chart', kicker: 'Analytics' },
      { id: 'admin', label: 'Admin Panel', icon: 'shield', kicker: 'Administration' },
      { id: 'settings', label: 'Settings', icon: 'settings', kicker: 'Configuration' }
    ]
  }
];

const mobileNav = { admin: ['dashboard', 'dispatch', 'loads', 'chat', 'notifications'], dispatcher: ['dashboard', 'dispatch', 'loads', 'chat', 'notifications'], driver: ['driver-mobile', 'documents', 'chat', 'notifications', 'fuel'], broker: ['dashboard', 'loads', 'documents', 'chat', 'notifications'] };

const rolePages = {
  admin: 'all',
  dispatcher: ['dashboard', 'dispatch', 'intake', 'loads', 'driver-mobile', 'drivers', 'fleet', 'brokers', 'documents', 'chat', 'notifications', 'gps', 'fuel', 'eld', 'reports'],
  driver: ['driver-mobile', 'documents', 'fuel', 'chat', 'notifications'],
  broker: ['dashboard', 'loads', 'documents', 'chat', 'notifications']
};


function role() { return state.currentUser?.role || state.role || 'guest'; }
function isAdminUser() { return role() === 'admin'; }
function isDispatcherUser() { return role() === 'dispatcher'; }
function canManageOperations() { return isAdminUser() || isDispatcherUser(); }
function canManageUsers() { return isAdminUser(); }
function canManageDocuments() { return canManageOperations(); }
function canExportBackup() { return isAdminUser(); }

// ITS-Dispatch style status list. "Open Loads" tab = anything NOT in DELIVERED_STATUSES below;
// "Delivered/Completed Loads" tab = anything in DELIVERED_STATUSES. "Reopen" moves a load from
// Delivered/Completed back to 'Open' (e.g. when a document was rejected after delivery).
const statusList = ['Open', 'Dispatched', 'At Pickup', 'On Route', 'At Delivery', 'Delivered', 'Completed', 'Problem / Delayed'];
const DELIVERED_STATUSES = ['Delivered', 'Completed', 'Closed'];
function isDeliveredStatus(status) { return DELIVERED_STATUSES.includes(String(status || '').trim()); }
const docStatusList = ['Missing', 'Uploaded', 'Approved', 'Rejected'];

const icons = {
  grid: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z"/></svg>',
  board: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm10 0h4a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 13h4a2 2 0 0 1 2 2v1h-8v-1a2 2 0 0 1 2-2Z"/></svg>',
  loads: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 6a3 3 0 0 1 3-3h6l5 5v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6Zm9-1.2V9h4.2L13 4.8ZM7 12h10v2H7v-2Zm0 4h7v2H7v-2Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 2h8a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm2 2v1h4V4h-4Zm2 16a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z"/></svg>',
  drivers: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm-9 9a9 9 0 0 1 18 0H3Z"/></svg>',
  truck: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M3 6h11v9h1.2l2-4H21v4h1v3h-2.1a3 3 0 0 1-5.8 0H9.9a3 3 0 0 1-5.8 0H2v-3h1V6Zm14.8 7-.8 2h2v-2h-1.2ZM7 19.2A1.2 1.2 0 1 0 7 16.8a1.2 1.2 0 0 0 0 2.4Zm10 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M9 4h6l1 3h3a2 2 0 0 1 2 2v3H3V9a2 2 0 0 1 2-2h3l1-3Zm2 2-.4 1h2.8L13 6h-2Zm10 8v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4h7v2h4v-2h7Z"/></svg>',
  doc: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 2.7V8h3.3L14 4.7ZM7 12h10v2H7v-2Zm0 4h8v2H7v-2Z"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a3 3 0 0 0 3-3H9a3 3 0 0 0 3 3Zm7-6V9a7 7 0 0 0-14 0v7l-2 2h18l-2-2Z"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2a8 8 0 0 0-8 8c0 6 8 12 8 12s8-6 8-12a8 8 0 0 0-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"/></svg>',
  report: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M5 3h14v18H5V3Zm3 4v2h8V7H8Zm0 4v2h8v-2H8Zm0 4v2h5v-2H8Z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 20V4h3v16H4Zm6 0V9h3v11h-3Zm6 0V6h3v14h-3Z"/></svg>',
  shield: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 2 4 5v6c0 5.3 3.4 9.5 8 11 4.6-1.5 8-5.7 8-11V5l-8-3Zm-1 14-4-4 1.5-1.5L11 13l5-5 1.5 1.5L11 16Z"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19.4 13.5a7.6 7.6 0 0 0 .1-1.5 7.6 7.6 0 0 0-.1-1.5l2-1.5-2-3.5-2.4 1a8.6 8.6 0 0 0-2.5-1.5L14.2 2h-4.4l-.4 2.5A8.6 8.6 0 0 0 7 6L4.6 5l-2 3.5 2 1.5a7.6 7.6 0 0 0-.1 1.5c0 .5 0 1 .1 1.5l-2 1.5 2 3.5L7 17.5A8.6 8.6 0 0 0 9.5 19l.4 2.5h4.4l.4-2.5a8.6 8.6 0 0 0 2.5-1.5l2.4 1 2-3.5-2.2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>',
  fuel: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M4 3h8a1 1 0 0 1 1 1v16H3V4a1 1 0 0 1 1-1Zm2 3v4h4V6H6Zm10 .6 2.7 2.7c.2.2.3.5.3.8V17a1.5 1.5 0 0 0 3 0V9c0-.5-.2-1-.6-1.4l-3.1-3.1-1.3 1.2ZM3 22h10v-2H3v2Z"/></svg>'
};

function qs(selector) { return document.querySelector(selector); }
function qsa(selector, root = document) { return [...(root || document).querySelectorAll(selector)]; }
function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
function arr(key) { return Array.isArray(appData[key]) ? appData[key] : []; }
function uniqueTextValues(values = []) {
  const seen = new Set();
  return values.filter(value => {
    const clean = String(value || '').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function driverAssignmentNames() {
  return uniqueTextValues([
    ...arr('drivers').map(driver => driver.name),
    ...arr('users').filter(user => user.role === 'driver' && user.status !== 'Disabled').map(user => user.name)
  ]);
}
function money(value) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0)); }
function todayLabel() { return new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }); }
function initials(name) { return String(name || 'JT').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'JT'; }
function formatFileSize(bytes = 0) {
  const size = Number(bytes || 0);
  if (!size) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size < 10 * 1024 ? 1 : 0)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function chatMessageAttachments(message = {}) {
  const attachments = Array.isArray(message.attachments) ? message.attachments.filter(item => item?.url) : [];
  if (attachments.length) return attachments;
  return message.attachmentUrl ? [{
    url: message.attachmentUrl,
    name: message.attachmentName || 'Attachment',
    contentType: message.attachmentContentType || '',
    sizeBytes: message.attachmentSizeBytes || 0,
    kind: message.attachmentKind || ''
  }] : [];
}
function chatMessagePreview(message = {}) {
  if (message.text) return message.text;
  const attachments = chatMessageAttachments(message);
  if (!attachments.length) return 'No messages yet';
  if (attachments.length === 1) return attachments[0].name || 'Attachment';
  return `${attachments.length} attachments`;
}
function attachmentKind(item = {}) {
  const type = String(item.contentType || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  if (item.kind === 'image' || type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/.test(name)) return 'image';
  if (item.kind === 'pdf' || type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
  return 'file';
}
function attachmentLabel(item = {}) {
  const name = String(item.name || 'Attachment');
  const ext = name.includes('.') ? name.split('.').pop().toUpperCase() : 'FILE';
  return ext.slice(0, 5) || 'FILE';
}
function renderChatAttachments(message = {}) {
  const items = chatMessageAttachments(message);
  if (!items.length) return '';
  return `<div class="chat-attachment-list">${items.map(item => {
    const url = esc(item.url || '');
    const name = esc(item.name || 'Attachment');
    const size = formatFileSize(item.sizeBytes);
    if (attachmentKind(item) === 'image') {
      return `<a class="chat-image-attachment" href="${url}" target="_blank" rel="noreferrer" aria-label="Open ${name}"><img src="${url}" alt="${name}" loading="lazy"><span>${name}${size ? ` · ${esc(size)}` : ''}</span></a>`;
    }
    return `<a class="chat-file-attachment" href="${url}" target="_blank" rel="noreferrer" download><span class="chat-file-type">${esc(attachmentLabel(item))}</span><span class="chat-file-info"><strong>${name}</strong><small>${size ? esc(size) : 'Open / download file'}</small></span><span class="chat-file-open">Open</span></a>`;
  }).join('')}</div>`;
}

function isVoiceCallMessage(message = {}) {
  return message.kind === 'voice-call' || message.type === 'call' || Boolean(message.callId);
}

function formatCallDuration(value = 0) {
  const parsed = Number(value || 0);
  const seconds = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function liveCallDuration(call = voiceSession.call) {
  if (!call?.answeredAt) return Number(call?.durationSeconds || 0);
  const start = new Date(call.answeredAt).getTime();
  const end = call.endedAt ? new Date(call.endedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number(call.durationSeconds || 0);
  return Math.max(Number(call.durationSeconds || 0), Math.floor((end - start) / 1000));
}

function voiceCallStatusLabel(item = {}) {
  const status = String(item.callStatus || item.status || '').toLowerCase();
  if (status === 'ringing') return 'Start calling';
  if (status === 'answered') return 'Answered';
  if (status === 'declined') return 'Call declined';
  if (status === 'missed') return 'Missed call';
  if (status === 'cancelled') return 'Call cancelled';
  if (status === 'failed') return 'Call failed';
  return 'End Call';
}

function renderVoiceCallMessage(message = {}, compact = false) {
  const status = String(message.callStatus || 'ended').toLowerCase();
  const duration = Number(message.durationSeconds || 0);
  const counterpart = isOwnMessage(message) ? (message.calleeName || 'Recipient') : (message.callerName || message.user || 'Caller');
  const durationHtml = ['ended', 'answered'].includes(status) && (duration > 0 || message.callAnsweredAt)
    ? `<small class="chat-call-duration">Duration ${esc(formatCallDuration(status === 'answered' ? Math.max(duration, Math.floor((Date.now() - new Date(message.callAnsweredAt).getTime()) / 1000)) : duration))}</small>`
    : '';
  return `<div class="chat-call-card call-status-${esc(status)} ${compact ? 'compact' : ''}">
    <span class="chat-call-icon">${status === 'missed' || status === 'declined' ? '📵' : '📞'}</span>
    <span class="chat-call-copy"><strong>Voice call</strong><span>${esc(voiceCallStatusLabel(message))} · ${esc(counterpart)}</span>${durationHtml}</span>
  </div>`;
}

function renderChatMessageBody(message = {}, compact = false) {
  if (isVoiceCallMessage(message)) return renderVoiceCallMessage(message, compact);
  return `${message.text ? `<p>${esc(message.text)}</p>` : ''}${renderChatAttachments(message)}`;
}

function currentUserMatchesCallSide(call = {}, side = '') {
  const user = state.currentUser || {};
  const values = side === 'caller'
    ? [call.callerId, call.callerEmail, call.callerName]
    : [call.calleeId, call.calleeEmail, call.calleeName];
  const keys = [user.id, user.email, user.name].map(value => String(value || '').toLowerCase()).filter(Boolean);
  return values.map(value => String(value || '').toLowerCase()).some(value => value && keys.includes(value));
}

function voiceCallPeerName(call = voiceSession.call) {
  if (!call) return 'Call';
  return currentUserMatchesCallSide(call, 'caller') ? (call.calleeName || 'Recipient') : (call.callerName || 'Caller');
}

function voiceCallIsIncoming(call = voiceSession.call) {
  return Boolean(call && currentUserMatchesCallSide(call, 'callee'));
}

function voiceCallIsActive(call = voiceSession.call) {
  return Boolean(call && ['ringing', 'answered'].includes(call.status));
}

function voiceRtcConfig() {
  const iceServers = Array.isArray(state.bootstrap?.rtc?.iceServers) && state.bootstrap.rtc.iceServers.length
    ? state.bootstrap.rtc.iceServers
    : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  return { iceServers, iceCandidatePoolSize: 10 };
}

function syncVoiceCallMessage(call = {}) {
  if (!call.threadKey || !call.id) return;
  if (!appData.chats) appData.chats = {};
  if (!Array.isArray(appData.chats[call.threadKey])) appData.chats[call.threadKey] = [];
  let message = appData.chats[call.threadKey].find(item => String(item.callId || '') === String(call.id));
  if (!message) {
    message = {
      id: `call-message-${call.id}`,
      type: 'call',
      kind: 'voice-call',
      callId: call.id,
      user: call.callerName,
      userEmail: call.callerEmail,
      createdAt: call.createdAt,
      time: new Date(call.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      readBy: []
    };
    appData.chats[call.threadKey].push(message);
  }
  Object.assign(message, {
    callStatus: call.status,
    callStatusLabel: voiceCallStatusLabel(call),
    callStartedAt: call.createdAt,
    callAnsweredAt: call.answeredAt || '',
    callEndedAt: call.endedAt || '',
    durationSeconds: call.status === 'answered' ? liveCallDuration(call) : Number(call.durationSeconds || 0),
    callerName: call.callerName,
    callerEmail: call.callerEmail,
    calleeName: call.calleeName,
    calleeEmail: call.calleeEmail,
    updatedAt: call.updatedAt
  });
}

async function ensureVoiceAudioPermission() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Voice calls require HTTPS and a browser with microphone support.');
  }
  if (voiceSession.localStream?.active) return voiceSession.localStream;
  voiceSession.localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  return voiceSession.localStream;
}

function closePeerConnection() {
  if (voiceSession.peer) {
    try { voiceSession.peer.onicecandidate = null; voiceSession.peer.ontrack = null; voiceSession.peer.close(); } catch (error) {}
  }
  voiceSession.peer = null;
  voiceSession.processedCandidates = new Set();
}

function cleanupVoiceCallMedia(options = {}) {
  stopCallTone();
  closePeerConnection();
  if (voiceSession.localStream) voiceSession.localStream.getTracks().forEach(track => track.stop());
  if (voiceSession.remoteStream) voiceSession.remoteStream.getTracks().forEach(track => track.stop());
  voiceSession.localStream = null;
  voiceSession.remoteStream = null;
  voiceSession.pendingCandidates = [];
  voiceSession.muted = false;
  const audio = qs('#voiceCallRemoteAudio');
  if (audio) { audio.srcObject = null; audio.pause?.(); }
  if (!options.keepCall) voiceSession.call = null;
  renderVoiceCallOverlay();
}

async function sendVoiceCandidate(candidate) {
  if (!candidate) return;
  if (!voiceSession.call?.id) {
    voiceSession.pendingCandidates.push(candidate);
    return;
  }
  try {
    await api(`/api/calls/${encodeURIComponent(voiceSession.call.id)}/candidate`, { method: 'POST', body: JSON.stringify({ candidate }) });
  } catch (error) {
    if (voiceCallIsActive()) console.warn('ICE candidate delivery failed', error);
  }
}

async function flushPendingVoiceCandidates() {
  const pending = voiceSession.pendingCandidates.splice(0);
  for (const candidate of pending) await sendVoiceCandidate(candidate);
}

function createVoicePeerConnection() {
  closePeerConnection();
  const peer = new RTCPeerConnection(voiceRtcConfig());
  voiceSession.peer = peer;
  const stream = voiceSession.localStream;
  stream?.getTracks().forEach(track => peer.addTrack(track, stream));
  peer.onicecandidate = event => { if (event.candidate) sendVoiceCandidate(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate); };
  peer.ontrack = event => {
    if (!voiceSession.remoteStream) voiceSession.remoteStream = new MediaStream();
    event.streams?.[0]?.getTracks().forEach(track => {
      if (!voiceSession.remoteStream.getTracks().some(existing => existing.id === track.id)) voiceSession.remoteStream.addTrack(track);
    });
    const audio = qs('#voiceCallRemoteAudio');
    if (audio) {
      audio.srcObject = event.streams?.[0] || voiceSession.remoteStream;
      audio.play().catch(() => {});
    }
  };
  peer.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(peer.connectionState) && voiceCallIsActive()) {
      toast('Voice connection ended');
      endVoiceCall().catch(() => {});
    }
    renderVoiceCallOverlay();
  };
  return peer;
}

async function applyRemoteVoiceCandidates(call) {
  const peer = voiceSession.peer;
  if (!peer?.remoteDescription) return;
  const ownId = String(state.currentUser?.id || '');
  for (const item of call.iceCandidates || []) {
    if (!item?.id || voiceSession.processedCandidates.has(item.id) || String(item.fromUserId || '') === ownId) continue;
    try {
      await peer.addIceCandidate(new RTCIceCandidate(item.candidate));
      voiceSession.processedCandidates.add(item.id);
    } catch (error) {
      console.warn('Remote ICE candidate rejected', error);
    }
  }
}

function playCallTonePulse(mode = 'incoming') {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!voiceSession.toneContext) voiceSession.toneContext = new AudioContextClass();
    const ctx = voiceSession.toneContext;
    ctx.resume?.().catch(() => {});
    const now = ctx.currentTime;
    const tones = mode === 'incoming' ? [[760, 0, .22], [920, .28, .22]] : [[440, 0, .32]];
    tones.forEach(([frequency, delay, duration]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(mode === 'incoming' ? 0.16 : 0.07, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + .03);
    });
  } catch (error) {}
}

function startCallTone(mode = 'incoming') {
  stopCallTone();
  playCallTonePulse(mode);
  voiceSession.toneTimer = window.setInterval(() => playCallTonePulse(mode), mode === 'incoming' ? 1700 : 2400);
  if (mode === 'incoming' && navigator.vibrate) navigator.vibrate([550, 250, 550, 700, 550, 250, 550]);
}

function stopCallTone() {
  if (voiceSession.toneTimer) window.clearInterval(voiceSession.toneTimer);
  voiceSession.toneTimer = null;
  if (navigator.vibrate) navigator.vibrate(0);
}

function renderVoiceCallOverlay() {
  const root = qs('#voiceCallRoot');
  if (!root) return;
  const call = voiceSession.call;
  if (!call || !state.currentUser) {
    root.innerHTML = '';
    root.classList.remove('active');
    return;
  }
  root.classList.add('active');
  const incoming = voiceCallIsIncoming(call);
  const status = call.status || 'ringing';
  const peer = voiceCallPeerName(call);
  const connected = status === 'answered';
  const terminal = ['ended', 'declined', 'missed', 'cancelled', 'failed'].includes(status);
  const statusText = status === 'ringing'
    ? (incoming ? 'Incoming voice call' : 'Start calling')
    : voiceCallStatusLabel(call);
  const secondary = connected
    ? `Secure voice connection · ${formatCallDuration(liveCallDuration(call))}`
    : terminal
      ? (call.durationSeconds > 0 ? `Duration ${formatCallDuration(call.durationSeconds)}` : (call.endReason || 'Call finished'))
      : (incoming ? 'Your device is ringing' : 'Waiting for answer…');
  const controls = status === 'ringing' && incoming
    ? `<button class="voice-control decline" data-action="decline-voice-call"><span>✕</span><small>Decline</small></button><button class="voice-control answer" data-action="answer-voice-call"><span>☎</span><small>Answer</small></button>`
    : connected
      ? `<button class="voice-control secondary ${voiceSession.muted ? 'active' : ''}" data-action="toggle-voice-mute"><span>${voiceSession.muted ? '🔇' : '🎙️'}</span><small>${voiceSession.muted ? 'Unmute' : 'Mute'}</small></button><button class="voice-control decline" data-action="end-voice-call"><span>☎</span><small>End Call</small></button>`
      : terminal
        ? `<button class="voice-control secondary" data-action="close-voice-call"><span>✓</span><small>Close</small></button>`
        : `<button class="voice-control decline" data-action="end-voice-call"><span>✕</span><small>Cancel</small></button>`;
  root.innerHTML = `<section class="voice-call-overlay call-${esc(status)} ${incoming ? 'incoming' : 'outgoing'}" role="dialog" aria-modal="true" aria-label="Voice call">
    <div class="voice-call-card">
      <div class="voice-call-brand"><img src="/assets/jts-logo.png" alt="JTS"><span>JTS Secure Voice</span></div>
      <div class="voice-call-avatar"><span>${esc(initials(peer))}</span><i></i><i></i><i></i></div>
      <p class="voice-call-eyebrow">${esc(statusText)}</p>
      <h2>${esc(peer)}</h2>
      <p class="voice-call-subtitle">${esc(secondary)}</p>
      ${connected ? `<div class="voice-call-quality"><span></span> Connected</div>` : ''}
      <div class="voice-call-controls">${controls}</div>
    </div>
  </section>`;
  root.querySelectorAll('[data-action]').forEach(button => { button.onclick = () => handleAction(button.dataset.action, button); });
}

function updateVoiceCallSession(call, options = {}) {
  if (!call) return;
  const previousId = voiceSession.call?.id;
  const previousStatus = voiceSession.call?.status;
  voiceSession.call = call;
  syncVoiceCallMessage(call);
  if (call.threadKey && !state.selectedChat) state.selectedChat = call.threadKey;
  if (call.status === 'ringing') {
    const incoming = voiceCallIsIncoming(call);
    if (previousId !== call.id || previousStatus !== 'ringing') startCallTone(incoming ? 'incoming' : 'outgoing');
  } else stopCallTone();
  renderVoiceCallOverlay();
  if (['ended', 'declined', 'missed', 'cancelled', 'failed'].includes(call.status)) {
    cleanupVoiceCallMedia({ keepCall: true });
    if (previousId !== call.id || previousStatus !== call.status) {
      if (voiceSession.terminalTimer) clearTimeout(voiceSession.terminalTimer);
      voiceSession.terminalTimer = setTimeout(() => {
        if (voiceSession.call?.id === call.id) cleanupVoiceCallMedia({ keepCall: false });
      }, options.keepTerminalMs || 6000);
    }
  }
}

async function processVoiceCallUpdate(call) {
  if (!call) return;
  const previousStatus = voiceSession.call?.status;
  updateVoiceCallSession(call);
  if (call.status === 'answered' && currentUserMatchesCallSide(call, 'caller') && voiceSession.peer && !voiceSession.peer.currentRemoteDescription && call.answer) {
    await voiceSession.peer.setRemoteDescription(new RTCSessionDescription(call.answer));
  }
  await applyRemoteVoiceCandidates(call);
  const refreshKey = `${call.id}:${call.status}:${call.updatedAt || ''}`;
  if (refreshKey !== voiceSession.lastDataRefreshKey && (previousStatus !== call.status || !previousStatus)) {
    voiceSession.lastDataRefreshKey = refreshKey;
    try { await loadData(); syncVoiceCallMessage(call); if (state.page === 'chat') renderApp(); } catch (error) {}
  }
}

async function pollVoiceCallsOnce() {
  if (!state.currentUser || voiceSession.busy) return;
  try {
    let call = null;
    if (voiceSession.call?.id) call = await api(`/api/calls/${encodeURIComponent(voiceSession.call.id)}`);
    else {
      const result = await api('/api/calls/active');
      const calls = Array.isArray(result.calls) ? result.calls : [];
      call = calls.find(item => item.status === 'ringing' && currentUserMatchesCallSide(item, 'callee'))
        || calls.find(item => ['ringing', 'answered'].includes(item.status))
        || null;
    }
    if (call) await processVoiceCallUpdate(call);
  } catch (error) {
    if (error.message && !/not found/i.test(error.message)) console.warn('Voice call poll failed', error);
  }
}

function startVoiceCallPolling() {
  stopVoiceCallPolling();
  if (!state.currentUser) return;
  pollVoiceCallsOnce();
  voiceSession.pollTimer = window.setInterval(pollVoiceCallsOnce, 1100);
}

function stopVoiceCallPolling() {
  if (voiceSession.pollTimer) window.clearInterval(voiceSession.pollTimer);
  voiceSession.pollTimer = null;
}

async function requestVoiceCall() {
  const contact = state.selectedChat || roleDefaultChatContact();
  if (!contact) return toast('Select an authorized chat contact first.');
  const entry = chatContactEntry(contact);
  if (state.currentUser?.role !== 'admin' || entry?.type !== 'driver') return startVoiceCall();
  const driver = arr('users').find(user => user.id === entry.userId || String(user.email || '').toLowerCase() === String(entry.userEmail || '').toLowerCase());
  const dispatcher = arr('users').find(user => user.id === entry.dispatcherId || String(user.email || '').toLowerCase() === String(entry.dispatcherEmail || '').toLowerCase());
  const targets = [driver, dispatcher].filter(Boolean);
  if (targets.length <= 1) return startVoiceCall(targets[0]?.id || '');
  openModal('Start voice call', 'Choose which participant in this supervised conversation should receive the call.', `
    <div class="form-grid">
      <label class="field full">Call participant
        <select data-field="voicePeerId">
          ${targets.map(user => `<option value="${esc(user.id)}">${esc(user.name)} · ${esc(user.role)}</option>`).join('')}
        </select>
      </label>
    </div>`, 'Start calling', async () => {
      const data = getFormData(qs('#modalRoot'));
      await startVoiceCall(data.voicePeerId);
    });
}

async function startVoiceCall(peerId = '') {
  if (voiceSession.busy) return;
  if (voiceCallIsActive()) return toast('Another voice call is already active.');
  const contact = state.selectedChat || roleDefaultChatContact();
  if (!contact) return toast('Select an authorized chat contact first.');
  voiceSession.busy = true;
  try {
    await ensureVoiceAudioPermission();
    const peer = createVoicePeerConnection();
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    const call = await api('/api/calls/start', { method: 'POST', body: JSON.stringify({ contact, peerId, offer: peer.localDescription }) });
    updateVoiceCallSession(call);
    await flushPendingVoiceCandidates();
    syncVoiceCallMessage(call);
    if (state.page === 'chat') renderApp();
  } catch (error) {
    cleanupVoiceCallMedia({ keepCall: false });
    throw error;
  } finally {
    voiceSession.busy = false;
  }
}

async function answerVoiceCall(callId = voiceSession.call?.id) {
  if (voiceSession.busy || !callId) return;
  voiceSession.busy = true;
  try {
    const call = await api(`/api/calls/${encodeURIComponent(callId)}`);
    if (call.status !== 'ringing') return updateVoiceCallSession(call);
    if (!currentUserMatchesCallSide(call, 'callee')) throw new Error('This call is not addressed to your account.');
    stopCallTone();
    await ensureVoiceAudioPermission();
    voiceSession.call = call;
    const peer = createVoicePeerConnection();
    await peer.setRemoteDescription(new RTCSessionDescription(call.offer));
    await applyRemoteVoiceCandidates(call);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    const updated = await api(`/api/calls/${encodeURIComponent(call.id)}/answer`, { method: 'POST', body: JSON.stringify({ answer: peer.localDescription }) });
    updateVoiceCallSession(updated);
    await flushPendingVoiceCandidates();
    await loadData();
    syncVoiceCallMessage(updated);
    if (state.page === 'chat') renderApp();
  } finally {
    voiceSession.busy = false;
  }
}

async function declineVoiceCall(callId = voiceSession.call?.id) {
  if (!callId) return;
  const call = await api(`/api/calls/${encodeURIComponent(callId)}/decline`, { method: 'POST', body: JSON.stringify({}) });
  updateVoiceCallSession(call);
  await loadData().catch(() => {});
  if (state.page === 'chat') renderApp();
}

async function endVoiceCall(callId = voiceSession.call?.id) {
  if (!callId) return;
  try {
    const call = await api(`/api/calls/${encodeURIComponent(callId)}/end`, { method: 'POST', body: JSON.stringify({}) });
    updateVoiceCallSession(call);
    await loadData().catch(() => {});
    if (state.page === 'chat') renderApp();
  } catch (error) {
    cleanupVoiceCallMedia({ keepCall: false });
    throw error;
  }
}

function toggleVoiceMute() {
  voiceSession.muted = !voiceSession.muted;
  voiceSession.localStream?.getAudioTracks().forEach(track => { track.enabled = !voiceSession.muted; });
  renderVoiceCallOverlay();
}

function closeVoiceCallOverlay() {
  cleanupVoiceCallMedia({ keepCall: false });
}

async function handleVoiceCallDeepLink(link = {}) {
  if (!link.callId || !state.currentUser) return;
  const call = await api(`/api/calls/${encodeURIComponent(link.callId)}`);
  updateVoiceCallSession(call);
  if (call.threadKey) state.selectedChat = call.threadKey;
  if (link.callAction === 'decline') return declineVoiceCall(call.id);
  if (link.callAction === 'answer') {
    try { return await answerVoiceCall(call.id); }
    catch (error) { toast(`${error.message}. Tap Answer to try again.`); renderVoiceCallOverlay(); }
  }
  renderVoiceCallOverlay();
}

function hasData() { return ['loads', 'drivers', 'fleet', 'brokers', 'docs'].some(key => arr(key).length > 0); }


function isMobileDevice() {
  return window.matchMedia('(max-width: 900px), (pointer: coarse)').matches || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
}
function mobilePlatform() {
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/i.test(ua) || iPadOS) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'mobile';
}
function mobileBrowser() {
  const ua = navigator.userAgent || '';
  if (/CriOS|Chrome/i.test(ua) && !/Edg/i.test(ua)) return 'chrome';
  if (/EdgA|EdgiOS|Edg/i.test(ua)) return 'edge';
  if (/FxiOS|Firefox/i.test(ua)) return 'firefox';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Safari/i.test(ua) && !/Chrome|CriOS|FxiOS|Edg/i.test(ua)) return 'safari';
  return 'browser';
}
function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true || document.referrer.startsWith('android-app://');
}
function localBool(key) { return localStorage.getItem(key) === 'true'; }
function markInstallAcknowledged() {
  localStorage.setItem(PWA_INSTALL_ACK_KEY, 'true');
  dismissMobilePrompt();
}
function shouldShowInstallPrompt() {
  if (!isMobileDevice()) return false;
  if (isStandaloneApp()) return false;
  return true;
}
function notificationLaunchCount() {
  return Number(localStorage.getItem(NOTIFICATION_LAUNCH_COUNT_KEY) || 0);
}
function incrementNotificationLaunchCount() {
  if (!isStandaloneApp()) return;
  const next = notificationLaunchCount() + 1;
  localStorage.setItem(NOTIFICATION_LAUNCH_COUNT_KEY, String(next));
}
function shouldShowNotificationPrompt() {
  if (!isStandaloneApp()) return false;
  if (!('Notification' in window)) return false;
  if (localBool(NOTIFICATION_OK_KEY) || Notification.permission === 'granted') return false;
  if (Notification.permission === 'default') return true;
  if (Notification.permission === 'denied') {
    const count = notificationLaunchCount();
    const last = Number(localStorage.getItem(NOTIFICATION_LAST_PROMPT_COUNT_KEY) || 0);
    return count >= 10 && count - last >= 10;
  }
  return false;
}
function dismissMobilePrompt() {
  const root = qs('#mobileInstallRoot');
  if (root) { root.innerHTML = ''; root.classList.remove('blocking'); }
}
function installInstructionsHtml(platform) {
  const browser = mobileBrowser();
  if (platform === 'ios') {
    if (browser !== 'safari') {
      return `
        <ol>
          <li>On iPhone/iPad, open this page in <strong>Safari</strong>. Other iOS browsers may not show Add to Home Screen correctly.</li>
          <li>Tap the <strong>Share</strong> button.</li>
          <li>Choose <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>, then open JTS TMS from the new icon.</li>
        </ol>
        <small>iOS does not allow a website to open the install popup automatically. Apple requires the Share → Add to Home Screen flow.</small>
      `;
    }
    return `
      <ol>
        <li>Tap the <strong>Share</strong> button in Safari.</li>
        <li>Select <strong>Add to Home Screen</strong>.</li>
        <li>Tap <strong>Add</strong>.</li>
        <li>Open JTS TMS from the new Home Screen icon.</li>
      </ol>
      <small>After opening from the icon, JTS TMS runs as an installed PWA. Notifications on iPhone require iOS 16.4 or newer, installed app mode, and notification permission.</small>
    `;
  }
  if (platform === 'android') {
    return `
      <ol>
        <li>Tap <strong>Install Now</strong>. If your browser supports native PWA install, an install popup will appear.</li>
        <li>If no popup appears, open the browser menu <strong>⋮</strong>.</li>
        <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        <li>Confirm <strong>Install</strong>, then open JTS TMS from the new icon.</li>
      </ol>
      <small>Chrome, Edge and Samsung Internet usually support native install. Some browsers only allow Add to Home screen from their menu.</small>
    `;
  }
  return `
    <ol>
      <li>Open your browser menu.</li>
      <li>Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
      <li>Confirm and open JTS TMS from the new icon.</li>
    </ol>
  `;
}
function renderMobilePrompt() {
  const root = qs('#mobileInstallRoot');
  if (!root) return;
  if (shouldShowInstallPrompt()) {
    const platform = mobilePlatform();
    root.classList.add('blocking');
    root.innerHTML = `
      <section class="mobile-install-card install-required-card" role="dialog" aria-label="Install JTS TMS" aria-modal="true">
        <div class="mobile-install-icon">📲</div>
        <div class="mobile-install-copy">
          <strong>Install JTS TMS as an app</strong>
          <p>For security and full mobile features, install JTS TMS on this device before continuing. The app will open fullscreen, faster, and without the browser toolbar.</p>
          ${installInstructionsHtml(platform)}
          <div class="mobile-install-actions">
            <button class="btn btn-primary" type="button" data-pwa-action="install-now">Install Now</button>
            <button class="btn btn-ghost" type="button" data-pwa-action="installed-done">I already added it</button>
          </div>
          <small>This message disappears automatically when you open JTS TMS from the installed app icon. If your browser blocks the popup, follow the steps above.</small>
        </div>
      </section>`;
    bindPwaPromptActions();
    return;
  }
  root.classList.remove('blocking');
  if (shouldShowNotificationPrompt()) {
    const denied = Notification.permission === 'denied';
    root.innerHTML = `
      <section class="mobile-install-card notification-permission-card" role="dialog" aria-label="Enable notifications">
        <button class="mobile-install-close" type="button" data-pwa-action="dismiss-notifications" aria-label="Close">×</button>
        <div class="mobile-install-icon">🔔</div>
        <div class="mobile-install-copy">
          <strong>Enable notifications for JTS TMS</strong>
          <p>${denied ? 'Notifications are blocked in this browser. Enable them from browser/site settings to receive load, chat, GPS and ELD/HOS alerts.' : 'Allow notifications for load assignments, chat messages, missing POD, GPS loss and HOS risk alerts.'}</p>
          ${denied ? '<small>Because notifications are already blocked, the browser cannot show the permission popup again automatically. Enable notifications manually from Site Settings.</small>' : ''}
          <div class="mobile-install-actions">
            <button class="btn btn-primary" type="button" data-pwa-action="enable-notifications">Enable notifications</button>
            <button class="btn btn-ghost" type="button" data-pwa-action="dismiss-notifications">Later</button>
          </div>
        </div>
      </section>`;
    bindPwaPromptActions();
    return;
  }
  root.classList.remove('blocking');
  root.innerHTML = '';
}
function bindPwaPromptActions() {
  qsa('[data-pwa-action]').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.pwaAction;
      if (action === 'dismiss-install') {
        localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
        dismissMobilePrompt();
      }
      if (action === 'installed-done') {
        markInstallAcknowledged();
        toast('JTS TMS install reminder hidden');
      }
      if (action === 'install-now') {
        const platform = mobilePlatform();
        if (platform === 'ios') {
          toast('On iPhone/iPad use Safari Share → Add to Home Screen. iOS does not allow websites to open the install popup automatically.');
          renderMobilePrompt();
          return;
        }
        if (state.deferredInstallPrompt) {
          try {
            await state.deferredInstallPrompt.prompt();
            const choice = await state.deferredInstallPrompt.userChoice.catch(() => null);
            if (choice?.outcome === 'accepted') {
              markInstallAcknowledged();
              toast('JTS TMS installation started');
            } else {
              toast('Install was not accepted. Use the browser menu ⋮ and choose Install app or Add to Home screen.');
            }
          } finally {
            state.deferredInstallPrompt = null;
          }
        } else {
          toast('Your browser did not provide an install popup. Open menu ⋮, choose Install app or Add to Home screen, then tap “I already added it”.');
          renderMobilePrompt();
        }
      }
      if (action === 'dismiss-notifications') {
        localStorage.setItem(NOTIFICATION_LAST_PROMPT_COUNT_KEY, String(notificationLaunchCount()));
        dismissMobilePrompt();
      }
      if (action === 'enable-notifications') {
        await enableBrowserNotifications();
      }
    };
  });
}
async function enableBrowserNotifications() {
  if (!('Notification' in window)) return toast('This browser does not support notifications.');
  if (Notification.permission === 'denied') {
    localStorage.setItem(NOTIFICATION_DENIED_AT_KEY, String(Date.now()));
    localStorage.setItem(NOTIFICATION_LAST_PROMPT_COUNT_KEY, String(notificationLaunchCount()));
    toast('Notifications are blocked. Enable them in browser site settings.');
    renderMobilePrompt();
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      localStorage.setItem(NOTIFICATION_OK_KEY, 'true');
      dismissMobilePrompt();
      toast('Notifications enabled');
      await subscribeForPushNotifications();
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready.catch(() => null);
        if (reg?.showNotification) {
          reg.showNotification('JTS TMS notifications enabled', { body: 'You will receive operational alerts for loads, chat, GPS and ELD/HOS.', icon: '/assets/jts-logo.png', badge: '/assets/jts-logo.png' });
        }
      }
    } else {
      localStorage.setItem(NOTIFICATION_DENIED_AT_KEY, String(Date.now()));
      localStorage.setItem(NOTIFICATION_LAST_PROMPT_COUNT_KEY, String(notificationLaunchCount()));
      toast('Notifications not enabled');
      renderMobilePrompt();
    }
  } catch (error) {
    toast(error.message || 'Notification permission failed');
  }
}
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function subscribeForPushNotifications() {
  const push = state.bootstrap?.push || {};
  if (!push.enabled || !push.publicKey || !state.authToken || !('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(push.publicKey)
      });
    }
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
    return true;
  } catch (error) {
    console.warn('Push subscription failed', error);
    return false;
  }
}

function playChatNotificationTone() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    ctx.resume?.().catch(() => {});
    const now = ctx.currentTime;
    [[880, 0, .12], [1175, .16, .12]].forEach(([frequency, delay, duration]) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.12, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + duration + .03);
    });
    window.setTimeout(() => ctx.close?.().catch(() => {}), 900);
  } catch (error) {}
}

function updateAppBadges() {
  const total = unreadNotificationCount() + unreadChatCount();
  if ('setAppBadge' in navigator && total > 0) navigator.setAppBadge(total).catch(() => {});
  if ('clearAppBadge' in navigator && total <= 0) navigator.clearAppBadge().catch(() => {});
}
async function registerPwaServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try { const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }); await reg.update().catch(() => {}); } catch (error) { console.warn('Service worker registration failed', error); }
}

function readKeysForCurrentUser() {
  return [state.currentUser?.id, state.currentUser?.email, state.currentUser?.name].map(v => String(v || '').toLowerCase().trim()).filter(Boolean);
}
function isOwnMessage(message = {}) {
  return String(message.userEmail || '').toLowerCase() === String(state.currentUser?.email || '').toLowerCase();
}
function isReadByCurrentUser(item = {}) {
  if (item.read === true) return true;
  const readBy = new Set((Array.isArray(item.readBy) ? item.readBy : []).map(v => String(v || '').toLowerCase().trim()));
  return readKeysForCurrentUser().some(key => readBy.has(key));
}
function unreadNotifications() {
  return arr('notifications').filter(item => !isReadByCurrentUser(item));
}
function unreadNotificationCount() { return unreadNotifications().length; }
function unreadMessagesForContact(contact) {
  return (appData.chats?.[contact] || []).filter(message => !isOwnMessage(message) && !isReadByCurrentUser(message));
}
function unreadChatCount() {
  return Object.keys(appData.chats || {}).reduce((sum, contact) => sum + unreadMessagesForContact(contact).length, 0);
}
function badgeHtml(count, className = '') {
  const n = Number(count || 0);
  return n > 0 ? `<span class="unread-badge ${esc(className)}">${n > 99 ? '99+' : n}</span>` : '';
}
function chatDirectoryEntries() {
  return Array.isArray(appData.chatDirectory) ? appData.chatDirectory : [];
}
function chatContactEntry(contact = state.selectedChat) {
  const clean = String(contact || '').toLowerCase();
  return chatDirectoryEntries().find(item => String(item.key || '').toLowerCase() === clean) || null;
}
function chatContactLabel(contact = state.selectedChat) {
  return chatContactEntry(contact)?.label || contact || 'Chat';
}
function chatContactSubtitle(contact = state.selectedChat) {
  return chatContactEntry(contact)?.subtitle || 'Operational communication';
}
function roleDefaultChatContact() {
  return getChatContacts()[0] || '';
}
function lastLocationForDriver(driverName = '') {
  const clean = String(driverName || '').toLowerCase();
  return arr('locations').find(loc => String(loc.driver || '').toLowerCase() === clean) || arr('locations')[0] || null;
}
function mapsPointUrl(location = {}) {
  if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(`${location.lat},${location.lng}`)}`;
}
function mapsEmbedUrl(location = {}) {
  if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lng))) return '';
  return `https://www.google.com/maps?q=${encodeURIComponent(`${location.lat},${location.lng}`)}&z=12&output=embed`;
}
function numberFrom(value) {
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function parseHoursValue(value) {
  if (typeof value === 'number') return value;
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 0;
  const hm = /(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:(\d+(?:\.\d+)?)\s*m)?/.exec(text);
  if (hm) return Number(hm[1]) + (Number(hm[2] || 0) / 60);
  const colon = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (colon) return Number(colon[1]) + Number(colon[2]) / 60;
  return numberFrom(text);
}
function hoursLabel(hours) {
  const value = Math.max(0, Number(hours || 0));
  const h = Math.floor(value);
  const m = Math.round((value - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
function driverHos(driver = {}) {
  const driving = parseHoursValue(driver.drivingHours || driver.driveHours || 0);
  const onDuty = parseHoursValue(driver.onDutyHours || driver.onDuty || 0);
  const offDuty = parseHoursValue(driver.offDutyHours || driver.offDuty || 0);
  const cycleUsed = parseHoursValue(driver.cycleHours || driver.cycleUsed || 0);
  const remainingDrive = Math.max(0, 11 - driving);
  const remainingShift = Math.max(0, 14 - onDuty);
  const cycleLeft = Math.max(0, 70 - cycleUsed);
  const breakDueIn = Math.max(0, 8 - driving);
  return { driving, onDuty, offDuty, cycleUsed, remainingDrive, remainingShift, cycleLeft, breakDueIn };
}
function parseDateCandidate(text) {
  const raw = String(text || '').replace(/\b(CDT|CST|EST|EDT|MST|MDT|PST|PDT)\b/g, '').trim();
  if (!raw) return null;
  const candidates = [];
  const mdyCompact = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2})(\d{2})/.exec(raw);
  if (mdyCompact) candidates.push(`${mdyCompact[1]}/${mdyCompact[2]}/${mdyCompact[3]} ${mdyCompact[4]}:${mdyCompact[5]}`);
  const mdyTime = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/.exec(raw);
  if (mdyTime) candidates.push(`${mdyTime[1]}/${mdyTime[2]}/${mdyTime[3]} ${mdyTime[4]}:${mdyTime[5]}`);
  const monthTime = /([A-Z][a-z]{2,9}\s+\d{1,2},\s*\d{4})\s+(\d{1,2}:\d{2})/.exec(raw);
  if (monthTime) candidates.push(`${monthTime[1]} ${monthTime[2]}`);
  const dateOnly = /([A-Z][a-z]{2,9}\s+\d{1,2},\s*\d{4})/.exec(raw);
  if (dateOnly) candidates.push(`${dateOnly[1]} 23:59`);
  for (const c of candidates) {
    const d = new Date(c);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function latestDeliveryDeadline(load = {}) {
  const text = load.deliveryTime || load.deliveryWindow || load.deliveryDate || '';
  const parts = String(text).split(/\s+-\s+/).filter(Boolean);
  const dateBase = parseDateCandidate(parts[0] || text);
  if (parts.length > 1) {
    const second = parts[1];
    const secondHasDate = /\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Z][a-z]{2,9}\s+\d{1,2}/.test(second);
    const candidate = parseDateCandidate(secondHasDate ? second : `${load.deliveryDate || (dateBase ? dateBase.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '')} ${second}`);
    if (candidate) return candidate;
  }
  return dateBase;
}
function tripRiskForLoad(load = {}, driver = null) {
  const assignedDriver = driver || arr('drivers').find(d => d.name === load.driver) || null;
  const hos = driverHos(assignedDriver || {});
  const miles = Number(load.miles || 0);
  const avgMph = Math.max(35, Number(assignedDriver?.averageMph || appData.company?.defaultAverageMph || 55));
  const drivingNeeded = miles > 0 ? miles / avgMph : 0;
  const breakNeeded = drivingNeeded > hos.breakDueIn && drivingNeeded > 0 ? 0.5 : 0;
  const totalNeeded = drivingNeeded + breakNeeded;
  const deadline = latestDeliveryDeadline(load);
  const eta = totalNeeded > 0 ? new Date(Date.now() + totalNeeded * 3600000) : null;
  let label = 'Needs schedule';
  let className = 'status-new';
  let detail = 'Add miles and delivery appointment for ETA risk.';
  if (miles > 0 && assignedDriver && deadline && eta) {
    const diffHours = (deadline.getTime() - eta.getTime()) / 3600000;
    if (totalNeeded > hos.remainingDrive || totalNeeded > hos.remainingShift || totalNeeded > hos.cycleLeft) {
      label = 'HOS risk'; className = 'status-problem'; detail = `Needs ${hoursLabel(totalNeeded)}; HOS available ${hoursLabel(Math.min(hos.remainingDrive, hos.remainingShift, hos.cycleLeft))}.`;
    } else if (diffHours < 0) {
      label = 'Will be late'; className = 'status-problem'; detail = `ETA ${eta.toLocaleString()} is after appointment.`;
    } else if (diffHours <= 1.5) {
      label = 'Risky'; className = 'status-missing'; detail = `ETA ${eta.toLocaleString()} leaves ${hoursLabel(diffHours)} buffer.`;
    } else {
      label = 'On time'; className = 'status-delivered'; detail = `ETA ${eta.toLocaleString()} with ${hoursLabel(diffHours)} buffer.`;
    }
  } else if (miles > 0 && assignedDriver) {
    label = 'HOS estimate'; className = totalNeeded > hos.remainingDrive || totalNeeded > hos.remainingShift ? 'status-problem' : 'status-assigned'; detail = `Need ${hoursLabel(totalNeeded)} drive/route time. Add delivery time for on-time risk.`;
  }
  return { label, className, detail, eta, drivingNeeded, breakNeeded, totalNeeded, hos, deadline };
}
function riskBadge(load) {
  const risk = tripRiskForLoad(load);
  return `<span class="status-pill ${risk.className}" title="${esc(risk.detail)}">${esc(risk.label)}</span>`;
}

/* =========================================================================
   FINANCIAL REPORTING: Gross (driver) / Cut (dispatch) / Net Profit
   Mirrors ITS Dispatch style Customers / Dispatchers / Drivers report tabs,
   plus a shared "Ship Date" range filter and Dashboard gauge/line charts.
   ========================================================================= */
function loadCutPercent(load = {}) {
  const value = Number(load.cutPercent);
  if (Number.isFinite(value) && value >= 0) return value;
  const fallback = Number(appData.company?.defaultCutPercent);
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 10;
}
function loadCutAmount(load = {}) {
  const value = Number(load.cutAmount);
  if (Number.isFinite(value)) return value;
  return Math.round(Number(load.rate || 0) * loadCutPercent(load) / 100 * 100) / 100;
}
function loadDriverGross(load = {}) {
  const value = Number(load.driverGrossAmount);
  if (Number.isFinite(value)) return value;
  return Math.round((Number(load.rate || 0) - loadCutAmount(load)) * 100) / 100;
}
function loadNetProfit(load = {}) {
  const value = Number(load.netProfit);
  if (Number.isFinite(value)) return value;
  return Math.round((loadCutAmount(load) - Number(load.otherCosts || 0)) * 100) / 100;
}
function loadRevenuePerMile(load = {}) {
  const miles = Number(load.miles || 0);
  if (miles <= 0) return 0;
  return Math.round((Number(load.rate || 0) / miles) * 100) / 100;
}
function loadEmptyMiles(load = {}) { return Math.max(0, Number(load.emptyMiles || 0)); }

function loadShipDate(load = {}) {
  const parsed = parseDateCandidate(load.pickupDate || load.pickupTime || load.pickupWindow || '');
  if (parsed) return parsed;
  if (load.createdAt) { const d = new Date(load.createdAt); if (!Number.isNaN(d.getTime())) return d; }
  return null;
}

const REPORT_RANGE_PRESETS = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['this-week', 'This Week-To-Date'],
  ['last-week', 'Last Week'],
  ['month-to-date', 'This Month-To-Date'],
  ['last-month', 'Last Month'],
  ['this-year', 'This Year-To-Date'],
  ['all', 'All Time'],
  ['custom', 'Custom Range']
];
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }
function reportRangeFromPreset(preset = 'month-to-date') {
  const now = new Date();
  const today = startOfDay(now);
  if (preset === 'today') return { from: today, to: endOfDay(now) };
  if (preset === 'yesterday') { const y = new Date(today); y.setDate(y.getDate() - 1); return { from: y, to: endOfDay(y) }; }
  if (preset === 'this-week') { const d = new Date(today); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return { from: d, to: endOfDay(now) }; }
  if (preset === 'last-week') { const d = new Date(today); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day - 7); const end = new Date(d); end.setDate(end.getDate() + 6); return { from: d, to: endOfDay(end) }; }
  if (preset === 'last-month') { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); const end = new Date(now.getFullYear(), now.getMonth(), 0); return { from: d, to: endOfDay(end) }; }
  if (preset === 'this-year') return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
  if (preset === 'all') return { from: new Date(2000, 0, 1), to: endOfDay(now) };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
}
function effectiveReportRange() {
  const filter = state.reportFilter || { preset: 'month-to-date', from: '', to: '' };
  if (filter.preset === 'custom' && filter.from && filter.to) {
    return { from: startOfDay(new Date(filter.from)), to: endOfDay(new Date(filter.to)) };
  }
  return reportRangeFromPreset(filter.preset || 'month-to-date');
}
function isoDateInput(date) {
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}
function loadsInReportRange() {
  const { from, to } = effectiveReportRange();
  return arr('loads').filter(load => {
    const d = loadShipDate(load);
    if (!d) return true;
    return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
  });
}
function renderReportRangeBar(context = 'reports') {
  const filter = state.reportFilter || { preset: 'month-to-date', from: '', to: '' };
  const range = effectiveReportRange();
  return `
    <div class="card card-pad report-range-bar" data-report-context="${esc(context)}">
      <div class="report-range-row">
        <label class="field">Date range
          <select data-report-action="preset">
            ${REPORT_RANGE_PRESETS.map(([value, label]) => `<option value="${value}" ${filter.preset === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
          </select>
        </label>
        <label class="field">From
          <input type="date" data-report-action="from" value="${esc(isoDateInput(range.from))}" ${filter.preset === 'custom' ? '' : 'disabled'}>
        </label>
        <label class="field">To
          <input type="date" data-report-action="to" value="${esc(isoDateInput(range.to))}" ${filter.preset === 'custom' ? '' : 'disabled'}>
        </label>
        <button class="btn btn-primary" data-report-action="update" type="button">Update</button>
      </div>
      <p class="card-subtitle report-range-caption">Ship date basis: pickup date/time, falling back to record creation date when not available. Showing ${esc(range.from.toLocaleDateString())} &ndash; ${esc(range.to.toLocaleDateString())}.</p>
    </div>`;
}
function bindReportRangeBar() {
  qsa('[data-report-context]').forEach(bar => {
    const presetSelect = bar.querySelector('[data-report-action="preset"]');
    const fromInput = bar.querySelector('[data-report-action="from"]');
    const toInput = bar.querySelector('[data-report-action="to"]');
    const updateBtn = bar.querySelector('[data-report-action="update"]');
    if (presetSelect) presetSelect.onchange = () => {
      state.reportFilter = state.reportFilter || {};
      state.reportFilter.preset = presetSelect.value;
      if (presetSelect.value === 'custom') {
        const range = effectiveReportRange();
        state.reportFilter.from = isoDateInput(range.from);
        state.reportFilter.to = isoDateInput(range.to);
      }
      renderApp();
    };
    if (updateBtn) updateBtn.onclick = () => {
      state.reportFilter = state.reportFilter || {};
      state.reportFilter.preset = presetSelect.value;
      state.reportFilter.from = fromInput?.value || '';
      state.reportFilter.to = toInput?.value || '';
      renderApp();
    };
  });
}

function aggregateCustomerFinancials() {
  const loads = loadsInReportRange();
  const map = new Map();
  loads.forEach(load => {
    const name = String(load.broker || '').trim() || 'Unassigned';
    if (!map.has(name)) map.set(name, { name, loads: 0, gross: 0, cut: 0, net: 0, open: 0, delivered: 0, completed: 0 });
    const row = map.get(name);
    row.loads += 1;
    row.gross += loadDriverGross(load);
    row.cut += loadCutAmount(load);
    row.net += loadNetProfit(load);
    const status = String(load.status || '').toLowerCase();
    if (status === 'delivered') row.delivered += 1;
    else if (['completed', 'closed'].includes(status)) row.completed += 1;
    else row.open += 1;
  });
  return [...map.values()].sort((a, b) => b.gross - a.gross);
}
function aggregateDispatcherFinancials() {
  const loads = loadsInReportRange();
  const dispatchers = arr('users').filter(user => user.role === 'dispatcher');
  const map = new Map();
  dispatchers.forEach(dispatcher => map.set(dispatcher.id, { name: dispatcher.name, loads: 0, gross: 0, cut: 0, net: 0, open: 0 }));
  loads.forEach(load => {
    const driver = arr('drivers').find(d => d.name === load.driver) || arr('users').find(u => u.role === 'driver' && (u.name === load.driver || u.email === load.driverEmail));
    const dispatcherUser = driver ? assignedDispatcherLookup(driver) : null;
    const key = dispatcherUser?.id || 'unassigned';
    const label = dispatcherUser?.name || 'Unassigned';
    if (!map.has(key)) map.set(key, { name: label, loads: 0, gross: 0, cut: 0, net: 0, open: 0 });
    const row = map.get(key);
    row.loads += 1;
    row.gross += loadDriverGross(load);
    row.cut += loadCutAmount(load);
    row.net += loadNetProfit(load);
    if (load.status !== 'Delivered') row.open += 1;
  });
  return [...map.values()].sort((a, b) => b.gross - a.gross);
}
function assignedDispatcherLookup(driverOrUser) {
  const users = arr('users');
  if (!driverOrUser) return null;
  if (driverOrUser.dispatcherId || driverOrUser.dispatcherEmail) {
    return users.find(u => u.role === 'dispatcher' && (u.id === driverOrUser.dispatcherId || u.email === driverOrUser.dispatcherEmail)) || null;
  }
  const linkedUser = users.find(u => u.role === 'driver' && (u.name === driverOrUser.name || u.email === driverOrUser.email));
  if (linkedUser) return users.find(u => u.role === 'dispatcher' && (u.id === linkedUser.dispatcherId || u.email === linkedUser.dispatcherEmail)) || null;
  return null;
}
function aggregateDriverFinancials() {
  const loads = loadsInReportRange();
  const map = new Map();
  loads.forEach(load => {
    const name = String(load.driver || '').trim() || 'Unassigned';
    if (!map.has(name)) map.set(name, { name, loads: 0, gross: 0, cut: 0, miles: 0, emptyMiles: 0, revenueTotal: 0 });
    const row = map.get(name);
    row.loads += 1;
    row.gross += loadDriverGross(load);
    row.cut += loadCutAmount(load);
    row.miles += Number(load.miles || 0);
    row.emptyMiles += loadEmptyMiles(load);
    row.revenueTotal += Number(load.rate || 0);
  });
  return [...map.values()].map(row => ({ ...row, revenuePerMile: row.miles > 0 ? Math.round((row.revenueTotal / row.miles) * 100) / 100 : 0 })).sort((a, b) => b.gross - a.gross);
}
function financeSummaryRow(rows, columns) {
  const totals = {};
  columns.forEach(col => { totals[col] = rows.reduce((sum, row) => sum + Number(row[col] || 0), 0); });
  return totals;
}

/* ---- Lightweight SVG gauge + line chart widgets (no external chart library) ---- */
function svgGauge({ label, value, max = 100, suffix = '', good = 'high' }) {
  const clamped = Math.max(0, Math.min(max, Number(value) || 0));
  const pct = max > 0 ? clamped / max : 0;
  const angle = -90 + pct * 180;
  const radius = 70;
  const cx = 90, cy = 90;
  const toRad = deg => (deg * Math.PI) / 180;
  const needleX = cx + radius * 0.78 * Math.cos(toRad(angle));
  const needleY = cy + radius * 0.78 * Math.sin(toRad(angle));
  const colorStops = good === 'high'
    ? ['#e14f4f', '#f2b705', '#15b981']
    : ['#15b981', '#f2b705', '#e14f4f'];
  const arcSegments = 30;
  let arcs = '';
  for (let i = 0; i < arcSegments; i += 1) {
    const startDeg = -90 + (180 / arcSegments) * i;
    const endDeg = -90 + (180 / arcSegments) * (i + 1);
    const x1 = cx + radius * Math.cos(toRad(startDeg));
    const y1 = cy + radius * Math.sin(toRad(startDeg));
    const x2 = cx + radius * Math.cos(toRad(endDeg));
    const y2 = cy + radius * Math.sin(toRad(endDeg));
    const t = i / arcSegments;
    const color = t < 0.34 ? colorStops[0] : t < 0.67 ? colorStops[1] : colorStops[2];
    arcs += `<path d="M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}" stroke="${color}" stroke-width="14" fill="none" stroke-linecap="butt" opacity="0.85"/>`;
  }
  return `
    <div class="gauge-widget">
      <svg viewBox="0 0 180 118" class="gauge-svg" role="img" aria-label="${esc(label)} gauge">
        ${arcs}
        <line x1="${cx}" y1="${cy}" x2="${needleX.toFixed(1)}" y2="${needleY.toFixed(1)}" stroke="#2b3238" stroke-width="3" stroke-linecap="round"/>
        <circle cx="${cx}" cy="${cy}" r="6" fill="#2b3238"/>
        <text x="${cx}" y="${cy + 30}" text-anchor="middle" class="gauge-value">${esc(clamped)}${esc(suffix)}</text>
      </svg>
      <div class="gauge-scale"><span>0${suffix}</span><span>${esc(max)}${suffix}</span></div>
    </div>`;
}
function svgLineChart({ points = [], color = '#0aa9a5', height = 150, valueFormatter = v => v }) {
  if (!points.length) return `<div class="linechart-empty">No data in this range yet.</div>`;
  const width = 100;
  const values = points.map(p => Number(p.value) || 0);
  const maxVal = Math.max(1, ...values);
  const minVal = Math.min(0, ...values);
  const span = maxVal - minVal || 1;
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * stepX : width / 2;
    const y = height - ((Number(p.value) - minVal) / span) * (height - 20) - 10;
    return { x, y, label: p.label, value: p.value };
  });
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(' ');
  const areaPath = `${path} L ${coords[coords.length - 1].x.toFixed(2)} ${height} L ${coords[0].x.toFixed(2)} ${height} Z`;
  const dots = coords.map(c => `<circle cx="${c.x.toFixed(2)}" cy="${c.y.toFixed(2)}" r="1.6" fill="${color}"><title>${esc(c.label)}: ${esc(valueFormatter(c.value))}</title></circle>`).join('');
  const labelStep = Math.max(1, Math.floor(coords.length / 5));
  const labels = coords.filter((c, i) => i % labelStep === 0 || i === coords.length - 1).map(c => `<span>${esc(c.label)}</span>`).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="linechart-svg">
      <path d="${areaPath}" fill="${color}" opacity="0.08"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="1.4" vector-effect="non-scaling-stroke"></path>
      ${dots}
    </svg>
    <div class="linechart-labels">${labels}</div>`;
}
function dailyBuckets(loads, valueFn, days = 21) {
  const buckets = [];
  const today = startOfDay(new Date());
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    buckets.push({ date: day, label: day.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }), value: 0 });
  }
  loads.forEach(load => {
    const d = loadShipDate(load);
    if (!d) return;
    const dayKey = startOfDay(d).getTime();
    const bucket = buckets.find(b => b.date.getTime() === dayKey);
    if (bucket) bucket.value += valueFn(load);
  });
  return buckets;
}

function liveGpsUrl() {
  const company = appData.company || {};
  const direct = cleanExternalUrl(company.gpsIframeUrl || company.liveGpsUrl || company.gpsOpenUrl || '');
  if (direct) return direct;
  const load = arr('loads').find(item => cleanExternalUrl(item.gpsUrl || item.gpsIframeUrl || item.trackingUrl || item.mapUrl || ''));
  return load ? cleanExternalUrl(load.gpsUrl || load.gpsIframeUrl || load.trackingUrl || load.mapUrl || '') : '';
}
function liveGpsProvider() {
  return appData.company?.gpsProviderName || appData.company?.gpsProvider || arr('loads').find(load => load.gpsProvider)?.gpsProvider || 'Live GPS';
}
function scheduleText(load, side) {
  if (!load) return '';
  const direct = load[`${side}Time`];
  const date = load[`${side}Date`];
  const appt = load[`${side}Appointment`] || load[`${side}Window`];
  return direct || [date, appt].filter(Boolean).join(' · ');
}
function stopRefText(load, side) {
  if (!load) return '';
  return load[`${side}Number`] || load.reference || '';
}
function liveGpsFrame(className = '') {
  const url = liveGpsUrl();
  if (!url) {
    return `<div class="map-visual ${esc(className)}"><div class="route-line"></div><span class="map-pin pin-a"></span><span class="map-pin pin-b"></span><span class="map-pin pin-c"></span><strong>Live GPS not configured</strong><p>Paste iframe URL in Settings or upload a document with GPS iframe/link.</p></div>`;
  }
  return `<div class="gps-frame ${esc(className)}"><iframe title="JTS Live GPS" src="${esc(url)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>`;
}
function routeMapUrl(load) {
  const gps = cleanExternalUrl(load?.gpsUrl || load?.gpsIframeUrl || load?.trackingUrl || load?.mapUrl || '') || liveGpsUrl();
  if (gps) return gps;
  if (load?.pickup && load?.delivery) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(load.pickup)}&destination=${encodeURIComponent(load.delivery)}`;
  }
  if (load?.pickup || load?.delivery) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(load.pickup || load.delivery)}`;
  return '';
}
function canManageOperations() { return ['admin', 'dispatcher'].includes(state.currentUser?.role); }
function canManageSettings() { return state.currentUser?.role === 'admin'; }

function storedToken() { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }
function storedUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null'); }
  catch (error) { return null; }
}

function clearSession() {
  stopVoiceCallPolling();
  stopLiveDataSync();
  cleanupVoiceCallMedia({ keepCall: false });
  state.currentUser = null;
  state.authToken = '';
  state.role = 'admin';
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

async function api(url, options = {}) {
  const token = storedToken();
  const existingHeaders = options.headers || {};
  const headers = options.body instanceof FormData ? { ...existingHeaders } : { 'Content-Type': 'application/json', ...existingHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  const payload = type.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && !url.includes('/api/login') && !url.includes('/api/setup') && !url.includes('/api/bootstrap')) {
      clearSession();
      showLogin(true);
    }
    throw new Error(payload.error || payload || 'Request failed');
  }
  return payload;
}

function showLogin(hasUsers = true) {
  qs('#appShell')?.classList.add('is-hidden');
  qs('#loginScreen')?.classList.remove('is-hidden');
  qs('#setupForm')?.classList.toggle('is-hidden', hasUsers);
  qs('#loginForm')?.classList.toggle('is-hidden', !hasUsers);
  dismissMobilePrompt();
  const subtitle = qs('#loginSubtitle');
  if (subtitle) subtitle.textContent = hasUsers
    ? 'Secure access for administrators, dispatchers, drivers, and brokers.'
    : 'Create the first administrator account to start using real production data.';
}

async function startSession(payload) {
  state.currentUser = payload.user;
  state.authToken = payload.token || '';
  state.role = payload.user.role;
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(payload.user));
  localStorage.setItem(AUTH_TOKEN_KEY, state.authToken);
  await loadData();
  await loadSystemHealth();
  qs('#loginScreen').classList.add('is-hidden');
  qs('#appShell').classList.remove('is-hidden');
  incrementNotificationLaunchCount();
  state.page = state.role === 'driver' ? 'driver-mobile' : 'dashboard';
  if (state.pendingDeepLink) await applyDeepLink(state.pendingDeepLink, { render: false });
  renderApp();
  startVoiceCallPolling();
  startLiveDataSync();
  if (('Notification' in window) && Notification.permission === 'granted') subscribeForPushNotifications();
  if (state.currentUser?.requiresPasswordChange) setTimeout(openForcePasswordModal, 50);
}

async function restoreSession() {
  const token = storedToken();
  const user = storedUser();
  if (!token || !user) return false;
  state.authToken = token;
  state.currentUser = user;
  state.role = user.role;
  try {
    await loadData();
    await loadSystemHealth();
    qs('#loginScreen').classList.add('is-hidden');
    qs('#appShell').classList.remove('is-hidden');
    incrementNotificationLaunchCount();
    if (!canOpen(state.page)) state.page = state.role === 'driver' ? 'driver-mobile' : 'dashboard';
    if (state.pendingDeepLink) await applyDeepLink(state.pendingDeepLink, { render: false });
    renderApp();
    startVoiceCallPolling();
    startLiveDataSync();
    if (('Notification' in window) && Notification.permission === 'granted') subscribeForPushNotifications();
    if (state.currentUser?.requiresPasswordChange) setTimeout(openForcePasswordModal, 50);
    return true;
  } catch (error) {
    clearSession();
    return false;
  }
}

function liveDataRevision(data = appData) {
  const compact = items => (Array.isArray(items) ? items : []).map(item => [
    item.id || '', item.status || '', item.updatedAt || '', item.approvedAt || '', item.rejectedAt || '', item.readBy?.length || 0
  ]);
  const chats = Object.entries(data.chats || {}).map(([key, messages]) => {
    const latest = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : {};
    return [key, messages?.length || 0, latest?.id || '', latest?.updatedAt || latest?.createdAt || '', latest?.readBy?.length || 0];
  });
  return JSON.stringify({
    docs: compact(data.docs),
    loads: compact(data.loads),
    notifications: compact(data.notifications),
    calls: compact(data.calls),
    chats
  });
}

async function loadData() {
  appData = { ...emptyData(), ...(await api('/api/data')) };
  appData.company = { ...emptyData().company, ...(appData.company || {}) };
  if (!appData.chats || Array.isArray(appData.chats)) appData.chats = {};
  const seenNotificationIds = new Set();
  const seenNotificationKeys = new Set();
  appData.notifications = (Array.isArray(appData.notifications) ? appData.notifications : []).filter(item => {
    const id = String(item.id || '').trim();
    if (id && seenNotificationIds.has(id)) return false;
    if (id) seenNotificationIds.add(id);
    const createdBucket = Math.floor(new Date(item.createdAt || 0).getTime() / 30000);
    const key = [item.title, item.text || item.message, item.relatedLoadId, item.relatedDocId, item.relatedChatContact, createdBucket]
      .map(value => String(value || '').toLowerCase().trim()).join('|');
    if (seenNotificationKeys.has(key)) return false;
    seenNotificationKeys.add(key);
    return true;
  });
  state.liveDataRevision = liveDataRevision(appData);
}

async function syncLiveData(options = {}) {
  if (!state.currentUser || liveDataSyncBusy || (!options.force && document.hidden)) return false;
  liveDataSyncBusy = true;
  const previousRevision = state.liveDataRevision || liveDataRevision(appData);
  const pageRoot = qs('#pageRoot');
  const pageScroll = pageRoot?.scrollTop || 0;
  const windowScroll = window.scrollY || 0;
  try {
    await loadData();
    const changed = state.liveDataRevision !== previousRevision;
    if (!changed && !options.forceRender) return false;
    const active = document.activeElement;
    const editing = active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName);
    const modalOpen = qs('#modalRoot')?.classList.contains('active');
    if (!editing && !modalOpen || state.page === 'driver-mobile' || options.forceRender) {
      renderApp();
      requestAnimationFrame(() => {
        if (pageRoot) pageRoot.scrollTop = pageScroll;
        window.scrollTo(0, windowScroll);
      });
    } else {
      renderShellIndicators();
      updateAppBadges();
    }
    return true;
  } catch (error) {
    if (!/login session|required|unauthorized/i.test(error.message || '')) console.warn('Live data sync failed', error);
    return false;
  } finally {
    liveDataSyncBusy = false;
  }
}

function startLiveDataSync() {
  stopLiveDataSync();
  if (!state.currentUser) return;
  liveDataTimer = window.setInterval(() => syncLiveData(), LIVE_DATA_SYNC_MS);
}

function stopLiveDataSync() {
  if (liveDataTimer) window.clearInterval(liveDataTimer);
  liveDataTimer = null;
}

async function loadSystemHealth() {
  try {
    const response = await fetch('/health', { cache: 'no-store' });
    state.systemHealth = response.ok ? await response.json() : null;
  } catch (error) {
    state.systemHealth = null;
  }
}

async function refresh() {
  await loadData();
  await loadSystemHealth();
  renderApp();
}

function statusClass(value) {
  const clean = String(value || '').toLowerCase();
  if (clean.includes('problem') || clean.includes('delayed') || clean.includes('rejected') || clean.includes('refused') || clean.includes('alert')) return 'status-problem';
  if (clean.includes('completed')) return 'status-completed';
  if (clean.includes('delivered') || clean.includes('approved') || clean.includes('available') || clean.includes('current') || clean.includes('active')) return 'status-delivered';
  if (clean.includes('on route') || clean.includes('in transit') || clean.includes('driving')) return 'status-transit';
  if (clean.includes('at pickup') || clean === 'pickup' || clean.includes('loading')) return 'status-atpickup';
  if (clean.includes('at delivery') || clean.includes('unloading')) return 'status-atdelivery';
  if (clean.includes('missing') || clean.includes('maintenance') || clean.includes('disabled')) return 'status-missing';
  if (clean.includes('uploaded') || clean.includes('dispatched') || clean.includes('assigned') || clean.includes('covered')) return 'status-assigned';
  if (clean === 'open' || clean.includes('pending')) return 'status-open';
  return 'status-new';
}

function rtsClass(value) {
  const clean = String(value || '').toLowerCase();
  if (!clean || clean.includes('not checked')) return 'status-new';
  if (clean.includes('approved') || clean.includes('good') || clean.includes('current') || clean.includes('active')) return 'status-delivered';
  if (clean.includes('hold') || clean.includes('blocked') || clean.includes('bad') || clean.includes('denied') || clean.includes('failed')) return 'status-problem';
  if (clean.includes('manual') || clean.includes('review') || clean.includes('pending') || clean.includes('missing') || clean.includes('credential')) return 'status-missing';
  return statusClass(value);
}

function rtsStatusBadge(load = {}) {
  const mc = load.rtsMcNumber || load.brokerMc || load.mcNumber || '';
  const status = load.rtsStatus || (mc ? 'Not checked' : 'No MC');
  const checked = load.rtsCheckedAt ? `<small>${esc(formatDateTime(load.rtsCheckedAt))}</small>` : '';
  const message = load.rtsMessage ? `<small class="muted">${esc(load.rtsMessage)}</small>` : '';
  return `<div class="rts-status-mini"><span class="status-pill ${rtsClass(status)}">${esc(status)}</span>${mc ? `<small>MC ${esc(mc)}</small>` : '<small>No MC number</small>'}${checked}${message}</div>`;
}

function rtsResultHtml(result = {}) {
  const status = result.rtsStatus || result.status || (result.brokerMc || result.mcNumber ? 'Not checked' : 'Enter MC to check');
  const mc = result.rtsMcNumber || result.mcNumber || result.brokerMc || '';
  const source = result.rtsSource || result.source || 'RTS Financial';
  const checkedAt = result.rtsCheckedAt || result.checkedAt || '';
  const message = result.rtsMessage || result.message || '';
  const loginUrl = cleanExternalUrl(result.rtsLoginUrl || result.loginUrl || appData.company?.rtsLoginUrl || '');
  const verifyUrl = cleanExternalUrl(result.rtsVerifyUrl || result.verifyUrl || '');
  const actionLinks = [
    loginUrl ? `<button class="btn btn-soft btn-small" type="button" data-action="open-url" data-url="${esc(loginUrl)}">Open RTS Pro</button>` : '',
    verifyUrl ? `<button class="btn btn-ghost btn-small" type="button" data-action="open-url" data-url="${esc(verifyUrl)}">Open RTS Verify</button>` : ''
  ].filter(Boolean).join('');
  return `
    <div class="rts-result-card">
      <div class="rts-result-main">
        <span class="status-pill ${rtsClass(status)}">${esc(status)}</span>
        <strong>${mc ? `MC ${esc(mc)}` : 'RTS Financial MC Check'}</strong>
        <small>${esc(source)}${checkedAt ? ` · ${esc(formatDateTime(checkedAt))}` : ''}</small>
      </div>
      ${message ? `<p class="muted">${esc(message)}</p>` : ''}
      ${actionLinks ? `<div class="rts-actions">${actionLinks}</div>` : ''}
    </div>
  `;
}

function titleForPage(id) {
  const item = navGroups.flatMap(g => g.items).find(i => i.id === id) || navGroups[0].items[0];
  return item;
}

function canOpen(page) {
  const role = state.currentUser?.role || 'admin';
  const pages = rolePages[role] || rolePages.dispatcher;
  return pages === 'all' || pages.includes(page);
}

function notificationTargetPage(notification = {}) {
  const explicit = String(notification.relatedPage || notification.page || '').trim();
  if (explicit) return explicit;
  const type = `${notification.type || ''} ${notification.title || ''}`.toLowerCase();
  if (notification.callId || type.includes('voice call') || type.includes('incoming call')) return 'chat';
  if (type.includes('chat') || type.includes('message')) return 'chat';
  if (type.includes('document') || type.includes('bol') || type.includes('pod')) return 'documents';
  if (type.includes('gps') || type.includes('location')) return 'gps';
  if (type.includes('eld') || type.includes('hos')) return 'eld';
  if (notification.relatedLoadId || type.includes('load') || type.includes('driver status') || type.includes('delay')) {
    return state.currentUser?.role === 'driver' ? 'driver-mobile' : 'loads';
  }
  return 'notifications';
}

function deepLinkFromNotification(notification = {}) {
  return {
    page: notificationTargetPage(notification),
    loadId: String(notification.relatedLoadId || notification.loadId || ''),
    docId: String(notification.relatedDocId || notification.documentId || ''),
    chatContact: String(notification.relatedChatContact || notification.chatContact || ''),
    notificationId: String(notification.id || ''),
    callId: String(notification.callId || ''),
    callAction: String(notification.callAction || notification.action || ''),
    action: String(notification.action || '')
  };
}

function readDeepLink(input = window.location.href) {
  try {
    const url = new URL(input, window.location.origin);
    const params = url.searchParams;
    const link = {
      page: params.get('page') || '',
      loadId: params.get('load') || '',
      docId: params.get('doc') || '',
      chatContact: params.get('chat') || '',
      notificationId: params.get('notification') || '',
      callId: params.get('call') || '',
      callAction: params.get('callAction') || '',
      action: params.get('action') || ''
    };
    return Object.values(link).some(Boolean) ? link : null;
  } catch (error) {
    return null;
  }
}

function clearDeepLinkFromAddressBar() {
  try {
    const url = new URL(window.location.href);
    ['page', 'load', 'doc', 'chat', 'notification', 'call', 'callAction', 'action'].forEach(key => url.searchParams.delete(key));
    const clean = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, document.title, clean || '/');
  } catch (error) {}
}

function resolveDeepLinkPage(link = {}) {
  let page = link.page || '';
  if (!page && (link.chatContact || link.callId)) page = 'chat';
  if (!page && link.docId) page = 'documents';
  if (!page && link.loadId) page = state.currentUser?.role === 'driver' ? 'driver-mobile' : 'loads';
  if (!page) page = 'notifications';
  if (state.currentUser?.role === 'driver' && link.loadId) page = 'driver-mobile';
  if (!canOpen(page)) {
    if (link.loadId && canOpen('driver-mobile')) page = 'driver-mobile';
    else if (link.loadId && canOpen('loads')) page = 'loads';
    else if (canOpen('notifications')) page = 'notifications';
    else page = (rolePages[state.currentUser?.role] || ['dashboard'])[0] || 'dashboard';
  }
  return page;
}

async function applyDeepLink(link, options = {}) {
  if (!link) return false;
  if (!state.currentUser) {
    state.pendingDeepLink = link;
    return false;
  }
  state.pendingDeepLink = null;
  state.selectedLoadId = link.loadId || '';
  state.selectedDocId = link.docId || '';
  if (link.chatContact) state.selectedChat = link.chatContact;
  state.page = resolveDeepLinkPage(link);
  state.postRenderTarget = { ...link, page: state.page };

  if (link.notificationId) {
    try {
      await api(`/api/notifications/${encodeURIComponent(link.notificationId)}/read`, { method: 'POST', body: JSON.stringify({}) });
      await loadData();
    } catch (error) {}
  }

  clearDeepLinkFromAddressBar();
  if (options.render !== false) renderApp();
  if (link.callId) window.setTimeout(() => handleVoiceCallDeepLink(link).catch(error => toast(error.message)), 120);
  return true;
}

function runPostRenderTarget() {
  const target = state.postRenderTarget;
  if (!target) return;
  state.postRenderTarget = null;
  window.setTimeout(() => {
    if (target.page === 'loads' && target.loadId && state.currentUser?.role !== 'driver') {
      const load = loadById(target.loadId);
      if (load) openLoadDetails(target.loadId);
    }
    if (target.page === 'documents' && target.action === 'upload-confirmation' && target.loadId && canManageOperations()) {
      openUploadModal(target.loadId, 'Load confirmation', false);
      return;
    }
    if (target.page === 'documents' && target.docId) {
      const row = document.querySelector(`[data-doc-id="${CSS.escape(target.docId)}"]`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (target.page === 'driver-mobile' && target.loadId) {
      document.querySelector('[data-driver-active-load]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 80);
}

async function openNotificationTarget(id) {
  const notification = arr('notifications').find(item => String(item.id) === String(id));
  if (!notification) return;
  await applyDeepLink(deepLinkFromNotification(notification));
}

function accessibleGroups() {
  return navGroups.map(group => ({ ...group, items: group.items.filter(item => canOpen(item.id) && !(role() === 'driver' && ['chat','eld','notifications','gps'].includes(item.id))) })).filter(group => group.items.length);
}

// Single dropdown menu (replaces the old persistent side sidebar) used on both desktop and mobile.
function closeNavDropdown() {
  qs('#mobileScrim')?.classList.remove('active');
  qs('#navDropdownPanel')?.classList.remove('open');
  qs('#mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
  qsa('.nav-group.open').forEach(group => group.classList.remove('open'));
}
function toggleNavDropdown() {
  const panel = qs('#navDropdownPanel');
  const scrim = qs('#mobileScrim');
  const btn = qs('#mobileMenuBtn');
  if (!panel) return;
  const willOpen = !panel.classList.contains('open');
  panel.classList.toggle('open', willOpen);
  scrim?.classList.toggle('active', willOpen);
  btn?.setAttribute('aria-expanded', String(willOpen));
}

function navigate(page, options = {}) {
  if (!canOpen(page)) {
    toast('This module is not available for your role.');
    return;
  }
  if (!options.back && !options.replace && page !== state.page) {
    state.pageHistory.push(state.page);
    state.pageHistory = state.pageHistory.slice(-20);
  }
  state.page = page;
  closeNavDropdown();
  renderApp();
}

function goBack() {
  closeNavDropdown();
  while (state.pageHistory.length) {
    const previous = state.pageHistory.pop();
    if (previous && previous !== state.page && canOpen(previous)) {
      navigate(previous, { back: true });
      return;
    }
  }
  const fallback = (rolePages[state.currentUser?.role] === 'all' ? 'dashboard' : (rolePages[state.currentUser?.role] || ['dashboard'])[0]) || 'dashboard';
  navigate(fallback, { back: true, replace: true });
}

function renderNav() {
  const desktopNav = qs('#desktopNav');
  const mobileNavRoot = qs('#mobileBottomNav');
  if (!desktopNav) return;
  desktopNav.innerHTML = accessibleGroups().map((group, groupIndex) => `
    <div class="nav-group">
      <button class="nav-group-title nav-section-trigger" type="button" data-nav-section="${groupIndex}" aria-expanded="true">
        <span>${esc(group.title)}</span><span class="nav-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="nav-group-items">
        ${group.items.map(item => {
          const unread = item.id === 'notifications' ? unreadNotificationCount() : item.id === 'chat' ? unreadChatCount() : 0;
          return `
          <button class="nav-item ${state.page === item.id ? 'active' : ''}" type="button" data-page="${esc(item.id)}" title="${esc(item.label)}">
            <span class="nav-icon">${icons[item.icon]}</span>
            <span class="nav-label">${esc(item.label)}</span>
            ${badgeHtml(unread, 'nav-unread')}
          </button>`;
        }).join('')}
      </div>
    </div>
  `).join('');

  const roleMobile = mobileNav[state.currentUser?.role] || mobileNav.dispatcher;
  const mobileItems = roleMobile.filter(id => canOpen(id)).map(id => titleForPage(id));
  if (mobileNavRoot) {
    mobileNavRoot.innerHTML = mobileItems.map(item => {
      const unread = item.id === 'notifications' ? unreadNotificationCount() : item.id === 'chat' ? unreadChatCount() : 0;
      return `<button class="mobile-nav-item ${state.page === item.id ? 'active' : ''}" type="button" data-page="${esc(item.id)}" aria-label="${esc(item.label)}"><span class="mobile-nav-icon">${icons[item.icon]}</span><span class="mobile-nav-label">${esc(item.label)}</span>${badgeHtml(unread, 'mobile-nav-badge')}</button>`;
    }).join('');
  }

  qsa('[data-page]').forEach(btn => {
    btn.onclick = () => { closeNavDropdown(); navigate(btn.dataset.page); };
  });
  qsa('[data-nav-section]').forEach(btn => {
    btn.onclick = event => {
      event.stopPropagation();
      const group = btn.closest('.nav-group');
      const willOpen = !group?.classList.contains('open');
      group?.classList.toggle('open', willOpen);
      btn.setAttribute('aria-expanded', String(willOpen));
    };
  });
}

function renderApp() {
  if (!canOpen(state.page)) state.page = (rolePages[state.currentUser?.role] || ['dashboard'])[0] || 'dashboard';
  document.body.classList.toggle('driver-session', state.currentUser?.role === 'driver');
  const meta = titleForPage(state.page);
  qs('#pageTitle').textContent = meta.label;
  qs('#pageKicker').textContent = meta.kicker;
  qs('#currentRoleLabel').textContent = state.currentUser?.role || 'admin';
  qs('#currentUserName').textContent = state.currentUser?.name || 'JTS User';
  qs('#currentUserAvatar').textContent = initials(state.currentUser?.name);
  renderNav();
  qs('.quick-search')?.classList.toggle('is-hidden', !state.currentUser);

  const pages = {
    dashboard: renderDashboard,
    dispatch: renderDispatch,
    intake: renderIntake,
    loads: renderLoads,
    'driver-mobile': renderDriverMobile,
    admin: renderAdmin,
    fleet: renderFleet,
    drivers: renderDrivers,
    brokers: renderBrokers,
    documents: renderDocuments,
    chat: renderChat,
    notifications: renderNotifications,
        gps: renderGps,
    fuel: renderFuelPage,
    eld: renderEld,
    dispatchers: renderDispatchers,
    reports: renderReports,
    settings: renderSettings
  };
  qs('#pageRoot').innerHTML = (pages[state.page] || renderDashboard)();
  bindReportRangeBar();
  if (state.page === 'dispatch') bindDispatchBoardControls();
  if (state.page === 'dashboard') bindDashboardTabControls();
  qsa('[data-action="new-load"]').forEach(btn => btn.classList.toggle('is-hidden', !canManageOperations()));
  renderShellIndicators();
  renderFloatingChat();
  bindPageActions();
  updateAppBadges();
  renderMobilePrompt();
  runPostRenderTarget();
  renderVoiceCallOverlay();
}


function renderShellIndicators() {
  const notificationButton = qs('[data-action="notifications"]');
  if (notificationButton) {
    const count = unreadNotificationCount();
    notificationButton.classList.toggle('has-unread', count > 0);
    notificationButton.innerHTML = `<span class="icon-bell"></span>${badgeHtml(count, 'topbar-unread')}`;
  }
}

function renderFloatingChat() {
  const btn = qs('#floatingChatBtn');
  const panel = qs('#floatingChatPanel');
  if (!btn || !panel) return;
  const canChat = canOpen('chat') && Boolean(state.currentUser);
  btn.classList.toggle('is-hidden', !canChat);
  btn.classList.toggle('is-open', Boolean(state.floatingChatOpen));
  panel.classList.toggle('is-hidden', !canChat || !state.floatingChatOpen);
  if (!canChat) return;
  const contacts = getChatContacts();
  if (state.selectedChat && !contacts.includes(state.selectedChat)) state.selectedChat = '';
  if (!state.selectedChat && contacts.length) state.selectedChat = contacts[0];
  const contact = state.selectedChat || roleDefaultChatContact();
  const messages = appData.chats?.[contact] || [];
  btn.innerHTML = `<span class="chat-float-icon" aria-hidden="true"></span>${badgeHtml(unreadChatCount(), 'float-unread')}`;
  panel.innerHTML = `
    <div class="floating-chat-head">
      <div class="floating-chat-title"><strong>JTS Chat</strong><span>${esc(chatContactLabel(contact) || 'Chat')}</span></div>
      <div class="floating-chat-tools"><button class="icon-btn voice-call-trigger" type="button" data-action="start-voice-call" title="Start voice call" aria-label="Start voice call"><span class="voice-phone-icon" aria-hidden="true"></span></button><button class="icon-btn floating-chat-close" type="button" data-action="toggle-floating-chat" title="Close chat" aria-label="Close chat">×</button></div>
    </div>
    <div class="floating-chat-body">
      <div class="floating-chat-contacts">
        ${contacts.length ? contacts.slice(0, 8).map(item => `<button class="floating-contact ${item === contact ? 'active' : ''}" data-chat="${esc(item)}"><span>${esc(chatContactLabel(item))}</span>${badgeHtml(unreadMessagesForContact(item).length)}</button>`).join('') : '<span class="muted">No assigned chat contacts</span>'}
      </div>
      <div class="floating-messages">
        ${messages.slice(-8).map(msg => `<div class="message ${isOwnMessage(msg) ? 'out' : 'in'} ${!isOwnMessage(msg) && !isReadByCurrentUser(msg) ? 'unread-message' : ''} ${isVoiceCallMessage(msg) ? 'call-message' : ''}">${renderChatMessageBody(msg, true)}<span>${esc(msg.time || formatDate(msg.createdAt))}</span></div>`).join('') || '<p class="muted">No messages yet.</p>'}
      </div>
      <div class="floating-chat-input"><button class="icon-btn file-btn" title="Attach images or files" aria-label="Attach images or files"><span>+</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf" data-chat-upload="floating" multiple></button><input id="floatingChatInput" placeholder="Message..." /><button class="btn btn-primary" data-action="send-floating-chat">Send</button></div>
    </div>`;
}

function emptyState(title, text, actionText, action) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icons.loads}</div>
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      ${actionText ? `<button class="btn btn-primary" data-action="${esc(action)}">${esc(actionText)}</button>` : ''}
    </div>
  `;
}

function setupChecklist() {
  const items = [
    ['Users', arr('users').length > 0, 'Create dispatcher, driver, broker and admin accounts.'],
    ['Drivers', arr('drivers').length > 0, 'Add real driver names, contacts, availability and assigned trucks.'],
    ['Fleet', arr('fleet').length > 0, 'Add trucks, trailers, expiration dates and maintenance reminders.'],
    ['Brokers / customers', arr('brokers').length > 0, 'Add real customers, contacts and payment terms.'],
    ['Loads', arr('loads').length > 0, 'Add active and historical loads.'],
    ['Documents', arr('docs').length > 0, 'Upload BOL, POD, rate confirmations and receipts.']
  ];
  return `<div class="setup-checklist">${items.map(([title, done, note]) => `
    <div class="setup-row ${done ? 'done' : ''}">
      <span>${done ? '✓' : '•'}</span>
      <div><strong>${esc(title)}</strong><small>${esc(note)}</small></div>
    </div>
  `).join('')}</div>`;
}

function renderKpis() {
  const loads = arr('loads');
  const activeLoads = loads.filter(load => load.status !== 'Delivered').length;
  const delivered = loads.filter(load => load.status === 'Delivered').length;
  const pendingDocs = arr('docs').filter(doc => ['Missing', 'Rejected'].includes(doc.status)).length + loads.filter(load => ['Missing', 'Rejected'].includes(load.docs)).length;
  const revenue = loads.reduce((sum, load) => sum + Number(load.rate || 0), 0);
  const availableTrucks = arr('fleet').filter(unit => ['Available', 'Ready'].includes(unit.status)).length;
  const kpis = [
    ['Active loads', activeLoads, 'Live operations', 'loads'],
    ['Delivered loads', delivered, todayLabel(), 'truck'],
    ['Pending docs', pendingDocs, 'Needs review', 'doc'],
    ['Trucks available', availableTrucks, 'Capacity', 'truck'],
    ['Revenue summary', money(revenue), 'Loaded from records', 'chart']
  ];
  return `<div class="grid grid-4">${kpis.map(([label, value, trend, icon]) => `
    <article class="card kpi-card">
      <div class="kpi-top"><span class="kpi-icon">${icons[icon]}</span><span class="kpi-trend">${esc(trend)}</span></div>
      <p class="kpi-label">${esc(label)}</p>
      <h3 class="kpi-value">${esc(value)}</h3>
    </article>
  `).join('')}</div>`;
}

function fleetStatusDot(collection, activePredicate) {
  const items = arr(collection);
  const hasActive = items.some(activePredicate);
  return { has: items.length > 0, className: items.length ? (hasActive ? 'status-delivered' : 'status-problem') : 'status-missing' };
}
/* =========================================================================
   DASHBOARD TABS — "My Dashboard" (volume + revenue over time) plus
   Customers / Dispatchers / Drivers tabs with live real-time Gross
   (driver) / Cut / Net Profit split per row. Each dispatcher only ever
   sees their OWN loads on Dispatchers/Customers/Drivers; admins see all.
   ========================================================================= */
function currentDispatcherScopeName() {
  return role() === 'dispatcher' ? (state.currentUser?.name || '') : '';
}
function loadsForCurrentDispatcherScope() {
  const loads = loadsInReportRange();
  if (role() !== 'dispatcher') return loads;
  const dispatcherName = currentDispatcherScopeName();
  const myDrivers = new Set(assignedDriversForDispatcherName(dispatcherName).map(name => name.toLowerCase()));
  return loads.filter(load => {
    if (String(load.dispatcherName || '').toLowerCase() === dispatcherName.toLowerCase()) return true;
    return myDrivers.has(String(load.driver || '').toLowerCase());
  });
}
function assignedDriversForDispatcherName(dispatcherName) {
  const dispatcherUser = arr('users').find(u => u.role === 'dispatcher' && u.name === dispatcherName);
  if (!dispatcherUser) return [];
  return arr('users').filter(u => u.role === 'driver' && (u.dispatcherId === dispatcherUser.id || u.dispatcherEmail === dispatcherUser.email)).map(u => u.name);
}
function scopedAggregateCustomerFinancials() {
  const loads = loadsForCurrentDispatcherScope();
  const map = new Map();
  loads.forEach(load => {
    const name = String(load.broker || '').trim() || 'Unassigned';
    if (!map.has(name)) map.set(name, { name, loads: 0, gross: 0, cut: 0, net: 0, open: 0, delivered: 0, completed: 0 });
    const row = map.get(name);
    row.loads += 1;
    row.gross += loadDriverGross(load);
    row.cut += loadCutAmount(load);
    row.net += loadNetProfit(load);
    if (isDeliveredStatus(load.status)) { if (String(load.status).toLowerCase() === 'completed') row.completed += 1; else row.delivered += 1; }
    else row.open += 1;
  });
  return [...map.values()].sort((a, b) => b.gross - a.gross);
}
function scopedAggregateDispatcherFinancials() {
  if (role() === 'dispatcher') {
    const name = currentDispatcherScopeName();
    const loads = loadsForCurrentDispatcherScope();
    const row = { name, loads: 0, gross: 0, cut: 0, net: 0, open: 0 };
    loads.forEach(load => { row.loads += 1; row.gross += loadDriverGross(load); row.cut += loadCutAmount(load); row.net += loadNetProfit(load); if (!isDeliveredStatus(load.status)) row.open += 1; });
    return [row];
  }
  return aggregateDispatcherFinancials();
}
function scopedAggregateDriverFinancials() {
  const loads = loadsForCurrentDispatcherScope();
  const map = new Map();
  loads.forEach(load => {
    const name = String(load.driver || '').trim() || 'Unassigned';
    if (!map.has(name)) map.set(name, { name, loads: 0, gross: 0, cut: 0, miles: 0, emptyMiles: 0, revenueTotal: 0 });
    const row = map.get(name);
    row.loads += 1;
    row.gross += loadDriverGross(load);
    row.cut += loadCutAmount(load);
    row.miles += Number(load.miles || 0);
    row.emptyMiles += loadEmptyMiles(load);
    row.revenueTotal += Number(load.rate || 0);
  });
  return [...map.values()].map(row => ({ ...row, revenuePerMile: row.miles > 0 ? Math.round((row.revenueTotal / row.miles) * 100) / 100 : 0 })).sort((a, b) => b.gross - a.gross);
}
function renderDashboardTabs() {
  const tab = state.dashboardTab || 'my';
  const tabs = [['my', 'My Dashboard'], ['customers', 'Customers'], ['dispatchers', 'Dispatchers'], ['drivers', 'Drivers']];
  return `
    <div class="card dashboard-tabs-card">
      <div class="dashboard-tabs-row">
        ${tabs.map(([id, label]) => `<button class="dashboard-tab ${tab === id ? 'active' : ''}" type="button" data-dashboard-tab="${id}">${esc(label)}</button>`).join('')}
      </div>
      <div id="dashboardTabBody">${renderDashboardTabBody()}</div>
    </div>
  `;
}
function renderDashboardTabBody() {
  const tab = state.dashboardTab || 'my';
  if (tab === 'customers') return renderDashboardFinanceTable('Customers', scopedAggregateCustomerFinancials(), ['loads', 'gross', 'cut', 'net', 'open', 'delivered', 'completed'], ['# of Loads', 'Gross (Driver)', 'Cut', 'Net Profit', 'Open', 'Delivered', 'Completed']);
  if (tab === 'dispatchers') return renderDashboardFinanceTable('Dispatchers', scopedAggregateDispatcherFinancials(), ['loads', 'gross', 'cut', 'net', 'open'], ['# of Loads', 'Gross (Driver)', 'Cut', 'Net Profit', 'Open Loads']);
  if (tab === 'drivers') return renderDashboardFinanceTable('Drivers', scopedAggregateDriverFinancials(), ['loads', 'gross', 'cut', 'miles', 'emptyMiles'], ['# of Loads', 'Gross (Driver)', 'Cut', 'Miles', 'Empty Miles']);
  return renderDashboardAnalytics();
}
function renderDashboardFinanceTable(title, rows, columns, columnLabels) {
  const totals = financeSummaryRow(rows, columns.filter(c => c !== 'name'));
  const money2 = (col, val) => ['loads', 'open', 'delivered', 'completed', 'miles', 'emptyMiles'].includes(col) ? (val || '-') : money(val);
  return `
    ${renderReportRangeBar('dashboard-tabs')}
    <div class="section-header slim"><div><h3>${esc(title)}</h3><p>Real-time Gross (driver) / Cut / Net split for the selected date range.${role() === 'dispatcher' ? ' Showing your own loads only.' : ''}</p></div></div>
    <div class="table-card">
      <table class="data-table"><thead><tr><th>${esc(title.slice(0, -1) || title)}</th>${columnLabels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>
        ${rows.length ? rows.map(row => `<tr><td data-label="${esc(title)}"><strong>${esc(row.name)}</strong></td>${columns.map(col => `<td data-label="${esc(col)}">${col === 'miles' || col === 'emptyMiles' ? (row[col] || 0).toLocaleString() : money2(col, row[col])}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${columnLabels.length + 1}">${emptyState('No loads in this range', 'Adjust the date range or add real loads to see totals here.', '', '')}</td></tr>`}
        <tr class="finance-summary-row"><td><strong>SUMMARY</strong></td>${columns.map(col => `<td><strong>${col === 'miles' || col === 'emptyMiles' ? (totals[col] || 0).toLocaleString() : money2(col, totals[col])}</strong></td>`).join('')}</tr>
      </tbody></table>
    </div>
  `;
}
function bindDashboardTabControls() {
  qsa('[data-dashboard-tab]').forEach(btn => {
    btn.onclick = () => {
      state.dashboardTab = btn.dataset.dashboardTab;
      const body = qs('#dashboardTabBody');
      if (body) { body.innerHTML = renderDashboardTabBody(); bindReportRangeBar(); qsa('[data-action]', body).forEach(b => { b.onclick = () => handleAction(b.dataset.action, b); }); }
      qsa('[data-dashboard-tab]').forEach(b => b.classList.toggle('active', b.dataset.dashboardTab === state.dashboardTab));
    };
  });
}
function renderDashboardAnalytics() {
  const rangeLoads = loadsInReportRange();
  const openCount = rangeLoads.filter(load => load.status !== 'Delivered').length;
  const totalRevenue = rangeLoads.reduce((sum, load) => sum + Number(load.rate || 0), 0);
  const totalNet = rangeLoads.reduce((sum, load) => sum + loadNetProfit(load), 0);
  const netMarginPct = totalRevenue > 0 ? Math.round((totalNet / totalRevenue) * 1000) / 10 : 0;
  const gaugeMax = Math.max(20, Math.ceil((openCount + 5) / 10) * 10);
  const volumeBuckets = dailyBuckets(rangeLoads, () => 1);
  const revenueBuckets = dailyBuckets(rangeLoads, load => Number(load.rate || 0));
  const milesBuckets = dailyBuckets(rangeLoads, load => Number(load.miles || 0));
  const trailerDot = fleetStatusDot('fleet', unit => String(unit.status || '').toLowerCase() === 'available');
  const truckDot = fleetStatusDot('fleet', unit => String(unit.status || '').toLowerCase() !== 'out of service');
  const carrierDot = fleetStatusDot('drivers', driver => String(driver.status || '').toLowerCase() !== 'off duty');
  const driverDot = fleetStatusDot('drivers', () => true);
  return `
    <div class="section-header slim"><div><h3>Dashboard analytics</h3><p>Open loads, net margin, load volume, gross revenue and truck miles &mdash; ITS-style live snapshot for the selected date range.</p></div></div>
    ${renderReportRangeBar('dashboard')}
    <div class="grid grid-3 analytics-row">
      <div class="card card-pad gauge-card">
        <h4 class="card-title">Open Loads</h4>
        ${svgGauge({ label: 'Open Loads', value: openCount, max: gaugeMax, good: 'low' })}
      </div>
      <div class="card card-pad gauge-card">
        <h4 class="card-title">Net Margin &middot; %</h4>
        ${svgGauge({ label: 'Net Margin', value: netMarginPct, max: 100, suffix: '%', good: 'high' })}
      </div>
      <div class="card card-pad linechart-card">
        <h4 class="card-title">Load Volume</h4>
        <p class="card-subtitle">Loads per day (by ship date)</p>
        ${svgLineChart({ points: volumeBuckets, color: '#0aa9a5' })}
      </div>
    </div>
    <div class="grid grid-3 analytics-row">
      <div class="card card-pad linechart-card">
        <h4 class="card-title">Gross Revenue</h4>
        <p class="card-subtitle">Total rate per day</p>
        ${svgLineChart({ points: revenueBuckets, color: '#1d4ed8', valueFormatter: v => money(v) })}
      </div>
      <div class="card card-pad linechart-card">
        <h4 class="card-title">Truck Miles</h4>
        <p class="card-subtitle">Miles driven per day</p>
        ${svgLineChart({ points: milesBuckets, color: '#5f6267', valueFormatter: v => `${Math.round(v)} mi` })}
      </div>
      <div class="card card-pad fleet-status-card">
        <h4 class="card-title">Fleet status</h4>
        <div class="fleet-status-list">
          <div class="fleet-status-item"><span>Trailers</span><span class="status-dot ${trailerDot.className}"></span></div>
          <div class="fleet-status-item"><span>Trucks</span><span class="status-dot ${truckDot.className}"></span></div>
          <div class="fleet-status-item"><span>Carriers / Drivers on duty</span><span class="status-dot ${carrierDot.className}"></span></div>
          <div class="fleet-status-item"><span>Drivers</span><span class="status-dot ${driverDot.className}"></span></div>
        </div>
      </div>
    </div>
  `;
}
function renderDashboard() {
  const loads = arr('loads');
  const urgent = loads.filter(load => load.status !== 'Delivered').slice(0, 5);
  return `
    <section class="page-section">
      <div class="section-header">
        <div>
          <h3>Daily operations overview</h3>
          <p>Real-time workspace for active loads, driver status, documents, alerts, revenue and GPS shortcuts.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-soft" data-action="open-filters">Filters</button>
          <button class="btn btn-primary" data-action="new-load">+ Add load</button>
        </div>
      </div>
      ${!hasData() ? `<div class="card card-pad production-card"><h3 class="card-title">Production data setup</h3><p class="card-subtitle">This build no longer contains demo operational records. Start by entering or importing real JTS data.</p>${setupChecklist()}<div class="header-actions"><button class="btn btn-primary" data-action="new-load">Add first load</button><button class="btn btn-soft" data-page="settings">Import data</button></div></div>` : ''}
      ${canManageOperations() ? renderDashboardTabs() : ''}
      ${renderKpis()}
      <div class="grid dashboard-layout">
        <div class="grid">
          ${urgent.length ? renderLoadsTable(urgent, 'Priority loads', true) : `<div class="card table-card">${emptyState('No active loads yet', 'Add real loads or import a JSON backup to populate the dispatch board.', 'Add load', 'new-load')}</div>`}
          <div class="card live-map-card">
            <div class="table-toolbar">
              <div>
                <h3>Map / GPS shortcuts</h3>
                <p class="card-subtitle">Open the location page for last known truck positions and navigation links.</p>
              </div>
              <button class="btn btn-soft" data-page="gps">Open GPS</button>
            </div>
            ${liveGpsFrame('dashboard-gps')}
          </div>
        </div>
        <aside class="grid">
          <div class="card card-pad">
            <h3 class="card-title">Quick actions</h3>
            <p class="card-subtitle">Frequently used operational actions.</p>
            <div class="quick-actions-grid" style="margin-top:14px">
              ${[
                ['New load', 'Create dispatch order', 'new-load'],
                ['Assign driver', 'Load, driver and truck', 'assign-driver'],
                ['Document intake', 'Drag-drop auto-fill', 'doc-intake'],
                ['Add account', 'Driver / dispatcher / broker', 'add-user']
              ].map(([title, sub, action]) => `<button class="quick-action-card" data-action="${esc(action)}">${esc(title)}<span>${esc(sub)}</span></button>`).join('')}
            </div>
          </div>
          <div class="card card-pad">
            <h3 class="card-title">Recent activity</h3>
            <p class="card-subtitle">Operational events saved by the system.</p>
            <div class="activity-list" style="margin-top:14px">
              ${arr('auditLog').slice(0, 6).map(item => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(item.action)}</strong><span>${esc(item.entity || '')} · ${esc(formatDate(item.createdAt))}</span></div></div>`).join('') || '<p class="muted">No activity yet.</p>'}
            </div>
          </div>
        </aside>
      </div>
    </section>
  `;
}

/* =========================================================================
   DISPATCH BOARD — ITS-Dispatch-style flat table (no kanban scrolling).
   Two tabs: "Open Loads" (anything not Delivered/Completed/Closed) and
   "Delivered/Completed Loads" (with a Reopen action per row). Data comes
   straight from Loads; a search box filters by Load #, driver, broker,
   truck, pickup or delivery.
   ========================================================================= */
function dispatchBoardFilteredLoads() {
  const loads = arr('loads');
  const board = state.dispatchBoard;
  const tab = board.tab || 'open';
  const search = String(board.search || '').trim().toLowerCase();
  let list = loads.filter(load => tab === 'delivered' ? isDeliveredStatus(load.status) : !isDeliveredStatus(load.status));
  if (search) {
    list = list.filter(load => [load.id, load.refNumber, load.driver, load.broker, load.pickup, load.delivery, load.truck]
      .some(value => String(value || '').toLowerCase().includes(search)));
  }
  return list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
}
function renderDispatch() {
  const board = state.dispatchBoard;
  const tab = board.tab || 'open';
  const allLoads = arr('loads');
  const openCount = allLoads.filter(load => !isDeliveredStatus(load.status)).length;
  const deliveredCount = allLoads.filter(load => isDeliveredStatus(load.status)).length;
  const rows = dispatchBoardFilteredLoads();
  return `
    <section class="page-section dispatch-page">
      <div class="section-header">
        <div>
          <h3>Dispatch Board</h3>
          <p>Live load table pulled directly from Loads. Click a Load # to open the full load workspace.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-soft" data-action="doc-intake">Document intake</button>
          <button class="btn btn-primary" data-action="new-load">+ New load</button>
        </div>
      </div>
      ${canManageOperations() ? renderCompactIntakePanel() : ''}
      <div class="card dispatch-board-card">
        <div class="dispatch-board-toolbar">
          <div class="dispatch-board-tabs">
            <button class="dispatch-tab ${tab === 'open' ? 'active' : ''}" type="button" data-dispatch-tab="open">Open Loads <span class="count-badge">${openCount}</span></button>
            <button class="dispatch-tab ${tab === 'delivered' ? 'active' : ''}" type="button" data-dispatch-tab="delivered">Delivered / Completed Loads <span class="count-badge">${deliveredCount}</span></button>
          </div>
          <input id="dispatchBoardSearch" class="filter-input" placeholder="Find load #, ref #, driver, customer..." value="${esc(board.search || '')}" />
        </div>
        <div id="dispatchBoardTableWrap" class="table-card dispatch-board-table-wrap">${renderDispatchBoardRows(rows, tab)}</div>
      </div>
    </section>
  `;
}
function renderDispatchBoardRows(rows, tab) {
  if (!rows.length) return `${emptyState(tab === 'delivered' ? 'No delivered/completed loads yet' : 'No open loads', tab === 'delivered' ? 'Loads move here automatically once marked Delivered or Completed.' : 'Create or import real loads to start dispatching.', 'Add load', 'new-load')}`;
  return `<table class="data-table dispatch-board-table"><thead><tr>
    <th>Load #</th><th>Ref #</th><th>Driver / Carrier</th><th>Customer</th><th>Origin</th><th>Destination</th><th>Ship Date</th><th>Del Date</th><th>Load Status</th><th>Actions</th>
  </tr></thead><tbody>
    ${rows.map(load => `<tr class="dispatch-row-${statusClass(load.status)}">
      <td data-label="Load #"><button class="link-btn" type="button" data-action="open-load-workspace" data-load="${esc(load.id)}"><strong>${esc(load.id)}</strong></button> ${riskBadge(load)}</td>
      <td data-label="Ref #">${esc(load.refNumber || load.poNumber || '-')}</td>
      <td data-label="Driver / Carrier">${esc(load.driver || 'Unassigned')}</td>
      <td data-label="Customer">${esc(load.broker || '-')}</td>
      <td data-label="Origin">${esc(load.pickup || '-')}</td>
      <td data-label="Destination">${esc(load.delivery || '-')}</td>
      <td data-label="Ship Date">${esc(scheduleText(load, 'pickup') || '-')}</td>
      <td data-label="Del Date">${esc(scheduleText(load, 'delivery') || '-')}</td>
      <td data-label="Load Status"><span class="status-pill ${statusClass(load.status)}">${esc(load.status)}</span></td>
      <td data-label="Actions"><div class="table-actions">
        <button class="action-mini" data-action="open-load-workspace" data-load="${esc(load.id)}">Open</button>
        ${tab === 'delivered' ? `<button class="action-mini action-reopen" data-action="reopen-load" data-load="${esc(load.id)}">Reopen</button>` : `<button class="action-mini" data-action="assign-driver" data-load="${esc(load.id)}">Assign</button>`}
      </div></td>
    </tr>`).join('')}
  </tbody></table>`;
}
function bindDispatchBoardControls() {
  qsa('[data-dispatch-tab]').forEach(btn => {
    btn.onclick = () => { state.dispatchBoard.tab = btn.dataset.dispatchTab; renderApp(); };
  });
  const searchInput = qs('#dispatchBoardSearch');
  if (searchInput) searchInput.oninput = () => {
    state.dispatchBoard.search = searchInput.value;
    const wrap = qs('#dispatchBoardTableWrap');
    if (wrap) {
      wrap.innerHTML = renderDispatchBoardRows(dispatchBoardFilteredLoads(), state.dispatchBoard.tab || 'open');
      qsa('[data-action]', wrap).forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
    }
  };
}

function renderCompactIntakePanel() {
  return `
    <div class="card card-pad intake-compact">
      <div>
        <h3 class="card-title">ITS / Dispatch document intake</h3>
        <p class="card-subtitle">Drop rate confirmations, BOL/POD or dispatch documents and the system will save the file, extract readable load data and auto-fill the load record for dispatcher review.</p>
      </div>
      <button class="btn btn-primary" data-action="doc-intake">Open intake</button>
    </div>
  `;
}

function renderIntakeDropzone(context = 'intake') {
  const health = state.systemHealth?.pdfExtraction || {};
  const ocrReady = Boolean(health.ocr);
  const textReady = Boolean(health.pdftotext);
  const healthLabel = ocrReady ? 'Scanned PDF OCR ready' : 'Scanned PDF OCR not installed';
  const healthClass = ocrReady ? 'status-delivered' : 'status-problem';
  return `
    <div class="card card-pad intake-panel">
      <div class="intake-copy">
        <span class="tag tag-teal">Dispatcher tool</span>
        <h3>Drag & drop document auto-fill</h3>
        <p>Upload ITS / Dispatch style rate confirmations, load tenders, BOL/POD, text PDFs, TXT/CSV/HTML documents. The app stores the original document and creates or updates the matching load with extracted broker, pickup, delivery, rate, miles, driver, truck and document status.</p>
        <div class="ocr-health-card">
          <span class="status-pill ${healthClass}">${healthLabel}</span>
          <small>${ocrReady ? 'Image-based Axle/McLeod PDFs can be auto-read on this server.' : 'Text PDFs still work. For scanned/image PDFs install Poppler + Tesseract on the server.'} ${textReady ? 'Poppler text extraction is available.' : 'Built-in text fallback is active.'}</small>
        </div>
      </div>
      <div id="docIntakeDropzone" class="intake-dropzone" data-context="${esc(context)}" tabindex="0" role="button" aria-label="Drop documents here">
        <input id="docIntakeInput" type="file" multiple accept=".pdf,.txt,.csv,.rtf,.html,.htm,.doc,.docx,.xls,.xlsx,image/*" />
        <div class="empty-icon">${icons.doc}</div>
        <strong>Drop documents here</strong>
        <span>or click to select files</span>
        <small>Text PDFs are parsed automatically. Scanned PDFs are auto-filled when OCR is ready.</small>
      </div>
    </div>
  `;
}

function compactField(label, value) {
  return `<div><span>${esc(label)}</span><strong>${esc(value || '-')}</strong></div>`;
}

function renderIntakeResultCards() {
  const history = arr('intake').slice(0, 8).map(item => ({ intake: item, extraction: { fields: item.extractedFields || {}, confidence: item.confidence || 0, documentType: item.documentType || 'Document', warning: item.warning || '' }, document: { filename: item.filename, fileUrl: item.documentUrl }, load: item.loadId ? { id: item.loadId, intakeStatus: item.status } : null }));
  const results = state.intakeResults.length ? state.intakeResults : history;
  return `
    <div class="intake-results">
      <div class="section-header slim"><div><h3>Latest intake results</h3><p>${state.intakeResults.length ? 'Fresh results from this upload.' : 'Recent dispatcher intake history.'}</p></div><button class="btn btn-soft" data-action="refresh">Refresh</button></div>
      ${results.length ? results.map(item => {
        const fields = item.extraction?.fields || item.intake?.extractedFields || {};
        const confidence = item.extraction?.confidence ?? item.intake?.confidence ?? 0;
        const loadId = item.load?.id || item.intake?.loadId || fields.loadId || '';
        const warning = item.extraction?.warning || item.intake?.warning || '';
        return `<article class="card card-pad intake-result-card">
          <div class="intake-result-head">
            <div><h4>${esc(item.document?.filename || item.intake?.filename || 'Document')}</h4><p>${esc(item.extraction?.documentType || item.intake?.documentType || 'Operational document')}</p></div>
            <span class="status-pill ${statusClass(item.load ? 'Uploaded' : 'Missing')}">${esc(item.load ? (item.load.intakeStatus || 'Auto-filled') : 'Needs review')}</span>
          </div>
          <div class="confidence-row"><span>Extraction confidence</span><strong>${esc(confidence)}%</strong><div class="progress-bar"><span style="width:${Number(confidence) || 0}%"></span></div></div>
          <div class="intake-field-grid">
            ${compactField('Load', loadId)}
            ${compactField('Broker', fields.broker)}
            ${compactField('Pickup', fields.pickup)}
            ${compactField('Delivery', fields.delivery)}
            ${compactField('Pickup date/time', fields.pickupTime || [fields.pickupDate, fields.pickupWindow].filter(Boolean).join(' · '))}
            ${compactField('Delivery date/time', fields.deliveryTime || [fields.deliveryDate, fields.deliveryWindow].filter(Boolean).join(' · '))}
            ${compactField('PO / Ref', fields.poNumber || fields.reference)}
            ${compactField('BOL', fields.bolNumber)}
            ${compactField('Shipment ID', fields.shipmentId)}
            ${compactField('Customer Ref', fields.customerRef)}
            ${compactField('Rate', fields.rate ? money(fields.rate) : '')}
            ${compactField('Miles', fields.miles)}
            ${compactField('Commodity', fields.commodity)}
            ${compactField('Weight', fields.weight)}
            ${compactField('Equipment', [fields.equipment, fields.equipmentSize].filter(Boolean).join(' / '))}
            ${compactField('Driver', fields.driver)}
            ${compactField('Truck', fields.truck)}
            ${compactField('Live GPS', (fields.gpsUrl || fields.gpsIframeUrl) ? (fields.gpsProvider || 'Detected') : '')}
          </div>
          ${warning ? `<p class="intake-warning">${esc(warning)}</p>` : ''}
          <div class="header-actions">
            ${item.document?.fileUrl || item.intake?.documentUrl ? `<a class="btn btn-soft" href="${esc(item.document?.fileUrl || item.intake?.documentUrl)}" target="_blank" rel="noreferrer">Open document</a>` : ''}
            ${loadId ? `<button class="btn btn-primary" data-action="edit-load" data-load="${esc(loadId)}">Review load</button>` : `<button class="btn btn-primary" data-action="new-load">Create manually</button>`}
          </div>
        </article>`;
      }).join('') : `<div class="card table-card">${emptyState('No intake history yet', 'Dispatcher uploads will appear here after you drag and drop the first real dispatch document.', 'Select files', 'select-intake-files')}</div>`}
    </div>
  `;
}

function renderIntake() {
  return `
    <section class="page-section">
      <div class="section-header">
        <div>
          <h3>Document intake / auto-fill</h3>
          <p>Dispatcher drag-and-drop workspace for turning real dispatch documents into saved loads and linked document records.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-soft" data-page="documents">Documents</button>
          <button class="btn btn-primary" data-action="select-intake-files">Select files</button>
        </div>
      </div>
      ${renderIntakeDropzone('intake')}
      ${renderIntakeResultCards()}
    </section>
  `;
}

function renderLoads() {
  const loads = arr('loads');
  return `
    <section class="page-section">
      <div class="section-header">
        <div>
          <h3>Loads management</h3>
          <p>Manage pickup, delivery, broker, rate, miles, status, documents, notes, timeline and history.</p>
        </div>
        <div class="header-actions">
          <input id="loadSearch" class="filter-input" placeholder="Search loads..." />
          <button class="btn btn-soft" data-action="dispatch-import">Import ITS/Dispatch</button><button class="btn btn-soft" data-action="smart-import">Smart import</button>
          <button class="btn btn-soft" data-action="open-filters">Advanced filters</button>
          <button class="btn btn-primary" data-action="new-load">+ Add load</button>
        </div>
      </div>
      ${loads.length ? renderLoadsTable(loads, 'All loads', false) : `<div class="card table-card">${emptyState('No real loads saved', 'Use Add load or Smart import to auto-fill loads from rate confirmations, ITS/dispatch sheets or BOL/POD files.', 'Smart import', 'smart-import')}</div>`}
    </section>
  `;
}

function renderLoadsTable(list, title = 'Loads', compact = false) {
  return `
    <div class="card table-card">
      <div class="table-toolbar">
        <div>
          <h3>${esc(title)}</h3>
          <p class="card-subtitle">${compact ? 'Most urgent dispatch items.' : 'Pickup, delivery, broker, rate, miles, status, documents and actions.'}</p>
        </div>
        <div class="filter-row">
          <button class="btn btn-soft" data-action="export-loads">Export</button>
          <button class="btn btn-ghost" data-action="refresh">Refresh</button>
        </div>
      </div>
      <table class="data-table">
        <thead><tr><th>Load</th><th>Lane</th><th>Driver / Truck</th><th>Broker</th><th>RTS MC</th><th>Rate</th><th>Status</th><th>Docs</th><th>Actions</th></tr></thead>
        <tbody>
          ${list.map(load => `
            <tr>
              <td data-label="Load"><strong>${esc(load.id)}</strong><br><span class="muted">${esc(load.miles || 0)} miles</span></td>
              <td data-label="Lane">${esc(load.pickup || '-')}<br><span class="muted">PU ${esc(scheduleText(load, 'pickup') || '-')}</span><br><span>${esc(load.delivery || '-')}</span><br><span class="muted">DEL ${esc(scheduleText(load, 'delivery') || '-')}</span></td>
              <td data-label="Driver / Truck">${esc(load.driver || 'Unassigned')}<br><span class="muted">${esc(load.truck || '-')}</span></td>
              <td data-label="Broker">${esc(load.broker || '-')}</td>
              <td data-label="RTS MC">${rtsStatusBadge(load)}</td>
              <td data-label="Rate">${money(load.rate)}</td>
              <td data-label="Status"><span class="status-pill ${statusClass(load.status)}">${esc(load.status || 'New')}</span></td>
              <td data-label="Docs"><span class="status-pill ${statusClass(load.docs)}">${esc(load.docs || 'Missing')}</span><br>${riskBadge(load)}</td>
              <td data-label="Actions"><div class="table-actions"><button class="action-mini" data-action="view-load" data-load="${esc(load.id)}">View</button><button class="action-mini" data-action="edit-load" data-load="${esc(load.id)}">Edit</button><button class="action-mini" data-page="chat">Chat</button><button class="action-mini" data-action="navigate" data-load="${esc(load.id)}">GPS</button></div></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}


function normalizeDocType(value = '') {
  const clean = String(value || '').trim().toLowerCase();
  if (clean.includes('confirmation') || clean.includes('rate con')) return 'confirmation';
  if (clean === 'bol' || clean.includes('bill of lading')) return 'bol';
  if (clean === 'pod' || clean.includes('proof of delivery')) return 'pod';
  return clean;
}
function docsForLoad(loadId = '') { return arr('docs').filter(doc => String(doc.load || doc.loadId || '') === String(loadId)); }
function approvedDoc(loadId, type) { return docsForLoad(loadId).find(doc => normalizeDocType(doc.type) === type && String(doc.status).toLowerCase() === 'approved'); }
function latestDoc(loadId, type) { return docsForLoad(loadId).filter(doc => normalizeDocType(doc.type) === type).sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] || null; }
function docStateLabel(doc, missing = 'Missing') {
  if (!doc) return missing;
  const status = String(doc.status || 'Uploaded');
  return status === 'Approved' ? 'Accepted' : status;
}
// Driver-facing tri-state label used on Current Load: Missing / Waiting approval / Accepted (Rejected shown distinctly).
function driverDocStatusLabel(doc) {
  if (!doc) return 'Missing';
  const status = String(doc.status || 'Uploaded');
  if (status === 'Approved') return 'Accepted';
  if (status === 'Rejected') return 'Rejected';
  return 'Waiting approval';
}
function driverDocStatusClass(doc) {
  if (!doc) return 'status-missing';
  const status = String(doc.status || 'Uploaded');
  if (status === 'Approved') return 'status-delivered';
  if (status === 'Rejected') return 'status-problem';
  return 'status-assigned';
}

/* ======================= Documents Hub (Personal / Operational) ======================= */
// Driver experience is VIEW-ONLY throughout this hub: clicking a document type opens the document
// immediately — images open in an in-app lightbox (Download button included there), any other file
// type opens a small viewer sheet with Open + Download buttons. If a type/folder has several images,
// clicking opens a gallery grid first; every gallery tile also has its own Download button. Only
// Personal -> Other uses named folders (created by admin/dispatcher) that the driver can browse
// (view-only) and open. Admin/dispatcher keep the upload-capable management view for every type and
// inside every folder, and can also download any file with one tap.
function docsHubIsStaff() { return canManageOperations(); }
function docsHubSteps() {
  const hub = state.docsHub;
  const steps = docsHubIsStaff() ? ['driver', 'category', 'subtype'] : ['category', 'subtype'];
  if (hub && hub.category === 'Personal' && hub.subType === 'Other') {
    steps.push('folders');
    if (hub.folderId) steps.push('folderItems');
  } else if (hub && hub.subType) {
    steps.push('items');
  }
  return steps;
}
function docsHubStep() { return docsHubSteps()[state.docsHub?.stepIndex || 0]; }
function openDocumentsHub() {
  const staff = docsHubIsStaff();
  state.docsHub = {
    stepIndex: 0,
    driverEmail: staff ? '' : (state.currentUser?.email || ''),
    driverName: staff ? '' : (state.currentUser?.name || ''),
    category: '',
    subType: '',
    folderId: '',
    creatingFolder: false
  };
  renderDocumentsHubModal();
}
function closeDocumentsHub() {
  state.docsHub = null;
  closeLightbox();
  closeModal();
}
function docsHubBack() {
  if (!state.docsHub) return;
  if (state.docsHub.stepIndex > 0) {
    state.docsHub.stepIndex -= 1;
    const landed = docsHubStep();
    if (landed === 'folders') { state.docsHub.folderId = ''; state.docsHub.creatingFolder = false; }
    if (landed === 'subtype') { state.docsHub.subType = ''; state.docsHub.folderId = ''; state.docsHub.creatingFolder = false; }
    if (landed === 'category') { state.docsHub.category = ''; state.docsHub.subType = ''; state.docsHub.folderId = ''; state.docsHub.creatingFolder = false; }
    renderDocumentsHubModal();
  } else {
    closeDocumentsHub();
  }
}
function docsHubPickDriver(email) {
  const user = arr('users').find(u => u.email === email);
  state.docsHub.driverEmail = email;
  state.docsHub.driverName = user?.name || '';
  state.docsHub.category = '';
  state.docsHub.subType = '';
  state.docsHub.folderId = '';
  state.docsHub.creatingFolder = false;
  state.docsHub.stepIndex += 1;
  renderDocumentsHubModal();
}
function docsHubPickCategory(category) {
  state.docsHub.category = category;
  state.docsHub.subType = '';
  state.docsHub.folderId = '';
  state.docsHub.creatingFolder = false;
  state.docsHub.stepIndex += 1;
  renderDocumentsHubModal();
}
// Clicking a document type: staff always goes to the manage/upload view (or the folder browser for
// Personal->Other). The driver never sees an upload step here — the document opens immediately when
// there is exactly one, a gallery is shown when there are several, and a toast appears when there are none.
function docsHubPickSubType(subType) {
  const hub = state.docsHub;
  hub.subType = subType;
  hub.folderId = '';
  const staff = docsHubIsStaff();
  const isPersonalOther = hub.category === 'Personal' && subType === 'Other';

  if (staff) {
    hub.stepIndex += 1;
    renderDocumentsHubModal();
    return;
  }
  if (isPersonalOther) {
    hub.stepIndex += 1; // -> folders (view-only browse)
    renderDocumentsHubModal();
    return;
  }
  const docs = docsHubMatchingDocs();
  if (!docs.length) {
    toast(`No ${subType} uploaded yet.`);
    return;
  }
  if (docs.length === 1) {
    openDocumentPreview(docs[0]);
    return;
  }
  hub.stepIndex += 1; // -> gallery ('items' step rendered as a gallery for drivers)
  renderDocumentsHubModal();
}
function docsHubMatchingDocs() {
  const hub = state.docsHub;
  if (!hub) return [];
  const email = String(hub.driverEmail || '').toLowerCase();
  const name = String(hub.driverName || '').toLowerCase();
  return arr('docs').filter(doc => {
    const matchesDriver = (email && String(doc.driverEmail || '').toLowerCase() === email) || (name && String(doc.driver || '').toLowerCase() === name);
    const matchesType = String(doc.subType || doc.type || '').toLowerCase() === String(hub.subType || '').toLowerCase();
    const matchesCategory = !doc.category || !hub.category || String(doc.category).toLowerCase() === String(hub.category).toLowerCase();
    return matchesDriver && matchesType && matchesCategory;
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
function docsHubMatchingFolders() {
  const hub = state.docsHub;
  if (!hub) return [];
  const email = String(hub.driverEmail || '').toLowerCase();
  const name = String(hub.driverName || '').toLowerCase();
  return arr('docFolders').filter(f => (email && String(f.driverEmail || '').toLowerCase() === email) || (name && String(f.driverName || '').toLowerCase() === name))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}
function docsHubFolderDocs(folderId) {
  return arr('docs').filter(doc => doc.folderId === folderId).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
// Safety net: any Personal->Other document uploaded before folders existed (no folderId yet) is still
// shown here so nothing gets silently hidden once folders become the default view for this type.
function docsHubUnfiledOtherDocs() {
  const hub = state.docsHub;
  if (!hub) return [];
  const email = String(hub.driverEmail || '').toLowerCase();
  const name = String(hub.driverName || '').toLowerCase();
  return arr('docs').filter(doc => {
    const matchesDriver = (email && String(doc.driverEmail || '').toLowerCase() === email) || (name && String(doc.driver || '').toLowerCase() === name);
    const matchesType = String(doc.subType || doc.type || '').toLowerCase() === 'other';
    const matchesCategory = String(doc.category || '').toLowerCase() === 'personal';
    return matchesDriver && matchesType && matchesCategory && !doc.folderId;
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}
// Clicking a folder tile: staff always opens the folder manager (upload + list). The driver opens the
// document directly for a single file, sees a gallery for several, or a toast for an empty folder.
function docsHubOpenFolder(folderId) {
  const hub = state.docsHub;
  const staff = docsHubIsStaff();
  if (staff) {
    hub.folderId = folderId;
    hub.stepIndex += 1;
    renderDocumentsHubModal();
    return;
  }
  const docs = docsHubFolderDocs(folderId);
  if (!docs.length) {
    toast('This folder is empty.');
    return;
  }
  if (docs.length === 1) {
    openDocumentPreview(docs[0]);
    return;
  }
  hub.folderId = folderId;
  hub.stepIndex += 1;
  renderDocumentsHubModal();
}
function docsHubToggleCreateFolder() {
  state.docsHub.creatingFolder = true;
  renderDocumentsHubModal();
}
function docsHubCancelCreateFolder() {
  state.docsHub.creatingFolder = false;
  renderDocumentsHubModal();
}
async function docsHubCreateFolder() {
  const hub = state.docsHub;
  const input = qs('#newFolderNameInput');
  const name = input?.value?.trim();
  if (!name) return toast('Enter a folder name.');
  await api('/api/docFolders', { method: 'POST', body: JSON.stringify({ name, driverEmail: hub.driverEmail, driverName: hub.driverName, category: hub.category, subType: hub.subType }) });
  await refresh();
  hub.creatingFolder = false;
  renderDocumentsHubModal();
  toast('Folder created');
}
function docsHubIsImage(doc) { return /\.(png|jpe?g|gif|webp)$/i.test(doc.filename || doc.fileUrl || '') || /^image\//.test(doc.contentType || ''); }
// Every Download button uses the authenticated blob-download endpoint (same one used for confirmation
// PDFs), which triggers a real save-to-device on mobile instead of just opening a browser preview.
function docDownloadButtonHtml(doc, classes = 'action-mini') {
  if (!doc?.fileUrl) return '';
  return `<button class="${classes}" type="button" data-action="download-document" data-id="${esc(doc.id)}" data-filename="${esc(doc.filename || '')}">Download</button>`;
}
// Staff management row (upload box + list with Approve/Reject) — still used for every subtype and
// inside every folder for admin/dispatcher; now also includes a Download button.
function docsHubDocRow(doc) {
  const isImage = docsHubIsImage(doc);
  const preview = isImage && doc.fileUrl ? `<a class="docshub-doc-thumb" href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer"><img src="${esc(doc.fileUrl)}" alt="${esc(doc.filename || 'Document')}" loading="lazy"></a>` : `<a class="docshub-doc-thumb docshub-doc-thumb-file" href="${esc(doc.fileUrl || '#')}" target="_blank" rel="noreferrer">${icons.doc}</a>`;
  const canModerate = docsHubIsStaff() && String(doc.status || 'Uploaded') === 'Uploaded';
  return `<div class="docshub-doc-row">${preview}<div class="docshub-doc-info"><strong>${esc(doc.filename || doc.type || 'Document')}</strong><span class="status-pill ${statusClass(doc.status)}">${esc(docStateLabel(doc))}</span><small>${esc(formatDate(doc.createdAt))}${doc.uploadedBy ? ' · ' + esc(doc.uploadedBy) : ''}</small></div><div class="docshub-doc-actions">${docDownloadButtonHtml(doc)}${canModerate ? `<button class="action-mini" data-action="approve-doc" data-id="${esc(doc.id)}">Approve</button><button class="action-mini" data-action="reject-doc" data-id="${esc(doc.id)}">Reject</button>` : ''}</div></div>`;
}
// Driver gallery grid — view-only tiles; clicking the thumbnail opens the document (lightbox for
// images, a viewer sheet otherwise). Every tile also has its own explicit Download button.
function docsHubGalleryGrid(docs) {
  return `<div class="docshub-gallery-grid">${docs.map(doc => {
    const isImage = docsHubIsImage(doc);
    const thumb = isImage && doc.fileUrl ? `<img src="${esc(doc.fileUrl)}" alt="${esc(doc.filename || 'Document')}" loading="lazy">` : `<div class="docshub-gallery-file-icon">${icons.doc}</div>`;
    return `<div class="docshub-gallery-item">
      <div class="docshub-gallery-open" data-action="docshub-open-doc" data-doc="${esc(doc.id)}" role="button" tabindex="0">
        ${thumb}
        <span class="docshub-gallery-status status-pill ${statusClass(doc.status)}">${esc(docStateLabel(doc))}</span>
      </div>
      <div class="docshub-gallery-meta">
        <span class="docshub-gallery-name">${esc(doc.filename || doc.type || 'Document')}</span>
        ${docDownloadButtonHtml(doc, 'docshub-gallery-download')}
      </div>
    </div>`;
  }).join('')}</div>`;
}
function docsHubOpenDocById(docId) {
  const hub = state.docsHub;
  const list = hub?.folderId ? docsHubFolderDocs(hub.folderId) : docsHubMatchingDocs();
  const doc = list.find(d => d.id === docId);
  if (!doc) return;
  openDocumentPreview(doc, list.filter(docsHubIsImage));
}
// Opens a document directly: images open in the in-app lightbox (with prev/next through imageSet when
// provided, and a Download button); any other file type (PDF, DOC, XLS...) opens a compact viewer sheet
// with Open + Download buttons — never a raw new-tab-only link, so Download is always one tap away.
function openDocumentPreview(doc, imageSet = null) {
  if (!doc || !doc.fileUrl) return toast('Document not available.');
  if (docsHubIsImage(doc)) {
    const images = imageSet && imageSet.length ? imageSet : [doc];
    const idx = Math.max(0, images.findIndex(d => d.id === doc.id));
    openLightbox(images, idx);
  } else {
    openFileViewerModal(doc);
  }
}
// Compact viewer sheet for non-image documents (PDF, DOC, XLS...): shows the file, its status, and
// Open + Download actions. Not an upload form — purely a viewer.
function openFileViewerModal(doc) {
  openModal(doc.filename || doc.type || 'Document', `${docStateLabel(doc)}${doc.uploadedBy ? ' · uploaded by ' + doc.uploadedBy : ''}`, `
    <div class="docs-file-viewer">
      <div class="docs-file-viewer-icon">${icons.doc}</div>
      <div class="docs-file-viewer-actions">
        <a class="btn btn-soft" href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer">Open</a>
        ${docDownloadButtonHtml(doc, 'btn btn-primary')}
      </div>
    </div>
  `, 'Close', null);
}
function docsHubBreadcrumb() {
  const hub = state.docsHub;
  if (!hub) return '';
  const parts = [];
  if (docsHubIsStaff() && hub.driverName) parts.push(hub.driverName);
  if (hub.category) parts.push(hub.category);
  if (hub.subType) parts.push(hub.subType);
  if (hub.folderId) {
    const folder = arr('docFolders').find(f => f.id === hub.folderId);
    if (folder) parts.push(folder.name);
  }
  return parts.join(' → ') || 'Documents';
}
async function docsHubUpload() {
  const hub = state.docsHub;
  const input = qs('#docsHubFileInput');
  const file = input?.files?.[0];
  if (!file) throw new Error('Choose a file first.');
  const fd = new FormData();
  fd.append('file', file);
  fd.append('driverEmail', hub.driverEmail || '');
  fd.append('driver', hub.driverName || '');
  fd.append('category', hub.category || '');
  fd.append('subType', hub.subType || '');
  fd.append('type', hub.subType || 'Document');
  if (hub.folderId) fd.append('folderId', hub.folderId);
  await api('/api/upload', { method: 'POST', body: fd });
  await refresh();
  renderDocumentsHubModal();
  toast(`${hub.subType || 'Document'} uploaded`);
}
function renderDocumentsHubModal() {
  const root = qs('#modalRoot');
  const hub = state.docsHub;
  if (!root || !hub) return;
  root.classList.add('active');
  const staff = docsHubIsStaff();
  const step = docsHubStep();
  const currentFolder = hub.folderId ? arr('docFolders').find(f => f.id === hub.folderId) : null;
  const stepTitles = {
    driver: 'Select driver',
    category: 'Personal or Operational documents',
    subtype: `${hub.category || 'Document'} type`,
    folders: 'Folders',
    folderItems: currentFolder?.name || 'Folder',
    items: hub.subType || 'Documents'
  };
  const stepSubtitles = {
    driver: 'Choose which driver this document belongs to.',
    category: 'Personal documents belong to the driver. Operational documents belong to the truck/trailer.',
    subtype: 'Pick the exact document type.',
    folders: staff ? 'Create named folders and upload documents or photos for the driver.' : 'Browse folders created by your dispatcher or admin.',
    folderItems: staff ? 'Upload a new file into this folder and review previously uploaded files.' : 'Tap a document or photo to open it, or tap Download to save it.',
    items: staff ? 'Upload a new file and review previously uploaded files.' : 'Tap a document or photo to open it, or tap Download to save it.'
  };
  let body = '';
  if (step === 'driver') {
    const drivers = eligibleConfirmationDrivers();
    body = `<div class="docshub-grid">${drivers.length ? drivers.map(u => `<button class="docshub-tile" type="button" data-action="docshub-pick-driver" data-value="${esc(u.email)}"><span class="docshub-tile-icon">${icons.drivers}</span><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></button>`).join('') : '<p class="muted">No active driver accounts assigned to you yet.</p>'}</div>`;
  } else if (step === 'category') {
    body = `<div class="docshub-grid docshub-grid-2">
      <button class="docshub-tile docshub-tile-lg" type="button" data-action="docshub-pick-category" data-value="Personal"><span class="docshub-tile-icon">${icons.doc}</span><strong>Personal Documents</strong><small>CDL, Medical, Drug Test, Insurance, IFTA, CAB Card, Trailer Registration, TITLE, Other</small></button>
      <button class="docshub-tile docshub-tile-lg" type="button" data-action="docshub-pick-category" data-value="Operational"><span class="docshub-tile-icon">${icons.truck}</span><strong>Operational Documents</strong><small>Truck, Trailer, Plates, Truck with JTS, VIN</small></button>
    </div>`;
  } else if (step === 'subtype') {
    const options = hub.category === 'Personal' ? PERSONAL_DOC_TYPES : OPERATIONAL_DOC_TYPES;
    body = `<div class="docshub-chip-grid">${options.map(t => `<button class="docshub-chip" type="button" data-action="docshub-pick-subtype" data-value="${esc(t)}">${esc(t)}</button>`).join('')}</div>`;
  } else if (step === 'folders') {
    const folders = docsHubMatchingFolders();
    const unfiled = docsHubUnfiledOtherDocs();
    const unfiledSection = unfiled.length ? `<div class="docshub-doc-list" style="margin-bottom:16px">${staff ? unfiled.map(docsHubDocRow).join('') : docsHubGalleryGrid(unfiled)}</div>` : '';
    const createForm = hub.creatingFolder ? `<div class="docshub-upload-box">
        <label class="field full">Folder name<input id="newFolderNameInput" type="text" placeholder="e.g. Passport, Background Check"></label>
        <div class="docshub-actions" style="justify-content:flex-start">
          <button class="btn btn-primary" type="button" data-action="docshub-create-folder">Create folder</button>
          <button class="btn btn-soft" type="button" data-action="docshub-cancel-create-folder">Cancel</button>
        </div>
      </div>` : '';
    const newFolderBtn = staff && !hub.creatingFolder ? `<button class="docshub-tile docshub-new-folder" type="button" data-action="docshub-toggle-create-folder"><span class="docshub-tile-icon">+</span><strong>New folder</strong><small>Create a named folder</small></button>` : '';
    const folderTiles = folders.map(f => {
      const count = arr('docs').filter(d => d.folderId === f.id).length;
      return `<button class="docshub-tile" type="button" data-action="docshub-open-folder" data-value="${esc(f.id)}"><span class="docshub-tile-icon">${icons.doc}</span><strong>${esc(f.name)}</strong><small>${count} document${count === 1 ? '' : 's'}</small></button>`;
    }).join('');
    body = `${unfiledSection}${createForm}<div class="docshub-grid">${newFolderBtn}${folderTiles}</div>${!folders.length && !staff ? '<p class="muted" style="margin-top:14px">No folders yet.</p>' : ''}`;
  } else if (step === 'folderItems') {
    const docs = docsHubFolderDocs(hub.folderId);
    if (staff) {
      body = `<div class="docshub-upload-box">
        <div class="docshub-upload-target"><span>Folder</span><strong>${esc(currentFolder?.name || '-')}</strong></div>
        <label class="field full">Choose file<input id="docsHubFileInput" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"></label>
        <button class="btn btn-primary" type="button" data-action="docshub-upload">Upload to folder</button>
      </div>
      <div class="docshub-doc-list">${docs.length ? docs.map(docsHubDocRow).join('') : '<p class="muted">No documents in this folder yet.</p>'}</div>`;
    } else {
      body = docs.length ? docsHubGalleryGrid(docs) : '<p class="muted">No documents in this folder yet.</p>';
    }
  } else if (step === 'items') {
    const list = docsHubMatchingDocs();
    if (staff) {
      body = `<div class="docshub-upload-box">
        <div class="docshub-upload-target"><span>Driver</span><strong>${esc(hub.driverName || '-')}</strong></div>
        <label class="field full">Choose file<input id="docsHubFileInput" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"></label>
        <button class="btn btn-primary" type="button" data-action="docshub-upload">Upload ${esc(hub.subType)}</button>
      </div>
      <div class="docshub-doc-list">${list.length ? list.map(docsHubDocRow).join('') : `<p class="muted">No ${esc(hub.subType)} documents uploaded yet.</p>`}</div>`;
    } else {
      body = list.length ? docsHubGalleryGrid(list) : `<p class="muted">No ${esc(hub.subType)} documents uploaded yet.</p>`;
    }
  }
  root.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-card docshub-modal" role="dialog" aria-modal="true" aria-label="Documents">
      <div class="modal-head">
        <div><p class="docshub-breadcrumb">${esc(docsHubBreadcrumb())}</p><h3>${esc(stepTitles[step] || 'Documents')}</h3><p>${esc(stepSubtitles[step] || '')}</p></div>
        <button class="icon-btn" data-close-modal aria-label="Close">×</button>
      </div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions docshub-actions">
        <button class="btn btn-soft" type="button" data-action="docshub-back">${hub.stepIndex === 0 ? 'Close' : '← Back'}</button>
      </div>
    </div>`;
  qsa('[data-close-modal]').forEach(x => { x.onclick = closeDocumentsHub; });
  qsa('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
}
/* ======================= Lightbox (image gallery viewer) ======================= */
let lightboxImages = [];
let lightboxIndex = 0;
function openLightbox(images, index = 0) {
  lightboxImages = images || [];
  lightboxIndex = Math.max(0, Math.min(index, lightboxImages.length - 1));
  renderLightbox();
}
function closeLightbox() {
  const el = document.getElementById('docsLightboxOverlay');
  if (el) el.remove();
  lightboxImages = [];
}
function lightboxStep(delta) {
  if (lightboxImages.length < 2) return;
  lightboxIndex = (lightboxIndex + delta + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}
function renderLightbox() {
  const doc = lightboxImages[lightboxIndex];
  if (!doc) { closeLightbox(); return; }
  let el = document.getElementById('docsLightboxOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'docsLightboxOverlay';
    el.className = 'docs-lightbox-overlay';
    document.body.appendChild(el);
  }
  const multi = lightboxImages.length > 1;
  el.innerHTML = `
    <div class="docs-lightbox-backdrop" data-lightbox-close></div>
    <div class="docs-lightbox-body">
      <button class="docs-lightbox-close" type="button" data-lightbox-close aria-label="Close">×</button>
      ${multi ? '<button class="docs-lightbox-nav prev" type="button" data-lightbox-prev aria-label="Previous">‹</button>' : ''}
      <img src="${esc(doc.fileUrl)}" alt="${esc(doc.filename || 'Document')}">
      ${multi ? '<button class="docs-lightbox-nav next" type="button" data-lightbox-next aria-label="Next">›</button>' : ''}
      <div class="docs-lightbox-caption">
        <span>${esc(doc.filename || doc.type || 'Document')}${multi ? ` · ${lightboxIndex + 1}/${lightboxImages.length}` : ''}</span>
        <div class="docs-lightbox-caption-actions">
          <button class="btn btn-soft btn-small" type="button" data-lightbox-download>Download</button>
          <a class="btn btn-soft btn-small" href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer">Open original</a>
        </div>
      </div>
    </div>`;
  el.querySelectorAll('[data-lightbox-close]').forEach(x => { x.onclick = closeLightbox; });
  const prevBtn = el.querySelector('[data-lightbox-prev]');
  if (prevBtn) prevBtn.onclick = () => lightboxStep(-1);
  const nextBtn = el.querySelector('[data-lightbox-next]');
  if (nextBtn) nextBtn.onclick = () => lightboxStep(1);
  const downloadBtn = el.querySelector('[data-lightbox-download]');
  if (downloadBtn) downloadBtn.onclick = () => downloadDocument(doc.id, doc.filename);
}
/* ======================= End Documents Hub ======================= */
function driverRequiredDocumentPanel(load) {
  const bol = latestDoc(load.id, 'bol');
  const pod = latestDoc(load.id, 'pod');
  const confirmation = latestDoc(load.id, 'confirmation');
  const rows = [
    ['BOL', bol, 'Required before POD'],
    ['POD', pod, bol && String(bol.status).toLowerCase() === 'approved' ? 'Required after delivery' : 'Available after BOL acceptance'],
    ['Load confirmation', confirmation, 'Uploaded by dispatch/admin']
  ];
  return `<section class="driver-doc-status"><div class="driver-doc-status-head"><div><span>Tour documents</span><strong>Uploaded, accepted and missing</strong></div><span class="tag tag-teal">${rows.filter(([,doc]) => doc && String(doc.status).toLowerCase() === 'approved').length}/3 accepted</span></div>
    <div class="driver-doc-status-list">${rows.map(([name,doc,hint]) => `<div class="driver-doc-row"><span class="driver-doc-dot ${doc ? statusClass(doc.status) : 'status-problem'}"></span><div><strong>${esc(name)}</strong><small>${esc(docStateLabel(doc))} · ${esc(hint)}</small></div>${doc?.fileUrl && normalizeDocType(doc.type) === 'confirmation' ? `<button class="driver-doc-download" type="button" data-action="download-document" data-id="${esc(doc.id)}" data-filename="${esc(doc.filename || `JTS-Confirmation-${load.id}.pdf`)}">Download</button>` : ''}</div>`).join('')}</div>
  </section>`;
}
function driverConfirmationLink(load) {
  const confirmation = latestDoc(load.id, 'confirmation');
  if (confirmation?.fileUrl) return `<button class="driver-confirmation-link as-button" type="button" data-action="download-document" data-id="${esc(confirmation.id)}" data-filename="${esc(confirmation.filename || `JTS-Confirmation-${load.id}.pdf`)}">Download your PDF</button>`;
  return `<button class="driver-confirmation-link as-button" type="button" data-action="request-confirmation" data-load="${esc(load.id)}">Download your PDF</button><small class="driver-confirmation-missing">Confirmation is not uploaded. Tap to request it from dispatch.</small>`;
}
function nextDriverUploadType(loadId) {
  return approvedDoc(loadId, 'bol') ? 'POD' : 'BOL';
}

/* ======================= Reminder system (Truck/Trailer inspection, Medical, Drug test) ======================= */
function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const due = new Date(dateStr + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}
function driverReminders(driver) {
  if (!driver) return [];
  const email = String(driver.email || '').toLowerCase();
  const name = String(driver.name || '').toLowerCase();
  return arr('reminders').filter(r => (email && String(r.driverEmail || '').toLowerCase() === email) || (name && String(r.driverName || '').toLowerCase() === name));
}
function driverActiveReminder(driver) {
  const list = driverReminders(driver).filter(r => r.status !== 'Approved');
  const priority = { 'Declined': 0, 'Waiting for approval': 1, 'Upcoming': 2 };
  const relevant = list.filter(r => r.status !== 'Upcoming' || daysUntil(r.dueDate) <= REMINDER_LEAD_DAYS);
  relevant.sort((a, b) => (priority[a.status] ?? 3) - (priority[b.status] ?? 3) || daysUntil(a.dueDate) - daysUntil(b.dueDate));
  return relevant[0] || null;
}
function reminderReasonText(reminder) {
  const days = daysUntil(reminder.dueDate);
  const dueText = reminder.dueDate ? (days < 0 ? `overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}` : days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`) : 'due date not set';
  return `${reminder.category} ${dueText}`;
}
function renderReminderBanner(driver) {
  const reminder = driverActiveReminder(driver);
  if (!reminder) return '';
  const isWaiting = reminder.status === 'Waiting for approval';
  const isDeclined = reminder.status === 'Declined';
  const tone = isDeclined ? 'status-problem' : isWaiting ? 'status-assigned' : 'status-missing';
  return `<section class="reminder-banner ${tone}">
    <div class="reminder-banner-icon">${icons.bell}</div>
    <div class="reminder-banner-copy">
      <strong>${isDeclined ? 'Proof declined — action required' : isWaiting ? 'Reminder pending approval' : 'Upcoming reminder'}</strong>
      <span>${esc(reminderReasonText(reminder))}${isDeclined && reminder.rejectionReason ? ` · ${esc(reminder.rejectionReason)}` : ''}</span>
    </div>
    ${isWaiting ? '<span class="status-pill status-assigned">Waiting for approval</span>' : `<button class="btn btn-dark" type="button" data-action="submit-reminder-proof" data-reminder="${esc(reminder.id)}">Upload proof</button>`}
  </section>`;
}
function openReminderProofModal(reminderId) {
  const reminder = findById('reminders', reminderId);
  if (!reminder) return toast('Reminder not found');
  openModal(`Clear reminder · ${reminder.category}`, 'Upload a document or photo as proof. Your dispatcher or admin must approve it before the reminder is removed.', `
    <div class="form-grid">
      <div class="field full"><span class="muted">Due date</span><strong>${esc(reminder.dueDate || 'Not set')}</strong></div>
      <label class="field full">Proof document / photo<input id="reminderProofInput" type="file" accept="image/*,.pdf,.doc,.docx" required></label>
    </div>
  `, 'Submit for approval', async () => {
    const input = qs('#reminderProofInput');
    const file = input?.files?.[0];
    if (!file) throw new Error('Choose a file first.');
    const fd = new FormData();
    fd.append('file', file);
    await api(`/api/reminders/${encodeURIComponent(reminder.id)}/proof`, { method: 'POST', body: fd });
    await refresh();
    toast('Proof submitted for approval');
  });
}
function openReminderModal(reminder = null) {
  if (!canManageOperations()) return toast('Dispatcher or admin access is required.');
  const drivers = eligibleConfirmationDrivers();
  const selectedEmail = reminder?.driverEmail || drivers[0]?.email || '';
  const driverOptions = `<label class="field">Driver<select data-field="driverEmail">${drivers.map(u => `<option value="${esc(u.email)}" ${u.email === selectedEmail ? 'selected' : ''}>${esc(u.name)} · ${esc(u.email)}</option>`).join('')}</select></label>`;
  openModal(reminder ? `Edit reminder · ${reminder.category}` : 'Add reminder', 'Alerts the driver 30 days before the due date. Removed only after the driver uploads proof and it is approved.', `
    <div class="form-grid">
      ${driverOptions}
      ${selectField('Category', 'category', reminder?.category || REMINDER_CATEGORIES[0], REMINDER_CATEGORIES)}
      ${field('Due date', 'dueDate', reminder?.dueDate || '', 'date')}
      ${textArea('Notes', 'notes', reminder?.notes || '')}
    </div>
  `, reminder ? 'Save reminder' : 'Add reminder', async () => {
    const data = getFormData(qs('#modalRoot'));
    const driverUser = drivers.find(u => u.email === data.driverEmail);
    data.driverName = driverUser?.name || '';
    if (!data.dueDate) throw new Error('Set a due date.');
    if (reminder) { data.status = 'Upcoming'; await api(`/api/reminders/${encodeURIComponent(reminder.id)}`, { method: 'PATCH', body: JSON.stringify(data) }); }
    else await api('/api/reminders', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
}
async function decideReminder(id, status) {
  if (!canManageOperations()) return toast('Dispatcher or admin access is required.');
  await api(`/api/reminders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await refresh();
  toast(`Reminder ${status.toLowerCase()}`);
}
function openReminderDeclineModal(id) {
  const reminder = findById('reminders', id);
  if (!reminder) return toast('Reminder not found');
  openModal('Decline proof', 'Explain why the submitted proof is declined. The reminder stays active for the driver.', `<div class="form-grid">${textArea('Reason', 'rejectionReason', '')}</div>`, 'Decline proof', async () => {
    const data = getFormData(qs('#modalRoot'));
    if (!data.rejectionReason) throw new Error('Enter a reason for the driver.');
    await api(`/api/reminders/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'Declined', rejectionReason: data.rejectionReason }) });
    await refresh();
  });
}
function renderRemindersAdminSection() {
  const reminders = arr('reminders').filter(r => r.status !== 'Approved');
  return `
    <div class="section-header slim"><div><h3>Driver reminders</h3><p>Truck/trailer inspection, medical and scheduled drug test alerts. Drivers are notified 30 days before the due date and must upload proof to clear a reminder.</p></div><div class="header-actions"><button class="btn btn-primary" data-action="add-reminder">+ Add reminder</button></div></div>
    <div class="card table-card">
      ${reminders.length ? `<table class="data-table"><thead><tr><th>Driver</th><th>Category</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        ${reminders.map(r => `<tr><td data-label="Driver"><strong>${esc(r.driverName || r.driverEmail)}</strong></td><td data-label="Category">${esc(r.category)}</td><td data-label="Due date">${esc(r.dueDate || '-')}</td><td data-label="Status"><span class="status-pill ${r.status === 'Declined' ? 'status-problem' : r.status === 'Waiting for approval' ? 'status-assigned' : 'status-missing'}">${esc(r.status)}</span></td><td data-label="Actions">${r.status === 'Waiting for approval' ? `<button class="action-mini" data-action="approve-reminder" data-reminder="${esc(r.id)}">Approve</button><button class="action-mini" data-action="decline-reminder" data-reminder="${esc(r.id)}">Decline</button>${r.proofUrl ? `<a class="action-mini" href="${esc(r.proofUrl)}" target="_blank" rel="noreferrer">View proof</a>` : ''}` : `<button class="action-mini" data-action="edit-reminder" data-id="${esc(r.id)}">Edit</button>`}</td></tr>`).join('')}
      </tbody></table>` : emptyState('No active reminders', 'Add a reminder for truck/trailer inspection, medical or scheduled drug test dates.', 'Add reminder', 'add-reminder')}
    </div>`;
}
/* ======================= End Reminder system ======================= */

// BOL / POD / Fuel Receipt / Lumper Receipt / Other, each with Missing -> Waiting approval -> Accepted.
// Documents not classified as BOL/POD/Load confirmation are grouped under a single "Others" row
// (Fuel Receipt, Lumper Receipt, Other...). Opening it lets the driver pick the exact Type before uploading.
function otherDocsForLoad(loadId) {
  return docsForLoad(loadId).filter(doc => !['bol', 'pod', 'confirmation'].includes(normalizeDocType(doc.type)));
}
// Every row that has a file gets a real "Download" button (authenticated blob download that saves to the
// device), in addition to "View" which just opens the file in a new tab/browser preview.
// (Reuses the shared docDownloadButtonHtml() helper defined in the Documents Hub section above.)
function driverLoadDocRow(label, doc, status, canUpload, loadId, hint = '', mandatory = false) {
  return `<div class="driver-doc-row"><span class="driver-doc-dot ${doc ? driverDocStatusClass(doc) : 'status-problem'}"></span><div><strong>${esc(label)}${mandatory ? ' <span class="doc-required" title="Required">*</span>' : ''}</strong><small>${esc(status)}${doc?.filename ? ' · ' + esc(doc.filename) : ''}${hint ? ' · ' + esc(hint) : ''}</small></div>${doc?.fileUrl ? `<a class="driver-doc-download" href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer">View</a>` : ''}${docDownloadButtonHtml(doc, 'driver-doc-download-btn action-mini')}${canUpload ? `<button class="action-mini" type="button" data-action="upload-driver-doc" data-load="${esc(loadId)}" data-type="${esc(label)}">Upload</button>` : ''}</div>`;
}
function driverLoadDocRows(loadId) {
  const bol = latestDoc(loadId, 'bol');
  const bolStatus = driverDocStatusLabel(bol);
  const bolApproved = bol && String(bol.status).toLowerCase() === 'approved';
  const canUploadBol = !bol || ['Missing', 'Rejected'].includes(bolStatus);
  const bolRow = driverLoadDocRow('BOL', bol, bolStatus, canUploadBol, loadId, '', true);

  const pod = latestDoc(loadId, 'pod');
  const podStatus = driverDocStatusLabel(pod);
  const canUploadPod = bolApproved && (!pod || ['Missing', 'Rejected'].includes(podStatus));
  const podRow = driverLoadDocRow('POD', pod, bolApproved ? podStatus : 'Missing', canUploadPod, loadId, bolApproved ? '' : 'Unlocks after BOL is accepted', true);

  const others = otherDocsForLoad(loadId);
  const approvedOthers = others.filter(d => String(d.status).toLowerCase() === 'approved').length;
  const othersDot = !others.length ? 'status-missing' : approvedOthers === others.length ? 'status-delivered' : 'status-assigned';
  const othersRow = `<div class="driver-doc-row"><span class="driver-doc-dot ${othersDot}"></span><div><strong>Others</strong><small>${others.length ? `${others.length} document${others.length === 1 ? '' : 's'} uploaded` : 'Fuel receipt, lumper receipt or other'}</small></div><button class="action-mini" type="button" data-action="manage-other-docs" data-load="${esc(loadId)}">Manage</button></div>`;

  return bolRow + podRow + othersRow;
}
function openOtherDocumentsModal(loadId) {
  const load = loadById(loadId);
  const isDriver = state.currentUser?.role === 'driver';
  const existing = otherDocsForLoad(loadId).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const listHtml = existing.length ? existing.map(doc => `<div class="driver-doc-row"><span class="driver-doc-dot ${driverDocStatusClass(doc)}"></span><div><strong>${esc(doc.type || 'Other')}</strong><small>${esc(driverDocStatusLabel(doc))}${doc.filename ? ' · ' + esc(doc.filename) : ''}</small></div>${doc.fileUrl ? `<a class="driver-doc-download" href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer">View</a>` : ''}${docDownloadButtonHtml(doc)}</div>`).join('') : '<p class="muted">No additional documents uploaded yet.</p>';
  openModal('Other documents', 'Fuel receipt, lumper receipt or any other supporting document for this load. Choose the exact type before uploading.', `
    <div class="driver-doc-status-list" style="margin-bottom:16px">${listHtml}</div>
    <form id="otherDocForm" class="form-grid">
      <label class="field full">Type<select name="type"><option>Fuel Receipt</option><option>Lumper Receipt</option><option>Other</option></select></label>
      <label class="field full">File<input name="file" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" required></label>
    </form>
  `, 'Upload', async () => {
    const form = qs('#otherDocForm');
    if (!form.file.files.length) throw new Error('Choose a file first.');
    const fd = new FormData(form);
    fd.append('load', loadId);
    fd.append('driver', isDriver ? (state.currentUser?.name || '') : (load?.driver || ''));
    await api('/api/upload', { method: 'POST', body: fd });
    await refresh();
    toast('Document uploaded');
  });
}
function openDriverLoadDetailModal(loadId, readOnly = false) {
  const load = loadById(loadId);
  if (!load) return toast('Load not found');
  const isDriver = state.currentUser?.role === 'driver';
  openModal(`Load ${load.id}`, `${load.pickup || '-'} → ${load.delivery || '-'}`, `
    <div class="driver-load-detail">
      <div class="driver-load-detail-head"><span class="status-pill ${statusClass(load.status)}">${esc(load.status || 'Assigned')}</span></div>
      ${isDriver ? driverConfirmationLink(load) : ''}
      <div class="driver-timeline">
        <div class="driver-stop"><span class="stop-marker">P</span><div><strong>Pick up</strong><span>${esc(load.pickup || 'Pickup pending')}</span><small>${esc(scheduleText(load, 'pickup') || 'Date and time not set')}</small>${stopRefText(load, 'pickup') ? `<small>${esc(stopRefText(load, 'pickup'))}</small>` : ''}</div></div>
        <div class="driver-stop"><span class="stop-marker">D</span><div><strong>Delivery</strong><span>${esc(load.delivery || 'Delivery pending')}</span><small>${esc(scheduleText(load, 'delivery') || 'Date and time not set')}</small>${stopRefText(load, 'delivery') ? `<small>${esc(stopRefText(load, 'delivery'))}</small>` : ''}</div></div>
      </div>
      <section class="driver-doc-status"><div class="driver-doc-status-head"><div><span>Load documents</span><strong>BOL and POD are required · Others grouped below</strong></div></div><div class="driver-doc-status-list">${driverLoadDocRows(load.id)}</div></section>
      ${!readOnly && isDriver ? `<div class="driver-actions" style="margin-top:16px">
        <button class="btn driver-action-card driver-action-success" type="button" data-action="driver-arrived" data-load="${esc(load.id)}"><span class="driver-action-icon" aria-hidden="true">${icons.pin}</span><span class="driver-action-copy"><strong>Arrived</strong><small>Update pickup status</small></span></button>
        <button class="btn driver-action-card driver-action-dark" type="button" data-action="driver-transit" data-load="${esc(load.id)}"><span class="driver-action-icon" aria-hidden="true">${icons.truck}</span><span class="driver-action-copy"><strong>In transit</strong><small>Start route tracking</small></span></button>
        <button class="btn driver-action-card" type="button" data-action="navigate" data-load="${esc(load.id)}"><span class="driver-action-icon" aria-hidden="true">${icons.pin}</span><span class="driver-action-copy"><strong>Navigate</strong><small>Open route</small></span></button>
        <button class="btn driver-action-card driver-action-alert" type="button" data-action="issue-report"><span class="driver-action-icon" aria-hidden="true">!</span><span class="driver-action-copy"><strong>Report issue</strong><small>Delay, damage or safety</small></span></button>
      </div>` : ''}
    </div>
  `, 'Done', null);
}
function renderPreviousLoadsStrip(driverName) {
  const completed = arr('loads').filter(load => load.driver === driverName && ['Delivered', 'Completed', 'Closed'].includes(load.status));
  return `<section class="previous-loads-section">
    <div class="previous-loads-head"><h4>Previous Loads</h4><span class="muted">${completed.length} completed tour${completed.length === 1 ? '' : 's'}</span></div>
    ${completed.length ? `<div class="previous-loads-strip">${completed.map(load => `
      <article class="previous-load-card">
        <div class="mini-row"><strong>${esc(load.id)}</strong><span class="status-pill ${statusClass(load.status)}">${esc(load.status)}</span></div>
        <p>${esc(load.pickup || '-')} → ${esc(load.delivery || '-')}</p>
        <button class="btn btn-soft" type="button" data-action="view-previous-load" data-load="${esc(load.id)}">View Load</button>
      </article>`).join('')}</div>` : `<p class="muted">Completed and fully confirmed tours will appear here.</p>`}
  </section>`;
}
function renderDriverMobile() {
  const currentDriver = findDriverForCurrentUser();
  const driverName = currentDriver?.name || state.currentUser?.name || '';
  const focusedLoad = state.selectedLoadId ? loadById(state.selectedLoadId) : null;
  const activeLoad = arr('loads').find(item => item.driver === driverName && !['Delivered','Completed','Closed'].includes(item.status));
  const load = focusedLoad || activeLoad || null;
  const isDriver = state.currentUser?.role === 'driver';
  const reminderBanner = isDriver ? renderReminderBanner(currentDriver) : '';
  const gpsUrl = currentDriver?.gpsTrackerUrl || '';
  const gpsCard = `<section class="driver-gps-card">
    <div class="driver-gps-head"><strong>Live GPS</strong>${gpsUrl ? `<a class="btn btn-soft btn-small" href="${esc(gpsUrl)}" target="_blank" rel="noreferrer">Open full map</a>` : ''}</div>
    ${gpsUrl ? `<div class="driver-gps-frame"><iframe src="${esc(gpsUrl)}" title="Live GPS" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>` : `<div class="driver-gps-empty"><p>Ask your admin/dispatcher to add your GPS tracker link.</p></div>`}
  </section>`;
  // Driver's real device view has no colored "Current Load" header so the page fits one screen with no scrolling.
  // Admin/dispatcher desktop preview keeps the header for context.
  const header = isDriver ? '' : `<header class="driver-mobile-header"><div class="mini-row"><span class="tag tag-teal">${esc(currentDriver?.status || 'Ready')}</span><button class="driver-notification-shortcut" type="button" data-page="notifications" aria-label="Open notifications">${icons.bell}${badgeHtml(unreadNotificationCount(), 'driver-unread')}</button></div><h3>${load ? 'Current Load' : 'No active load'}</h3><p>${load ? esc(load.id) : 'Dispatch will appear here as soon as a load is assigned.'}</p></header>`;
  const content = `
    <div class="driver-screen ${isDriver ? 'driver-screen-native' : ''}" data-driver-active-load="${esc(load?.id || '')}">
      ${header}
      <div class="driver-content driver-content-compact">
        ${reminderBanner}
        ${load ? `<article class="driver-load-hero-compact ${state.selectedLoadId === load.id ? 'target-highlight' : ''}">
          <div class="driver-load-title"><div><span class="driver-load-kicker">Load ${esc(load.id)}</span><h4>${esc(load.status || 'Assigned')}</h4></div><span class="status-pill ${statusClass(load.status)}">${esc(load.status || 'Assigned')}</span></div>
          <div class="driver-timeline-compact">
            <div class="driver-stop-compact"><span class="stop-marker">P</span><div><strong>Pick up</strong><span>${esc(load.pickup || 'Pending')}</span><small>${esc(scheduleText(load, 'pickup') || 'Date/time not set')}</small></div></div>
            <div class="driver-stop-compact"><span class="stop-marker">D</span><div><strong>Delivery</strong><span>${esc(load.delivery || 'Pending')}</span><small>${esc(scheduleText(load, 'delivery') || 'Date/time not set')}</small></div></div>
          </div>
          <div class="driver-load-hero-footer"><button class="btn btn-primary" type="button" data-action="view-current-load" data-load="${esc(load.id)}">View Load</button></div>
        </article>` : `<div class="driver-empty-state"><div class="driver-empty-icon">${icons.loads}</div><h3>No assigned load</h3><p>You will be taken directly to the load, document, GPS or notification when an alert arrives.</p><button class="btn btn-soft" data-page="notifications">Open notifications</button></div>`}
        ${gpsCard}
      </div>
      ${isDriver ? renderPreviousLoadsStrip(driverName) : ''}
    </div>`;
  if (isDriver) return `<section class="driver-native-page">${content}</section>`;
  return `<section class="page-section"><div class="section-header"><div><h3>Current Load</h3><p>Production driver workspace preview.</p></div></div><div class="driver-shell">${content}</div></section>`;
}
function roleBadgeClass(roleValue) {
  const r = String(roleValue || '').toLowerCase();
  if (r === 'admin') return 'role-badge-admin';
  if (r === 'dispatcher') return 'role-badge-dispatcher';
  if (r === 'driver') return 'role-badge-driver';
  if (r === 'broker') return 'role-badge-broker';
  return 'role-badge-default';
}
function renderAdmin() {
  const users = arr('users');
  const activeCount = users.filter(u => u.status !== 'Disabled').length;
  return `
    <section class="page-section admin-page">
      <div class="section-header">
        <div>
          <h3>Admin panel</h3>
          <p>Users, roles, permissions, company resources, notification settings, audit log and system settings.</p>
        </div>
        <div class="header-actions"><button class="btn btn-soft" data-action="export-users">Export users</button><button class="btn btn-primary" data-action="add-user">+ Add user</button></div>
      </div>
      <div class="grid grid-4">
        ${[
          ['Users', users.length, `${activeCount} active`, 'drivers'],
          ['Drivers', arr('drivers').length, 'Driver profiles', 'truck'],
          ['Fleet units', arr('fleet').length, 'Trucks and trailers', 'truck'],
          ['Brokers', arr('brokers').length, 'Customer accounts', 'briefcase']
        ].map(([title, val, sub, icon]) => `<article class="card kpi-card">
          <div class="kpi-top"><span class="kpi-icon">${icons[icon]}</span></div>
          <p class="kpi-label">${esc(title)}</p>
          <h3 class="kpi-value">${esc(val)}</h3>
          <span class="kpi-trend">${esc(sub)}</span>
        </article>`).join('')}
      </div>
      <div class="card table-card admin-users-card">
        <div class="table-toolbar"><div><h3>User management</h3><p class="card-subtitle">Accounts are created by admin and roles are assigned here.</p></div></div>
        ${users.length ? `<table class="data-table admin-users-table"><thead><tr><th>User</th><th>Role</th><th>Dedicated dispatcher</th><th>Status</th><th>Password</th><th>Last login</th><th>Actions</th></tr></thead><tbody>
          ${users.map(user => { const dispatcher = user.role === 'driver' ? users.find(item => item.id === user.dispatcherId || item.email === user.dispatcherEmail) : null; return `<tr>
            <td data-label="User"><div class="admin-user-cell"><span class="avatar admin-user-avatar">${esc(initials(user.name))}</span><div><strong>${esc(user.name)}</strong><span class="admin-user-email">${esc(user.email)}</span></div></div></td>
            <td data-label="Role"><span class="role-badge ${roleBadgeClass(user.role)}">${esc(user.role)}</span></td>
            <td data-label="Dedicated dispatcher">${esc(user.role === 'driver' ? (dispatcher?.name || 'Not assigned') : '-')}</td>
            <td data-label="Status"><span class="status-pill ${statusClass(user.status)}">${esc(user.status || 'Active')}</span></td>
            <td data-label="Password">${user.requiresPasswordChange ? '<span class="status-pill status-problem">Must change</span>' : '<span class="status-pill status-delivered">Set</span>'}</td>
            <td data-label="Last login">${esc(formatDate(user.lastLoginAt))}</td>
            <td data-label="Actions"><button class="action-mini" data-action="edit-user" data-user="${esc(user.id)}">Edit</button></td>
          </tr>`; }).join('')}
        </tbody></table>` : emptyState('No users yet', 'Create dispatcher, driver and broker accounts for real access.', 'Add user', 'add-user')}
      </div>
      <div class="card card-pad admin-audit-card">
        <div class="admin-audit-head"><span class="admin-audit-icon">${icons.shield}</span><div><h3 class="card-title">Audit log</h3><p class="card-subtitle">Recent system events.</p></div></div>
        <div class="activity-list" style="margin-top:14px">${arr('auditLog').slice(0, 12).map(item => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(item.action)}</strong><span>${esc(item.entity || '')} · ${esc(formatDate(item.createdAt))}</span></div></div>`).join('') || '<p class="muted">No audit entries yet.</p>'}</div>
      </div>
    </section>
  `;
}

function renderFleet() {
  const fleet = arr('fleet');
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Trucks / trailers</h3><p>Vehicle status, assigned driver, documents, expiration dates, maintenance reminders and inspection notes.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="export-fleet">Export</button><button class="btn btn-primary" data-action="add-fleet">+ Add unit</button></div></div>
      <div class="card table-card">
        ${fleet.length ? `<table class="data-table"><thead><tr><th>Unit</th><th>Truck / trailer</th><th>Status</th><th>Driver</th><th>Expiration</th><th>Maintenance</th><th>Actions</th></tr></thead><tbody>${fleet.map(unit => `
          <tr><td data-label="Unit"><strong>${esc(unit.unit || unit.id)}</strong></td><td data-label="Truck / trailer">${esc(unit.type || '-')}<br><span class="muted">${esc(unit.trailer || '-')}</span></td><td data-label="Status"><span class="status-pill ${statusClass(unit.status)}">${esc(unit.status || 'Available')}</span></td><td data-label="Driver">${esc(unit.driver || 'Unassigned')}</td><td data-label="Expiration">${esc(unit.expiration || '-')}</td><td data-label="Maintenance">${esc(unit.maintenance || '-')}</td><td data-label="Actions"><button class="action-mini" data-action="edit-fleet" data-id="${esc(unit.id)}">Edit</button></td></tr>`).join('')}</tbody></table>` : emptyState('No fleet units saved', 'Add real trucks and trailers with expiration and maintenance data.', 'Add unit', 'add-fleet')}
      </div>
    </section>
  `;
}

function renderDrivers() {
  const drivers = arr('drivers');
  const financials = aggregateDriverFinancials();
  const totals = financeSummaryRow(financials, ['loads', 'gross', 'cut', 'miles', 'emptyMiles']);
  const totalRevenuePerMile = totals.miles > 0 ? Math.round((financials.reduce((s, r) => s + r.revenueTotal, 0) / totals.miles) * 100) / 100 : 0;
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Drivers management</h3><p>Driver profiles are created automatically when you add a Driver account in the Admin panel. Edit truck, HOS, safety, GPS tracker link and availability here.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="export-drivers">Export</button>${isAdminUser() ? '<button class="btn btn-primary" data-action="add-user">+ Add driver account</button>' : ''}</div></div>
      ${drivers.length ? `<div class="grid grid-3">${drivers.map(driver => `<article class="card profile-card"><div class="profile-top"><div class="avatar">${esc(initials(driver.name))}</div><div><h4>${esc(driver.name)}</h4><p>${esc(driver.phone || driver.email || '-')}</p></div></div><div class="profile-meta"><span class="status-pill ${statusClass(driver.status)}">${esc(driver.status || 'Available')}</span><span class="tag">${esc(driver.truck || 'No truck')}</span><span class="tag tag-dark">${esc(driver.load || 'No load')}</span></div><div class="profile-stats"><div><strong>${esc(driver.score || '-')}</strong><span>Performance</span></div><div><strong>${esc(driver.safety || 'Clear')}</strong><span>Safety</span></div></div><button class="btn btn-soft" data-action="edit-driver" data-id="${esc(driver.id)}">Edit profile</button></article>`).join('')}</div>` : `<div class="card table-card">${emptyState('No driver profiles yet', 'Create a Driver account in the Admin panel — the profile is generated automatically and can be edited here.', isAdminUser() ? 'Add driver account' : '', isAdminUser() ? 'add-user' : '')}</div>`}
      ${canManageOperations() ? renderRemindersAdminSection() : ''}
      ${canManageOperations() ? `
      <div class="section-header slim"><div><h3>Driver payout &amp; mileage report</h3><p>Gross paid to driver, dispatch cut and revenue-per-mile, aggregated from real loads for the selected date range.</p></div></div>
      ${renderReportRangeBar('drivers')}
      <div class="card table-card">
        ${financials.length ? `<table class="data-table"><thead><tr><th>Driver</th><th># of Loads</th><th>Gross (Driver)</th><th>Cut</th><th>Miles</th><th>Empty Miles</th><th>Revenue/Mile</th></tr></thead><tbody>
          ${financials.map(row => `<tr><td data-label="Driver"><strong>${esc(row.name)}</strong></td><td data-label="# of Loads">${row.loads}</td><td data-label="Gross (Driver)">${money(row.gross)}</td><td data-label="Cut">${money(row.cut)}</td><td data-label="Miles">${row.miles.toLocaleString()}</td><td data-label="Empty Miles">${row.emptyMiles.toLocaleString()}</td><td data-label="Revenue/Mile">${row.revenuePerMile ? '$' + row.revenuePerMile.toFixed(2) : '-'}</td></tr>`).join('')}
          <tr class="finance-summary-row"><td data-label="Driver"><strong>SUMMARY</strong></td><td data-label="# of Loads"><strong>${totals.loads}</strong></td><td data-label="Gross (Driver)"><strong>${money(totals.gross)}</strong></td><td data-label="Cut"><strong>${money(totals.cut)}</strong></td><td data-label="Miles"><strong>${totals.miles.toLocaleString()}</strong></td><td data-label="Empty Miles"><strong>${totals.emptyMiles.toLocaleString()}</strong></td><td data-label="Revenue/Mile"><strong>${totalRevenuePerMile ? '$' + totalRevenuePerMile.toFixed(2) : '-'}</strong></td></tr>
        </tbody></table>` : emptyState('No loads in this range', 'Adjust the date range or add loads with an assigned driver to see payout totals.', '', '')}
      </div>` : ''}
    </section>
  `;
}

function renderBrokers() {
  const brokers = arr('brokers');
  const financials = aggregateCustomerFinancials();
  const totals = financeSummaryRow(financials, ['loads', 'gross', 'cut', 'net', 'open', 'delivered', 'completed']);
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Brokers / customers</h3><p>Contacts, load history, payment status, notes and quick communication actions.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="export-brokers">Export</button><button class="btn btn-primary" data-action="add-broker">+ Add broker</button></div></div>
      <div class="card table-card">
      ${brokers.length ? `<table class="data-table"><thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Loads</th><th>Payment</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${brokers.map(broker => `<tr><td data-label="Company"><strong>${esc(broker.company || broker.name)}</strong></td><td data-label="Contact">${esc(broker.contact || '-')}</td><td data-label="Email">${esc(broker.email || '-')}</td><td data-label="Loads">${arr('loads').filter(load => load.broker === broker.company).length}</td><td data-label="Payment"><span class="status-pill ${statusClass(broker.payment)}">${esc(broker.payment || '-')}</span></td><td data-label="Notes">${esc(broker.notes || '-')}</td><td data-label="Actions"><button class="action-mini" data-action="edit-broker" data-id="${esc(broker.id)}">Edit</button><button class="action-mini" data-page="chat">Chat</button></td></tr>`).join('')}</tbody></table>` : emptyState('No broker or customer records', 'Add real brokers/customers to connect loads with payment and contact details.', 'Add broker', 'add-broker')}
      </div>
      ${canManageOperations() ? `
      <div class="section-header slim"><div><h3>Customer profit report</h3><p>Gross paid to driver, dispatch cut and total net profit per customer/broker for the selected date range.</p></div></div>
      ${renderReportRangeBar('customers')}
      <div class="card table-card">
        ${financials.length ? `<table class="data-table"><thead><tr><th>Customer</th><th># of Loads</th><th>Gross (Driver)</th><th>Cut</th><th>Net Profit</th><th>Open</th><th>Delivered</th><th>Completed</th></tr></thead><tbody>
          ${financials.map(row => `<tr><td data-label="Customer"><strong>${esc(row.name)}</strong></td><td data-label="# of Loads">${row.loads}</td><td data-label="Gross (Driver)">${money(row.gross)}</td><td data-label="Cut">${money(row.cut)}</td><td data-label="Net Profit">${money(row.net)}</td><td data-label="Open">${row.open || '-'}</td><td data-label="Delivered">${row.delivered || '-'}</td><td data-label="Completed">${row.completed || '-'}</td></tr>`).join('')}
          <tr class="finance-summary-row"><td data-label="Customer"><strong>SUMMARY</strong></td><td data-label="# of Loads"><strong>${totals.loads}</strong></td><td data-label="Gross (Driver)"><strong>${money(totals.gross)}</strong></td><td data-label="Cut"><strong>${money(totals.cut)}</strong></td><td data-label="Net Profit"><strong>${money(totals.net)}</strong></td><td data-label="Open"><strong>${totals.open || '-'}</strong></td><td data-label="Delivered"><strong>${totals.delivered || '-'}</strong></td><td data-label="Completed"><strong>${totals.completed || '-'}</strong></td></tr>
        </tbody></table>` : emptyState('No loads in this range', 'Adjust the date range or add loads linked to a broker/customer.', '', '')}
      </div>` : ''}
    </section>
  `;
}

function renderDispatchers() {
  if (!isAdminUser()) {
    return `<section class="page-section"><div class="card table-card">${emptyState('Administrator access required', 'Dispatcher payout performance is visible to administrator accounts only.', '', '')}</div></section>`;
  }
  const financials = aggregateDispatcherFinancials();
  const totals = financeSummaryRow(financials, ['loads', 'gross', 'cut', 'net', 'open']);
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Dispatcher performance</h3><p>Gross paid to driver, dispatch cut and net profit per dispatcher, based on the loads of their assigned drivers.</p></div></div>
      ${renderReportRangeBar('dispatchers')}
      <div class="card table-card">
        ${financials.length ? `<table class="data-table"><thead><tr><th>Dispatcher</th><th># of Loads</th><th>Gross (Driver)</th><th>Cut</th><th>Net Profit</th><th>Open Loads</th></tr></thead><tbody>
          ${financials.map(row => `<tr><td data-label="Dispatcher"><strong>${esc(row.name)}</strong></td><td data-label="# of Loads">${row.loads}</td><td data-label="Gross (Driver)">${money(row.gross)}</td><td data-label="Cut">${money(row.cut)}</td><td data-label="Net Profit">${money(row.net)}</td><td data-label="Open Loads">${row.open || '-'}</td></tr>`).join('')}
          <tr class="finance-summary-row"><td data-label="Dispatcher"><strong>SUMMARY</strong></td><td data-label="# of Loads"><strong>${totals.loads}</strong></td><td data-label="Gross (Driver)"><strong>${money(totals.gross)}</strong></td><td data-label="Cut"><strong>${money(totals.cut)}</strong></td><td data-label="Net Profit"><strong>${money(totals.net)}</strong></td><td data-label="Open Loads"><strong>${totals.open || '-'}</strong></td></tr>
        </tbody></table>` : emptyState('No loads in this range', 'Adjust the date range, or assign drivers to dispatchers and dispatch loads to see payout performance.', '', '')}
      </div>
    </section>
  `;
}

function renderDocuments() {
  const docs = arr('docs');
  if (role() === 'driver') {
    setTimeout(() => { if (!state.docsHub) openDocumentsHub(); }, 30);
    return `<section class="page-section"><div class="section-header"><div><h3>Documents</h3><p>Browse your Personal and Operational documents and photos.</p></div><div class="header-actions"><button class="btn btn-primary" data-action="open-documents-hub">Open Documents</button></div></div>
      <div class="docshub-grid docshub-grid-2">
        <button class="docshub-tile docshub-tile-lg" type="button" data-action="open-documents-hub"><span class="docshub-tile-icon">${icons.doc}</span><strong>Personal Documents</strong><small>CDL, Medical, Drug Test, Insurance, IFTA, CAB Card, Trailer Registration, TITLE, Other</small></button>
        <button class="docshub-tile docshub-tile-lg" type="button" data-action="open-documents-hub"><span class="docshub-tile-icon">${icons.truck}</span><strong>Operational Documents</strong><small>Truck, Trailer, Plates, Truck with JTS, VIN</small></button>
      </div>
    </section>`;
  }
  return `<section class="page-section"><div class="section-header"><div><h3>Documents / BOL / POD</h3><p>Upload, preview, approve, reject and filter documents by driver, load, date and status.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="open-documents-hub">Personal / Operational document</button><button class="btn btn-soft" data-action="generate-confirmation">Create Confirmation</button><button class="btn btn-soft" data-action="dispatch-import">Import ITS/Dispatch</button><button class="btn btn-soft" data-action="doc-intake">Auto-fill intake</button><button class="btn btn-soft" data-action="export-docs">Export</button><button class="btn btn-primary" data-action="upload-doc-modal">+ Upload document</button></div></div>${docs.length ? `<table class="data-table"><thead><tr><th>Load</th><th>Driver</th><th>Type</th><th>Status</th><th>Date</th><th>File</th><th>Actions</th></tr></thead><tbody>${docs.map(doc => `<tr data-doc-id="${esc(doc.id)}" class="${state.selectedDocId === doc.id ? 'target-highlight' : ''}"><td data-label="Load"><strong>${esc(doc.load || (doc.category ? `${doc.category} · ${doc.subType || ''}` : '-'))}</strong></td><td data-label="Driver">${esc(doc.driver || '-')}</td><td data-label="Type">${esc(doc.type || '-')}</td><td data-label="Status"><span class="status-pill ${statusClass(doc.status)}">${esc(doc.status || 'Uploaded')}</span>${doc.rejectionReason ? `<br><small class="muted">${esc(doc.rejectionReason)}</small>` : ''}</td><td data-label="Date">${esc(doc.date || formatDate(doc.createdAt))}</td><td data-label="File">${doc.fileUrl ? `<a href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer">${esc(doc.filename || 'Open')}</a>` : esc(doc.filename || '-')}</td><td data-label="Actions">${canManageDocuments() ? `<button class="action-mini" data-action="approve-doc" data-id="${esc(doc.id)}">Approve</button><button class="action-mini" data-action="reject-doc" data-id="${esc(doc.id)}">Reject</button>` : ''}</td></tr>`).join('')}</tbody></table>` : emptyState('No documents uploaded', 'Upload real BOL, POD, rate confirmation or receipts. Uploaded files will be stored locally.', 'Upload document', 'upload-doc-modal')}</section>`;
}
function renderChat() {
  const contacts = getChatContacts();
  if (state.selectedChat && !contacts.includes(state.selectedChat)) state.selectedChat = '';
  if (!state.selectedChat && contacts.length) state.selectedChat = contacts[0];
  const selected = state.selectedChat || roleDefaultChatContact();
  const selectedEntry = chatContactEntry(selected);
  const messages = appData.chats?.[selected] || [];
  const activeLoad = activeRouteLoads().find(load => load.driver === selectedEntry?.driverName || load.driverEmail === selectedEntry?.userEmail || load.broker === selectedEntry?.label) || activeGpsLoad();
  const accessDescription = state.currentUser?.role === 'driver'
    ? 'Only your dedicated dispatcher can access this conversation. Administrators can supervise all chats.'
    : state.currentUser?.role === 'dispatcher'
      ? 'Your assigned drivers and active administrator accounts are listed here. Each conversation remains separately protected.'
      : state.currentUser?.role === 'admin'
        ? 'Administrator access includes active dispatchers, every dispatcher-driver conversation and broker support.'
        : 'This conversation is available only to your account and administrators.';
  return `
    <section class="page-section chat-page">
      <div class="section-header"><div><h3>Chat system</h3><p>${esc(accessDescription)}</p></div><div class="header-actions"><button class="btn btn-call" data-action="start-voice-call" ${selected ? '' : 'disabled'}>☎ Voice call</button><button class="btn btn-soft" data-action="mark-all-chat-read">Mark chat read</button><button class="btn btn-primary" data-action="chat-attach-file" ${selected ? '' : 'disabled'}>Attach files</button></div></div>
      ${contacts.length ? `<div class="chat-layout card">
        <aside class="chat-contacts">${contacts.map(contact => `<button class="chat-contact ${selected === contact ? 'active' : ''}" data-chat="${esc(contact)}"><div class="avatar">${esc(initials(chatContactLabel(contact)))}</div><div><strong>${esc(chatContactLabel(contact))}</strong><span>${esc(chatMessagePreview((appData.chats?.[contact] || []).slice(-1)[0] || {}) || chatContactSubtitle(contact))}</span></div>${badgeHtml(unreadMessagesForContact(contact).length)}</button>`).join('')}</aside>
        <main class="chat-window">
          <div class="chat-head"><div><h3>${esc(chatContactLabel(selected))}</h3><p>${activeLoad ? `Load ${esc(activeLoad.id)} · ${esc(activeLoad.pickup || '-')} → ${esc(activeLoad.delivery || '-')}` : esc(chatContactSubtitle(selected))}</p></div><div class="chat-head-actions"><button class="btn btn-call" data-action="start-voice-call">☎ Voice call</button><button class="btn btn-soft" data-action="chat-mark-read">Mark read</button></div></div>
          <div id="chatMessages" class="chat-messages">${messages.map(msg => `<div class="message ${isOwnMessage(msg) ? 'out' : 'in'} ${!isOwnMessage(msg) && !isReadByCurrentUser(msg) ? 'unread-message' : ''} ${isVoiceCallMessage(msg) ? 'call-message' : ''}">${renderChatMessageBody(msg)}<span>${esc(msg.user || '')} · ${esc(msg.time || formatDate(msg.createdAt))}${isOwnMessage(msg) ? (msg.readBy?.length > 1 ? ' · Read' : ' · Sent') : (!isReadByCurrentUser(msg) ? ' · Unread' : '')}</span></div>`).join('') || '<p class="muted">No messages in this dedicated conversation yet.</p>'}</div>
          <div class="chat-input"><button class="icon-btn file-btn" title="Attach images or files" aria-label="Attach images or files"><span>+</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf" data-chat-upload="main" multiple></button><input id="chatInput" placeholder="Write a message..." /><button id="sendChatBtn" class="btn btn-primary">Send</button></div>
        </main>
      </div>` : `<div class="card table-card">${emptyState('No authorized chat contacts', state.currentUser?.role === 'driver' ? 'An administrator must assign a dedicated dispatcher to this driver account.' : state.currentUser?.role === 'dispatcher' ? 'No driver accounts are currently assigned to you.' : 'Create driver accounts and assign each one to a dispatcher.', state.currentUser?.role === 'admin' ? 'Add user' : '', state.currentUser?.role === 'admin' ? 'add-user' : '')}</div>`}
    </section>
  `;
}


function renderNotifications() {
  const notifications = arr('notifications').slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const unread = unreadNotificationCount();
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Notification center</h3><p>${unread} unread alert${unread === 1 ? '' : 's'} across load assignments, status changes, documents, delays, GPS and ELD/HOS.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="mark-read">Mark all as read</button>${canManageOperations() ? '<button class="btn btn-primary" data-action="add-notification">+ Add alert</button>' : ''}</div></div>
      <div class="card card-pad"><div class="activity-list notification-list">${notifications.length ? notifications.map(n => {
        const unreadItem = !isReadByCurrentUser(n);
        const isCall = Boolean(n.callId || /voice call|incoming call/i.test(`${n.type || ''} ${n.title || ''}`));
        return `<button class="activity-item notification-item ${unreadItem ? 'unread' : 'read'} ${isCall ? 'voice-call-notification' : ''}" data-action="open-notification" data-notification="${esc(n.id)}"><span class="activity-dot">${isCall ? '☎' : ''}</span><div><strong>${esc(n.title)}</strong><span>${esc(n.text || n.message || '')}</span>${n.relatedLoadId ? `<small>Load ${esc(n.relatedLoadId)}</small>` : ''}${isCall ? '<small>Tap to open call controls</small>' : ''}</div><span class="tag ${unreadItem ? 'tag-teal' : ''}">${unreadItem ? 'Unread' : 'Read'} · ${esc(n.time || formatDate(n.createdAt))}</span></button>`;
      }).join('') : emptyState('No notifications', 'Operational notifications will appear here once real activity starts.', 'Add alert', 'add-notification')}</div></div>
    </section>
  `;
}
function renderFuelPage() {
  setTimeout(() => {
    renderFuelHelpContent();
    if (!hasFuelLocation() && !state.fuelHelp.loading && !state.fuelHelp.error) locateAndSearchFuelStations();
  }, 30);
  return `
    <section class="page-section">
      <div class="section-header">
        <div>
          <h3>Fuel</h3>
          <p>Find fuel stations using live location, choose a preferred chain and open turn-by-turn navigation.</p>
        </div>
      </div>
      <div class="card card-pad"><div id="fuelHelpContent"></div></div>
    </section>`;
}
function renderGps() {
  const loads = activeRouteLoads();
  const liveLoad = activeGpsLoad();
  const liveUrl = activeGpsUrl(liveLoad?.id || '');
  const provider = liveGpsProvider();
  const currentDriver = findDriverForCurrentUser();
  const myLocation = lastLocationForDriver(currentDriver?.name || state.currentUser?.name || '');
  const selectedLocation = myLocation || arr('locations')[0];
  const locationMap = mapsEmbedUrl(selectedLocation);
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>GPS / Location</h3><p>Live GPS iframe, browser GPS from driver mobile, last known location, route summary and pickup/delivery navigation buttons.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="refresh-location">Refresh</button>${state.currentUser?.role === 'driver' ? `<button class="btn btn-soft" data-action="send-current-location">Send current location</button><button class="btn btn-primary" data-action="start-live-gps">Start live GPS</button>` : ''}<button class="btn btn-primary" data-action="open-map" ${liveLoad ? `data-load="${esc(liveLoad.id)}"` : ''}>Open live GPS</button></div></div>
      <div class="grid grid-2 gps-layout">
        <div class="card live-map-card gps-iframe-card">
          <div class="gps-iframe-head">
            <div><span class="tag tag-teal">${esc(provider)}</span><h3>${liveLoad ? esc(`${liveLoad.id} · ${liveLoad.driver || 'Unassigned'}`) : 'Live GPS'}</h3><p>${liveLoad ? esc(`${liveLoad.pickup || '-'} → ${liveLoad.delivery || '-'}`) : 'Add a GPS iframe/link in Settings, upload a document with iframe src, or start driver browser GPS.'}</p></div>
            ${liveUrl ? `<a class="btn btn-soft" href="${esc(liveUrl)}" target="_blank" rel="noreferrer">Open full map</a>` : ''}
          </div>
          ${liveUrl ? `<div class="gps-iframe-shell"><iframe class="gps-iframe" src="${esc(liveUrl)}" title="JTS Live GPS" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe></div>` : locationMap ? `<div class="gps-iframe-shell"><iframe class="gps-iframe" src="${esc(locationMap)}" title="Last known driver location" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>` : `<div class="map-visual large gps-empty"><div class="route-line"></div><span class="map-pin pin-a"></span><span class="map-pin pin-b"></span><span class="map-pin pin-c"></span><strong>No live GPS yet</strong><p>For broker iframe GPS, paste the link in Settings. For driver GPS, open Current Load and press Start live GPS.</p></div>`}
        </div>
        <div class="grid">
          <div class="card card-pad"><h3 class="card-title">Driver browser GPS</h3><p class="card-subtitle">Drivers can share live location from mobile browser while logged in. Works on localhost or HTTPS with location permission.</p><div class="gps-status-grid">${selectedLocation ? `<div><span>Last driver</span><strong>${esc(selectedLocation.driver || '-')}</strong></div><div><span>Coordinates</span><strong>${esc(Number(selectedLocation.lat).toFixed(5))}, ${esc(Number(selectedLocation.lng).toFixed(5))}</strong></div><div><span>Updated</span><strong>${esc(formatDate(selectedLocation.timestamp || selectedLocation.createdAt))}</strong></div>` : '<p class="muted">No browser GPS points saved yet.</p>'}</div>${selectedLocation ? `<div class="header-actions" style="margin-top:14px"><a class="btn btn-soft" href="${esc(mapsPointUrl(selectedLocation))}" target="_blank" rel="noreferrer">Open current position</a></div>` : ''}</div>
          <div class="card card-pad"><h3 class="card-title">Active routes</h3><p class="card-subtitle">Navigation shortcuts and on-time risk for real active loads.</p><div class="activity-list" style="margin-top:14px">${loads.length ? loads.map(load => { const risk = tripRiskForLoad(load); return `<div class="activity-item gps-route-item"><span class="activity-dot"></span><div><strong>${esc(load.id)} · ${esc(load.driver || 'Unassigned')}</strong><span>${esc(load.pickup || '-')} → ${esc(load.delivery || '-')}</span>${scheduleText(load) ? `<small>${esc(scheduleText(load))}</small>` : ''}<small>${esc(risk.detail)}</small>${gpsUrlForLoad(load) ? `<small>Live GPS link detected</small>` : ''}</div><span class="status-pill ${risk.className}">${esc(risk.label)}</span><button class="action-mini" data-action="navigate" data-load="${esc(load.id)}">Open</button></div>`; }).join('') : '<p class="muted">No active routes yet.</p>'}</div></div>
        </div>
      </div>
    </section>
  `;
}

function renderEld() {
  const driver = findDriverForCurrentUser() || arr('drivers')[0];
  const driverLoads = driver ? arr('loads').filter(load => load.driver === driver.name && load.status !== 'Delivered') : [];
  const hos = driverHos(driver || {});
  const hosCards = [
    ['Driving used', hoursLabel(hos.driving), Math.min(100, hos.driving / 11 * 100)],
    ['On-duty used', hoursLabel(hos.onDuty), Math.min(100, hos.onDuty / 14 * 100)],
    ['Off-duty', hoursLabel(hos.offDuty), Math.min(100, hos.offDuty / 10 * 100)],
    ['Drive left', hoursLabel(hos.remainingDrive), Math.min(100, hos.remainingDrive / 11 * 100)],
    ['Cycle left', hoursLabel(hos.cycleLeft), Math.min(100, hos.cycleLeft / 70 * 100)]
  ];
  return `
    <section class="page-section eld-page">
      <div class="section-header"><div><h3>ELD / HOS report</h3><p>Real calculation page using manual HOS values now, ready for Motive/Samsara/Geotab API later.</p></div><div class="header-actions"><button class="btn btn-soft" data-action="update-hos">Update HOS</button><button class="btn btn-soft" data-action="export-eld">Export</button><button class="btn btn-primary" data-action="print">Print</button></div></div>
      ${driver ? `<article class="card eld-report"><header class="eld-report-head eld-report-header"><div><h3>Hours of Service Daily Report</h3><p>Driver legality, ETA risk and delivery on-time calculation.</p></div><span class="status-pill ${statusClass(driver.safety)}">${esc(driver.safety || 'Clear')}</span></header><div class="eld-report-body"><div class="eld-driver-line">${[['Driver name', driver.name], ['Date range', todayLabel()], ['Truck', driver.truck || '-'], ['Current load', driver.load || driverLoads[0]?.id || '-']].map(([a,b]) => `<div class="eld-field"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}</div><div class="eld-hours-grid">${hosCards.map(([title, val, width]) => `<div class="eld-hour-card"><h4>${esc(title)}</h4><strong>${esc(val)}</strong><div class="progress-bar" style="margin-top:14px"><span style="width:${Number(width) || 0}%"></span></div></div>`).join('')}</div><div class="grid grid-2"><div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Violations / alerts</h3><div class="eld-alerts" style="margin-top:12px"><div class="eld-alert ${hos.remainingDrive <= 1 ? 'warning' : 'safe'}"><strong>11-hour drive limit</strong><span>${esc(hoursLabel(hos.remainingDrive))} remaining</span></div><div class="eld-alert ${hos.remainingShift <= 1 ? 'warning' : 'safe'}"><strong>14-hour shift window</strong><span>${esc(hoursLabel(hos.remainingShift))} remaining</span></div><div class="eld-alert ${hos.breakDueIn <= 0.5 ? 'warning' : 'safe'}"><strong>30-minute break</strong><span>${esc(hos.breakDueIn <= 0 ? 'Break due now' : `${hoursLabel(hos.breakDueIn)} until break`)}</span></div><div class="eld-alert ${hos.cycleLeft <= 5 ? 'warning' : 'safe'}"><strong>70-hour cycle</strong><span>${esc(hoursLabel(hos.cycleLeft))} left</span></div></div></div><div class="card card-pad" style="box-shadow:none"><h3 class="card-title">On-time risk by load</h3><p class="card-subtitle">Calculation uses miles, average speed, delivery appointment and available HOS.</p><div class="activity-list" style="margin-top:12px">${driverLoads.length ? driverLoads.map(load => { const risk = tripRiskForLoad(load, driver); return `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(load.id)} · ${esc(load.delivery || '-')}</strong><span>${esc(risk.detail)}</span><small>Need ${esc(hoursLabel(risk.totalNeeded))}; drive ${esc(hoursLabel(risk.drivingNeeded))}${risk.breakNeeded ? ` + break ${esc(hoursLabel(risk.breakNeeded))}` : ''}</small></div><span class="status-pill ${risk.className}">${esc(risk.label)}</span></div>`; }).join('') : '<p class="muted">No active load assigned to this driver.</p>'}</div></div></div></div></article>` : `<div class="card table-card">${emptyState('No driver for HOS report', 'Add driver profiles to use the ELD/HOS report page.', 'Add driver', 'add-driver')}</div>`}
    </section>
  `;
}

function renderReports() {
  const totalRevenue = arr('loads').reduce((sum, load) => sum + Number(load.rate || 0), 0);
  const reportItems = [
    ['Loads report', `${arr('loads').length} records`, 'export-loads'],
    ['Driver performance', `${arr('drivers').length} drivers`, 'export-drivers'],
    ['Revenue overview', money(totalRevenue), 'export-loads'],
    ['Documents report', `${arr('docs').length} documents`, 'export-docs'],
    ['Broker report', `${arr('brokers').length} partners`, 'export-brokers'],
    ['Truck utilization', `${arr('fleet').length} units`, 'export-fleet']
  ];
  const brokerTotals = arr('brokers').map(b => [b.company, arr('loads').filter(l => l.broker === b.company).length]);
  const max = Math.max(1, ...brokerTotals.map(x => x[1]));
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Reports</h3><p>Loads, driver performance, revenue, documents, broker and truck utilization reports.</p></div><div class="header-actions"><input class="filter-input" type="date">${canExportBackup() ? '<button class="btn btn-soft" data-action="export-backup">Export backup</button>' : ''}<button class="btn btn-primary" data-action="print">Print</button></div></div>
      <div class="grid grid-3">${reportItems.map(([title, sub, action]) => `<article class="card report-card"><div class="report-head"><div><h4>${esc(title)}</h4><p>${esc(sub)}</p></div><span class="tag tag-teal">Live</span></div><div class="progress-bar"><span style="width:${hasData() ? 72 : 0}%"></span></div><button class="btn btn-soft" data-action="${esc(action)}">Export</button></article>`).join('')}</div>
      <div class="card card-pad"><h3 class="card-title">Loads by broker/customer</h3><p class="card-subtitle">Calculated from real load records.</p><div class="bar-chart" style="margin-top:16px">${brokerTotals.length ? brokerTotals.map(([label, val]) => `<div class="bar-row"><span>${esc(label)}</span><div class="bar"><span style="width:${Math.round((val / max) * 100)}%"></span></div><strong>${val}</strong></div>`).join('') : '<p class="muted">No broker data yet.</p>'}</div></div>
    </section>
  `;
}

function renderSettings() {
  const c = appData.company || emptyData().company;
  return `
    <section class="page-section">
      <div class="section-header"><div><h3>Settings</h3><p>Company profile, live GPS iframe, logo/theme settings, data import/export and security.</p></div><div class="header-actions">${canExportBackup() ? '<button class="btn btn-soft" data-action="export-backup">Export backup</button>' : ''}<button class="btn btn-primary" data-action="save-settings">Save settings</button></div></div>
      <div class="grid grid-2">
        <div class="card card-pad">
          <h3 class="card-title">Company profile</h3>
          <p class="card-subtitle">Core company identity and dispatch configuration.</p>
          <div id="companySettings" class="settings-grid" style="margin-top:16px">
            <label>Company name<input data-field="name" value="${esc(c.name)}"></label>
            <label>Timezone<input data-field="timezone" value="${esc(c.timezone)}"></label>
            <label>Support email<input data-field="supportEmail" value="${esc(c.supportEmail)}"></label>
            <label>Phone<input data-field="phone" value="${esc(c.phone)}"></label>
            <label>Address<input data-field="address" value="${esc(c.address || '')}"></label>
            <label>MC Number<input data-field="mcNumber" value="${esc(c.mcNumber || '')}"></label>
            <label>DOT Number<input data-field="dotNumber" value="${esc(c.dotNumber || '')}"></label>
            <label>Load prefix<input data-field="loadPrefix" value="${esc(c.loadPrefix)}"></label>
            <label>Default dispatch cut % <input data-field="defaultCutPercent" type="number" step="0.1" min="0" max="100" value="${esc(c.defaultCutPercent ?? 10)}"></label>
            <label class="full">Company description<textarea data-field="description">${esc(c.description || '')}</textarea></label>
            <label>GPS provider<input data-field="gpsProviderName" value="${esc(c.gpsProviderName || c.gpsProvider || 'Live GPS')}"></label>
            <label>Live GPS iframe URL<input data-field="gpsIframeUrl" value="${esc(c.gpsIframeUrl || c.gpsOpenUrl || c.liveGpsUrl || '')}" placeholder="https://..."></label>
            <label>GPS open URL<input data-field="gpsOpenUrl" value="${esc(c.gpsOpenUrl || c.gpsIframeUrl || '')}" placeholder="https://..."></label>
            <label>GPS refresh seconds<input data-field="gpsRefreshSeconds" type="number" min="15" value="${esc(c.gpsRefreshSeconds || 60)}"></label>
            <label class="full">Full iframe code<textarea data-field="gpsIframeHtml" placeholder="Paste full <iframe ...></iframe> code here">${esc(c.gpsIframeHtml || '')}</textarea></label>
          </div>
        </div>
        <div class="card card-pad"><h3 class="card-title">Live GPS preview</h3><p class="card-subtitle">This is the map that dispatchers see in GPS / Location.</p><div style="margin-top:16px">${liveGpsFrame('settings-gps')}</div></div>
        <div class="card card-pad"><h3 class="card-title">Brand theme</h3><p class="card-subtitle">JTS teal, dark graphite, clean white and soft gray system.</p><div class="theme-swatch" style="margin-top:16px"></div><div class="settings-grid" style="margin-top:16px"><label>Primary color<input data-company-color="primaryColor" value="${esc(c.primaryColor)}"></label><label>Secondary color<input data-company-color="secondaryColor" value="${esc(c.secondaryColor)}"></label></div></div>
        <div class="card card-pad"><h3 class="card-title">Data import / export</h3><p class="card-subtitle">Move real data between installs or import CSV/JSON/TXT exports from ITS/Dispatch-style systems.</p><div class="settings-actions" style="margin-top:16px"><button class="btn btn-soft" data-action="export-backup">Download JSON backup</button><label class="btn btn-primary file-btn">Import JSON<input id="importJsonInput" type="file" accept="application/json,.json"></label><button class="btn btn-soft" data-action="dispatch-import">Import ITS/Dispatch export</button></div></div>
        <div class="card card-pad"><h3 class="card-title">Production readiness</h3><p class="card-subtitle">These are the minimum items needed before real users start using the app.</p>${setupChecklist()}</div>
      </div>
    </section>
  `;
}

function bindPageActions() {
  qsa('[data-page]').forEach(btn => { btn.onclick = () => navigate(btn.dataset.page); });
  qsa('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
  qsa('[data-chat]').forEach(btn => { btn.onclick = () => selectChat(btn.dataset.chat); });
  const floatBtn = qs('#floatingChatBtn');
  if (floatBtn) floatBtn.onclick = () => { state.floatingChatOpen = !state.floatingChatOpen; renderApp(); };
  const floatingInput = qs('#floatingChatInput');
  if (floatingInput) floatingInput.onkeydown = e => { if (e.key === 'Enter') sendFloatingChatMessage(); };
  qsa('[data-upload-direct]').forEach(input => { input.onchange = () => uploadDirect(input); });
  qsa('[data-chat-upload]').forEach(input => { input.onchange = () => uploadChatAttachments(input); });
  const send = qs('#sendChatBtn');
  if (send) send.onclick = sendChatMessage;
  const chatInput = qs('#chatInput');
  if (chatInput) chatInput.onkeydown = e => { if (e.key === 'Enter') sendChatMessage(); };
  const loadSearch = qs('#loadSearch');
  if (loadSearch) loadSearch.oninput = e => filterLoadRows(e.target.value);
  const quickUpload = qs('#quickUploadForm');
  if (quickUpload) quickUpload.onsubmit = uploadQuickDocument;
  const importInput = qs('#importJsonInput');
  if (importInput) importInput.onchange = importJsonFile;
  bindIntakeDropzone();
}

function filterLoadRows(query) {
  qsa('.data-table tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(query.toLowerCase()) ? '' : 'none';
  });
}

function getFormData(root = document) {
  const data = {};
  root.querySelectorAll('[data-field]').forEach(input => {
    data[input.dataset.field] = input.value;
  });
  return data;
}

function findById(collection, id) { return arr(collection).find(item => String(item.id) === String(id)); }
function loadById(id) { return arr('loads').find(item => String(item.id) === String(id)); }
function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function findDriverForCurrentUser() { return arr('drivers').find(driver => driver.email && driver.email === state.currentUser?.email) || arr('drivers').find(driver => driver.name === state.currentUser?.name); }


function cleanExternalUrl(value) {
  const raw = String(value || '').trim().replace(/^["']+|["']+$/g, '');
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (error) {
    return '';
  }
}

function gpsUrlForLoad(load = null) {
  return cleanExternalUrl(load?.gpsUrl || load?.gpsIframeUrl || load?.trackingUrl || load?.mapUrl || appData.company?.gpsOpenUrl || appData.company?.gpsIframeUrl || appData.company?.liveGpsUrl || '');
}

function activeRouteLoads() {
  return arr('loads').filter(load => load.status !== 'Delivered');
}

function activeGpsLoad() {
  return activeRouteLoads().find(load => gpsUrlForLoad(load)) || activeRouteLoads()[0] || null;
}

function activeGpsUrl(loadId = '') {
  const selected = loadId ? loadById(loadId) : activeGpsLoad();
  return gpsUrlForLoad(selected) || cleanExternalUrl(appData.company?.gpsOpenUrl || appData.company?.gpsIframeUrl || appData.company?.liveGpsUrl || '');
}

function routeUrlForLoad(load = null) {
  if (!load?.pickup && !load?.delivery) return '';
  const origin = encodeURIComponent(load.pickup || '');
  const destination = encodeURIComponent(load.delivery || '');
  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
}

function openExternal(url, message = 'Live GPS link is not configured yet.') {
  const safe = cleanExternalUrl(url);
  if (!safe) return toast(message);
  window.open(safe, '_blank', 'noopener,noreferrer');
  return null;
}

async function checkRtsMc(loadId = '') {
  if (!canManageOperations()) throw new Error('Only admin and dispatcher users can check RTS Financial status.');
  const modal = qs('#modalRoot');
  const modalData = modal?.classList.contains('active') ? getFormData(modal) : {};
  const load = loadById(loadId) || {};
  const mcNumber = modalData.brokerMc || load.brokerMc || '';
  const broker = modalData.broker || load.broker || '';
  const id = modalData.id || load.id || loadId || '';
  if (!mcNumber) throw new Error('Enter broker MC number first.');
  const result = await api('/api/rts/check-mc', { method: 'POST', body: JSON.stringify({ mcNumber, broker, loadId: id, orderNumber: modalData.poNumber || load.poNumber || '' }) });
  const box = qs('#rtsCheckResult');
  if (box) box.innerHTML = rtsResultHtml(result);
  await loadData();
  toast(`RTS status: ${result.status || 'checked'}`);
}

function openLiveGps(loadId = '') {
  return openExternal(activeGpsUrl(loadId), 'Live GPS iframe/link is not configured yet. Add it in Settings or upload a document containing an iframe src/tracking link.');
}

function openNavigation(loadId = '') {
  const load = loadById(loadId) || activeGpsLoad();
  return openExternal(gpsUrlForLoad(load) || routeUrlForLoad(load), 'No GPS or pickup/delivery route is available for this load.');
}

function scheduleText(load = {}, type = 'both') {
  const pickup = load.pickupTime || load.pickupWindow || '';
  const delivery = load.deliveryTime || load.deliveryWindow || '';
  if (type === 'pickup') return pickup;
  if (type === 'delivery') return delivery;
  if (!pickup && !delivery) return '';
  return `${pickup ? `PU: ${pickup}` : ''}${pickup && delivery ? ' · ' : ''}${delivery ? `DEL: ${delivery}` : ''}`;
}

function getChatContacts() {
  const directory = chatDirectoryEntries().filter(item => item?.key);
  if (directory.length) return directory.map(item => item.key);
  return Object.keys(appData.chats || {}).filter(Boolean).sort();
}

async function handleAction(action, element) {
  const id = element?.dataset?.id;
  const loadId = element?.dataset?.load;
  const leIndex = Number(element?.dataset?.index || 0);
  const leList = element?.dataset?.list;
  const leCategory = element?.dataset?.category;
  const leLocation = element?.dataset?.location || '';
  const map = {
    'new-load': () => openLoadWorkspace(null),
    'edit-load': () => openLoadWorkspace(loadId),
    'open-load-workspace': () => openLoadWorkspace(loadId),
    'reopen-load': () => reopenLoad(loadId),
    'le-tab-info': () => leSetTab('info'),
    'le-tab-post': () => leSetTab('post'),
    'le-tab-waypoints': () => leSetTab('waypoints'),
    'le-add-shipper': () => leAddShipper(),
    'le-remove-shipper': () => leRemoveShipper(leIndex),
    'le-add-consignee': () => leAddConsignee(),
    'le-remove-consignee': () => leRemoveConsignee(leIndex),
    'le-open-charges': () => leOpenCharges(),
    'le-charges-ok': () => leCloseCharges(),
    'le-charges-tab-charges': () => { state.loadEditor.chargesSubTab = 'charges'; syncLoadEditorFromDom(); renderLoadWorkspaceModal(); },
    'le-charges-tab-advances': () => { state.loadEditor.chargesSubTab = 'advances'; syncLoadEditorFromDom(); renderLoadWorkspaceModal(); },
    'le-add-charge-row': () => leAddChargeRow(leList),
    'le-remove-charge-row': () => leRemoveChargeRow(leList, leIndex),
    'le-open-driverpay': () => leOpenDriverPay(),
    'le-driverpay-save': () => leSaveDriverPay(),
    'le-driverpay-tab-additionalPay': () => leDriverPayTab('additionalPay'),
    'le-driverpay-tab-deduction': () => leDriverPayTab('deduction'),
    'le-driverpay-tab-reimbursement': () => leDriverPayTab('reimbursement'),
    'le-add-driverpay-row': () => leAddDriverPayRow(leCategory),
    'le-remove-driverpay-row': () => leRemoveDriverPayRow(leCategory, leIndex),
    'le-open-lastdrops': () => leOpenLastDrops(),
    'le-pick-lastdrop': () => lePickLastDrop(leLocation),
    'le-save': () => saveLoadWorkspace(),
    'check-rts-mc': () => checkRtsMc(loadId),
    'global-search': () => openSearchModal(),
    'notifications': () => navigate('notifications'),
    'open-filters': () => openFiltersModal(),
    'view-load': () => openLoadWorkspace(loadId),
    'assign-driver': () => openAssignModal(loadId),
    'status-next': () => updateNextStatus(loadId),
    'upload-doc': () => navigate('documents'),
    'doc-intake': () => navigate('intake'),
    'smart-import': () => navigate('intake'),
    'dispatch-import': () => openDispatchImportModal(),
    'select-intake-files': () => qs('#docIntakeInput')?.click(),
    'upload-doc-modal': () => openUploadModal(loadId),
    'upload-driver-doc': () => openUploadModal(loadId, element?.dataset?.type || nextDriverUploadType(loadId), true),
    'request-confirmation': () => requestLoadConfirmation(loadId),
    'download-document': () => downloadDocument(id, element?.dataset?.filename),
    'generate-confirmation': () => openGenerateConfirmationModal(),
    'add-driver': () => openDriverModal(),
    'edit-driver': () => openDriverModal(findById('drivers', id)),
    'add-fleet': () => openFleetModal(),
    'edit-fleet': () => openFleetModal(findById('fleet', id)),
    'add-broker': () => openBrokerModal(),
    'edit-broker': () => openBrokerModal(findById('brokers', id)),
    'add-user': () => openUserModal(),
    'edit-user': () => openUserModal(arr('users').find(user => user.id === element?.dataset?.user)),
    'add-notification': () => openNotificationModal(),
    'open-documents-hub': () => openDocumentsHub(),
    'docshub-pick-driver': () => docsHubPickDriver(element?.dataset?.value),
    'docshub-pick-category': () => docsHubPickCategory(element?.dataset?.value),
    'docshub-pick-subtype': () => docsHubPickSubType(element?.dataset?.value),
    'docshub-back': () => docsHubBack(),
    'docshub-upload': () => docsHubUpload(),
    'docshub-open-folder': () => docsHubOpenFolder(element?.dataset?.value),
    'docshub-toggle-create-folder': () => docsHubToggleCreateFolder(),
    'docshub-cancel-create-folder': () => docsHubCancelCreateFolder(),
    'docshub-create-folder': () => docsHubCreateFolder(),
    'docshub-open-doc': () => docsHubOpenDocById(element?.dataset?.doc),
    'view-current-load': () => openDriverLoadDetailModal(element?.dataset?.load),
    'view-previous-load': () => openDriverLoadDetailModal(element?.dataset?.load, true),
    'manage-other-docs': () => openOtherDocumentsModal(element?.dataset?.load),
    'add-reminder': () => openReminderModal(),
    'edit-reminder': () => openReminderModal(findById('reminders', id)),
    'submit-reminder-proof': () => openReminderProofModal(element?.dataset?.reminder),
    'approve-reminder': () => decideReminder(element?.dataset?.reminder, 'Approved'),
    'decline-reminder': () => openReminderDeclineModal(element?.dataset?.reminder),
    'new-chat-contact': () => openChatContactModal(),
    'chat-attach-file': () => {
      const input = qs('[data-chat-upload="main"]');
      if (input) input.click();
      else toast('Select or create a chat contact first.');
    },
    'approve-doc': () => updateDocStatus(id, 'Approved'),
    'reject-doc': () => updateDocStatus(id, 'Rejected'),
    'mark-read': () => markAllNotificationsRead(),
    'open-notification': () => openNotificationTarget(element?.dataset?.notification),
    'mark-notification-read': () => markNotificationRead(element?.dataset?.notification),
    'chat-mark-read': () => markChatRead(state.selectedChat),
    'mark-all-chat-read': () => markAllChatRead(),
    'toggle-floating-chat': () => { state.floatingChatOpen = !state.floatingChatOpen; renderApp(); },
    'send-floating-chat': () => sendFloatingChatMessage(),
    'start-voice-call': () => requestVoiceCall(),
    'answer-voice-call': () => answerVoiceCall(),
    'decline-voice-call': () => declineVoiceCall(),
    'end-voice-call': () => endVoiceCall(),
    'toggle-voice-mute': () => toggleVoiceMute(),
    'close-voice-call': () => closeVoiceCallOverlay(),
    'start-live-gps': () => startLiveGps(),
    'stop-live-gps': () => stopLiveGps(),
    'send-current-location': () => sendCurrentLocation(),
    'update-hos': () => openHosModal(),
    'save-settings': () => saveSettings(),
    'export-loads': () => downloadFile('/api/export/loads', 'jts-loads.csv'),
    'export-drivers': () => downloadFile('/api/export/drivers', 'jts-drivers.csv'),
    'export-fleet': () => downloadFile('/api/export/fleet', 'jts-fleet.csv'),
    'export-brokers': () => downloadFile('/api/export/brokers', 'jts-brokers.csv'),
    'export-docs': () => downloadFile('/api/export/docs', 'jts-documents.csv'),
    'export-users': () => downloadFile('/api/export/users', 'jts-users.csv'),
    'export-eld': () => window.print(),
    'export-backup': () => downloadFile('/api/export', 'jts-backup.json'),
    'refresh': () => refresh(),
    'print': () => window.print(),
    'driver-arrived': () => patchLoad(loadId, { status: 'At Pickup' }, 'Driver status updated: Arrived at pickup'),
    'driver-transit': () => patchLoad(loadId, { status: 'On Route' }, 'Driver status updated: On route'),
    'reopen-load': () => reopenLoad(loadId),
    'fuel-entry': () => openFuelModal(),
    'fuel-help': () => openFuelHelpModal(),
    'fuel-help-locate': () => locateAndSearchFuelStations(),
    'fuel-help-search': () => searchNearbyFuelStations(),
    'issue-report': () => openIssueModal(),
    'open-map': () => openLiveGps(loadId),
    'navigate': () => openNavigation(loadId),
    'refresh-location': () => { renderApp(); toast('Location view refreshed'); },
    'open-url': () => openExternal(element?.dataset?.url || '', 'Link is not available.'),
    'go-loads': () => navigate('loads')
  };
  try {
    await (map[action] || (() => toast('Action ready: ' + action.replace(/-/g, ' '))))();
  } catch (error) {
    toast(error.message);
  }
}

async function checkRtsMc(loadId = '') {
  if (!canManageOperations()) throw new Error('Only admin and dispatcher users can check RTS Financial status.');
  const modal = qs('#modalRoot');
  const modalData = modal?.classList.contains('active') ? getFormData(modal) : {};
  const load = loadById(loadId) || {};
  const mcNumber = modalData.brokerMc || load.brokerMc || '';
  const broker = modalData.broker || load.broker || '';
  const id = modalData.id || load.id || loadId || '';
  if (!mcNumber) throw new Error('Enter broker MC number first.');
  const result = await api('/api/rts/check-mc', { method: 'POST', body: JSON.stringify({ mcNumber, broker, loadId: id, orderNumber: modalData.poNumber || load.poNumber || '' }) });
  const box = qs('#rtsCheckResult');
  if (box) box.innerHTML = rtsResultHtml(result);
  await loadData();
  toast(`RTS status: ${result.status || 'checked'}`);
}

function openLiveGps(loadId = '') {
  return openExternal(activeGpsUrl(loadId), 'Live GPS iframe/link is not configured yet. Add it in Settings or upload a document containing an iframe src/tracking link.');
}
function openNavigation(loadId = '') {
  const load = loadById(loadId) || activeGpsLoad();
  return openExternal(gpsUrlForLoad(load) || routeUrlForLoad(load), 'No GPS or pickup/delivery route is available for this load.');
}


async function selectChat(contact) {
  state.selectedChat = contact || state.selectedChat || roleDefaultChatContact();
  if (state.selectedChat) {
    try { await api('/api/chat/read', { method: 'POST', body: JSON.stringify({ contact: state.selectedChat }) }); } catch (error) {}
    await loadData();
  }
  renderApp();
}
async function markChatRead(contact = state.selectedChat) {
  if (!contact) return;
  await api('/api/chat/read', { method: 'POST', body: JSON.stringify({ contact }) });
  await refresh();
}
async function markAllChatRead() {
  await api('/api/chat/read-all', { method: 'POST', body: JSON.stringify({}) });
  await refresh();
}
async function markNotificationRead(id) {
  if (!id) return;
  await api(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', body: JSON.stringify({}) });
  await refresh();
}
async function markAllNotificationsRead() {
  await api('/api/notifications/read-all', { method: 'POST', body: JSON.stringify({}) });
  await refresh();
  toast('All notifications marked as read');
}
async function sendFloatingChatMessage() {
  const input = qs('#floatingChatInput');
  const text = input?.value?.trim() || '';
  if (!text) return;
  if (!state.selectedChat) state.selectedChat = roleDefaultChatContact();
  await api('/api/chat', { method: 'POST', body: JSON.stringify({ contact: state.selectedChat, text, type: 'out', user: state.currentUser?.name }) });
  input.value = '';
  await refresh();
  state.floatingChatOpen = true;
  renderApp();
}
function geolocationOptions() { return { enableHighAccuracy: true, maximumAge: 15000, timeout: 15000 }; }
async function postBrowserLocation(position) {
  const coords = position.coords || {};
  const currentDriver = findDriverForCurrentUser();
  const activeLoad = currentDriver ? arr('loads').find(load => load.driver === currentDriver.name && load.status !== 'Delivered') : activeGpsLoad();
  await api('/api/location/update', { method: 'POST', body: JSON.stringify({
    driver: currentDriver?.name || state.currentUser?.name,
    loadId: activeLoad?.id || '',
    lat: coords.latitude,
    lng: coords.longitude,
    speed: coords.speed || 0,
    heading: coords.heading || 0,
    accuracy: coords.accuracy || 0
  }) });
}
function sendCurrentLocation() {
  if (!navigator.geolocation) return toast('Browser GPS is not supported on this device.');
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      await postBrowserLocation(position);
      await refresh();
      toast('Current GPS location sent');
    } catch (error) { toast(error.message); }
  }, error => toast(error.message || 'Location permission denied'), geolocationOptions());
}
function startLiveGps() {
  if (!navigator.geolocation) return toast('Browser GPS is not supported on this device.');
  if (state.liveGpsWatchId) return toast('Live GPS sharing is already running');
  state.liveGpsWatchId = navigator.geolocation.watchPosition(async position => {
    try {
      await postBrowserLocation(position);
      state.gpsSharing = true;
      await loadData();
      renderApp();
    } catch (error) { toast(error.message); }
  }, error => toast(error.message || 'Location permission denied'), geolocationOptions());
  state.gpsSharing = true;
  renderApp();
  toast('Live GPS sharing started');
}
function stopLiveGps() {
  if (state.liveGpsWatchId && navigator.geolocation) navigator.geolocation.clearWatch(state.liveGpsWatchId);
  state.liveGpsWatchId = null;
  state.gpsSharing = false;
  renderApp();
  toast('Live GPS sharing stopped');
}
function openHosModal() {
  const driver = findDriverForCurrentUser() || arr('drivers')[0];
  if (!driver) return toast('Add driver first');
  openModal('Update ELD / HOS values', 'Manual values are used for real calculations until ELD provider API is connected.', `
    <div class="form-grid">
      ${selectField('HOS status', 'hosStatus', driver.hosStatus || driver.status || 'Off duty', ['Off duty', 'Sleeper berth', 'On duty', 'Driving'])}
      ${field('Driving hours used today', 'drivingHours', driver.drivingHours || '0')}
      ${field('On-duty hours used today', 'onDutyHours', driver.onDutyHours || '0')}
      ${field('Off-duty hours', 'offDutyHours', driver.offDutyHours || '0')}
      ${field('70-hour cycle used', 'cycleHours', driver.cycleHours || '0')}
      ${field('Average speed MPH', 'averageMph', driver.averageMph || appData.company?.defaultAverageMph || 55, 'number')}
      ${field('Last 30-min break time', 'lastBreakAt', driver.lastBreakAt || '', 'datetime-local')}
    </div>
  `, 'Save HOS', async () => {
    const data = getFormData(qs('#modalRoot'));
    await api('/api/hos/update', { method: 'POST', body: JSON.stringify({ driverId: driver.id, ...data }) });
    await refresh();
  });
}

function filenameFromDisposition(value = '') {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch (error) {}
  }
  return /filename="?([^";]+)"?/i.exec(value)?.[1] || '';
}

async function downloadFile(url, filename = '') {
  const token = storedToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(url, { headers, cache: 'no-store' });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Download failed');
  }
  const blob = await response.blob();
  const serverFilename = filenameFromDisposition(response.headers.get('content-disposition') || '');
  const safeFilename = filename || serverFilename || 'download';
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = safeFilename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
}

async function downloadDocument(documentId, filename = '') {
  if (!documentId) throw new Error('Document is not available for download.');
  await downloadFile(`/api/docs/${encodeURIComponent(documentId)}/download`, filename || 'JTS-Load-Confirmation.pdf');
  toast('PDF download started');
}

async function saveSettings() {
  if (!canManageSettings()) throw new Error('Only admin can change settings.');
  const fields = getFormData(qs('#companySettings'));
  qsa('[data-company-color]').forEach(input => fields[input.dataset.companyColor] = input.value);
  await api('/api/company', { method: 'PUT', body: JSON.stringify(fields) });
  await refresh();
  toast('Settings saved');
}

async function patchLoad(id, payload, message) {
  await api(`/api/loads/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  await refresh();
  toast(message || 'Load updated');
}

async function updateNextStatus(id) {
  const load = loadById(id);
  if (!load) return;
  const index = statusList.indexOf(load.status);
  const next = statusList[Math.min(index + 1, statusList.length - 1)] || 'Dispatched';
  await patchLoad(id, { status: next }, `Status updated: ${next}`);
}
// Reopen: moves a Delivered/Completed load back to the Open Loads tab (e.g. a document was
// rejected/incorrect after delivery and dispatch needs to fix it before it can close again).
async function reopenLoad(id) {
  await patchLoad(id, { status: 'Open' }, 'Load reopened — moved back to Open Loads.');
}

async function updateDocStatus(id, status) {
  if (status === 'Rejected') {
    openModal('Reject document', 'Add a short reason so the driver/dispatcher knows what to correct.', `<div class="form-grid">${textArea('Rejection reason', 'rejectionReason', '')}</div>`, 'Reject document', async () => {
      const data = getFormData(qs('#modalRoot'));
      await api(`/api/docs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, rejectionReason: data.rejectionReason || 'Rejected for review' }) });
      await refresh();
    });
    return;
  }
  await api(`/api/docs/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await refresh();
  toast(`Document ${status.toLowerCase()}`);
}

async function sendChatMessage() {
  const input = qs('#chatInput');
  const text = input.value.trim();
  if (!text || !state.selectedChat) return;
  await api('/api/chat', { method: 'POST', body: JSON.stringify({ contact: state.selectedChat, text, type: 'out', user: state.currentUser?.name }) });
  input.value = '';
  await refresh();
  setTimeout(() => qs('#chatMessages')?.scrollTo({ top: 9999, behavior: 'smooth' }), 0);
}

async function uploadChatAttachments(input) {
  const files = [...(input?.files || [])];
  if (!files.length) return;
  if (!state.selectedChat) state.selectedChat = roleDefaultChatContact();
  if (!state.selectedChat) {
    input.value = '';
    toast('Select a chat contact first.');
    return;
  }
  if (files.length > 10) {
    input.value = '';
    toast('You can attach up to 10 files at once.');
    return;
  }
  const maxBytes = 15 * 1024 * 1024;
  const tooLarge = files.find(file => file.size > maxBytes);
  if (tooLarge) {
    input.value = '';
    toast(`${tooLarge.name} exceeds the 15 MB chat limit.`);
    return;
  }
  const source = input.dataset.chatUpload || 'main';
  const textInput = source === 'floating' ? qs('#floatingChatInput') : qs('#chatInput');
  const fd = new FormData();
  fd.append('contact', state.selectedChat);
  fd.append('text', textInput?.value?.trim() || '');
  const chatEntry = chatContactEntry(state.selectedChat);
  const activeLoad = activeRouteLoads().find(load => load.driver === chatEntry?.driverName || load.driverEmail === chatEntry?.userEmail || load.broker === chatEntry?.label) || activeGpsLoad();
  fd.append('loadId', activeLoad?.id || '');
  files.forEach(file => fd.append('files', file, file.name));
  input.disabled = true;
  try {
    await api('/api/chat/upload', { method: 'POST', body: fd });
    if (textInput) textInput.value = '';
    input.value = '';
    await refresh();
    state.floatingChatOpen = source === 'floating' ? true : state.floatingChatOpen;
    renderApp();
    setTimeout(() => {
      qs('#chatMessages')?.scrollTo({ top: 999999, behavior: 'smooth' });
      qs('.floating-messages')?.scrollTo({ top: 999999, behavior: 'smooth' });
    }, 0);
    toast(`${files.length} file${files.length === 1 ? '' : 's'} sent`);
  } catch (error) {
    toast(error.message);
  } finally {
    input.disabled = false;
  }
}

async function uploadQuickDocument(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  await api('/api/upload', { method: 'POST', body: formData });
  form.reset();
  await refresh();
  toast('Document uploaded');
}

async function uploadDirect(input) {
  if (!input.files || !input.files[0]) return;
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('load', input.dataset.load || '');
  fd.append('driver', state.currentUser?.name || '');
  fd.append('type', input.dataset.uploadDirect === 'photo' ? 'Photo' : 'Attachment');
  await api('/api/upload', { method: 'POST', body: fd });
  await refresh();
  toast(`${input.files[0].name} uploaded`);
}

function bindIntakeDropzone() {
  const dropzone = qs('#docIntakeDropzone');
  const input = qs('#docIntakeInput');
  if (!dropzone || !input || dropzone.dataset.bound === 'true') return;
  dropzone.dataset.bound = 'true';
  dropzone.addEventListener('click', event => {
    if (event.target !== input) input.click();
  });
  dropzone.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener('change', () => handleIntakeFiles(input.files));
  ['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  }));
  ['dragleave', 'drop'].forEach(name => dropzone.addEventListener(name, event => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  }));
  dropzone.addEventListener('drop', event => handleIntakeFiles(event.dataTransfer?.files));
}

async function handleIntakeFiles(fileList) {
  const files = [...(fileList || [])].filter(file => file && file.size > 0);
  if (!files.length) return;
  if (!canManageOperations()) {
    toast('Only admin and dispatcher users can run document intake.');
    return;
  }

  const dropzone = qs('#docIntakeDropzone');
  const input = qs('#docIntakeInput');
  const maxSingleFileBytes = 40 * 1024 * 1024;
  const acceptedFiles = files.filter(file => {
    if (file.size > maxSingleFileBytes) {
      toast(`${file.name} is too large. Upload files under 40 MB each.`);
      return false;
    }
    return true;
  });
  if (!acceptedFiles.length) return;

  const allResults = [];
  const failedFiles = [];
  dropzone?.classList.add('is-processing');
  if (input) input.disabled = true;

  try {
    for (let index = 0; index < acceptedFiles.length; index += 1) {
      const file = acceptedFiles[index];
      toast(`Processing ${index + 1}/${acceptedFiles.length}: ${file.name}`);
      const fd = new FormData();
      fd.append('files', file);
      fd.append('source', 'dispatcher-dropzone');
      try {
        const response = await api('/api/intake', { method: 'POST', body: fd });
        allResults.push(...(response.results || []));
      } catch (error) {
        failedFiles.push(`${file.name}: ${error.message || 'Upload failed'}`);
      }
    }

    state.intakeResults = allResults;
    await loadSystemHealth();
    await loadData();
    renderApp();

    if (failedFiles.length && allResults.length) {
      toast(`${allResults.length} document(s) saved. ${failedFiles.length} file(s) failed, please retry them one by one.`);
    } else if (failedFiles.length) {
      toast(`No documents were saved. ${failedFiles[0]}`);
    } else {
      toast(`${allResults.length} document(s) processed and saved`);
    }
  } finally {
    dropzone?.classList.remove('is-processing');
    if (input) {
      input.disabled = false;
      input.value = '';
    }
  }
}

async function importJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  await api('/api/import', { method: 'POST', body: JSON.stringify(data) });
  await refresh();
  toast('Data imported');
}

function field(label, name, value = '', type = 'text', extra = '') {
  return `<label class="field">${esc(label)}<input data-field="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${extra}></label>`;
}
function textArea(label, name, value = '') {
  return `<label class="field full">${esc(label)}<textarea data-field="${esc(name)}">${esc(value)}</textarea></label>`;
}
function selectField(label, name, value, options) {
  return `<label class="field">${esc(label)}<select data-field="${esc(name)}">${options.map(opt => `<option value="${esc(opt)}" ${String(opt) === String(value) ? 'selected' : ''}>${esc(opt)}</option>`).join('')}</select></label>`;
}

/* =========================================================================
   LOAD WORKSPACE — ITS-Dispatch-style "Load Information" screen.
   Single modal with an in-memory working copy (state.loadEditor) so the
   "Other Charges" and "Edit Driver Pay" popups can appear "on top" of the
   form without losing any typed data — the whole modal body is re-rendered
   from state.loadEditor on every interaction, and DOM inputs are synced
   back into it first.
   ========================================================================= */
function moneyPrecise(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));
}
function emptyShipperRow(existing = null) {
  if (existing && !(existing.shippers || []).length && existing.pickup) {
    return { name: '', bol: existing.bolNumber || '', location: existing.pickup || '', date: existing.pickupDate || '', time: existing.pickupWindow || existing.pickupTime || '', showTime: true, description: existing.commodity || '', type: '', qty: '', weight: existing.weight || '', value: '', notes: '', poNumbers: existing.poNumber || '', customsBroker: '' };
  }
  return { name: '', bol: '', location: '', date: '', time: '', showTime: true, description: '', type: '', qty: '', weight: '', value: '', notes: '', poNumbers: '', customsBroker: '' };
}
function emptyConsigneeRow(existing = null) {
  if (existing && !(existing.consignees || []).length && existing.delivery) {
    return { name: '', location: existing.delivery || '', date: existing.deliveryDate || '', time: existing.deliveryWindow || existing.deliveryTime || '', showTime: true, description: existing.commodity || '', type: '', qty: '', weight: existing.weight || '', value: '', notes: '', poNumbers: existing.deliveryNumber || '' };
  }
  return { name: '', location: '', date: '', time: '', showTime: true, description: '', type: '', qty: '', weight: '', value: '', notes: '', poNumbers: '' };
}
// Recent delivery (consignee) locations for a driver's previous loads — shown via the small icon next
// to Shipper so dispatch can see roughly where the truck is coming from before booking the next pickup.
function driverRecentDrops(driverName, excludeLoadId = '') {
  if (!driverName) return [];
  return arr('loads')
    .filter(load => load.driver === driverName && load.id !== excludeLoadId && isDeliveredStatus(load.status))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 3)
    .map(load => (load.consignees || []).length ? load.consignees[load.consignees.length - 1].location : load.delivery)
    .filter(Boolean);
}
function openLoadWorkspace(loadId) {
  const existing = loadId ? loadById(loadId) : null;
  const c = appData.company || emptyData().company;
  const fallbackId = `${c.loadPrefix || 'JTS'}-${String(Date.now()).slice(-6)}`;
  state.loadEditor = {
    isNew: !existing,
    id: existing?.id || fallbackId,
    status: existing?.status || 'Open',
    docs: existing?.docs || 'Missing',
    broker: existing?.broker || '',
    brokerMc: existing?.brokerMc || '',
    refNumber: existing?.refNumber || existing?.poNumber || '',
    loadType: existing?.loadType || 'Line Haul',
    dispatcherId: existing?.dispatcherId || '',
    dispatcherName: existing?.dispatcherName || '',
    salesRepChoice: existing?.salesRepChoice || 'rep1',
    salesRep1: existing?.salesRep1 || '',
    salesRep2: existing?.salesRep2 || '',
    carrierOrDriver: existing?.carrierOrDriver || 'driver',
    driver: existing?.driver || 'Unassigned',
    truck: existing?.truck || 'Unassigned',
    equipmentType: existing?.equipmentType || '',
    trailerNumber: existing?.trailerNumber || '',
    flatRate: Number(existing?.flatRate || 0),
    driverRate: Number(existing?.driverRate || 0),
    cutAmount: Number(existing?.cutAmount || 0),
    chargesList: existing?.chargesList ? existing.chargesList.map(r => ({ ...r })) : [],
    advancesList: existing?.advancesList ? existing.advancesList.map(r => ({ ...r })) : [],
    shippers: (existing?.shippers || []).length ? existing.shippers.map(r => ({ ...r })) : [emptyShipperRow(existing)],
    consignees: (existing?.consignees || []).length ? existing.consignees.map(r => ({ ...r })) : [emptyConsigneeRow(existing)],
    proMiles: Number(existing?.proMiles ?? existing?.miles ?? 0),
    proMilesEmpty: Number(existing?.proMilesEmpty ?? 0),
    driverMiles: Number(existing?.driverMiles ?? existing?.miles ?? 0),
    driverMilesEmpty: Number(existing?.driverMilesEmpty ?? existing?.emptyMiles ?? 0),
    lastDropOverride: existing?.lastDropOverride || '',
    notes: existing?.notes || '',
    internalNotes: existing?.internalNotes || '',
    brokerNotes: existing?.brokerNotes || '',
    gpsUrl: existing?.gpsUrl || existing?.gpsOpenUrl || '',
    gpsIframeUrl: existing?.gpsIframeUrl || '',
    subView: null,
    tab: 'info'
  };
  renderLoadWorkspaceModal();
}
function closeLoadWorkspace() {
  state.loadEditor = null;
  closeModal();
}
// Reads every [data-le-field] input currently in the modal DOM back into state.loadEditor before any
// re-render, so switching tabs / adding rows / opening a sub-view never loses what was typed.
function syncLoadEditorFromDom() {
  const ed = state.loadEditor;
  if (!ed) return;
  const modal = qs('#modalRoot');
  if (!modal) return;
  modal.querySelectorAll('[data-le-field]').forEach(input => {
    const path = input.dataset.leField;
    const value = input.type === 'checkbox' ? input.checked : input.value;
    setDeepPath(ed, path, value);
  });
}
function setDeepPath(obj, path, value) {
  const parts = path.split('.');
  let target = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const isIndex = /^\d+$/.test(parts[i + 1]);
    if (target[key] === undefined) target[key] = isIndex ? [] : {};
    target = target[key];
  }
  target[parts[parts.length - 1]] = value;
}
function loadEditorBrokerRate() {
  const ed = state.loadEditor;
  const otherCharges = [...ed.chargesList, ...ed.advancesList].reduce((sum, r) => sum + Number(r.amount || 0), 0);
  return { otherCharges, brokerRate: Number(ed.driverRate || 0) + Number(ed.cutAmount || 0) + otherCharges };
}
function leAddShipper() { syncLoadEditorFromDom(); state.loadEditor.shippers.push(emptyShipperRow()); renderLoadWorkspaceModal(); }
function leRemoveShipper(index) { syncLoadEditorFromDom(); state.loadEditor.shippers.splice(index, 1); if (!state.loadEditor.shippers.length) state.loadEditor.shippers.push(emptyShipperRow()); renderLoadWorkspaceModal(); }
function leAddConsignee() { syncLoadEditorFromDom(); state.loadEditor.consignees.push(emptyConsigneeRow()); renderLoadWorkspaceModal(); }
function leRemoveConsignee(index) { syncLoadEditorFromDom(); state.loadEditor.consignees.splice(index, 1); if (!state.loadEditor.consignees.length) state.loadEditor.consignees.push(emptyConsigneeRow()); renderLoadWorkspaceModal(); }
function leOpenCharges() { syncLoadEditorFromDom(); state.loadEditor.subView = 'charges'; renderLoadWorkspaceModal(); }
function leCloseCharges() { syncLoadEditorFromDom(); state.loadEditor.subView = null; renderLoadWorkspaceModal(); }
function leAddChargeRow(listName) { syncLoadEditorFromDom(); state.loadEditor[listName].push({ charge: '', amount: 0 }); renderLoadWorkspaceModal(); }
function leRemoveChargeRow(listName, index) { syncLoadEditorFromDom(); state.loadEditor[listName].splice(index, 1); renderLoadWorkspaceModal(); }
function leOpenLastDrops() { syncLoadEditorFromDom(); state.loadEditor.subView = 'lastdrops'; renderLoadWorkspaceModal(); }
function leCloseLastDrops() { syncLoadEditorFromDom(); state.loadEditor.subView = null; renderLoadWorkspaceModal(); }
function lePickLastDrop(location) { syncLoadEditorFromDom(); state.loadEditor.lastDropOverride = location; state.loadEditor.subView = null; renderLoadWorkspaceModal(); }
async function leOpenDriverPay() {
  syncLoadEditorFromDom();
  const ed = state.loadEditor;
  if (!ed.driver || ed.driver === 'Unassigned') { toast('Select a driver first.'); return; }
  await loadData().catch(() => {});
  const own = arr('driverPayAdjustments').filter(item => String(item.driverName || '').toLowerCase() === String(ed.driver).toLowerCase());
  ed.driverPayDraft = {
    deduction: own.filter(i => i.category === 'deduction').map(i => ({ id: i.id, note: i.note, amount: i.amount, date: i.date })),
    reimbursement: own.filter(i => i.category === 'reimbursement').map(i => ({ id: i.id, note: i.note, amount: i.amount, date: i.date })),
    additionalPay: own.filter(i => i.category === 'additionalPay').map(i => ({ id: i.id, note: i.note, amount: i.amount, date: i.date })),
    removedIds: [],
    tab: 'additionalPay'
  };
  ed.subView = 'driverPay';
  renderLoadWorkspaceModal();
}
function leCloseDriverPay() { syncLoadEditorFromDom(); state.loadEditor.subView = null; renderLoadWorkspaceModal(); }
function leDriverPayTab(tab) { syncLoadEditorFromDom(); state.loadEditor.driverPayDraft.tab = tab; renderLoadWorkspaceModal(); }
function leAddDriverPayRow(category) { syncLoadEditorFromDom(); state.loadEditor.driverPayDraft[category].push({ note: '', amount: 0, date: new Date().toISOString().slice(0, 10) }); renderLoadWorkspaceModal(); }
function leRemoveDriverPayRow(category, index) {
  syncLoadEditorFromDom();
  const row = state.loadEditor.driverPayDraft[category][index];
  if (row?.id) state.loadEditor.driverPayDraft.removedIds.push(row.id);
  state.loadEditor.driverPayDraft[category].splice(index, 1);
  renderLoadWorkspaceModal();
}
async function leSaveDriverPay() {
  syncLoadEditorFromDom();
  const ed = state.loadEditor;
  const draft = ed.driverPayDraft;
  const driverUser = arr('users').find(u => u.role === 'driver' && u.name === ed.driver);
  try {
    for (const idToRemove of draft.removedIds) { await api(`/api/driverPayAdjustments/${encodeURIComponent(idToRemove)}`, { method: 'DELETE' }); }
    for (const category of ['deduction', 'reimbursement', 'additionalPay']) {
      for (const row of draft[category]) {
        if (!row.note && !Number(row.amount)) continue;
        const payload = { driverName: ed.driver, driverEmail: driverUser?.email || '', category, note: row.note, amount: Number(row.amount || 0), date: row.date || new Date().toISOString().slice(0, 10) };
        if (row.id) await api(`/api/driverPayAdjustments/${encodeURIComponent(row.id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
        else await api('/api/driverPayAdjustments', { method: 'POST', body: JSON.stringify(payload) });
      }
    }
    await loadData();
    toast('Driver pay updated');
  } catch (error) { toast(error.message); }
  ed.subView = null;
  renderLoadWorkspaceModal();
}
function leSetTab(tab) { syncLoadEditorFromDom(); state.loadEditor.tab = tab; renderLoadWorkspaceModal(); }
async function saveLoadWorkspace() {
  syncLoadEditorFromDom();
  const ed = state.loadEditor;
  if (!ed.id) throw new Error('Load # is required.');
  const dispatcherUser = arr('users').find(u => u.id === ed.dispatcherId || u.name === ed.dispatcherName);
  const payload = {
    id: ed.id,
    status: ed.status,
    broker: ed.broker,
    brokerMc: ed.brokerMc,
    refNumber: ed.refNumber,
    loadType: ed.loadType,
    dispatcherId: dispatcherUser?.id || ed.dispatcherId || '',
    dispatcherName: dispatcherUser?.name || ed.dispatcherName || '',
    salesRepChoice: ed.salesRepChoice,
    salesRep1: ed.salesRep1,
    salesRep2: ed.salesRep2,
    carrierOrDriver: ed.carrierOrDriver,
    driver: ed.driver,
    truck: ed.truck,
    equipmentType: ed.equipmentType,
    trailerNumber: ed.trailerNumber,
    flatRate: Number(ed.flatRate || 0),
    driverRate: Number(ed.driverRate || 0),
    cutAmount: Number(ed.cutAmount || 0),
    chargesList: ed.chargesList,
    advancesList: ed.advancesList,
    shippers: ed.shippers,
    consignees: ed.consignees,
    proMiles: Number(ed.proMiles || 0),
    proMilesEmpty: Number(ed.proMilesEmpty || 0),
    driverMiles: Number(ed.driverMiles || 0),
    driverMilesEmpty: Number(ed.driverMilesEmpty || 0),
    miles: Number(ed.driverMiles || ed.proMiles || 0),
    emptyMiles: Number(ed.driverMilesEmpty || ed.proMilesEmpty || 0),
    lastDropOverride: ed.lastDropOverride,
    notes: ed.notes,
    internalNotes: ed.internalNotes,
    brokerNotes: ed.brokerNotes,
    gpsUrl: ed.gpsUrl,
    pickup: ed.shippers[0]?.location || '',
    delivery: ed.consignees[ed.consignees.length - 1]?.location || '',
    pickupTime: ed.shippers[0] ? [ed.shippers[0].date, ed.shippers[0].time].filter(Boolean).join(' ') : '',
    deliveryTime: ed.consignees.length ? [ed.consignees[ed.consignees.length - 1].date, ed.consignees[ed.consignees.length - 1].time].filter(Boolean).join(' ') : ''
  };
  const wasNew = Boolean(ed.isNew);
  if (wasNew) await api('/api/loads', { method: 'POST', body: JSON.stringify(payload) });
  else await api(`/api/loads/${encodeURIComponent(ed.id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  state.loadEditor = null;
  closeModal();
  await refresh();
  toast(`Load ${payload.id} ${wasNew ? 'created' : 'saved'}`);
}
function leStopBlock(kind, row, index, total) {
  const isShipper = kind === 'shipper';
  const label = isShipper ? `Shipper ${index + 1}` : `Consignee ${index + 1}`;
  const prefix = `${kind}s.${index}`;
  const lastDropIcon = isShipper && index === 0 ? `<button class="le-icon-btn" type="button" data-action="le-open-lastdrops" title="Show last drop-off addresses">${icons.pin}</button>` : '';
  return `
    <div class="le-stop-block">
      <div class="le-stop-head">
        <span class="tag tag-teal">${esc(label)}</span>
        ${isShipper ? `<span class="le-stop-bol">Bill of Lading</span>` : ''}
        ${lastDropIcon}
        <div class="le-stop-actions">
          ${total > 1 ? `<button class="action-mini" type="button" data-action="le-remove-${kind}" data-index="${index}">Remove</button>` : ''}
          ${index === total - 1 ? `<button class="action-mini" type="button" data-action="le-add-${kind}">+ Add ${isShipper ? 'Shipper' : 'Consignee'} ${total + 1}</button>` : ''}
        </div>
      </div>
      <div class="form-grid le-stop-grid">
        <label class="field">${isShipper ? 'Shipper' : 'Consignee'}<input data-le-field="${prefix}.name" value="${esc(row.name)}"></label>
        <label class="field">Location<input data-le-field="${prefix}.location" value="${esc(row.location)}" placeholder="City, State"></label>
        <label class="field">Date<input type="date" data-le-field="${prefix}.date" value="${esc(row.date)}"></label>
        <label class="field le-time-field">Time<input type="time" data-le-field="${prefix}.time" value="${esc(row.time)}"><label class="le-showtime"><input type="checkbox" data-le-field="${prefix}.showTime" ${row.showTime ? 'checked' : ''}> Show Time</label></label>
        <label class="field">Description<input data-le-field="${prefix}.description" value="${esc(row.description)}"></label>
        <label class="field">Type (TL, LTL, Pallets, etc.)<input data-le-field="${prefix}.type" value="${esc(row.type)}"></label>
        <label class="field">Qty<input data-le-field="${prefix}.qty" value="${esc(row.qty)}"></label>
        <label class="field">Weight (lbs)<input data-le-field="${prefix}.weight" value="${esc(row.weight)}"></label>
        <label class="field">Value ($)<input data-le-field="${prefix}.value" value="${esc(row.value)}"></label>
        <label class="field full">${isShipper ? 'Shipping notes' : 'Delivery notes'}<input data-le-field="${prefix}.notes" value="${esc(row.notes)}"></label>
        <label class="field">P.O. Numbers<input data-le-field="${prefix}.poNumbers" value="${esc(row.poNumbers)}"></label>
        ${isShipper ? `<label class="field">Customs Broker<input data-le-field="${prefix}.customsBroker" value="${esc(row.customsBroker)}"></label>` : ''}
      </div>
    </div>`;
}
function renderLoadWorkspaceModal() {
  const ed = state.loadEditor;
  const root = qs('#modalRoot');
  if (!ed || !root) return;
  root.classList.add('active', 'load-workspace-active');
  if (ed.subView === 'charges') return renderChargesSubView(root);
  if (ed.subView === 'driverPay') return renderDriverPaySubView(root);
  if (ed.subView === 'lastdrops') return renderLastDropsSubView(root);

  const { otherCharges, brokerRate } = loadEditorBrokerRate();
  const dispatcherOptions = arr('users').filter(u => u.role === 'dispatcher' && u.status !== 'Disabled');
  const isDriverMode = ed.carrierOrDriver === 'driver';

  root.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-card load-workspace-modal" role="dialog" aria-modal="true" aria-label="Load Information">
      <div class="modal-head le-modal-head">
        <div class="le-tabs">
          <button class="le-tab ${ed.tab === 'info' ? 'active' : ''}" type="button" data-action="le-tab-info">Load Information</button>
          <button class="le-tab ${ed.tab === 'post' ? 'active' : ''}" type="button" data-action="le-tab-post">Post to TRUCKSTOP.COM</button>
          <button class="le-tab ${ed.tab === 'waypoints' ? 'active' : ''}" type="button" data-action="le-tab-waypoints">Waypoints</button>
        </div>
        <button class="icon-btn" data-close-modal aria-label="Close">×</button>
      </div>
      <div class="modal-body le-modal-body">
        ${ed.tab === 'post' ? renderLoadWorkspacePostTab() : ed.tab === 'waypoints' ? renderLoadWorkspaceWaypointsTab(ed) : `
        <div class="le-info-tab">
          <div class="form-grid le-top-grid">
            <label class="field">Load #<input data-le-field="id" value="${esc(ed.id)}" ${ed.isNew ? '' : 'readonly'}></label>
            <label class="field">Bill To<input data-le-field="broker" value="${esc(ed.broker)}" placeholder="Customer / Broker name"></label>
            <label class="field">Dispatcher
              <select data-le-field="dispatcherName">
                <option value="">Please select</option>
                ${dispatcherOptions.map(u => `<option value="${esc(u.name)}" ${ed.dispatcherName === u.name ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
              </select>
            </label>
            <div class="field le-salesrep-field">
              <span>Sales Rep</span>
              <div class="le-salesrep-row">
                <label class="le-radio"><input type="radio" name="leSalesRepChoice" data-le-field="salesRepChoice" value="rep1" ${ed.salesRepChoice === 'rep1' ? 'checked' : ''}> Rep 1</label>
                <input data-le-field="salesRep1" value="${esc(ed.salesRep1)}" placeholder="Sales rep 1 name">
                <label class="le-radio"><input type="radio" name="leSalesRepChoice" data-le-field="salesRepChoice" value="rep2" ${ed.salesRepChoice === 'rep2' ? 'checked' : ''}> Rep 2</label>
                <input data-le-field="salesRep2" value="${esc(ed.salesRep2)}" placeholder="Sales rep 2 name">
              </div>
            </div>
            <label class="field">Status<select data-le-field="status">${statusList.map(s => `<option value="${esc(s)}" ${ed.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></label>
            <label class="field">Ref. Number<input data-le-field="refNumber" value="${esc(ed.refNumber)}"></label>
            <label class="field">Broker MC #<input data-le-field="brokerMc" value="${esc(ed.brokerMc)}"></label>
          </div>

          <div class="le-financial-block">
            <div class="form-grid le-financial-grid">
              <label class="field">Type<select data-le-field="loadType"><option ${ed.loadType === 'Line Haul' ? 'selected' : ''}>Line Haul</option><option ${ed.loadType === 'TONU' ? 'selected' : ''}>TONU</option></select></label>
              <label class="field">Driver Rate ($)<input type="number" step="0.01" data-le-field="driverRate" value="${esc(ed.driverRate)}"></label>
              <label class="field">Cut ($)<input type="number" step="0.01" data-le-field="cutAmount" value="${esc(ed.cutAmount)}"></label>
              <label class="field">Other Charges<button class="btn btn-soft le-charges-btn" type="button" data-action="le-open-charges">${moneyPrecise(otherCharges)} · Edit</button></label>
              <label class="field le-broker-rate"><span>Broker Rate</span><strong>USD ${moneyPrecise(brokerRate)}</strong></label>
              <label class="field">Flat Rate<input type="number" step="0.01" data-le-field="flatRate" value="${esc(ed.flatRate)}"></label>
            </div>
          </div>

          <div class="le-assignment-block">
            <div class="le-radio-row">
              <label class="le-radio"><input type="radio" name="leCarrierOrDriver" data-le-field="carrierOrDriver" value="carrier" ${!isDriverMode ? 'checked' : ''}> Carrier</label>
              <label class="le-radio"><input type="radio" name="leCarrierOrDriver" data-le-field="carrierOrDriver" value="driver" ${isDriverMode ? 'checked' : ''}> Driver</label>
              ${ed.driver && ed.driver !== 'Unassigned' ? `<button class="le-icon-btn" type="button" data-action="le-open-driverpay" title="Deductions, reimbursements and additional pay for this driver">${icons.report}</button>` : ''}
            </div>
            <div class="form-grid le-assignment-grid">
              <label class="field">${isDriverMode ? 'Driver' : 'Carrier'}<select data-le-field="driver">${['Unassigned', ...driverAssignmentNames()].map(name => `<option value="${esc(name)}" ${ed.driver === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
              <label class="field">Equipment Type<select data-le-field="equipmentType"><option value="">Select</option>${['Van', 'Flat', 'Reefer'].map(t => `<option value="${esc(t)}" ${ed.equipmentType === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
              <label class="field">Truck<select data-le-field="truck">${['Unassigned', ...arr('fleet').map(f => f.unit).filter(Boolean)].map(unit => `<option value="${esc(unit)}" ${ed.truck === unit ? 'selected' : ''}>${esc(unit)}</option>`).join('')}</select></label>
              <label class="field">Trailer<input data-le-field="trailerNumber" value="${esc(ed.trailerNumber)}"></label>
            </div>
          </div>

          ${ed.shippers.map((row, index) => leStopBlock('shipper', row, index, ed.shippers.length)).join('')}
          ${ed.consignees.map((row, index) => leStopBlock('consignee', row, index, ed.consignees.length)).join('')}

          <div class="le-miles-block">
            <div class="form-grid le-miles-grid">
              <label class="field">ProMiles Miles<input type="number" data-le-field="proMiles" value="${esc(ed.proMiles)}"></label>
              <label class="field">Empty<input type="number" data-le-field="proMilesEmpty" value="${esc(ed.proMilesEmpty)}"></label>
              <label class="field">Driver Miles<input type="number" data-le-field="driverMiles" value="${esc(ed.driverMiles)}"></label>
              <label class="field">Empty<input type="number" data-le-field="driverMilesEmpty" value="${esc(ed.driverMilesEmpty)}"></label>
            </div>
            <p class="muted le-miles-hint">Loaded miles = Miles − Empty. Empty miles here feed the IFTA mileage report; use the pin icon above to check the driver's last drop-off city before estimating.</p>
          </div>

          <div class="form-grid" style="margin-top:16px">
            <label class="field full">Live GPS URL<input data-le-field="gpsUrl" value="${esc(ed.gpsUrl)}" placeholder="https://..."></label>
            <label class="field full">Notes / instructions<textarea data-le-field="notes">${esc(ed.notes)}</textarea></label>
            ${canManageOperations() ? `<label class="field full">Internal notes (dispatch/admin only)<textarea data-le-field="internalNotes">${esc(ed.internalNotes)}</textarea></label>` : ''}
            <label class="field full">Broker-visible notes<textarea data-le-field="brokerNotes">${esc(ed.brokerNotes)}</textarea></label>
          </div>
        </div>`}
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" type="button" data-close-modal>Cancel</button>
        <button class="btn btn-primary" type="button" data-action="le-save">${ed.isNew ? 'Create load' : 'Save load'}</button>
      </div>
    </div>`;
  bindLoadWorkspaceEvents(root);
}
function renderLoadWorkspacePostTab() {
  return `<div class="empty-state"><div class="empty-icon">${icons.truck}</div><h3>Post to TRUCKSTOP.COM</h3><p class="muted">Carrier-posting integration is not connected in this build. Configure a TruckStop.com API key in Settings to enable posting this load directly from here.</p></div>`;
}
function renderLoadWorkspaceWaypointsTab(ed) {
  const stops = [...ed.shippers.map((s, i) => ({ kind: 'Pickup', label: `Shipper ${i + 1}`, row: s })), ...ed.consignees.map((c, i) => ({ kind: 'Delivery', label: `Consignee ${i + 1}`, row: c }))];
  return `<div class="le-waypoints"><div class="activity-list">${stops.map(s => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(s.label)} · ${esc(s.kind)}</strong><span>${esc(s.row.location || 'No location set')} ${s.row.date ? '· ' + esc(s.row.date) : ''} ${s.row.time ? esc(s.row.time) : ''}</span></div></div>`).join('') || '<p class="muted">No stops added yet.</p>'}</div></div>`;
}
function renderChargesSubView(root) {
  const ed = state.loadEditor;
  const chargesTotal = ed.chargesList.reduce((s, r) => s + Number(r.amount || 0), 0);
  const advancesTotal = ed.advancesList.reduce((s, r) => s + Number(r.amount || 0), 0);
  const activeTab = ed.chargesSubTab || 'charges';
  const list = activeTab === 'advances' ? ed.advancesList : ed.chargesList;
  const listName = activeTab === 'advances' ? 'advancesList' : 'chargesList';
  root.innerHTML = `
    <div class="modal-backdrop" data-le-charges-cancel></div>
    <div class="modal-card le-subview-modal" role="dialog" aria-modal="true" aria-label="Other Charges">
      <div class="modal-head le-subview-head">
        <h3>Other Charges</h3>
        <button class="icon-btn" type="button" data-le-charges-cancel aria-label="Close">×</button>
      </div>
      <div class="le-subview-tabs">
        <button class="le-tab ${activeTab === 'charges' ? 'active' : ''}" type="button" data-action="le-charges-tab-charges">Charges</button>
        <button class="le-tab ${activeTab === 'advances' ? 'active' : ''}" type="button" data-action="le-charges-tab-advances">Advances</button>
      </div>
      <div class="modal-body">
        <table class="data-table le-charges-table"><thead><tr><th>Charge</th><th>Amount</th><th></th></tr></thead><tbody>
          ${list.map((row, index) => `<tr>
            <td><input data-le-field="${listName}.${index}.charge" value="${esc(row.charge)}" placeholder="Description"></td>
            <td><input type="number" step="0.01" data-le-field="${listName}.${index}.amount" value="${esc(row.amount)}"></td>
            <td><button class="action-mini" type="button" data-action="le-remove-charge-row" data-list="${listName}" data-index="${index}">Remove</button></td>
          </tr>`).join('')}
        </tbody></table>
        <button class="btn btn-soft" type="button" data-action="le-add-charge-row" data-list="${listName}">+ Add row</button>
        <p class="muted le-charges-note">* Total Amount Calculated on Edit/Add Load.<br>* Information saved when the load is saved.</p>
        <div class="le-charges-total">Charges: ${moneyPrecise(chargesTotal)} &nbsp;·&nbsp; Advances: ${moneyPrecise(advancesTotal)} &nbsp;·&nbsp; <strong>Total: ${moneyPrecise(chargesTotal + advancesTotal)}</strong></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" type="button" data-le-charges-cancel>Cancel</button>
        <button class="btn btn-primary" type="button" data-action="le-charges-ok">OK</button>
      </div>
    </div>`;
  root.querySelectorAll('[data-le-charges-cancel]').forEach(x => { x.onclick = leCloseCharges; });
  root.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
}
function renderDriverPaySubView(root) {
  const ed = state.loadEditor;
  const draft = ed.driverPayDraft;
  const activeTab = draft.tab || 'additionalPay';
  const tabLabels = { additionalPay: 'Additional Pay', deduction: 'Deductions/Advances', reimbursement: 'Reimbursements' };
  const list = draft[activeTab];
  const total = ['deduction', 'reimbursement', 'additionalPay'].reduce((sum, cat) => sum + draft[cat].reduce((s, r) => s + (cat === 'deduction' ? -Number(r.amount || 0) : Number(r.amount || 0)), 0), 0);
  root.innerHTML = `
    <div class="modal-backdrop" data-le-driverpay-cancel></div>
    <div class="modal-card le-subview-modal" role="dialog" aria-modal="true" aria-label="Edit Driver Pay">
      <div class="modal-head le-subview-head">
        <h3>Edit Driver Pay · ${esc(ed.driver)}</h3>
        <button class="icon-btn" type="button" data-le-driverpay-cancel aria-label="Close">×</button>
      </div>
      <div class="le-subview-tabs">
        <button class="le-tab ${activeTab === 'additionalPay' ? 'active' : ''}" type="button" data-action="le-driverpay-tab-additionalPay">Additional Pay</button>
        <button class="le-tab ${activeTab === 'deduction' ? 'active' : ''}" type="button" data-action="le-driverpay-tab-deduction">Deductions/Advances</button>
        <button class="le-tab ${activeTab === 'reimbursement' ? 'active' : ''}" type="button" data-action="le-driverpay-tab-reimbursement">Reimbursements</button>
      </div>
      <div class="modal-body">
        <p class="muted">${esc(tabLabels[activeTab])} entries are applied to this driver's Weekly Payroll report based on the date entered.</p>
        <table class="data-table le-charges-table"><thead><tr><th>Note</th><th>Date</th><th>Amount</th><th></th></tr></thead><tbody>
          ${list.map((row, index) => `<tr>
            <td><input data-le-field="driverPayDraft.${activeTab}.${index}.note" value="${esc(row.note)}" placeholder="Reason"></td>
            <td><input type="date" data-le-field="driverPayDraft.${activeTab}.${index}.date" value="${esc(row.date)}"></td>
            <td><input type="number" step="0.01" data-le-field="driverPayDraft.${activeTab}.${index}.amount" value="${esc(row.amount)}"></td>
            <td><button class="action-mini" type="button" data-action="le-remove-driverpay-row" data-category="${activeTab}" data-index="${index}">Remove</button></td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">No entries yet.</td></tr>'}
        </tbody></table>
        <button class="btn btn-soft" type="button" data-action="le-add-driverpay-row" data-category="${activeTab}">+ Add row</button>
        <div class="le-charges-total">Net effect on pay: <strong>${moneyPrecise(total)}</strong></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-soft" type="button" data-le-driverpay-cancel>Cancel</button>
        <button class="btn btn-primary" type="button" data-action="le-driverpay-save">Save</button>
      </div>
    </div>`;
  root.querySelectorAll('[data-le-driverpay-cancel]').forEach(x => { x.onclick = leCloseDriverPay; });
  root.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
}
function renderLastDropsSubView(root) {
  const ed = state.loadEditor;
  const drops = driverRecentDrops(ed.driver, ed.isNew ? '' : ed.id);
  root.innerHTML = `
    <div class="modal-backdrop" data-le-lastdrops-cancel></div>
    <div class="modal-card le-subview-modal le-subview-modal-sm" role="dialog" aria-modal="true" aria-label="Last drop-off addresses">
      <div class="modal-head le-subview-head">
        <h3>Last drop-off addresses</h3>
        <button class="icon-btn" type="button" data-le-lastdrops-cancel aria-label="Close">×</button>
      </div>
      <div class="modal-body">
        <p class="muted">Most recent completed loads for ${esc(ed.driver || 'this driver')}. Pick one to use as the reference drop location, or type a custom one below.</p>
        <div class="activity-list">${drops.length ? drops.map(loc => `<button class="quick-action-card" type="button" data-action="le-pick-lastdrop" data-location="${esc(loc)}">${esc(loc)}</button>`).join('') : '<p class="muted">No completed loads found for this driver yet.</p>'}</div>
        <label class="field full" style="margin-top:14px">Custom last drop-off address<input data-le-field="lastDropOverride" value="${esc(ed.lastDropOverride)}"></label>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" type="button" data-le-lastdrops-cancel>Done</button>
      </div>
    </div>`;
  root.querySelectorAll('[data-le-lastdrops-cancel]').forEach(x => { x.onclick = leCloseLastDrops; });
  root.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
}
function bindLoadWorkspaceEvents(root) {
  root.querySelectorAll('[data-close-modal]').forEach(x => { x.onclick = closeLoadWorkspace; });
  root.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
  root.querySelectorAll('input[type="radio"][data-le-field]').forEach(input => {
    input.addEventListener('change', () => { syncLoadEditorFromDom(); renderLoadWorkspaceModal(); });
  });
}

function openLoadModal(load = null) {
  const c = appData.company || emptyData().company;
  const fallbackId = `${c.loadPrefix || 'JTS'}-${String(Date.now()).slice(-6)}`;
  openModal(load ? `Edit load · ${load.id}` : 'Create new load', 'Save real dispatch data. This record will be stored in data/db.json.', `
    <div class="form-grid">
      ${field('Load ID', 'id', load?.id || fallbackId)}
      ${selectField('Status', 'status', load?.status || 'New', statusList)}
      ${field('Broker / customer', 'broker', load?.broker || '')}
      ${field('Broker MC number', 'brokerMc', load?.brokerMc || '')}
      <div class="field full rts-field-block">
        <button class="btn btn-soft" type="button" data-action="check-rts-mc" data-load="${esc(load?.id || '')}">Check MC with RTS Financial</button>
        <div id="rtsCheckResult">${rtsResultHtml(load || {})}</div>
      </div>
      ${field('Pickup', 'pickup', load?.pickup || '', 'text', 'placeholder="City, State"')}
      ${field('Delivery', 'delivery', load?.delivery || '', 'text', 'placeholder="City, State"')}
      ${field('Pickup time / appointment', 'pickupTime', load?.pickupTime || '')}
      ${field('Delivery time / appointment', 'deliveryTime', load?.deliveryTime || '')}
      ${field('Pickup reference', 'pickupNumber', load?.pickupNumber || '')}
      ${field('Delivery reference', 'deliveryNumber', load?.deliveryNumber || '')}
      ${field('PO number', 'poNumber', load?.poNumber || '')}
      ${field('Secondary PO / stop ref', 'secondaryPoNumber', load?.secondaryPoNumber || '')}
      ${field('BOL number', 'bolNumber', load?.bolNumber || '')}
      ${field('Shipment ID', 'shipmentId', load?.shipmentId || '')}
      ${field('Customer Ref', 'customerRef', load?.customerRef || '')}
      ${field('Commodity', 'commodity', load?.commodity || '')}
      ${field('Weight', 'weight', load?.weight || '')}
      ${field('Equipment', 'equipment', load?.equipment || '')}
      ${field('Equipment size', 'equipmentSize', load?.equipmentSize || '')}
      ${field('Load mode', 'loadMode', load?.loadMode || '')}
      ${field('Driver requirements', 'driverRequirements', load?.driverRequirements || '')}
      ${field('Cargo value', 'cargoValue', load?.cargoValue || '')}
      ${field('Carrier', 'carrier', load?.carrier || '')}
      ${field('Live GPS URL', 'gpsUrl', load?.gpsUrl || load?.gpsOpenUrl || '', 'url')}
      ${field('Load iframe URL', 'gpsIframeUrl', load?.gpsIframeUrl || '', 'url')}
      ${field('Rate (Gross Revenue)', 'rate', load?.rate || '', 'number')}
      ${field('Miles', 'miles', load?.miles || '', 'number')}
      ${field('Empty miles', 'emptyMiles', load?.emptyMiles || 0, 'number')}
      ${field('Dispatch cut %', 'cutPercent', load?.cutPercent ?? c.defaultCutPercent ?? 10, 'number', 'step="0.1" min="0" max="100"')}
      ${field('Other costs (subtracted from net profit)', 'otherCosts', load?.otherCosts || 0, 'number')}
      <div class="field full payout-breakdown-block" id="loadPayoutBreakdown"></div>
      ${selectField('Driver', 'driver', load?.driver || 'Unassigned', ['Unassigned', ...driverAssignmentNames()])}
      ${selectField('Truck', 'truck', load?.truck || 'Unassigned', ['Unassigned', ...arr('fleet').map(f => f.unit).filter(Boolean)])}
      ${selectField('Documents', 'docs', load?.docs || 'Missing', docStatusList)}
      ${textArea('Notes / instructions', 'notes', load?.notes || '')}
      ${canManageOperations() ? textArea('Internal notes (dispatch/admin only)', 'internalNotes', load?.internalNotes || '') : ''}
      ${textArea('Broker-visible notes', 'brokerNotes', load?.brokerNotes || '')}
    </div>
  `, load ? 'Save load' : 'Create load', async () => {
    const data = getFormData(qs('#modalRoot'));
    if (load) await api(`/api/loads/${encodeURIComponent(load.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
    else await api('/api/loads', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
  bindLoadPayoutBreakdown();
}
function bindLoadPayoutBreakdown() {
  const modal = qs('#modalRoot');
  if (!modal) return;
  const rateInput = modal.querySelector('[data-field="rate"]');
  const cutInput = modal.querySelector('[data-field="cutPercent"]');
  const costsInput = modal.querySelector('[data-field="otherCosts"]');
  const output = modal.querySelector('#loadPayoutBreakdown');
  if (!rateInput || !cutInput || !output) return;
  const recompute = () => {
    const rate = Number(rateInput.value || 0);
    const cutPercent = Math.max(0, Math.min(100, Number(cutInput.value || 0)));
    const otherCosts = Number(costsInput?.value || 0);
    const cutAmount = Math.round(rate * cutPercent / 100 * 100) / 100;
    const driverGross = Math.round((rate - cutAmount) * 100) / 100;
    const netProfit = Math.round((cutAmount - otherCosts) * 100) / 100;
    output.innerHTML = `<div class="payout-breakdown"><div><span>Gross for driver</span><strong>${money(driverGross)}</strong></div><div><span>Cut (dispatch)</span><strong>${money(cutAmount)}</strong></div><div><span>Net profit</span><strong>${money(netProfit)}</strong></div></div>`;
  };
  [rateInput, cutInput, costsInput].forEach(input => { if (input) input.addEventListener('input', recompute); });
  recompute();
}

function openDriverModal(driver = null) {
  openModal(driver ? `Edit driver · ${driver.name}` : 'Add driver', 'Driver profile used for dispatching, mobile app, safety and HOS reporting.', `
    <div class="form-grid">
      ${field('Full name', 'name', driver?.name || '')}
      ${field('Email', 'email', driver?.email || '', 'email')}
      ${field('Phone', 'phone', driver?.phone || '')}
      ${selectField('Status', 'status', driver?.status || 'Available', ['Available', 'On duty', 'Driving', 'At pickup', 'At delivery', 'Off duty', 'Delayed'])}
      ${selectField('Truck', 'truck', driver?.truck || '', ['', ...arr('fleet').map(f => f.unit).filter(Boolean)])}
      ${selectField('Current load', 'load', driver?.load || '', ['', ...arr('loads').map(l => l.id).filter(Boolean)])}
      ${field('Performance score', 'score', driver?.score || '')}
      ${field('Safety status', 'safety', driver?.safety || 'Clear')}
      ${field('Driving hours', 'drivingHours', driver?.drivingHours || '')}
      ${field('On-duty hours', 'onDutyHours', driver?.onDutyHours || '')}
      ${field('Remaining hours', 'remainingHours', driver?.remainingHours || '')}
      ${field('Off-duty hours', 'offDutyHours', driver?.offDutyHours || '')}
      ${field('70-hour cycle used', 'cycleHours', driver?.cycleHours || '')}
      ${field('Average speed MPH', 'averageMph', driver?.averageMph || 55, 'number')}
      ${field('Last break time', 'lastBreakAt', driver?.lastBreakAt || '', 'datetime-local')}
      <label class="field full">Live GPS tracker link (paid provider)<input data-field="gpsTrackerUrl" type="url" value="${esc(driver?.gpsTrackerUrl || '')}" placeholder="https://your-gps-provider.com/track/..."><small class="muted">Paste the per-driver tracking link from your paid GPS/ELD provider. It is shown to this driver inside Current Load.</small></label>
    </div>
  `, driver ? 'Save driver' : 'Add driver', async () => {
    const data = getFormData(qs('#modalRoot'));
    if (driver) await api(`/api/drivers/${encodeURIComponent(driver.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
    else await api('/api/drivers', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
}

function openFleetModal(unit = null) {
  openModal(unit ? `Edit unit · ${unit.unit}` : 'Add truck / trailer', 'Fleet record with status, assigned driver, expirations and maintenance.', `
    <div class="form-grid">
      ${field('Unit number', 'unit', unit?.unit || '')}
      ${field('Truck type', 'type', unit?.type || '', 'text', 'placeholder="2022 Freightliner Cascadia"')}
      ${field('Trailer', 'trailer', unit?.trailer || '')}
      ${selectField('Status', 'status', unit?.status || 'Available', ['Available', 'Assigned', 'Maintenance', 'Out of service'])}
      ${selectField('Driver assigned', 'driver', unit?.driver || 'Unassigned', ['Unassigned', ...driverAssignmentNames()])}
      ${field('Expiration reminder', 'expiration', unit?.expiration || '')}
      ${field('Maintenance reminder', 'maintenance', unit?.maintenance || '')}
      ${textArea('Inspection notes', 'notes', unit?.notes || '')}
    </div>
  `, unit ? 'Save unit' : 'Add unit', async () => {
    const data = getFormData(qs('#modalRoot'));
    data.id = unit?.id || data.unit || undefined;
    if (unit) await api(`/api/fleet/${encodeURIComponent(unit.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
    else await api('/api/fleet', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
}

function openBrokerModal(broker = null) {
  openModal(broker ? `Edit broker · ${broker.company}` : 'Add broker / customer', 'Customer record with contacts, payment status, history and notes.', `
    <div class="form-grid">
      ${field('Company', 'company', broker?.company || broker?.name || '')}
      ${field('Contact person', 'contact', broker?.contact || '')}
      ${field('Email', 'email', broker?.email || '', 'email')}
      ${field('Phone', 'phone', broker?.phone || '')}
      ${selectField('Payment status', 'payment', broker?.payment || 'Current', ['Current', 'Net 15', 'Net 21', 'Net 30', 'Review', 'Past due'])}
      ${textArea('Notes', 'notes', broker?.notes || '')}
    </div>
  `, broker ? 'Save broker' : 'Add broker', async () => {
    const data = getFormData(qs('#modalRoot'));
    if (broker) await api(`/api/brokers/${encodeURIComponent(broker.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
    else await api('/api/brokers', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
}

function openUserModal(user = null) {
  const dispatchers = arr('users').filter(item => item.role === 'dispatcher' && item.status !== 'Disabled');
  const selectedDispatcher = user?.dispatcherId || dispatchers.find(item => item.email === user?.dispatcherEmail)?.id || '';
  const dispatcherOptions = `<label class="field">Dedicated dispatcher<select data-field="dispatcherId"><option value="">Select dispatcher</option>${dispatchers.map(item => `<option value="${esc(item.id)}" ${item.id === selectedDispatcher ? 'selected' : ''}>${esc(item.name)} · ${esc(item.email)}</option>`).join('')}</select><small class="muted">Required only for Driver accounts. This controls Chat access.</small></label>`;
  openModal(user ? `Edit user · ${user.name}` : 'Add user account', 'Create real login accounts and assign every Driver to one dedicated Dispatcher.', `
    <div class="form-grid">
      ${field('Full name', 'name', user?.name || '')}
      ${field('Email', 'email', user?.email || '', 'email')}
      ${selectField('Role', 'role', user?.role || 'dispatcher', ['admin', 'dispatcher', 'driver', 'broker'])}
      ${dispatcherOptions}
      ${selectField('Status', 'status', user?.status || 'Active', ['Active', 'Disabled'])}
      ${field(user ? 'New password (optional - user must change after reset)' : 'Temporary password', 'password', '', 'password', user ? '' : 'required minlength="6"')}
      <div class="field full"><small class="muted">For Driver accounts, select the dedicated Dispatcher. Drivers see only that Dispatcher; Dispatchers see only their assigned Drivers; Admin sees all conversations.</small></div>
    </div>
  `, user ? 'Save user' : 'Create user', async () => {
    const data = getFormData(qs('#modalRoot'));
    if (data.role === 'driver' && !data.dispatcherId) throw new Error('Select a dedicated dispatcher for the driver account.');
    if (!data.password) delete data.password;
    if (user) await api(`/api/users/${encodeURIComponent(user.id)}`, { method: 'PATCH', body: JSON.stringify(data) });
    else await api('/api/users', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
}


function openUploadModal(loadId = '', fixedType = '', driverMode = false) {
  const selectedLoad = loadById(loadId);
  const typeOptions = fixedType ? `<option>${esc(fixedType)}</option>` : '<option>BOL</option><option>POD</option><option>Load confirmation</option><option>Rate confirmation</option><option>Fuel receipt</option><option>Lumper receipt</option><option>Other</option>';
  openModal(`Upload ${fixedType || 'document'}`, driverMode ? `Upload ${fixedType} for dispatcher/admin approval.` : 'Upload BOL, POD, load confirmation, rate confirmation, fuel receipt or any operational file.', `
    <form id="modalUploadForm" class="form-grid">
      <label class="field">Load<select name="load">${arr('loads').map(l => `<option value="${esc(l.id)}" ${l.id === loadId ? 'selected' : ''}>${esc(l.id)} · ${esc(l.pickup || '')} → ${esc(l.delivery || '')}</option>`).join('')}<option value="">General document</option></select></label>
      <label class="field">Driver<input name="driver" value="${esc(selectedLoad?.driver || (driverMode ? state.currentUser?.name : ''))}" placeholder="Driver name" ${driverMode ? 'readonly' : ''}></label>
      <label class="field">Type<select name="type" ${fixedType ? 'disabled' : ''}>${typeOptions}</select></label>
      ${fixedType ? `<input type="hidden" name="type" value="${esc(fixedType)}">` : ''}
      <label class="field">File<input name="file" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" required></label>
    </form>`, 'Upload', async () => { const fd = new FormData(qs('#modalUploadForm')); await api('/api/upload', { method: 'POST', body: fd }); await refresh(); });
}

async function requestLoadConfirmation(loadId) {
  await api(`/api/loads/${encodeURIComponent(loadId)}/request-confirmation`, { method: 'POST', body: JSON.stringify({}) });
  toast('Confirmation request sent to your dispatcher.');
  await refresh();
}

function eligibleConfirmationDrivers() {
  const users = arr('users').filter(user => user.role === 'driver' && user.status !== 'Disabled');
  if (isAdminUser()) return users;
  return users.filter(user => user.dispatcherId === state.currentUser?.id || String(user.dispatcherEmail || '').toLowerCase() === String(state.currentUser?.email || '').toLowerCase());
}
function openGenerateConfirmationModal() {
  if (!canManageOperations()) return toast('Dispatcher or admin access is required.');
  const drivers = eligibleConfirmationDrivers();
  const loads = arr('loads').filter(load => drivers.some(user => String(user.email || '').toLowerCase() === String(load.driverEmail || '').toLowerCase() || user.name === load.driver));
  openModal('Create Load Confirmation', 'Generate a JTS-branded PDF and attach it immediately to the selected driver and load.', `<div class="form-grid">${selectField('Driver', 'driverEmail', drivers[0]?.email || '', drivers.map(user => user.email))}${selectField('Load', 'loadId', loads[0]?.id || '', loads.map(load => load.id))}${textArea('Special instructions', 'instructions', '')}</div>`, 'Generate and attach PDF', async () => { const data = getFormData(qs('#modalRoot')); await api('/api/confirmations/generate', { method: 'POST', body: JSON.stringify(data) }); await refresh(); toast('Confirmation PDF generated and attached.'); });
}

function openDispatchImportModal() {
  if (!canManageOperations()) return toast('Dispatcher or admin access is required.');
  openModal('Import ITS / Dispatch export', 'Import CSV, JSON or TXT exports from dispatch/TMS systems. Supported columns include Load ID, Pickup, Delivery, Pickup Time, Delivery Time, Broker, Rate, Miles, Driver, Truck, Trailer and GPS iframe/GPS URL.', `
    <form id="dispatchImportForm" class="form-grid">
      <label class="field full">Export file<input name="file" type="file" accept=".csv,.json,.txt,.tsv" required></label>
      <div class="import-help full">
        <strong>Recommended headers:</strong>
        <span>Load ID, Status, Broker, Pickup, Delivery, Pickup Date, Pickup Time, Delivery Date, Delivery Time, Rate, Miles, Driver, Truck, Trailer, GPS URL, GPS Iframe URL, Notes</span>
      </div>
    </form>
  `, 'Import data', async () => {
    const form = qs('#dispatchImportForm');
    const fd = new FormData(form);
    const result = await api('/api/import-dispatch', { method: 'POST', body: fd });
    await refresh();
    const summary = result.summary || {};
    toast(`Import completed: ${summary.created || 0} created, ${summary.updated || 0} updated, ${summary.gpsLinksDetected || 0} GPS links`);
  });
}

function openNotificationModal() {
  const accountOptions = arr('users')
    .filter(user => user?.email && user?.status !== 'Disabled')
    .map(user => `<option value="user:${esc(user.email)}">${esc(user.name || user.email)} · ${esc(user.role || 'user')}</option>`)
    .join('');
  const audienceField = `<label class="field">Audience<select data-field="audience">
    <option value="role:dispatcher">All dispatchers</option>
    <option value="role:admin">Administrators</option>
    <option value="role:driver">All drivers</option>
    <option value="role:broker">All brokers</option>
    ${accountOptions}
  </select></label>`;
  openModal('Add notification', 'Send one alert only to the selected role or exact account.', `<div class="form-grid">${field('Title', 'title', '')}${field('Message', 'text', '')}${selectField('Type', 'type', 'Admin alert', ['New load assigned', 'Driver status changed', 'Document uploaded', 'Document missing', 'Load delayed', 'ELD/HOS alert', 'Admin alert', 'Broker update'])}${audienceField}</div>`, 'Add alert', async () => {
    const data = getFormData(qs('#modalRoot'));
    const audience = String(data.audience || '');
    delete data.audience;
    if (audience.startsWith('user:')) data.target = audience.slice(5);
    else if (audience.startsWith('role:')) data.role = audience.slice(5);
    else throw new Error('Select a notification audience.');
    data.time = 'Now';
    await api('/api/notifications', { method: 'POST', body: JSON.stringify(data) });
    await refresh();
  });
}

function openChatContactModal() {
  openModal('New chat contact', 'Create a chat thread for a driver, broker or internal contact.', `<div class="form-grid">${field('Contact name', 'contact', '')}</div>`, 'Create chat', async () => {
    const contact = getFormData(qs('#modalRoot')).contact;
    if (!contact) throw new Error('Contact name is required.');
    await api('/api/chat', { method: 'POST', body: JSON.stringify({ contact, text: 'Chat thread created.', type: 'out', user: state.currentUser?.name }) });
    state.selectedChat = contact;
    await refresh();
  });
}

function openSearchModal() {
  const sampleResults = [
    ...arr('loads').slice(0, 3).map(load => [load.id, `${load.pickup || '-'} to ${load.delivery || '-'} · ${load.status}`]),
    ...arr('drivers').slice(0, 2).map(driver => [driver.name, `${driver.status || '-'} · ${driver.truck || '-'}`]),
    ...arr('fleet').slice(0, 2).map(unit => [unit.unit, `${unit.status || '-'} · ${unit.driver || '-'}`])
  ];
  openModal('Global search', 'Search loads, drivers, trucks, documents and brokers.', `
    <label class="field full">Search<input autofocus placeholder="Type load ID, driver, truck, broker..."></label>
    <div class="activity-list" style="margin-top:16px">${sampleResults.length ? sampleResults.map(([a,b]) => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(a)}</strong><span>${esc(b)}</span></div></div>`).join('') : '<p class="muted">No records to search yet.</p>'}</div>
  `, 'Close');
}

function openFiltersModal() {
  openModal('Advanced filters', 'Narrow operations by date, driver, truck, broker and status.', `
    <div class="form-grid">
      <label class="field">Date<input type="date"></label>
      <label class="field">Driver<select><option>All drivers</option>${arr('drivers').map(d => `<option>${esc(d.name)}</option>`).join('')}</select></label>
      <label class="field">Truck<select><option>All trucks</option>${arr('fleet').map(f => `<option>${esc(f.unit)}</option>`).join('')}</select></label>
      <label class="field">Broker<select><option>All brokers</option>${arr('brokers').map(b => `<option>${esc(b.company)}</option>`).join('')}</select></label>
      <label class="field full">Status<select><option>All statuses</option>${statusList.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
    </div>
  `, 'Apply filters');
}

function openLoadDetails(id) {
  const load = loadById(id);
  if (!load) return toast('Load not found');
  const relatedDocs = arr('docs').filter(doc => doc.load === load.id);
  openModal(`Load details · ${load.id}`, 'Timeline, activity, notes, documents, status, GPS and communication context.', `
    <div class="grid grid-2">
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Lane</h3><p class="card-subtitle"><strong>${esc(load.pickup || '-')}</strong><br>to<br><strong>${esc(load.delivery || '-')}</strong></p></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Assignment</h3><p class="card-subtitle">${esc(load.driver || 'Unassigned')} · ${esc(load.truck || '-') }<br>${esc(load.broker || '-')}</p></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Schedule</h3><p class="card-subtitle">${esc(scheduleText(load) || 'No pickup/delivery hours saved')}</p></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">References</h3><p class="card-subtitle">PO: ${esc([load.poNumber, load.secondaryPoNumber].filter(Boolean).join(' / ') || load.reference || '-')}<br>BOL: ${esc(load.bolNumber || '-')}<br>Shipment: ${esc(load.shipmentId || '-')}<br>Customer Ref: ${esc(load.customerRef || '-')}<br>PU/DEL Ref: ${esc([load.pickupNumber, load.deliveryNumber].filter(Boolean).join(' / ') || '-')}</p></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Freight</h3><p class="card-subtitle">${esc(load.commodity || '-')}<br>${esc(load.weight || '-')} · ${esc([load.equipment, load.equipmentSize].filter(Boolean).join(' / ') || '-')}<br>${esc(load.driverRequirements || '')}</p></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Financial</h3><p class="card-subtitle">${money(load.rate)} · ${esc(load.miles || 0)} miles (${esc(loadEmptyMiles(load))} empty) · ${loadRevenuePerMile(load) ? '$' + loadRevenuePerMile(load).toFixed(2) + '/mile' : 'Revenue/mile n/a'}<br>Cargo value: ${esc(load.cargoValue || '-')}</p>${canManageOperations() ? `<div class="payout-breakdown"><div><span>Gross for driver</span><strong>${money(loadDriverGross(load))}</strong></div><div><span>Cut (${esc(loadCutPercent(load))}%)</span><strong>${money(loadCutAmount(load))}</strong></div><div><span>Net profit</span><strong>${money(loadNetProfit(load))}</strong></div></div>` : ''}</div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">RTS Financial MC Check</h3><p class="card-subtitle">MC: ${esc(load.brokerMc || '-')}<br>Status: ${esc(load.rtsStatus || 'Not checked')}<br>${esc(load.rtsMessage || '')}</p>${canManageOperations() ? `<button class="btn btn-soft" data-action="check-rts-mc" data-load="${esc(load.id)}">Check RTS</button>` : ''}</div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Status</h3><span class="status-pill ${statusClass(load.status)}">${esc(load.status)}</span><br><br><span class="status-pill ${statusClass(load.docs)}">Docs: ${esc(load.docs || 'Missing')}</span></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">GPS</h3><p class="card-subtitle">${gpsUrlForLoad(load) ? 'Live GPS link available' : 'No GPS link saved'}</p>${gpsUrlForLoad(load) ? `<button class="btn btn-soft" data-action="navigate" data-load="${esc(load.id)}">Open GPS</button>` : ''}</div>
    </div>
    <div class="grid grid-2" style="margin-top:16px">
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Notes</h3><p class="card-subtitle">${esc(load.notes || 'No general notes saved.')}</p>${canManageOperations() ? `<hr><strong>Internal notes</strong><p class="card-subtitle">${esc(load.internalNotes || 'No internal notes.')}</p>` : ''}<hr><strong>Broker-visible notes</strong><p class="card-subtitle">${esc(load.brokerNotes || 'No broker-visible notes.')}</p></div>
      <div class="card card-pad" style="box-shadow:none"><h3 class="card-title">Documents</h3><div class="activity-list">${relatedDocs.length ? relatedDocs.map(doc => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(doc.type)}</strong><span>${esc(doc.status)} · ${doc.fileUrl ? `<a href="${esc(doc.fileUrl)}" target="_blank" rel="noreferrer">Open file</a>` : esc(doc.filename || '')}${doc.rejectionReason ? ` · ${esc(doc.rejectionReason)}` : ''}</span></div></div>`).join('') : '<p class="muted">No documents linked to this load yet.</p>'}</div></div>
    </div>
    <div class="card card-pad" style="box-shadow:none;margin-top:16px"><h3 class="card-title">Activity timeline</h3><div class="activity-list" style="margin-top:14px">${arr('activities').filter(item => String(item.loadId || item.load) === String(load.id)).slice(0, 12).map(item => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(item.title || item.action)}</strong><span>${esc(item.text || '')} · ${esc(item.actor || item.createdBy || '')} · ${esc(formatDate(item.createdAt))}</span></div></div>`).join('') || '<p class="muted">No timeline events yet.</p>'}</div></div>
  `, 'Close');
}

function openAssignModal(loadId = '') {
  openModal('Quick assign driver', 'Assign driver and truck. The assigned driver receives one account-specific notification.', `
    <div class="form-grid">
      ${selectField('Load', 'loadId', loadId || arr('loads')[0]?.id || '', arr('loads').map(l => l.id))}
      ${selectField('Driver', 'driver', '', driverAssignmentNames())}
      ${selectField('Truck', 'truck', '', arr('fleet').map(f => f.unit))}
    </div>
  `, 'Assign', async () => {
    const data = getFormData(qs('#modalRoot'));
    if (!data.loadId) throw new Error('Add a load first.');
    await api(`/api/loads/${encodeURIComponent(data.loadId)}`, { method: 'PATCH', body: JSON.stringify({ driver: data.driver, truck: data.truck, status: 'Dispatched' }) });
    await refresh();
  });
}


const fuelBrandChoices = [
  ['any', 'Any fuel station'],
  ['loves', "Love's Travel Stops"],
  ['pilot', 'Pilot / Flying J'],
  ['ta', 'TA / Petro'],
  ['speedway', 'Speedway'],
  ['shell', 'Shell'],
  ['bp', 'BP'],
  ['exxon', 'Exxon / Mobil'],
  ['circlek', 'Circle K']
];

function browserLocation(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are not supported on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, error => {
      const messages = {
        1: 'Location permission is blocked. Enable location access for this site and try again.',
        2: 'Your current location could not be determined.',
        3: 'Location request timed out. Try again in an open area.'
      };
      reject(new Error(messages[error.code] || 'Current location is unavailable.'));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000, ...options });
  });
}

function fuelHelpBrandOptions(selected = 'any') {
  return fuelBrandChoices.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function hasFuelLocation() {
  return typeof state.fuelHelp.lat === 'number' && typeof state.fuelHelp.lng === 'number' && Number.isFinite(state.fuelHelp.lat) && Number.isFinite(state.fuelHelp.lng);
}

function fuelStationCard(station = {}) {
  const badges = [
    station.distanceMiles !== undefined ? `${station.distanceMiles} mi` : '',
    station.diesel ? 'Diesel' : '',
    station.truckFriendly ? 'Truck friendly' : '',
    station.openingHours || ''
  ].filter(Boolean);
  return `<article class="fuel-station-card">
    <div class="fuel-station-top"><div class="fuel-station-icon">⛽</div><div><strong>${esc(station.name || 'Fuel station')}</strong><span>${esc(station.brand || 'Independent')}</span></div><b>${esc(station.distanceMiles ?? '-')} mi</b></div>
    <p>${esc(station.address || 'Address not listed')}</p>
    <div class="fuel-station-tags">${badges.map(item => `<span>${esc(item)}</span>`).join('')}</div>
    <div class="fuel-station-actions"><a class="btn btn-primary" href="${esc(station.navigationUrl || station.mapUrl || '#')}" target="_blank" rel="noopener noreferrer">Navigate</a><a class="btn btn-soft" href="${esc(station.mapUrl || station.navigationUrl || '#')}" target="_blank" rel="noopener noreferrer">View map</a></div>
  </article>`;
}

function renderFuelHelpContent() {
  const root = qs('#fuelHelpContent');
  if (!root) return;
  const fuel = state.fuelHelp;
  const locationText = hasFuelLocation()
    ? `Location ready · accuracy ${Math.round(Number(fuel.accuracy || 0)) || '-'} m`
    : 'Location has not been shared yet.';
  root.innerHTML = `
    <div class="fuel-help-hero"><div><span class="fuel-help-kicker">Driver location assistance</span><h3>Find fuel close to your truck</h3><p>Use live location, choose a preferred chain, and open turn-by-turn navigation.</p></div><div class="fuel-help-pump">⛽</div></div>
    <div class="fuel-help-controls">
      <label><span>Preferred station</span><select id="fuelHelpBrand">${fuelHelpBrandOptions(fuel.brand)}</select></label>
      <label><span>Search radius</span><select id="fuelHelpRadius"><option value="25" ${Number(fuel.radiusKm) === 25 ? 'selected' : ''}>25 km / 16 mi</option><option value="50" ${Number(fuel.radiusKm) === 50 ? 'selected' : ''}>50 km / 31 mi</option><option value="80" ${Number(fuel.radiusKm) === 80 ? 'selected' : ''}>80 km / 50 mi</option><option value="100" ${Number(fuel.radiusKm) === 100 ? 'selected' : ''}>100 km / 62 mi</option></select></label>
      <button class="btn btn-primary fuel-locate-btn" type="button" data-action="fuel-help-locate">◎ Use my location</button>
      <button class="btn btn-soft" type="button" data-action="fuel-help-search" ${hasFuelLocation() ? '' : 'disabled'}>Search again</button>
    </div>
    <div class="fuel-location-status ${fuel.error ? 'error' : ''}"><span>${fuel.loading ? 'Searching nearby fuel stations…' : esc(fuel.error || locationText)}</span>${hasFuelLocation() ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${fuel.lat},${fuel.lng}`)}" target="_blank" rel="noopener noreferrer">Current position</a>` : ''}</div>
    <div class="fuel-example-strip"><strong>Example preferred chains:</strong><span>Love's</span><span>Pilot / Flying J</span><span>TA / Petro</span><span>Speedway</span></div>
    <div class="fuel-results-head"><div><strong>${fuel.stations.length ? `${fuel.stations.length} nearest stations` : 'Nearby stations'}</strong><span>${fuel.stations.length ? 'Sorted by straight-line distance from the current location.' : 'Share the current location to load real nearby results.'}</span></div></div>
    <div class="fuel-results">${fuel.loading ? '<div class="fuel-loading"><span></span><p>Finding the best nearby options…</p></div>' : fuel.stations.length ? fuel.stations.map(fuelStationCard).join('') : `<div class="fuel-empty"><div>⛽</div><strong>No stations loaded</strong><p>${esc(fuel.error || 'Tap “Use my location” to search nearby.')}</p></div>`}</div>
    <p class="fuel-source-note">Fuel locations are sourced from OpenStreetMap. Confirm access, diesel availability, pricing and truck clearance before arrival.</p>`;
  root.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
  const brand = qs('#fuelHelpBrand');
  if (brand) brand.onchange = () => { state.fuelHelp.brand = brand.value; if (hasFuelLocation()) searchNearbyFuelStations(); };
  const radius = qs('#fuelHelpRadius');
  if (radius) radius.onchange = () => { state.fuelHelp.radiusKm = Number(radius.value || 50); if (hasFuelLocation()) searchNearbyFuelStations(); };
}

function openFuelHelpModal() {
  activeModalSave = null;
  state.fuelHelp.error = '';
  const modal = qs('#modalRoot');
  modal.classList.add('active');
  modal.innerHTML = `<div class="modal-backdrop" data-close-modal></div><div class="modal-card fuel-help-modal" role="dialog" aria-modal="true" aria-label="Fuel Help"><div class="modal-head"><div><h3>Fuel Help</h3><p>Location-based fuel station finder for drivers.</p></div><button class="icon-btn" data-close-modal aria-label="Close">×</button></div><div class="modal-body"><div id="fuelHelpContent"></div></div></div>`;
  qsa('[data-close-modal]').forEach(item => item.addEventListener('click', closeModal));
  renderFuelHelpContent();
  setTimeout(() => locateAndSearchFuelStations(), 120);
}

async function locateAndSearchFuelStations() {
  state.fuelHelp.loading = true;
  state.fuelHelp.error = '';
  renderFuelHelpContent();
  try {
    const position = await browserLocation();
    state.fuelHelp.lat = position.coords.latitude;
    state.fuelHelp.lng = position.coords.longitude;
    state.fuelHelp.accuracy = position.coords.accuracy;
    await searchNearbyFuelStations({ preserveLoading: true });
  } catch (error) {
    state.fuelHelp.loading = false;
    state.fuelHelp.error = error.message;
    state.fuelHelp.stations = [];
    renderFuelHelpContent();
  }
}

async function searchNearbyFuelStations(options = {}) {
  if (!hasFuelLocation()) {
    await locateAndSearchFuelStations();
    return;
  }
  const brand = qs('#fuelHelpBrand')?.value || state.fuelHelp.brand || 'any';
  const radiusKm = Number(qs('#fuelHelpRadius')?.value || state.fuelHelp.radiusKm || 50);
  state.fuelHelp.brand = brand;
  state.fuelHelp.radiusKm = radiusKm;
  state.fuelHelp.loading = true;
  state.fuelHelp.error = '';
  if (!options.preserveLoading) renderFuelHelpContent();
  try {
    const params = new URLSearchParams({ lat: String(state.fuelHelp.lat), lng: String(state.fuelHelp.lng), radiusKm: String(radiusKm), brand });
    const payload = await api(`/api/fuel/nearby?${params.toString()}`);
    state.fuelHelp.stations = Array.isArray(payload.stations) ? payload.stations : [];
    state.fuelHelp.error = state.fuelHelp.stations.length ? '' : 'No matching stations were found in this radius. Try “Any fuel station” or a larger radius.';
  } catch (error) {
    state.fuelHelp.stations = [];
    state.fuelHelp.error = error.message;
  } finally {
    state.fuelHelp.loading = false;
    renderFuelHelpContent();
  }
}

function openFuelModal() {
  openModal('Fuel entry', 'Driver-friendly fuel record with receipt upload.', `<form id="modalUploadForm" class="form-grid">${field('Gallons', 'gallons', '', 'number')}${field('Amount', 'amount', '', 'number')}${field('Location', 'location', '')}<label class="field">Receipt<input name="file" type="file" accept="image/*,.pdf"></label><input name="type" value="Fuel receipt" hidden></form>`, 'Save fuel', async () => {
    const file = qs('#modalUploadForm input[type="file"]');
    if (file?.files?.[0]) await api('/api/upload', { method: 'POST', body: new FormData(qs('#modalUploadForm')) });
    toast('Fuel entry saved');
  });
}

function openIssueModal() {
  openModal('Report issue', 'Create a structured issue report for dispatch follow-up.', `<div class="form-grid">${selectField('Issue type', 'type', 'Delay', ['Delay', 'Damage', 'Mechanical', 'Document issue'])}${selectField('Urgency', 'urgency', 'Normal', ['Normal', 'High', 'Critical'])}${textArea('Details', 'details', '')}</div>`, 'Submit issue', async () => {
    const data = getFormData(qs('#modalRoot'));
    await api('/api/notifications', { method: 'POST', body: JSON.stringify({ title: `${data.urgency} ${data.type}`, type: 'Driver issue', text: data.details, role: 'dispatcher', relatedPage: 'notifications', time: 'Now' }) });
    await refresh();
  });
}


function openForcePasswordModal() {
  activeModalSave = async () => {
    const data = getFormData(qs('#modalRoot'));
    if (!data.currentPassword || !data.newPassword) throw new Error('Current and new password are required.');
    if (data.newPassword !== data.confirmPassword) throw new Error('New passwords do not match.');
    const payload = await api('/api/change-password', { method: 'POST', body: JSON.stringify(data) });
    state.currentUser = payload.user;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(payload.user));
    toast('Password changed. Access unlocked.');
  };
  const modal = qs('#modalRoot');
  modal.classList.add('active');
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="Password change required">
      <div class="modal-head"><div><h3>Password change required</h3><p>For production security, temporary passwords must be changed before continuing.</p></div></div>
      <div class="modal-body"><div class="form-grid">
        ${field('Current password', 'currentPassword', '', 'password', 'autocomplete="current-password"')}
        ${field('New password', 'newPassword', '', 'password', 'autocomplete="new-password" minlength="8"')}
        ${field('Confirm new password', 'confirmPassword', '', 'password', 'autocomplete="new-password" minlength="8"')}
      </div></div>
      <div class="modal-actions"><button class="btn btn-primary" data-save-modal>Change password</button></div>
    </div>
  `;
  modal.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
  qs('[data-save-modal]').addEventListener('click', async () => {
    try {
      if (activeModalSave) await activeModalSave();
      closeModal();
      await refresh();
    } catch (error) { toast(error.message); }
  });
}

function openModal(title, subtitle, body, primaryText = 'Save', onSave = null) {
  activeModalSave = onSave;
  const modal = qs('#modalRoot');
  modal.classList.add('active');
  modal.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><div><h3>${esc(title)}</h3><p>${esc(subtitle)}</p></div><button class="icon-btn" data-close-modal aria-label="Close">×</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions"><button class="btn btn-soft" data-close-modal>Cancel</button><button class="btn btn-primary" data-save-modal>${esc(primaryText)}</button></div>
    </div>
  `;
  qsa('[data-close-modal]').forEach(x => x.addEventListener('click', closeModal));
  modal.querySelectorAll('[data-action]').forEach(btn => { btn.onclick = () => handleAction(btn.dataset.action, btn); });
  qs('[data-save-modal]').addEventListener('click', async () => {
    try {
      if (activeModalSave) await activeModalSave();
      closeModal();
      toast(`${primaryText} completed`);
    } catch (error) {
      toast(error.message);
    }
  });
}

function closeModal() {
  const modal = qs('#modalRoot');
  modal.classList.remove('active');
  modal.innerHTML = '';
  activeModalSave = null;
}

function toast(message) {
  const root = qs('#toastRoot');
  const item = document.createElement('div');
  item.className = 'toast';
  item.textContent = message;
  root.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}

async function login(email, password) {
  const payload = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await startSession(payload);
  toast(`Signed in as ${state.role}`);
}

async function init() {
  state.pendingDeepLink = readDeepLink();
  await registerPwaServiceWorker();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'NOTIFICATION_NAVIGATE' && event.data.url) {
        const link = readDeepLink(event.data.url);
        if (link) applyDeepLink(link).catch(error => toast(error.message));
        return;
      }
      if (event.data?.type === 'PUSH_RECEIVED') {
        const payload = event.data.payload || {};
        const isChatPush = payload.page === 'chat' || payload.chatContact || /chat|message/i.test(`${payload.type || ''} ${payload.title || ''}`);
        if (payload.title) toast(`${payload.title}${payload.body ? ` · ${payload.body}` : ''}`);
        if (isChatPush && !document.hidden) playChatNotificationTone();
        window.setTimeout(() => syncLiveData({ force: true, forceRender: state.page === 'driver-mobile' }), 250);
        window.setTimeout(() => syncLiveData({ force: true, forceRender: state.page === 'driver-mobile' }), 1400);
      }
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.currentUser) syncLiveData({ force: true, forceRender: state.page === 'driver-mobile' });
  });
  window.addEventListener('focus', () => {
    if (state.currentUser) syncLiveData({ force: true, forceRender: state.page === 'driver-mobile' });
  });
  // beforeinstallprompt/appinstalled listeners are registered at the very top of this file (synchronously,
  // before this async init() runs) so the event can never be missed due to timing. See note near `state`.
  const status = await api('/api/bootstrap');
  state.bootstrap = status || state.bootstrap;
  const hasUsers = Boolean(status.hasUsers);
  showLogin(hasUsers);
  renderMobilePrompt();

  qs('#setupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      const payload = await api('/api/setup', { method: 'POST', body: JSON.stringify(Object.fromEntries(form.entries())) });
      await startSession(payload);
      toast('Admin account created');
    } catch (error) { toast(error.message); }
  });

  qs('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try { await login(form.get('email'), form.get('password')); } catch (error) { toast(error.message); }
  });

  if (hasUsers) await restoreSession();

  // Single dropdown menu trigger — same button/behavior on desktop and mobile now that the
  // persistent side sidebar has been replaced by a top dropdown menu.
  qs('#mobileMenuBtn').addEventListener('click', () => {
    toggleNavDropdown();
  });

  qs('#mobileScrim').addEventListener('click', () => {
    closeNavDropdown();
  });

  qs('#floatingBackBtn')?.addEventListener('click', goBack);

  qs('#logoutBtn').addEventListener('click', async () => {
    if (voiceCallIsActive()) { try { await endVoiceCall(); } catch (error) {} }
    try { await api('/api/logout', { method: 'POST', body: JSON.stringify({}) }); } catch (error) {}
    clearSession();
    showLogin(true);
  });

  window.addEventListener('beforeunload', () => {
    if (!voiceCallIsActive() || !voiceSession.call?.id || !storedToken()) return;
    fetch(`/api/calls/${encodeURIComponent(voiceSession.call.id)}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${storedToken()}` },
      body: '{}',
      keepalive: true
    }).catch(() => {});
  });

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openSearchModal();
    }
    if (e.key === 'Escape') closeModal();
  });

  renderNav();
}

init().catch(error => toast(error.message));
