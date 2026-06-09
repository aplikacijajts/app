// JTS Enterprise Complete UI 2026
// Non-invasive UI enhancer. It adds navigation, dark mode, table labels,
// stats cards and visual classes without changing existing app logic.
(function(){
  'use strict';

  var STORAGE_KEY = 'jts-ui-theme';
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var authPages = { 'index.html': true, 'register.html': true };
  var noShellPages = { 'index.html': true, 'register.html': true };

  var navItems = [
    { href:'/home.html', label:'Home', icon:'⌂', pages:['home.html'] },
    { href:'/enterprise.html', label:'Enterprise', icon:'▦', pages:['enterprise.html','command-center.html','settings-center.html','onboarding.html'] },
    { href:'/dispatcher.html', label:'Dispatch', icon:'⇄', pages:['dispatcher.html','admin-loads.html','load-details.html'] },
    { href:'/driver.html', label:'Driver', icon:'◉', pages:['driver.html','gps.html','live-map.html'] },
    { href:'/broker.html', label:'Broker', icon:'◇', pages:['broker.html'] },
    { href:'/chat.html', label:'Chat', icon:'✉', pages:['chat.html','notifications.html'] },
    { href:'/admin.html', label:'Admin', icon:'⚙', pages:['admin.html','admin-users.html'] }
  ];

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  }

  function setInitialTheme(){
    try{
      var saved = localStorage.getItem(STORAGE_KEY);
      if(saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-jts-theme', saved);
      else document.documentElement.setAttribute('data-jts-theme', 'light');
    }catch(e){ document.documentElement.setAttribute('data-jts-theme','light'); }
  }

  function toggleTheme(){
    var next = document.documentElement.getAttribute('data-jts-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-jts-theme', next);
    try{ localStorage.setItem(STORAGE_KEY, next); }catch(e){}
    updateThemeButtons(next);
  }

  function updateThemeButtons(theme){
    document.querySelectorAll('[data-jts-theme-toggle]').forEach(function(btn){
      btn.setAttribute('aria-label', theme === 'dark' ? 'Light mode' : 'Dark mode');
      btn.textContent = theme === 'dark' ? '☀' : '◐';
    });
  }

  function isActive(item){
    return item.pages.indexOf(page) !== -1 || item.href.split('/').pop().toLowerCase() === page;
  }

  function createLink(item, mobile){
    var a = document.createElement('a');
    a.href = item.href;
    a.setAttribute('aria-label', item.label);
    a.className = mobile ? 'jts-e-mobile-link' : '';
    if(isActive(item)) a.classList.add('active');
    if(mobile){
      var icon = document.createElement('span'); icon.textContent = item.icon;
      var text = document.createElement('em'); text.textContent = item.label; text.style.fontStyle = 'normal';
      a.appendChild(icon); a.appendChild(text);
    }else{
      a.textContent = item.icon;
      a.title = item.label;
    }
    return a;
  }

  function injectSidebar(){
    if(noShellPages[page] || document.querySelector('.jts-e-sidebar')) return;
    document.body.classList.add('jts-has-desktop-sidebar');
    var aside = document.createElement('aside');
    aside.className = 'jts-e-sidebar';
    aside.setAttribute('aria-label','JTS navigation');

    var logo = document.createElement('a');
    logo.href = '/home.html';
    logo.className = 'jts-e-sidebar-logo';
    logo.setAttribute('aria-label','JTS Home');
    var img = document.createElement('img'); img.src = '/assets/jts-logo.png'; img.alt = 'JTS';
    logo.appendChild(img);
    aside.appendChild(logo);

    var nav = document.createElement('nav');
    nav.className = 'jts-e-sidebar-nav';
    navItems.forEach(function(item){ nav.appendChild(createLink(item, false)); });
    aside.appendChild(nav);

    var spacer = document.createElement('div'); spacer.className = 'jts-e-sidebar-spacer'; aside.appendChild(spacer);
    var theme = document.createElement('button');
    theme.type = 'button'; theme.className = 'jts-e-icon-btn'; theme.setAttribute('data-jts-theme-toggle',''); theme.addEventListener('click', toggleTheme);
    aside.appendChild(theme);
    document.body.appendChild(aside);
  }

  function injectMobileNav(){
    if(noShellPages[page] || document.querySelector('.jts-e-mobile-nav')) return;
    document.body.classList.add('jts-has-mobile-nav');
    var nav = document.createElement('nav');
    nav.className = 'jts-e-mobile-nav';
    nav.setAttribute('aria-label','Mobile JTS navigation');
    var mobileItems = [navItems[0], navItems[1], navItems[2], navItems[3], navItems[6]];
    mobileItems.forEach(function(item){ nav.appendChild(createLink(item, true)); });
    document.body.appendChild(nav);
  }

  function addHeaderThemeButton(){
    if(document.querySelector('header [data-jts-theme-toggle]')) return;
    var headerInner = document.querySelector('header > div');
    if(!headerInner) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'jts-e-icon-btn';
    btn.setAttribute('data-jts-theme-toggle','');
    btn.addEventListener('click', toggleTheme);
    btn.style.width = '44px'; btn.style.height = '44px'; btn.style.flex = '0 0 auto';
    headerInner.appendChild(btn);
  }

  function labelTables(root){
    (root || document).querySelectorAll('table').forEach(function(table){
      var headers = Array.prototype.slice.call(table.querySelectorAll('thead th')).map(function(th){ return (th.textContent || '').trim(); });
      if(!headers.length) return;
      table.querySelectorAll('tbody tr').forEach(function(row){
        Array.prototype.slice.call(row.children).forEach(function(td, i){
          if(headers[i] && !td.getAttribute('data-label')) td.setAttribute('data-label', headers[i]);
        });
      });
    });
  }

  function markActiveLinks(){
    document.querySelectorAll('a[href]').forEach(function(a){
      var href = (a.getAttribute('href') || '').split('?')[0].split('#')[0].split('/').pop().toLowerCase();
      if(href && href === page) a.classList.add('active');
    });
  }

  function polishLogout(){
    document.querySelectorAll('button,a').forEach(function(el){
      var t = (el.textContent || '').trim().toLowerCase();
      if(t === 'logout' || t === 'sign out' || t === 'одјави се') el.classList.add('signout');
    });
  }

  function statValue(selector, fallback){
    var el = document.querySelector(selector);
    var text = el ? (el.textContent || '').trim() : '';
    return text || fallback;
  }

  function injectStats(){
    if(authPages[page] || document.querySelector('.jts-e-stats')) return;
    var main = document.querySelector('main');
    if(!main) return;
    var firstReal = main.firstElementChild;
    var stats = document.createElement('section');
    stats.className = 'jts-e-stats';
    stats.setAttribute('aria-label','JTS quick overview');
    var items = [
      { k:'Workspace', v:document.title ? document.title.replace('JTS Logistics Portal','Portal').trim() || 'JTS' : 'JTS', s:'Active module' },
      { k:'Status', v:statValue('#status','Ready'), s:'Live interface' },
      { k:'Navigation', v:'Fast', s:'Desktop, tablet, mobile' },
      { k:'Theme', v:'JTS', s:'Logo colors enabled' }
    ];
    items.forEach(function(it){
      var card = document.createElement('article'); card.className = 'jts-e-stat';
      card.innerHTML = '<div class="jts-e-stat-k"></div><div class="jts-e-stat-v"></div><div class="jts-e-stat-s"></div>';
      card.children[0].textContent = it.k; card.children[1].textContent = it.v; card.children[2].textContent = it.s;
      stats.appendChild(card);
    });
    if(firstReal) main.insertBefore(stats, firstReal.nextSibling && firstReal.matches('section,div') ? firstReal.nextSibling : firstReal);
    else main.appendChild(stats);
  }

  function setupObserver(){
    var scheduled = false;
    var observer = new MutationObserver(function(){
      if(scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(function(){
        scheduled = false;
        labelTables();
        polishLogout();
      });
    });
    observer.observe(document.body, { childList:true, subtree:true });
  }

  setInitialTheme();
  ready(function(){
    document.body.classList.add('jts-enterprise-complete');
    if(authPages[page] || document.querySelector('#loginForm')) document.body.classList.add('jts-auth-page');
    injectSidebar();
    injectMobileNav();
    addHeaderThemeButton();
    injectStats();
    labelTables();
    markActiveLinks();
    polishLogout();
    updateThemeButtons(document.documentElement.getAttribute('data-jts-theme') || 'light');
    setupObserver();
  });
})();
