// JTS final mobile/GPS guard - safe production version.
// This file no longer creates a second menu. The canonical menu is managed by jts-apex-production-ui.js.
(function(){
  'use strict';
  var LIVE_SHARE_URL = 'https://cloud.rockeld.us/#/live-share/company/ZDmqKFelT50-u6n9ojxImg';
  function expose(){ window.JTS_GPS_LIVE_SHARE_URL = LIVE_SHARE_URL; }
  function normalizeGpsFrames(){
    document.querySelectorAll('iframe[src*="cloud.rockeld.us"],iframe#gpsFrame,iframe#frame').forEach(function(frame){
      var src = frame.getAttribute('src') || '';
      if(!src || src.indexOf('cloud.rockeld.us') !== -1) frame.setAttribute('src', LIVE_SHARE_URL);
    });
    document.querySelectorAll('a[href*="cloud.rockeld.us"]').forEach(function(a){ a.setAttribute('href', LIVE_SHARE_URL); });
  }
  function run(){ expose(); normalizeGpsFrames(); if(window.JTSApexUI && window.JTSApexUI.ensureMenu) window.JTSApexUI.ensureMenu(); }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, {once:true}); else run();
  window.addEventListener('pageshow', run);
  [150,600,1200].forEach(function(ms){ setTimeout(run, ms); });
})();
