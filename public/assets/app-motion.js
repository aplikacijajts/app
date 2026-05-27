// Premium motion layer: page transitions, tab animations, button ripple, reveal effects.
(function () {
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function isHidden(el) {
    return el && (el.classList.contains('hidden') || el.hidden || getComputedStyle(el).display === 'none');
  }

  function markTabButtons() {
    var tabIds = ['tabApprovals', 'tabInbox', 'tabBids', 'viewActive', 'viewFinished'];
    tabIds.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.classList.add('jts-tab-button');
    });

    var knownSections = ['approvalsSection', 'inboxSection', 'bidsSection'];
    knownSections.forEach(function (id) {
      var section = document.getElementById(id);
      if (section) section.classList.add('jts-tab-panel');
    });
  }

  function animateVisiblePanel(panel) {
    if (!panel || reduceMotion) return;
    panel.classList.remove('jts-panel-enter');
    void panel.offsetWidth;
    panel.classList.add('jts-panel-enter');
    window.setTimeout(function () { panel.classList.remove('jts-panel-enter'); }, 520);
  }

  function attachTabAnimations() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.jts-tab-button, [id^="tab"], #viewActive, #viewFinished'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.jts-tab-panel, section[id$="Section"]'));

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.classList.add('jts-tab-tapped');
        setTimeout(function () { btn.classList.remove('jts-tab-tapped'); }, 260);
        setTimeout(function () {
          panels.forEach(function (panel) {
            if (!isHidden(panel)) animateVisiblePanel(panel);
          });
        }, 30);
      }, { passive: true });
    });
  }

  function attachRipple() {
    document.addEventListener('pointerdown', function (e) {
      var target = e.target.closest('button, .jts-btn, a[role="button"], a.border, .px-4.py-2, .px-5.py-3');
      if (!target || reduceMotion) return;
      var rect = target.getBoundingClientRect();
      var ripple = document.createElement('span');
      ripple.className = 'jts-ripple';
      var size = Math.max(rect.width, rect.height) * 1.35;
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      target.appendChild(ripple);
      setTimeout(function () { ripple.remove(); }, 720);
    }, { passive: true });
  }

  function revealCards() {
    var items = Array.prototype.slice.call(document.querySelectorAll('main section, main .bg-white.border, main .grid > *'));
    items.forEach(function (el, i) {
      el.classList.add('jts-reveal');
      el.style.setProperty('--jts-delay', Math.min(i * 55, 420) + 'ms');
    });

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });
  }

  function enhanceHeader() {
    var header = document.querySelector('header');
    if (!header) return;
    var onScroll = function () {
      header.classList.toggle('jts-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  function addVisualLayer() {
    if (document.querySelector('.jts-ambient')) return;
    var ambient = document.createElement('div');
    ambient.className = 'jts-ambient';
    ambient.setAttribute('aria-hidden', 'true');
    ambient.innerHTML = '<span></span><span></span><span></span>';
    document.body.prepend(ambient);
  }

  ready(function () {
    addVisualLayer();
    markTabButtons();
    attachTabAnimations();
    attachRipple();
    revealCards();
    enhanceHeader();
    document.documentElement.classList.add('jts-motion-ready');
  });
})();

// Final UI polish: segmented tab wrappers, active-state indicator, smart button labels.
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function wrapTabs(ids) {
    var buttons = ids.map(function (id) { return document.getElementById(id); }).filter(Boolean);
    if (buttons.length < 2 || buttons[0].parentElement.classList.contains('jts-tab-strip')) return;
    var parent = buttons[0].parentElement;
    var strip = document.createElement('div');
    strip.className = 'jts-tab-strip';
    var indicator = document.createElement('span');
    indicator.className = 'jts-tab-indicator';
    strip.appendChild(indicator);
    parent.insertBefore(strip, buttons[0]);
    buttons.forEach(function (btn) { strip.appendChild(btn); });
  }

  function isActive(btn) {
    if (!btn) return false;
    return btn.className.indexOf('jts-btn') !== -1 || btn.getAttribute('aria-selected') === 'true';
  }

  function updateIndicators() {
    document.querySelectorAll('.jts-tab-strip').forEach(function (strip) {
      var indicator = strip.querySelector('.jts-tab-indicator');
      var buttons = Array.prototype.slice.call(strip.querySelectorAll('button'));
      var active = buttons.find(isActive) || buttons[0];
      if (!indicator || !active) return;
      var s = strip.getBoundingClientRect();
      var a = active.getBoundingClientRect();
      indicator.style.width = a.width + 'px';
      indicator.style.transform = 'translateX(' + (a.left - s.left) + 'px)';
      indicator.style.opacity = isActive(active) ? '.22' : '.10';
    });
  }

  function observeTabClassChanges() {
    var observer = new MutationObserver(function () { window.requestAnimationFrame(updateIndicators); });
    document.querySelectorAll('.jts-tab-strip button').forEach(function (btn) {
      observer.observe(btn, { attributes: true, attributeFilter: ['class', 'aria-selected'] });
    });
    window.addEventListener('resize', function () { window.requestAnimationFrame(updateIndicators); }, { passive: true });
    document.addEventListener('click', function () { setTimeout(updateIndicators, 60); }, true);
    setTimeout(updateIndicators, 80);
    setTimeout(updateIndicators, 450);
  }

  function enhanceDynamicButtons() {
    document.body.addEventListener('mouseenter', function (e) {
      var btn = e.target.closest && e.target.closest('button');
      if (!btn || btn.dataset.jtsEnhanced) return;
      btn.dataset.jtsEnhanced = '1';
    }, true);
  }

  ready(function () {
    wrapTabs(['tabApprovals', 'tabInbox', 'tabBids']);
    wrapTabs(['tabLoads', 'tabDocs', 'tabBids']);
    wrapTabs(['viewActive', 'viewFinished']);
    observeTabClassChanges();
    enhanceDynamicButtons();
  });
})();

