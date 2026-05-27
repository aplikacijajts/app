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
