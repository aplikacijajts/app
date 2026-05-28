const API_BASE = "";
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = (s="") => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));

function decodeJwt(t){
  try{
    const payload = String(t||"").split(".")[1];
    if(!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/")));
  }catch{ return null; }
}
function token(){ return localStorage.getItem("token") || localStorage.getItem("jts_token") || localStorage.getItem("authToken") || ""; }
function user(){
  try {
    const stored = JSON.parse(localStorage.getItem("user") || localStorage.getItem("jts_user") || "null");
    if(stored && stored.role) return stored;
  } catch {}
  const payload = decodeJwt(token());
  if(!payload || !payload.role) return null;
  if(payload.exp && Date.now() >= payload.exp * 1000){ clearSession(false); return null; }
  const normalized = { id: payload.sub || payload.id, name: payload.name || "User", role: payload.role, companyId: payload.companyId || "jts-logistics" };
  try{ localStorage.setItem("user", JSON.stringify(normalized)); localStorage.setItem("jts_user", JSON.stringify(normalized)); }catch{}
  return normalized;
}
function setSession(data){
  const t = data && data.token;
  const u = (data && data.user) || decodeJwt(t) || {};
  const normalized = { id: u.id || u.sub, name: u.name || "User", role: u.role, companyId: u.companyId || "jts-logistics" };
  if(!t || !normalized.role) throw new Error("Invalid login response");
  localStorage.setItem("token", t);
  localStorage.setItem("jts_token", t);
  localStorage.setItem("authToken", t);
  localStorage.setItem("user", JSON.stringify(normalized));
  localStorage.setItem("jts_user", JSON.stringify(normalized));
}
function clearSession(redirect=true){
  ["token","jts_token","authToken","user","jts_user"].forEach(k=>localStorage.removeItem(k));
  if(redirect) location.href = "/index.html";
}
function logout(){ clearSession(true); }
function roleHome(role){ return role === "admin" ? "/admin.html" : role === "dispatcher" ? "/dispatcher.html" : role === "broker" ? "/broker.html" : "/driver.html"; }
function safeNext(){
  const next = new URLSearchParams(location.search).get("next");
  if(!next) return "";
  try{
    const url = new URL(next, location.origin);
    if(url.origin !== location.origin) return "";
    if(["/index.html","/register.html","/home.html","/"].includes(url.pathname)) return "";
    return url.pathname + url.search + url.hash;
  }catch{ return ""; }
}

async function api(path, opts={}){
  const headers = opts.headers || {};
  if (token()) headers.Authorization = "Bearer " + token();
  if (opts.body && !(opts.body instanceof FormData)) headers["Content-Type"] = "application/json";
  const res = await fetch(API_BASE + path, { ...opts, headers, body: opts.body ? (opts.body instanceof FormData ? opts.body : JSON.stringify(opts.body)) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function protect(roles=[]){
  const t = token();
  const u = user();
  if (!t || !u) { location.replace("/index.html?next=" + encodeURIComponent(location.pathname + location.search)); return null; }
  if (roles.length && !roles.includes(u.role)) { location.replace(roleHome(u.role)); return null; }
  return u;
}

function layout(title, desc, active, roles=[]){
  const u = protect(roles); if (!u) return;
  const nav = navItems(u.role);
  document.body.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="side-brand"><img src="/assets/jts-logo.png" alt="JTS"><div><div class="side-name">JTS Logistics</div><div class="side-role">${esc(u.role)} workspace</div></div></div>
        <nav class="nav">${nav.map(n => `<a href="${n.href}" class="${n.key===active?'active':''}"><span>${n.icon}</span>${n.label}</a>`).join("")}<button id="logoutSide"><span>⎋</span>Sign out</button></nav>
        <div class="side-footer">Signed in as<br><b>${esc(u.name || "User")}</b></div>
      </aside>
      <main class="main">
        <div class="topbar"><div><div class="page-kicker">JTS Logistics</div><h1 class="page-title">${esc(title)}</h1><p class="page-desc">${esc(desc)}</p></div><button class="btn btn-ghost" id="refreshBtn">↻ Refresh</button></div>
        <div id="app"></div>
      </main>
    </div>
    <button class="mobile-menu-btn" id="mobileBtn">☰</button>
    <div class="mobile-sheet" id="mobileSheet"><div class="sheet-panel"><div class="sheet-handle"></div><div class="brand-row"><img src="/assets/jts-logo.png" class="brand-logo" alt="JTS"><div><div class="brand-title">JTS Logistics</div><div class="brand-sub">${esc(u.role)} menu</div></div></div><div class="sheet-grid">${nav.map(n => `<a href="${n.href}">${n.icon} ${n.label}<small>${n.short}</small></a>`).join("")}<button id="logoutMobile">⎋ Sign out<small>Secure logout</small></button></div></div></div>
    <div class="toast-wrap" id="toasts"></div>`;
  $("#logoutSide")?.addEventListener("click", logout); $("#logoutMobile")?.addEventListener("click", logout);
  $("#mobileBtn")?.addEventListener("click", () => $("#mobileSheet").classList.add("open"));
  $("#mobileSheet")?.addEventListener("click", e => { if (e.target.id === "mobileSheet") e.currentTarget.classList.remove("open"); });
  $("#refreshBtn")?.addEventListener("click", () => location.reload());
  return u;
}

function navItems(role){
  const common = [{key:"dashboard",label:"Dashboard",href:"/app.html",icon:"◈",short:"Overview"},{key:"notifications",label:"Notifications",href:"/notifications.html",icon:"●",short:"Inbox"}];
  if (role === "admin") return [{key:"admin",label:"Admin Console",href:"/admin.html",icon:"◆",short:"Users & access"},{key:"loads",label:"Loads",href:"/load-wizard.html",icon:"＋",short:"Create load"},{key:"audit",label:"Audit Timeline",href:"/audit.html",icon:"◷",short:"System activity"},...common];
  if (role === "dispatcher") return [{key:"dispatcher",label:"Dispatcher",href:"/dispatcher.html",icon:"◆",short:"My drivers"},{key:"loads",label:"Create Load",href:"/load-wizard.html",icon:"＋",short:"Assign load"},...common];
  if (role === "broker") return [{key:"broker",label:"Broker",href:"/broker.html",icon:"◆",short:"Broker workspace"},{key:"loads",label:"Create Load",href:"/load-wizard.html",icon:"＋",short:"New load"},...common];
  return [{key:"driver",label:"Driver Portal",href:"/driver.html",icon:"◆",short:"My loads"},...common];
}

function toast(title, message){
  const el = document.createElement("div"); el.className = "toast fade-in"; el.innerHTML = `<b>${esc(title)}</b><div style="color:#64748b;font-size:13px;margin-top:4px">${esc(message)}</div>`; $("#toasts")?.appendChild(el); setTimeout(()=>el.remove(),4500);
}
function badge(v){ return `<span class="badge ${esc(v)}">${esc(v || "-")}</span>`; }
function statusBadge(v){ return `<span class="badge status ${esc(v)}">${esc(String(v||"active").replaceAll("_"," "))}</span>`; }
function rowEmpty(label){ return `<div class="empty">${esc(label)}</div>`; }

async function renderDashboard(){
  layout("Operations Dashboard", "A clean overview of your live operation, notifications and latest activity.", "dashboard");
  const r = await api("/api/realtime/dashboard");
  const m = r.metrics || {};
  $("#app").innerHTML = `
    <section class="grid grid-4">
      ${metric("Active loads", m.activeLoads, "Open and in progress")}
      ${metric("Drivers", m.drivers, "Visible to your role")}
      ${metric("Documents", m.documents, "Uploaded files")}
      ${metric("Unread", m.unreadNotifications, "Notifications")}
    </section>
    <section class="grid grid-2" style="margin-top:16px">
      <div class="card"><h2 class="section-title">Recent Loads</h2>${loadsTable(r.loads || [])}</div>
      <div class="card"><h2 class="section-title">Activity Timeline</h2>${timeline(r.timeline || [])}</div>
    </section>`;
}
function metric(label,value,note){ return `<div class="card metric"><div class="metric-label">${label}</div><div class="metric-value">${value ?? 0}</div><div class="metric-note">${note}</div></div>`; }
function loadsTable(loads){ if(!loads.length) return rowEmpty("No loads yet."); return `<div class="table-wrap"><table class="table"><thead><tr><th>Load</th><th>Customer</th><th>Status</th><th>Docs</th></tr></thead><tbody>${loads.map(l=>`<tr><td><b>${esc(l.loadNumber)}</b></td><td>${esc(l.customer||'-')}</td><td>${statusBadge(l.status)}</td><td>${esc(l.missingCount ?? 0)} missing</td></tr>`).join("")}</tbody></table></div>`; }
function timeline(rows){ if(!rows.length) return rowEmpty("No activity yet."); return `<div class="timeline">${rows.slice(0,12).map(x=>`<div class="timeline-item"><div class="timeline-title">${esc(x.event||x.type||'Activity')}</div><div class="timeline-meta">${esc(new Date(x.at||x.createdAt||Date.now()).toLocaleString())}</div></div>`).join("")}</div>`; }

async function renderAdmin(){
  layout("Admin Console", "Manage users, roles, driver visibility, approvals, assignments and production activity.", "admin", ["admin"]);
  $("#app").innerHTML = `<section class="grid grid-4" id="adminMetrics"></section><section class="grid grid-2" style="margin-top:16px"><div class="card"><h2 class="section-title">Create User</h2>${userForm()}</div><div class="card"><h2 class="section-title">Driver Assignments</h2><div id="assignmentBox">Loading...</div></div></section><section class="card" style="margin-top:16px"><div class="toolbar"><h2 class="section-title" style="margin-right:auto">Users</h2><select id="roleFilter" class="select" style="max-width:190px"><option value="">All roles</option><option>admin</option><option>dispatcher</option><option>driver</option><option>broker</option></select></div><div id="usersBox">Loading...</div></section><section class="card" style="margin-top:16px"><h2 class="section-title">Audit Timeline</h2><div id="auditBox">Loading...</div></section>`;
  $("#createUserForm").addEventListener("submit", createUser);
  $("#roleFilter").addEventListener("change", loadUsers);
  await Promise.all([loadAdminSummary(), loadUsers(), loadAssignments(), loadAudit()]);
}
function userForm(){return `<form id="createUserForm" class="grid"><label class="field"><span>Full name</span><input class="input" name="name" required></label><label class="field"><span>Email</span><input class="input" name="email" type="email" required></label><div class="grid grid-2"><label class="field"><span>Role</span><select class="select" name="role" required><option value="dispatcher">Dispatcher</option><option value="driver">Driver</option><option value="broker">Broker</option><option value="admin">Admin</option></select></label><label class="field"><span>Password</span><input class="input" name="password" type="password" required></label></div><label class="field"><span>Phone</span><input class="input" name="phone"></label><button class="btn btn-primary">Create User</button></form>`}
async function createUser(e){e.preventDefault();const f=new FormData(e.target);await api('/api/admin/users',{method:'POST',body:Object.fromEntries(f.entries())});toast('User created','The user is ready to sign in.');e.target.reset();await Promise.all([loadUsers(),loadAssignments(),loadAdminSummary(),loadAudit()]);}
async function loadAdminSummary(){const s=await api('/api/admin/summary');const m=s.metrics||{};$('#adminMetrics').innerHTML=[metric('Users',m.users,'Approved accounts'),metric('Drivers',m.drivers,'Available drivers'),metric('Active loads',m.activeLoads,'Current operation'),metric('Assignments',m.assignments,'Dispatcher links')].join('');}
async function loadUsers(){const role=$('#roleFilter')?.value||'';const users=await api('/api/admin/users'+(role?`?role=${role}`:''));$('#usersBox').innerHTML=!users.length?rowEmpty('No users found.'):`<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>Action</th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${badge(u.role)}</td><td>${esc(u.companyId)}</td><td>${u.role==='admin'?'':`<button class="btn btn-danger btn-small" data-del="${u.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table></div>`;$$('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this user?')){await api('/api/admin/users/'+b.dataset.del,{method:'DELETE'});toast('User deleted','Access removed.');await Promise.all([loadUsers(),loadAssignments(),loadAdminSummary()]);}})}
async function loadAssignments(){const r=await api('/api/admin/assignments');const drivers=r.drivers||[];const rows=r.assignments||[];$('#assignmentBox').innerHTML=!rows.length?rowEmpty('Create dispatchers and drivers first.'):`<div class="grid">${rows.map(a=>`<div class="card" style="box-shadow:none;background:#f8fafc"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><b>${esc(a.dispatcher.name)}</b>${badge('dispatcher')}</div><div class="check-list" style="margin-top:12px">${drivers.map(d=>`<label class="check-row"><input type="checkbox" data-dispatcher="${a.dispatcher.id}" value="${d.id}" ${a.driverIds.includes(d.id)?'checked':''}> <span>${esc(d.name)}</span></label>`).join('')}</div><button class="btn btn-primary btn-small" style="margin-top:12px" data-save-assignment="${a.dispatcher.id}">Save assignment</button></div>`).join('')}</div>`;$$('[data-save-assignment]').forEach(btn=>btn.onclick=async()=>{const id=btn.dataset.saveAssignment;const ids=$$(`input[data-dispatcher="${id}"]:checked`).map(x=>x.value);await api('/api/admin/assignments/'+id,{method:'PUT',body:{driverIds:ids}});toast('Assignment saved','Dispatcher visibility updated.');await loadAudit();});}
async function loadAudit(){const rows=await api('/api/admin/audit?limit=80');$('#auditBox') && ($('#auditBox').innerHTML=timeline(rows));}

async function renderDispatcher(){
  layout("Dispatcher Workspace", "Only assigned drivers and related loads are shown here.", "dispatcher", ["dispatcher"]);
  const [drivers, loads] = await Promise.all([api('/api/users?role=driver'), api('/api/loads/all?view=all')]);
  $('#app').innerHTML=`<section class="grid grid-3">${metric('My drivers',drivers.length,'Assigned by admin')}${metric('Active loads',loads.filter(l=>!['closed','delivered'].includes(l.status)).length,'Visible loads')}${metric('Open docs',loads.reduce((a,l)=>a+(l.missingCount||0),0),'Missing required docs')}</section><section class="grid grid-2" style="margin-top:16px"><div class="card"><h2 class="section-title">Assigned Drivers</h2>${drivers.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th></tr></thead><tbody>${drivers.map(d=>`<tr><td><b>${esc(d.name)}</b></td><td>${esc(d.email)}</td><td>${esc(d.phone||'-')}</td></tr>`).join('')}</tbody></table></div>`:rowEmpty('No assigned drivers yet. Admin can assign drivers in Admin Console.')}</div><div class="card"><h2 class="section-title">Loads</h2>${loadsTable(loads)}</div></section>`;
}
async function renderDriver(){
  layout("Driver Portal", "View assigned loads, update status and follow required document workflow.", "driver", ["driver"]);
  const loads=await api('/api/loads?includeClosed=1');
  $('#app').innerHTML=`<section class="grid grid-3">${metric('My loads',loads.length,'Assigned to you')}${metric('Active',loads.filter(l=>!['closed','delivered'].includes(l.status)).length,'Open work')}${metric('Missing docs',loads.reduce((a,l)=>a+(l.missingCount||0),0),'POD/BOL')}</section><section class="card" style="margin-top:16px"><h2 class="section-title">Loads</h2>${driverLoads(loads)}</section>`;
  $$('[data-status]').forEach(b=>b.onclick=async()=>{await api('/api/loads/'+b.dataset.id+'/status',{method:'PATCH',body:{status:b.dataset.status}});toast('Status updated','Load status saved.');setTimeout(()=>location.reload(),500);});
}
function driverLoads(loads){if(!loads.length)return rowEmpty('No loads assigned yet.');return `<div class="grid">${loads.map(l=>`<div class="card" style="box-shadow:none"><div style="display:flex;justify-content:space-between;gap:12px;align-items:center"><div><b>${esc(l.loadNumber)}</b><div class="metric-note">${esc(l.customer||'Customer not set')}</div></div>${statusBadge(l.status)}</div><div class="grid grid-3" style="margin-top:12px"><button class="btn btn-ghost btn-small" data-id="${l.id}" data-status="picked_up">Picked up</button><button class="btn btn-ghost btn-small" data-id="${l.id}" data-status="in_transit">In transit</button><button class="btn btn-ok btn-small" data-id="${l.id}" data-status="delivered">Delivered</button></div></div>`).join('')}</div>`}
async function renderBroker(){ layout("Broker Workspace", "Create and track broker loads for JTS Logistics.", "broker", ["broker"]); const loads=await api('/api/loads?includeClosed=1'); $('#app').innerHTML=`<section class="grid grid-2"><div class="card"><h2 class="section-title">Broker Loads</h2>${loadsTable(loads)}</div><div class="card"><h2 class="section-title">Quick Action</h2><a class="btn btn-primary" href="/load-wizard.html">Create Load</a></div></section>`; }
async function renderLoadWizard(){
  const u=layout("Load Creation Wizard", "Create a load and assign it to an available driver.", "loads", ["admin","dispatcher","broker"]); if(!u)return;
  const drivers=await api('/api/users?role=driver');
  $('#app').innerHTML=`<section class="card"><div class="stepbar"><div class="step-dot active"></div><div class="step-dot active"></div><div class="step-dot active"></div></div><form id="loadForm" class="grid"><div class="grid grid-2"><label class="field"><span>Load number</span><input class="input" name="loadNumber" required></label><label class="field"><span>Customer</span><input class="input" name="customer"></label></div><div class="grid grid-2"><label class="field"><span>Pickup</span><input class="input" name="pickup" placeholder="City, state, date"></label><label class="field"><span>Delivery</span><input class="input" name="delivery" placeholder="City, state, date"></label></div><div class="grid grid-2"><label class="field"><span>Driver</span><select class="select" name="driverId" required><option value="">Select driver</option>${drivers.map(d=>`<option value="${d.id}">${esc(d.name)} - ${esc(d.email)}</option>`).join('')}</select></label><label class="field"><span>Rate</span><input class="input" name="rate" placeholder="Optional"></label></div><label class="field"><span>Notes</span><textarea class="textarea" name="notes"></textarea></label><button class="btn btn-primary">Create Load</button></form></section>`;
  $('#loadForm').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());await api('/api/loads',{method:'POST',body:data});toast('Load created','Driver has been notified.');e.target.reset();};
}
async function renderNotifications(){layout("Notification Center","All relevant operational messages in one place.","notifications");const rows=await api('/api/notifications/my?limit=100');$('#app').innerHTML=`<section class="card"><div class="toolbar"><h2 class="section-title" style="margin-right:auto">Inbox</h2><button id="readAll" class="btn btn-ghost btn-small">Mark all read</button></div>${!rows.length?rowEmpty('No notifications yet.'):`<div class="timeline">${rows.map(n=>`<div class="timeline-item"><div class="timeline-title">${esc(n.title||'Notification')}</div><div>${esc(n.message||'')}</div><div class="timeline-meta">${esc(new Date(n.createdAt||Date.now()).toLocaleString())}</div></div>`).join('')}</div>`}</section>`;$('#readAll').onclick=async()=>{await api('/api/notifications/read-all',{method:'POST'});toast('Notifications','Marked as read.');setTimeout(()=>location.reload(),500)}}
async function renderAuditPage(){layout("Audit Timeline","Production activity log for admin review.","audit",["admin"]);const rows=await api('/api/admin/audit?limit=200');$('#app').innerHTML=`<section class="card"><h2 class="section-title">System Activity</h2>${timeline(rows)}</section>`;}

async function initLogin(){
  const existing = user();
  if(token() && existing && existing.role){
    location.replace(safeNext() || roleHome(existing.role));
    return;
  }
  $('#loginForm')?.addEventListener('submit', async e=>{
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"],button:not([type])');
    const msg = $('#msg');
    if(btn){ btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = 'Signing in...'; }
    if(msg) msg.textContent = '';
    const data=Object.fromEntries(new FormData(e.target).entries());
    try{
      const r=await api('/api/auth/login',{method:'POST',body:data});
      setSession(r);
      const u = user() || r.user || {};
      location.replace(safeNext() || roleHome(u.role));
    }catch(err){
      if(msg) msg.textContent=err.message;
      if(btn){ btn.disabled = false; btn.textContent = btn.dataset.originalText || 'Login'; }
    }
  });
}

const page=document.body.dataset.page;
const runners={login:initLogin,dashboard:renderDashboard,admin:renderAdmin,dispatcher:renderDispatcher,driver:renderDriver,broker:renderBroker,loads:renderLoadWizard,notifications:renderNotifications,audit:renderAuditPage};
runners[page]?.().catch(err=>{console.error(err); if($('#app')) $('#app').innerHTML=`<div class="card"><h2 class="section-title">Something went wrong</h2><p class="msg">${esc(err.message)}</p></div>`;});
