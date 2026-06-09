// JTS APEX UI - stable production shell.
// Visual/navigation enhancer only: keeps API calls and business logic untouched.
(function(){
  'use strict';

  var THEME_KEY = 'jts-theme-mode';
  var path = (location.pathname || '/').replace(/\/+$/,'') || '/';
  var file = (path.split('/').pop() || 'index.html').toLowerCase();
  var publicPage = path === '/' || /\/(index|register)\.html$/i.test(path);
  var gpsUrl = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';

  var icons = {
    menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    dashboard:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    users:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    truck:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    user:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>',
    enterprise:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h7v18"/><path d="M14 9h3a2 2 0 0 1 2 2v10"/><path d="M9 7h1M9 11h1M9 15h1"/></svg>',
    map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    chat:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    bell:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    settings:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .4.2.78.6 1 .3.2.7.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6z"/></svg>',
    moon:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    sun:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    logout:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };

  var titleMap = {
    'home.html':'JTS Logistics Portal',
    'admin.html':'Admin Panel',
    'admin-users.html':'Users & Roles',
    'admin-loads.html':'Load Administration',
    'dispatcher.html':'Dispatcher Panel',
    'driver.html':'Driver Portal',
    'broker.html':'Broker Workspace',
    'enterprise.html':'Enterprise Center',
    'command-center.html':'Command Center',
    'settings-center.html':'Settings Center',
    'onboarding.html':'Company Setup',
    'gps.html':'GPS Tracking',
    'live-map.html':'Live Fleet Map',
    'load-details.html':'Load Details',
    'chat.html':'Messages',
    'notifications.html':'Notifications'
  };

  var roleRoutes = {
    admin:[
      ['/home.html','Home','home'],['/admin.html','Admin dashboard','dashboard'],['/admin-users.html','Users & roles','users'],['/admin-loads.html','Loads','truck'],
      ['/dispatcher.html','Dispatcher','truck'],['/enterprise.html','Enterprise','enterprise'],['/command-center.html','Command center','dashboard'],
      ['/settings-center.html','Settings','settings'],['/gps.html','GPS tracking','map'],['/live-map.html','Live map','map'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ],
    dispatcher:[
      ['/home.html','Home','home'],['/dispatcher.html','Dispatcher','truck'],['/command-center.html','Command center','dashboard'],
      ['/gps.html','GPS tracking','map'],['/live-map.html','Live map','map'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ],
    driver:[
      ['/home.html','Home','home'],['/driver.html','Driver dashboard','user'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ],
    broker:[
      ['/home.html','Home','home'],['/broker.html','Broker workspace','enterprise'],['/gps.html','GPS tracking','map'],['/live-map.html','Live map','map'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']
    ]
  };

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function html(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  function decodePayload(token){
    try{
      var part = String(token || '').split('.')[1];
      if(!part) return null;
      var b64 = part.replace(/-/g,'+').replace(/_/g,'/');
      while(b64.length % 4) b64 += '=';
      var raw = atob(b64);
      try{
        return JSON.parse(decodeURIComponent(Array.prototype.map.call(raw, function(c){
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join('')));
      }catch(_){ return JSON.parse(raw); }
    }catch(_){ return null; }
  }

  function storedUser(){
    try{ return JSON.parse(localStorage.getItem('user') || 'null'); }catch(_){ return null; }
  }

  function currentUser(){
    if(window.JTSAuth && typeof window.JTSAuth.currentUser === 'function'){
      try{ var u = window.JTSAuth.currentUser(); if(u && u.role) return u; }catch(_){ }
    }
    var fromToken = decodePayload(localStorage.getItem('token') || '');
    if(fromToken && fromToken.role && (!fromToken.exp || Date.now() < fromToken.exp * 1000)) return fromToken;
    var fromStorage = storedUser();
    if(fromStorage && fromStorage.role) return fromStorage;
    return null;
  }

  function getTheme(){
    try{
      var saved = localStorage.getItem(THEME_KEY);
      if(saved === 'dark' || saved === 'light') return saved;
    }catch(_){ }
    return 'light';
  }

  function setTheme(theme){
    var mode = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-jts-theme', mode);
    document.documentElement.style.colorScheme = mode;
    try{ localStorage.setItem(THEME_KEY, mode); }catch(_){ }
    updateThemeButtons();
  }

  function toggleTheme(){ setTheme(document.documentElement.getAttribute('data-jts-theme') === 'dark' ? 'light' : 'dark'); }

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

  function logout(){
    try{ localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); }catch(_){ }
    location.href = '/index.html';
  }

  function activeFor(href){
    var p = (href || '').split('?')[0].replace(/\/+$/,'') || '/';
    if(path === p) return true;
    if(p === '/gps.html' && path === '/live-map.html') return true;
    if(p === '/enterprise.html' && (path === '/settings-center.html' || path === '/onboarding.html')) return true;
    return false;
  }

  function ensureHeader(){
    if(publicPage) return;
    if(document.querySelector('header')) return;
    var header = document.createElement('header');
    var title = titleMap[file] || 'JTS Logistics';
    header.innerHTML = '<div class="jts-header-inner"><a class="jts-brand" href="/home.html"><img src="/assets/jts-logo.png" alt="JTS"><span>' + html(title) + '</span></a><div class="jts-header-actions"><button type="button" class="jts-btn jts-logout-inline">Logout</button></div></div>';
    document.body.insertBefore(header, document.body.firstChild);
  }

  function normalizeHeader(){
    var header = document.querySelector('header');
    if(!header) return;
    var inner = header.querySelector(':scope > div') || header;
    inner.classList.add('jts-header-inner');

    var brand = inner.querySelector('a.font-bold, div.font-bold, .font-bold');
    if(brand){
      brand.classList.add('jts-brand');
      if(!brand.querySelector('img')){
        brand.insertAdjacentHTML('afterbegin','<img src="/assets/jts-logo.png" alt="JTS">');
      }
      if(brand.tagName !== 'A'){
        brand.setAttribute('role','link');
        brand.setAttribute('tabindex','0');
        brand.addEventListener('click', function(){ location.href = '/home.html'; });
        brand.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' || ev.key === ' ') location.href = '/home.html'; });
      }
      var title = titleMap[file];
      var span = brand.querySelector('span:last-child');
      if(title && span && (span.textContent || '').trim().length > 26) span.textContent = title;
    }

    inner.querySelectorAll('nav').forEach(function(nav){ nav.classList.add('jts-native-nav'); nav.setAttribute('aria-hidden','true'); });

    var actions = inner.querySelector('.jts-header-actions');
    if(!actions){
      Array.prototype.slice.call(inner.children).some(function(child){
        if(child === brand || child.tagName === 'NAV') return false;
        if(child.querySelector && child.querySelector('a,button')){
          actions = child;
          actions.classList.add('jts-header-actions');
          return true;
        }
        return false;
      });
    }
    if(!actions){
      actions = document.createElement('div');
      actions.className = 'jts-header-actions';
      inner.appendChild(actions);
    }
    Array.prototype.slice.call(inner.children).forEach(function(child){
      if(child === brand || child === actions || child.tagName === 'NAV') return;
      if(child.matches && (child.matches('button') || child.matches('a'))){
        actions.appendChild(child);
      }else if(child.querySelector && child.querySelector('a,button')){
        while(child.firstChild) actions.appendChild(child.firstChild);
        child.remove();
      }
    });

    inner.querySelectorAll('button, a').forEach(function(el){
      var txt = (el.textContent || '').trim().toLowerCase();
      if(txt === 'logout' || txt === 'sign out'){
        el.classList.add('jts-logout-inline');
        if(!el.dataset.jtsLogoutBound){ el.addEventListener('click', logout); el.dataset.jtsLogoutBound = '1'; }
      }
    });
  }

  function menuItem(item){
    var a = document.createElement('a');
    a.href = item[0];
    a.className = activeFor(item[0]) ? 'active' : '';
    a.innerHTML = '<span class="jts-menu-icon">' + (icons[item[2]] || icons.dashboard) + '</span><span>' + html(item[1]) + '</span>';
    return a;
  }

  function ensureMenu(){
    var user = currentUser();
    var existing = document.querySelector('.jts-menu-root');
    if(publicPage || !user || !user.role){ if(existing) existing.remove(); return; }

    var role = String(user.role || 'user').toLowerCase();
    var items = roleRoutes[role] || roleRoutes.driver;
    var root = existing || document.createElement('div');
    root.className = 'jts-menu-root';
    root.innerHTML = '<div class="jts-menu-backdrop" data-jts-menu-close></div>' +
      '<aside class="jts-menu-sheet" aria-label="JTS navigation">' +
        '<div class="jts-menu-head"><div><strong>JTS Menu</strong><span>' + html(role) + '</span></div><button type="button" class="jts-menu-close" data-jts-menu-close aria-label="Close menu">' + icons.close + '</button></div>' +
        '<div class="jts-menu-profile"><div class="jts-avatar-mark">' + html(String(user.name || user.email || 'J').slice(0,1).toUpperCase()) + '</div><div><b>' + html(user.name || 'JTS User') + '</b><p>' + html(user.email || '') + '</p></div></div>' +
        '<nav class="jts-menu-list"></nav>' +
        '<div class="jts-menu-footer"><button type="button" class="jts-menu-action" data-jts-theme-toggle></button><button type="button" class="jts-menu-action danger" data-jts-menu-logout><span class="jts-menu-icon">' + icons.logout + '</span><span>Sign out</span></button></div>' +
      '</aside>';

    var list = root.querySelector('.jts-menu-list');
    items.forEach(function(item){ list.appendChild(menuItem(item)); });

    if(!existing) document.body.appendChild(root);

    var trigger = ensureMenuButton();
    function close(){ root.classList.remove('open'); if(trigger) trigger.setAttribute('aria-expanded','false'); document.body.classList.remove('jts-menu-open'); }
    function open(){ root.classList.add('open'); if(trigger) trigger.setAttribute('aria-expanded','true'); document.body.classList.add('jts-menu-open'); }

    if(trigger && !trigger.dataset.jtsMenuBound){
      trigger.addEventListener('click', function(){ root.classList.contains('open') ? close() : open(); });
      trigger.dataset.jtsMenuBound = '1';
    }
    root.querySelectorAll('[data-jts-menu-close]').forEach(function(el){ el.addEventListener('click', close); });
    root.querySelector('[data-jts-menu-logout]').addEventListener('click', logout);
    root.querySelector('[data-jts-theme-toggle]').addEventListener('click', toggleTheme);
    root.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', close); });
    if(!document.documentElement.dataset.jtsEscBound){
      document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape'){ var r=document.querySelector('.jts-menu-root'); if(r){ r.classList.remove('open'); document.body.classList.remove('jts-menu-open'); } } });
      document.documentElement.dataset.jtsEscBound = '1';
    }
    updateThemeButtons();
  }

  function ensureMenuButton(){
    if(publicPage) return null;
    var header = document.querySelector('header');
    if(!header) return null;
    var inner = header.querySelector('.jts-header-inner') || header.querySelector(':scope > div') || header;
    var actions = inner.querySelector('.jts-header-actions');
    if(!actions){ actions = document.createElement('div'); actions.className = 'jts-header-actions'; inner.appendChild(actions); }
    var btn = actions.querySelector('.jts-menu-trigger');
    if(!btn){
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'jts-menu-trigger';
      btn.setAttribute('aria-label','Open menu');
      btn.setAttribute('aria-expanded','false');
      btn.setAttribute('data-jts-menu-open','');
      btn.innerHTML = icons.menu + '<span>Menu</span>';
      actions.insertBefore(btn, actions.firstChild);
    }
    return btn;
  }

  function authThemeButton(){
    if(!publicPage) return;
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
      table.classList.add('jts-responsive-table');
      table.querySelectorAll('tbody tr').forEach(function(row){
        Array.prototype.slice.call(row.children).forEach(function(cell, index){
          if(heads[index] && !cell.getAttribute('data-label')) cell.setAttribute('data-label', heads[index]);
        });
      });
    });
  }

  function polish(){
    document.querySelectorAll('input, textarea, select').forEach(function(el){
      if(el.tagName === 'INPUT' && !el.getAttribute('autocomplete') && !['date','number','email','password','tel'].includes(el.type)) el.setAttribute('autocomplete','off');
    });
    document.querySelectorAll('iframe#gpsFrame, iframe#frame, iframe[src*="cloud.rockeld.us"]').forEach(function(frame){
      var src = frame.getAttribute('src') || '';
      if(!src || src.indexOf('cloud.rockeld.us') !== -1) frame.setAttribute('src', gpsUrl);
    });
    document.querySelectorAll('a[href*="cloud.rockeld.us"]').forEach(function(a){ a.setAttribute('href', gpsUrl); });
    window.JTS_GPS_LIVE_SHARE_URL = gpsUrl;
  }

  function observe(){
    var waiting = false;
    var mo = new MutationObserver(function(){
      if(waiting) return;
      waiting = true;
      requestAnimationFrame(function(){ waiting = false; labelTables(); polish(); });
    });
    if(document.body) mo.observe(document.body, { childList:true, subtree:true });
  }

  function boot(){
    setTheme(getTheme());
    document.body.classList.add('jts-apex');
    document.body.classList.toggle('jts-auth-page', publicPage || !!document.querySelector('#loginForm') || !!document.querySelector('#registerForm'));
    ensureHeader();
    normalizeHeader();
    ensureMenu();
    authThemeButton();
    labelTables();
    polish();
    observe();
    [120,400,1000].forEach(function(ms){ setTimeout(function(){ normalizeHeader(); ensureMenu(); labelTables(); polish(); }, ms); });
  }

  window.JTSApexUI = { setTheme:setTheme, toggleTheme:toggleTheme, ensureMenu:ensureMenu, labelTables:labelTables, currentUser:currentUser };
  ready(boot);
})();
