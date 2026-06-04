// JTS GPS access finalizer: GPS is visible only for admin, dispatcher and broker.
(function(){
  const ALLOWED = new Set(['admin','dispatcher','broker']);
  function decode(token){
    try{ const part=(token||'').split('.')[1]; if(!part) return null; return JSON.parse(decodeURIComponent(Array.prototype.map.call(atob(part.replace(/-/g,'+').replace(/_/g,'/')), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''))); }catch(e){ try{return JSON.parse(atob(((token||'').split('.')[1]||'').replace(/-/g,'+').replace(/_/g,'/')))}catch(_){return null;} }
  }
  function role(){ return String((window.JTSAuth?.currentUser?.() || decode(localStorage.getItem('token')||'') || {}).role || '').toLowerCase(); }
  function cleanup(){
    const r=role();
    if(!ALLOWED.has(r)){
      document.querySelectorAll('a[href*="gps.html"],a[href*="/gps"],a[href*="live-map.html"]').forEach(el=>el.remove());
      document.querySelectorAll('[data-gps],#gpsFrame,#frame').forEach(el=>{ const section=el.closest('section,.bg-white,.enterprise-panel,main') || el; section.style.display='none'; });
      if(location.pathname==='/gps.html' || location.pathname==='/live-map.html') location.replace(r==='driver'?'/driver.html':'/index.html');
    }
  }
  document.addEventListener('DOMContentLoaded',cleanup,{once:true}); window.addEventListener('pageshow',cleanup); setTimeout(cleanup,80); setTimeout(cleanup,500);
})();
