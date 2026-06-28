// Enterprise Mobile Native Redesign Enhancer
// UI-only helper. Does not change API calls, payloads, auth, permissions, data or workflows.
(function(){
  'use strict';
  function ready(fn){ document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn, {once:true}) : fn(); }
  function pageTitle(){
    var h = document.querySelector('main h1, h1, title');
    return (h && (h.textContent || '').trim()) || 'JTS';
  }
  function applyMobileClass(){
    document.documentElement.classList.add('jts-mobile-native-redesign');
    document.body && document.body.classList.add('jts-mobile-native-redesign-body');
  }
  function labelTables(){
    document.querySelectorAll('table').forEach(function(table){
      var headers = Array.from(table.querySelectorAll('thead th')).map(function(th){ return (th.textContent || '').trim(); });
      if(!headers.length){
        var first = table.querySelector('tr');
        if(first) headers = Array.from(first.children || []).map(function(cell){ return (cell.textContent || '').trim(); });
      }
      table.querySelectorAll('tbody tr').forEach(function(row){
        Array.from(row.children || []).forEach(function(cell,i){
          if(!cell.getAttribute('data-label')) cell.setAttribute('data-label', headers[i] || 'Info');
        });
      });
    });
  }
  function enrichCards(){
    document.querySelectorAll('main > section, main > div, .enterprise-panel, .jts-surface').forEach(function(el){
      if(el.closest('header') || el.classList.contains('jts-mobile-processed')) return;
      el.classList.add('jts-mobile-processed');
    });
  }
  function improveViewport(){
    var meta = document.querySelector('meta[name="viewport"]');
    if(meta) meta.setAttribute('content','width=device-width, initial-scale=1, viewport-fit=cover');
  }
  function observeDynamicTables(){
    if(!window.MutationObserver) return;
    var pending = false;
    new MutationObserver(function(){
      if(pending) return;
      pending = true;
      requestAnimationFrame(function(){ pending = false; labelTables(); enrichCards(); });
    }).observe(document.body,{subtree:true,childList:true});
  }

  function currentFile(){
    return (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  }
  function pageClass(){
    var f = currentFile().replace(/\.html$/, '').replace(/[^a-z0-9]+/g, '-');
    if (f) document.body.classList.add('jts-page-' + f);
  }
  function getToken(){
    try { return localStorage.getItem('token') || ''; } catch(e) { return ''; }
  }
  function apiGet(path){
    var token = getToken();
    if(!token) return Promise.reject(new Error('No token'));
    return fetch(path, { headers: { Authorization: 'Bearer ' + token } }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(data){
        if(!res.ok) throw new Error(data.error || 'Request failed');
        return data;
      });
    });
  }
  function updateChatBadge(count){
    count = Number(count || 0);
    document.querySelectorAll('.jts-global-chat-badge,.jts-driver-chat-badge').forEach(function(b){
      b.textContent = count > 99 ? '99+' : String(count);
      b.classList.toggle('is-visible', count > 0);
      b.setAttribute('aria-label', count + ' unread chat messages');
    });
  }
  function refreshChatBadge(){
    if(!getToken()) return;
    apiGet('/api/chat/contacts').then(function(data){
      var total = (data.contacts || []).reduce(function(sum, c){ return sum + Number(c.unread || 0); }, 0);
      updateChatBadge(total);
    }).catch(function(){});
  }
  function initChatNotificationsStream(){
    var token = getToken();
    if(!token || !window.EventSource) return;
    try {
      var es = new EventSource('/api/notifications/stream?token=' + encodeURIComponent(token));
      es.addEventListener('notification', function(ev){
        try {
          var payload = JSON.parse(ev.data || '{}');
          var n = payload.notification || payload;
          if(n && n.type === 'chat_message') setTimeout(refreshChatBadge, 250);
        } catch(e) {}
      });
    } catch(e) {}
  }
  function ensureGlobalChatButton(){
    var file = currentFile();
    var publicPages = { 'index.html':1, 'register.html':1, 'onboarding.html':1 };
    if(publicPages[file] || !getToken()) return;

    var driverBtn = document.getElementById('jtsDriverFloatChat');
    if(driverBtn){
      driverBtn.innerHTML = '<span aria-hidden="true">💬</span><b class="jts-driver-chat-badge" aria-hidden="true">0</b>';
      driverBtn.setAttribute('aria-label', 'Open dispatcher chat');
      refreshChatBadge();
      initChatNotificationsStream();
      return;
    }

    if(document.getElementById('jtsGlobalFloatChat')) return;
    var a = document.createElement('a');
    a.id = 'jtsGlobalFloatChat';
    a.className = 'jts-global-float-chat';
    a.href = '/chat.html';
    a.setAttribute('aria-label', 'Open chat messages');
    a.setAttribute('title', 'Chat messages');
    a.innerHTML = '<span aria-hidden="true">💬</span><b class="jts-global-chat-badge" aria-hidden="true">0</b>';
    document.body.appendChild(a);
    refreshChatBadge();
    initChatNotificationsStream();
  }

  ready(function(){
    applyMobileClass();
    pageClass();
    improveViewport();
    labelTables();
    enrichCards();
    observeDynamicTables();
    ensureGlobalChatButton();
    setInterval(refreshChatBadge, 30000);
    document.documentElement.setAttribute('data-mobile-title', pageTitle());
  });
})();
