import { api, getToken } from './api.js';

const $ = (id) => document.getElementById(id);
const state = { contacts: [], active: null, messages: [], query: '' };

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function parseTokenUser() {
  const token = getToken();
  if (!token) return {};
  try {
    let payload = token.split('.')[1] || '';
    payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    while (payload.length % 4) payload += '=';
    const decoded = JSON.parse(atob(payload));
    return { id: decoded.sub, name: decoded.name, email: decoded.email, role: decoded.role, companyId: decoded.companyId };
  } catch {
    return {};
  }
}

function user() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch { stored = {}; }
  const tokenUser = parseTokenUser();
  return { ...stored, ...tokenUser, id: stored.id || tokenUser.id || stored.sub || tokenUser.sub };
}

function initials(nameOrEmail = 'JTS') {
  const cleaned = String(nameOrEmail || 'JTS').trim();
  if (!cleaned) return 'J';
  const parts = cleaned.replace(/@.*/, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

function roleClass(role = '') {
  return 'role-' + String(role || 'user').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

function roleLabel(role = '') {
  const r = String(role || 'user').toLowerCase();
  return r.charAt(0).toUpperCase() + r.slice(1);
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function fmtTime(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }); } catch { return ts; }
}

function fmtDateDivider(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yesterday)) return 'Yesterday';
    return d.toLocaleDateString([], { weekday:'short', month:'short', day:'2-digit', year:'numeric' });
  } catch { return ts; }
}

function previewText(message) {
  if (!message?.text) return '';
  const text = String(message.text).replace(/\s+/g, ' ').trim();
  return text.length > 52 ? text.slice(0, 49) + '...' : text;
}

function setStatus(text, type='muted') {
  const el = $('chatStatus');
  if (!el) return;
  el.textContent = text || '';
  el.className = `jts-page-badge jts-chat-status ${type}`;
}

function contactMatches(c) {
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return [c.name, c.email, c.role, c.phone, c.truckNumber, c.trailerNumber]
    .filter(Boolean)
    .some(v => String(v).toLowerCase().includes(q));
}

function renderContacts() {
  const wrap = $('contactList');
  if (!wrap) return;
  const rows = state.contacts.filter(contactMatches);
  if (!state.contacts.length) {
    wrap.innerHTML = '<div class="jts-empty">No available contacts for your role.</div>';
    return;
  }
  if (!rows.length) {
    wrap.innerHTML = '<div class="jts-empty">No contacts match your search.</div>';
    return;
  }
  wrap.innerHTML = rows.map(c => {
    const active = state.active?.id === c.id;
    const name = c.name || c.email || 'User';
    const metaParts = [roleLabel(c.role)];
    if (c.truckNumber) metaParts.push('Truck ' + c.truckNumber);
    if (c.lastMessage) metaParts.push(previewText(c.lastMessage));
    return `
      <button class="jts-contact ${active ? 'active' : ''}" data-contact="${escapeHtml(c.id)}" type="button" aria-pressed="${active ? 'true' : 'false'}">
        <span class="jts-avatar ${roleClass(c.role)}">${escapeHtml(initials(name))}</span>
        <span class="jts-contact-main">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(metaParts.filter(Boolean).join(' · '))}</small>
        </span>
        ${c.unread ? `<span class="jts-unread" aria-label="${c.unread} unread messages">${c.unread}</span>` : '<span class="jts-role-badge">' + escapeHtml(roleLabel(c.role).slice(0,3)) + '</span>'}
      </button>`;
  }).join('');
  wrap.querySelectorAll('[data-contact]').forEach(btn => btn.addEventListener('click', () => openContact(btn.dataset.contact)));
}

function setActiveHeader() {
  const activeName = $('activeName');
  const activeMeta = $('activeMeta');
  const activeAvatar = $('activeAvatar');
  const activeRole = $('activeRole');
  if (!state.active) {
    if (activeName) activeName.textContent = 'Select conversation';
    if (activeMeta) activeMeta.textContent = 'Role-based secure chat';
    if (activeAvatar) { activeAvatar.textContent = 'J'; activeAvatar.className = 'jts-avatar'; }
    if (activeRole) activeRole.textContent = 'Secure';
    return;
  }
  const name = state.active.name || state.active.email || 'User';
  if (activeName) activeName.textContent = name;
  if (activeMeta) {
    const parts = [roleLabel(state.active.role), state.active.email];
    if (state.active.truckNumber) parts.push('Truck ' + state.active.truckNumber);
    activeMeta.textContent = parts.filter(Boolean).join(' · ');
  }
  if (activeAvatar) { activeAvatar.textContent = initials(name); activeAvatar.className = 'jts-avatar ' + roleClass(state.active.role); }
  if (activeRole) activeRole.textContent = roleLabel(state.active.role);
}

function messageSender(m, me) {
  const mine = m.fromUserId === me.id;
  if (mine) return { mine, name: 'You', role: me.role || 'user', avatar: initials(me.name || me.email || 'You') };
  const other = state.active || {};
  return { mine, name: other.name || other.email || 'Contact', role: other.role || 'user', avatar: initials(other.name || other.email || 'Contact') };
}

