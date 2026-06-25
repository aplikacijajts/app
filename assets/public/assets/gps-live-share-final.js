// JTS GPS live-share final configuration.
// Keeps all map links available for roles allowed by auth guard; only normalizes live-share URLs.
(function(){
  'use strict';
  var LIVE_SHARE_URL = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';
  function run(){
    window.JTS_GPS_LIVE_SHARE_URL = LIVE_SHARE_URL;
    document.querySelectorAll('iframe#gpsFrame,iframe#frame,iframe[src*="cloud.rockeld.us"]').forEach(function(frame){
      var current = frame.getAttribute('src') || '';
      if(!current || current.indexOf('cloud.rockeld.us') !== -1) frame.setAttribute('src', LIVE_SHARE_URL);
    });
    document.querySelectorAll('a[href*="cloud.rockeld.us"]').forEach(function(a){ a.setAttribute('href', LIVE_SHARE_URL); });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
  window.addEventListener('pageshow', run);
  [250,900].forEach(function(ms){ setTimeout(run, ms); });
})();
