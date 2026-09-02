const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

let webPush = null;
try {
  webPush = require('web-push');
} catch (primaryError) {
  try {
    webPush = require(path.join(__dirname, 'vendor', 'node_modules', 'web-push'));
  } catch (vendorError) {
    webPush = null;
  }
}

const PORT = process.env.PORT || 4000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT_DIR, 'uploads');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'db.json');
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 12);
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 5 * 1024 * 1024);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 50 * 1024 * 1024);
const MAX_INTAKE_FILE_BYTES = Number(process.env.MAX_INTAKE_FILE_BYTES || 40 * 1024 * 1024);
const OCR_MAX_FILE_BYTES = Number(process.env.OCR_MAX_FILE_BYTES || 12 * 1024 * 1024);
const MAX_CHAT_UPLOAD_BYTES = Number(process.env.MAX_CHAT_UPLOAD_BYTES || 15 * 1024 * 1024);
const MAX_CHAT_UPLOAD_FILES = Number(process.env.MAX_CHAT_UPLOAD_FILES || 10);
function resolveVapidKeys() {
  const environmentPublicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
  const environmentPrivateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
  if (environmentPublicKey && environmentPrivateKey) {
    return { publicKey: environmentPublicKey, privateKey: environmentPrivateKey, source: 'environment' };
  }
  if (!webPush?.generateVAPIDKeys) return { publicKey: '', privateKey: '', source: 'unavailable' };
  const keyFile = path.join(DATA_DIR, 'vapid-keys.json');
  try {
    const stored = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    if (stored.publicKey && stored.privateKey) return { publicKey: stored.publicKey, privateKey: stored.privateKey, source: 'persistent-data' };
  } catch (error) {}
  try {
    const generated = webPush.generateVAPIDKeys();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(keyFile, JSON.stringify({ ...generated, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    return { ...generated, source: 'generated-persistent-data' };
  } catch (error) {
    return { publicKey: '', privateKey: '', source: 'generation-failed' };
  }
}
const VAPID_KEYS = resolveVapidKeys();
const VAPID_PUBLIC_KEY = VAPID_KEYS.publicKey;
const VAPID_PRIVATE_KEY = VAPID_KEYS.privateKey;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || process.env.MAIL_FROM || 'mailto:dispatch@jtslogistics.com';
const RTS_USERNAME = process.env.RTS_USERNAME || process.env.RTS_FINANCIAL_USERNAME || '';
const RTS_PASSWORD = process.env.RTS_PASSWORD || process.env.RTS_FINANCIAL_PASSWORD || '';
const RTS_API_URL = process.env.RTS_API_URL || process.env.RTS_FINANCIAL_API_URL || '';
const RTS_API_KEY = process.env.RTS_API_KEY || process.env.RTS_FINANCIAL_API_KEY || '';
const RTS_LOGIN_URL = process.env.RTS_LOGIN_URL || 'https://beta.rtspro.com/';
const RTS_VERIFY_URL = process.env.RTS_VERIFY_URL || 'https://verify.rtspro.com/';
const PUSH_ENABLED = Boolean(webPush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
const CALL_RING_TIMEOUT_MS = Math.max(15000, Number(process.env.CALL_RING_TIMEOUT_MS || 60000));
const CALL_MAX_DURATION_MS = Math.max(60000, Number(process.env.CALL_MAX_DURATION_MS || 1000 * 60 * 60 * 8));
const RTC_STUN_URLS = String(process.env.RTC_STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302').split(',').map(value => value.trim()).filter(Boolean);
const RTC_TURN_URL = sanitizeText(process.env.RTC_TURN_URL || '');
const RTC_TURN_USERNAME = sanitizeText(process.env.RTC_TURN_USERNAME || '');
const RTC_TURN_CREDENTIAL = sanitizeText(process.env.RTC_TURN_CREDENTIAL || '');
if (PUSH_ENABLED) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.rtf': 'application/rtf',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  // CRITICAL for PWA installability: Chrome/Android silently refuses to treat manifest.webmanifest as a
  // valid Web App Manifest when it is served with the wrong Content-Type (it previously fell back to
  // application/octet-stream because .webmanifest was missing from this map). Without a correctly typed
  // manifest, "beforeinstallprompt" NEVER fires, so the Install Now button can never do anything on
  // Samsung/Chrome devices such as the Galaxy S23 Ultra, no matter what the client-side code does.
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

const allowedCollections = new Set(['loads', 'drivers', 'fleet', 'brokers', 'docs', 'notifications', 'activities', 'locations', 'hosLogs', 'intake', 'auditLog', 'reminders', 'docFolders', 'driverPayAdjustments']);
const PERSONAL_DOC_TYPES = ['CDL', 'Medical', 'Drug Test', 'Insurance', 'IFTA', 'CAB Card', 'Trailer Registration', 'TITLE', 'Other'];
const OPERATIONAL_DOC_TYPES = ['Truck', 'Trailer', 'Plates', 'Truck with JTS', 'VIN', 'Other'];
const REMINDER_CATEGORIES = ['Truck inspection', 'Trailer inspection', 'Medical', 'Scheduled drug test'];
const REMINDER_LEAD_DAYS = 30;
const allowedRoles = new Set(['admin', 'dispatcher', 'driver', 'broker']);
const publicApiRoutes = new Set(['/api/bootstrap', '/api/setup', '/api/login']);
const allowedChatUploadExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.rtf']);
const allowedChatUploadMimeTypes = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'application/rtf', 'text/rtf', 'application/octet-stream'
]);

const emptyDb = () => ({
  company: {
    name: 'JTS Logistics Inc',
    description: 'JTS Logistics Inc is the leading and fast growing logistics company in the Midwest. JTS Logistics operates as a 100% Owner Operator company, meaning it does not own any trucks, but rather possesses equipment such as Dry Vans, Flat Beds, and reefers. We are a trucking company dedicated to professionalism, dependable service, customized solutions, cutting-edge tracking technology, and the highest quality service for clients.',
    address: '2138 W 47th Avenue Gary IN 46408',
    mcNumber: 'MC-1574089',
    dotNumber: 'DOT-4117506',
    supportEmail: 'peak@dispatch.com',
    phone: '',
    timezone: 'America/Chicago',
    primaryColor: '#0aa9a5',
    secondaryColor: '#5f6267',
    loadPrefix: 'JTS',
    gpsProvider: 'Live GPS iframe',
    gpsIframeUrl: '',
    gpsOpenUrl: '',
    gpsIframeHtml: '',
    gpsLastUpdated: '',
    gpsRefreshSeconds: 60,
    gpsMode: 'browser-gps',
    eldProvider: 'manual',
    defaultAverageMph: 55,
    rtsProvider: 'RTS Financial',
    rtsLoginUrl: 'https://beta.rtspro.com/',
    defaultCutPercent: 10
  },
  users: [],
  loads: [],
  drivers: [],
  fleet: [],
  brokers: [],
  docs: [],
  chats: {},
  calls: [],
  notifications: [],
  activities: [],
  locations: [],
  hosLogs: [],
  intake: [],
  auditLog: [],
  pushSubscriptions: [],
  reminders: [],
  docFolders: [],
  // Driver Pay adjustments (Deductions / Reimbursements / Additional Pay) from the "Edit Driver Pay"
  // modal opened via the small icon before the driver's name in the Load Workspace. These roll up
  // into the Weekly Payroll report on the Drivers page, in addition to each load's Driver Rate.
  driverPayAdjustments: []
});

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...extra
  };
}

function ensureStorage() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) writeDb(emptyDb());
}

function normalizeDb(db = {}) {
  const base = emptyDb();
  const out = { ...base, ...db };
  out.company = { ...base.company, ...(db.company || {}) };
  Object.keys(base).forEach(key => {
    if (Array.isArray(base[key]) && !Array.isArray(out[key])) out[key] = [];
  });
  if (!out.chats || typeof out.chats !== 'object' || Array.isArray(out.chats)) out.chats = {};
  out.users = out.users.map(user => ({
    ...user,
    email: sanitizeText(user.email).toLowerCase(),
    role: allowedRoles.has(user.role) ? user.role : 'dispatcher',
    status: normalizeStatus(user.status),
    dispatcherId: sanitizeText(user.dispatcherId || ''),
    dispatcherEmail: sanitizeText(user.dispatcherEmail || '').toLowerCase(),
    requiresPasswordChange: user.requiresPasswordChange === true || (!user.passwordChangedAt && user.forcePasswordChange !== false),
    passwordChangedAt: sanitizeText(user.passwordChangedAt || '')
  })).filter(user => user.email && user.passwordHash);

  out.notifications = out.notifications.map(item => ({
    ...item,
    id: sanitizeText(item.id, makeId('notif')),
    title: sanitizeText(item.title || item.type, 'Notification'),
    text: sanitizeText(item.text || item.message || ''),
    message: sanitizeText(item.message || item.text || ''),
    type: sanitizeText(item.type, item.title || 'Operational alert'),
    role: sanitizeText(item.role || item.targetRole || ''),
    target: sanitizeText(item.target || item.targetEmail || item.targetUserId || ''),
    targetName: sanitizeText(item.targetName || ''),
    relatedLoadId: sanitizeText(item.relatedLoadId || item.loadId || ''),
    relatedDocId: sanitizeText(item.relatedDocId || item.documentId || ''),
    relatedChatContact: sanitizeText(item.relatedChatContact || item.chatContact || ''),
    callId: sanitizeText(item.callId || ''),
    callStatus: sanitizeText(item.callStatus || ''),
    relatedPage: sanitizeText(item.relatedPage || item.page || ''),
    action: sanitizeText(item.action || ''),
    excludedUsers: Array.isArray(item.excludedUsers) ? [...new Set(item.excludedUsers.map(v => sanitizeText(v).toLowerCase()).filter(Boolean))] : [],
    dedupeKey: sanitizeText(item.dedupeKey || ''),
    readBy: Array.isArray(item.readBy) ? [...new Set(item.readBy.map(v => sanitizeText(v).toLowerCase()).filter(Boolean))] : [],
    createdAt: item.createdAt || new Date().toISOString()
  })).slice(0, 1000);
  out.calls = (Array.isArray(out.calls) ? out.calls : []).map(call => ({
    ...call,
    id: sanitizeText(call.id, makeId('call')),
    threadKey: sanitizeText(call.threadKey || call.contact || ''),
    status: ['ringing', 'answered', 'ended', 'declined', 'missed', 'cancelled', 'failed'].includes(call.status) ? call.status : 'ended',
    callerId: sanitizeText(call.callerId || ''),
    callerEmail: sanitizeText(call.callerEmail || '').toLowerCase(),
    callerName: sanitizeText(call.callerName || 'Caller'),
    callerRole: sanitizeText(call.callerRole || ''),
    calleeId: sanitizeText(call.calleeId || ''),
    calleeEmail: sanitizeText(call.calleeEmail || '').toLowerCase(),
    calleeName: sanitizeText(call.calleeName || 'Recipient'),
    calleeRole: sanitizeText(call.calleeRole || ''),
    offer: normalizeSessionDescription(call.offer, 'offer'),
    answer: normalizeSessionDescription(call.answer, 'answer'),
    iceCandidates: (Array.isArray(call.iceCandidates) ? call.iceCandidates : []).map(normalizeStoredIceCandidate).filter(Boolean).slice(-160),
    createdAt: call.createdAt || new Date().toISOString(),
    updatedAt: call.updatedAt || call.createdAt || new Date().toISOString(),
    answeredAt: sanitizeText(call.answeredAt || ''),
    endedAt: sanitizeText(call.endedAt || ''),
    endedBy: sanitizeText(call.endedBy || ''),
    durationSeconds: Math.max(0, Number(call.durationSeconds || 0)),
    notificationId: sanitizeText(call.notificationId || '')
  })).slice(-500);

  const normalizedPushSubscriptions = (Array.isArray(out.pushSubscriptions) ? out.pushSubscriptions : []).map(item => ({
    id: sanitizeText(item.id, makeId('push')),
    userId: sanitizeText(item.userId || ''),
    userEmail: sanitizeText(item.userEmail || '').toLowerCase(),
    userRole: sanitizeText(item.userRole || ''),
    endpoint: sanitizeText(item.endpoint || item.subscription?.endpoint || ''),
    subscription: item.subscription && typeof item.subscription === 'object' ? item.subscription : null,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
    lastSuccessAt: sanitizeText(item.lastSuccessAt || ''),
    lastErrorAt: sanitizeText(item.lastErrorAt || ''),
    lastError: sanitizeText(item.lastError || '')
  })).filter(item => item.endpoint && item.subscription);
  const pushByEndpoint = new Map();
  normalizedPushSubscriptions.forEach(item => {
    const current = pushByEndpoint.get(item.endpoint);
    const currentTime = new Date(current?.updatedAt || current?.createdAt || 0).getTime();
    const itemTime = new Date(item.updatedAt || item.createdAt || 0).getTime();
    if (!current || itemTime >= currentTime) pushByEndpoint.set(item.endpoint, item);
  });
  out.pushSubscriptions = [...pushByEndpoint.values()].slice(-1000);

  Object.keys(out.chats || {}).forEach(contact => {
    out.chats[contact] = (Array.isArray(out.chats[contact]) ? out.chats[contact] : []).map(message => {
      const legacyAttachment = message.attachmentUrl ? normalizeChatAttachment({
        url: message.attachmentUrl,
        name: message.attachmentName,
        contentType: message.attachmentContentType || message.contentType,
        sizeBytes: message.attachmentSizeBytes || message.sizeBytes,
        kind: message.attachmentKind
      }) : null;
      const attachments = (Array.isArray(message.attachments) ? message.attachments : [])
        .map(normalizeChatAttachment)
        .filter(Boolean);
      if (!attachments.length && legacyAttachment) attachments.push(legacyAttachment);
      return {
        ...message,
        id: sanitizeText(message.id, makeId('msg')),
        text: sanitizeText(message.text || ''),
        attachments,
        attachmentUrl: attachments[0]?.url || '',
        attachmentName: attachments[0]?.name || '',
        attachmentContentType: attachments[0]?.contentType || '',
        attachmentSizeBytes: attachments[0]?.sizeBytes || 0,
        attachmentKind: attachments[0]?.kind || '',
        readBy: Array.isArray(message.readBy) ? [...new Set(message.readBy.map(v => sanitizeText(v).toLowerCase()).filter(Boolean))] : [],
        createdAt: message.createdAt || new Date().toISOString()
      };
    });
  });
  const migratedChats = {};
  Object.entries(out.chats || {}).forEach(([legacyContact, messages]) => {
    const cleanContact = sanitizeText(legacyContact).toLowerCase();
    let targetKey = legacyContact;
    if (!/^driver:|^broker:|^staff:|^legacy:/i.test(legacyContact)) {
      let account = out.users.find(user => user.role === 'driver' && userReadKeys(user).includes(cleanContact));
      if (!account) account = out.users.find(user => user.role === 'driver' && (messages || []).some(message => userReadKeys(user).includes(sanitizeText(message.userEmail || message.to).toLowerCase())));
      if (account) targetKey = driverChatThreadKey(account);
      else {
        account = out.users.find(user => user.role === 'broker' && userReadKeys(user).includes(cleanContact));
        if (!account) account = out.users.find(user => user.role === 'broker' && (messages || []).some(message => userReadKeys(user).includes(sanitizeText(message.userEmail || message.to).toLowerCase())));
        if (account) targetKey = brokerChatThreadKey(account);
        else targetKey = `legacy:${sanitizeText(legacyContact, 'chat')}`;
      }
    }
    if (!Array.isArray(migratedChats[targetKey])) migratedChats[targetKey] = [];
    migratedChats[targetKey].push(...(Array.isArray(messages) ? messages : []));
    migratedChats[targetKey] = migratedChats[targetKey].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).slice(-300);
  });
  out.chats = migratedChats;
  out.locations = out.locations.map(item => ({ ...item, id: sanitizeText(item.id, makeId('loc')), createdAt: item.createdAt || item.timestamp || new Date().toISOString(), timestamp: item.timestamp || item.createdAt || new Date().toISOString() })).slice(0, 2000);
  out.hosLogs = (Array.isArray(out.hosLogs) ? out.hosLogs : []).map(item => ({ ...item, id: sanitizeText(item.id, makeId('hos')), createdAt: item.createdAt || new Date().toISOString() })).slice(0, 2000);
  return out;
}

function readDb() {
  ensureStorage();
  try {
    return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
  } catch (error) {
    const db = emptyDb();
    writeDb(db);
    return db;
  }
}

function writeDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmpFile = `${DB_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(normalizeDb(db), null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

function sendJson(res, status, payload) {
  res.writeHead(status, securityHeaders({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }));
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, securityHeaders({ 'Content-Type': contentType, 'Cache-Control': 'no-store' }));
  res.end(text);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 404, 'Not found');
      return;
    }
    const cacheControl = filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=86400' : 'no-store';
    res.writeHead(200, securityHeaders({ 'Content-Type': contentType, 'Cache-Control': cacheControl }));
    res.end(content);
  });
}

function sendDownload(res, filePath, downloadName = '') {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const safeName = sanitizeFilename(downloadName || path.basename(filePath));
  const asciiName = safeName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encodedName = encodeURIComponent(safeName).replace(/['()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 404, 'Document file not found.');
      return;
    }
    res.writeHead(200, securityHeaders({
      'Content-Type': contentType,
      'Content-Length': String(content.length),
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    }));
    res.end(content);
  });
}

function safeJoin(base, requestedPath) {
  let safePath = '/';
  try {
    safePath = decodeURIComponent(String(requestedPath || '/').split('?')[0]).replace(/\\/g, '/');
  } catch (error) {
    safePath = '/';
  }
  safePath = safePath.replace(/^\/+/, '');
  const root = path.resolve(base);
  const fullPath = path.resolve(root, safePath || 'index.html');
  return fullPath === root || fullPath.startsWith(root + path.sep) ? fullPath : path.join(root, 'index.html');
}

function readRequestBody(req, maxBytes = MAX_UPLOAD_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const body = await readRequestBody(req, MAX_JSON_BYTES);
  if (!body.length) return {};
  return JSON.parse(body.toString('utf8'));
}

function sanitizeText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function normalizeStatus(status) {
  const clean = sanitizeText(status, 'Active').toLowerCase();
  if (clean === 'disabled' || clean === 'inactive') return 'Disabled';
  return 'Active';
}

function normalizeMcNumber(value = '') {
  const clean = sanitizeText(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = clean.match(/(?:MC)?(\d{4,10})/);
  return match ? `MC-${match[1]}` : clean;
}

function rtsStatusClass(value = '') {
  const clean = sanitizeText(value).toLowerCase();
  if (!clean) return 'Not checked';
  if (clean.includes('approved') || clean.includes('good') || clean.includes('current') || clean.includes('active')) return 'Approved';
  if (clean.includes('warning') || clean.includes('review') || clean.includes('manual') || clean.includes('pending')) return 'Review';
  if (clean.includes('hold') || clean.includes('blocked') || clean.includes('bad') || clean.includes('denied') || clean.includes('not')) return 'Blocked';
  return value;
}

async function checkRtsFinancialStatus({ mcNumber, broker = '', loadId = '', orderNumber = '' } = {}) {
  const mc = normalizeMcNumber(mcNumber);
  const checkedAt = new Date().toISOString();
  if (!mc) {
    return { ok: false, source: 'RTS Financial', status: 'Missing MC', statusClass: 'Review', mcNumber: '', checkedAt, message: 'Enter broker/customer MC number before checking RTS Financial.' };
  }

  if (RTS_API_URL) {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (RTS_API_KEY) headers.Authorization = `Bearer ${RTS_API_KEY}`;
    else if (RTS_USERNAME && RTS_PASSWORD) headers.Authorization = `Basic ${Buffer.from(`${RTS_USERNAME}:${RTS_PASSWORD}`).toString('base64')}`;
    try {
      const response = await fetch(RTS_API_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mcNumber: mc, broker, loadId, orderNumber })
      });
      const contentType = response.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await response.json() : { raw: await response.text() };
      if (!response.ok) throw new Error(payload.error || payload.message || `RTS API returned ${response.status}`);
      const status = sanitizeText(payload.status || payload.creditStatus || payload.rtsStatus || payload.result || 'Checked');
      return {
        ok: true,
        source: payload.source || 'RTS Financial API',
        status,
        statusClass: rtsStatusClass(status),
        mcNumber: mc,
        broker: sanitizeText(payload.broker || payload.company || broker),
        checkedAt,
        message: sanitizeText(payload.message || payload.notes || 'RTS Financial check completed.'),
        raw: payload
      };
    } catch (error) {
      return { ok: false, source: 'RTS Financial API', status: 'RTS check failed', statusClass: 'Review', mcNumber: mc, checkedAt, message: error.message, loginUrl: RTS_LOGIN_URL };
    }
  }

  return {
    ok: false,
    source: 'RTS Financial',
    status: RTS_USERNAME && RTS_PASSWORD ? 'Manual RTS review required' : 'RTS credentials not configured',
    statusClass: 'Review',
    mcNumber: mc,
    broker,
    checkedAt,
    message: RTS_USERNAME && RTS_PASSWORD
      ? 'RTS login credentials are configured, but no official RTS API endpoint is configured. Open RTS Pro and complete the credit/MC review manually, or add RTS_API_URL if RTS provides an API endpoint.'
      : 'Add RTS_USERNAME and RTS_PASSWORD in Render Environment Variables, and RTS_API_URL if RTS provides an official API endpoint.',
    loginUrl: RTS_LOGIN_URL,
    verifyUrl: RTS_VERIFY_URL
  };
}

function applyRtsResultToLoad(load, result) {
  if (!load || !result) return load;
  load.brokerMc = result.mcNumber || load.brokerMc || '';
  load.rtsStatus = result.status || load.rtsStatus || '';
  load.rtsStatusClass = result.statusClass || rtsStatusClass(result.status || '');
  load.rtsCheckedAt = result.checkedAt || new Date().toISOString();
  load.rtsSource = result.source || 'RTS Financial';
  load.rtsMessage = result.message || '';
  load.rtsLoginUrl = result.loginUrl || RTS_LOGIN_URL;
  load.rtsVerifyUrl = result.verifyUrl || RTS_VERIFY_URL;
  return load;
}

function sanitizeFilename(value) {
  return path.basename(String(value || 'upload.bin')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.bin';
}

function sanitizeAttachmentUrl(value) {
  const raw = sanitizeText(value);
  if (/^\/uploads\/[a-zA-Z0-9._\/-]+$/.test(raw) && !raw.includes('..')) return raw;
  return sanitizeExternalUrl(raw);
}

function chatAttachmentKind(filename = '', contentType = '') {
  const ext = path.extname(filename).toLowerCase();
  const mime = sanitizeText(contentType).toLowerCase();
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === '.pdf') return 'pdf';
  return 'file';
}

function normalizeChatAttachment(item = {}) {
  const name = sanitizeFilename(item.name || item.filename || item.attachmentName || 'Attachment');
  const contentType = sanitizeText(item.contentType || item.mimeType || 'application/octet-stream').slice(0, 120);
  const url = sanitizeAttachmentUrl(item.url || item.fileUrl || item.attachmentUrl || '');
  if (!url) return null;
  return {
    url,
    name,
    contentType,
    sizeBytes: Math.max(0, Number(item.sizeBytes || item.size || 0) || 0),
    kind: sanitizeText(item.kind || chatAttachmentKind(name, contentType), 'file')
  };
}

function validateChatUpload(file) {
  const filename = sanitizeFilename(file?.filename || 'upload.bin');
  const ext = path.extname(filename).toLowerCase();
  const contentType = sanitizeText(file?.contentType || 'application/octet-stream').toLowerCase();
  const sizeBytes = Number(file?.data?.length || 0);
  if (!allowedChatUploadExtensions.has(ext)) return { ok: false, error: `File type ${ext || 'unknown'} is not allowed in chat.` };
  if (!allowedChatUploadMimeTypes.has(contentType) && contentType !== '') return { ok: false, error: `File content type ${contentType} is not allowed in chat.` };
  if (!sizeBytes) return { ok: false, error: `${filename} is empty.` };
  if (sizeBytes > MAX_CHAT_UPLOAD_BYTES) return { ok: false, error: `${filename} exceeds the ${Math.round(MAX_CHAT_UPLOAD_BYTES / 1024 / 1024)} MB chat limit.` };
  return { ok: true, filename, ext, contentType, sizeBytes };
}


function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function sanitizeExternalUrl(value) {
  const raw = decodeHtmlEntities(sanitizeText(value))
    .replace(/^src\s*=\s*/i, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/[)>.,;]+$/g, '')
    .trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (error) {}
  return '';
}

function urlCandidatesFromText(text) {
  const source = decodeHtmlEntities(String(text || ''));
  const matches = source.match(/https?:\/\/[^\s"'<>)]{6,}/gi) || [];
  return [...new Set(matches.map(item => sanitizeExternalUrl(item)).filter(Boolean))];
}

function extractIframeSrc(text) {
  const source = decodeHtmlEntities(String(text || ''));
  const quoted = /<iframe\b[\s\S]{0,2000}?\bsrc\s*=\s*["']([^"']+)["']/i.exec(source);
  if (quoted && quoted[1]) return sanitizeExternalUrl(quoted[1]);
  const unquoted = /<iframe\b[\s\S]{0,2000}?\bsrc\s*=\s*([^\s>]+)/i.exec(source);
  if (unquoted && unquoted[1]) return sanitizeExternalUrl(unquoted[1]);
  return '';
}

function extractGpsUrl(text) {
  const source = decodeHtmlEntities(String(text || ''));
  const iframeUrl = extractIframeSrc(source);
  if (iframeUrl) return iframeUrl;
  const labeled = /(?:live\s*gps|gps|tracking|track\s*link|location\s*link|map\s*link|driver\s*location|iframe)\s*(?:url|link|src)?\s*[:=\-]?\s*(https?:\/\/[^\s"'<>)]{6,})/i.exec(source);
  if (labeled && labeled[1]) return sanitizeExternalUrl(labeled[1]);
  const urls = urlCandidatesFromText(source);
  return urls.find(url => /gps|map|maps|tracking|track|location|samsara|motive|geotab|macropoint|project44|fourkites|truck|fleet|eld|dispatch/i.test(url)) || '';
}

function extractRawTextForLinks(file) {
  const data = file?.data || Buffer.alloc(0);
  if (!data.length) return '';
  const ext = path.extname(file.filename || '').toLowerCase();
  const contentType = String(file.contentType || '').toLowerCase();
  const limit = Math.min(data.length, 2 * 1024 * 1024);
  const slice = data.slice(0, limit);
  if (['.html', '.htm', '.txt', '.csv', '.json', '.xml', '.rtf', '.edi'].includes(ext) || /text|html|json|xml|csv|rtf/i.test(contentType)) {
    return slice.toString('utf8');
  }
  if (ext === '.pdf' || /pdf/i.test(contentType)) {
    const latin = decodeHtmlEntities(slice.toString('latin1'));
    const urls = urlCandidatesFromText(latin);
    const iframe = extractIframeSrc(latin);
    return [iframe, ...urls].filter(Boolean).join('\n');
  }
  return slice.toString('latin1').replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ');
}

function cleanScheduleValue(value) {
  return sanitizeText(value)
    .replace(/\s+/g, ' ')
    .replace(/\b(CST|CDT|EST|EDT|MST|MDT|PST|PDT|UTC)\b/gi, match => match.toUpperCase())
    .replace(/\bA\.M\./gi, 'AM')
    .replace(/\bP\.M\./gi, 'PM')
    .replace(/^[#:\-\s]+/, '')
    .slice(0, 110);
}

function extractScheduleNear(text, labelPattern) {
  const source = normalizeWhitespace(String(text || '')).replace(/\n/g, '  ');
  const datePattern = '(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{4}-\\d{1,2}-\\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2},?\\s+\\d{2,4})';
  const timePattern = '(?:\\d{1,2}:?\\d{2}\\s*(?:AM|PM|A\\.M\\.|P\\.M\\.)?|\\d{1,2}\\s*(?:AM|PM|A\\.M\\.|P\\.M\\.)|\\d{3,4}\\s*(?:HRS?|hrs?)?)';
  const windowPattern = `${timePattern}(?:\\s*(?:-|–|—|to|until|thru|through)\\s*${timePattern})?`;
  const patterns = [
    new RegExp(`\\b(?:${labelPattern})(?:\\s*(?:date|time|appt|appointment|schedule|scheduled|window|ready|close|open|from|to))*\\b[^\\n]{0,95}?(${datePattern}(?:\\s*(?:at|@)?\\s*${windowPattern})?)`, 'i'),
    new RegExp(`\\b(?:${labelPattern})(?:\\s*(?:date|time|appt|appointment|schedule|scheduled|window|ready|close|open|from|to))*\\b[^\\n]{0,95}?(${windowPattern}(?:\\s*(?:on)?\\s*${datePattern})?)`, 'i'),
    new RegExp(`\\b(?:${labelPattern})\\b[^\\n]{0,45}?(?:date|appt|appointment)\\s*[:\\-]?\\s*(${datePattern})[^\\n]{0,45}?(?:time|window)\\s*[:\\-]?\\s*(${windowPattern})`, 'i'),
    new RegExp(`\\b(?:${labelPattern})\\b[^\\n]{0,45}?(?:time|window)\\s*[:\\-]?\\s*(${windowPattern})[^\\n]{0,45}?(?:date|appt|appointment)\\s*[:\\-]?\\s*(${datePattern})`, 'i')
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match && match[1]) {
      const combined = match[2] ? `${match[1]} ${match[2]}` : match[1];
      const clean = cleanScheduleValue(combined);
      if (clean && !/^(date|time|appt|appointment)$/i.test(clean)) return clean;
    }
  }
  return '';
}

function extractStopSchedule(text, stopType) {
  const pickupLabels = 'pickup|pick\\s*up|pick-up|p\\/?u|pu|shipper|origin|ship\\s*date|loading|load\\s*at|pick';
  const deliveryLabels = 'delivery|deliver|drop|del|consignee|receiver|destination|unload|unloading|drop\\s*off|appt\\s*del';
  return extractScheduleNear(text, stopType === 'pickup' ? pickupLabels : deliveryLabels);
}

function extractStopWindow(text, stopType) {
  const value = extractStopSchedule(text, stopType);
  const match = /(\d{1,2}:?\d{0,2}\s*(?:AM|PM)?\s*(?:-|–|—|to|until|thru|through)\s*\d{1,2}:?\d{0,2}\s*(?:AM|PM)?)/i.exec(value);
  return match ? cleanScheduleValue(match[1]) : '';
}

function extractOperationalField(text, labels, maxLength = 120) {
  const source = normalizeWhitespace(String(text || '')).replace(/\n/g, '  ');
  const pattern = new RegExp(`\\b(?:${labels})\\s*(?:#|no\\.?|number|id)?\\s*[:\\-]?\\s*([A-Za-z0-9 .,#&/'_\\-]{2,${maxLength}}?)(?=\\s{2,}|\\b(?:pickup|delivery|rate|miles|driver|truck|trailer|po|bol|commodity|weight|equipment|temp|gps|tracking)\\b|$)`, 'i');
  const match = pattern.exec(source);
  return match && match[1] ? sanitizeText(match[1]).slice(0, maxLength) : '';
}

function makeId(prefix = 'rec') {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    if (!stored || !stored.includes(':')) return false;
    const [salt, expected] = stored.split(':');
    const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
    const hashBuffer = Buffer.from(hash, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (hashBuffer.length !== expectedBuffer.length) return false;
    return crypto.timingSafeEqual(hashBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, password, ...clean } = user;
  return clean;
}

function isAdmin(user) {
  return user?.role === 'admin';
}

function isDispatcherOrAdmin(user) {
  return user?.role === 'admin' || user?.role === 'dispatcher';
}

function isActiveUser(user) {
  return user && normalizeStatus(user.status) !== 'Disabled';
}

function createSession(user) {
  cleanupSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, { userId: user.id, expiresAt });
  return { token, expiresAt: new Date(expiresAt).toISOString() };
}

function cleanupSessions() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (!session || session.expiresAt <= now) sessions.delete(token);
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

function authenticate(req, db) {
  cleanupSessions();
  const token = getBearerToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = db.users.find(item => item.id === session.userId && isActiveUser(item));
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { user, token };
}

function requireAdmin(res, user) {
  if (!isAdmin(user)) {
    sendJson(res, 403, { error: 'Admin access is required.' });
    return false;
  }
  return true;
}

function requireDispatcherOrAdmin(res, user) {
  if (!isDispatcherOrAdmin(user)) {
    sendJson(res, 403, { error: 'Dispatcher or admin access is required.' });
    return false;
  }
  return true;
}

function logAudit(db, action, entity, user = 'system') {
  db.auditLog.unshift({ id: makeId('audit'), action, entity, user, createdAt: new Date().toISOString() });
  db.auditLog = db.auditLog.slice(0, 500);
}

