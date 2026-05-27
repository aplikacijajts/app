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
