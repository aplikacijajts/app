import { api, getToken } from "./api.js";
const list = document.getElementById('notificationsList');
const status = document.getElementById('status');
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function targetUrl(n){
  if (n?.data?.url) return n.data.url;
  if (n?.data?.loadId) return `/driver.html?load=${encodeURIComponent(n.data.loadId)}`;
  if (n?.data?.docId) return `/driver.html`;
  return '';
}
function render(rows){
  if(!rows.length){list.innerHTML='<div class="jts-empty">No notifications yet.</div>';return;}
  list.innerHTML=rows.map(n=>{
    const url=targetUrl(n);
    const action=url?`<button class="jts-btn" data-notification-open="${esc(n.id)}" data-url="${esc(url)}">Open</button>`:'';
    return `<article class="jts-notification-card ${n.readAt||n.read?'':'unread'}" data-notification-card="${esc(n.id)}" data-url="${esc(url)}"><div><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${new Date(n.createdAt).toLocaleString()}</small></div>${action}</article>`;
  }).join('');
  list.querySelectorAll('[data-url]').forEach(el=>{
    el.addEventListener('click', async ev=>{
      ev.preventDefault(); ev.stopPropagation();
      const id=el.getAttribute('data-notification-open') || el.getAttribute('data-notification-card');
      const url=el.getAttribute('data-url');
      if(id) { try{ await api(`/api/notifications/${encodeURIComponent(id)}/read`,{method:'POST',body:{}}); }catch{} }
      if(url) location.href=url;
    });
  });
}
async function load(){try{const rows=await api('/api/notifications/my?limit=150');render(rows);status.textContent='Live';}catch(e){status.textContent=e.message}}
async function init(){if(!getToken())location.href='/index.html';document.getElementById('readAll').onclick=async()=>{await api('/api/notifications/read-all',{method:'POST',body:{}});await load()};await load();const es=new EventSource(`/api/notifications/stream?token=${encodeURIComponent(getToken())}`);es.addEventListener('notification',load)}
init();