function prepareRecord(collection, incoming, existing = {}) {
  const now = new Date().toISOString();
  const record = { ...existing, ...incoming };
  record.id = sanitizeText(record.id, makeId(collection.slice(0, 4)));
  record.updatedAt = now;
  if (!record.createdAt) record.createdAt = now;

  if (collection === 'loads') {
    record.status = sanitizeText(record.status, 'Open');
    record.docs = sanitizeText(record.docs, 'Missing');
    record.miles = Number(record.miles || 0);
    record.emptyMiles = Math.max(0, Number(record.emptyMiles ?? existing.emptyMiles ?? 0) || 0);
    // Loaded miles + ProMiles/Driver Miles pairs, used for the IFTA empty/loaded mileage calculator.
    record.loadedMiles = Math.max(0, Number(record.loadedMiles ?? existing.loadedMiles ?? Math.max(0, record.miles - record.emptyMiles)) || 0);
    record.proMiles = Math.max(0, Number(record.proMiles ?? existing.proMiles ?? record.miles ?? 0) || 0);
    record.proMilesEmpty = Math.max(0, Number(record.proMilesEmpty ?? existing.proMilesEmpty ?? 0) || 0);
    record.driverMiles = Math.max(0, Number(record.driverMiles ?? existing.driverMiles ?? record.miles ?? 0) || 0);
    record.driverMilesEmpty = Math.max(0, Number(record.driverMilesEmpty ?? existing.driverMilesEmpty ?? 0) || 0);
    record.gpsUrl = sanitizeExternalUrl(record.gpsUrl || record.trackingUrl || '');
    record.trackingUrl = sanitizeExternalUrl(record.trackingUrl || record.gpsUrl || '');
    record.brokerMc = normalizeMcNumber(record.brokerMc || record.mcNumber || record.brokerMC || '');
    record.rtsStatus = sanitizeText(record.rtsStatus || 'Not checked');
    record.rtsStatusClass = sanitizeText(record.rtsStatusClass || rtsStatusClass(record.rtsStatus));
    record.rtsCheckedAt = sanitizeText(record.rtsCheckedAt || '');
    record.rtsSource = sanitizeText(record.rtsSource || 'RTS Financial');
    record.rtsMessage = sanitizeText(record.rtsMessage || '');
    record.rtsLoginUrl = sanitizeExternalUrl(record.rtsLoginUrl || RTS_LOGIN_URL);
    record.rtsVerifyUrl = sanitizeExternalUrl(record.rtsVerifyUrl || RTS_VERIFY_URL);
    record.internalNotes = sanitizeText(record.internalNotes || '');
    record.brokerNotes = sanitizeText(record.brokerNotes || '');

    // --- ITS-Dispatch-style Load Information fields ---
    record.refNumber = sanitizeText(record.refNumber ?? existing.refNumber ?? record.woNumber ?? record.workOrder ?? '');
    record.loadType = ['Line Haul', 'TONU'].includes(record.loadType) ? record.loadType : (existing.loadType || 'Line Haul');
    record.dispatcherId = sanitizeText(record.dispatcherId ?? existing.dispatcherId ?? '');
    record.dispatcherName = sanitizeText(record.dispatcherName ?? existing.dispatcherName ?? '');
    record.salesRepChoice = ['rep1', 'rep2'].includes(record.salesRepChoice) ? record.salesRepChoice : (existing.salesRepChoice || 'rep1');
    record.salesRep1 = sanitizeText(record.salesRep1 ?? existing.salesRep1 ?? '');
    record.salesRep2 = sanitizeText(record.salesRep2 ?? existing.salesRep2 ?? '');
    record.carrierOrDriver = ['carrier', 'driver'].includes(record.carrierOrDriver) ? record.carrierOrDriver : (existing.carrierOrDriver || 'driver');
    record.equipmentType = sanitizeText(record.equipmentType ?? existing.equipmentType ?? '');
    record.trailerNumber = sanitizeText(record.trailerNumber ?? existing.trailerNumber ?? '');
    record.flatRate = Math.max(0, Number(record.flatRate ?? existing.flatRate ?? 0) || 0);

    // --- Other Charges modal: Charges tab + Advances tab (each a list of {charge, amount}) ---
    const cleanChargeRows = (list) => (Array.isArray(list) ? list : []).map(row => ({
      charge: sanitizeText(row?.charge || ''),
      amount: Math.round(Number(row?.amount || 0) * 100) / 100
    })).filter(row => row.charge || row.amount);
    record.chargesList = record.chargesList !== undefined ? cleanChargeRows(record.chargesList) : (Array.isArray(existing.chargesList) ? existing.chargesList : []);
    record.advancesList = record.advancesList !== undefined ? cleanChargeRows(record.advancesList) : (Array.isArray(existing.advancesList) ? existing.advancesList : []);
    const otherChargesTotal = [...record.chargesList, ...record.advancesList].reduce((sum, row) => sum + Number(row.amount || 0), 0);
    record.otherCharges = Math.round(otherChargesTotal * 100) / 100;

    // --- Financial breakdown: Driver Rate + Cut + Other Charges = Broker Rate ---
    // Driver Rate and Cut are now direct dollar entries (matching the ITS Dispatch "Load Information"
    // screen) instead of a rate + percentage. Broker Rate (record.rate) is always the computed total,
    // so it stays in sync automatically as Driver Rate / Cut / Other Charges change.
    let driverRate = Number(record.driverRate ?? existing.driverRate);
    let cutAmount = Number(record.cutAmount ?? existing.cutAmount);
    if (!Number.isFinite(driverRate) && !Number.isFinite(cutAmount) && Number(record.rate ?? existing.rate ?? 0) > 0) {
      // Backward compatibility: legacy loads only had a flat "rate" + "cutPercent". Back-derive a
      // Driver Rate and Cut so the new Load Information screen displays sensible starting values.
      const legacyRate = Number(record.rate ?? existing.rate ?? 0);
      const legacyCutPercent = Number(record.cutPercent ?? existing.cutPercent ?? 10);
      cutAmount = Math.round(legacyRate * legacyCutPercent / 100 * 100) / 100;
      driverRate = Math.max(0, Math.round((legacyRate - cutAmount - record.otherCharges) * 100) / 100);
    }
    record.driverRate = Math.max(0, Math.round((Number.isFinite(driverRate) ? driverRate : 0) * 100) / 100);
    record.cutAmount = Math.max(0, Math.round((Number.isFinite(cutAmount) ? cutAmount : 0) * 100) / 100);
    record.rate = Math.round((record.driverRate + record.cutAmount + record.otherCharges) * 100) / 100; // Broker Rate
    record.cutPercent = record.rate > 0 ? Math.round((record.cutAmount / record.rate) * 10000) / 100 : 0; // kept for legacy report compatibility
    record.otherCosts = Math.max(0, Number(record.otherCosts ?? existing.otherCosts ?? 0) || 0); // internal-only cost, separate from driver-visible Other Charges
    record.driverGrossAmount = record.driverRate; // legacy alias used by existing report/table code
    record.netProfit = Math.round((record.cutAmount - record.otherCosts) * 100) / 100;
    record.revenuePerMile = record.miles > 0 ? Math.round((record.rate / record.miles) * 100) / 100 : 0;

    // --- Shipper(s) / Consignee(s): multi-stop arrays, OCR-filled; "+" adds Shipper 2/3.../Consignee 2/3... ---
    const cleanStopRows = (list) => (Array.isArray(list) ? list : []).map(row => ({
      name: sanitizeText(row?.name || ''),
      bol: sanitizeText(row?.bol || ''),
      location: sanitizeText(row?.location || ''),
      date: sanitizeText(row?.date || ''),
      time: sanitizeText(row?.time || ''),
      showTime: row?.showTime !== false,
      description: sanitizeText(row?.description || ''),
      type: sanitizeText(row?.type || ''),
      qty: sanitizeText(row?.qty || ''),
      weight: sanitizeText(row?.weight || ''),
      value: sanitizeText(row?.value || ''),
      notes: sanitizeText(row?.notes || ''),
      poNumbers: sanitizeText(row?.poNumbers || ''),
      customsBroker: sanitizeText(row?.customsBroker || '')
    }));
    record.shippers = record.shippers !== undefined ? cleanStopRows(record.shippers) : (Array.isArray(existing.shippers) ? existing.shippers : []);
    record.consignees = record.consignees !== undefined ? cleanStopRows(record.consignees) : (Array.isArray(existing.consignees) ? existing.consignees : []);
    // Keep legacy flat pickup/delivery text fields in sync with the first Shipper / last Consignee so
    // existing dashboard, driver-mobile, GPS, chat and search features keep working unmodified.
    if (record.shippers.length && !record.pickup) record.pickup = record.shippers[0].location || '';
    if (record.consignees.length && !record.delivery) record.delivery = record.consignees[record.consignees.length - 1].location || '';
    // Editable override for "last drop-off address" shown via the icon next to Shipper; defaults to the
    // most recent Consignee location when not explicitly overridden by the dispatcher/admin.
    record.lastDropOverride = sanitizeText(record.lastDropOverride ?? existing.lastDropOverride ?? '');
  }
  if (collection === 'docs') {
    record.status = sanitizeText(record.status, 'Uploaded');
    record.rejectionReason = sanitizeText(record.rejectionReason || '');
    record.approvedBy = sanitizeText(record.approvedBy || '');
    record.approvedAt = sanitizeText(record.approvedAt || '');
    record.rejectedBy = sanitizeText(record.rejectedBy || '');
    record.rejectedAt = sanitizeText(record.rejectedAt || '');
    record.date = sanitizeText(record.date, new Date().toLocaleString());
    // Documents Hub: Personal / Operational category with a specific sub-type, and the driver this document belongs to.
    record.category = sanitizeText(record.category || existing.category || '');
    record.subType = sanitizeText(record.subType || record.docSubType || existing.subType || '');
    record.driverEmail = sanitizeText(record.driverEmail || existing.driverEmail || '').toLowerCase();
    // Optional custom folder (used under Personal -> Other), created by admin/dispatcher.
    record.folderId = sanitizeText(record.folderId || existing.folderId || '');
  }
  if (collection === 'docFolders') {
    record.name = sanitizeText(record.name, 'Folder');
    record.driverEmail = sanitizeText(record.driverEmail || existing.driverEmail || '').toLowerCase();
    record.driverName = sanitizeText(record.driverName || existing.driverName || '');
    record.category = sanitizeText(record.category || existing.category || 'Personal');
    record.subType = sanitizeText(record.subType || existing.subType || 'Other');
  }
  if (collection === 'driverPayAdjustments') {
    record.driverEmail = sanitizeText(record.driverEmail || existing.driverEmail || '').toLowerCase();
    record.driverName = sanitizeText(record.driverName || existing.driverName || '');
    record.loadId = sanitizeText(record.loadId ?? existing.loadId ?? '');
    record.category = ['deduction', 'reimbursement', 'additionalPay'].includes(record.category) ? record.category : (existing.category || 'deduction');
    record.note = sanitizeText(record.note || existing.note || '');
    record.amount = Math.round(Number(record.amount ?? existing.amount ?? 0) * 100) / 100;
    // Effective date drives which weekly payroll bucket this adjustment lands in.
    record.date = sanitizeText(record.date || existing.date || new Date().toISOString().slice(0, 10));
  }
  if (collection === 'drivers') {
    record.status = sanitizeText(record.status, 'Available');
    record.averageMph = Number(record.averageMph || record.avgMph || 55);
    record.drivingHours = sanitizeText(record.drivingHours || record.driveHours || '0');
    record.onDutyHours = sanitizeText(record.onDutyHours || record.onDuty || '0');
    record.offDutyHours = sanitizeText(record.offDutyHours || record.offDuty || '0');
    record.cycleHours = sanitizeText(record.cycleHours || record.cycleUsed || '0');
    record.lastBreakAt = sanitizeText(record.lastBreakAt || '');
    // Per-driver live GPS tracker link (paid GPS provider), settable by admin/dispatcher.
    record.gpsTrackerUrl = sanitizeExternalUrl(record.gpsTrackerUrl || existing.gpsTrackerUrl || '');
  }
  if (collection === 'reminders') {
    record.driverEmail = sanitizeText(record.driverEmail || '').toLowerCase();
    record.driverName = sanitizeText(record.driverName || '');
    record.category = sanitizeText(record.category, REMINDER_CATEGORIES[0]);
    record.dueDate = sanitizeText(record.dueDate || '');
    record.notes = sanitizeText(record.notes || '');
    record.status = sanitizeText(record.status, 'Upcoming');
    record.proofDocId = sanitizeText(record.proofDocId || existing.proofDocId || '');
    record.proofUrl = sanitizeText(record.proofUrl || existing.proofUrl || '');
    record.filename = sanitizeText(record.filename || existing.filename || '');
    record.submittedAt = sanitizeText(record.submittedAt || existing.submittedAt || '');
    record.approvedBy = sanitizeText(record.approvedBy || existing.approvedBy || '');
    record.approvedAt = sanitizeText(record.approvedAt || existing.approvedAt || '');
    record.rejectionReason = sanitizeText(record.rejectionReason || '');
    record.rejectedBy = sanitizeText(record.rejectedBy || existing.rejectedBy || '');
    record.rejectedAt = sanitizeText(record.rejectedAt || existing.rejectedAt || '');
  }
  if (collection === 'notifications') {
    record.title = sanitizeText(record.title || record.type, 'Notification');
    record.text = sanitizeText(record.text || record.message || '');
    record.message = sanitizeText(record.message || record.text || '');
    record.type = sanitizeText(record.type, record.title);
    record.role = sanitizeText(record.role || record.targetRole || '');
    record.target = sanitizeText(record.target || record.targetEmail || record.targetUserId || '');
    record.targetName = sanitizeText(record.targetName || '');
    record.relatedLoadId = sanitizeText(record.relatedLoadId || record.loadId || '');
    record.relatedDocId = sanitizeText(record.relatedDocId || record.documentId || '');
    record.relatedChatContact = sanitizeText(record.relatedChatContact || record.chatContact || '');
    record.relatedPage = sanitizeText(record.relatedPage || record.page || '');
    record.action = sanitizeText(record.action || '');
    record.level = sanitizeText(record.level || 'info');
    record.excludedUsers = Array.isArray(record.excludedUsers) ? [...new Set(record.excludedUsers.map(v => sanitizeText(v).toLowerCase()).filter(Boolean))] : [];
    record.dedupeKey = sanitizeText(record.dedupeKey || '');
    record.readBy = Array.isArray(record.readBy) ? [...new Set(record.readBy.map(v => sanitizeText(v).toLowerCase()).filter(Boolean))] : [];
    record.time = sanitizeText(record.time || 'Now');
  }
  if (collection === 'locations') {
    record.lat = Number(record.lat || record.latitude || 0);
    record.lng = Number(record.lng || record.longitude || 0);
    record.speed = Number(record.speed || 0);
    record.heading = Number(record.heading || 0);
    record.timestamp = sanitizeText(record.timestamp || now);
  }
  if (collection === 'hosLogs') {
    record.driver = sanitizeText(record.driver);
    record.driverEmail = sanitizeText(record.driverEmail).toLowerCase();
    record.status = sanitizeText(record.status || 'Off duty');
    record.startAt = sanitizeText(record.startAt || now);
    record.endAt = sanitizeText(record.endAt || '');
  }
  return record;
}

function matchesUserNameOrEmail(record, user) {
  if (!record || !user) return false;
  const names = [record.name, record.driver, record.contact, record.company].map(v => sanitizeText(v).toLowerCase()).filter(Boolean);
  const emails = [record.email, record.driverEmail, record.brokerEmail].map(v => sanitizeText(v).toLowerCase()).filter(Boolean);
  return names.includes(sanitizeText(user.name).toLowerCase()) || emails.includes(sanitizeText(user.email).toLowerCase());
}

function brokerNamesForUser(db, user) {
  const names = new Set([sanitizeText(user.name).toLowerCase(), sanitizeText(user.email).toLowerCase()].filter(Boolean));
  db.brokers.forEach(broker => {
    const brokerEmail = sanitizeText(broker.email).toLowerCase();
    if (brokerEmail && brokerEmail === sanitizeText(user.email).toLowerCase()) {
      [broker.company, broker.contact, broker.name, broker.email].forEach(value => {
        const clean = sanitizeText(value).toLowerCase();
        if (clean) names.add(clean);
      });
    }
  });
  return names;
}

function enrichLoadAccountLinks(db, load = {}) {
  if (!load || typeof load !== 'object') return load;
  if (load.driver && !load.driverEmail) {
    const driverName = sanitizeText(load.driver).toLowerCase();
    const driverUser = (db.users || []).find(user => user.role === 'driver' && userReadKeys(user).includes(driverName));
    if (driverUser) load.driverEmail = driverUser.email;
  }
  if (load.broker && !load.brokerEmail) {
    const brokerName = sanitizeText(load.broker).toLowerCase();
    const brokerUser = (db.users || []).find(user => user.role === 'broker' && userReadKeys(user).includes(brokerName));
    if (brokerUser) load.brokerEmail = brokerUser.email;
  }
  return load;
}


function userReadKeys(user) {
  return [user?.id, user?.email, user?.name].map(v => sanitizeText(v).toLowerCase()).filter(Boolean);
}

function findUserByReference(db, reference, role = '') {
  const clean = sanitizeText(reference).toLowerCase();
  if (!clean) return null;
  return (db.users || []).find(user => (!role || user.role === role) && userReadKeys(user).includes(clean)) || null;
}

function assignedDispatcherForDriver(db, driverUser) {
  if (!driverUser || driverUser.role !== 'driver') return null;
  const byId = sanitizeText(driverUser.dispatcherId);
  const byEmail = sanitizeText(driverUser.dispatcherEmail).toLowerCase();
  return (db.users || []).find(user => user.role === 'dispatcher' && isActiveUser(user) && ((byId && user.id === byId) || (byEmail && sanitizeText(user.email).toLowerCase() === byEmail))) || null;
}

function assignedDriversForDispatcher(db, dispatcherUser) {
  if (!dispatcherUser || dispatcherUser.role !== 'dispatcher') return [];
  const keys = new Set(userReadKeys(dispatcherUser));
  return (db.users || []).filter(user => user.role === 'driver' && isActiveUser(user) && [user.dispatcherId, user.dispatcherEmail].map(value => sanitizeText(value).toLowerCase()).some(value => value && keys.has(value)));
}

function driverChatThreadKey(driverUser) {
  return driverUser ? `driver:${sanitizeText(driverUser.id)}` : '';
}

function brokerChatThreadKey(brokerUser) {
  return brokerUser ? `broker:${sanitizeText(brokerUser.id)}` : '';
}

function staffChatThreadKey(firstUser, secondUser) {
  const participants = [firstUser, secondUser]
    .map(user => sanitizeText(user?.id || user?.email || ''))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  return participants.length === 2 ? `staff:${participants.join(':')}` : '';
}

function chatDirectoryForUser(db, user) {
  if (!user) return [];
  const activeDrivers = (db.users || []).filter(item => item.role === 'driver' && isActiveUser(item));
  const activeDispatchers = (db.users || []).filter(item => item.role === 'dispatcher' && isActiveUser(item));
  const activeAdmins = (db.users || []).filter(item => item.role === 'admin' && isActiveUser(item));
  const activeBrokers = (db.users || []).filter(item => item.role === 'broker' && isActiveUser(item));
  if (user.role === 'admin') {
    return [
      ...activeDispatchers.map(dispatcher => ({
        key: staffChatThreadKey(user, dispatcher),
        label: dispatcher.name,
        type: 'staff',
        userId: dispatcher.id,
        userEmail: dispatcher.email,
        peerRole: 'dispatcher',
        subtitle: 'Dispatcher'
      })),
      ...activeDrivers.map(driver => {
        const dispatcher = assignedDispatcherForDriver(db, driver);
        return { key: driverChatThreadKey(driver), label: driver.name, type: 'driver', userId: driver.id, userEmail: driver.email, driverName: driver.name, dispatcherName: dispatcher?.name || 'Unassigned dispatcher', dispatcherId: dispatcher?.id || '', dispatcherEmail: dispatcher?.email || '', subtitle: dispatcher ? `Driver · ${dispatcher.name}` : 'Driver · Dispatcher not assigned' };
      }),
      ...activeBrokers.map(broker => ({ key: brokerChatThreadKey(broker), label: broker.name, type: 'broker', userId: broker.id, userEmail: broker.email, subtitle: 'Broker / customer account' })),
      ...Object.keys(db.chats || {}).filter(key => {
        if (key.startsWith('legacy:')) return true;
        if (key.startsWith('driver:')) return !activeDrivers.some(driver => driverChatThreadKey(driver) === key);
        if (key.startsWith('broker:')) return !activeBrokers.some(broker => brokerChatThreadKey(broker) === key);
        return false;
      }).map(key => ({ key, label: key.replace(/^(?:legacy|driver|broker):/, '') || 'Archived chat', type: 'legacy', subtitle: 'Archived administrator-only conversation' }))
    ].filter(entry => entry.key);
  }
  if (user.role === 'dispatcher') {
    return [
      ...assignedDriversForDispatcher(db, user).map(driver => ({ key: driverChatThreadKey(driver), label: driver.name, type: 'driver', userId: driver.id, userEmail: driver.email, driverName: driver.name, dispatcherName: user.name, dispatcherEmail: user.email, subtitle: 'Assigned driver' })),
      ...activeAdmins.map(admin => ({
        key: staffChatThreadKey(user, admin),
        label: admin.name,
        type: 'staff',
        userId: admin.id,
        userEmail: admin.email,
        peerRole: 'admin',
        subtitle: 'Administrator'
      }))
    ].filter(entry => entry.key);
  }
  if (user.role === 'driver') {
    const dispatcher = assignedDispatcherForDriver(db, user);
    return dispatcher ? [{ key: driverChatThreadKey(user), label: dispatcher.name, type: 'driver', userId: dispatcher.id, userEmail: dispatcher.email, driverName: user.name, dispatcherName: dispatcher.name, dispatcherEmail: dispatcher.email, subtitle: 'Dedicated dispatcher' }] : [];
  }
  if (user.role === 'broker') {
    return [{ key: brokerChatThreadKey(user), label: 'Administration', type: 'broker', userId: user.id, userEmail: user.email, subtitle: 'Admin support' }];
  }
  return [];
}

function resolveChatAccess(db, user, requestedContact = '') {
  const directory = chatDirectoryForUser(db, user);
  const requested = sanitizeText(requestedContact).toLowerCase();
  let entry = directory.find(item => sanitizeText(item.key).toLowerCase() === requested);
  if (!entry) entry = directory.find(item => [item.label, item.userEmail, item.userId, item.driverName, item.dispatcherName].map(value => sanitizeText(value).toLowerCase()).includes(requested));
  if (!entry && user?.role === 'driver' && ['dispatch', 'dispatcher'].includes(requested)) entry = directory[0] || null;
  return entry ? { allowed: true, ...entry } : { allowed: false, error: user?.role === 'driver' && !directory.length ? 'A dedicated dispatcher has not been assigned to this driver account.' : 'You do not have access to this chat contact.' };
}


function normalizeSessionDescription(value, fallbackType = '') {
  if (!value || typeof value !== 'object') return null;
  const type = sanitizeText(value.type || fallbackType).toLowerCase();
  const sdp = String(value.sdp || '').slice(0, 220000);
  if (!['offer', 'answer'].includes(type) || !sdp) return null;
  return { type, sdp };
}

function normalizeIceCandidate(value) {
  if (!value || typeof value !== 'object') return null;
  const candidate = String(value.candidate || '').slice(0, 8192);
  if (!candidate) return null;
  return {
    candidate,
    sdpMid: value.sdpMid === null || value.sdpMid === undefined ? null : String(value.sdpMid).slice(0, 120),
    sdpMLineIndex: Number.isFinite(Number(value.sdpMLineIndex)) ? Number(value.sdpMLineIndex) : null,
    usernameFragment: value.usernameFragment ? String(value.usernameFragment).slice(0, 240) : undefined
  };
}

function normalizeStoredIceCandidate(value) {
  if (!value || typeof value !== 'object') return null;
  const candidate = normalizeIceCandidate(value.candidate || value);
  if (!candidate) return null;
  return {
    id: sanitizeText(value.id, makeId('ice')),
    fromUserId: sanitizeText(value.fromUserId || ''),
    fromUserEmail: sanitizeText(value.fromUserEmail || '').toLowerCase(),
    candidate,
    createdAt: value.createdAt || new Date().toISOString()
  };
}

function callUserMatches(call, user, side = '') {
  if (!call || !user) return false;
  const keys = new Set(userReadKeys(user));
  const values = side === 'caller'
    ? [call.callerId, call.callerEmail, call.callerName]
    : side === 'callee'
      ? [call.calleeId, call.calleeEmail, call.calleeName]
      : [call.callerId, call.callerEmail, call.callerName, call.calleeId, call.calleeEmail, call.calleeName];
  return values.map(value => sanitizeText(value).toLowerCase()).some(value => value && keys.has(value));
}

function callVisibleToUser(call, user) {
  return callUserMatches(call, user);
}

function activeCallStatus(status = '') {
  return ['ringing', 'answered'].includes(sanitizeText(status).toLowerCase());
}

function callPeersForAccess(db, user, access) {
  if (!user || !access?.allowed) return [];
  const peers = [];
  if (access.type === 'driver') {
    const driver = findUserByReference(db, access.key.replace(/^driver:/, ''), 'driver');
    const dispatcher = assignedDispatcherForDriver(db, driver);
    if (user.role === 'driver' && dispatcher) peers.push(dispatcher);
    if (user.role === 'dispatcher' && driver && dispatcher?.id === user.id) peers.push(driver);
    if (user.role === 'admin') {
      if (driver) peers.push(driver);
      if (dispatcher) peers.push(dispatcher);
    }
  }
  if (access.type === 'broker') {
    const broker = findUserByReference(db, access.key.replace(/^broker:/, ''), 'broker');
    if (user.role === 'broker') peers.push(...(db.users || []).filter(item => item.role === 'admin' && isActiveUser(item)));
    if (user.role === 'admin' && broker) peers.push(broker);
  }
  if (access.type === 'staff') {
    const peer = findUserByReference(db, access.userId || access.userEmail || '');
    if (peer && ['admin', 'dispatcher'].includes(peer.role)) peers.push(peer);
  }
  const unique = new Map(peers.filter(peer => peer && isActiveUser(peer) && peer.id !== user.id).map(peer => [peer.id, peer]));
  return [...unique.values()];
}

function callPeerForAccess(db, user, access, requestedReference = '') {
  const peers = callPeersForAccess(db, user, access);
  const requested = sanitizeText(requestedReference).toLowerCase();
  if (requested) return peers.find(peer => userReadKeys(peer).includes(requested)) || null;
  return peers[0] || null;
}

function callDurationSeconds(call, endTime = new Date()) {
  if (!call?.answeredAt) return 0;
  const start = new Date(call.answeredAt).getTime();
  const end = new Date(call.endedAt || endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 1000));
}

function voiceCallStatusLabel(call = {}) {
  if (call.status === 'ringing') return 'Start calling';
  if (call.status === 'answered') return 'Answered';
  if (call.status === 'declined') return 'Call declined';
  if (call.status === 'missed') return 'Missed call';
  if (call.status === 'cancelled') return 'Call cancelled';
  if (call.status === 'failed') return 'Call failed';
  return 'End Call';
}

