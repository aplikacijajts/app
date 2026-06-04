// Final production guard for JTS Logistics navigation + GPS.
// Loaded last to keep the working app intact while fixing mobile admin menu and GPS live-share consistency.
(function(){
  const LIVE_SHARE_URL = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';
  const ROLE_ROUTES = {
    admin:[['/admin.html','Dashboard','grid'],['/admin-users.html','Users','users'],['/admin-loads.html','Loads','truck'],['/chat.html','Chat','chat'],['/notifications.html','Notifications','bell'],['/gps.html','GPS','gps']],
    dispatcher:[['/dispatcher.html','Dashboard','grid'],['/admin-loads.html','Loads','truck'],['/chat.html','Chat','chat'],['/notifications.html','Notifications','bell'],['/gps.html','GPS','gps']],
    driver:[['/driver.html','Dashboard','grid'],['/load-details.html','Loads','truck'],['/chat.html','Chat','chat'],['/notifications.html','Notifications','bell']],
    broker:[['/broker.html','Dashboard','grid'],['/admin-loads.html','Loads','truck'],['/chat.html','Chat','chat'],['/notifications.html','Notifications','bell'],['/gps.html','GPS','gps']]
  };
  const ICONS={
    grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    gps:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
    out:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };
  function decode(token){
    try{const p=(token||'').split('.')[1]; if(!p)return null; const b=p.replace(/-/g,'+').replace(/_/g,'/'); return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(b),c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));}catch(e){try{return JSON.parse(atob(((token||'').split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/')))}catch(_){return null;}}
  }
  function user(){
    const token=localStorage.getItem('token')||'';
    const u=decode(token);
    if(!u||!u.role||(u.exp&&Date.now()>=u.exp*1000)) return null;
    return u;
  }
  function isAuthPage(){return location.pathname==='/' || /\/index\.html$|\/register\.html$/i.test(location.pathname)}
  function logout(){localStorage.removeItem('token');localStorage.removeItem('user');sessionStorage.clear();location.href='/index.html'}
  function removeGuestNav(){
    if(user()&&!isAuthPage()) return;
    document.querySelectorAll('.jts-menu-root,.jts-mobile-menu,.jts-rail,.pe-bottom-nav,.enterprise-dock').forEach(el=>el.remove());
  }
  function removeOldMapLinks(){
    // Admin should not see the separate demo/live-map entry. GPS remains available.
    document.querySelectorAll('a[href*="live-map.html"],a[href="/live-map.html"]').forEach(el=>el.remove());
    document.querySelectorAll('a,button').forEach(el=>{
      const txt=(el.textContent||'').trim().toLowerCase();
      const href=(el.getAttribute&&String(el.getAttribute('href')||'').toLowerCase())||'';
      if(txt==='map' || href.includes('live-map.html')) el.remove();
    });
  }
  function ensureMenu(){
    const u=user();
    if(!u||isAuthPage()){removeGuestNav();return;}
    const role=String(u.role||'').toLowerCase();
    document.body.dataset.role=role;
    document.body.classList.add('jts-app-shell');
    const items=ROLE_ROUTES[role]||ROLE_ROUTES.driver;
    // Remove duplicate menu sheets from previous UI layers, then build one clean canonical menu.
    document.querySelectorAll('.jts-menu-root,.jts-mobile-menu,.pe-bottom-nav,.enterprise-dock').forEach(el=>el.remove());
    const root=document.createElement('div');
    root.className='jts-menu-root jts-canonical-menu';
    root.innerHTML='<button class="jts-menu-fab" type="button" aria-label="Open menu">'+ICONS.menu+'</button><div class="jts-menu-backdrop"></div><nav class="jts-menu-sheet" aria-label="Navigation"><div class="jts-menu-title"><strong>Menu</strong><span>'+role+'</span></div><div class="jts-menu-list"></div><button class="jts-menu-logout" type="button"><span class="jts-menu-icon">'+ICONS.out+'</span><span>Sign out</span></button></nav>';
    const list=root.querySelector('.jts-menu-list');
    items.forEach(([href,label,ic])=>{
      const a=document.createElement('a');
      a.href=href;
      a.className=location.pathname===href.split('#')[0]?'active':'';
      a.innerHTML='<span class="jts-menu-icon">'+(ICONS[ic]||ICONS.grid)+'</span><span>'+label+'</span>';
      list.appendChild(a);
    });
    document.body.appendChild(root);
    const close=()=>root.classList.remove('open');
    root.querySelector('.jts-menu-fab').addEventListener('click',()=>root.classList.add('open'));
    root.querySelector('.jts-menu-backdrop').addEventListener('click',close);
    root.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
    root.querySelector('.jts-menu-logout').addEventListener('click',logout);
    removeOldMapLinks();
  }
  function gpsFix(){
    window.JTS_GPS_LIVE_SHARE_URL=LIVE_SHARE_URL;
    document.querySelectorAll('a[href*="cloud.rockeld.us"],iframe[src*="cloud.rockeld.us"]').forEach(el=>{
      if(el.tagName==='IFRAME') el.src=LIVE_SHARE_URL;
      else el.setAttribute('href', LIVE_SHARE_URL);
    });
    const u=user(); const role=String(u?.role||'').toLowerCase();
    if(role==='driver') document.querySelectorAll('a[href*="gps.html"],a[href*="/gps"],a[href*="live-map.html"]').forEach(el=>el.remove());
    removeOldMapLinks();
  }
  function run(){removeGuestNav();ensureMenu();gpsFix();}
  document.addEventListener('DOMContentLoaded',run,{once:true});
  window.addEventListener('load',run);
  window.addEventListener('pageshow',run);
  [60,250,700,1400].forEach(ms=>setTimeout(run,ms));
})();
