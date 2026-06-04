// JTS GPS live-share final configuration and Admin Map cleanup.
(function(){
  const LIVE_SHARE_URL = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';
  function getRole(){
    try{
      const token = localStorage.getItem('token') || '';
      const part = token.split('.')[1];
      if(!part) return '';
      return String(JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/'))).role || '').toLowerCase();
    }catch(e){ return ''; }
  }
  function cleanupAdminMap(){
    const role = getRole();
    if(role !== 'admin') return;
    document.querySelectorAll('a[href*="live-map.html"], a[href="/live-map.html"]').forEach(el => el.remove());
    document.querySelectorAll('a,button').forEach(el => {
      const t=(el.textContent||'').trim().toLowerCase();
      const href=(el.getAttribute && (el.getAttribute('href')||'')).toLowerCase();
      if(t === 'map' || href.includes('live-map.html')) el.remove();
    });
  }
  function exposeConfig(){ window.JTS_GPS_LIVE_SHARE_URL = LIVE_SHARE_URL; }
  function forceGpsFrame(){
    document.querySelectorAll('iframe#gpsFrame, iframe#frame').forEach(frame => {
      const current = frame.getAttribute('src') || '';
      if(current && current.includes('cloud.rockeld.us') && !current.includes('/live-share/company/ZDmqKFelT50-u6n9ojxImg')){
        frame.setAttribute('src', LIVE_SHARE_URL);
      }
    });
  }
  document.addEventListener('DOMContentLoaded', () => { exposeConfig(); cleanupAdminMap(); forceGpsFrame(); setTimeout(cleanupAdminMap, 250); setTimeout(cleanupAdminMap, 900); setTimeout(forceGpsFrame, 250); setTimeout(forceGpsFrame, 900); });
})();