function renderMessages() {
  const wrap = $('messageList');
  const me = user();
  if (!wrap) return;
  setActiveHeader();
  if (!state.active) {
    wrap.innerHTML = '<div class="jts-chat-welcome"><h2>Messages</h2><p>Select a conversation to start secure real-time messaging.</p></div>';
    return;
  }
  if (!state.messages.length) {
    wrap.innerHTML = '<div class="jts-empty">No messages yet. Start the conversation.</div>';
  } else {
    let lastDate = null;
    const html = [];
    state.messages.forEach(m => {
      const created = m.createdAt ? new Date(m.createdAt) : null;
      if (created && (!lastDate || !sameDay(created, lastDate))) {
        html.push(`<div class="jts-date-divider">${escapeHtml(fmtDateDivider(m.createdAt))}</div>`);
        lastDate = created;
      }
      const sender = messageSender(m, me);
      const readState = sender.mine ? (m.readAt ? 'Read' : 'Sent') : '';
      html.push(`<div class="jts-message-row ${sender.mine ? 'mine' : 'theirs'}">
        <span class="jts-avatar jts-message-avatar ${roleClass(sender.role)}">${escapeHtml(sender.avatar)}</span>
        <div class="jts-message-stack">
          <div class="jts-message-name"><span>${escapeHtml(sender.name)}</span><span>·</span><span>${escapeHtml(roleLabel(sender.role))}</span></div>
          <div class="jts-message-bubble">
            <div>${escapeHtml(m.text)}</div>
            <small class="jts-message-time"><span>${escapeHtml(fmtTime(m.createdAt))}</span>${readState ? `<span class="jts-message-status">${escapeHtml(readState)}</span>` : ''}</small>
          </div>
        </div>
      </div>`);
    });
    wrap.innerHTML = html.join('');
  }
  wrap.scrollTop = wrap.scrollHeight;
}

async function loadContacts(selectId = null) {
  const data = await api('/api/chat/contacts');
  state.contacts = data.contacts || [];
  renderContacts();
  const query = new URLSearchParams(location.search).get('user');
  const pick = selectId || query || state.active?.id || state.contacts[0]?.id;
  if (pick && state.contacts.some(c => c.id === pick)) await openContact(pick, false);
}

async function openContact(id, refreshContacts = true) {
  state.active = state.contacts.find(c => c.id === id) || null;
  renderContacts();
  renderMessages();
  if (!state.active) return;
  setStatus('Loading messages', 'muted');
  const data = await api(`/api/chat/messages/${encodeURIComponent(id)}`);
  state.messages = data.messages || [];
  if (refreshContacts) await loadContacts(id);
  renderMessages();
  setStatus('Online', 'ok');
}

async function sendMessage(e) {
  e?.preventDefault();
  if (!state.active) return setStatus('Select a contact first.', 'error');
  const input = $('messageInput');
  const text = input.value.trim();
  if (!text) return;
  input.disabled = true;
  try {
    const data = await api(`/api/chat/messages/${encodeURIComponent(state.active.id)}`, { method:'POST', body:{ text } });
    state.messages.push(data.message);
    input.value = '';
    autoSizeInput(input);
    renderMessages();
    await loadContacts(state.active.id);
    setStatus('Sent', 'ok');
  } catch (err) {
    setStatus(err.message || 'Failed to send message', 'error');
  } finally {
    input.disabled = false;
    input.focus();
  }
}

function initStream() {
  const token = getToken();
  if (!token) return;
  const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
  es.addEventListener('notification', async (ev) => {
    try {
      const payload = JSON.parse(ev.data || '{}');
      const n = payload.notification || payload;
      if (n.type === 'chat_message') {
        await loadContacts(state.active?.id);
        const fromId = n.data?.fromUserId;
        if (state.active && fromId === state.active.id) await openContact(state.active.id, false);
      }
    } catch {}
  });
  es.addEventListener('error', () => setStatus('Reconnecting', 'muted'));
}

function autoSizeInput(input) {
  if (!input) return;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 140) + 'px';
}

async function init() {
  if (!getToken()) location.href = '/index.html';
  const me = user();
  $('meName').textContent = me.name || me.email || 'JTS User';
  $('meRole').textContent = roleLabel(me.role || 'user');
  const meAvatar = $('meAvatar');
  if (meAvatar) { meAvatar.textContent = initials(me.name || me.email || 'JTS'); meAvatar.className = 'jts-avatar large ' + roleClass(me.role); }
  $('messageForm').addEventListener('submit', sendMessage);
  const input = $('messageInput');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e); });
  input.addEventListener('input', () => autoSizeInput(input));
  const search = $('contactSearch');
  if (search) search.addEventListener('input', () => { state.query = search.value || ''; renderContacts(); });
  try {
    await loadContacts();
    initStream();
    setStatus('Online', 'ok');
  } catch (err) {
    setStatus(err.message || 'Failed to load chat', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init, { once:true });
