// JTS APEX UI - stable production shell.
// Visual/navigation enhancer only: does not change business API logic.
(function(){
  'use strict';

  var THEME_KEY = 'jts-theme-mode';
  var path = (location.pathname || '/').replace(/\/+$/, '') || '/';
  var file = (path.split('/').pop() || 'index.html').toLowerCase();
  var publicPage = path === '/' || /\/(index|register)\.html$/i.test(path);
  var GPS_URL = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';
  var tableObserver = null;

  var icons = {
    menu:'<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    close:'<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home:'<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
    dashboard:'<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
    users:'<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    truck:'<svg viewBox="0 0 24 24"><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
    user:'<svg viewBox="0 0 24 24"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>',
    enterprise:'<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h7v18"/><path d="M14 9h3a2 2 0 0 1 2 2v10"/><path d="M9 7h1M9 11h1M9 15h1"/></svg>',
    map:'<svg viewBox="0 0 24 24"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    chat:'<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
    bell:'<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
    settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .4.2.78.6 1 .3.2.7.4 1.1.4H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51.6z"/></svg>',
    moon:'<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
    sun:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
    fuel:'<svg viewBox="0 0 24 24"><path d="M5 21V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17"/><path d="M8 7h5"/><path d="M8 11h5"/><path d="M16 8h2l2 2v8a2 2 0 0 0 4 0v-6l-3-3"/><path d="M4 21h13"/></svg>',
    document:'<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
    logout:'<svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>'
  };

  var titles = {
    'home.html':'Dashboard','admin.html':'Admin Panel','admin-users.html':'Users & Roles','admin-loads.html':'Loads','dispatcher.html':'Dispatcher','driver.html':'Driver Portal','broker.html':'Broker Workspace','enterprise.html':'Enterprise Center','command-center.html':'Command Center','settings-center.html':'Settings','onboarding.html':'Company Setup','gps.html':'GPS Tracking','live-map.html':'GPS Tracking','load-details.html':'Load Details','chat.html':'Messages','notifications.html':'Notifications','fuel.html':'Fuel','confirmation.html':'Confirmation','index.html':'JTS Logistics','register.html':'Create Account'
  };

  var routes = {
    admin:[['/home.html','Home','home'],['/admin.html','Admin','dashboard'],['/admin-users.html','Users','users'],['/admin-loads.html','Loads','truck'],['/dispatcher.html','Dispatcher','truck'],['/enterprise.html','Enterprise','enterprise'],['/command-center.html','Command Center','dashboard'],['/gps.html','GPS','map'],['/fuel.html','Fuel','fuel'],['/confirmation.html','Confirmation','document'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell'],['/settings-center.html','Settings','settings']],
    dispatcher:[['/home.html','Home','home'],['/dispatcher.html','Dispatcher','truck'],['/command-center.html','Command Center','dashboard'],['/gps.html','GPS','map'],['/fuel.html','Fuel','fuel'],['/confirmation.html','Confirmation','document'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']],
    driver:[['/home.html','Home','home'],['/driver.html','Driver','user'],['/fuel.html','Fuel','fuel'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']],
    broker:[['/home.html','Home','home'],['/broker.html','Broker','enterprise'],['/gps.html','GPS','map'],['/fuel.html','Fuel','fuel'],['/chat.html','Messages','chat'],['/notifications.html','Notifications','bell']]
  };

  function ready(fn){ document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, { once:true }) : fn(); }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function decodeToken(t){ try{ var p = String(t || '').split('.')[1]; if(!p) return null; p = p.replace(/-/g,'+').replace(/_/g,'/'); while(p.length % 4) p += '='; return JSON.parse(atob(p)); } catch(e){ return null; } }
  function user(){
    if(window.JTSAuth && typeof window.JTSAuth.currentUser === 'function'){
      try{ var au = window.JTSAuth.currentUser(); if(au && au.role) return au; }catch(e){}
    }
    var u = decodeToken(localStorage.getItem('token') || '');
    if(u && u.role && (!u.exp || Date.now() < u.exp * 1000)) return u;
    try{ u = JSON.parse(localStorage.getItem('user') || 'null'); if(u && u.role) return u; }catch(e){}
    return null;
  }
  function theme(){ var t; try{ t = localStorage.getItem(THEME_KEY); }catch(e){} return t === 'dark' ? 'dark' : 'light'; }
  function setTheme(t){ t = t === 'dark' ? 'dark' : 'light'; document.documentElement.setAttribute('data-jts-theme', t); document.documentElement.style.colorScheme = t; try{ localStorage.setItem(THEME_KEY, t); }catch(e){} refreshThemeButtons(); }
  function refreshThemeButtons(){ var dark = document.documentElement.getAttribute('data-jts-theme') === 'dark'; document.querySelectorAll('[data-jts-theme-toggle],[data-jts-auth-theme]').forEach(function(b){ b.innerHTML = '<span class="jts-menu-icon">' + (dark ? icons.sun : icons.moon) + '</span><span>' + (dark ? 'Light' : 'Dark') + '</span>'; b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme'); }); }
  function logout(){ try{ localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); }catch(e){} location.href = '/index.html'; }
  function active(h){ var p = (h || '').split('?')[0].replace(/\/+$/, '') || '/'; if(path === p) return true; if((path === '/gps.html' || path === '/live-map.html') && p === '/gps.html') return true; if((path === '/settings-center.html' || path === '/onboarding.html') && p === '/enterprise.html') return true; return false; }
  function routeList(){ var u = user(); return routes[(u && u.role) || 'driver'] || routes.driver; }

  function ensureHeader(){
    if(publicPage) return;
    if(document.querySelector('header')) return;
    var h = document.createElement('header');
    h.innerHTML = '<div class="jts-header-inner"><a class="jts-brand" href="/home.html"><img src="/assets/jts-logo.png" alt="JTS"><span>' + esc(titles[file] || 'JTS Logistics') + '</span></a><div class="jts-header-actions"></div></div>';
    document.body.insertBefore(h, document.body.firstChild);
  }

  function normalizeHeader(){
    var h = document.querySelector('header');
    if(!h) return;
    var inner = h.querySelector(':scope > div') || h;
    inner.classList.add('jts-header-inner');
    var brand = inner.querySelector('.jts-brand,.font-bold,a[href="/home.html"],a[href="/"]') || inner.firstElementChild;
    if(brand){
      brand.classList.add('jts-brand');
      if(brand.tagName !== 'A') brand.setAttribute('role','link');
      if(!brand.querySelector('img')) brand.insertAdjacentHTML('afterbegin', '<img src="/assets/jts-logo.png" alt="JTS">');
      var span = brand.querySelector('span:last-child');
      if(!span){
        var t = brand.textContent.trim() || titles[file] || 'JTS Logistics';
        Array.from(brand.childNodes).forEach(function(n){ if(n.nodeType === 3) n.remove(); });
        brand.insertAdjacentHTML('beforeend', '<span>' + esc(t) + '</span>');
      }
    }
    var actions = inner.querySelector('.jts-header-actions');
    if(!actions){ actions = document.createElement('div'); actions.className = 'jts-header-actions'; inner.appendChild(actions); }
    Array.from(inner.children).forEach(function(ch){
      if(ch !== brand && ch !== actions && !ch.classList.contains('jts-header-actions')){
        if(ch.tagName === 'NAV' || (ch.querySelector && ch.querySelector('a'))) ch.classList.add('jts-native-nav');
      }
    });
  }

  function buildMenu(){
    if(publicPage) return;
    var old = document.querySelector('.jts-menu-root');
    if(old) old.remove();
    var u = user();
    var items = routeList();
    var root = document.createElement('div');
    root.className = 'jts-menu-root';
    root.innerHTML = '<div class="jts-menu-backdrop" data-jts-close-menu></div><aside class="jts-menu-panel" aria-label="JTS menu"><div class="jts-menu-head"><div class="jts-brand"><img src="/assets/jts-logo.png" alt="JTS"><span>JTS Logistics</span></div><button type="button" class="jts-menu-close" data-jts-close-menu aria-label="Close menu">' + icons.close + '</button></div><div class="jts-menu-user"><b>' + esc((u && (u.name || u.email)) || 'User') + '</b><span>' + esc((u && u.role) || 'guest') + '</span></div><nav class="jts-menu-list">' + items.map(function(r){ return '<a class="jts-menu-link ' + (active(r[0]) ? 'is-active' : '') + '" href="' + r[0] + '"><span class="jts-menu-icon">' + (icons[r[2]] || icons.dashboard) + '</span><span>' + esc(r[1]) + '</span></a>'; }).join('') + '</nav><div class="jts-menu-foot"><button type="button" class="jts-menu-action" data-jts-theme-toggle></button><button type="button" class="jts-menu-action is-danger" data-jts-logout><span class="jts-menu-icon">' + icons.logout + '</span><span>Logout</span></button></div></aside>';
    document.body.appendChild(root);
    refreshThemeButtons();
  }

  function ensureTrigger(){
    if(publicPage) return;
    var h = document.querySelector('header');
    if(!h) return;
    var actions = h.querySelector('.jts-header-actions') || h.querySelector(':scope > div') || h;
    if(!actions.querySelector('.jts-menu-trigger')) actions.insertAdjacentHTML('afterbegin', '<button type="button" class="jts-menu-trigger" data-jts-open-menu><span class="jts-menu-icon">' + icons.menu + '</span><span>Menu</span></button>');
    if(!actions.querySelector('[data-jts-theme-toggle].jts-header-theme')) actions.insertAdjacentHTML('beforeend', '<button type="button" class="jts-header-theme" data-jts-theme-toggle></button>');
    refreshThemeButtons();
  }

  function pageHead(){
    if(publicPage) return;
    var main = document.querySelector('main');
    if(!main || main.querySelector('.jts-page-titlebar')) return;
    var bar = document.createElement('section');
    bar.className = 'jts-page-titlebar';
    bar.innerHTML = '<div><span>JTS Logistics</span><h1>' + esc(titles[file] || 'Dashboard') + '</h1></div><button type="button" class="jts-btn jts-btn-ghost" data-jts-open-menu>Open menu</button>';
    main.insertBefore(bar, main.firstChild);
  }

  function labelsForTable(table){
    var heads = Array.from(table.querySelectorAll('thead th')).map(function(th){ return (th.textContent || '').trim(); });
    if(!heads.length){
      var firstRow = table.querySelector('tbody tr');
      if(firstRow) heads = Array.from(firstRow.children).map(function(_, i){ return 'Column ' + (i + 1); });
    }
    return heads;
  }

  function applyTableLabels(table){
    if(!table) return;
    var heads = labelsForTable(table);
    if(!heads.length) return;
    table.querySelectorAll('tbody tr').forEach(function(tr){
      Array.from(tr.children).forEach(function(td, i){
        if(td.hasAttribute('colspan')){ td.setAttribute('data-label', ''); return; }
        var label = heads[i] || '';
        td.setAttribute('data-label', label);
      });
    });
  }

  function mobileTables(){
    document.querySelectorAll('table').forEach(function(table){ applyTableLabels(table); });
  }

  function observeTables(){
    if(tableObserver) return;
    tableObserver = new MutationObserver(function(mutations){
      var tables = new Set();
      mutations.forEach(function(m){
        var node = m.target;
        if(node && node.closest){
          var table = node.closest('table');
          if(table) tables.add(table);
        }
        Array.from(m.addedNodes || []).forEach(function(n){
          if(n.nodeType !== 1) return;
          if(n.tagName === 'TABLE') tables.add(n);
          if(n.querySelectorAll) n.querySelectorAll('table').forEach(function(t){ tables.add(t); });
          if(n.closest){ var t = n.closest('table'); if(t) tables.add(t); }
        });
      });
      if(!tables.size) return;
      requestAnimationFrame(function(){ tables.forEach(applyTableLabels); });
    });
    tableObserver.observe(document.body, { childList:true, subtree:true });
  }

  function cleanupDuplicates(){
    document.querySelectorAll('.jts-apex-rail,.jts-bottom-nav,.jts-quick-actions,.jts-final-rail,.jts-mobile-dock,.enterprise-dock').forEach(function(e){ e.remove(); });
    document.querySelectorAll('header [data-jts-logout], header #logout, header button[id="logout"]').forEach(function(e){ e.remove(); });

    // Treat Live Map as the same module as GPS to avoid duplicate menu/actions.
    document.querySelectorAll('a[href="/live-map.html"],a[href="live-map.html"]').forEach(function(a){
      a.setAttribute('href', '/gps.html');
      var text = (a.textContent || '').trim();
      if(!text || /live\s*map|fleet\s*map|map/i.test(text)) a.textContent = 'GPS';
    });

    document.querySelectorAll('h1,h2,h3,button,a,span').forEach(function(el){
      if(el.children.length && !['A','BUTTON','SPAN'].includes(el.tagName)) return;
      var t = (el.textContent || '').trim();
      if(t === 'Live Map' || t === 'Live Fleet Map' || t === 'Fleet Map') el.textContent = 'GPS Tracking';
      if(t === 'GPS / Tracking') el.textContent = 'GPS Tracking';
    });

    // Remove exact duplicate links inside the same visible container.
    document.querySelectorAll('nav,.jts-header-actions,.enterprise-actions').forEach(function(nav){
      var seen = new Set();
      Array.from(nav.querySelectorAll('a[href]')).forEach(function(a){
        var href = a.getAttribute('href');
        var label = (a.textContent || '').trim().toLowerCase();
        var key = href + '|' + label;
        if(seen.has(key)) a.remove();
        else seen.add(key);
      });
    });
  }

  function gpsConfig(){
    window.JTS_GPS_LIVE_SHARE_URL = GPS_URL;
    document.querySelectorAll('iframe#gpsFrame,iframe#frame,iframe[src*="cloud.rockeld.us"]').forEach(function(f){
      if(!f.getAttribute('src') || f.getAttribute('src').indexOf('cloud.rockeld.us') !== -1) f.setAttribute('src', GPS_URL);
    });
    document.querySelectorAll('a[href*="cloud.rockeld.us"]').forEach(function(a){ a.href = GPS_URL; });
  }

  function fixPushBanner(){
    if(document.getElementById('jts-push-visibility-style')) return;
    var s = document.createElement('style');
    s.id = 'jts-push-visibility-style';
    s.textContent = '#pushBanner{display:block!important;visibility:visible!important;opacity:1!important}';
    document.head.appendChild(s);
  }

  function improveMeta(){
    document.documentElement.dataset.jtsUi = 'apex-final';
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if(themeColor) themeColor.setAttribute('content', document.documentElement.getAttribute('data-jts-theme') === 'dark' ? '#101719' : '#00a8a8');
  }

  function bind(){
    document.addEventListener('click', function(e){
      var open = e.target.closest && e.target.closest('[data-jts-open-menu]');
      if(open){ e.preventDefault(); document.body.classList.add('jts-menu-open'); return; }
      var close = e.target.closest && e.target.closest('[data-jts-close-menu]');
      if(close){ e.preventDefault(); document.body.classList.remove('jts-menu-open'); return; }
      var t = e.target.closest && e.target.closest('[data-jts-theme-toggle]');
      if(t){ e.preventDefault(); setTheme(document.documentElement.getAttribute('data-jts-theme') === 'dark' ? 'light' : 'dark'); improveMeta(); return; }
      var lo = e.target.closest && e.target.closest('[data-jts-logout]');
      if(lo){ e.preventDefault(); logout(); return; }
    }, true);
    document.addEventListener('keydown', function(e){ if(e.key === 'Escape') document.body.classList.remove('jts-menu-open'); });
  }

  function init(){
    setTheme(theme());
    document.body.classList.add('jts-apex');
    improveMeta();
    ensureHeader();
    normalizeHeader();
    buildMenu();
    ensureTrigger();
    pageHead();
    mobileTables();
    observeTables();
    cleanupDuplicates();
    gpsConfig();
    fixPushBanner();
    bind();
    setTimeout(function(){ mobileTables(); cleanupDuplicates(); gpsConfig(); }, 250);
    setTimeout(function(){ mobileTables(); cleanupDuplicates(); gpsConfig(); }, 1200);
  }

  ready(init);
})();
