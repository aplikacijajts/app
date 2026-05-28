import { api, getToken } from './api.js';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function toast(message, type='info') {
  let wrap = $('#toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'enterprise-toast-wrap';
    document.body.appendChild(wrap);
  }
  const item = document.createElement('div');
  item.className = `enterprise-toast ${type}`;
  item.textContent = message;
  wrap.appendChild(item);
  setTimeout(() => item.classList.add('show'), 20);
  setTimeout(() => { item.classList.remove('show'); setTimeout(()=>item.remove(), 350); }, 3800);
}

async function loadDashboard() {
  const root = $('#live-dashboard');
  if (!root) return;
  try {
    const data = await api('/api/realtime/dashboard');
    const m = data.metrics || {};
    root.innerHTML = `
      <section class="enterprise-kpis">
        <div class="kpi-card"><span>Active Loads</span><strong>${m.activeLoads ?? 0}</strong><small>Active</small></div>
        <div class="kpi-card"><span>Drivers</span><strong>${m.drivers ?? 0}</strong><small>Fleet</small></div>
        <div class="kpi-card"><span>Documents</span><strong>${m.documents ?? 0}</strong><small>Files</small></div>
        <div class="kpi-card"><span>Alerts</span><strong>${m.unreadNotifications ?? 0}</strong><small>Alerts</small></div>
      </section>
      <section class="enterprise-grid-two">
        <div class="enterprise-panel"><h3>Dispatch Timeline</h3>${(data.timeline||[]).map(x=>`<div class="timeline-row"><b>${x.event}</b><span>${new Date(x.at).toLocaleString()}</span></div>`).join('') || '<p class="muted">No recent activity</p>'}</div>
        <div class="enterprise-panel"><h3>Notifications</h3>${(data.notifications||[]).map(x=>`<div class="notice-row"><b>${x.title||'Notification'}</b><span>${x.message||''}</span></div>`).join('') || '<p class="muted">No new notifications</p>'}</div>
      </section>`;
  } catch (e) { root.innerHTML = `<div class="enterprise-panel error">${e.message}</div>`; }
}

async function loadMap() {
  const root = $('#live-map');
  if (!root) return;
  try {
    const data = await api('/api/map/vehicles');
    const vehicles = data.vehicles || [];
    root.innerHTML = `<div class="map-stage">${vehicles.map((v,i)=>`<button class="truck-marker" style="left:${8+(i*13)%82}%;top:${14+(i*17)%70}%" title="${v.driver}">🚚</button>`).join('')}<div class="map-label">Fleet Map</div></div><div class="enterprise-panel">${vehicles.map(v=>`<div class="vehicle-row"><b>${v.driver}</b><span>${v.status}</span><em>ETA: ${v.eta}</em></div>`).join('') || '<p class="muted">No vehicles online</p>'}</div>`;
  } catch(e) { root.innerHTML = `<div class="enterprise-panel error">${e.message}</div>`; }
}

async function askAI() {
  const input = $('#ai-question');
  const out = $('#ai-answer');
  if (!input || !out) return;
  const message = input.value.trim();
  if (!message) return toast('Enter a question');
  out.textContent = 'Working...';
  try {
    const r = await api('/api/ai/assistant', { method:'POST', body:{ message } });
    out.textContent = r.answer;
  } catch(e) { out.textContent = e.message; }
}

function initSocket() {
  if (!getToken() || !window.io) return;
  const socket = window.io();
  socket.on('connected', () => toast('Live connection active', 'success'));
  socket.on('notification:new', n => toast(n.title || 'New notification', n.type || 'info'));
}

function initOnboarding() {
  const root = $('#onboarding-wizard');
  if (!root) return;
  const steps = ['Company','Users','Vehicles','Drivers','Notifications'];
  root.innerHTML = steps.map((s,i)=>`<div class="wizard-step ${i===0?'active':''}"><span>${i+1}</span><b>${s}</b><small>${i===0?'Active':'Next'}</small></div>`).join('');
}

window.Enterprise = { loadDashboard, loadMap, askAI, toast };

document.addEventListener('click', e => {
  if (e.target.matches('[data-ai-send]')) askAI();
});

document.addEventListener('DOMContentLoaded', () => {
  initOnboarding();
  loadDashboard();
  loadMap();
  initSocket();
  setInterval(loadDashboard, 15000);
});

function injectEnterpriseDock(){ return; }
document.addEventListener('DOMContentLoaded', injectEnterpriseDock);
