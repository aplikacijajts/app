import { api, getToken } from './api.js';

const $ = (id) => document.getElementById(id);
const state = { contacts: [], active: null, messages: [] };

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

function user() {
  try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; }
}

function fmt(ts) {
  if (!ts) return '';
  try { return new Date(ts).toLocaleString([], { month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return ts; }
}

function setStatus(text, type='muted') {
  const el = $('chatStatus');
  if (!el) return;
  el.textContent = text || '';
  el.className = `jts-chat-status ${type}`;
}

function renderContacts() {
  const wrap = $('contactList');
  if (!wrap) return;
  if (!state.contacts.length) {
    wrap.innerHTML = '<div class="jts-empty">No available contacts for your role.</div>';
    return;
  }
  wrap.innerHTML = state.contacts.map(c => `
    <button class="jts-contact ${state.active?.id === c.id ? 'active' : ''}" data-contact="${escapeHtml(c.id)}">
      <span class="jts-avatar">${escapeHtml((c.name || c.email || 'U').slice(0,1).toUpperCase())}</span>
      <span class="jts-contact-main">
        <strong>${escapeHtml(c.name || c.email)}</strong>
        <small>${escapeHtml(c.role)}${c.lastMessage ? ' · ' + escapeHtml(c.lastMessage.text).slice(0,45) : ''}</small>
      </span>
      ${c.unread ? `<span class="jts-unread">${c.unread}</span>` : ''}
    </button>
  `).join('');
  wrap.querySelectorAll('[data-contact]').forEach(btn => btn.addEventListener('click', () => openContact(btn.dataset.contact)));
}

function renderMessages() {
  const wrap = $('messageList');
  const me = user();
  if (!wrap) return;
  if (!state.active) {
    wrap.innerHTML = '<div class="jts-chat-welcome"><h2>Messages</h2><p>Select a conversation to start secure real-time messaging.</p></div>';
    $('activeName').textContent = 'Select conversation';
    $('activeMeta').textContent = 'Role-based secure chat';
    return;
  }
  $('activeName').textContent = state.active.name || state.active.email;
  $('activeMeta').textContent = `${state.active.role} · secure conversation`;
  if (!state.messages.length) {
    wrap.innerHTML = '<div class="jts-empty">No messages yet. Start the conversation.</div>';
  } else {
    wrap.innerHTML = state.messages.map(m => {
      const mine = m.fromUserId === me.id;
      return `<div class="jts-message-row ${mine ? 'mine' : 'theirs'}">
        <div class="jts-message-bubble">
          <div>${escapeHtml(m.text)}</div>
          <small>${fmt(m.createdAt)}</small>
        </div>
      </div>`;
    }).join('');
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
  const data = await api(`/api/chat/messages/${encodeURIComponent(id)}`);
  state.messages = data.messages || [];
  if (refreshContacts) await loadContacts(id);
  renderMessages();
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
}

async function init() {
  if (!getToken()) location.href = '/index.html';
  $('meName').textContent = user().name || 'JTS User';
  $('meRole').textContent = user().role || '';
  $('messageForm').addEventListener('submit', sendMessage);
  $('messageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) sendMessage(e); });
  try {
    await loadContacts();
    initStream();
    setStatus('Online', 'ok');
  } catch (err) {
    setStatus(err.message || 'Failed to load chat', 'error');
  }
}

document.addEventListener('DOMContentLoaded', init, { once:true });
