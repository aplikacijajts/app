import { api, getToken } from './api.js';
const list = document.getElementById('notificationsList');
const status = document.getElementById('status');
function esc(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function render(rows){
  if(!rows.length){list.innerHTML='<div class="jts-empty">No notifications yet.</div>';return;}
  list.innerHTML=rows.map(n=>`<article class="jts-notification-card ${n.readAt||n.read?'':'unread'}"><div><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${new Date(n.createdAt).toLocaleString()}</small></div>${n.data?.url?`<a class="jts-btn" href="${esc(n.data.url)}">Open</a>`:''}</article>`).join('');
}
async function load(){try{const rows=await api('/api/notifications/my?limit=150');render(rows);status.textContent='Live';}catch(e){status.textContent=e.message}}
async function init(){if(!getToken())location.href='/index.html';document.getElementById('readAll').onclick=async()=>{await api('/api/notifications/read-all',{method:'POST'});await load()};await load();const es=new EventSource(`/api/notifications/stream?token=${encodeURIComponent(getToken())}`);es.addEventListener('notification',load)}
document.addEventListener('DOMContentLoaded',init,{once:true});
