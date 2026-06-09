// JTS APEX PRODUCTION UI - clean final enhancer.
// Keeps business logic intact: it only controls theme, menu, responsive table labels and visual cleanup.
(function(){
  'use strict';

  var THEME_KEY = 'jts-apex-theme';
  var path = (location.pathname || '/').replace(/\/+$/,'') || '/';
  var file = (path.split('/').pop() || 'index.html').toLowerCase();
  var authPage = path === '/' || /\/(index|register)\.html$/i.test(path) || file === '';
  var gpsUrl = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';

  var icons = {
    menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>',
    home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>',
    enterprise:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h7v18"/><path d="M14 9h3a2 2 0 0 1 2 2v10"/><path d="M9 7h1M9 11h1M9 15h1"/></svg>',
    map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .4.2.78.6 1 .3.2.7.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6z"/></svg>',
    moon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };

  var roleRoutes = {
    admin:[
      ['/admin.html','Admin dashboard','dashboard'],['/admin-users.html','Users and roles','users'],['/admin-loads.html','Loads','truck'],
      ['/dispatcher.html','Dispatcher','truck'],['/enterprise.html','Enterprise','enterprise'],['/command-center.html','Command center','dashboard'],
      ['/gps.html','GPS tracking','map'],['/live-map.html','Live map','map'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell'],['/settings-center.html','Settings','settings']
    ],
    dispatcher:[
      ['/dispatcher.html','Dispatcher','truck'],['/admin-loads.html','Loads','truck'],['/command-center.html','Command center','dashboard'],
      ['/gps.html','GPS tracking','map'],['/live-map.html','Live map','map'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ],
    driver:[
      ['/driver.html','Driver dashboard','user'],['/load-details.html','Load details','truck'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ],
    broker:[
      ['/broker.html','Broker workspace','enterprise'],['/admin-loads.html','Available loads','truck'],['/gps.html','GPS tracking','map'],
      ['/live-map.html','Live map','map'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ]
  };

  var pageTitles = {
    'admin.html':'Admin command', 'admin-users.html':'Users and roles', 'admin-loads.html':'Load operations', 'dispatcher.html':'Dispatcher workspace',
    'driver.html':'Driver portal', 'broker.html':'Broker workspace', 'enterprise.html':'Enterprise center', 'gps.html':'GPS tracking',
    'live-map.html':'Live fleet map', 'chat.html':'Messages', 'notifications.html':'Notifications', 'command-center.html':'Command center',
    'settings-center.html':'Settings center', 'onboarding.html':'Onboarding', 'load-details.html':'Load details', 'home.html':'JTS Logistics Portal'
  };

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',fn,{once:true});
    else fn();
  }

  function base64UrlDecode(input){
    var s = String(input || '').replace(/-/g,'+').replace(/_/g,'/');
    while(s.length % 4) s += '=';
    return atob(s);
  }

  function decodeJwt(token){
    try{
      var part = String(token || '').split('.')[1];
      if(!part) return null;
      var raw = base64UrlDecode(part);
      try{
        return JSON.parse(decodeURIComponent(Array.prototype.map.call(raw,function(c){
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')));
      }catch(_){
        return JSON.parse(raw);
      }
    }catch(e){ return null; }
  }

  function storedUser(){
    try{return JSON.parse(localStorage.getItem('user') || 'null');}catch(e){return null;}
  }

  function currentUser(){
    if(window.JTSAuth && typeof window.JTSAuth.currentUser === 'function'){
      try{ var u = window.JTSAuth.currentUser(); if(u && u.role) return u; }catch(e){}
    }
    var token = localStorage.getItem('token') || '';
    var fromToken = decodeJwt(token);
    if(fromToken && fromToken.role && (!fromToken.exp || Date.now() < fromToken.exp * 1000)) return fromToken;
    var fromStorage = storedUser();
    if(fromStorage && fromStorage.role) return fromStorage;
    return null;
  }

  function setTheme(theme){
    var t = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-jts-theme', t);
    document.documentElement.style.colorScheme = t;
    try{ localStorage.setItem(THEME_KEY, t); }catch(e){}
    updateThemeButtons();
  }

  function getTheme(){
    try{
      var saved = localStorage.getItem(THEME_KEY);
      if(saved === 'dark' || saved === 'light') return saved;
    }catch(e){}
    return 'light';
  }

  function toggleTheme(){
    setTheme(document.documentElement.getAttribute('data-jts-theme') === 'dark' ? 'light' : 'dark');
  }

  function updateThemeButtons(){
    var dark = document.documentElement.getAttribute('data-jts-theme') === 'dark';
    document.querySelectorAll('[data-jts-theme-toggle]').forEach(function(btn){
      btn.innerHTML = '<span class="jts-menu-icon">' + (dark ? icons.sun : icons.moon) + '</span><span>' + (dark ? 'Light theme' : 'Dark theme') + '</span>';
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    });
    document.querySelectorAll('[data-jts-auth-theme]').forEach(function(btn){
      btn.innerHTML = dark ? icons.sun : icons.moon;
      btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    });
  }

  function cleanupLegacyShells(){
    document.body && document.body.classList.remove('jts-with-rail');
    var legacy = '.jts-rail,.jts-bottom-nav,.jts-command-button,.jts-quick-panel,.pe-bottom-nav,.enterprise-dock,.jts-e-sidebar,.jts-e-mobile-nav,.jts-mobile-menu';
    document.querySelectorAll(legacy).forEach(function(el){ el.remove(); });
    document.querySelectorAll('.jts-menu-root:not(.jts-canonical-menu)').forEach(function(el){ el.remove(); });
  }

  function logout(){
    try{ localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); }catch(e){}
    location.href = '/index.html';
  }

  function activeFor(href){
    var p = href.replace(/\/+$/,'') || '/';
    if(path === p) return true;
    if(p === '/admin.html' && path === '/admin-users.html') return true;
    if(p === '/dispatcher.html' && (path === '/admin-loads.html' || path === '/load-details.html')) return true;
    if(p === '/enterprise.html' && (path === '/settings-center.html' || path === '/onboarding.html')) return true;
    if(p === '/gps.html' && path === '/live-map.html') return true;
    return false;
  }

  function menuItem(item){
    var a = document.createElement('a');
    a.href = item[0];
    if(activeFor(item[0])) a.className = 'active';
    a.innerHTML = '<span class="jts-menu-icon">' + (icons[item[2]] || icons.dashboard) + '</span><span>' + item[1] + '</span>';
    a.addEventListener('click',function(){
      var root = document.querySelector('.jts-menu-root.jts-canonical-menu');
      if(root) root.classList.remove('open');
    });
    return a;
  }

  function buildMenu(){
    var u = currentUser();
    if(authPage || !u){
      document.querySelectorAll('.jts-menu-root.jts-canonical-menu').forEach(function(el){ el.remove(); });
      return;
    }

    var role = String(u.role || 'driver').toLowerCase();
    var items = roleRoutes[role] || roleRoutes.driver;
    var existing = document.querySelector('.jts-menu-root.jts-canonical-menu');
    if(existing && existing.getAttribute('data-role') === role){
      existing.querySelectorAll('.jts-menu-list a').forEach(function(a){
        a.classList.toggle('active', activeFor(a.getAttribute('href') || ''));
      });
      updateThemeButtons();
      return;
    }
    if(existing) existing.remove();

    var root = document.createElement('div');
    root.className = 'jts-menu-root jts-canonical-menu';
    root.setAttribute('data-role', role);

    var name = u.name || storedUser()?.name || role;
    var email = u.email || storedUser()?.email || '';
    var roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

    root.innerHTML =
      '<button class="jts-menu-fab" type="button" aria-label="Open menu" aria-expanded="false">' + icons.menu + '</button>' +
      '<div class="jts-menu-backdrop"></div>' +
      '<nav class="jts-menu-sheet" aria-label="JTS navigation">' +
        '<div class="jts-menu-title"><div><strong>JTS Menu</strong><div style="font-size:12px;font-weight:800;color:var(--jts-muted);margin-top:3px">' + escapeHtml(name) + (email ? '<br>' + escapeHtml(email) : '') + '</div></div><span>' + roleLabel + '</span></div>' +
        '<div class="jts-menu-list"></div>' +
        '<div class="jts-menu-footer"><button class="jts-theme-switch" type="button" data-jts-theme-toggle></button><button class="jts-menu-logout" type="button"><span class="jts-menu-icon">' + icons.logout + '</span><span>Sign out</span></button></div>' +
      '</nav>';

    var list = root.querySelector('.jts-menu-list');
    items.forEach(function(item){ list.appendChild(menuItem(item)); });

    var fab = root.querySelector('.jts-menu-fab');
    var close = function(){ root.classList.remove('open'); fab.setAttribute('aria-expanded','false'); };
    var open = function(){ root.classList.add('open'); fab.setAttribute('aria-expanded','true'); };
    fab.addEventListener('click',function(){ root.classList.contains('open') ? close() : open(); });
    root.querySelector('.jts-menu-backdrop').addEventListener('click', close);
    root.querySelector('.jts-menu-logout').addEventListener('click', logout);
    root.querySelector('[data-jts-theme-toggle]').addEventListener('click', toggleTheme);
    document.addEventListener('keydown',function(ev){ if(ev.key === 'Escape') close(); });
    document.body.appendChild(root);
    updateThemeButtons();
  }

  function escapeHtml(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function ensureHeader(){
    if(authPage) return;
    if(document.querySelector('header')) return;
    var header = document.createElement('header');
    var title = pageTitles[file] || 'JTS Logistics';
    header.innerHTML = '<div><a href="/home.html" class="font-bold text-lg flex items-center gap-3"><img src="/assets/jts-logo.png" class="h-9" alt="JTS"><span>' + title + '</span></a><button id="jtsInjectedLogout" class="px-4 py-2 rounded-xl jts-btn text-sm font-semibold">Logout</button></div>';
    document.body.insertBefore(header, document.body.firstChild);
    var btn = document.getElementById('jtsInjectedLogout');
    if(btn) btn.addEventListener('click', logout);
  }

  function enhanceHeader(){
    var inner = document.querySelector('header>div');
    if(!inner) return;
    var brand = inner.querySelector('.font-bold, a.font-bold');
    if(brand && !brand.querySelector('img')){
      brand.innerHTML = '<img src="/assets/jts-logo.png" alt="JTS"><span>JTS Logistics</span>';
    }
    var seen = Object.create(null);
    inner.querySelectorAll('nav a, .space-x-3 a').forEach(function(a){
      var key = (a.getAttribute('href') || '') + '|' + (a.textContent || '').trim().toLowerCase();
      if(seen[key]) a.remove(); else seen[key] = true;
      if(activeFor(a.getAttribute('href') || '')) a.classList.add('active');
    });
    inner.querySelectorAll('button,a').forEach(function(el){
      var text = (el.textContent || '').trim().toLowerCase();
      if(text === 'logout' || text === 'sign out') el.classList.add('signout');
    });
  }

  function authThemeButton(){
    if(!authPage) return;
    if(document.querySelector('[data-jts-auth-theme]')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jts-auth-theme';
    btn.setAttribute('data-jts-auth-theme','');
    btn.addEventListener('click', toggleTheme);
    document.body.appendChild(btn);
    updateThemeButtons();
  }

  function labelTables(){
    document.querySelectorAll('table').forEach(function(table){
      var heads = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){ return (th.textContent || '').trim(); });
      if(!heads.length) return;
      table.querySelectorAll('tbody tr').forEach(function(row){
        Array.prototype.slice.call(row.children).forEach(function(cell,index){
          if(heads[index] && !cell.getAttribute('data-label')) cell.setAttribute('data-label',heads[index]);
        });
      });
    });
  }

  function polish(){
    document.querySelectorAll('input,textarea,select').forEach(function(el){
      if(el.tagName === 'INPUT' && !el.getAttribute('autocomplete')) el.setAttribute('autocomplete','off');
    });
    document.querySelectorAll('button,a').forEach(function(el){
      var text = (el.textContent || '').trim().toLowerCase();
      if(text === 'logout' || text === 'sign out') el.classList.add('signout');
    });
    document.querySelectorAll('iframe[src*="cloud.rockeld.us"]').forEach(function(frame){
      frame.setAttribute('src', gpsUrl);
    });
    window.JTS_GPS_LIVE_SHARE_URL = gpsUrl;
  }

  function observe(){
    var queued = false;
    var mo = new MutationObserver(function(){
      if(queued) return;
      queued = true;
      requestAnimationFrame(function(){
        queued = false;
        cleanupLegacyShells();
        labelTables();
        polish();
      });
    });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  function boot(){
    setTheme(getTheme());
    document.body.classList.add('jts-apex');
    document.body.classList.toggle('jts-auth-page', authPage || !!document.querySelector('#loginForm') || !!document.querySelector('#registerForm'));
    cleanupLegacyShells();
    ensureHeader();
    enhanceHeader();
    buildMenu();
    authThemeButton();
    labelTables();
    polish();
    observe();
    [80,250,700,1400].forEach(function(ms){
      setTimeout(function(){ cleanupLegacyShells(); enhanceHeader(); buildMenu(); labelTables(); polish(); }, ms);
    });
  }

  window.JTSApexUI = { setTheme:setTheme, toggleTheme:toggleTheme, ensureMenu:buildMenu, labelTables:labelTables, cleanup:cleanupLegacyShells };
  ready(boot);
})();