function upsertVoiceCallChatMessage(db, call) {
  if (!call?.threadKey) return null;
  if (!Array.isArray(db.chats[call.threadKey])) db.chats[call.threadKey] = [];
  let message = db.chats[call.threadKey].find(item => sanitizeText(item.callId) === sanitizeText(call.id));
  if (!message) {
    message = {
      id: makeId('msg'),
      type: 'call',
      kind: 'voice-call',
      callId: call.id,
      text: '',
      user: call.callerName,
      userEmail: call.callerEmail,
      to: call.threadKey,
      time: new Date(call.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      createdAt: call.createdAt || new Date().toISOString(),
      readBy: [call.callerId, call.callerEmail].filter(Boolean)
    };
    db.chats[call.threadKey].push(message);
  }
  message.callStatus = call.status;
  message.callStatusLabel = voiceCallStatusLabel(call);
  message.callStartedAt = call.createdAt;
  message.callAnsweredAt = call.answeredAt || '';
  message.callEndedAt = call.endedAt || '';
  message.durationSeconds = callDurationSeconds(call);
  message.callerName = call.callerName;
  message.callerEmail = call.callerEmail;
  message.calleeName = call.calleeName;
  message.calleeEmail = call.calleeEmail;
  message.updatedAt = call.updatedAt || new Date().toISOString();
  if (['answered', 'ended', 'declined'].includes(call.status)) {
    const readBy = new Set((Array.isArray(message.readBy) ? message.readBy : []).map(value => sanitizeText(value).toLowerCase()).filter(Boolean));
    [call.calleeId, call.calleeEmail].map(value => sanitizeText(value).toLowerCase()).filter(Boolean).forEach(value => readBy.add(value));
    message.readBy = [...readBy];
  }
  db.chats[call.threadKey] = db.chats[call.threadKey].slice(-300);
  return message;
}

function syncVoiceCallNotification(db, call) {
  if (!call?.notificationId) return;
  const notification = (db.notifications || []).find(item => item.id === call.notificationId);
  if (!notification) return;
  const labels = {
    ringing: ['Incoming voice call', `${call.callerName} is calling you`],
    answered: ['Voice call answered', `Call with ${call.callerName} answered`],
    declined: ['Voice call declined', `You declined ${call.callerName}'s call`],
    missed: ['Missed voice call', `Missed call from ${call.callerName}`],
    cancelled: ['Voice call cancelled', `${call.callerName} cancelled the call`],
    ended: ['Voice call ended', `Call with ${call.callerName} ended · ${formatCallDurationText(callDurationSeconds(call))}`],
    failed: ['Voice call failed', `Call with ${call.callerName} could not connect`]
  };
  const [title, text] = labels[call.status] || labels.ended;
  notification.title = title;
  notification.type = title;
  notification.text = text;
  notification.message = text;
  notification.callStatus = call.status;
  notification.updatedAt = call.updatedAt || new Date().toISOString();
}

function formatCallDurationText(seconds = 0) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = Math.floor(total % 60);
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function finishVoiceCall(db, call, status, user, reason = '') {
  if (!call || !activeCallStatus(call.status)) return call;
  call.status = status;
  call.endedAt = new Date().toISOString();
  call.updatedAt = call.endedAt;
  call.endedBy = user?.email || user?.id || reason || 'system';
  call.endReason = sanitizeText(reason || status);
  call.durationSeconds = callDurationSeconds(call);
  upsertVoiceCallChatMessage(db, call);
  syncVoiceCallNotification(db, call);
  return call;
}

function expireStaleVoiceCalls(db) {
  let changed = false;
  const now = Date.now();
  (db.calls || []).forEach(call => {
    const created = new Date(call.createdAt || 0).getTime();
    const answered = new Date(call.answeredAt || 0).getTime();
    if (call.status === 'ringing' && Number.isFinite(created) && now - created > CALL_RING_TIMEOUT_MS) {
      finishVoiceCall(db, call, 'missed', null, 'No answer');
      changed = true;
    } else if (call.status === 'answered' && Number.isFinite(answered) && now - answered > CALL_MAX_DURATION_MS) {
      finishVoiceCall(db, call, 'ended', null, 'Maximum call duration reached');
      changed = true;
    }
  });
  return changed;
}

function publicVoiceCall(call, user) {
  if (!callVisibleToUser(call, user)) return null;
  return {
    id: call.id,
    threadKey: call.threadKey,
    status: call.status,
    callerId: call.callerId,
    callerEmail: call.callerEmail,
    callerName: call.callerName,
    callerRole: call.callerRole,
    calleeId: call.calleeId,
    calleeEmail: call.calleeEmail,
    calleeName: call.calleeName,
    calleeRole: call.calleeRole,
    offer: call.offer,
    answer: call.answer,
    iceCandidates: call.iceCandidates || [],
    createdAt: call.createdAt,
    updatedAt: call.updatedAt,
    answeredAt: call.answeredAt || '',
    endedAt: call.endedAt || '',
    endedBy: call.endedBy || '',
    endReason: call.endReason || '',
    durationSeconds: call.durationSeconds || callDurationSeconds(call),
    notificationId: call.notificationId || ''
  };
}

function callByIdForUser(db, callId, user) {
  const call = (db.calls || []).find(item => sanitizeText(item.id) === sanitizeText(callId));
  return call && callVisibleToUser(call, user) ? call : null;
}

function notificationVisibleToUser(item, user) {
  if (!item || !user) return false;
  const target = sanitizeText(item.target || item.targetEmail || item.targetUserId || '').toLowerCase();
  const targetName = sanitizeText(item.targetName || '').toLowerCase();
  const role = sanitizeText(item.role || item.targetRole || '').toLowerCase();
  const keys = new Set(userReadKeys(user));
  const excludedUsers = new Set((Array.isArray(item.excludedUsers) ? item.excludedUsers : []).map(v => sanitizeText(v).toLowerCase()).filter(Boolean));
  if ([...keys].some(key => excludedUsers.has(key))) return false;

  // Exact account targeting always takes precedence over a broad role.
  if (target || targetName) return keys.has(target) || keys.has(targetName);
  if (role) return role === sanitizeText(user.role).toLowerCase();

  // Legacy notifications without an audience are visible only to their creator.
  const createdBy = sanitizeText(item.createdBy || '').toLowerCase();
  return Boolean(createdBy && keys.has(createdBy));
}

function notificationReadByUser(item, user) {
  const readBy = new Set((Array.isArray(item.readBy) ? item.readBy : []).map(v => sanitizeText(v).toLowerCase()).filter(Boolean));
  return userReadKeys(user).some(key => readBy.has(key));
}

function decorateNotificationForUser(item, user) {
  return { ...item, read: notificationReadByUser(item, user), unread: !notificationReadByUser(item, user) };
}

function markNotificationReadForUser(item, user) {
  if (!item) return item;
  const readBy = new Set((Array.isArray(item.readBy) ? item.readBy : []).map(v => sanitizeText(v).toLowerCase()).filter(Boolean));
  userReadKeys(user).forEach(key => readBy.add(key));
  item.readBy = [...readBy];
  item.readAt = new Date().toISOString();
  return item;
}

function addNotification(db, data = {}) {
  const requestedTarget = sanitizeText(data.target || data.targetEmail || data.targetUserId || '').toLowerCase();
  const requestedTargetName = sanitizeText(data.targetName || '').toLowerCase();
  const matchedTargetUser = (db.users || []).find(user => {
    const keys = new Set(userReadKeys(user));
    return (requestedTarget && keys.has(requestedTarget)) || (requestedTargetName && keys.has(requestedTargetName));
  });
  const target = matchedTargetUser?.email || requestedTarget;
  const targetName = matchedTargetUser?.name || data.targetName || '';
  const role = matchedTargetUser?.role || data.role || data.targetRole || '';
  const createdBy = sanitizeText(data.createdBy || 'system').toLowerCase();
  const excludedUsers = Array.isArray(data.excludedUsers) ? data.excludedUsers : [];
  const isRoleAudience = !target && !targetName && Boolean(role);
  if (isRoleAudience && data.excludeCreator !== false && createdBy.includes('@')) excludedUsers.push(createdBy);

  const dedupeKey = [
    data.title || data.type || 'Operational alert',
    data.text || data.message || '',
    data.type || data.title || 'Operational alert',
    role,
    target,
    targetName,
    data.relatedLoadId || data.loadId || '',
    data.relatedDocId || data.documentId || '',
    data.relatedChatContact || data.chatContact || '',
    data.callId || '',
    data.relatedPage || data.page || '',
    data.action || ''
  ].map(value => sanitizeText(value).toLowerCase()).join('|');
  const dedupeWindowMs = Math.max(0, Number(data.dedupeWindowMs ?? 30000));
  const duplicate = dedupeWindowMs > 0 ? (db.notifications || []).find(item => {
    const itemKey = sanitizeText(item.dedupeKey || '').toLowerCase();
    const createdAt = new Date(item.createdAt || 0).getTime();
    return itemKey === dedupeKey && Number.isFinite(createdAt) && Date.now() - createdAt <= dedupeWindowMs;
  }) : null;
  if (duplicate) return duplicate;

  const notification = prepareRecord('notifications', {
    id: data.id || makeId('notif'),
    title: data.title || data.type || 'Operational alert',
    text: data.text || data.message || '',
    message: data.message || data.text || '',
    type: data.type || data.title || 'Operational alert',
    role,
    target,
    targetName,
    relatedLoadId: data.relatedLoadId || data.loadId || '',
    relatedDocId: data.relatedDocId || data.documentId || '',
    relatedChatContact: data.relatedChatContact || data.chatContact || '',
    callId: data.callId || '',
    callStatus: data.callStatus || '',
    relatedPage: data.relatedPage || data.page || '',
    action: data.action || '',
    level: data.level || 'info',
    createdBy: data.createdBy || 'system',
    excludedUsers,
    dedupeKey,
    readBy: []
  });
  db.notifications.unshift(notification);
  db.notifications = db.notifications.slice(0, 1000);
  dispatchPushForNotification(db, notification);
  return notification;
}

function pushAudienceUsers(db, notification) {
  return (db.users || []).filter(user => isActiveUser(user) && notificationVisibleToUser(notification, user));
}

function pushSubscriptionForUser(subscription, user) {
  if (!subscription || !user) return false;
  const email = sanitizeText(subscription.userEmail).toLowerCase();
  const userId = sanitizeText(subscription.userId);
  return (email && email === sanitizeText(user.email).toLowerCase()) || (userId && userId === sanitizeText(user.id));
}

function notificationPage(notification = {}) {
  const explicit = sanitizeText(notification.relatedPage || notification.page || '');
  if (explicit) return explicit;
  const type = `${notification.type || ''} ${notification.title || ''}`.toLowerCase();
  if (notification.callId || type.includes('voice call') || type.includes('incoming call')) return 'chat';
  if (type.includes('chat') || type.includes('message')) return 'chat';
  if (type.includes('document') || type.includes('bol') || type.includes('pod')) return 'documents';
  if (type.includes('gps') || type.includes('location')) return 'gps';
  if (type.includes('eld') || type.includes('hos')) return 'eld';
  if (notification.relatedLoadId || type.includes('load') || type.includes('driver status') || type.includes('delay')) {
    return sanitizeText(notification.role).toLowerCase() === 'driver' ? 'driver-mobile' : 'loads';
  }
  return 'notifications';
}

function notificationUrl(notification = {}) {
  const params = new URLSearchParams();
  params.set('page', notificationPage(notification));
  if (notification.relatedLoadId) params.set('load', notification.relatedLoadId);
  if (notification.relatedDocId) params.set('doc', notification.relatedDocId);
  if (notification.relatedChatContact) params.set('chat', notification.relatedChatContact);
  if (notification.callId) params.set('call', notification.callId);
  if (notification.id) params.set('notification', notification.id);
  if (notification.action) params.set('action', notification.action);
  return `/?${params.toString()}`;
}

function dispatchPushForNotification(db, notification) {
  if (!PUSH_ENABLED || !Array.isArray(db.pushSubscriptions) || db.pushSubscriptions.length === 0) return;
  const users = pushAudienceUsers(db, notification);
  if (!users.length) return;
  const payload = JSON.stringify({
    title: notification.title || 'JTS TMS',
    body: notification.text || notification.message || 'New operational update',
    url: notificationUrl(notification),
    notificationId: notification.id,
    type: notification.type || 'notification',
    page: notificationPage(notification),
    loadId: notification.relatedLoadId || '',
    documentId: notification.relatedDocId || '',
    chatContact: notification.relatedChatContact || '',
    callId: notification.callId || '',
    callStatus: notification.callStatus || '',
    isVoiceCall: Boolean(notification.callId || /voice call|incoming call/i.test(notification.type || notification.title || ''))
  });
  const targetMap = new Map();
  db.pushSubscriptions.filter(sub => users.some(user => pushSubscriptionForUser(sub, user))).forEach(sub => {
    if (!targetMap.has(sub.endpoint)) targetMap.set(sub.endpoint, sub);
  });
  const targets = [...targetMap.values()];
  targets.forEach(sub => {
    webPush.sendNotification(sub.subscription, payload).then(() => {
      sub.lastSuccessAt = new Date().toISOString();
      sub.lastError = '';
    }).catch(error => {
      sub.lastErrorAt = new Date().toISOString();
      sub.lastError = sanitizeText(error.message || String(error)).slice(0, 240);
    });
  });
}

function notifyLoadAudience(db, load = {}, title = 'Load update', text = '', actor = 'system', level = 'info') {
  enrichLoadAccountLinks(db, load);
  const base = { title, text, type: title, relatedLoadId: load.id, createdBy: actor, level };
  addNotification(db, { ...base, role: 'dispatcher', relatedPage: 'loads' });
  addNotification(db, { ...base, role: 'admin', relatedPage: 'loads' });
  const actorKey = sanitizeText(actor).toLowerCase();
  const driverTargetValue = sanitizeText(load.driverEmail || load.driver).toLowerCase();
  const brokerTargetValue = sanitizeText(load.brokerEmail || load.broker).toLowerCase();
  const driverUser = (db.users || []).find(user => userReadKeys(user).includes(driverTargetValue));
  const brokerUser = (db.users || []).find(user => userReadKeys(user).includes(brokerTargetValue));
  const actorIsDriverTarget = driverUser ? userReadKeys(driverUser).includes(actorKey) : actorKey === driverTargetValue;
  const actorIsBrokerTarget = brokerUser ? userReadKeys(brokerUser).includes(actorKey) : actorKey === brokerTargetValue;
  if ((load.driverEmail || load.driver) && !actorIsDriverTarget) addNotification(db, { ...base, target: load.driverEmail || '', targetName: load.driverEmail ? '' : load.driver, role: 'driver', relatedPage: 'driver-mobile' });
  if ((load.brokerEmail || load.broker) && !actorIsBrokerTarget) addNotification(db, { ...base, target: load.brokerEmail || '', targetName: load.brokerEmail ? '' : load.broker, role: 'broker', relatedPage: 'loads' });
}

function messageReadByUser(message, user) {
  if (!message || !user) return false;
  if (sanitizeText(message.userEmail).toLowerCase() === sanitizeText(user.email).toLowerCase()) return true;
  const readBy = new Set((Array.isArray(message.readBy) ? message.readBy : []).map(v => sanitizeText(v).toLowerCase()).filter(Boolean));
  return userReadKeys(user).some(key => readBy.has(key));
}

function markChatReadForUser(db, contact, user) {
  const messages = db.chats?.[contact];
  if (!Array.isArray(messages)) return 0;
  let updated = 0;
  messages.forEach(message => {
    if (sanitizeText(message.userEmail).toLowerCase() === sanitizeText(user.email).toLowerCase()) return;
    const before = Array.isArray(message.readBy) ? message.readBy.length : 0;
    const readBy = new Set((Array.isArray(message.readBy) ? message.readBy : []).map(v => sanitizeText(v).toLowerCase()).filter(Boolean));
    userReadKeys(user).forEach(key => readBy.add(key));
    message.readBy = [...readBy];
    if (message.readBy.length !== before) updated += 1;
  });
  return updated;
}

function decorateChatsForUser(chats, user) {
  const out = {};
  Object.entries(chats || {}).forEach(([contact, messages]) => {
    out[contact] = (Array.isArray(messages) ? messages : []).map(message => ({ ...message, read: messageReadByUser(message, user), unread: !messageReadByUser(message, user) }));
  });
  return out;
}

function findDriverForUser(db, user) {
  if (!user) return null;
  return db.drivers.find(driver => sanitizeText(driver.email).toLowerCase() === sanitizeText(user.email).toLowerCase())
    || db.drivers.find(driver => sanitizeText(driver.name).toLowerCase() === sanitizeText(user.name).toLowerCase())
    || null;
}

function parseLoadNumber(value) {
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function filterChatsForUser(db, user) {
  const filtered = {};
  chatDirectoryForUser(db, user).forEach(entry => {
    filtered[entry.key] = Array.isArray(db.chats?.[entry.key]) ? db.chats[entry.key] : [];
  });
  return decorateChatsForUser(filtered, user);
}


function addActivity(db, data = {}) {
  const activity = prepareRecord('activities', {
    id: data.id || makeId('act'),
    loadId: sanitizeText(data.loadId || data.load || ''),
    title: sanitizeText(data.title || data.action || 'Activity'),
    text: sanitizeText(data.text || data.message || ''),
    type: sanitizeText(data.type || 'activity'),
    actor: sanitizeText(data.actor || data.createdBy || 'system'),
    createdBy: sanitizeText(data.createdBy || data.actor || 'system')
  });
  db.activities.unshift(activity);
  db.activities = db.activities.slice(0, 1500);
  return activity;
}

function loadVisibleToUser(db, user, load = {}) {
  if (!user || !load) return false;
  if (isDispatcherOrAdmin(user)) return true;
  if (user.role === 'driver') {
    const ownDrivers = db.drivers.filter(driver => matchesUserNameOrEmail(driver, user));
    const driverNames = new Set([sanitizeText(user.name).toLowerCase(), ...ownDrivers.map(d => sanitizeText(d.name).toLowerCase())].filter(Boolean));
    return driverNames.has(sanitizeText(load.driver).toLowerCase()) || sanitizeText(load.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase();
  }
  if (user.role === 'broker') {
    const brokerNames = brokerNamesForUser(db, user);
    return brokerNames.has(sanitizeText(load.broker).toLowerCase()) || brokerNames.has(sanitizeText(load.brokerEmail).toLowerCase());
  }
  return false;
}

function visibleLoadIds(db, user) {
  return new Set(db.loads.filter(load => loadVisibleToUser(db, user, load)).map(load => String(load.id)));
}

function sanitizeLoadForUser(load, user) {
  const out = { ...load };
  if (!isDispatcherOrAdmin(user)) {
    delete out.internalNotes;
    delete out.createdBy;
  }
  if (user?.role === 'broker') {
    delete out.driverPhone;
    delete out.driverEmail;
  }
  // Financial breakdown (cut %, cut amount, net profit) is dispatch/admin only.
  if (!isDispatcherOrAdmin(user)) {
    delete out.cutPercent;
    delete out.cutAmount;
    delete out.netProfit;
    delete out.otherCosts;
  }
  return out;
}

function docVisibleToUser(db, user, doc = {}) {
  if (isDispatcherOrAdmin(user)) return true;
  const load = db.loads.find(item => String(item.id) === String(doc.load || doc.loadId));
  if (load && loadVisibleToUser(db, user, load)) return true;
  if (user.role === 'driver') return sanitizeText(doc.driver).toLowerCase() === sanitizeText(user.name).toLowerCase() || sanitizeText(doc.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase();
  if (user.role === 'broker') {
    const brokerNames = brokerNamesForUser(db, user);
    return brokerNames.has(sanitizeText(doc.broker).toLowerCase());
  }
  return false;
}


function normalizeDocumentType(value = '') {
  const clean = sanitizeText(value).toLowerCase();
  if (clean.includes('confirmation') || clean.includes('rate con')) return 'confirmation';
  if (clean === 'bol' || clean.includes('bill of lading')) return 'bol';
  if (clean === 'pod' || clean.includes('proof of delivery')) return 'pod';
  return clean;
}
function approvedDocumentForLoad(db, loadId, type) {
  return (db.docs || []).find(doc => String(doc.load || doc.loadId || '') === String(loadId) && normalizeDocumentType(doc.type) === type && sanitizeText(doc.status).toLowerCase() === 'approved');
}
function loadFullyConfirmed(db, load = {}) {
  const terminal = ['delivered','completed','closed'].includes(sanitizeText(load.status).toLowerCase());
  return terminal && Boolean(approvedDocumentForLoad(db, load.id, 'bol')) && Boolean(approvedDocumentForLoad(db, load.id, 'pod'));
}
function blockingLoadForDriver(db, driverName = '', driverEmail = '', excludeLoadId = '') {
  const name = sanitizeText(driverName).toLowerCase();
  const email = sanitizeText(driverEmail).toLowerCase();
  return (db.loads || []).find(load => String(load.id) !== String(excludeLoadId) && ((name && sanitizeText(load.driver).toLowerCase() === name) || (email && sanitizeText(load.driverEmail).toLowerCase() === email)) && !loadFullyConfirmed(db, load));
}
function pdfEscape(value = '') { return String(value || '').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]+/g, ' '); }
function readPngForPdf(filePath) {
  const png = fs.readFileSync(filePath);
  if (png.slice(1, 4).toString() !== 'PNG') throw new Error('Invalid PNG logo.');
  let offset = 8, width = 0, height = 0, bitDepth = 8, colorType = 2;
  const idat = [];
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.slice(offset + 4, offset + 8).toString('ascii');
    const data = png.slice(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (!width || !height || bitDepth !== 8 || colorType !== 2) throw new Error('JTS logo must be an 8-bit RGB PNG.');
  return { width, height, data: Buffer.concat(idat) };
}
function createConfirmationPdf(load = {}, driver = {}, instructions = '') {
  const logo = readPngForPdf(path.join(PUBLIC_DIR, 'assets', 'jts-logo.png'));
  const displayWidth = 150;
  const displayHeight = Math.round(displayWidth * logo.height / logo.width);
  const lines = [
    ['LOAD CONFIRMATION', 18, 72, 610],
    [`Load ID: ${load.id || '-'}`, 12, 72, 570],
    [`Driver: ${driver.name || load.driver || '-'}`, 12, 72, 545],
    [`Pickup: ${load.pickup || '-'}`, 12, 72, 505],
    [`Pickup date/time: ${load.pickupTime || load.pickupWindow || '-'}`, 12, 72, 480],
    [`Delivery: ${load.delivery || '-'}`, 12, 72, 440],
    [`Delivery date/time: ${load.deliveryTime || load.deliveryWindow || '-'}`, 12, 72, 415],
    [`Broker / Customer: ${load.broker || '-'}`, 12, 72, 375],
    [`Rate: ${load.rate ? '$' + load.rate : '-'}`, 12, 72, 350],
    [`Miles: ${load.miles || '-'}`, 12, 72, 325],
    [`Equipment: ${load.equipment || load.truck || '-'}`, 12, 72, 300],
    [`Instructions: ${instructions || load.notes || '-'}`, 11, 72, 250],
    [`Generated: ${new Date().toISOString()}`, 9, 72, 90]
  ];
  const content = [`q ${displayWidth} 0 0 ${displayHeight} 72 660 cm /Im1 Do Q`, ...lines.map(([text,size,x,y]) => `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(text)}) Tj ET`)].join('\n');
  const objects = [
    Buffer.from('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n'),
    Buffer.from('2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n'),
    Buffer.from('3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 4 0 R >> endobj\n'),
    Buffer.from(`4 0 obj << /Length ${Buffer.byteLength(content)} >> stream\n${content}\nendstream endobj\n`),
    Buffer.from('5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n'),
    Buffer.concat([Buffer.from(`6 0 obj << /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${logo.width} >> /Length ${logo.data.length} >> stream\n`), logo.data, Buffer.from('\nendstream endobj\n')])
  ];
  const chunks = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  let cursor = chunks[0].length;
  objects.forEach(obj => { offsets.push(cursor); chunks.push(obj); cursor += obj.length; });
  const xref = cursor;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) trailer += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  trailer += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  chunks.push(Buffer.from(trailer));
  return Buffer.concat(chunks);
}

function canApproveRejectDocs(user) {
  return isDispatcherOrAdmin(user);
}

function changedFields(before = {}, after = {}, keys = []) {
  return keys.filter(key => String(before[key] ?? '') !== String(after[key] ?? ''));
}

function visibleCollection(db, user, collection) {
  if (isAdmin(user)) {
    if (collection === 'users') return db.users.map(publicUser);
    if (collection === 'notifications') return db.notifications.filter(item => notificationVisibleToUser(item, user)).map(item => decorateNotificationForUser(item, user));
    if (collection === 'loads') return db.loads.map(load => sanitizeLoadForUser(load, user));
    return db[collection];
  }

  if (user?.role === 'dispatcher') {
    if (collection === 'users') return db.users.filter(item => item.role !== 'admin').map(publicUser);
    if (collection === 'notifications') return db.notifications.filter(item => notificationVisibleToUser(item, user)).map(item => decorateNotificationForUser(item, user));
    if (collection === 'auditLog') return [];
    if (collection === 'loads') return db.loads.map(load => sanitizeLoadForUser(load, user));
    return db[collection];
  }

  if (collection === 'users') {
    return db.users.filter(item => item.id === user.id || item.role === 'dispatcher').map(publicUser);
  }

  if (user.role === 'driver') {
    const ownDrivers = db.drivers.filter(driver => matchesUserNameOrEmail(driver, user));
    const driverNames = new Set([sanitizeText(user.name).toLowerCase(), ...ownDrivers.map(d => sanitizeText(d.name).toLowerCase())].filter(Boolean));
    const ownLoads = db.loads.filter(load => loadVisibleToUser(db, user, load));
    const loadIds = new Set(ownLoads.map(load => String(load.id)));

    if (collection === 'drivers') return ownDrivers;
    if (collection === 'loads') return ownLoads.map(load => sanitizeLoadForUser(load, user));
    if (collection === 'fleet') return db.fleet.filter(unit => driverNames.has(sanitizeText(unit.driver).toLowerCase()) || ownLoads.some(load => sanitizeText(load.truck).toLowerCase() === sanitizeText(unit.unit).toLowerCase()));
    if (collection === 'docs') return db.docs.filter(doc => docVisibleToUser(db, user, doc));
    if (collection === 'notifications') return db.notifications.filter(item => notificationVisibleToUser(item, user)).map(item => decorateNotificationForUser(item, user));
    if (collection === 'locations') return db.locations.filter(item => sanitizeText(item.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase() || driverNames.has(sanitizeText(item.driver).toLowerCase())).slice(0, 150);
    if (collection === 'hosLogs') return db.hosLogs.filter(item => sanitizeText(item.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase() || driverNames.has(sanitizeText(item.driver).toLowerCase())).slice(0, 150);
    if (collection === 'activities') return db.activities.filter(item => loadIds.has(String(item.loadId || item.load))).slice(0, 250);
    if (collection === 'reminders') return db.reminders.filter(item => sanitizeText(item.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase() || driverNames.has(sanitizeText(item.driverName).toLowerCase()));
    if (collection === 'docFolders') return db.docFolders.filter(item => sanitizeText(item.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase() || driverNames.has(sanitizeText(item.driverName).toLowerCase()));
    if (collection === 'driverPayAdjustments') return db.driverPayAdjustments.filter(item => sanitizeText(item.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase() || driverNames.has(sanitizeText(item.driverName).toLowerCase()));
    if (collection === 'intake') return [];
    if (collection === 'auditLog' || collection === 'brokers') return [];
  }

  if (user.role === 'broker') {
    const brokerNames = brokerNamesForUser(db, user);
    const ownBrokers = db.brokers.filter(broker => brokerNames.has(sanitizeText(broker.company).toLowerCase()) || brokerNames.has(sanitizeText(broker.contact).toLowerCase()) || brokerNames.has(sanitizeText(broker.email).toLowerCase()));
    const ownLoads = db.loads.filter(load => loadVisibleToUser(db, user, load));
    const loadIds = new Set(ownLoads.map(load => String(load.id)));

    if (collection === 'brokers') return ownBrokers;
    if (collection === 'loads') return ownLoads.map(load => sanitizeLoadForUser(load, user));
    if (collection === 'docs') return db.docs.filter(doc => docVisibleToUser(db, user, doc));
    if (collection === 'notifications') return db.notifications.filter(item => notificationVisibleToUser(item, user)).map(item => decorateNotificationForUser(item, user));
    if (collection === 'activities') return db.activities.filter(item => loadIds.has(String(item.loadId || item.load))).slice(0, 250);
    if (collection === 'drivers' || collection === 'fleet' || collection === 'locations' || collection === 'hosLogs' || collection === 'auditLog' || collection === 'intake' || collection === 'reminders' || collection === 'docFolders' || collection === 'driverPayAdjustments') return [];
  }

  return [];
}

function filteredDb(db, user) {
  const output = emptyDb();
  output.company = db.company;
  output.users = visibleCollection(db, user, 'users');
  output.loads = visibleCollection(db, user, 'loads');
  output.drivers = visibleCollection(db, user, 'drivers');
  output.fleet = visibleCollection(db, user, 'fleet');
  output.brokers = visibleCollection(db, user, 'brokers');
  output.docs = visibleCollection(db, user, 'docs');
  output.notifications = visibleCollection(db, user, 'notifications');
  output.activities = visibleCollection(db, user, 'activities');
  output.locations = visibleCollection(db, user, 'locations');
  output.hosLogs = visibleCollection(db, user, 'hosLogs');
  output.intake = visibleCollection(db, user, 'intake');
  output.auditLog = visibleCollection(db, user, 'auditLog');
  output.reminders = visibleCollection(db, user, 'reminders');
  output.docFolders = visibleCollection(db, user, 'docFolders');
  output.driverPayAdjustments = visibleCollection(db, user, 'driverPayAdjustments');
  output.chats = filterChatsForUser(db, user);
  output.chatDirectory = chatDirectoryForUser(db, user);
  return output;
}

function canPostCollection(user, collection, body = {}, db = null) {
  if (!user || collection === 'auditLog' || collection === 'intake' || collection === 'activities') return false;
  if (['loads', 'drivers', 'fleet', 'brokers'].includes(collection)) return isDispatcherOrAdmin(user);
  if (collection === 'hosLogs') return isDispatcherOrAdmin(user);
  if (collection === 'locations') return Boolean(user);
  if (collection === 'notifications') {
    const target = sanitizeText(body.target || body.targetEmail || body.targetUserId || body.targetName || '');
    const targetRole = sanitizeText(body.role || body.targetRole || '').toLowerCase();
    const hasValidAudience = Boolean(target) || allowedRoles.has(targetRole);
    if (!hasValidAudience) return false;
    if (isDispatcherOrAdmin(user)) return true;
    return !target && targetRole === 'dispatcher';
  }
  if (collection === 'docs') {
    if (isDispatcherOrAdmin(user)) return true;
    if (!db) return false;
    const loadId = sanitizeText(body.load || body.loadId || '');
    const load = db.loads.find(item => String(item.id) === String(loadId));
    if (load && loadVisibleToUser(db, user, load)) return true;
    // Personal / Operational documents (Documents Hub) are not tied to a load; a driver may upload their own.
    if (user.role === 'driver' && !loadId) return true;
    return false;
  }
  if (collection === 'reminders') return isDispatcherOrAdmin(user);
  if (collection === 'docFolders') return isDispatcherOrAdmin(user);
  if (collection === 'driverPayAdjustments') return isDispatcherOrAdmin(user);
  return false;
}

function canPatchRecord(db, user, collection, record, body) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (user.role === 'dispatcher') {
    if (collection === 'auditLog' || collection === 'intake') return false;
    return true;
  }
  if (collection === 'loads' && user.role === 'driver') {
    const assignedToDriver = loadVisibleToUser(db, user, record);
    const allowedFields = new Set(['status', 'updatedAt']);
    return assignedToDriver && Object.keys(body).every(key => allowedFields.has(key));
  }
  if (collection === 'docs') {
    if (!docVisibleToUser(db, user, record)) return false;
    const allowedFields = new Set(['status', 'updatedAt']);
    return Object.keys(body).every(key => allowedFields.has(key)) && !['Approved', 'Rejected'].includes(sanitizeText(body.status));
  }
  if (collection === 'reminders' && user.role === 'driver') {
    const ownsIt = sanitizeText(record.driverEmail).toLowerCase() === sanitizeText(user.email).toLowerCase() || sanitizeText(record.driverName).toLowerCase() === sanitizeText(user.name).toLowerCase();
    if (!ownsIt) return false;
    const allowedFields = new Set(['status', 'proofDocId', 'proofUrl', 'filename', 'submittedAt', 'updatedAt']);
    return Object.keys(body).every(key => allowedFields.has(key)) && !['Approved', 'Declined'].includes(sanitizeText(body.status));
  }
  if (collection === 'notifications') return notificationVisibleToUser(record, user);
  return false;
}

function canDeleteRecord(user, collection) {
  return isAdmin(user) && collection !== 'auditLog';
}

function parseMultipart(buffer, boundary) {
  const fields = {};
  const files = [];
  const delimiter = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(delimiter);

  while (start !== -1) {
    start += delimiter.length;
    if (buffer[start] === 45 && buffer[start + 1] === 45) break;
    if (buffer[start] === 13 && buffer[start + 1] === 10) start += 2;

    const next = buffer.indexOf(delimiter, start);
    if (next === -1) break;
    let part = buffer.slice(start, next);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);

    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const header = part.slice(0, headerEnd).toString('utf8');
      const body = part.slice(headerEnd + 4);
      const nameMatch = /name="([^"]+)"/i.exec(header);
      const fileMatch = /filename="([^"]*)"/i.exec(header);
      const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(header);
      const name = nameMatch ? nameMatch[1] : '';
      if (name) {
        if (fileMatch && fileMatch[1]) {
          files.push({ name, filename: sanitizeFilename(fileMatch[1]), contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream', data: body });
        } else {
          fields[name] = body.toString('utf8').trim();
        }
      }
    }
    start = next;
  }

  return { fields, files };
}


function normalizeWhitespace(value) {
  return String(value || '').replace(/\r/g, '\n').replace(/[\t\f\v]+/g, ' ').replace(/\u0000/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/[ ]{2,}/g, ' ').trim();
}

function printableTextFromBuffer(buffer) {
  return normalizeWhitespace(buffer.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+/g, ' '));
}

function decodePdfLiteral(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (ch === '\\') {
      const next = value[++i] || '';
      if (next === 'n') out += '\n';
      else if (next === 'r') out += '\r';
      else if (next === 't') out += '\t';
      else if (next === 'b') out += '\b';
      else if (next === 'f') out += '\f';
      else if (/[0-7]/.test(next)) {
        let oct = next;
        for (let j = 0; j < 2 && /[0-7]/.test(value[i + 1] || ''); j += 1) oct += value[++i];
        out += String.fromCharCode(parseInt(oct, 8));
      } else out += next;
    } else {
      out += ch;
    }
  }
  return out;
}

function pdfStringsFromText(text) {
  const strings = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '(') continue;
    let depth = 1;
    let value = '';
    i += 1;
    for (; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '\\') {
        value += ch + (text[i + 1] || '');
        i += 1;
        continue;
      }
      if (ch === '(') depth += 1;
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
      value += ch;
    }
    const decoded = decodePdfLiteral(value);
    if (decoded && /[A-Za-z0-9]/.test(decoded)) strings.push(decoded);
  }
  return strings;
}

function extractPdfText(buffer) {
  const chunks = [];
  const rawText = buffer.toString('latin1');
  chunks.push(...pdfStringsFromText(rawText));

  const streamMarker = Buffer.from('stream');
  const endMarker = Buffer.from('endstream');
  let start = buffer.indexOf(streamMarker);
  while (start !== -1) {
    const headerStart = Math.max(0, start - 1800);
    const header = buffer.slice(headerStart, start).toString('latin1');
    let dataStart = start + streamMarker.length;
    if (buffer[dataStart] === 13 && buffer[dataStart + 1] === 10) dataStart += 2;
    else if (buffer[dataStart] === 10) dataStart += 1;
    const end = buffer.indexOf(endMarker, dataStart);
    if (end === -1) break;
    const streamData = buffer.slice(dataStart, end);
    if (/FlateDecode/i.test(header)) {
      try {
        const inflated = zlib.inflateSync(streamData);
        const inflatedText = inflated.toString('latin1');
        chunks.push(...pdfStringsFromText(inflatedText));
        chunks.push(inflatedText.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' '));
      } catch (error) {
        try {
          const inflated = zlib.inflateRawSync(streamData);
          const inflatedText = inflated.toString('latin1');
          chunks.push(...pdfStringsFromText(inflatedText));
          chunks.push(inflatedText.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' '));
        } catch (innerError) {
          // Keep processing other streams; some PDFs use filters that are intentionally unsupported here.
        }
      }
    }
    start = buffer.indexOf(streamMarker, end + endMarker.length);
  }

  chunks.push(rawText.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' '));
  return normalizeWhitespace(chunks.join('\n'));
}

function stripMarkup(text) {
  return normalizeWhitespace(String(text || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function extractTextFromDocument(file) {
  const ext = path.extname(file.filename || '').toLowerCase();
  if (ext === '.pdf' || /pdf/i.test(file.contentType || '')) return extractPdfText(file.data);
  if (['.docx', '.xlsx', '.pptx'].includes(ext) || /officedocument/i.test(file.contentType || '')) return extractZipOfficeText(file.data);
  if (['.txt', '.csv', '.rtf'].includes(ext) || /text|csv|rtf/i.test(file.contentType || '')) return printableTextFromBuffer(file.data);
  if (['.html', '.htm'].includes(ext) || /html/i.test(file.contentType || '')) return stripMarkup(file.data.toString('utf8'));
  return printableTextFromBuffer(file.data);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) return sanitizeText(match[1].replace(/[;|]+$/g, ''));
  }
  return '';
}

function lineValue(text, labels) {
  const lines = normalizeWhitespace(text).split('\n').map(line => line.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const label of labels) {
      const sameLine = new RegExp(`\\b${label}\\b\\s*(?:#|no\\.?|number)?\\s*[:\\-]\\s*(.+)$`, 'i').exec(line);
      if (sameLine && sameLine[1]) return sanitizeText(sameLine[1].slice(0, 90));
      const labelOnly = new RegExp(`^\\s*${label}\\s*(?:#|no\\.?|number)?\\s*[:\\-]?\\s*$`, 'i').test(line);
      if (labelOnly && lines[i + 1]) return sanitizeText(lines[i + 1].slice(0, 90));
    }
  }
  return '';
}

function parseMoney(value) {
  const clean = sanitizeText(value).replace(/[^0-9.]/g, '');
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function parseNumber(value) {
  const clean = sanitizeText(value).replace(/[^0-9.]/g, '');
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}


function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .trim();
}

