// Applies the saved theme before first paint (external file so the strict CSP needs no inline script).
(function () {
  try {
    var pref = localStorage.getItem('jtsTheme');
    if (pref === 'light' || pref === 'dark') document.documentElement.setAttribute('data-theme', pref);
    if (localStorage.getItem('jtsNavRail') === 'true' && window.matchMedia('(min-width: 1025px)').matches) document.documentElement.classList.add('pre-nav-rail');
  } catch (e) { /* storage unavailable: use system theme */ }
})();
