// Final auth/navigation guard for JTS Logistics.
// Keeps public pages clean and prevents protected navigation before login.
(function(){
  const PUBLIC = new Set(['/', '/index.html', '/register.html']);
  const ROLE_HOME = { admin:'/admin.html', dispatcher:'/dispatcher.html', driver:'/driver.html', broker:'/broker.html' };
  const PAGE_ROLES = {
    '/admin.html':['admin'], '/admin-users.html':['admin'], '/admin-loads.html':['admin'], '/settings-center.html':['admin'], '/onboarding.html':['admin'],
    '/command-center.html':['admin','dispatcher'], '/dispatcher.html':['admin','dispatcher'], '/driver.html':['admin','driver'], '/broker.html':['admin','broker'],
    '/gps.html':['admin','dispatcher','broker'], '/live-map.html':['admin','dispatcher','broker'], '/load-details.html':['admin','dispatcher','driver','broker'],
    '/chat.html':['admin','dispatcher','driver','broker'], '/notifications.html':['admin','dispatcher','driver','broker'], '/fuel.html':['admin','dispatcher','driver','broker'], '/confirmation.html':['admin','dispatcher'], '/home.html':['admin','dispatcher','driver','broker']
  };
  function norm(path){ if(!path || path === '/') return '/'; return path.endsWith('/') ? path.slice(0,-1) : path; }
  function decode(token){
    try{
      const part = token.split('.')[1]; if(!part) return null;
      const base64 = part.replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(base64), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    }catch(e){ try { return JSON.parse(atob((token.split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/'))); } catch(_) { return null; } }
  }
  function token(){ return localStorage.getItem('token') || ''; }
  function clearAuth(){ localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); }
  function user(){
    const t = token(); if(!t) { localStorage.removeItem('user'); return null; }
    const u = decode(t); if(!u || !u.role || (u.exp && Date.now() >= u.exp*1000)) { clearAuth(); return null; }
    return u;
  }
  function roleHome(role){ return ROLE_HOME[String(role||'').toLowerCase()] || '/index.html'; }
  function isProtected(path){ const p=norm(path); return !PUBLIC.has(p) && (p.endsWith('.html') || p === '/'); }
  function allowed(path, role){ const roles = PAGE_ROLES[norm(path)]; return !roles || roles.includes(String(role||'').toLowerCase()); }
  function removeMenusIfGuest(){
    if(user()) return;
    document.documentElement.dataset.role = 'guest';
    if(document.body) document.body.dataset.role = 'guest';
    document.querySelectorAll('.jts-menu-root,.jts-mobile-menu,.jts-rail,.pe-bottom-nav,.enterprise-dock').forEach(el => el.remove());
    document.querySelectorAll('a[href]').forEach(a => {
      try{
        const url = new URL(a.getAttribute('href'), location.origin);
        if(url.origin === location.origin && isProtected(url.pathname)) a.setAttribute('data-auth-required','true');
      }catch(e){}
    });
  }
  function protectCurrent(){
    const path = norm(location.pathname);
    const u = user();
    if(!PUBLIC.has(path) && path.endsWith('.html')){
      if(!u){ location.replace('/index.html?next=' + encodeURIComponent(location.pathname + location.search)); return false; }
      if(!allowed(path, u.role)){ location.replace(roleHome(u.role)); return false; }
    }
    return true;
  }
  document.addEventListener('click', function(e){
    const a = e.target.closest && e.target.closest('a[href]'); if(!a) return;
    const href = a.getAttribute('href') || ''; if(!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let url; try{ url = new URL(href, location.origin); }catch(_){ return; }
    if(url.origin !== location.origin || !isProtected(url.pathname)) return;
    const u = user();
    if(!u){ e.preventDefault(); e.stopPropagation(); location.href='/index.html?next=' + encodeURIComponent(url.pathname + url.search); return; }
    if(!allowed(url.pathname, u.role)){ e.preventDefault(); e.stopPropagation(); location.href=roleHome(u.role); }
  }, true);
  protectCurrent();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', removeMenusIfGuest, {once:true}); else removeMenusIfGuest();
  window.addEventListener('pageshow', removeMenusIfGuest);
  setTimeout(removeMenusIfGuest, 100);
  setTimeout(removeMenusIfGuest, 500);
  window.JTSFinalAuthGuard = { user, clearAuth, allowed, isProtected };
})();