function normalizeExternalUrl(value) {
  const clean = decodeHtmlAttribute(value).replace(/^['"]+|['"]+$/g, '').trim();
  if (!/^https?:\/\//i.test(clean)) return '';
  try { return new URL(clean).toString(); } catch (error) { return ''; }
}

function extractIframeInfo(text) {
  const source = String(text || '');
  const iframeMatch = /<iframe\b[\s\S]*?\bsrc\s*=\s*(["'])(.*?)\1[\s\S]*?>/i.exec(source);
  const src = iframeMatch ? normalizeExternalUrl(iframeMatch[2]) : '';
  const html = iframeMatch && src ? iframeMatch[0].slice(0, 2500) : '';
  return { src, html };
}

function extractGpsLink(text) {
  const source = String(text || '');
  const iframe = extractIframeInfo(source);
  if (iframe.src) return { gpsUrl: iframe.src, gpsIframeUrl: iframe.src, gpsIframeHtml: iframe.html };
  const urlMatches = source.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  const preferred = urlMatches.find(url => /gps|track|tracking|map|maps|location|samsara|motive|keeptruckin|geotab|verizonconnect|fleet|eld/i.test(url)) || '';
  const url = normalizeExternalUrl(preferred.replace(/[),.;]+$/g, ''));
  return { gpsUrl: url, gpsIframeUrl: '', gpsIframeHtml: '' };
}

function dateRegexSource() {
  return '(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{4}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}|(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*[, ]+\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?\\s+\\d{1,2},?\\s+\\d{2,4})';
}

function timeRegexSource() {
  return '(?:\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm)?|\\b\\d{3,4}\\s*(?:AM|PM|am|pm)?\\b|\\d{1,2}\\s*(?:AM|PM|am|pm))';
}

function cleanTimingValue(value) {
  return sanitizeText(value)
    .replace(/\s+/g, ' ')
    .replace(/^[#:\-\s@]+/, '')
    .replace(/[;|]+$/g, '')
    .slice(0, 120);
}

function firstRegexValue(text, patterns) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) return cleanTimingValue(match[1]);
  }
  return '';
}

function extractTimingBlock(text, kind = 'pickup') {
  const source = normalizeWhitespace(text || '');
  const lines = source.split('\n').map(line => line.trim()).filter(Boolean);
  const dateRe = dateRegexSource();
  const clock = '(?:\\d{1,2}:\\d{2}\\s*(?:AM|PM|am|pm|A\\.?M\\.?|P\\.?M\\.?)?|\\d{1,2}\\s*(?:AM|PM|am|pm|A\\.?M\\.?|P\\.?M\\.?)|\\b(?:[01]?\\d|2[0-3])[0-5]\\d\\b)';
  const windowRe = `${clock}(?:\\s*(?:-|–|—|to|until|till|thru|through)\\s*${clock})?`;
  const ownLabel = kind === 'delivery'
    ? /\b(?:delivery|deliver|deliver\s*to|drop|drop\s*off|dropoff|del\.?|destination|receiver|consignee|ship\s*to|unload|unload\s*at|appt\.?\s*del)\b/i
    : /\b(?:pickup|pick\s*up|pick-up|pu\.?|p\s*\/\s*u|origin|shipper|ship\s*from|load\s*at|appt\.?\s*pu)\b/i;
  const otherMain = kind === 'delivery'
    ? /\b(?:pickup|pick\s*up|pick-up|origin|shipper|ship\s*from|load\s*at)\b\s*[:\-]?/i
    : /\b(?:delivery|deliver\s*to|destination|receiver|consignee|ship\s*to|drop|drop\s*off|unload\s*at)\b\s*[:\-]?/i;
  const timeHint = /\b(?:date|time|appt|appointment|window|hours|schedule|scheduled)\b/i;

  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!ownLabel.test(lines[i])) continue;
    const part = [];
    for (let j = i; j < Math.min(lines.length, i + 8); j += 1) {
      const line = lines[j];
      if (j > i && otherMain.test(line) && !timeHint.test(line)) break;
      part.push(line);
    }
    blocks.push(part.join('  '));
  }

  const genericPickupLabels = ['pickup', 'pick up', 'pick-up', 'p/u', 'pu', 'origin', 'shipper', 'ship from', 'load at'];
  const genericDeliveryLabels = ['delivery', 'deliver to', 'destination', 'consignee', 'receiver', 'ship to', 'drop', 'drop off', 'unload at'];
  const ownWords = kind === 'delivery' ? genericDeliveryLabels : genericPickupLabels;
  const otherWords = kind === 'delivery' ? genericPickupLabels : genericDeliveryLabels;
  const ownSource = ownWords.map(regexEscape).join('|');
  const otherSource = otherWords.map(regexEscape).join('|');
  const ownToOther = new RegExp(`(?:${ownSource})[\\s\\S]{0,320}?(?=(?:${otherSource})\\b|$)`, 'i').exec(source);
  if (ownToOther && ownToOther[0]) blocks.push(ownToOther[0].replace(/\n/g, '  '));

  blocks.push(source.replace(/\n/g, '  '));

  for (const block of blocks) {
    const date = firstRegexValue(block, [
      new RegExp(`(?:date|appt|appointment|scheduled|schedule|pu|del|pickup|delivery)[^\\n]{0,70}?(${dateRe})`, 'i'),
      new RegExp(`(${dateRe})`, 'i')
    ]);
    const blockWithoutDates = block.replace(new RegExp(dateRe, 'gi'), ' ');
    const apptWindow = firstRegexValue(blockWithoutDates, [
      new RegExp(`(?:time|appt|appointment|window|hours|scheduled|schedule)[^0-9A-Za-z]{0,30}(${windowRe})`, 'i'),
      new RegExp(`(?:at|@)\\s*(${windowRe})`, 'i'),
      new RegExp(`(${windowRe})`, 'i')
    ]);
    if (date || apptWindow) {
      return {
        date,
        window: apptWindow,
        combined: cleanTimingValue([date, apptWindow].filter(Boolean).join(' '))
      };
    }
  }
  return { date: '', window: '', combined: '' };
}

function combineDateWindow(date, window) {
  return cleanTimingValue([date, window].filter(Boolean).join(' '));
}

function buildDirectionsUrl(pickup, delivery) {
  const origin = sanitizeText(pickup);
  const destination = sanitizeText(delivery);
  if (!origin && !destination) return '';
  const params = new URLSearchParams();
  if (origin) params.set('api', '1'), params.set('origin', origin);
  if (destination) params.set('destination', destination);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function inferDocumentType(filename, text) {
  const haystack = `${filename}\n${text}`.toLowerCase();
  if (/rate\s*confirmation|carrier\s*confirmation|load\s*tender|rate\s*con/.test(haystack)) return 'Rate confirmation';
  if (/\bpod\b|proof\s*of\s*delivery|delivery\s*receipt/.test(haystack)) return 'POD';
  if (/\bbol\b|bill\s*of\s*lading|b\/l/.test(haystack)) return 'BOL';
  if (/fuel|diesel|receipt/.test(haystack)) return 'Fuel receipt';
  return 'Operational document';
}

function cleanLoadId(value) {
  const clean = sanitizeText(value)
    .replace(/\.(pdf|txt|csv|docx?|xlsx?|rtf|html?)$/i, '')
    .replace(/^[#:\-\s]+/, '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 40);
  if (!clean || /^(number|no|date|rate|amount|pickup|delivery|dispatch|truck|trailer)$/i.test(clean)) return '';
  return clean;
}

function sanitizeExternalUrl(value) {
  const raw = decodeXmlEntities(sanitizeText(value)).replace(/^['"]+|['"]+$/g, '');
  if (!raw || raw.length > 1200) return '';
  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (error) {
    return '';
  }
}

function extractIframeSrc(text) {
  const raw = decodeXmlEntities(String(text || ''));
  const iframe = /<iframe\b[^>]*(?:src|data-src)\s*=\s*["']([^"']+)["'][^>]*>/i.exec(raw);
  if (iframe && iframe[1]) return sanitizeExternalUrl(iframe[1]);
  const loose = /\biframe\b[\s\S]{0,240}?(https?:\/\/[^\s"'<>]+)/i.exec(raw);
  return loose && loose[1] ? sanitizeExternalUrl(loose[1]) : '';
}

function extractLiveGpsUrl(text) {
  const source = decodeXmlEntities(String(text || ''));
  const iframeUrl = extractIframeSrc(source);
  if (iframeUrl) return iframeUrl;
  const urls = source.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  const cleaned = urls.map(url => sanitizeExternalUrl(url.replace(/[),.;]+$/g, ''))).filter(Boolean);
  const gpsWords = /(gps|tracking|track|location|map|maps|iframe|samsara|motive|keeptruckin|geotab|fleet|eld|hos|route)/i;
  return cleaned.find(url => gpsWords.test(url)) || '';
}

function hostLabel(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch (error) {
    return '';
  }
}

function regexEscape(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanAddressValue(value) {
  const clean = cleanDocumentValue(value)
    .replace(/\b(?:date|time|appt|appointment|ref|reference|phone|email)\b.*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return clean.slice(0, 180);
}

function buildPattern(labels, suffix) {
  return new RegExp(`\\b(?:${labels.join('|')})\\b${suffix}`, 'i');
}

function extractSchedule(flat, labels) {
  const date = '(?:\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{4}[\\/.-]\\d{1,2}[\\/.-]\\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?\\s+\\d{1,2},?\\s+\\d{2,4})';
  const clock = '(?:\\d{1,2}:\\d{2}\\s*(?:AM|PM|A\\.?M\\.?|P\\.?M\\.?)?|\\d{1,2}\\s*(?:AM|PM|A\\.?M\\.?|P\\.?M\\.?)|(?:[01]?\\d|2[0-3])[0-5]\\d)';
  const window = `(?:${clock})\\s*(?:-|to|until|till)\\s*(?:${clock})`;
  const dateValue = firstMatch(flat, [
    buildPattern(labels, `[^\\n]{0,80}?(?:date|day|appt|appointment|time)?[^A-Za-z0-9]{0,12}(${date})`),
    buildPattern(labels, `[^\\n]{0,120}?(${date})`)
  ]);
  const windowValue = firstMatch(flat, [
    buildPattern(labels, `[^\\n]{0,100}?(?:window|hours|appt|appointment|time)[^A-Za-z0-9]{0,12}(${window})`),
    buildPattern(labels, `[^\\n]{0,120}?(${window})`)
  ]);
  const timeValue = firstMatch(flat, [
    buildPattern(labels, `[^\\n]{0,80}?(?:time|appt|appointment)[^A-Za-z0-9]{0,12}(${clock})`),
    buildPattern(labels, `[^\\n]{0,50}?(?:at|@)\\s*(${clock})`)
  ]);
  const appointment = windowValue || timeValue;
  const combined = [dateValue, appointment].filter(Boolean).join(' · ');
  return { date: dateValue, appointment, window: windowValue, time: combined || dateValue || appointment };
}

function extractLoadFields(text, filename = '', company = {}) {
  const normalized = normalizeWhitespace(text || '');
  const filenameText = sanitizeText(filename).replace(/\.(pdf|txt|csv|docx?|xlsx?|rtf|html?)$/i, '').replace(/[._-]+/g, ' ');
  const flat = normalized.replace(/\n/g, '  ');
  const fileFlat = filenameText.replace(/\n/g, '  ');
  const fullText = normalizeWhitespace(`${filenameText}\n${normalized}`);
  const fields = {};

  fields.loadId = cleanLoadId(firstMatch(flat, [
    /\b(?:load|shipment|order|trip|pro|dispatch|ref(?:erence)?|bol|b\/l|confirmation|tender)\b\s*(?:#|no\.?|number|id)?\s*[:\-]?\s*((?:JTS|ITS|RC|BOL|PO|PRO)?[-\s#:]?[A-Z0-9][A-Z0-9._-]{2,39})/i,
    /\b(?:load|shipment|order|trip|pro|dispatch|ref(?:erence)?|bol|b\/l|confirmation|tender)\b\s*[:\-]\s*((?:JTS|ITS|RC|BOL|PO|PRO)?[-\s#:]?[A-Z0-9][A-Z0-9._-]{2,39})/i,
    /\b((?:JTS|ITS|RC|BOL|PO|PRO)[-\s#:]?[A-Z0-9][A-Z0-9._-]{3,39})\b/i
  ]));
  if (!fields.loadId) {
    fields.loadId = cleanLoadId(firstMatch(fileFlat, [
      /(?:load|shipment|order|trip|pro|bol|rc|po)\s*([A-Z0-9][A-Z0-9._-]{2,39})/i,
      /\b((?:JTS|ITS|RC|BOL|PO|PRO)[-\s#:]?[A-Z0-9][A-Z0-9._-]{3,39})\b/i
    ]));
  }

  fields.broker = lineValue(normalized, ['Broker', 'Customer', 'Bill To', 'Bill-To', '3PL', 'Dispatch', 'Dispatcher', 'Logistics Company']) || firstMatch(flat, [/(?:broker|customer|bill\s*to|3pl|logistics\s*company)\s*[:\-]\s*([A-Za-z0-9 &.,'-]{3,100})/i]);
  fields.pickup = lineValue(normalized, ['Pickup', 'Pick up', 'Origin', 'Shipper', 'Ship From', 'PU', 'P/U', 'Pickup Location', 'Pickup Address', 'Load At']) || firstMatch(flat, [/(?:pickup|pick\s*up|origin|shipper|ship\s*from|load\s*at)\s*(?:location|address|city)?\s*[:\-]\s*([A-Za-z0-9 ,.#'\/\-&]{3,120})/i]);
  fields.delivery = lineValue(normalized, ['Delivery', 'Deliver To', 'Destination', 'Consignee', 'Ship To', 'Receiver', 'Drop', 'Drop Off', 'Delivery Location', 'Delivery Address', 'Unload At']) || firstMatch(flat, [/(?:delivery|deliver\s*to|destination|consignee|ship\s*to|receiver|drop|drop\s*off|unload\s*at)\s*(?:location|address|city)?\s*[:\-]\s*([A-Za-z0-9 ,.#'\/\-&]{3,120})/i]);

  const pickupTiming = extractTimingBlock(fullText, 'pickup');
  const deliveryTiming = extractTimingBlock(fullText, 'delivery');
  fields.pickupDate = pickupTiming.date;
  fields.pickupWindow = pickupTiming.window;
  fields.deliveryDate = deliveryTiming.date;
  fields.deliveryWindow = deliveryTiming.window;
  fields.pickupTime = pickupTiming.combined || firstMatch(flat, [/(?:pickup|pick\s*up|pu|p\/u)\s*(?:date|time|appt|appointment|window)?\s*[:\-]\s*([0-9A-Za-z ,\/.:\-–—@]{4,90})/i]);
  fields.deliveryTime = deliveryTiming.combined || firstMatch(flat, [/(?:delivery|drop|del|deliver)\s*(?:date|time|appt|appointment|window)?\s*[:\-]\s*([0-9A-Za-z ,\/.:\-–—@]{4,90})/i]);
  if (!fields.pickupTime) fields.pickupTime = combineDateWindow(fields.pickupDate, fields.pickupWindow);
  if (!fields.deliveryTime) fields.deliveryTime = combineDateWindow(fields.deliveryDate, fields.deliveryWindow);

  fields.driver = lineValue(normalized, ['Driver', 'Driver Name', 'Carrier Driver']) || firstMatch(flat, [/(?:driver|carrier\s*driver)\s*(?:name)?\s*[:\-]\s*([A-Za-z .'-]{3,70}?)(?=\s{2,}|truck|tractor|unit|trailer|$)/i]);
  fields.truck = lineValue(normalized, ['Truck', 'Tractor', 'Unit', 'Unit Number', 'Truck Number']) || firstMatch(flat, [/(?:truck|tractor|unit)\s*(?:#|no\.?|number)?\s*[:\-]\s*([A-Za-z0-9._-]{2,30})/i]);
  fields.trailer = lineValue(normalized, ['Trailer', 'Trailer Number', 'Trailer #']) || firstMatch(flat, [/(?:trailer)\s*(?:#|no\.?|number)?\s*[:\-]\s*([A-Za-z0-9._-]{2,30})/i]);
  fields.rate = parseMoney(firstMatch(flat, [/(?:rate|linehaul|line\s*haul|carrier\s*pay|total\s*(?:pay|amount|charges)|amount\s*due|agreed\s*rate)\s*(?:USD|\$)?\s*[:\-]?\s*\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i, /\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:total|rate|carrier)/i]));
  fields.miles = parseNumber(firstMatch(flat, [/(?:miles|mi\.?|distance|loaded\s*miles)\s*[:\-]?\s*([0-9][0-9,]*(?:\.\d+)?)/i]));
  fields.reference = firstMatch(flat, [/\b(?:reference|ref|po|purchase\s*order|bol|b\/l)\b\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]{2,60})/i]);
  fields.poNumber = firstMatch(flat, [/\b(?:po|purchase\s*order)\b\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]{2,60})/i]);
  fields.bolNumber = firstMatch(flat, [/\b(?:bol|b\/l|bill\s*of\s*lading)\b\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]{2,60})/i]);
  fields.pickupNumber = firstMatch(flat, [/\b(?:pickup|pick\s*up|pu|p\/u)\s*(?:#|no\.?|number|ref(?:erence)?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]{2,60})/i]);
  fields.deliveryNumber = firstMatch(flat, [/\b(?:delivery|deliver|del|drop)\s*(?:#|no\.?|number|ref(?:erence)?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]{2,60})/i]);
  fields.appointment = firstMatch(flat, [/\b(?:appointment|appt)\b\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]{2,50})/i]);
  fields.commodity = lineValue(normalized, ['Commodity', 'Product', 'Freight', 'Description']) || firstMatch(flat, [/(?:commodity|product|freight|description)\s*[:\-]\s*([A-Za-z0-9 ,.#'\/\-&]{3,100})/i]);
  fields.weight = firstMatch(flat, [/(?:weight|wgt)\s*[:\-]?\s*([0-9][0-9,]*(?:\.\d+)?\s*(?:lbs?|pounds?|kg)?)\b/i]);
  fields.pieces = firstMatch(flat, [/(?:pieces|pcs|pallets|plt)\s*[:\-]?\s*([0-9][0-9,]*(?:\s*(?:pcs|pieces|pallets|plt))?)/i]);
  fields.equipment = lineValue(normalized, ['Equipment', 'Equipment Type', 'Trailer Type']) || firstMatch(flat, [/(?:equipment|trailer\s*type)\s*[:\-]\s*([A-Za-z0-9 ,.#'\/\-&]{3,80})/i]);
  fields.temperature = firstMatch(flat, [/(?:temperature|temp)\s*[:\-]?\s*([\-0-9]+\s*(?:F|C|degrees?)?)/i]);
  const gps = extractGpsLink(fullText);
  fields.gpsUrl = gps.gpsUrl;
  fields.gpsIframeUrl = gps.gpsIframeUrl;
  fields.gpsIframeHtml = gps.gpsIframeHtml;
  fields.mapUrl = gps.gpsUrl || buildDirectionsUrl(fields.pickup, fields.delivery);

  Object.keys(fields).forEach(key => {
    if (typeof fields[key] === 'string') fields[key] = sanitizeText(fields[key]).slice(0, key === 'gpsIframeHtml' ? 2500 : 220);
  });

  const documentType = inferDocumentType(filename, normalized);
  const present = Object.entries(fields)
    .filter(([key, value]) => key !== 'rate' && key !== 'miles' ? Boolean(value) : Number(value) > 0)
    .map(([key]) => key);
  const confidence = Math.min(99, Math.round((present.length / 16) * 100) + (fields.pickupTime || fields.deliveryTime ? 8 : 0) + (fields.gpsUrl ? 8 : 0));
  const loadPrefix = sanitizeText(company.loadPrefix, 'JTS');
  if (!fields.loadId && (fields.pickup || fields.delivery || fields.rate || fields.reference)) fields.loadId = cleanLoadId(fields.reference) || `${loadPrefix}-${Date.now().toString().slice(-6)}`;

  return {
    documentType,
    confidence,
    fields,
    extractedKeys: present,
    textPreview: normalizeWhitespace(`${filenameText}\n${normalized}`).slice(0, 1400),
    warning: present.length < 3 ? 'Low confidence extraction. Review the load before dispatching.' : ''
  };
}


function productionDatePatternSource() {
  return String.raw`(?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2},?\s+\d{2,4})`;
}

function productionTimePatternSource() {
  return String.raw`(?:(?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|A\.?M\.?|P\.?M\.?|[A-Z]{2,4})?)`;
}

function productionCleanValue(value, maxLength = 220) {
  const clean = normalizeExtractedText(String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/^[#:\-\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim())
    .split('\n')[0]
    .trim();
  if (!clean || /^(?:-|n\/a|null|undefined)$/i.test(clean)) return '';
  if (/<<|>>|\/ProcSet|\/Font|\/XObject|endobj|xref|trailer|startxref|obj\b/i.test(clean)) return '';
  return clean.slice(0, maxLength);
}

function productionCleanLoadId(value) {
  const clean = productionCleanValue(value, 80)
    .replace(/\.(pdf|txt|csv|docx?|xlsx?|rtf|html?)$/i, '')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 48);
  if (!clean || /^(?:cSet|st|ProcSet|PDF|Type|Catalog|Pages|Page|Obj|Root|Info|Size|Resources|Contents|MediaBox|Font|XObject|Image|Length|Filter|FlateDecode|Number|No|Date|Time|Rate|Amount|Pickup|Delivery|Dispatch|Truck|Trailer)$/i.test(clean)) return '';
  return clean;
}

function productionFirstMatch(source, patterns, maxLength = 220) {
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (match && match[1]) {
      const clean = productionCleanValue(match[1], maxLength);
      if (clean) return clean;
    }
  }
  return '';
}

function productionAllMatches(source, pattern, maxLength = 120) {
  const output = [];
  let match;
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  while ((match = regex.exec(source))) {
    const clean = productionCleanValue(match[1], maxLength);
    if (clean && !output.some(item => item.toLowerCase() === clean.toLowerCase())) output.push(clean);
  }
  return output;
}

function productionLines(source) {
  return normalizeExtractedText(source || '')
    .split('\n')
    .map(line => line.replace(/\u00A0/g, ' ').trimEnd())
    .filter(line => line.trim());
}

function productionStopBlock(source, kind) {
  const lines = productionLines(source);
  const startRe = kind === 'delivery'
    ? /^\s*(?:Delivery\s*#?\d*|Delivery Address|Deliver To|Consignee|Receiver)\b/i
    : /^\s*(?:Pickup\s*#?\d*|Pickup Address|Pick\s*up|Shipper|Origin)\b/i;
  const endRe = kind === 'delivery'
    ? /^\s*(?:Pickup\s*#?\d*|All invoices|Operational Rules|Broker:|Carrier Signature|If this load)\b/i
    : /^\s*(?:Delivery\s*#?\d*|Delivery Address|All invoices|Operational Rules|Broker:)\b/i;
  const start = lines.findIndex(line => startRe.test(line));
  if (start < 0) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (endRe.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

function productionAddressFromStopBlock(block, kind) {
  const lines = productionLines(block);
  const headerRe = kind === 'delivery' ? /Delivery Address|Deliver To|Consignee|Receiver/i : /Pickup Address|Pick\s*up Address|Shipper|Origin/i;
  let start = lines.findIndex(line => headerRe.test(line));
  if (start < 0) start = lines.findIndex(line => new RegExp(kind, 'i').test(line));
  if (start < 0) start = 0;
  const address = [];
  const dateRe = new RegExp(productionDatePatternSource(), 'i');
  const timeRe = new RegExp(productionTimePatternSource(), 'i');
  for (let i = start + 1; i < Math.min(lines.length, start + 14); i += 1) {
    const rawLine = lines[i] || '';
    if (/Driver Instructions|Pickup Notes|Pickup Comments|Delivery Notes|Delivery Comments/i.test(rawLine) && address.length) break;
    let left = rawLine.split(/\s{2,}/)[0].trim();
    left = left
      .replace(/\b(?:Reference\s*#|Earliest Date\/Time|Latest Date\/Time|Appt\.?\s*Type|Commodity|Weight).*$/i, '')
      .replace(/\b(?:Paper rolls|Floor Loaded|\d[\d,]*\s*lb).*$/i, '')
      .replace(dateRe, '')
      .replace(timeRe, '')
      .trim();
    if (!left) continue;
    if (/^(?:Pickup|Delivery)\s*#?\d*$/i.test(left)) continue;
    if (/^(?:(?:Pickup|Delivery) Address|Appointment|Ref\/PO|Commodity|Weight|Reference\s*#|Earliest Date\/Time|Latest Date\/Time|Appt\.? Type|Confirmed|FCFS)$/i.test(left)) continue;
    if (dateRe.test(left) || timeRe.test(left)) continue;
    if (/^(?:Driver Instructions|Pickup Notes|Pickup Comments|Delivery Notes|Delivery Comments)/i.test(left)) break;
    if (/[A-Za-z]/.test(left) && left.length <= 120) address.push(left);
    if (address.length >= 4) break;
  }
  return productionCleanValue(address.join(', '), 220);
}

function productionFindDateTimeAfter(lines, startIndex) {
  if (startIndex < 0) return null;
  const dateRe = new RegExp(productionDatePatternSource(), 'i');
  const timeRe = new RegExp(productionTimePatternSource(), 'i');
  let date = '';
  let dateLine = -1;
  for (let i = startIndex; i < Math.min(lines.length, startIndex + 10); i += 1) {
    const match = dateRe.exec(lines[i] || '');
    if (match && match[0]) {
      date = productionCleanValue(match[0], 60);
      dateLine = i;
      break;
    }
  }
  if (!date) return null;
  let time = '';
  for (let i = dateLine; i < Math.min(lines.length, startIndex + 11); i += 1) {
    const line = String(lines[i] || '').replace(dateRe, ' ');
    const match = timeRe.exec(line);
    if (match && match[0]) {
      time = productionCleanValue(match[0].replace(/\s+/g, ' '), 40).toUpperCase();
      break;
    }
  }
  return { date, time };
}

function productionScheduleFromStopBlock(block) {
  const lines = productionLines(block);
  const earliestIndex = lines.findIndex(line => /Earliest\s+Date\/Time|Ready\s+Date|Open\s+Date|Pickup\s+Date|Delivery\s+Date/i.test(line));
  const latestIndex = lines.findIndex(line => /Latest\s+Date\/Time|Close\s+Date|Close\s+Time|Must\s+Deliver|Delivery\s+Appointment/i.test(line));
  const earliest = productionFindDateTimeAfter(lines, earliestIndex);
  const latest = productionFindDateTimeAfter(lines, latestIndex);
  if (earliest || latest) {
    const first = earliest || latest;
    const second = latest && earliest ? latest : null;
    const startPart = [first.date, first.time].filter(Boolean).join(' ');
    const endPart = second ? [second.date, second.time].filter(Boolean).join(' ') : '';
    const combined = [startPart, endPart].filter(Boolean).join(' - ');
    const date = second && second.date !== first.date ? `${first.date} - ${second.date}` : first.date;
    const window = second
      ? `${first.time || ''}${second.date && second.date !== first.date ? ` - ${second.date} ${second.time || ''}` : ` - ${second.time || ''}`}`.trim()
      : (first.time || '');
    return { date: productionCleanValue(date, 110), window: productionCleanValue(window, 140), time: productionCleanValue(combined, 180) };
  }
  const source = lines.join('  ');
  const date = productionFirstMatch(source, [new RegExp(`(${productionDatePatternSource()})`, 'i')], 80);
  const time = productionFirstMatch(source, [new RegExp(`(${productionTimePatternSource()})`, 'i')], 40).toUpperCase();
  return { date, window: time, time: productionCleanValue([date, time].filter(Boolean).join(' '), 160) };
}

function productionGenericAddress(source, kind) {
  const labels = kind === 'delivery'
    ? '(?:delivery|deliver\\s*to|destination|consignee|receiver|ship\\s*to|drop\\s*off|unload\\s*at)'
    : '(?:pickup|pick\\s*up|origin|shipper|ship\\s*from|load\\s*at)';
  return productionFirstMatch(source.replace(/\n/g, '  '), [
    new RegExp(`${labels}\\s*(?:location|address|city)?\\s*[:\\-]\\s*([A-Za-z0-9 ,.#'\\/\\-&]{3,180})`, 'i')
  ], 180);
}

function productionTruckFromFilename(filename) {
  const clean = sanitizeText(filename).replace(/\.(pdf|txt|csv|docx?|xlsx?|rtf|html?)$/i, '').replace(/[._-]+/g, ' ');
  return productionFirstMatch(clean, [/\b(?:unit|truck|tractor)\s*(?:#|no\.?|number)?\s*(\d{2,10})\b/i], 40);
}

function productionLoadIdFromFilename(filename) {
  const clean = sanitizeText(filename).replace(/\.(pdf|txt|csv|docx?|xlsx?|rtf|html?)$/i, '').replace(/[._-]+/g, ' ');
  return productionCleanLoadId(productionFirstMatch(clean, [
    /\b(?:ref|reference|load|order|shipment)\s*(?:#|no\.?|number)?\s*(\d{4,})\b/i,
    /\b(\d{6,})\b/i
  ], 60));
}


function axleFormatTime(value) {
  const raw = productionCleanValue(value, 20).replace(/[^0-9]/g, '');
  if (/^\d{4}$/.test(raw)) return `${raw.slice(0, 2)}:${raw.slice(2)}`;
  if (/^\d{3}$/.test(raw)) return `0${raw.slice(0, 1)}:${raw.slice(1)}`;
  return productionCleanValue(value, 20);
}

function axleDateTime(date, time) {
  return [productionCleanValue(date, 40), axleFormatTime(time)].filter(Boolean).join(' ');
}

function parseAxleStop(lines, kind) {
  const startRe = kind === 'delivery'
    ? /^\s*(?:S\s*\$?\s*O\s*2|S\$O2|SO\s*2|SO2|S0\s*2|Delivery|DEL)\b/i
    : /^\s*(?:PU\s*1|PU1|P\/U\s*1|Pickup)\b/i;
  const start = lines.findIndex(line => startRe.test(line));
  if (start < 0) return null;
  const window = lines.slice(start, Math.min(lines.length, start + 10));
  const first = window[0] || '';
  const addressLine = window.find(line => /\bAddress\s*:/i.test(line)) || '';
  const cityLine = window.find(line => /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line) && !/Address\s*:/i.test(line)) || '';
  const name = productionFirstMatch(first, [/\bName\s*:\s*(.+?)\s+Date\s*:/i], 120);
  const startMatch = /\bDate\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([0-9]{3,4})/i.exec(first);
  const addressMatch = /\bAddress\s*:\s*(.+?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([0-9]{3,4})\b/i.exec(addressLine);
  let city = '';
  let state = '';
  let zip = '';
  const citySource = cityLine.replace(/^.*?Contact\s*:\s*[^A-Z0-9]*[A-Za-z .'-]{0,80}?\s+(?=[A-Z][A-Z .'-]+\s+[A-Z]{2}\s+\d{5})/i, '').replace(/\s+Drvr\b.*$/i, '').trim();
  const cityMatch = /([A-Z][A-Z .'-]{1,70})\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/.exec(citySource);
  if (cityMatch) {
    city = productionCleanValue(cityMatch[1].replace(/\s+/g, ' '), 80);
    state = cityMatch[2];
    zip = cityMatch[3];
  }
  const street = addressMatch ? productionCleanValue(addressMatch[1], 120) : '';
  const startDate = startMatch ? startMatch[1] : '';
  const startTime = startMatch ? startMatch[2] : '';
  const endDate = addressMatch ? addressMatch[2] : '';
  const endTime = addressMatch ? addressMatch[3] : '';
  const address = [name, street, [city, state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const startText = axleDateTime(startDate, startTime);
  const endText = axleDateTime(endDate, endTime);
  return {
    name,
    address: productionCleanValue(address, 220),
    date: productionCleanValue(startDate || endDate, 80),
    window: productionCleanValue([axleFormatTime(startTime), axleFormatTime(endTime)].filter(Boolean).join(' - '), 100),
    time: productionCleanValue([startText, endText].filter(Boolean).join(' - '), 180)
  };
}

function applyAxleLogisticsFields(fields, normalized, filename) {
  const lines = productionLines(normalized);
  const flat = normalizeExtractedText(normalized).replace(/\n/g, ' ').replace(/\s+/g, ' ');
  const filenameLoad = productionLoadIdFromFilename(filename);
  const isAxle = /\bAXLE\s+LOGISTICS\b|\bAxle\s+Logistics\b|axlelogistics\.com/i.test(flat)
    || (/\bLoad\s+Confirmation\b/i.test(flat) && /\bCarrier\s+Freight\s+Pay\b/i.test(flat));
  if (!isAxle) return fields;

  fields.documentProvider = 'Axle Logistics';
  fields.broker = 'Axle Logistics, LLC';
  fields.loadId = productionCleanLoadId(productionFirstMatch(flat, [
    /\*{2,}\s*Load\s+Confirmation\s*\*{2,}\s*(\d{4,})/i,
    /\bLoad\s+Confirmation\s*\*{0,}\s*(\d{4,})/i,
    /\bOrder\s+Order\s*:\s*(\d{4,})\b/i,
    /\bOrder\s*:\s*(\d{4,})\b/i,
    /\bAXLL\s*[- ]\s*(\d{4,})\b/i
  ], 80)) || filenameLoad || fields.loadId;

  const pickup = parseAxleStop(lines, 'pickup');
  const delivery = parseAxleStop(lines, 'delivery');
  if (pickup?.address) fields.pickup = pickup.address;
  if (delivery?.address) fields.delivery = delivery.address;
  if (pickup?.date) fields.pickupDate = pickup.date;
  if (pickup?.window) fields.pickupWindow = pickup.window;
  if (pickup?.time) fields.pickupTime = pickup.time;
  if (delivery?.date) fields.deliveryDate = delivery.date;
  if (delivery?.window) fields.deliveryWindow = delivery.window;
  if (delivery?.time) fields.deliveryTime = delivery.time;

  fields.rate = parseMoney(productionFirstMatch(flat, [
    /\bTotal\s+Carrier\s+Pay\s*:\s*\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /\bCarrier\s+Freight\s+Pay\s*:\s*\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
  ], 80)) || fields.rate;
  fields.miles = parseNumber(productionFirstMatch(flat, [
    /\bMiles\s*:\s*([0-9][0-9,]*(?:\.\d+)?)\b/i
  ], 40)) || fields.miles;
  fields.commodity = productionFirstMatch(flat, [
    /\bCommodity\s*:\s*([A-Za-z0-9 .,'&\-\/]{2,100}?)(?:\s+Miles\s*:|\s+Weight\s*:|\s+Temp\s*:|\s+Trailer\s*:|$)/i
  ], 100) || fields.commodity;
  fields.weight = productionFirstMatch(flat, [
    /\bWeight\s*:\s*([0-9][0-9,]*(?:\.\d+)?)\b/i
  ], 60) || fields.weight;
  if (fields.weight && !/\b(?:lb|lbs|kg)\b/i.test(fields.weight)) fields.weight = `${fields.weight} lb`;
  fields.equipment = productionFirstMatch(flat, [
    /\bTrailer\s*:\s*([A-Za-z0-9 .,'&\-\/()]{2,80}?)(?:\s+BOL\s*:|\s+Reference\s*:|\s+PU\s*1|$)/i
  ], 80) || fields.equipment;
  fields.carrier = /\bJTS\s+LOGISTICS\s+INC\b/i.test(flat) ? 'JTS LOGISTICS INC' : fields.carrier;
  fields.reference = productionFirstMatch(flat, [/\bAXLL\s*[- ]\s*(\d{4,})\b/i], 80) || fields.loadId || fields.reference;
  fields.truck = productionTruckFromFilename(filename) || fields.truck;
  fields.poNumber = '';
  fields.secondaryPoNumber = '';
  fields.bolNumber = /\bBOL\s*:\s*(?:Reference|PU|SO|Payment|$)/i.test(flat) ? '' : fields.bolNumber;
  return fields;
}

function extractLoadFieldsProduction(text, filename = '', company = {}) {
  const normalized = normalizeExtractedText(text || '');
  const filenameFlat = sanitizeText(filename).replace(/[._-]+/g, ' ');
  const fields = {};

  const pickupBlock = productionStopBlock(normalized, 'pickup');
  const deliveryBlock = productionStopBlock(normalized, 'delivery');
  const pickupSchedule = productionScheduleFromStopBlock(pickupBlock || normalized);
  const deliverySchedule = productionScheduleFromStopBlock(deliveryBlock || normalized);
  const poNumbers = productionAllMatches(normalized, /\bPO\s*#\s*([A-Z0-9._\-\/]{2,60})/ig, 80);
  const stopReferences = productionAllMatches(normalized, /\bReference\s*#\s*([A-Z0-9._\-\/]{2,60})/ig, 80);

  fields.loadId = productionCleanLoadId(productionFirstMatch(normalized, [
    /\bArrive\s+Order\s*(\d{4,})\b/i,
    /reference\s+the\s+Arrive\s+order\s*(\d{4,})\b/i,
    /\b(?:load|shipment|order|trip|dispatch|tender)\s*(?:#|no\.?|number|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-]{3,})\b/i,
    /\b(?:reference|ref|confirmation|pro)\s*(?:#|no\.?|number|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-]{3,})\b/i
  ], 80)) || productionLoadIdFromFilename(filename);

  fields.broker = productionFirstMatch(normalized, [
    /^\s*Broker\s*:\s*(.+)$/mi,
    /\bBroker\s*[:\-]\s*([A-Za-z0-9 &.,'\-]{3,120})/i,
    /(DM\s+Trans,\s*LLC\s+dba\s+Arrive\s+Logistics)/i
  ], 120);
  if (!fields.broker && /Arrive\s+Logistics/i.test(normalized)) fields.broker = 'Arrive Logistics';

  fields.pickup = productionAddressFromStopBlock(pickupBlock, 'pickup') || productionGenericAddress(normalized, 'pickup');
  fields.delivery = productionAddressFromStopBlock(deliveryBlock, 'delivery') || productionGenericAddress(normalized, 'delivery');
  fields.pickupDate = pickupSchedule.date;
  fields.pickupWindow = pickupSchedule.window;
  fields.pickupTime = pickupSchedule.time;
  fields.deliveryDate = deliverySchedule.date;
  fields.deliveryWindow = deliverySchedule.window;
  fields.deliveryTime = deliverySchedule.time;

  fields.driver = productionFirstMatch(normalized, [
    /\bDriver\s+Name\s*[:\-]\s*([A-Za-z .,'\-]{3,80})/i,
    /\bCarrier\s+Driver\s*[:\-]\s*([A-Za-z .,'\-]{3,80})/i
  ], 80);
  if (/\b(cell|phone|truck|trailer|tllr|fax)\b/i.test(fields.driver)) fields.driver = '';
  fields.truck = productionFirstMatch(normalized, [
    /\bTruck\s*(?:Number|#|No\.?)\s*[:\-]\s*([A-Z0-9._\-]{2,40})/i,
    /\bTractor\s*(?:Number|#|No\.?)\s*[:\-]\s*([A-Z0-9._\-]{2,40})/i
  ], 40) || productionTruckFromFilename(filenameFlat);
  fields.trailer = productionFirstMatch(normalized, [
    /\bTrailer\s*(?:Number|#|No\.?)\s*[:\-]\s*([A-Z0-9._\-]{2,40})/i,
    /\bTllr\s*[:#\-]?\s*([A-Z0-9._\-]{2,40})/i
  ], 40);
  if (/^(?:Tllr\.?|Trailer|Type|Cell|Driver|Phone|Fax)$/i.test(fields.trailer)) fields.trailer = '';

  fields.rate = parseMoney(productionFirstMatch(normalized, [
    /\bLine\s*Haul\b[^\n$0-9]{0,30}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /\bLineHaul\b[^\n$0-9]{0,30}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /\bTotal\b[^\n$0-9]{0,30}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /\b(?:rate|carrier\s*pay|agreed\s*rate|amount)\b[^\n$0-9]{0,30}\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
  ], 60));
  fields.miles = parseNumber(productionFirstMatch(normalized, [
    /\bTotal\s+Miles\s*([0-9][0-9,]*(?:\.\d+)?)\s*Miles/i,
    /\b(?:loaded\s*miles|miles|distance)\b[^\n0-9]{0,24}([0-9][0-9,]*(?:\.\d+)?)/i
  ], 40));

  fields.poNumber = poNumbers[0] || productionFirstMatch(normalized, [/\b(?:purchase\s*order|p\.?\s*o\.?|po\b)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9._\-\/]{2,60})/i], 80);
  fields.secondaryPoNumber = poNumbers[1] || '';
  fields.bolNumber = productionFirstMatch(normalized, [/\b(?:BOL|B\/L|Bill\s*of\s*Lading)\s*#?\s*[:\-]?\s*([A-Z0-9._\-\/]{2,60})/i], 80);
  fields.shipmentId = productionFirstMatch(normalized, [/\bShipment\s*ID\s*[:\-]?\s*([A-Z0-9._\-\/]{2,60})/i], 80);
  fields.customerRef = productionFirstMatch(normalized, [/\bCustomer\s*Ref\s*#?\s*[:\-]?\s*([A-Z0-9._\-\/]{2,60})/i], 80);
  fields.reference = fields.customerRef || stopReferences[0] || fields.poNumber || fields.loadId;
  fields.pickupNumber = stopReferences[0] || productionFirstMatch(pickupBlock, [/\bReference\s*#\s*([A-Z0-9._\-\/]{2,60})/i], 80);
  fields.deliveryNumber = stopReferences[1] || productionFirstMatch(deliveryBlock, [/\bReference\s*#\s*([A-Z0-9._\-\/]{2,60})/i], 80);
  fields.appointment = productionFirstMatch(normalized, [/\bAppt\.?\s*(?:#|No\.?|Number)?\s*[:\-]?\s*([A-Z0-9._\-\/]{2,60})/i], 80);

  fields.commodity = productionFirstMatch(normalized, [
    /\bReference\s*#\s*[A-Z0-9._\-\/]+\s+([A-Za-z][A-Za-z0-9 .,'\-\/]{2,80}?)\s+[0-9][0-9,]*\s*lb/i,
    /\bCommodity\b[\s\S]{0,160}?\b(?:Reference\s*#\s*[A-Z0-9._\-\/]+\s+)?([A-Za-z][A-Za-z0-9 .,'\-\/]{2,80}?)\s+[0-9][0-9,]*\s*lb/i,
    /\b(?:Commodity|Product|Freight|Description)\s*[:\-]\s*([A-Za-z0-9 .,'\-\/]{3,100})/i
  ], 100);
  fields.weight = productionFirstMatch(normalized, [
    /\bTotal\s+Weight\s*([0-9][0-9,]*(?:\.\d+)?\s*(?:lb|lbs|pounds|kg)?)\b/i,
    /\bWeight\b[\s\S]{0,120}?([0-9][0-9,]*(?:\.\d+)?\s*(?:lb|lbs|pounds|kg))\b/i
  ], 80);
  fields.pieces = productionFirstMatch(normalized, [
    /\bTotal\s+FloorLoaded\s*([0-9][0-9,]*\s*Floor\s*Loaded)\b/i,
    /\b([0-9][0-9,]*\s*Floor\s*Loaded)\b/i,
    /\b(?:pieces|pcs|pallets|plt)\s*[:\-]?\s*([0-9][0-9,]*(?:\s*(?:pcs|pieces|pallets|plt))?)/i
  ], 80);
  fields.equipment = productionFirstMatch(normalized, [
    /\bLoad\s+EQ\s+T\s*ype\s*([^\n]{2,80})/i,
    /\bLoad\s+EQ\s+Type\s*([^\n]{2,80})/i,
    /\bEquipment\s+Requirements\s*([^\n]{2,80})/i,
    /\bEquipment\s*[:\-]?\s*([A-Za-z0-9 .,'\-\/]{2,80})/i
  ], 80).replace(/\s+(EQ\s+S\s*ize|EQ Size|Driver Requirements|Length|PO #).*$/i, '').trim();
  fields.equipmentSize = productionFirstMatch(normalized, [/\bEQ\s+Size\s*([^\n]{2,40})/i], 40);
  fields.loadMode = productionFirstMatch(normalized, [/\bLoad\s+Mode\s*([^\n]{2,40})/i], 40);
  fields.driverRequirements = productionFirstMatch(normalized, [/\bDriver\s+Requirements\s*([^\n]{2,120})/i], 120);
  fields.temperature = productionFirstMatch(normalized, [/\b(?:temperature|temp)\s*[:\-]?\s*([\-0-9]+\s*(?:F|C|degrees?)?)/i], 60);
  fields.cargoValue = productionFirstMatch(normalized, [/\bCargo\s+Value\s*\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i], 80);
  fields.carrier = productionFirstMatch(normalized, [/\bCarrier\s+([A-Z][A-Z0-9 &.,'\-]{3,100})/i], 100);

  applyAxleLogisticsFields(fields, normalized, filename);

  const gps = extractGpsLink(`${filenameFlat}\n${normalized}`);
  fields.gpsUrl = gps.gpsUrl;
  fields.gpsIframeUrl = gps.gpsIframeUrl;
  fields.gpsIframeHtml = gps.gpsIframeHtml;
  fields.mapUrl = gps.gpsUrl || buildDirectionsUrl(fields.pickup, fields.delivery);

  Object.keys(fields).forEach(key => {
    if (typeof fields[key] === 'string') fields[key] = productionCleanValue(fields[key], key === 'gpsIframeHtml' ? 2500 : 220);
  });
  fields.loadId = productionCleanLoadId(fields.loadId) || productionLoadIdFromFilename(filename);
  if (/^(?:Tllr|Trailer|Type|Cell|Driver|Phone|Fax)$/i.test(fields.truck)) fields.truck = '';
  if (!fields.truck) fields.truck = productionTruckFromFilename(filenameFlat);
  if (fields.truck && !/^\d{2,10}$|^[A-Z0-9._-]{2,40}$/i.test(fields.truck)) fields.truck = '';
  if (/^(?:Tllr\.?|Trailer|Type|Cell|Driver|Phone|Fax)$/i.test(fields.trailer)) fields.trailer = '';
  if (/^(?:Type)$/i.test(fields.appointment)) fields.appointment = '';
  if (fields.temperature && !/[0-9]/.test(fields.temperature)) fields.temperature = '';
  fields.loadMode = fields.loadMode.replace(/\s+(Driver Phone|Driver|Phone|Fax).*$/i, '').trim();
  fields.pieces = fields.pieces.replace(/FloorLoaded/ig, 'Floor Loaded').replace(/\s+/g, ' ').trim();
  fields.equipment = fields.equipment.replace(/\bV\s+an\b/i, 'Van').replace(/\s+/g, ' ').trim();
  fields.carrier = /JTS LOGISTICS INC/i.test(normalized) ? 'JTS LOGISTICS INC' : (/^(?:Truck|Carrier|Load)$/i.test(fields.carrier) ? '' : fields.carrier);
  if (!fields.loadId && (fields.pickup || fields.delivery || fields.rate || fields.reference)) {
    fields.loadId = productionCleanLoadId(fields.reference) || `${sanitizeText(company.loadPrefix, 'JTS')}-${Date.now().toString().slice(-6)}`;
  }

  const keyFields = ['loadId', 'broker', 'pickup', 'delivery', 'pickupTime', 'deliveryTime', 'rate', 'miles', 'poNumber', 'bolNumber', 'commodity', 'weight', 'truck'];
  const present = Object.entries(fields)
    .filter(([key, value]) => key !== 'rate' && key !== 'miles' ? Boolean(value) : Number(value) > 0)
    .map(([key]) => key);
  const coreScore = keyFields.reduce((score, key) => score + ((key === 'rate' || key === 'miles') ? (Number(fields[key]) > 0 ? 1 : 0) : (fields[key] ? 1 : 0)), 0);
  const confidence = Math.min(99, Math.max(0, Math.round((coreScore / keyFields.length) * 100)));
  const documentType = inferDocumentType(filename, normalized);
  const warning = (!fields.loadId || !fields.pickup || !fields.delivery || !fields.rate)
    ? 'Some important fields are missing. Review this load before dispatching.'
    : '';

  return {
    documentType,
    confidence,
    fields,
    extractedKeys: present,
    textPreview: normalizeExtractedText(`${filenameFlat}\n${normalized}`).slice(0, 1800),
    warning
  };
}

function upsertLoadFromExtraction(db, extraction, doc, user) {
  const f = extraction.fields || {};
  const hasRouteOrCommercialData = Boolean(f.pickup || f.delivery || f.broker || f.rate || f.miles || f.commodity || f.weight || f.equipment || f.gpsUrl || f.gpsIframeUrl);
  const hasMinimumLoadData = Boolean(f.loadId && hasRouteOrCommercialData);
  if (!hasMinimumLoadData) return null;
  const id = cleanLoadId(f.loadId) || `${sanitizeText(db.company.loadPrefix, 'JTS')}-${Date.now().toString().slice(-6)}`;
  const existingIndex = db.loads.findIndex(load => String(load.id).toLowerCase() === String(id).toLowerCase());
  const existing = existingIndex >= 0 ? db.loads[existingIndex] : {};
  const intakeNotes = `Auto-filled from ${doc.filename}. Extraction confidence: ${extraction.confidence}%. Review before dispatch.`;
  const payload = {
    id,
    status: existing.status || 'New',
    broker: f.broker || existing.broker || '',
    pickup: f.pickup || existing.pickup || '',
    delivery: f.delivery || existing.delivery || '',
    pickupTime: f.pickupTime || existing.pickupTime || '',
    deliveryTime: f.deliveryTime || existing.deliveryTime || '',
    pickupDate: f.pickupDate || existing.pickupDate || '',
    pickupWindow: f.pickupWindow || existing.pickupWindow || '',
    deliveryDate: f.deliveryDate || existing.deliveryDate || '',
    deliveryWindow: f.deliveryWindow || existing.deliveryWindow || '',
    driver: f.driver || existing.driver || '',
    truck: f.truck || existing.truck || '',
    trailer: f.trailer || existing.trailer || '',
    rate: f.rate || existing.rate || 0,
    miles: f.miles || existing.miles || 0,
    docs: 'Uploaded',
    reference: f.reference || existing.reference || '',
    poNumber: f.poNumber || existing.poNumber || '',
    bolNumber: f.bolNumber || existing.bolNumber || '',
    pickupNumber: f.pickupNumber || existing.pickupNumber || '',
    deliveryNumber: f.deliveryNumber || existing.deliveryNumber || '',
    appointment: f.appointment || existing.appointment || '',
    commodity: f.commodity || existing.commodity || '',
    weight: f.weight || existing.weight || '',
    pieces: f.pieces || existing.pieces || '',
    equipment: f.equipment || existing.equipment || '',
    temperature: f.temperature || existing.temperature || '',
    shipmentId: f.shipmentId || existing.shipmentId || '',
    customerRef: f.customerRef || existing.customerRef || '',
    secondaryPoNumber: f.secondaryPoNumber || existing.secondaryPoNumber || '',
    cargoValue: f.cargoValue || existing.cargoValue || '',
    carrier: f.carrier || existing.carrier || '',
    loadMode: f.loadMode || existing.loadMode || '',
    equipmentSize: f.equipmentSize || existing.equipmentSize || '',
    driverRequirements: f.driverRequirements || existing.driverRequirements || '',
    gpsUrl: f.gpsUrl || existing.gpsUrl || '',
    gpsIframeUrl: f.gpsIframeUrl || existing.gpsIframeUrl || '',
    gpsIframeHtml: f.gpsIframeHtml || existing.gpsIframeHtml || '',
    mapUrl: f.mapUrl || existing.mapUrl || buildDirectionsUrl(f.pickup || existing.pickup, f.delivery || existing.delivery),
    importedFromDocument: true,
    intakeConfidence: extraction.confidence,
    intakeStatus: extraction.confidence >= 40 ? 'Auto-filled' : 'Needs review',
    notes: existing.notes || intakeNotes,
    updatedBy: user.email
  };
  const record = prepareRecord('loads', payload, existing);
  if (existingIndex >= 0) db.loads[existingIndex] = record;
  else db.loads.unshift(record);

  if (f.broker) ensureBrokerFromName(db, f.broker, user);
  if (f.gpsIframeUrl || f.gpsUrl) {
    db.company.gpsIframeUrl = normalizeExternalUrl(f.gpsIframeUrl || db.company.gpsIframeUrl);
    db.company.gpsOpenUrl = normalizeExternalUrl(f.gpsUrl || f.gpsIframeUrl || db.company.gpsOpenUrl);
    db.company.liveGpsUrl = normalizeExternalUrl(f.gpsIframeUrl || f.gpsUrl || db.company.liveGpsUrl);
    db.company.gpsProvider = f.gpsProvider || db.company.gpsProvider || 'Live GPS iframe';
    db.company.gpsProviderName = f.gpsProvider || db.company.gpsProviderName || db.company.gpsProvider || 'Live GPS';
    if (f.gpsIframeHtml) db.company.gpsIframeHtml = f.gpsIframeHtml;
    db.company.gpsLastUpdated = new Date().toISOString();
  }

  db.activities.unshift({
    id: makeId('act'),
    title: existingIndex >= 0 ? 'Load auto-updated from document' : 'Load auto-created from document',
    text: `${record.id} · ${doc.filename}`,
    createdAt: new Date().toISOString(),
    user: user.email
  });
  db.activities = db.activities.slice(0, 500);
  return record;
}

function addChatMessageNotification(db, authUser, contact, message) {
  const access = resolveChatAccess(db, authUser, contact);
  if (!access.allowed) return;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const attachmentSummary = attachments.length
    ? `sent ${attachments.length === 1 ? attachments[0].name : `${attachments.length} files`}`
    : '';
  const preview = sanitizeText(message.text || attachmentSummary || 'New chat message').slice(0, 180);
  const common = { title: 'New chat message', text: `${authUser.name}: ${preview}`, relatedLoadId: message.loadId, relatedChatContact: access.key, relatedPage: 'chat', createdBy: authUser.email };
  const recipients = [];
  if (access.type === 'driver') {
    const driver = findUserByReference(db, access.key.replace(/^driver:/, ''), 'driver');
    const dispatcher = assignedDispatcherForDriver(db, driver);
    if (authUser.role === 'driver' && dispatcher) recipients.push(dispatcher);
    else if (authUser.role === 'dispatcher' && driver) recipients.push(driver);
    else if (authUser.role === 'admin') {
      if (driver) recipients.push(driver);
      if (dispatcher) recipients.push(dispatcher);
    }
  } else if (access.type === 'broker') {
    const broker = findUserByReference(db, access.key.replace(/^broker:/, ''), 'broker');
    if (authUser.role === 'broker') recipients.push(...(db.users || []).filter(user => user.role === 'admin' && isActiveUser(user)));
    else if (authUser.role === 'admin' && broker) recipients.push(broker);
  } else if (access.type === 'staff') {
    const peer = findUserByReference(db, access.userId || access.userEmail || '');
    if (peer && ['admin', 'dispatcher'].includes(peer.role)) recipients.push(peer);
  }
  const unique = new Map(recipients.filter(user => user && user.id !== authUser.id).map(user => [user.id, user]));
  unique.forEach(user => addNotification(db, { ...common, target: user.email, targetName: user.name, role: user.role }));
}


function saveUploadedFile(file, subfolder = '') {
  const folder = path.join(new Date().toISOString().slice(0, 7), subfolder).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const targetDir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(targetDir, { recursive: true });
  const storedName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${file.filename}`;
  const diskPath = path.join(targetDir, storedName);
  fs.writeFileSync(diskPath, file.data);
  return { folder, storedName, fileUrl: `/uploads/${folder}/${storedName}`, diskPath };
}


function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function normalizeExtractedText(value) {
  return String(value || '')
    .replace(/\u0000/g, ' ')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripXml(value) {
  return normalizeExtractedText(decodeXmlEntities(String(value || '').replace(/<[^>]+>/g, ' ')));
}

function safeInflate(buffer) {
  try { return zlib.inflateSync(buffer); } catch (error) {}
  try { return zlib.inflateRawSync(buffer); } catch (error) {}
  return null;
}

function collectPdfLiteralStrings(source) {
  const output = [];
  const text = String(source || '');
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '(') continue;
    let depth = 1;
    let value = '';
    i += 1;
    for (; i < text.length && depth > 0; i += 1) {
      const ch = text[i];
      if (ch === '\\') {
        const next = text[i + 1];
        if (next === 'n') value += '\n';
        else if (next === 'r') value += '\n';
        else if (next === 't') value += ' ';
        else if (next === 'b' || next === 'f') value += ' ';
        else if (next) value += next;
        i += 1;
        continue;
      }
      if (ch === '(') { depth += 1; value += ch; continue; }
      if (ch === ')') {
        depth -= 1;
        if (depth === 0) break;
        value += ch;
        continue;
      }
      value += ch;
    }
    const clean = normalizeExtractedText(value);
    if (clean && /[A-Za-z0-9]/.test(clean) && clean.length <= 500) output.push(clean);
  }
  return output;
}

function collectPdfHexStrings(source) {
  const output = [];
  const text = String(source || '');
  const matches = text.matchAll(/<([0-9A-Fa-f\s]{6,})>/g);
  for (const match of matches) {
    const hex = match[1].replace(/\s+/g, '');
    if (hex.length % 2 !== 0 || hex.length > 4000) continue;
    try {
      const decoded = Buffer.from(hex, 'hex').toString('utf8').replace(/\u0000/g, ' ');
      const clean = normalizeExtractedText(decoded);
      if (clean && /[A-Za-z0-9]/.test(clean)) output.push(clean);
    } catch (error) {}
  }
  return output;
}

function extractPdfText(buffer) {
  const binary = buffer.toString('latin1');
  const chunks = [...collectPdfLiteralStrings(binary), ...collectPdfHexStrings(binary)];
  const streamRegex = /([\s\S]{0,900})stream\r?\n?([\s\S]*?)\r?\n?endstream/g;
  let match;
  while ((match = streamRegex.exec(binary))) {
    const dictionary = match[1] || '';
    let streamData = Buffer.from(match[2] || '', 'latin1');
    if (streamData[0] === 10 || streamData[0] === 13) streamData = streamData.slice(1);
    let decoded = null;
    if (/FlateDecode/i.test(dictionary)) decoded = safeInflate(streamData);
    if (!decoded && !/DCTDecode|JPXDecode/i.test(dictionary)) decoded = streamData;
    if (!decoded) continue;
    const streamText = decoded.toString('utf8');
    chunks.push(streamText);
    chunks.push(...collectPdfLiteralStrings(streamText));
    chunks.push(...collectPdfHexStrings(streamText));
  }
  return normalizeExtractedText(chunks.join('\n'));
}


// Production PDF fallback extractor.
// It decodes text-based PDFs that use embedded CID fonts and ToUnicode maps,
// so dispatcher auto-fill works even on Windows hosts without Poppler/pdftotext.
function pdfDecodeUnicodeHex(hex) {
  const clean = String(hex || '').replace(/\s+/g, '');
  if (!clean) return '';
  const chars = [];
  for (let i = 0; i < clean.length; i += 4) {
    const part = clean.slice(i, i + 4);
    if (part.length < 4) continue;
    const code = parseInt(part, 16);
    if (Number.isFinite(code) && code > 0) chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}

function pdfParseCMap(cmapText) {
  const cmap = new Map();
  const text = String(cmapText || '');
  const bfcharBlocks = text.match(/beginbfchar[\s\S]*?endbfchar/g) || [];
  bfcharBlocks.forEach(block => {
    const matches = block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const match of matches) {
      const code = parseInt(match[1], 16);
      const unicode = pdfDecodeUnicodeHex(match[2]);
      if (Number.isFinite(code) && unicode) cmap.set(code, unicode);
    }
  });
  const bfrangeBlocks = text.match(/beginbfrange[\s\S]*?endbfrange/g) || [];
  bfrangeBlocks.forEach(block => {
    const rangeMatches = block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const match of rangeMatches) {
      const start = parseInt(match[1], 16);
      const end = parseInt(match[2], 16);
      const dest = parseInt(match[3], 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(dest) || end < start || end - start > 4096) continue;
      for (let code = start; code <= end; code += 1) cmap.set(code, String.fromCharCode(dest + code - start));
    }
    const arrayMatches = block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g);
    for (const match of arrayMatches) {
      const start = parseInt(match[1], 16);
      const values = [...String(match[3] || '').matchAll(/<([0-9A-Fa-f]+)>/g)].map(item => pdfDecodeUnicodeHex(item[1]));
      values.forEach((unicode, index) => {
        if (unicode) cmap.set(start + index, unicode);
      });
    }
  });
  return cmap;
}

function pdfParseObjects(buffer) {
  const binary = buffer.toString('latin1');
  const objects = new Map();
  const streams = new Map();
  const regex = /(\d+)\s+0\s+obj\b/g;
  let match;
  while ((match = regex.exec(binary))) {
    const objectNumber = Number(match[1]);
    const objectStart = match.index;
    const bodyStart = regex.lastIndex;
    const objectEnd = binary.indexOf('endobj', bodyStart);
    if (objectEnd === -1) continue;
    const bodyBinary = binary.slice(bodyStart, objectEnd);
    const bodyBuffer = Buffer.from(bodyBinary, 'latin1');
    objects.set(objectNumber, bodyBinary);
    const streamIndex = bodyBinary.indexOf('stream');
    if (streamIndex !== -1) {
      let streamStart = streamIndex + 'stream'.length;
      if (bodyBinary.slice(streamStart, streamStart + 2) === '\r\n') streamStart += 2;
      else if (bodyBinary[streamStart] === '\n' || bodyBinary[streamStart] === '\r') streamStart += 1;
      const streamEnd = bodyBinary.indexOf('endstream', streamStart);
      if (streamEnd !== -1) {
        let streamData = bodyBuffer.slice(streamStart, streamEnd);
        const dictionary = bodyBinary.slice(0, streamIndex);
        if (/FlateDecode/i.test(dictionary)) {
          const inflated = safeInflate(streamData) || safeInflate(Buffer.from(String(streamData.toString('latin1')).trim(), 'latin1'));
          if (inflated) streamData = inflated;
          else streamData = Buffer.alloc(0);
        }
        streams.set(objectNumber, { dictionary, data: streamData, objectStart });
      }
    }
  }
  return { objects, streams };
}

function pdfBuildFontCMaps(objects, streams) {
  const cmapsByObject = new Map();
  streams.forEach((stream, objectNumber) => {
    const text = stream.data.toString('latin1');
    if (/begincmap/i.test(text)) {
      const cmap = pdfParseCMap(text);
      if (cmap.size) cmapsByObject.set(objectNumber, cmap);
    }
  });
  const fontObjectToCMap = new Map();
  objects.forEach((body, objectNumber) => {
    const match = /\/ToUnicode\s+(\d+)\s+0\s+R/i.exec(body);
    if (match) {
      const cmap = cmapsByObject.get(Number(match[1]));
      if (cmap && cmap.size) fontObjectToCMap.set(objectNumber, cmap);
    }
  });
  const fontNameToCMap = new Map();
  const raw = [...objects.values()].join('\n');
  const fontRefs = raw.matchAll(/\/([A-Za-z][A-Za-z0-9._-]*)\s+(\d+)\s+0\s+R/g);
  for (const ref of fontRefs) {
    const fontObject = Number(ref[2]);
    const cmap = fontObjectToCMap.get(fontObject);
    if (cmap) fontNameToCMap.set(ref[1], cmap);
  }
  const fallback = new Map();
  cmapsByObject.forEach(cmap => cmap.forEach((value, key) => {
    if (!fallback.has(key)) fallback.set(key, value);
  }));
  return { fontNameToCMap, fallback };
}

function pdfDecodeHexWithCMap(hex, cmap, fallbackCMap) {
  const clean = String(hex || '').replace(/\s+/g, '');
  if (!clean) return '';
  const map = cmap && cmap.size ? cmap : fallbackCMap;
  const useWideCodes = clean.length % 4 === 0 && map && map.size;
  const step = useWideCodes ? 4 : 2;
  const output = [];
  for (let i = 0; i < clean.length; i += step) {
    const part = clean.slice(i, i + step);
    if (part.length < step) continue;
    const code = parseInt(part, 16);
    if (!Number.isFinite(code)) continue;
    if (map && map.has(code)) output.push(map.get(code));
    else if (code >= 32 && code <= 126) output.push(String.fromCharCode(code));
    else if (step === 4) {
      const lowByte = code & 0xff;
      if (lowByte >= 32 && lowByte <= 126) output.push(String.fromCharCode(lowByte));
    }
  }
  return output.join('');
}

function pdfDecodeLiteralString(value) {
  const input = String(value || '');
  let output = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch !== '\\') { output += ch; continue; }
    const next = input[++i] || '';
    if (next === 'n' || next === 'r') output += '\n';
    else if (next === 't') output += ' ';
    else if (next === 'b' || next === 'f') output += ' ';
    else if (/[0-7]/.test(next)) {
      let octal = next;
      for (let j = 0; j < 2 && /[0-7]/.test(input[i + 1] || ''); j += 1) octal += input[++i];
      output += String.fromCharCode(parseInt(octal, 8));
    } else output += next;
  }
  return output;
}

function pdfApproxTextWidth(text, fontSize) {
  const size = Number(fontSize) || 10;
  let width = 0;
  for (const ch of String(text || '')) {
    if (/\s/.test(ch)) width += size * 0.25;
    else if (/[ilI.,'`!:;|]/.test(ch)) width += size * 0.24;
    else if (/[MW@#%&]/.test(ch)) width += size * 0.78;
    else if (/[A-Z0-9]/.test(ch)) width += size * 0.58;
    else width += size * 0.52;
  }
  return width;
}

function pdfAppendTextWithSpacing(current, part, previous, currentX) {
  const text = String(part || '').replace(/\u00A0/g, ' ');
  if (!text) return current;
  if (!current || /\s$/.test(current) || /^[,.;:!?)]/.test(text)) return current + text;
  const estimatedEnd = previous ? previous.x + pdfApproxTextWidth(previous.text, previous.fontSize) : currentX;
  const gap = Number(currentX) - estimatedEnd;
  if (gap > 18) return current + '  ' + text;
  if (gap > 4) return current + ' ' + text;
  return current + text;
}

function pdfExtractTextFragmentsFromStream(streamText, fontNameToCMap, fallbackCMap, objectNumber, streamOrder) {
  const fragments = [];
  const text = String(streamText || '');
  const blockRegex = /BT([\s\S]*?)ET/g;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(text))) {
    const block = blockMatch[1] || '';
    let fontName = '';
    let fontSize = 10;
    let x = 0;
    let y = 0;
    const tokenRegex = /\/([A-Za-z][A-Za-z0-9._-]*)\s+([0-9.]+)\s+Tf|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Td|<([0-9A-Fa-f\s]+)>\s*Tj|\((?:\\.|[^\\)])*\)\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
    let token;
    while ((token = tokenRegex.exec(block))) {
      if (token[1]) {
        fontName = token[1];
        fontSize = Number(token[2]) || fontSize;
        continue;
      }
      if (token[7] !== undefined && token[8] !== undefined) {
        x = Number(token[7]) || 0;
        y = Number(token[8]) || 0;
        continue;
      }
      if (token[9] !== undefined && token[10] !== undefined) {
        x += Number(token[9]) || 0;
        y += Number(token[10]) || 0;
        continue;
      }
      const cmap = fontNameToCMap.get(fontName) || fallbackCMap;
      let decoded = '';
      if (token[11]) {
        decoded = pdfDecodeHexWithCMap(token[11], cmap, fallbackCMap);
      } else if (token[0] && token[0].startsWith('(')) {
        const literal = /^\(((?:\\.|[^\\)])*)\)\s*Tj/.exec(token[0]);
        decoded = literal ? pdfDecodeLiteralString(literal[1]) : '';
      } else if (token[12]) {
        const arraySource = token[12];
        const arrayTokenRegex = /<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\)])*)\)|(-?\d+(?:\.\d+)?)/g;
        let arrayToken;
        while ((arrayToken = arrayTokenRegex.exec(arraySource))) {
          if (arrayToken[1]) decoded += pdfDecodeHexWithCMap(arrayToken[1], cmap, fallbackCMap);
          else if (arrayToken[2]) decoded += pdfDecodeLiteralString(arrayToken[2]);
          else if (arrayToken[3] && Number(arrayToken[3]) < -120) decoded += ' ';
        }
      }
      decoded = decoded.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, '');
      if (decoded && /[A-Za-z0-9$#@.,:;()\/\-]/.test(decoded)) {
        fragments.push({ streamOrder, objectNumber, y, x, fontSize, text: decoded });
      }
    }
  }
  return fragments;
}

function pdfFragmentsToText(fragments) {
  if (!fragments.length) return '';
  const sorted = fragments.slice().sort((a, b) => {
    if (a.streamOrder !== b.streamOrder) return a.streamOrder - b.streamOrder;
    const ay = Math.round(a.y * 2) / 2;
    const by = Math.round(b.y * 2) / 2;
    if (Math.abs(ay - by) > 1.5) return ay - by;
    return a.x - b.x;
  });
  const lines = [];
  let currentLine = null;
  sorted.forEach(fragment => {
    if (!currentLine || currentLine.streamOrder !== fragment.streamOrder || Math.abs(currentLine.y - fragment.y) > 1.8) {
      if (currentLine) lines.push(currentLine.text.trimEnd());
      currentLine = { streamOrder: fragment.streamOrder, y: fragment.y, text: '', previous: null };
    }
    currentLine.text = pdfAppendTextWithSpacing(currentLine.text, fragment.text, currentLine.previous, fragment.x);
    currentLine.previous = fragment;
  });
  if (currentLine) lines.push(currentLine.text.trimEnd());
  return normalizeExtractedText(lines.join('\n'));
}

function extractPdfText(buffer) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  if (!data.length) return '';
  try {
    const { objects, streams } = pdfParseObjects(data);
    const { fontNameToCMap, fallback } = pdfBuildFontCMaps(objects, streams);
    const fragments = [];
    const textStreams = [...streams.entries()]
      .filter(([, stream]) => /\bBT\b[\s\S]*?\bET\b/.test(stream.data.toString('latin1')))
      .sort((a, b) => a[1].objectStart - b[1].objectStart);
    textStreams.forEach(([objectNumber, stream], index) => {
      const streamText = stream.data.toString('latin1');
      fragments.push(...pdfExtractTextFragmentsFromStream(streamText, fontNameToCMap, fallback, objectNumber, index));
    });
    const decoded = pdfFragmentsToText(fragments);
    if (decoded && decoded.replace(/[^A-Za-z0-9]/g, '').length > 25) return decoded;
  } catch (error) {
    // Keep the upload flow alive; low-confidence PDFs will be sent to review.
  }
  return '';
}

function extractZipOfficeText(buffer) {
  const chunks = [];
  let offset = 0;
  while (offset < buffer.length - 30) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) {
      const next = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset + 1);
      if (next === -1) break;
      offset = next;
      continue;
    }
    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const filename = buffer.slice(nameStart, nameStart + nameLength).toString('utf8');
    if (dataStart > buffer.length || compressedSize < 0) break;
    if ((flags & 0x08) || compressedSize === 0) {
      const next = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), dataStart + 1);
      if (next === -1) break;
      offset = next;
      continue;
    }
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    let data = null;
    try {
      if (method === 0) data = compressed;
      if (method === 8) data = zlib.inflateRawSync(compressed);
    } catch (error) {
      data = null;
    }
    const lower = filename.toLowerCase();
    const usefulXml = lower.endsWith('.xml') && (
      lower.includes('word/document') || lower.includes('word/header') || lower.includes('word/footer') ||
      lower.includes('xl/sharedstrings') || lower.includes('xl/worksheets') || lower.includes('ppt/slides') ||
      lower.includes('docprops')
    );
    if (data && usefulXml) chunks.push(stripXml(data.toString('utf8')));
    offset = dataStart + compressedSize;
  }
  return normalizeExtractedText(chunks.join('\n'));
}

function extractTextFromUpload(file) {
  const lower = String(file.filename || '').toLowerCase();
  const contentType = String(file.contentType || '').toLowerCase();
  const data = file.data || Buffer.alloc(0);
  try {
    if (lower.endsWith('.pdf') || contentType.includes('pdf')) {
      const pdfText = extractPdfText(data);
      return meaningfulBusinessText(pdfText) ? pdfText : '';
    }
    if (/\.(docx|xlsx|pptx)$/i.test(lower) || contentType.includes('officedocument')) return extractZipOfficeText(data);
    if (/\.(txt|csv|json|xml|html|htm|edi)$/i.test(lower) || contentType.startsWith('text/')) return normalizeExtractedText(data.toString('utf8'));
    const utf = normalizeExtractedText(data.toString('utf8'));
    const printable = utf.replace(/[^\x20-\x7E\n]/g, '').length;
    if (utf && printable / Math.max(utf.length, 1) > 0.65) return utf;
  } catch (error) {}
  return '';
}



function executableCandidates(envName, commandName, windowsPaths = []) {
  const list = [];
  if (process.env[envName]) list.push(process.env[envName]);
  list.push(commandName);
  if (process.platform === 'win32') list.push(...windowsPaths);
  return [...new Set(list.filter(Boolean))];
}
function firstWorkingExecutable(envName, commandName, args = ['--version'], windowsPaths = []) {
  for (const candidate of executableCandidates(envName, commandName, windowsPaths)) {
    try {
      execFileSync(candidate, args, { timeout: 4000, windowsHide: true, stdio: 'ignore' });
      return candidate;
    } catch (error) {}
  }
  return process.env[envName] || commandName;
}
function pdftotextBin() {
  return firstWorkingExecutable('PDFTOTEXT_BIN', 'pdftotext', ['-v'], [
    'C:\\Program Files\\poppler\\Library\\bin\\pdftotext.exe',
    'C:\\Program Files\\poppler\\bin\\pdftotext.exe'
  ]);
}
function pdftoppmBin() {
  return firstWorkingExecutable('PDFTOPPM_BIN', 'pdftoppm', ['-v'], [
    'C:\\Program Files\\poppler\\Library\\bin\\pdftoppm.exe',
    'C:\\Program Files\\poppler\\bin\\pdftoppm.exe'
  ]);
}
function tesseractBin() {
  return firstWorkingExecutable('TESSERACT_BIN', 'tesseract', ['--version'], [
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe'
  ]);
}

function extractTextWithPdftotext(filePath) {
  if (!filePath) return '';
  const executable = pdftotextBin();
  try {
    const output = execFileSync(executable, ['-layout', '-enc', 'UTF-8', filePath, '-'], {
      timeout: Number(process.env.PDFTOTEXT_TIMEOUT_MS || 15000),
      maxBuffer: Number(process.env.PDFTOTEXT_MAX_BUFFER || 20 * 1024 * 1024),
      windowsHide: true
    });
    const clean = normalizeExtractedText(output.toString('utf8'));
    if (meaningfulBusinessText(clean)) return clean;
  } catch (error) {
    // Fallback is used when Poppler/pdftotext is not installed on the host.
  }
  return '';
}


function looksLikePdfInternalText(text) {
  const clean = normalizeExtractedText(text || '');
  if (!clean) return false;
  const badTokens = (clean.match(/\b(?:ProcSet|XObject|FlateDecode|FontDescriptor|MediaBox|ColorSpace|CIDInit|CMap|endobj|xref|obj|stream|endstream)\b/gi) || []).length;
  const ops = (clean.match(/\b(?:BT|ET|Tf|Td|TJ|Tj|rg|re|cm|Do)\b/g) || []).length;
  const businessTokens = (clean.match(/\b(?:load|pickup|delivery|order|carrier|broker|commodity|miles|rate|address|shipper|consignee|payment|trailer|weight|logistics)\b/gi) || []).length;
  return (badTokens >= 3 || ops >= 8) && businessTokens < 3;
}

function meaningfulBusinessText(text) {
  const clean = normalizeExtractedText(text || '');
  if (!clean) return false;
  const alnum = clean.replace(/[^A-Za-z0-9]/g, '');
  if (alnum.length < 30) return false;
  if (looksLikePdfInternalText(clean)) return false;
  const businessTokens = (clean.match(/\b(?:load|pickup|delivery|order|carrier|broker|commodity|miles|rate|address|shipper|consignee|payment|trailer|weight|logistics|confirmation)\b/gi) || []).length;
  return businessTokens >= 1 || alnum.length > 250;
}

function removeDirQuiet(dirPath) {
  try { fs.rmSync(dirPath, { recursive: true, force: true }); } catch (error) {}
}

function extractTextWithPdfOcr(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const pdftoppm = pdftoppmBin();
  const tesseract = tesseractBin();
  const maxPages = Math.max(1, Math.min(4, Number(process.env.OCR_MAX_PAGES || 2)));
  const dpi = Math.max(120, Math.min(180, Number(process.env.OCR_DPI || 150)));
  const timeoutMs = Math.max(10000, Number(process.env.OCR_TIMEOUT_MS || 30000));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jts-ocr-'));
  try {
    const prefix = path.join(tempDir, 'page');
    execFileSync(pdftoppm, ['-r', String(dpi), '-png', '-f', '1', '-l', String(maxPages), filePath, prefix], {
      timeout: timeoutMs,
      maxBuffer: Number(process.env.OCR_MAX_BUFFER || 16 * 1024 * 1024),
      windowsHide: true
    });
    const images = fs.readdirSync(tempDir)
      .filter(name => /^page-\d+\.png$/i.test(name))
      .sort((a, b) => Number((a.match(/\d+/) || [0])[0]) - Number((b.match(/\d+/) || [0])[0]));
    const parts = [];
    for (const image of images) {
      const imagePath = path.join(tempDir, image);
      let pageText = '';
      try {
        pageText = execFileSync(tesseract, [imagePath, 'stdout', '--psm', '6', '-l', process.env.OCR_LANG || 'eng'], {
          timeout: timeoutMs,
          maxBuffer: Number(process.env.OCR_MAX_BUFFER || 16 * 1024 * 1024),
          windowsHide: true
        }).toString('utf8');
      } catch (error) {
        try {
          pageText = execFileSync(tesseract, [imagePath, 'stdout', '--psm', '4', '-l', process.env.OCR_LANG || 'eng'], {
            timeout: timeoutMs,
            maxBuffer: Number(process.env.OCR_MAX_BUFFER || 16 * 1024 * 1024),
            windowsHide: true
          }).toString('utf8');
        } catch (fallbackError) {}
      }
      const clean = normalizeExtractedText(pageText);
      if (clean) parts.push(clean);
    }
    const combined = normalizeExtractedText(parts.join('\n'));
    return meaningfulBusinessText(combined) ? combined : '';
  } catch (error) {
    return '';
  } finally {
    removeDirQuiet(tempDir);
  }
}

function pdfExtractionDiagnostic() {
  const checks = { pdftotext: false, pdftoppm: false, tesseract: false };
  try { execFileSync(pdftotextBin(), ['-v'], { timeout: 4000, windowsHide: true, stdio: 'ignore' }); checks.pdftotext = true; } catch (error) {}
  try { execFileSync(pdftoppmBin(), ['-v'], { timeout: 4000, windowsHide: true, stdio: 'ignore' }); checks.pdftoppm = true; } catch (error) {}
  try { execFileSync(tesseractBin(), ['--version'], { timeout: 4000, windowsHide: true, stdio: 'ignore' }); checks.tesseract = true; } catch (error) {}
  checks.ocr = checks.pdftoppm && checks.tesseract;
  return checks;
}

function extractTextFromStoredUpload(file, diskPath = '') {
  const lower = String(file?.filename || '').toLowerCase();
  const contentType = String(file?.contentType || '').toLowerCase();
  if (lower.endsWith('.pdf') || contentType.includes('pdf')) {
    const popplerText = extractTextWithPdftotext(diskPath);
    if (meaningfulBusinessText(popplerText)) return popplerText;
    const embeddedText = extractTextFromUpload(file);
    if (meaningfulBusinessText(embeddedText)) return embeddedText;
    if ((file?.data?.length || 0) > OCR_MAX_FILE_BYTES) return '';
    const ocrText = extractTextWithPdfOcr(diskPath);
    if (meaningfulBusinessText(ocrText)) return ocrText;
    return '';
  }
  return extractTextFromUpload(file);
}

function cleanDocumentValue(value) {
  return normalizeExtractedText(String(value || '')
    .replace(/^[#:\-\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .split('\n')[0])
    .slice(0, 180);
}

function firstMatch(text, patterns, transform = value => value) {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      const clean = cleanDocumentValue(match[1]);
      if (clean) return transform(clean);
    }
  }
  return '';
}

function valueFromLines(lines, patterns) {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = pattern.exec(line);
      if (match && match[1]) return cleanDocumentValue(match[1]);
      if (pattern.test(line)) {
        for (let j = i + 1; j < Math.min(lines.length, i + 4); j += 1) {
          const next = cleanDocumentValue(lines[j]);
          if (next && !/^(date|time|phone|email|fax|contact)\b/i.test(next)) return next;
        }
      }
    }
  }
  return '';
}

function parseMoney(value) {
  const number = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function parseMiles(value) {
  const number = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function inferDocumentType(filename, text) {
  const source = `${filename || ''}\n${text || ''}`.toLowerCase();
  if (/rate\s*(confirmation|con)|load\s*confirmation|carrier\s*(confirmation|agreement)|dispatch\s*sheet/.test(source)) return 'Rate confirmation';
  if (/proof\s+of\s+delivery|\bpod\b|delivered\s+by|received\s+by/.test(source)) return 'POD';
  if (/bill\s+of\s+lading|\bbol\b|shipper\s+signature|consignee\s+signature/.test(source)) return 'BOL';
  if (/fuel|diesel|gallons|receipt/.test(source)) return 'Fuel receipt';
  if (/\.(png|jpe?g|webp|gif|heic)$/i.test(filename || '')) return 'Photo';
  return 'Document';
}

function parseDispatchDocument(text, filename, prefix = 'JTS') {
  const normalized = normalizeExtractedText(text);
  const searchable = normalizeExtractedText(`${filename || ''}\n${normalized}`);
  const lines = searchable.split('\n').map(cleanDocumentValue).filter(Boolean).slice(0, 600);
  const parsed = {
    documentType: inferDocumentType(filename, searchable),
    loadId: firstMatch(searchable, [
      /\b(?:load|shipment|order|trip|dispatch|tender)\s*(?:#|no\.?|number|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-]{3,})/i,
      /\b(?:reference|ref|confirmation|pro|bol)\s*(?:#|no\.?|number|id)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-]{3,})/i
    ], value => value.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 48)),
    broker: valueFromLines(lines, [
      /\b(?:broker|customer|bill\s*to|payer)\s*(?:name)?\s*[:\-]\s*(.{2,160})/i,
      /\b(?:company)\s*[:\-]\s*(.{2,160})/i
    ]),
    pickup: valueFromLines(lines, [
      /\b(?:pickup|pick\s*up|origin|shipper|from)\s*(?:location|address|city)?\s*[:\-]\s*(.{3,180})/i,
      /\bPU\s*[:\-]\s*(.{3,180})/i
    ]),
    delivery: valueFromLines(lines, [
      /\b(?:delivery|deliver|destination|consignee|receiver|to)\s*(?:location|address|city)?\s*[:\-]\s*(.{3,180})/i,
      /\bDEL\s*[:\-]\s*(.{3,180})/i
    ]),
    pickupTime: firstMatch(searchable, [
      /\b(?:pickup|pick\s*up|ship\s*date|pu\s*date|appointment)\b.{0,45}?((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i
    ]),
    deliveryTime: firstMatch(searchable, [
      /\b(?:delivery|deliver|del\s*date|appointment)\b.{0,45}?((?:\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?:\s+\d{1,2}:\d{2}\s*(?:AM|PM)?)?)/i
    ]),
    rate: parseMoney(firstMatch(searchable, [
      /\b(?:rate|carrier\s*pay|linehaul|line\s*haul|total\s*(?:pay|due|charges)?|amount)\b[^\n$0-9]{0,25}\$?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i
    ])),
    miles: parseMiles(firstMatch(searchable, [
      /\b(?:miles|distance|loaded\s*miles)\b[^\n0-9]{0,20}([0-9][0-9,]*(?:\.\d+)?)/i
    ])),
    driver: valueFromLines(lines, [/\bdriver\s*(?:name)?\s*[:\-]\s*(.{2,120})/i]),
    truck: firstMatch(searchable, [/\b(?:truck|tractor|unit)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9._\-]{2,40})/i]),
    trailer: firstMatch(searchable, [/\btrailer\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9._\-]{2,40})/i]),
    reference: firstMatch(searchable, [/\b(?:reference|ref|po)\s*(?:#|no\.?|number)?\s*[:\-]?\s*([A-Z0-9._\-]{3,60})/i]),
    extractedTextPreview: normalized.slice(0, 1500)
  };

  const parsedScheduleSource = `${filename || ''}\n${text || ''}\n${searchable}`;
  parsed.pickupTime = parsed.pickupTime || extractStopSchedule(parsedScheduleSource, 'pickup');
  parsed.deliveryTime = parsed.deliveryTime || extractStopSchedule(parsedScheduleSource, 'delivery');
  parsed.pickupWindow = extractStopWindow(parsedScheduleSource, 'pickup');
  parsed.deliveryWindow = extractStopWindow(parsedScheduleSource, 'delivery');
  parsed.gpsUrl = extractGpsUrl(parsedScheduleSource);
  parsed.trackingUrl = parsed.gpsUrl;
  parsed.pickupNumber = extractOperationalField(parsedScheduleSource, 'pickup\\s*(?:number|no)|pick\\s*up\\s*(?:number|no)|pu|p\\/?u', 80);
  parsed.deliveryNumber = extractOperationalField(parsedScheduleSource, 'delivery\\s*(?:number|no)|del|drop', 80);
  parsed.poNumber = extractOperationalField(parsedScheduleSource, 'po|purchase\\s*order', 80);
  parsed.bolNumber = extractOperationalField(parsedScheduleSource, 'bol|b\\/?l|bill\\s*of\\s*lading', 80);
  parsed.commodity = extractOperationalField(parsedScheduleSource, 'commodity|product|freight|description', 120);
  parsed.weight = extractOperationalField(parsedScheduleSource, 'weight|wt', 80);
  parsed.equipment = extractOperationalField(parsedScheduleSource, 'equipment|equip|trailer\\s*type', 80);
  parsed.temperature = extractOperationalField(parsedScheduleSource, 'temperature|temp', 60);

  if (!parsed.loadId && parsed.reference) parsed.loadId = parsed.reference;
  if (parsed.pickup && /date|time|appointment/i.test(parsed.pickup) && !/[A-Z]{2}\b|,/.test(parsed.pickup)) parsed.pickup = '';
  if (parsed.delivery && /date|time|appointment/i.test(parsed.delivery) && !/[A-Z]{2}\b|,/.test(parsed.delivery)) parsed.delivery = '';

  const strongFields = ['loadId', 'pickup', 'delivery', 'pickupTime', 'deliveryTime', 'broker', 'rate', 'miles', 'gpsUrl'].filter(key => Boolean(parsed[key]));
  parsed.confidence = Math.min(96, 18 + strongFields.length * 13 + (normalized.length > 150 ? 10 : 0));
  parsed.needsReview = parsed.confidence < 58 || (!parsed.pickup && !parsed.delivery && !parsed.rate);
  parsed.source = normalized ? 'text-extracted' : 'file-metadata-only';
  if (!parsed.loadId && (parsed.pickup || parsed.delivery || parsed.broker || parsed.rate)) {
    parsed.loadId = `${sanitizeText(prefix, 'JTS')}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  }
  return parsed;
}

function storeUploadedFile(file) {
  const folder = new Date().toISOString().slice(0, 7);
  const targetDir = path.join(UPLOAD_DIR, folder);
  fs.mkdirSync(targetDir, { recursive: true });
  const storedName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${file.filename}`;
  const diskPath = path.join(targetDir, storedName);
  fs.writeFileSync(diskPath, file.data);
  return {
    folder,
    storedName,
    diskPath,
    fileUrl: `/uploads/${folder}/${storedName}`,
    sizeBytes: file.data.length
  };
}

function mergeLoadFromDocument(db, parsed, fields, authUser) {
  const autoCreate = sanitizeText(fields.autoCreate, 'true') !== 'false';
  if (!autoCreate) return { loadId: sanitizeText(fields.load || fields.loadId || parsed.loadId), action: 'document-only' };
  const loadId = sanitizeText(fields.load || fields.loadId || parsed.loadId);
  const hasOperationalData = Boolean(loadId || parsed.pickup || parsed.delivery || parsed.broker || parsed.rate || parsed.miles || parsed.driver || parsed.truck);
  if (!hasOperationalData) return { loadId: '', action: 'document-only' };
  const id = loadId || `${sanitizeText(db.company.loadPrefix, 'JTS')}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const incoming = {
    id,
    status: 'New',
    docs: 'Uploaded',
    broker: parsed.broker,
    pickup: parsed.pickup,
    delivery: parsed.delivery,
    pickupTime: parsed.pickupTime,
    deliveryTime: parsed.deliveryTime,
    pickupWindow: parsed.pickupWindow || '',
    deliveryWindow: parsed.deliveryWindow || '',
    gpsUrl: parsed.gpsUrl || parsed.trackingUrl || '',
    trackingUrl: parsed.trackingUrl || parsed.gpsUrl || '',
    pickupNumber: parsed.pickupNumber || '',
    deliveryNumber: parsed.deliveryNumber || '',
    poNumber: parsed.poNumber || '',
    bolNumber: parsed.bolNumber || '',
    commodity: parsed.commodity || '',
    weight: parsed.weight || '',
    equipment: parsed.equipment || '',
    temperature: parsed.temperature || '',
    rate: parsed.rate || 0,
    miles: parsed.miles || 0,
    driver: parsed.driver || '',
    truck: parsed.truck || '',
    trailer: parsed.trailer || '',
    reference: parsed.reference || '',
    notes: `Auto-filled from ${parsed.documentType || 'document'} import. Review extracted fields before dispatch.`,
    importedFromDocument: true,
    extractionConfidence: parsed.confidence,
    updatedBy: authUser.email
  };
  const index = db.loads.findIndex(load => String(load.id).toLowerCase() === String(id).toLowerCase());
  if (index === -1) {
    db.loads.unshift(prepareRecord('loads', incoming));
    return { loadId: id, action: 'created' };
  }
  const current = db.loads[index];
  const next = { ...current };
  ['broker', 'pickup', 'delivery', 'pickupTime', 'deliveryTime', 'pickupWindow', 'deliveryWindow', 'gpsUrl', 'trackingUrl', 'pickupNumber', 'deliveryNumber', 'poNumber', 'bolNumber', 'commodity', 'weight', 'equipment', 'temperature', 'driver', 'truck', 'trailer', 'reference'].forEach(key => {
    if (!sanitizeText(next[key]) || ['unassigned', '-'].includes(sanitizeText(next[key]).toLowerCase())) {
      if (sanitizeText(incoming[key])) next[key] = incoming[key];
    }
  });
  if (!Number(next.rate) && incoming.rate) next.rate = incoming.rate;
  if (!Number(next.miles) && incoming.miles) next.miles = incoming.miles;
  if (!sanitizeText(next.docs) || next.docs === 'Missing') next.docs = 'Uploaded';
  next.importedFromDocument = true;
  next.extractionConfidence = Math.max(Number(next.extractionConfidence || 0), parsed.confidence || 0);
  next.updatedBy = authUser.email;
  if (incoming.notes && !String(next.notes || '').includes('Auto-filled from')) {
    next.notes = `${sanitizeText(next.notes)}${next.notes ? '\n' : ''}${incoming.notes}`;
  }
  db.loads[index] = prepareRecord('loads', next, current);
  return { loadId: db.loads[index].id, action: 'updated' };
}

function intakeUploadedDocuments(db, parsedMultipart, authUser) {
  const uploaded = [];
  const extracted = [];
  let loadsCreated = 0;
  let loadsUpdated = 0;
  for (const file of parsedMultipart.files) {
    if (!file.data || !file.data.length) continue;
    const stored = storeUploadedFile(file);
    const text = extractTextFromUpload(file);
    const parsed = parseDispatchDocument(text, file.filename, db.company.loadPrefix);
    if (sanitizeText(parsedMultipart.fields.type)) parsed.documentType = sanitizeText(parsedMultipart.fields.type);
    const loadMerge = mergeLoadFromDocument(db, parsed, parsedMultipart.fields, authUser);
    if (loadMerge.action === 'created') loadsCreated += 1;
    if (loadMerge.action === 'updated') loadsUpdated += 1;
    const doc = prepareRecord('docs', {
      id: makeId('doc'),
      load: loadMerge.loadId || sanitizeText(parsedMultipart.fields.load || parsedMultipart.fields.loadId),
      driver: sanitizeText(parsedMultipart.fields.driver || parsed.driver, authUser.name),
      broker: sanitizeText(parsedMultipart.fields.broker || parsed.broker),
      type: sanitizeText(parsed.documentType, 'Document'),
      status: parsed.needsReview ? 'Uploaded' : 'Approved',
      date: new Date().toLocaleString(),
      action: 'Preview',
      filename: file.filename,
      fileUrl: stored.fileUrl,
      contentType: file.contentType,
      sizeBytes: stored.sizeBytes,
      uploadedBy: authUser.email,
      extraction: {
        status: parsed.needsReview ? 'Needs review' : 'Auto-filled',
        confidence: parsed.confidence,
        source: parsed.source,
        fields: {
          loadId: parsed.loadId,
          broker: parsed.broker,
          pickup: parsed.pickup,
          delivery: parsed.delivery,
          pickupTime: parsed.pickupTime,
          deliveryTime: parsed.deliveryTime,
          pickupWindow: parsed.pickupWindow,
          deliveryWindow: parsed.deliveryWindow,
          gpsUrl: parsed.gpsUrl,
          trackingUrl: parsed.trackingUrl,
          pickupNumber: parsed.pickupNumber,
          deliveryNumber: parsed.deliveryNumber,
          poNumber: parsed.poNumber,
          bolNumber: parsed.bolNumber,
          commodity: parsed.commodity,
          weight: parsed.weight,
          equipment: parsed.equipment,
          temperature: parsed.temperature,
          rate: parsed.rate,
          miles: parsed.miles,
          driver: parsed.driver,
          truck: parsed.truck,
          trailer: parsed.trailer,
          reference: parsed.reference
        },
        preview: parsed.extractedTextPreview
      }
    });
    db.docs.unshift(doc);
    uploaded.push(doc);
    extracted.push({
      documentId: doc.id,
      filename: file.filename,
      fileUrl: stored.fileUrl,
      documentType: doc.type,
      loadId: doc.load,
      loadAction: loadMerge.action,
      confidence: parsed.confidence,
      needsReview: parsed.needsReview,
      parsed: doc.extraction.fields,
      source: parsed.source
    });
    db.activities.unshift({
      id: makeId('act'),
      title: 'Smart document intake',
      text: `${file.filename} processed${doc.load ? ` for load ${doc.load}` : ''}`,
      createdAt: new Date().toISOString(),
      user: authUser.email
    });
  }
  db.activities = db.activities.slice(0, 500);
  if (uploaded.length) {
    addNotification(db, {
      title: 'Documents imported',
      text: `${uploaded.length} document(s) processed. ${loadsCreated} load(s) created, ${loadsUpdated} load(s) updated.`,
      type: 'Document uploaded',
      role: 'dispatcher',
      relatedPage: 'documents',
      createdBy: authUser.email
    });
  }
  return { uploaded, extracted, loadsCreated, loadsUpdated };
}


function mergeLoadPayload(existing, payload) {
  const merged = { ...(existing || {}) };
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && sanitizeText(value) !== '') merged[key] = value;
  });
  return merged;
}

function ensureBrokerFromName(db, name, authUser) {
  const company = sanitizeText(name);
  if (!company) return;
  const exists = db.brokers.some(broker => sanitizeText(broker.company).toLowerCase() === company.toLowerCase());
  if (!exists) {
    db.brokers.unshift(prepareRecord('brokers', {
      id: makeId('broker'),
      company,
      contact: '',
      email: '',
      phone: '',
      payment: 'Review',
      notes: 'Created automatically from uploaded dispatch document/import.',
      createdBy: authUser?.email || 'system'
    }));
  }
}

function splitDelimitedLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else inQuotes = !inQuotes;
    } else if ((ch === ',' || ch === '\t' || ch === ';' || ch === '|') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += ch;
  }
  result.push(current.trim());
  return result;
}

function rowsFromDelimitedText(text) {
  const lines = normalizeWhitespace(text).split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitDelimitedLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, ''));
  if (headers.length < 2) return [];
  return lines.slice(1).map(line => {
    const cells = splitDelimitedLine(line);
    const row = {};
    headers.forEach((header, index) => { row[header] = cells[index] || ''; });
    return row;
  }).filter(row => Object.values(row).some(value => sanitizeText(value)));
}

function parseJsonRows(text) {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.loads)) return parsed.loads;
    if (Array.isArray(parsed.data)) return parsed.data;
    if (Array.isArray(parsed.rows)) return parsed.rows;
  } catch (error) {}
  return [];
}

function valueByAliases(row, aliases) {
  const normalized = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [String(key).toLowerCase().replace(/[^a-z0-9]+/g, ''), value]));
  for (const alias of aliases) {
    const key = alias.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (normalized[key] !== undefined && sanitizeText(normalized[key]) !== '') return sanitizeText(normalized[key]);
  }
  return '';
}

function mapDispatchRowToLoad(row, db) {
  const sourceText = Object.values(row || {}).join(' ');
  const gps = extractGpsLink(sourceText);
  const pickupDate = valueByAliases(row, ['pickupdate', 'pudate', 'shipdate', 'pickupdate']);
  const pickupWindow = valueByAliases(row, ['pickuptime', 'putime', 'pickupwindow', 'puwindow', 'pickupappointment', 'apptpickup']);
  const deliveryDate = valueByAliases(row, ['deliverydate', 'deldate', 'dropdate', 'deliverydate']);
  const deliveryWindow = valueByAliases(row, ['deliverytime', 'deltime', 'deliverywindow', 'dropwindow', 'deliveryappointment', 'apptdelivery']);
  const pickup = valueByAliases(row, ['pickup', 'pickuplocation', 'origin', 'shipper', 'from', 'pickupcity', 'pickupaddress']);
  const delivery = valueByAliases(row, ['delivery', 'deliverylocation', 'destination', 'receiver', 'consignee', 'to', 'deliverycity', 'deliveryaddress']);
  const loadId = valueByAliases(row, ['loadid', 'loadnumber', 'loadno', 'load', 'shipmentid', 'pro', 'pronumber', 'orderid', 'dispatchid', 'ref', 'reference']) || `${sanitizeText(db.company.loadPrefix, 'JTS')}-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  return {
    id: cleanLoadId(loadId),
    status: valueByAliases(row, ['status', 'loadstatus']) || 'New',
    broker: valueByAliases(row, ['broker', 'customer', 'customername', 'billto', 'company', '3pl']),
    pickup,
    delivery,
    pickupDate,
    pickupWindow,
    deliveryDate,
    deliveryWindow,
    pickupTime: valueByAliases(row, ['pickupdatetime', 'pickupappt', 'pickupappointmentdatetime']) || combineDateWindow(pickupDate, pickupWindow),
    deliveryTime: valueByAliases(row, ['deliverydatetime', 'deliveryappt', 'deliveryappointmentdatetime']) || combineDateWindow(deliveryDate, deliveryWindow),
    rate: parseMoney(valueByAliases(row, ['rate', 'totalrate', 'carrierpay', 'revenue', 'amount', 'linehaul'])),
    miles: parseNumber(valueByAliases(row, ['miles', 'distance', 'loadedmiles'])),
    driver: valueByAliases(row, ['driver', 'drivername']),
    truck: valueByAliases(row, ['truck', 'trucknumber', 'unit', 'tractor']),
    trailer: valueByAliases(row, ['trailer', 'trailernumber']),
    docs: valueByAliases(row, ['docs', 'documents', 'documentstatus']) || 'Missing',
    reference: valueByAliases(row, ['reference', 'ref', 'po', 'bol']),
    appointment: valueByAliases(row, ['appointment', 'appt', 'appointmentnumber']),
    commodity: valueByAliases(row, ['commodity', 'product', 'freight', 'description']),
    weight: valueByAliases(row, ['weight', 'wgt']),
    pieces: valueByAliases(row, ['pieces', 'pcs', 'pallets']),
    equipment: valueByAliases(row, ['equipment', 'equipmenttype', 'trailertype']),
    temperature: valueByAliases(row, ['temperature', 'temp']),
    gpsUrl: normalizeExternalUrl(valueByAliases(row, ['gps', 'gpsurl', 'tracking', 'trackingurl', 'map', 'mapurl', 'locationurl'])) || gps.gpsUrl,
    gpsIframeUrl: normalizeExternalUrl(valueByAliases(row, ['gpsiframe', 'gpsiframeurl', 'iframe', 'iframeurl'])) || gps.gpsIframeUrl,
    gpsIframeHtml: gps.gpsIframeHtml,
    mapUrl: gps.gpsUrl || buildDirectionsUrl(pickup, delivery),
    notes: valueByAliases(row, ['notes', 'comments', 'instructions'])
  };
}

function importDispatchRows(db, rows, authUser) {
  const summary = { created: 0, updated: 0, brokersCreated: 0, gpsLinksDetected: 0, skipped: 0 };
  rows.forEach(row => {
    const mapped = mapDispatchRowToLoad(row, db);
    if (!mapped.id && !mapped.pickup && !mapped.delivery) { summary.skipped += 1; return; }
    const index = db.loads.findIndex(load => String(load.id).toLowerCase() === String(mapped.id).toLowerCase());
    if (index >= 0) {
      db.loads[index] = prepareRecord('loads', mergeLoadPayload(db.loads[index], mapped), db.loads[index]);
      summary.updated += 1;
    } else {
      db.loads.unshift(prepareRecord('loads', { ...mapped, createdBy: authUser.email }));
      summary.created += 1;
    }
    const before = db.brokers.length;
    ensureBrokerFromName(db, mapped.broker, authUser);
    if (db.brokers.length > before) summary.brokersCreated += 1;
    if (mapped.gpsIframeUrl || mapped.gpsUrl) {
      summary.gpsLinksDetected += 1;
      db.company.gpsIframeUrl = normalizeExternalUrl(mapped.gpsIframeUrl || db.company.gpsIframeUrl);
      db.company.gpsOpenUrl = normalizeExternalUrl(mapped.gpsUrl || mapped.gpsIframeUrl || db.company.gpsOpenUrl);
      db.company.liveGpsUrl = normalizeExternalUrl(mapped.gpsIframeUrl || mapped.gpsUrl || db.company.liveGpsUrl);
      db.company.gpsProvider = mapped.gpsProvider || db.company.gpsProvider || 'Live GPS iframe';
      db.company.gpsProviderName = mapped.gpsProvider || db.company.gpsProviderName || db.company.gpsProvider || 'Live GPS';
      if (mapped.gpsIframeHtml) db.company.gpsIframeHtml = mapped.gpsIframeHtml;
      db.company.gpsLastUpdated = new Date().toISOString();
    }
  });
  return summary;
}



const fuelSearchCache = new Map();
const OVERPASS_API_URLS = String(process.env.OVERPASS_API_URLS || 'https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter')
  .split(',').map(value => value.trim()).filter(Boolean);

function numericCoordinate(value, min, max) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function fuelDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = value => Number(value) * Math.PI / 180;
  const earthKm = 6371.0088;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizedFuelBrand(value = '') {
  const clean = sanitizeText(value).toLowerCase();
  if (!clean || clean === 'any' || clean === 'all') return '';
  const aliases = {
    loves: "love's|loves",
    pilot: 'pilot|flying j',
    ta: 'travelcenters of america|travel centers of america|ta travel|petro',
    speedway: 'speedway',
    shell: 'shell',
    bp: '\\bbp\\b',
    exxon: 'exxon|mobil',
    circlek: 'circle k|circlek'
  };
  return aliases[clean] || clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fuelStationAddress(tags = {}) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:city'], tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(', ');
}

function fuelStationPoint(element = {}) {
  const lat = numericCoordinate(element.lat ?? element.center?.lat, -90, 90);
  const lng = numericCoordinate(element.lon ?? element.center?.lon, -180, 180);
  return lat === null || lng === null ? null : { lat, lng };
}

async function fetchOverpassFuelStations(lat, lng, radiusKm) {
  const radiusMeters = Math.round(Math.min(100, Math.max(5, radiusKm)) * 1000);
  const query = `[out:json][timeout:20];(nwr(around:${radiusMeters},${lat},${lng})["amenity"="fuel"];);out center tags;`;
  let lastError = null;
  for (const endpoint of OVERPASS_API_URLS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 24000);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'JTS-Logistics-TMS/2.3.10' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Fuel data provider returned ${response.status}.`);
      const payload = await response.json();
      if (!Array.isArray(payload.elements)) throw new Error('Fuel data provider returned an invalid response.');
      return payload.elements;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('Nearby fuel data is temporarily unavailable.');
}

async function nearbyFuelStations(lat, lng, radiusKm = 50, brand = '') {
  const requestedRadius = Number(radiusKm);
  const radius = Number.isFinite(requestedRadius) ? Math.min(100, Math.max(5, requestedRadius)) : 50;
  const brandPattern = normalizedFuelBrand(brand);
  const cacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}:${brandPattern}`;
  const cached = fuelSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 120000) return cached.payload;
  const elements = await fetchOverpassFuelStations(lat, lng, radius);
  const seen = new Set();
  const stations = elements.map(element => {
    const point = fuelStationPoint(element);
    if (!point) return null;
    const tags = element.tags || {};
    const name = sanitizeText(tags.name || tags.brand || tags.operator || 'Fuel station');
    const brandName = sanitizeText(tags.brand || tags.operator || 'Independent');
    const brandHaystack = `${name} ${brandName} ${tags.operator || ''}`.toLowerCase();
    if (brandPattern && !new RegExp(brandPattern, 'i').test(brandHaystack)) return null;
    const key = `${point.lat.toFixed(5)}:${point.lng.toFixed(5)}:${name.toLowerCase()}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const distanceKm = fuelDistanceKm(lat, lng, point.lat, point.lng);
    const diesel = ['yes', 'designated'].includes(String(tags['fuel:diesel'] || '').toLowerCase()) || /pilot|flying j|love|petro|travelcenters|truck stop|speedway/i.test(brandHaystack);
    const truckFriendly = ['yes', 'designated'].includes(String(tags.hgv || tags['hgv:lanes'] || '').toLowerCase()) || /pilot|flying j|love|petro|travelcenters|truck stop/i.test(brandHaystack);
    return {
      id: `${element.type || 'node'}-${element.id}`,
      name,
      brand: brandName,
      address: fuelStationAddress(tags) || sanitizeText(tags['addr:full'] || 'Address not listed'),
      lat: point.lat,
      lng: point.lng,
      distanceKm: Number(distanceKm.toFixed(2)),
      distanceMiles: Number((distanceKm * 0.621371).toFixed(1)),
      openingHours: sanitizeText(tags.opening_hours || ''),
      phone: sanitizeText(tags.phone || tags['contact:phone'] || ''),
      website: normalizeExternalUrl(tags.website || tags['contact:website'] || ''),
      diesel,
      truckFriendly,
      navigationUrl: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${lat},${lng}`)}&destination=${encodeURIComponent(`${point.lat},${point.lng}`)}`,
      mapUrl: `https://www.google.com/maps?q=${encodeURIComponent(`${point.lat},${point.lng}`)}`
    };
  }).filter(Boolean).filter(station => station.distanceKm <= radius).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 24);
  const payload = { stations, radiusKm: radius, brand: brand || 'any', source: 'OpenStreetMap', searchedAt: new Date().toISOString() };
  fuelSearchCache.set(cacheKey, { createdAt: Date.now(), payload });
  if (fuelSearchCache.size > 150) fuelSearchCache.delete(fuelSearchCache.keys().next().value);
  return payload;
}

function csvScalar(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch (error) { return String(value); }
  }
  return String(value);
}

function toCsv(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '\uFEFF';
  const keys = [...rows.reduce((set, row) => {
    Object.keys(row || {}).forEach(key => set.add(key));
    return set;
  }, new Set())];
  const escape = value => `"${csvScalar(value).replace(/"/g, '""')}"`;
  return '\uFEFF' + [keys.map(escape).join(','), ...rows.map(row => keys.map(key => escape(row[key])).join(','))].join('\r\n');
}

function sendExport(res, text, filename, contentType = 'text/csv; charset=utf-8') {
  const safeName = sanitizeFilename(filename || 'export.csv');
  res.writeHead(200, securityHeaders({
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${safeName}"`,
    'Cache-Control': 'private, no-store, max-age=0'
  }));
  res.end(text);
}

function sendInlineFile(res, filePath, displayName = '') {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  const safeName = sanitizeFilename(displayName || path.basename(filePath));
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, 404, { error: 'Document file not found.' });
    res.writeHead(200, securityHeaders({
      'Content-Type': contentType,
      'Content-Length': String(content.length),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Frame-Options': 'SAMEORIGIN',
      'Content-Security-Policy': "frame-ancestors 'self'"
    }));
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathName = url.pathname;
  const db = readDb();

  try {
    let auth = null;
    if (!publicApiRoutes.has(pathName)) {
      auth = authenticate(req, db);
      if (!auth) {
        sendJson(res, 401, { error: 'Login session is required.' });
        return;
      }
    }
    const authUser = auth?.user || null;

    if (authUser?.requiresPasswordChange && !['/api/change-password', '/api/logout', '/api/data'].includes(pathName)) {
      sendJson(res, 403, { error: 'Password change is required before continuing.', code: 'PASSWORD_CHANGE_REQUIRED' });
      return;
    }

    if (req.method === 'GET' && pathName === '/api/bootstrap') {
      sendJson(res, 200, {
        app: 'JTS Logistics TMS',
        hasUsers: db.users.length > 0,
        company: {
          name: db.company.name,
          primaryColor: db.company.primaryColor,
          secondaryColor: db.company.secondaryColor
        },
        push: {
          enabled: PUSH_ENABLED,
          publicKey: VAPID_PUBLIC_KEY || '',
          subject: VAPID_SUBJECT
        },
        rtc: {
          iceServers: [
            ...(RTC_STUN_URLS.length ? [{ urls: RTC_STUN_URLS }] : []),
            ...(RTC_TURN_URL ? [{ urls: RTC_TURN_URL, username: RTC_TURN_USERNAME, credential: RTC_TURN_CREDENTIAL }] : [])
          ],
          turnConfigured: Boolean(RTC_TURN_URL),
          ringTimeoutMs: CALL_RING_TIMEOUT_MS
        }
      });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/setup') {
      if (db.users.length > 0) {
        sendJson(res, 409, { error: 'Initial setup already completed.' });
        return;
      }
      const body = await readJsonBody(req);
      const name = sanitizeText(body.name);
      const email = sanitizeText(body.email).toLowerCase();
      const password = sanitizeText(body.password);
      if (!name || !email || password.length < 6) {
        sendJson(res, 400, { error: 'Name, valid email and password with minimum 6 characters are required.' });
        return;
      }
      const user = { id: makeId('user'), name, email, role: 'admin', status: 'Active', passwordHash: hashPassword(password), requiresPasswordChange: false, passwordChangedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      db.users.push(user);
      logAudit(db, 'Initial admin created', user.email, user.email);
      writeDb(db);
      const session = createSession(user);
      sendJson(res, 201, { user: publicUser(user), ...session });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/login') {
      const body = await readJsonBody(req);
      const email = sanitizeText(body.email).toLowerCase();
      const password = sanitizeText(body.password);
      const user = db.users.find(item => item.email === email && isActiveUser(item));
      if (!user || !verifyPassword(password, user.passwordHash)) {
        sendJson(res, 401, { error: 'Invalid email or password.' });
        return;
      }
      user.lastLoginAt = new Date().toISOString();
      logAudit(db, 'User login', user.email, user.email);
      writeDb(db);
      const session = createSession(user);
      sendJson(res, 200, { user: publicUser(user), ...session });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/logout') {
      if (auth?.token) sessions.delete(auth.token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/change-password') {
      const body = await readJsonBody(req);
      const currentPassword = sanitizeText(body.currentPassword || body.current || '');
      const newPassword = sanitizeText(body.newPassword || body.password || '');
      if (!verifyPassword(currentPassword, authUser.passwordHash)) {
        sendJson(res, 400, { error: 'Current password is not correct.' });
        return;
      }
      if (newPassword.length < 8) {
        sendJson(res, 400, { error: 'New password must contain at least 8 characters.' });
        return;
      }
      const index = db.users.findIndex(user => user.id === authUser.id);
      db.users[index].passwordHash = hashPassword(newPassword);
      db.users[index].requiresPasswordChange = false;
      db.users[index].passwordChangedAt = new Date().toISOString();
      logAudit(db, 'Password changed', authUser.email, authUser.email);
      writeDb(db);
      const cleanUser = publicUser(db.users[index]);
      sendJson(res, 200, { ok: true, user: cleanUser });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/rts/check-mc') {
      if (!requireDispatcherOrAdmin(res, authUser)) return;
      const body = await readJsonBody(req);
      const mcNumber = normalizeMcNumber(body.mcNumber || body.brokerMc || body.mc || '');
      const loadId = sanitizeText(body.loadId || body.id || '');
      const broker = sanitizeText(body.broker || '');
      const orderNumber = sanitizeText(body.orderNumber || body.poNumber || body.reference || '');
      const result = await checkRtsFinancialStatus({ mcNumber, broker, loadId, orderNumber });
      if (loadId) {
        const index = db.loads.findIndex(load => String(load.id) === String(loadId));
        if (index >= 0) {
          applyRtsResultToLoad(db.loads[index], result);
          addActivity(db, { loadId, title: 'RTS Financial MC check', text: `${result.mcNumber || mcNumber}: ${result.status}`, actor: authUser.email, type: 'rts' });
          logAudit(db, 'RTS MC checked', `${loadId} ${result.mcNumber || mcNumber} ${result.status}`, authUser.email);
          writeDb(db);
        }
      } else {
        logAudit(db, 'RTS MC checked', `${mcNumber} ${result.status}`, authUser.email);
        writeDb(db);
      }
      sendJson(res, 200, result);
      return;
    }

    if (req.method === 'GET' && pathName === '/api/data') {
      sendJson(res, 200, filteredDb(db, authUser));
      return;
    }

    const documentDownloadMatch = /^\/api\/docs\/([^/]+)\/download$/.exec(pathName);
    const documentPreviewMatch = /^\/api\/docs\/([^/]+)\/preview$/.exec(pathName);
    if (req.method === 'GET' && documentPreviewMatch) {
      const documentId = decodeURIComponent(documentPreviewMatch[1]);
      const doc = (db.docs || []).find(item => String(item.id) === String(documentId));
      if (!doc || !docVisibleToUser(db, authUser, doc)) return sendJson(res, 404, { error: 'Document not found.' });
      const fileUrl = sanitizeText(doc.fileUrl || '');
      if (!fileUrl.startsWith('/uploads/') || fileUrl.includes('..')) return sendJson(res, 404, { error: 'Preview file is not available.' });
      const filePath = safeJoin(UPLOAD_DIR, fileUrl.replace('/uploads', ''));
      sendInlineFile(res, filePath, doc.filename || `JTS-Document-${doc.id}`);
      return;
    }

    if (req.method === 'GET' && documentDownloadMatch) {
      const documentId = decodeURIComponent(documentDownloadMatch[1]);
      const doc = (db.docs || []).find(item => String(item.id) === String(documentId));
      if (!doc || !docVisibleToUser(db, authUser, doc)) {
        sendJson(res, 404, { error: 'Document not found.' });
        return;
      }
      const fileUrl = sanitizeText(doc.fileUrl || '');
      if (!fileUrl.startsWith('/uploads/') || fileUrl.includes('..')) {
        sendJson(res, 404, { error: 'Download file is not available.' });
        return;
      }
      const filePath = safeJoin(UPLOAD_DIR, fileUrl.replace('/uploads', ''));
      sendDownload(res, filePath, doc.filename || `JTS-Document-${doc.id}.pdf`);
      return;
    }

    if (req.method === 'GET' && pathName === '/api/fuel/nearby') {
      if (authUser.role === 'broker') {
        sendJson(res, 403, { error: 'Fuel Help is available to drivers, dispatchers and administrators.' });
        return;
      }
      const lat = numericCoordinate(url.searchParams.get('lat'), -90, 90);
      const lng = numericCoordinate(url.searchParams.get('lng'), -180, 180);
      const requestedRadius = Number(url.searchParams.get('radiusKm') || 50);
      const radiusKm = Number.isFinite(requestedRadius) ? Math.min(100, Math.max(5, requestedRadius)) : 50;
      const brand = sanitizeText(url.searchParams.get('brand') || 'any').toLowerCase();
      if (lat === null || lng === null) {
        sendJson(res, 400, { error: 'Valid current latitude and longitude are required.' });
        return;
      }
      try {
        const payload = await nearbyFuelStations(lat, lng, radiusKm, brand);
        sendJson(res, 200, payload);
      } catch (error) {
        sendJson(res, 503, { error: 'Nearby fuel stations could not be loaded right now. Check the internet connection and try again.' });
      }
      return;
    }

    if (req.method === 'PUT' && pathName === '/api/company') {
      if (!requireAdmin(res, authUser)) return;
      const body = await readJsonBody(req);
      if (body.gpsIframeHtml && !body.gpsIframeUrl) body.gpsIframeUrl = extractIframeInfo(body.gpsIframeHtml).src || extractIframeSrc(body.gpsIframeHtml);
      if (body.gpsIframeUrl && /<iframe/i.test(String(body.gpsIframeUrl))) {
        if (!body.gpsIframeHtml) body.gpsIframeHtml = String(body.gpsIframeUrl).slice(0, 2500);
        body.gpsIframeUrl = extractIframeInfo(body.gpsIframeUrl).src || extractIframeSrc(body.gpsIframeUrl);
      }
      if (body.gpsOpenUrl && /<iframe/i.test(String(body.gpsOpenUrl))) {
        if (!body.gpsIframeHtml) body.gpsIframeHtml = String(body.gpsOpenUrl).slice(0, 2500);
        body.gpsOpenUrl = extractIframeInfo(body.gpsOpenUrl).src || extractIframeSrc(body.gpsOpenUrl);
      }
      if (body.liveGpsUrl && /<iframe/i.test(String(body.liveGpsUrl))) {
        if (!body.gpsIframeHtml) body.gpsIframeHtml = String(body.liveGpsUrl).slice(0, 2500);
        body.liveGpsUrl = extractIframeInfo(body.liveGpsUrl).src || extractIframeSrc(body.liveGpsUrl);
      }
      if (body.liveGpsUrl && !body.gpsIframeUrl) body.gpsIframeUrl = body.liveGpsUrl;
      if (Object.prototype.hasOwnProperty.call(body, 'gpsIframeUrl')) body.gpsIframeUrl = normalizeExternalUrl(body.gpsIframeUrl) || sanitizeExternalUrl(body.gpsIframeUrl);
      if (Object.prototype.hasOwnProperty.call(body, 'gpsOpenUrl')) body.gpsOpenUrl = normalizeExternalUrl(body.gpsOpenUrl) || sanitizeExternalUrl(body.gpsOpenUrl);
      if (Object.prototype.hasOwnProperty.call(body, 'liveGpsUrl')) body.liveGpsUrl = normalizeExternalUrl(body.liveGpsUrl) || sanitizeExternalUrl(body.liveGpsUrl);
      if (body.gpsIframeUrl && !body.liveGpsUrl) body.liveGpsUrl = body.gpsIframeUrl;
      if (body.liveGpsUrl && !body.gpsOpenUrl) body.gpsOpenUrl = body.liveGpsUrl;
      if (body.gpsProviderName && !body.gpsProvider) body.gpsProvider = body.gpsProviderName;
      if (body.gpsProvider && !body.gpsProviderName) body.gpsProviderName = body.gpsProvider;
      if (Object.prototype.hasOwnProperty.call(body, 'gpsRefreshSeconds')) body.gpsRefreshSeconds = Math.max(15, Math.min(3600, Number(body.gpsRefreshSeconds || 60)));
      if (body.gpsIframeUrl || body.gpsOpenUrl || body.liveGpsUrl || body.gpsIframeHtml) body.gpsLastUpdated = new Date().toISOString();
      db.company = { ...db.company, ...body };
      logAudit(db, 'Company settings updated', 'company', authUser.email);
      writeDb(db);
      sendJson(res, 200, { company: db.company });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/users') {
      if (!requireAdmin(res, authUser)) return;
      const body = await readJsonBody(req);
      const email = sanitizeText(body.email).toLowerCase();
      const password = sanitizeText(body.password);
      const role = allowedRoles.has(body.role) ? body.role : 'dispatcher';
      if (!sanitizeText(body.name) || !email || password.length < 6) {
        sendJson(res, 400, { error: 'Name, email and password with minimum 6 characters are required.' });
        return;
      }
      if (db.users.some(user => user.email === email)) {
        sendJson(res, 409, { error: 'User with this email already exists.' });
        return;
      }
      let dispatcher = null;
      if (role === 'driver') {
        dispatcher = findUserByReference(db, body.dispatcherId || body.dispatcherEmail, 'dispatcher');
        if (!dispatcher || !isActiveUser(dispatcher)) {
          sendJson(res, 400, { error: 'Select an active dedicated dispatcher for the driver account.' });
          return;
        }
      }
      const user = { id: makeId('user'), name: sanitizeText(body.name), email, role, status: normalizeStatus(body.status), dispatcherId: dispatcher?.id || '', dispatcherEmail: dispatcher?.email || '', passwordHash: hashPassword(password), requiresPasswordChange: true, createdAt: new Date().toISOString() };
      db.users.push(user);
      // Single source of truth: creating a Driver account auto-creates the driver profile so admins add drivers in one place only.
      if (role === 'driver') {
        db.drivers = db.drivers || [];
        const already = db.drivers.some(d => sanitizeText(d.email).toLowerCase() === email || sanitizeText(d.name).toLowerCase() === sanitizeText(body.name).toLowerCase());
        if (!already) {
          db.drivers.unshift(prepareRecord('drivers', { name: sanitizeText(body.name), email, phone: sanitizeText(body.phone), status: 'Available', safety: 'Clear', averageMph: 55, createdBy: authUser.email }));
        }
      }
      logAudit(db, 'User created', email, authUser.email);
      writeDb(db);
      sendJson(res, 201, publicUser(user));
      return;
    }

    if (req.method === 'PATCH' && pathName.startsWith('/api/users/')) {
      if (!requireAdmin(res, authUser)) return;
      const id = pathName.split('/').pop();
      const index = db.users.findIndex(user => user.id === id);
      if (index === -1) {
        sendJson(res, 404, { error: 'User not found.' });
        return;
      }
      const body = await readJsonBody(req);
      const current = db.users[index];
      const updated = { ...current, ...body, id: current.id, email: sanitizeText(body.email || current.email).toLowerCase(), status: normalizeStatus(body.status || current.status), updatedAt: new Date().toISOString() };
      if (body.role && !allowedRoles.has(body.role)) updated.role = current.role;
      if (current.role === 'dispatcher' && (updated.role !== 'dispatcher' || updated.status === 'Disabled')) {
        const linkedDrivers = assignedDriversForDispatcher(db, current);
        if (linkedDrivers.length) {
          sendJson(res, 409, { error: `Reassign ${linkedDrivers.length} driver account${linkedDrivers.length === 1 ? '' : 's'} before changing or disabling this dispatcher.` });
          return;
        }
      }
      if (updated.role === 'driver') {
        const dispatcher = findUserByReference(db, body.dispatcherId || body.dispatcherEmail || current.dispatcherId || current.dispatcherEmail, 'dispatcher');
        if (!dispatcher || !isActiveUser(dispatcher)) {
          sendJson(res, 400, { error: 'Select an active dedicated dispatcher for the driver account.' });
          return;
        }
        updated.dispatcherId = dispatcher.id;
        updated.dispatcherEmail = dispatcher.email;
      } else {
        updated.dispatcherId = '';
        updated.dispatcherEmail = '';
      }
      if (body.password) {
        if (sanitizeText(body.password).length < 6) {
          sendJson(res, 400, { error: 'New password must contain at least 6 characters.' });
          return;
        }
        updated.passwordHash = hashPassword(body.password);
        updated.requiresPasswordChange = true;
      }
      delete updated.password;
      db.users[index] = updated;
      logAudit(db, 'User updated', updated.email, authUser.email);
      writeDb(db);
      sendJson(res, 200, publicUser(updated));
      return;
    }

    if (req.method === 'POST' && pathName === '/api/import-dispatch') {
      if (!requireDispatcherOrAdmin(res, authUser)) return;
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
      if (!boundaryMatch) {
        sendJson(res, 400, { error: 'Multipart form data is required.' });
        return;
      }
      const body = await readRequestBody(req, MAX_UPLOAD_BYTES);
      const parsed = parseMultipart(body, boundaryMatch[1]);
      const file = parsed.files[0];
      if (!file || !file.data || !file.data.length) {
        sendJson(res, 400, { error: 'Upload a CSV, JSON or TXT export file.' });
        return;
      }
      const ext = path.extname(file.filename || '').toLowerCase();
      let extractedText = '';
      try { extractedText = extractTextFromDocument(file); } catch (error) { extractedText = printableTextFromBuffer(file.data); }
      let rows = ext === '.json' ? parseJsonRows(extractedText) : rowsFromDelimitedText(extractedText);
      if (!rows.length && ext !== '.json') rows = parseJsonRows(extractedText);
      if (!rows.length) {
        sendJson(res, 400, { error: 'No importable load rows were detected. Use CSV/JSON/TXT with columns such as Load ID, Pickup, Delivery, Pickup Time, Delivery Time, Broker, Rate, Miles, Driver, Truck, Trailer and GPS URL.' });
        return;
      }
      const summary = importDispatchRows(db, rows, authUser);
      addNotification(db, {
        title: 'ITS / Dispatch import completed',
        text: `${summary.created} created, ${summary.updated} updated, ${summary.gpsLinksDetected} GPS link(s) detected.`,
        type: 'Broker update',
        role: 'dispatcher',
        relatedPage: 'loads',
        createdBy: authUser.email
      });
      logAudit(db, 'ITS/Dispatch export imported', `${summary.created} created, ${summary.updated} updated`, authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true, rows: rows.length, summary });
      return;
    }


    const confirmationRequestMatch = /^\/api\/loads\/([^/]+)\/request-confirmation$/.exec(pathName);
    if (req.method === 'POST' && confirmationRequestMatch) {
      if (authUser.role !== 'driver') { sendJson(res, 403, { error: 'Driver access is required.' }); return; }
      const load = db.loads.find(item => String(item.id) === String(decodeURIComponent(confirmationRequestMatch[1])));
      if (!load || !loadVisibleToUser(db, authUser, load)) { sendJson(res, 404, { error: 'Load not found.' }); return; }
      const driverUser = findUserByReference(db, load.driverEmail || authUser.email, 'driver') || authUser;
      const dispatcher = assignedDispatcherForDriver(db, driverUser);
      if (!dispatcher) { sendJson(res, 400, { error: 'Dedicated dispatcher is not assigned.' }); return; }
      addNotification(db, { title: 'Confirmation requested', text: `${driverUser.name} requests the PDF confirmation for load ${load.id}.`, target: dispatcher.email, role: 'dispatcher', relatedLoadId: load.id, relatedPage: 'documents', action: 'upload-confirmation', createdBy: authUser.email, excludeCreator: false });
      addActivity(db, { loadId: load.id, title: 'Confirmation requested', text: `Requested by ${driverUser.name}`, actor: authUser.email, type: 'document' });
      writeDb(db);
      sendJson(res, 201, { ok: true });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/confirmations/generate') {
      if (!requireDispatcherOrAdmin(res, authUser)) return;
      const body = await readJsonBody(req);
      const driverUser = findUserByReference(db, body.driverEmail || body.driverId || body.driver, 'driver');
      const load = db.loads.find(item => String(item.id) === String(body.loadId || body.load));
      if (!driverUser || !load) { sendJson(res, 400, { error: 'Select a valid driver and load.' }); return; }
      if (authUser.role === 'dispatcher') {
        const allowed = assignedDriversForDispatcher(db, authUser).some(item => item.id === driverUser.id);
        if (!allowed) { sendJson(res, 403, { error: 'This driver is not assigned to your dispatcher account.' }); return; }
      }
      const matchesLoad = sanitizeText(load.driverEmail).toLowerCase() === sanitizeText(driverUser.email).toLowerCase() || sanitizeText(load.driver).toLowerCase() === sanitizeText(driverUser.name).toLowerCase();
      if (!matchesLoad) { sendJson(res, 400, { error: 'The selected load is not assigned to this driver.' }); return; }
      const folder = new Date().toISOString().slice(0, 7);
      const targetDir = path.join(UPLOAD_DIR, folder);
      fs.mkdirSync(targetDir, { recursive: true });
      const filename = `JTS-Confirmation-${sanitizeFilename(load.id || 'load')}.pdf`;
      const storedName = `${Date.now()}-${filename}`;
      fs.writeFileSync(path.join(targetDir, storedName), createConfirmationPdf(load, driverUser, body.instructions));
      const doc = prepareRecord('docs', { id: makeId('doc'), load: load.id, driver: driverUser.name, driverEmail: driverUser.email, type: 'Load confirmation', status: 'Approved', date: new Date().toLocaleString(), filename, fileUrl: `/uploads/${folder}/${storedName}`, contentType: 'application/pdf', uploadedBy: authUser.email, approvedBy: authUser.email, approvedAt: new Date().toISOString() });
      db.docs.unshift(doc);
      addActivity(db, { loadId: load.id, title: 'Load confirmation generated', text: `${filename} generated and attached`, actor: authUser.email, type: 'document' });
      addNotification(db, { title: 'Load confirmation ready', text: `Your confirmation PDF for load ${load.id} is ready to download.`, target: driverUser.email, role: 'driver', relatedLoadId: load.id, relatedDocId: doc.id, relatedPage: 'driver-mobile', createdBy: authUser.email });
      writeDb(db);
      sendJson(res, 201, { document: doc });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/upload') {
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
      if (!boundaryMatch) {
        sendJson(res, 400, { error: 'Multipart form data is required.' });
        return;
      }
      const body = await readRequestBody(req, MAX_UPLOAD_BYTES);
      const parsed = parseMultipart(body, boundaryMatch[1]);
      const uploaded = [];
      const folder = new Date().toISOString().slice(0, 7);
      const targetDir = path.join(UPLOAD_DIR, folder);
      fs.mkdirSync(targetDir, { recursive: true });
      parsed.files.forEach(file => {
        if (!file.data || !file.data.length) return;
        const stored = saveUploadedFile(file);
        // Documents Hub: admin/dispatcher choose the driver + category (Personal/Operational) + sub-type; a driver uploading their own personal doc defaults to themselves.
        const targetDriverEmail = sanitizeText(parsed.fields.driverEmail || (authUser.role === 'driver' ? authUser.email : ''), '').toLowerCase();
        const targetDriverUser = targetDriverEmail ? findUserByReference(db, targetDriverEmail, 'driver') : null;
        const doc = prepareRecord('docs', {
          id: makeId('doc'),
          load: sanitizeText(parsed.fields.load || parsed.fields.loadId),
          driver: sanitizeText(parsed.fields.driver || targetDriverUser?.name, authUser.name),
          driverEmail: targetDriverEmail,
          broker: sanitizeText(parsed.fields.broker),
          type: sanitizeText(parsed.fields.type, 'Document'),
          category: sanitizeText(parsed.fields.category || ''),
          subType: sanitizeText(parsed.fields.subType || ''),
          folderId: sanitizeText(parsed.fields.folderId || ''),
          status: sanitizeText(parsed.fields.status, 'Uploaded'),
          date: new Date().toLocaleString(),
          action: 'Preview',
          filename: file.filename,
          fileUrl: stored.fileUrl,
          contentType: file.contentType,
          sizeBytes: file.data.length,
          uploadedBy: authUser.email
        });
        if (!canPostCollection(authUser, 'docs', doc, db)) return;
        db.docs.unshift(doc);
        uploaded.push(doc);
        if (doc.load) addActivity(db, { loadId: doc.load, title: 'Document uploaded', text: `${doc.type || 'Document'} uploaded by ${authUser.name}`, actor: authUser.email, type: 'document' });
      });
      if (uploaded.length === 0) {
        sendJson(res, 400, { error: 'No file was uploaded.' });
        return;
      }
      uploaded.forEach(doc => {
        addNotification(db, { title: 'Document uploaded', text: `${doc.filename || doc.type} uploaded${doc.load ? ` for ${doc.load}` : ''}`, role: 'dispatcher', relatedLoadId: doc.load, relatedDocId: doc.id, relatedPage: 'documents', createdBy: authUser.email });
        addNotification(db, { title: 'Document uploaded', text: `${doc.filename || doc.type} uploaded${doc.load ? ` for ${doc.load}` : ''}`, role: 'admin', relatedLoadId: doc.load, relatedDocId: doc.id, relatedPage: 'documents', createdBy: authUser.email });
        if (doc.driverEmail || doc.driver) addNotification(db, { title: 'Document uploaded', text: `${doc.subType || doc.type || 'Document'} received${doc.load ? ` for ${doc.load}` : ''}`, target: doc.driverEmail, targetName: doc.driverEmail ? '' : doc.driver, role: 'driver', relatedLoadId: doc.load, relatedDocId: doc.id, relatedPage: 'documents', createdBy: authUser.email });
      });
      logAudit(db, 'Document uploaded', uploaded.map(item => item.filename).join(', '), authUser.email);
      writeDb(db);
      sendJson(res, 201, { uploaded });
      return;
    }

    // Reminder proof upload: a driver attaches a document/photo to clear a Truck/Trailer inspection,
    // Medical or Scheduled drug test reminder. Status moves to "Waiting for approval" until admin/dispatcher decide.
    if (req.method === 'POST' && /^\/api\/reminders\/[^/]+\/proof$/.test(pathName)) {
      const reminderId = pathName.split('/')[3];
      const index = db.reminders.findIndex(item => String(item.id) === String(reminderId));
      if (index === -1) { sendJson(res, 404, { error: 'Reminder not found.' }); return; }
      const reminder = db.reminders[index];
      const ownsIt = authUser.role !== 'driver' || sanitizeText(reminder.driverEmail).toLowerCase() === sanitizeText(authUser.email).toLowerCase() || sanitizeText(reminder.driverName).toLowerCase() === sanitizeText(authUser.name).toLowerCase();
      if (!ownsIt) { sendJson(res, 403, { error: 'You do not have permission to update this reminder.' }); return; }
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
      if (!boundaryMatch) { sendJson(res, 400, { error: 'Multipart form data is required.' }); return; }
      const body = await readRequestBody(req, MAX_UPLOAD_BYTES);
      const parsed = parseMultipart(body, boundaryMatch[1]);
      const file = parsed.files.find(item => item.data && item.data.length);
      if (!file) { sendJson(res, 400, { error: 'A document or photo is required as proof.' }); return; }
      const stored = saveUploadedFile(file);
      const doc = prepareRecord('docs', {
        id: makeId('doc'),
        driver: reminder.driverName || authUser.name,
        driverEmail: reminder.driverEmail || authUser.email,
        type: reminder.category,
        category: 'Personal',
        subType: reminder.category,
        status: 'Uploaded',
        date: new Date().toLocaleString(),
        filename: file.filename,
        fileUrl: stored.fileUrl,
        contentType: file.contentType,
        sizeBytes: file.data.length,
        uploadedBy: authUser.email
      });
      db.docs.unshift(doc);
      db.reminders[index] = prepareRecord('reminders', { status: 'Waiting for approval', proofDocId: doc.id, proofUrl: doc.fileUrl, filename: doc.filename, submittedAt: new Date().toISOString() }, reminder);
      addNotification(db, { title: 'Reminder proof submitted', text: `${reminder.driverName || reminder.driverEmail} submitted proof for ${reminder.category}`, role: 'dispatcher', relatedPage: 'driver-mobile', createdBy: authUser.email });
      addNotification(db, { title: 'Reminder proof submitted', text: `${reminder.driverName || reminder.driverEmail} submitted proof for ${reminder.category}`, role: 'admin', relatedPage: 'driver-mobile', createdBy: authUser.email });
      logAudit(db, 'Reminder proof submitted', reminder.category, authUser.email);
      writeDb(db);
      sendJson(res, 200, db.reminders[index]);
      return;
    }

    if (req.method === 'POST' && pathName === '/api/intake') {
      if (!requireDispatcherOrAdmin(res, authUser)) return;
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
      if (!boundaryMatch) {
        sendJson(res, 400, { error: 'Multipart form data is required.' });
        return;
      }
      const body = await readRequestBody(req, MAX_UPLOAD_BYTES);
      const parsed = parseMultipart(body, boundaryMatch[1]);
      if (!parsed.files.length) {
        sendJson(res, 400, { error: 'Drop or select at least one document.' });
        return;
      }
      const oversizedFile = parsed.files.find(file => (file.data?.length || 0) > MAX_INTAKE_FILE_BYTES);
      if (oversizedFile) {
        sendJson(res, 413, { error: `${oversizedFile.filename} is too large. Upload files under ${Math.round(MAX_INTAKE_FILE_BYTES / 1024 / 1024)} MB each.` });
        return;
      }

      const results = [];
      for (const file of parsed.files) {
        if (!file.data || !file.data.length) continue;
        const stored = saveUploadedFile(file, 'intake');
        let extractedText = '';
        try {
          extractedText = extractTextFromStoredUpload(file, stored.diskPath);
          if (!extractedText && !/\.pdf$/i.test(file.filename || '') && !/pdf/i.test(file.contentType || '')) {
            extractedText = extractTextFromUpload(file) || extractTextFromDocument(file);
          }
        } catch (error) {
          extractedText = '';
        }
        const rawLinkText = extractRawTextForLinks(file);
        const extraction = extractLoadFieldsProduction(`${extractedText}\n${rawLinkText}`, file.filename, db.company);
        const isPdfDocument = /\.pdf$/i.test(file.filename || '') || /pdf/i.test(file.contentType || '');
        if (isPdfDocument && !extractedText) {
          const diag = pdfExtractionDiagnostic();
          extraction.warning = diag.ocr
            ? 'This PDF appears to be image-only/scanned and OCR did not return enough readable dispatch text. The document is saved, but review it before dispatching.'
            : 'This PDF is image-only/scanned. Install Poppler and Tesseract OCR on the server, then upload again for automatic pickup/delivery/rate extraction.';
          extraction.ocrRequired = true;
          extraction.pdfExtraction = diag;
        }
        const doc = prepareRecord('docs', {
          id: makeId('doc'),
          load: extraction.fields.loadId || '',
          driver: extraction.fields.driver || sanitizeText(parsed.fields.driver),
          broker: extraction.fields.broker || sanitizeText(parsed.fields.broker),
          type: extraction.documentType,
          status: 'Uploaded',
          date: new Date().toLocaleString(),
          action: 'Preview',
          filename: file.filename,
          fileUrl: stored.fileUrl,
          contentType: file.contentType,
          sizeBytes: file.data.length,
          uploadedBy: authUser.email,
          intake: true,
          extractionConfidence: extraction.confidence,
          extractedFields: extraction.fields,
          extractionWarning: extraction.warning
        });
        const load = upsertLoadFromExtraction(db, extraction, doc, authUser);
        if (load) doc.load = load.id;
        if (!load && (extraction.fields.gpsIframeUrl || extraction.fields.gpsUrl)) {
          db.company.gpsIframeUrl = normalizeExternalUrl(extraction.fields.gpsIframeUrl || db.company.gpsIframeUrl);
          db.company.gpsOpenUrl = normalizeExternalUrl(extraction.fields.gpsUrl || extraction.fields.gpsIframeUrl || db.company.gpsOpenUrl);
          db.company.liveGpsUrl = normalizeExternalUrl(extraction.fields.gpsIframeUrl || extraction.fields.gpsUrl || db.company.liveGpsUrl);
          db.company.gpsProvider = extraction.fields.gpsProvider || db.company.gpsProvider || 'Live GPS iframe';
          db.company.gpsProviderName = extraction.fields.gpsProvider || db.company.gpsProviderName || db.company.gpsProvider || 'Live GPS';
          if (extraction.fields.gpsIframeHtml) db.company.gpsIframeHtml = extraction.fields.gpsIframeHtml;
          db.company.gpsLastUpdated = new Date().toISOString();
        }
        db.docs.unshift(doc);
        const intakeRecord = {
          id: makeId('intake'),
          filename: file.filename,
          documentId: doc.id,
          documentUrl: doc.fileUrl,
          loadId: load?.id || extraction.fields.loadId || '',
          status: load ? load.intakeStatus : 'Needs manual review',
          confidence: extraction.confidence,
          documentType: extraction.documentType,
          extractedFields: extraction.fields,
          warning: extraction.warning || (!load ? 'No load was created because the document did not contain enough readable load data.' : ''),
          uploadedBy: authUser.email,
          createdAt: new Date().toISOString()
        };
        db.intake.unshift(intakeRecord);
        db.intake = db.intake.slice(0, 300);
        results.push({ document: doc, load, extraction, intake: intakeRecord });
      }
      if (!results.length) {
        sendJson(res, 400, { error: 'No readable file was uploaded.' });
        return;
      }
      results.forEach(item => {
        const title = item.load ? 'Document auto-filled load' : 'Document needs review';
        const text = `${item.document.filename}${item.load ? ` → ${item.load.id}` : ' needs manual review'}`;
        addNotification(db, { title, text, role: 'dispatcher', relatedLoadId: item.load?.id || item.extraction?.fields?.loadId || '', level: item.load ? 'info' : 'warning', createdBy: authUser.email });
        addNotification(db, { title, text, role: 'admin', relatedLoadId: item.load?.id || item.extraction?.fields?.loadId || '', level: item.load ? 'info' : 'warning', createdBy: authUser.email });
      });
      logAudit(db, 'Document intake processed', results.map(item => item.document.filename).join(', '), authUser.email);
      writeDb(db);
      sendJson(res, 201, { results });
      return;
    }


    if (req.method === 'GET' && pathName === '/api/calls/active') {
      const changed = expireStaleVoiceCalls(db);
      if (changed) writeDb(db);
      const now = Date.now();
      const calls = (db.calls || []).filter(call => callVisibleToUser(call, authUser) && (activeCallStatus(call.status) || now - new Date(call.updatedAt || call.endedAt || call.createdAt || 0).getTime() < 90000));
      calls.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      sendJson(res, 200, { calls: calls.slice(0, 8).map(call => publicVoiceCall(call, authUser)) });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/calls/start') {
      const body = await readJsonBody(req);
      const access = resolveChatAccess(db, authUser, body.contact);
      if (!access.allowed) {
        sendJson(res, 403, { error: access.error });
        return;
      }
      const peer = callPeerForAccess(db, authUser, access, body.peerId || body.peerEmail || body.peer);
      if (!peer || !isActiveUser(peer)) {
        sendJson(res, 400, { error: 'The selected chat contact is not available for voice calls.' });
        return;
      }
      const offer = normalizeSessionDescription(body.offer, 'offer');
      if (!offer) {
        sendJson(res, 400, { error: 'A valid WebRTC offer is required.' });
        return;
      }
      expireStaleVoiceCalls(db);
      const busy = (db.calls || []).find(call => activeCallStatus(call.status) && [authUser.id, authUser.email, peer.id, peer.email].some(value => [call.callerId, call.callerEmail, call.calleeId, call.calleeEmail].map(item => sanitizeText(item).toLowerCase()).includes(sanitizeText(value).toLowerCase())));
      if (busy) {
        sendJson(res, 409, { error: 'One of the participants is already in another call.' });
        return;
      }
      const now = new Date().toISOString();
      const call = {
        id: makeId('call'),
        threadKey: access.key,
        status: 'ringing',
        callerId: authUser.id,
        callerEmail: authUser.email,
        callerName: authUser.name,
        callerRole: authUser.role,
        calleeId: peer.id,
        calleeEmail: peer.email,
        calleeName: peer.name,
        calleeRole: peer.role,
        offer,
        answer: null,
        iceCandidates: [],
        createdAt: now,
        updatedAt: now,
        answeredAt: '',
        endedAt: '',
        endedBy: '',
        durationSeconds: 0
      };
      db.calls = Array.isArray(db.calls) ? db.calls : [];
      db.calls.push(call);
      db.calls = db.calls.slice(-500);
      upsertVoiceCallChatMessage(db, call);
      const notification = addNotification(db, {
        title: 'Incoming voice call',
        text: `${authUser.name} is calling you`,
        type: 'Incoming voice call',
        target: peer.email,
        targetName: peer.name,
        role: peer.role,
        relatedChatContact: access.key,
        relatedPage: 'chat',
        action: 'answer-call',
        callId: call.id,
        callStatus: 'ringing',
        createdBy: authUser.email,
        dedupeWindowMs: 0
      });
      call.notificationId = notification?.id || '';
      logAudit(db, 'Voice call started', `${authUser.email} -> ${peer.email}`, authUser.email);
      writeDb(db);
      sendJson(res, 201, publicVoiceCall(call, authUser));
      return;
    }

    const callGetMatch = /^\/api\/calls\/([^/]+)$/.exec(pathName);
    if (req.method === 'GET' && callGetMatch) {
      const changed = expireStaleVoiceCalls(db);
      const call = callByIdForUser(db, callGetMatch[1], authUser);
      if (changed) writeDb(db);
      if (!call) {
        sendJson(res, 404, { error: 'Voice call not found.' });
        return;
      }
      sendJson(res, 200, publicVoiceCall(call, authUser));
      return;
    }

    const callAnswerMatch = /^\/api\/calls\/([^/]+)\/answer$/.exec(pathName);
    if (req.method === 'POST' && callAnswerMatch) {
      const call = callByIdForUser(db, callAnswerMatch[1], authUser);
      if (!call) {
        sendJson(res, 404, { error: 'Voice call not found.' });
        return;
      }
      if (!callUserMatches(call, authUser, 'callee')) {
        sendJson(res, 403, { error: 'Only the called user can answer this call.' });
        return;
      }
      if (call.status !== 'ringing') {
        sendJson(res, 409, { error: `This call is already ${call.status}.` });
        return;
      }
      const body = await readJsonBody(req);
      const answer = normalizeSessionDescription(body.answer, 'answer');
      if (!answer) {
        sendJson(res, 400, { error: 'A valid WebRTC answer is required.' });
        return;
      }
      call.answer = answer;
      call.status = 'answered';
      call.answeredAt = new Date().toISOString();
      call.updatedAt = call.answeredAt;
      upsertVoiceCallChatMessage(db, call);
      syncVoiceCallNotification(db, call);
      if (call.notificationId) {
        const incoming = db.notifications.find(item => item.id === call.notificationId);
        if (incoming) markNotificationReadForUser(incoming, authUser);
      }
      addNotification(db, {
        title: 'Voice call answered',
        text: `${authUser.name} answered your call`,
        type: 'Voice call answered',
        target: call.callerEmail,
        targetName: call.callerName,
        role: call.callerRole,
        relatedChatContact: call.threadKey,
        relatedPage: 'chat',
        callId: call.id,
        createdBy: authUser.email,
        dedupeWindowMs: 0
      });
      logAudit(db, 'Voice call answered', call.id, authUser.email);
      writeDb(db);
      sendJson(res, 200, publicVoiceCall(call, authUser));
      return;
    }

    const callDeclineMatch = /^\/api\/calls\/([^/]+)\/decline$/.exec(pathName);
    if (req.method === 'POST' && callDeclineMatch) {
      const call = callByIdForUser(db, callDeclineMatch[1], authUser);
      if (!call) {
        sendJson(res, 404, { error: 'Voice call not found.' });
        return;
      }
      if (!callUserMatches(call, authUser, 'callee')) {
        sendJson(res, 403, { error: 'Only the called user can decline this call.' });
        return;
      }
      if (call.status !== 'ringing') {
        sendJson(res, 409, { error: `This call is already ${call.status}.` });
        return;
      }
      finishVoiceCall(db, call, 'declined', authUser, 'Declined by recipient');
      addNotification(db, {
        title: 'Voice call declined',
        text: `${authUser.name} declined your call`,
        type: 'Voice call declined',
        target: call.callerEmail,
        targetName: call.callerName,
        role: call.callerRole,
        relatedChatContact: call.threadKey,
        relatedPage: 'chat',
        callId: call.id,
        createdBy: authUser.email,
        dedupeWindowMs: 0
      });
      logAudit(db, 'Voice call declined', call.id, authUser.email);
      writeDb(db);
      sendJson(res, 200, publicVoiceCall(call, authUser));
      return;
    }

    const callEndMatch = /^\/api\/calls\/([^/]+)\/end$/.exec(pathName);
    if (req.method === 'POST' && callEndMatch) {
      const call = callByIdForUser(db, callEndMatch[1], authUser);
      if (!call) {
        sendJson(res, 404, { error: 'Voice call not found.' });
        return;
      }
      if (!activeCallStatus(call.status)) {
        sendJson(res, 200, publicVoiceCall(call, authUser));
        return;
      }
      const status = call.status === 'ringing' && callUserMatches(call, authUser, 'caller') ? 'cancelled' : 'ended';
      finishVoiceCall(db, call, status, authUser, status === 'cancelled' ? 'Cancelled by caller' : 'Call ended');
      logAudit(db, 'Voice call ended', `${call.id} · ${call.durationSeconds}s`, authUser.email);
      writeDb(db);
      sendJson(res, 200, publicVoiceCall(call, authUser));
      return;
    }

    const callCandidateMatch = /^\/api\/calls\/([^/]+)\/candidate$/.exec(pathName);
    if (req.method === 'POST' && callCandidateMatch) {
      const call = callByIdForUser(db, callCandidateMatch[1], authUser);
      if (!call) {
        sendJson(res, 404, { error: 'Voice call not found.' });
        return;
      }
      if (!activeCallStatus(call.status)) {
        sendJson(res, 409, { error: 'This call is no longer active.' });
        return;
      }
      const body = await readJsonBody(req);
      const candidate = normalizeIceCandidate(body.candidate || body);
      if (!candidate) {
        sendJson(res, 400, { error: 'A valid ICE candidate is required.' });
        return;
      }
      const item = {
        id: makeId('ice'),
        fromUserId: authUser.id,
        fromUserEmail: authUser.email,
        candidate,
        createdAt: new Date().toISOString()
      };
      call.iceCandidates = Array.isArray(call.iceCandidates) ? call.iceCandidates : [];
      call.iceCandidates.push(item);
      call.iceCandidates = call.iceCandidates.slice(-160);
      call.updatedAt = new Date().toISOString();
      writeDb(db);
      sendJson(res, 201, item);
      return;
    }

    if (req.method === 'POST' && pathName === '/api/chat/upload') {
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
      if (!boundaryMatch) {
        sendJson(res, 400, { error: 'Multipart form data is required.' });
        return;
      }
      const maxTotalBytes = Math.max(MAX_CHAT_UPLOAD_BYTES, MAX_CHAT_UPLOAD_BYTES * MAX_CHAT_UPLOAD_FILES + 1024 * 1024);
      const body = await readRequestBody(req, maxTotalBytes);
      const parsed = parseMultipart(body, boundaryMatch[1]);
      const requestedContact = sanitizeText(parsed.fields.contact, '');
      const chatAccess = resolveChatAccess(db, authUser, requestedContact);
      if (!chatAccess.allowed) {
        sendJson(res, 403, { error: chatAccess.error });
        return;
      }
      const contact = chatAccess.key;
      const text = sanitizeText(parsed.fields.text || '').slice(0, 5000);
      const loadId = sanitizeText(parsed.fields.loadId || '');
      if (!parsed.files.length) {
        sendJson(res, 400, { error: 'Select at least one image or file.' });
        return;
      }
      if (parsed.files.length > MAX_CHAT_UPLOAD_FILES) {
        sendJson(res, 400, { error: `A maximum of ${MAX_CHAT_UPLOAD_FILES} files can be attached to one message.` });
        return;
      }
      const validatedFiles = parsed.files.map(file => ({ file, validation: validateChatUpload(file) }));
      const invalidFile = validatedFiles.find(item => !item.validation.ok);
      if (invalidFile) {
        sendJson(res, 400, { error: invalidFile.validation.error });
        return;
      }
      const attachments = validatedFiles.map(({ file, validation }) => {
        const stored = saveUploadedFile({ ...file, filename: validation.filename }, 'chat');
        return {
          url: stored.fileUrl,
          name: validation.filename,
          contentType: validation.contentType || mimeTypes[validation.ext] || 'application/octet-stream',
          sizeBytes: validation.sizeBytes,
          kind: chatAttachmentKind(validation.filename, validation.contentType)
        };
      });
      const message = {
        id: makeId('msg'),
        type: 'out',
        text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString(),
        user: authUser.name,
        userEmail: authUser.email,
        to: contact,
        loadId,
        attachments,
        attachmentUrl: attachments[0]?.url || '',
        attachmentName: attachments[0]?.name || '',
        attachmentContentType: attachments[0]?.contentType || '',
        attachmentSizeBytes: attachments[0]?.sizeBytes || 0,
        attachmentKind: attachments[0]?.kind || '',
        readBy: userReadKeys(authUser)
      };
      if (!Array.isArray(db.chats[contact])) db.chats[contact] = [];
      db.chats[contact].push(message);
      db.chats[contact] = db.chats[contact].slice(-300);
      addChatMessageNotification(db, authUser, contact, message);
      logAudit(db, 'Chat attachment sent', `${contact}: ${attachments.map(item => item.name).join(', ')}`, authUser.email);
      writeDb(db);
      sendJson(res, 201, message);
      return;
    }

    if (req.method === 'POST' && pathName === '/api/chat') {
      const body = await readJsonBody(req);
      const chatAccess = resolveChatAccess(db, authUser, body.contact);
      if (!chatAccess.allowed) {
        sendJson(res, 403, { error: chatAccess.error });
        return;
      }
      const contact = chatAccess.key;
      const attachments = (Array.isArray(body.attachments) ? body.attachments : [])
        .map(normalizeChatAttachment)
        .filter(Boolean);
      const legacyAttachment = body.attachmentUrl ? normalizeChatAttachment({
        url: body.attachmentUrl,
        name: body.attachmentName,
        contentType: body.attachmentContentType,
        sizeBytes: body.attachmentSizeBytes,
        kind: body.attachmentKind
      }) : null;
      if (!attachments.length && legacyAttachment) attachments.push(legacyAttachment);
      const message = {
        id: makeId('msg'),
        type: sanitizeText(body.type, 'out'),
        text: sanitizeText(body.text).slice(0, 5000),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: new Date().toISOString(),
        user: authUser.name,
        userEmail: authUser.email,
        to: contact,
        loadId: sanitizeText(body.loadId || ''),
        attachments,
        attachmentUrl: attachments[0]?.url || '',
        attachmentName: attachments[0]?.name || '',
        attachmentContentType: attachments[0]?.contentType || '',
        attachmentSizeBytes: attachments[0]?.sizeBytes || 0,
        attachmentKind: attachments[0]?.kind || '',
        readBy: userReadKeys(authUser)
      };
      if (!message.text && !attachments.length) {
        sendJson(res, 400, { error: 'Message text or an attachment is required.' });
        return;
      }
      if (!Array.isArray(db.chats[contact])) db.chats[contact] = [];
      db.chats[contact].push(message);
      db.chats[contact] = db.chats[contact].slice(-300);
      addChatMessageNotification(db, authUser, contact, message);
      logAudit(db, 'Chat message sent', contact, authUser.email);
      writeDb(db);
      sendJson(res, 201, message);
      return;
    }

    if (req.method === 'POST' && pathName === '/api/chat/read') {
      const body = await readJsonBody(req);
      const chatAccess = resolveChatAccess(db, authUser, body.contact);
      if (!chatAccess.allowed) {
        sendJson(res, 403, { error: chatAccess.error });
        return;
      }
      const contact = chatAccess.key;
      if (!Array.isArray(db.chats[contact])) db.chats[contact] = [];
      const updated = markChatReadForUser(db, contact, authUser);
      if (updated) logAudit(db, 'Chat marked read', contact, authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true, updated });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/chat/read-all') {
      let updated = 0;
      Object.keys(filterChatsForUser(db, authUser)).forEach(contact => {
        updated += markChatReadForUser(db, contact, authUser);
      });
      if (updated) logAudit(db, 'All chat threads marked read', String(updated), authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true, updated });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/push/subscribe') {
      if (!PUSH_ENABLED) {
        sendJson(res, 503, { error: 'Push notifications are not configured on the server. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render Environment Variables.' });
        return;
      }
      const body = await readJsonBody(req);
      const subscription = body.subscription && typeof body.subscription === 'object' ? body.subscription : body;
      const endpoint = sanitizeText(subscription.endpoint || '');
      if (!endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
        sendJson(res, 400, { error: 'Invalid push subscription.' });
        return;
      }
      db.pushSubscriptions = Array.isArray(db.pushSubscriptions) ? db.pushSubscriptions : [];
      const record = {
        id: makeId('push'),
        userId: authUser.id,
        userEmail: authUser.email,
        userRole: authUser.role,
        endpoint,
        subscription,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const index = db.pushSubscriptions.findIndex(item => sanitizeText(item.endpoint) === endpoint || (item.userEmail === authUser.email && sanitizeText(item.endpoint) === endpoint));
      if (index >= 0) db.pushSubscriptions[index] = { ...db.pushSubscriptions[index], ...record, id: db.pushSubscriptions[index].id || record.id, createdAt: db.pushSubscriptions[index].createdAt || record.createdAt };
      else db.pushSubscriptions.push(record);
      logAudit(db, 'Push notifications subscribed', authUser.email, authUser.email);
      writeDb(db);
      sendJson(res, 201, { ok: true, pushEnabled: true });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/push/unsubscribe') {
      const body = await readJsonBody(req).catch(() => ({}));
      const endpoint = sanitizeText(body.endpoint || '');
      db.pushSubscriptions = (Array.isArray(db.pushSubscriptions) ? db.pushSubscriptions : []).filter(item => {
        if (endpoint) return sanitizeText(item.endpoint) !== endpoint;
        return sanitizeText(item.userEmail).toLowerCase() !== sanitizeText(authUser.email).toLowerCase();
      });
      logAudit(db, 'Push notifications unsubscribed', authUser.email, authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true });
      return;
    }

    const notificationReadMatch = /^\/api\/notifications\/([^/]+)\/read$/.exec(pathName);
    if (req.method === 'POST' && notificationReadMatch) {
      const notification = db.notifications.find(item => String(item.id) === String(notificationReadMatch[1]));
      if (!notification || !notificationVisibleToUser(notification, authUser)) {
        sendJson(res, 404, { error: 'Notification not found.' });
        return;
      }
      markNotificationReadForUser(notification, authUser);
      logAudit(db, 'Notification marked read', notification.id, authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true, notification: decorateNotificationForUser(notification, authUser) });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/notifications/read-all') {
      let updated = 0;
      db.notifications.forEach(item => {
        if (notificationVisibleToUser(item, authUser) && !notificationReadByUser(item, authUser)) {
          markNotificationReadForUser(item, authUser);
          updated += 1;
        }
      });
      if (updated) logAudit(db, 'Notifications marked read', String(updated), authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true, updated });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/location/update') {
      const body = await readJsonBody(req);
      const driverRecord = findDriverForUser(db, authUser);
      const driver = sanitizeText(body.driver || driverRecord?.name || authUser.name);
      const lat = Number(body.lat || body.latitude);
      const lng = Number(body.lng || body.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        sendJson(res, 400, { error: 'Valid latitude and longitude are required.' });
        return;
      }
      const loc = prepareRecord('locations', {
        id: makeId('loc'), driver, driverEmail: authUser.email, loadId: sanitizeText(body.loadId || body.load),
        lat, lng, speed: Number(body.speed || 0), heading: Number(body.heading || 0), accuracy: Number(body.accuracy || 0),
        source: 'browser-gps', timestamp: new Date().toISOString(), createdBy: authUser.email
      });
      db.locations.unshift(loc);
      db.locations = db.locations.slice(0, 2000);
      if (driverRecord) {
        driverRecord.lastLat = lat;
        driverRecord.lastLng = lng;
        driverRecord.lastLocationAt = loc.timestamp;
        driverRecord.lastLocationSource = 'browser-gps';
      }
      logAudit(db, 'Driver location updated', `${driver} ${lat},${lng}`, authUser.email);
      writeDb(db);
      sendJson(res, 201, { ok: true, location: loc });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/hos/update') {
      const body = await readJsonBody(req);
      const driverRecord = findDriverForUser(db, authUser) || db.drivers.find(d => sanitizeText(d.id) === sanitizeText(body.driverId));
      if (!driverRecord) {
        sendJson(res, 404, { error: 'Driver profile not found.' });
        return;
      }
      if (!isDispatcherOrAdmin(authUser) && sanitizeText(driverRecord.email).toLowerCase() !== sanitizeText(authUser.email).toLowerCase()) {
        sendJson(res, 403, { error: 'You can update only your own HOS record.' });
        return;
      }
      ['hosStatus','drivingHours','onDutyHours','offDutyHours','remainingHours','cycleHours','cycleLeft','lastBreakAt','averageMph'].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(body, key)) driverRecord[key] = sanitizeText(body[key]);
      });
      driverRecord.updatedAt = new Date().toISOString();
      const log = prepareRecord('hosLogs', { id: makeId('hos'), driver: driverRecord.name, driverEmail: driverRecord.email, status: body.hosStatus || driverRecord.hosStatus || driverRecord.status, data: body, createdBy: authUser.email });
      db.hosLogs.unshift(log);
      db.hosLogs = db.hosLogs.slice(0, 2000);
      logAudit(db, 'HOS values updated', driverRecord.name, authUser.email);
      writeDb(db);
      sendJson(res, 200, { ok: true, driver: driverRecord, log });
      return;
    }

    if (req.method === 'POST' && pathName === '/api/import') {
      if (!requireAdmin(res, authUser)) return;
      const body = await readJsonBody(req);
      const imported = normalizeDb({ ...db, ...body });
      if (Array.isArray(body.users)) {
        imported.users = body.users.map(user => {
          if (user.passwordHash) return { ...user, email: sanitizeText(user.email).toLowerCase(), status: normalizeStatus(user.status) };
          const password = sanitizeText(user.password, crypto.randomBytes(8).toString('hex'));
          const clean = { ...user, email: sanitizeText(user.email).toLowerCase(), status: normalizeStatus(user.status), passwordHash: hashPassword(password), requiresPasswordChange: true };
          delete clean.password;
          return clean;
        });
      }
      logAudit(imported, 'Data imported', 'JSON backup/import', authUser.email);
      writeDb(imported);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && pathName === '/api/export') {
      if (!requireAdmin(res, authUser)) return;
      sendExport(res, JSON.stringify(db, null, 2), 'jts-backup.json', 'application/json; charset=utf-8');
      return;
    }

    if (req.method === 'GET' && pathName.startsWith('/api/export/')) {
      if (!requireDispatcherOrAdmin(res, authUser)) return;
      const collection = pathName.split('/').pop();
      if (!allowedCollections.has(collection) && collection !== 'users') {
        sendJson(res, 404, { error: 'Unknown collection.' });
        return;
      }
      const rows = collection === 'users' ? visibleCollection(db, authUser, 'users') : visibleCollection(db, authUser, collection);
      sendExport(res, toCsv(rows), `jts-${collection}.csv`);
      return;
    }

    const match = /^\/api\/([a-zA-Z]+)(?:\/([^/]+))?$/.exec(pathName);
    if (match && allowedCollections.has(match[1])) {
      const collection = match[1];
      const id = match[2];

      if (req.method === 'GET' && !id) {
        sendJson(res, 200, visibleCollection(db, authUser, collection));
        return;
      }

      if (req.method === 'GET' && id) {
        const rows = visibleCollection(db, authUser, collection);
        const record = (Array.isArray(rows) ? rows : []).find(item => String(item.id) === String(decodeURIComponent(id)));
        if (!record) return sendJson(res, 404, { error: 'Record not found or unavailable for this account.', code: 'RECORD_NOT_FOUND' });
        sendJson(res, 200, record);
        return;
      }

      if (req.method === 'POST' && !id) {
        const body = await readJsonBody(req);
        if (!canPostCollection(authUser, collection, body || {}, db)) {
          sendJson(res, 403, { error: 'You do not have permission to create this record.' });
          return;
        }
        const record = collection === 'notifications'
          ? addNotification(db, { ...body, id: body.id || makeId(collection.slice(0, 4)), createdBy: authUser.email, excludeCreator: false })
          : prepareRecord(collection, { ...body, id: body.id || makeId(collection.slice(0, 4)), createdBy: authUser.email });
        if (collection === 'loads') {
          enrichLoadAccountLinks(db, record);
          if ((record.driver || record.driverEmail) && blockingLoadForDriver(db, record.driver, record.driverEmail)) {
            sendJson(res, 409, { error: 'This driver already has a load that is not fully completed and confirmed. Approve BOL and POD and close the current load before assigning another load.' });
            return;
          }
        }
        if (collection !== 'notifications') db[collection].unshift(record);
        if (collection === 'loads') {
          if (record.brokerMc) {
            const rts = await checkRtsFinancialStatus({ mcNumber: record.brokerMc, broker: record.broker, loadId: record.id, orderNumber: record.poNumber || record.reference || '' });
            applyRtsResultToLoad(record, rts);
          }
          addActivity(db, { loadId: record.id, title: 'Load created', text: `${record.pickup || '-'} → ${record.delivery || '-'}`, actor: authUser.email, type: 'load' });
          if (record.brokerMc) addActivity(db, { loadId: record.id, title: 'RTS Financial MC check', text: `${record.brokerMc}: ${record.rtsStatus || 'Not checked'}`, actor: authUser.email, type: 'rts' });
          notifyLoadAudience(db, record, 'New load created', `${record.id} ${record.pickup || '-'} → ${record.delivery || '-'}`, authUser.email, 'info');
        }
        if (collection === 'docs') {
          if (record.load) addActivity(db, { loadId: record.load, title: 'Document uploaded', text: `${record.type || 'Document'} uploaded`, actor: authUser.email, type: 'document' });
          addNotification(db, { title: 'Document uploaded', text: `${record.type || 'Document'} uploaded${record.load ? ` for ${record.load}` : ''}`, role: 'dispatcher', relatedLoadId: record.load, relatedDocId: record.id, relatedPage: 'documents', createdBy: authUser.email });
          addNotification(db, { title: 'Document uploaded', text: `${record.type || 'Document'} uploaded${record.load ? ` for ${record.load}` : ''}`, role: 'admin', relatedLoadId: record.load, relatedDocId: record.id, relatedPage: 'documents', createdBy: authUser.email });
          const documentLoad = db.loads.find(load => String(load.id) === String(record.load || record.loadId || ''));
          const documentDriverEmail = sanitizeText(record.driverEmail || documentLoad?.driverEmail || '');
          const documentDriverName = sanitizeText(record.driver || documentLoad?.driver || '');
          if (documentDriverEmail || documentDriverName) addNotification(db, { title: 'Document uploaded', text: `${record.type || 'Document'} received${record.load ? ` for ${record.load}` : ''}`, target: documentDriverEmail, targetName: documentDriverEmail ? '' : documentDriverName, role: 'driver', relatedLoadId: record.load, relatedDocId: record.id, relatedPage: 'documents', createdBy: authUser.email });
        }
        if (collection === 'reminders') {
          addNotification(db, { title: 'New reminder set', text: `${record.category}${record.dueDate ? ` due ${record.dueDate}` : ''}`, target: record.driverEmail, targetName: record.driverEmail ? '' : record.driverName, role: 'driver', relatedPage: 'driver-mobile', createdBy: authUser.email });
        }
        if (collection === 'docFolders') {
          addNotification(db, { title: 'New document folder', text: `Folder "${record.name}" was created for you`, target: record.driverEmail, targetName: record.driverEmail ? '' : record.driverName, role: 'driver', relatedPage: 'documents', createdBy: authUser.email });
        }
        logAudit(db, `${collection} created`, record.id, authUser.email);
        writeDb(db);
        sendJson(res, 201, collection === 'notifications' ? decorateNotificationForUser(record, authUser) : record);
        return;
      }

      if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
        const body = await readJsonBody(req);
        const index = db[collection].findIndex(item => String(item.id) === String(id));
        if (index === -1) {
          sendJson(res, 404, { error: 'Record not found.' });
          return;
        }
        if (!canPatchRecord(db, authUser, collection, db[collection][index], body)) {
          sendJson(res, 403, { error: 'You do not have permission to update this record.' });
          return;
        }
        const beforeRecord = { ...db[collection][index] };
        const allowedDriverFields = authUser.role === 'driver' && collection === 'loads' ? { status: body.status } : body;
        if (collection === 'loads' && authUser.role !== 'driver' && (allowedDriverFields.driver || allowedDriverFields.driverEmail)) {
          const candidateName = allowedDriverFields.driver || beforeRecord.driver;
          const candidateEmail = allowedDriverFields.driverEmail || beforeRecord.driverEmail;
          const blocking = blockingLoadForDriver(db, candidateName, candidateEmail, id);
          if (blocking) {
            sendJson(res, 409, { error: `This driver still has active load ${blocking.id}. The load must be delivered and its BOL and POD approved before a new load can be assigned.` });
            return;
          }
        }
        db[collection][index] = prepareRecord(collection, allowedDriverFields, db[collection][index]);
        if (collection === 'loads') enrichLoadAccountLinks(db, db[collection][index]);
        if (collection === 'loads') {
          const updated = db[collection][index];
          const changed = changedFields(beforeRecord, updated, ['status','driver','truck','pickupTime','deliveryTime','rate','miles','docs','brokerMc','rtsStatus','internalNotes','brokerNotes','notes']);
          if (updated.brokerMc && beforeRecord.brokerMc !== updated.brokerMc) {
            const rts = await checkRtsFinancialStatus({ mcNumber: updated.brokerMc, broker: updated.broker, loadId: updated.id, orderNumber: updated.poNumber || updated.reference || '' });
            applyRtsResultToLoad(updated, rts);
            addActivity(db, { loadId: updated.id, title: 'RTS Financial MC check', text: `${updated.brokerMc}: ${updated.rtsStatus || 'Not checked'}`, actor: authUser.email, type: 'rts' });
          }
          if (changed.length) addActivity(db, { loadId: updated.id, title: 'Load updated', text: `Changed: ${changed.join(', ')}`, actor: authUser.email, type: 'update' });
          const driverChanged = (beforeRecord.driver !== updated.driver || beforeRecord.driverEmail !== updated.driverEmail) && (updated.driver || updated.driverEmail);
          if (driverChanged) {
            notifyLoadAudience(db, updated, 'New load assigned', `${updated.id} assigned to ${updated.driver || updated.driverEmail}`, authUser.email, 'info');
          } else if (beforeRecord.status !== updated.status) {
            notifyLoadAudience(db, updated, 'Driver status changed', `${updated.id} changed from ${beforeRecord.status || 'New'} to ${updated.status}`, authUser.email, updated.status === 'Problem / Delayed' ? 'warning' : 'info');
          }
        }
        if (collection === 'docs' && beforeRecord.status !== db[collection][index].status) {
          if (db[collection][index].status === 'Approved') { db[collection][index].approvedBy = authUser.email; db[collection][index].approvedAt = new Date().toISOString(); }
          if (db[collection][index].status === 'Rejected') { db[collection][index].rejectedBy = authUser.email; db[collection][index].rejectedAt = new Date().toISOString(); }
          if (db[collection][index].load) addActivity(db, { loadId: db[collection][index].load, title: `Document ${db[collection][index].status}`, text: `${db[collection][index].type || 'Document'} ${db[collection][index].status.toLowerCase()}${db[collection][index].rejectionReason ? ': ' + db[collection][index].rejectionReason : ''}`, actor: authUser.email, type: 'document' });
          addNotification(db, { title: `Document ${db[collection][index].status}`, text: `${db[collection][index].type || 'Document'} for load ${db[collection][index].load || '-'}`, role: 'dispatcher', relatedLoadId: db[collection][index].load, relatedDocId: db[collection][index].id, relatedPage: 'documents', createdBy: authUser.email });
          addNotification(db, { title: `Document ${db[collection][index].status}`, text: `${db[collection][index].type || 'Document'} for load ${db[collection][index].load || '-'}`, role: 'admin', relatedLoadId: db[collection][index].load, relatedDocId: db[collection][index].id, relatedPage: 'documents', createdBy: authUser.email });
          const statusDocument = db[collection][index];
          const statusLoad = db.loads.find(load => String(load.id) === String(statusDocument.load || statusDocument.loadId || ''));
          const statusDriverEmail = sanitizeText(statusDocument.driverEmail || statusLoad?.driverEmail || '');
          const statusDriverName = sanitizeText(statusDocument.driver || statusLoad?.driver || '');
          if (statusDriverEmail || statusDriverName) addNotification(db, { title: `Document ${statusDocument.status}`, text: `${statusDocument.type || 'Document'} for load ${statusDocument.load || '-'}`, target: statusDriverEmail, targetName: statusDriverEmail ? '' : statusDriverName, role: 'driver', relatedLoadId: statusDocument.load, relatedDocId: statusDocument.id, relatedPage: 'driver-mobile', createdBy: authUser.email });
        }
        if (collection === 'reminders' && beforeRecord.status !== db[collection][index].status) {
          const reminder = db[collection][index];
          if (reminder.status === 'Waiting for approval') {
            reminder.submittedAt = reminder.submittedAt || new Date().toISOString();
            addNotification(db, { title: 'Reminder proof submitted', text: `${reminder.driverName || reminder.driverEmail} submitted proof for ${reminder.category}`, role: 'dispatcher', relatedPage: 'driver-mobile', createdBy: authUser.email });
            addNotification(db, { title: 'Reminder proof submitted', text: `${reminder.driverName || reminder.driverEmail} submitted proof for ${reminder.category}`, role: 'admin', relatedPage: 'driver-mobile', createdBy: authUser.email });
          }
          if (reminder.status === 'Approved') {
            reminder.approvedBy = authUser.email;
            reminder.approvedAt = new Date().toISOString();
            addNotification(db, { title: 'Reminder resolved', text: `${reminder.category} approved and cleared.`, target: reminder.driverEmail, targetName: reminder.driverEmail ? '' : reminder.driverName, role: 'driver', relatedPage: 'driver-mobile', createdBy: authUser.email });
          }
          if (reminder.status === 'Declined') {
            reminder.rejectedBy = authUser.email;
            reminder.rejectedAt = new Date().toISOString();
            addNotification(db, { title: 'Reminder proof declined', text: `${reminder.category}${reminder.rejectionReason ? `: ${reminder.rejectionReason}` : ''}`, target: reminder.driverEmail, targetName: reminder.driverEmail ? '' : reminder.driverName, role: 'driver', relatedPage: 'driver-mobile', createdBy: authUser.email });
          }
        }
        logAudit(db, `${collection} updated`, id, authUser.email);
        writeDb(db);
        sendJson(res, 200, collection === 'notifications' ? decorateNotificationForUser(db[collection][index], authUser) : db[collection][index]);
        return;
      }

      if (req.method === 'DELETE' && id) {
        if (!canDeleteRecord(authUser, collection)) { sendJson(res, 403, { error: 'Admin access is required to delete this record.' }); return; }
        const before = db[collection].length;
        db[collection] = db[collection].filter(item => String(item.id) !== String(id));
        if (db[collection].length === before) {
          sendJson(res, 404, { error: 'Record not found.' });
          return;
        }
        logAudit(db, `${collection} deleted`, id, authUser.email);
        writeDb(db);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    sendJson(res, 404, { error: 'API route not found.' });
  } catch (error) {
    const status = error instanceof SyntaxError ? 400 : 500;
    sendJson(res, status, { error: error.message || 'Server error.' });
  }
}

ensureStorage();

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, securityHeaders());
    res.end();
    return;
  }

  if (req.url === '/health') {
    sendJson(res, 200, { ok: true, app: 'JTS Logistics TMS', port: PORT, pdfExtraction: pdfExtractionDiagnostic(), pushNotifications: { configured: PUSH_ENABLED, publicKeyPresent: Boolean(VAPID_PUBLIC_KEY), privateKeyPresent: Boolean(VAPID_PRIVATE_KEY), keySource: VAPID_KEYS.source }, timestamp: new Date().toISOString() });
    return;
  }

  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }

  if (req.url.startsWith('/uploads/')) {
    const filePath = safeJoin(UPLOAD_DIR, req.url.replace('/uploads', ''));
    sendFile(res, filePath);
    return;
  }

  const filePath = safeJoin(PUBLIC_DIR, req.url);
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      sendFile(res, filePath);
    } else {
      sendFile(res, path.join(PUBLIC_DIR, 'index.html'));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const pdfReady = pdfExtractionDiagnostic();
  console.log(`JTS Logistics TMS running at http://localhost:${PORT}`);
  console.log(`Data file: ${DB_FILE}`);
  console.log('Production mode: login with a real user account.');
  console.log(`PDF extraction: text=${pdfReady.pdftotext ? 'ok' : 'built-in fallback'}; scanned OCR=${pdfReady.ocr ? 'ready' : 'not installed'}`);
  if (!pdfReady.ocr) {
    console.log('OCR note: scanned/image PDFs need Poppler pdftoppm + Tesseract. Text PDFs still work with the built-in extractor.');
  }
  console.log(`Push notifications: ${PUSH_ENABLED ? `configured (${VAPID_KEYS.source})` : 'not configured'}`);
});