// Premium Enterprise additions: mobile dock, theme switch, command palette, smart KPI cards, toast feedback.
(function () {
  function ready(fn){ if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true}); else fn(); }
  function iconFor(label){
    label = (label || '').toLowerCase();
    if(label.includes('home')) return '⌂';
    if(label.includes('gps')) return '⌖';
    if(label.includes('admin')) return '⚙';
    if(label.includes('login')) return '↪';
    if(label.includes('register') || label.includes('account')) return '+';
    if(label.includes('logout')) return '⎋';
    return '•';
  }
  function addOrbs(){
    if(document.querySelector('.pe-orb-field')) return;
    var o = document.createElement('div'); o.className = 'pe-orb-field'; o.setAttribute('aria-hidden','true'); o.innerHTML = '<span></span><span></span><span></span>'; document.body.prepend(o);
  }
  function addThemeToggle(){
    if(document.querySelector('.pe-theme-toggle')) return;
    var saved = localStorage.getItem('pe-theme');
    if(saved === 'dark') document.body.classList.add('pe-dark');
    var btn = document.createElement('button'); btn.type='button'; btn.className='pe-theme-toggle'; btn.title='Toggle theme'; btn.innerHTML = document.body.classList.contains('pe-dark') ? '☀' : '☾';
    btn.onclick = function(){ document.body.classList.toggle('pe-dark'); var dark = document.body.classList.contains('pe-dark'); localStorage.setItem('pe-theme', dark ? 'dark':'light'); btn.innerHTML = dark ? '☀':'☾'; window.peToast && window.peToast('Theme updated', dark ? 'Dark mode enabled' : 'Light mode enabled'); };
    document.body.appendChild(btn);
  }
  function addBottomNav(){
    if(document.querySelector('.pe-bottom-nav')) return;
    var headerLinks = Array.prototype.slice.call(document.querySelectorAll('header a[href]')).filter(function(a){ return !a.href.includes('jtslogistics.net'); });
    if(!headerLinks.length) return;
    var nav = document.createElement('nav'); nav.className = 'pe-bottom-nav'; nav.setAttribute('aria-label','Mobile navigation');
    headerLinks.slice(0,5).forEach(function(a){
      var item = document.createElement('a'); item.href = a.getAttribute('href');
      var text = (a.textContent || 'Open').trim();
      item.innerHTML = '<span class="pe-icon">'+iconFor(text)+'</span><span class="pe-nav-text">'+text+'</span>';
      if(location.pathname.endsWith(item.getAttribute('href'))) item.classList.add('pe-active');
      nav.appendChild(item);
    });
    document.body.appendChild(nav);
  }
  function addToastSystem(){
    if(document.querySelector('#peToasts')) return;
    var wrap = document.createElement('div'); wrap.id='peToasts'; wrap.style.cssText='position:fixed;right:14px;top:calc(14px + env(safe-area-inset-top,0px));z-index:120;display:grid;gap:10px;'; document.body.appendChild(wrap);
    window.peToast = function(title, msg){
      var t = document.createElement('div'); t.className='pe-toast'; t.innerHTML='<span class="pe-toast-dot"></span><div><b>'+title+'</b><p>'+msg+'</p></div>';
      wrap.appendChild(t); setTimeout(function(){ t.style.opacity='0'; t.style.transform='translateY(-8px) scale(.98)'; }, 3300); setTimeout(function(){ t.remove(); }, 3800);
    };
  }
  function addCommandPalette(){
    if(document.querySelector('.pe-command-palette')) return;
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href]')).filter(function(a){ return a.getAttribute('href') && !a.getAttribute('href').startsWith('http'); });
    if(!links.length) return;
    var p = document.createElement('div'); p.className='pe-command-palette'; p.innerHTML='<div class="pe-command-box"><input placeholder="Search quick actions...  Ctrl + K" aria-label="Search quick actions"><div class="pe-command-list"></div></div>';
    var list = p.querySelector('.pe-command-list');
    links.forEach(function(a){ var x=document.createElement('a'); x.href=a.getAttribute('href'); x.textContent=(a.textContent||a.href).trim(); list.appendChild(x); });
    var input = p.querySelector('input'); input.addEventListener('input', function(){ var q=input.value.toLowerCase(); list.querySelectorAll('a').forEach(function(a){ a.style.display = a.textContent.toLowerCase().includes(q) ? '' : 'none'; }); });
    p.addEventListener('click', function(e){ if(e.target === p) p.classList.remove('pe-open'); });
    document.addEventListener('keydown', function(e){ if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k'){ e.preventDefault(); p.classList.add('pe-open'); setTimeout(function(){input.focus();},30); } if(e.key==='Escape') p.classList.remove('pe-open'); });
    document.body.appendChild(p);
  }
  function kpiNumber(sel){ var n = document.querySelectorAll(sel).length; return n ? String(n) : '—'; }
  function addKpis(){
    var main = document.querySelector('main.max-w-6xl, main.max-w-5xl');
    if(!main || main.querySelector('.pe-dashboard-grid')) return;
    var title = document.title || 'Portal';
    if(/login|register/i.test(title)) return;
    var grid = document.createElement('div'); grid.className='pe-dashboard-grid';
    grid.innerHTML = '<div class="pe-kpi"><small>Workspace</small><strong>Live</strong><span>Premium control center</span></div><div class="pe-kpi"><small>Tables</small><strong>'+kpiNumber('table')+'</strong><span>Smart data views</span></div><div class="pe-kpi"><small>Actions</small><strong>'+kpiNumber('button')+'</strong><span>Fast operation buttons</span></div><div class="pe-kpi"><small>Status</small><strong>Ready</strong><span>Optimized for mobile</span></div>';
    main.insertBefore(grid, main.firstElementChild);
  }
  function enhanceButtons(){
    document.querySelectorAll('button, .jts-btn, a.border, a[role="button"]').forEach(function(btn){
      if(btn.dataset.peIcon) return;
      var txt=(btn.textContent||'').trim(); if(!txt || btn.querySelector('.pe-icon')) return;
      var map=[['refresh','↻'],['save','✓'],['approve','✓'],['reject','×'],['request','!'],['upload','⇧'],['login','↪'],['logout','⎋'],['create','+'],['add','+'],['details','→'],['view','◉'],['gps','⌖'],['home','⌂']];
      var found = map.find(function(m){ return txt.toLowerCase().includes(m[0]); });
      if(found){ btn.dataset.peIcon='1'; btn.insertAdjacentHTML('afterbegin','<span class="pe-icon">'+found[1]+'</span> '); }
    });
  }
  function clickFeedback(){
    document.addEventListener('click', function(e){
      var btn = e.target.closest && e.target.closest('button, .jts-btn, a.border');
      if(!btn || !window.peToast) return;
      var txt = (btn.textContent || '').replace(/^[↻✓×!⇧↪⎋+→◉⌖⌂•]\s*/, '').trim();
      if(/logout/i.test(txt)) window.peToast('Signing out', 'Your session is closing.');
      else if(/refresh/i.test(txt)) window.peToast('Refreshing', 'Latest information is being loaded.');
      else if(/approve|save|submit|upload/i.test(txt)) window.peToast('Action started', txt);
    }, true);
  }
  function skeletonOnLoad(){
    document.querySelectorAll('tbody').forEach(function(tb){
      if(tb.children.length) return;
      tb.classList.add('pe-skeleton');
      setTimeout(function(){ tb.classList.remove('pe-skeleton'); }, 900);
    });
  }
  ready(function(){ addOrbs(); addToastSystem(); addThemeToggle(); addBottomNav(); addCommandPalette(); addKpis(); enhanceButtons(); clickFeedback(); skeletonOnLoad(); setInterval(enhanceButtons, 1500); });
})();
