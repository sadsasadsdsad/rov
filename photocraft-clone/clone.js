/* clone.js — interactions the original site ships with its React bundle:
   theme toggle, mobile menu, Resources dropdown, copy buttons, reveal motion. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reduced = false;
  try { reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  function debounce(fn, ms) {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  /* ---------------- theme ---------------- */
  var SUN = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun h-4 w-4" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>';

  function storedTheme() {
    try {
      var t = localStorage.getItem('artcraft-theme');
      if (t === 'light' || t === 'dark') doc.setAttribute('data-theme', t);
    } catch (e) {}
  }
  function currentTheme() {
    return doc.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }
  function paintTheme() {
    var t = currentTheme();
    var toggles = document.querySelectorAll('button.invert-block');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].innerHTML = t === 'dark' ? SUN : toggles[i].getAttribute('data-moon') || toggles[i].innerHTML;
      toggles[i].setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
  }
  function initTheme() {
    storedTheme();
    var toggles = document.querySelectorAll('button.invert-block');
    for (var i = 0; i < toggles.length; i++) {
      if (!toggles[i].getAttribute('data-moon')) {
        toggles[i].setAttribute('data-moon', toggles[i].innerHTML);
      }
      toggles[i].addEventListener('click', function () {
        var next = currentTheme() === 'dark' ? 'light' : 'dark';
        doc.setAttribute('data-theme', next);
        try { localStorage.setItem('artcraft-theme', next); } catch (e) {}
        paintTheme();
      });
    }
    paintTheme();
  }

  /* ---------------- mobile menu ---------------- */
  function initMobileNav() {
    var btn = document.querySelector('button[aria-controls="mobile-nav"]');
    var panel = document.getElementById('mobile-nav');
    if (!btn || !panel) return;
    btn.addEventListener('click', function () {
      var open = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', open);
      btn.setAttribute('aria-expanded', String(!open));
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        panel.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    addEventListener('resize', function () {
      if (innerWidth >= 1024 && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ---------------- Resources dropdown ---------------- */
  function initResources() {
    var trigger = document.getElementById('resources-trigger');
    var menu = document.getElementById('resources-menu');
    if (!trigger || !menu) return;
    function close() {
      menu.classList.add('hidden');
      trigger.setAttribute('data-state', 'closed');
      trigger.setAttribute('aria-expanded', 'false');
    }
    function open() {
      menu.classList.remove('hidden');
      trigger.setAttribute('data-state', 'open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    trigger.setAttribute('aria-expanded', 'false');
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.classList.contains('hidden') ? open() : close();
    });
    document.addEventListener('click', function (e) {
      if (!menu.contains(e.target) && e.target !== trigger) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  }

  /* ---------------- copy buttons ---------------- */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return legacyCopy(text);
  }
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }
  function flash(label, text) {
    var prev = label.textContent;
    label.textContent = text;
    setTimeout(function () { label.textContent = prev; }, 1600);
  }
  function initCopy() {
    document.querySelectorAll('[data-track="share"][data-track-method="copy_link"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyText(location.href).then(function () {
          flash(btn.querySelector('span[aria-live]'), 'Copied');
        });
      });
    });
    document.querySelectorAll('[data-track="copy_command"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var pre = btn.closest('figure') && btn.closest('figure').querySelector('pre code');
        if (!pre) return;
        copyText(pre.textContent).then(function () {
          flash(btn.querySelector('span[aria-live]'), 'Copied');
        });
      });
    });
  }

  /* ---------------- reveal / draw motion ---------------- */
  function initMotion() {
    var targets = document.querySelectorAll('[data-reveal], [data-draw-rule], [data-draw-tick], [data-draw-eyebrow]');
    if (!targets.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
      var items = group.querySelectorAll('[data-reveal]');
      for (var i = 0; i < items.length; i++) items[i].style.transitionDelay = (i * 70) + 'ms';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ---------------- platform-specific download ---------------- */
  var LAUNCHER_BASE = 'https://github.com/storytold/craft-launcher/releases/download/v0.3.2/';
  var LAUNCHERS = {
    windows: {
      file: 'artcraft-launcher-0.3.2-windows-x64.msi',
      caption: 'For Windows \u00b7 Installer (64-bit)',
      card: 'Windows'
    },
    macos: {
      file: 'artcraft-launcher-0.3.2-macos-universal.dmg',
      caption: 'For macOS \u00b7 Disk image (Universal)',
      card: 'macOS'
    },
    linux: {
      file: 'artcraft-launcher-0.3.2-linux-x86_64.AppImage',
      caption: 'For Linux \u00b7 AppImage (x86_64)',
      card: 'Linux'
    }
  };
  function detectOS() {
    var hint = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    var ua = navigator.userAgent || '';
    if (/Win/i.test(hint)) return 'windows';
    if (/Mac/i.test(hint)) return 'macos';
    if (/Linux|X11|CrOS/i.test(hint) || /Linux/i.test(ua)) return 'linux';
    return 'windows';
  }
  function initPlatform() {
    var os = detectOS();
    var info = LAUNCHERS[os];
    var url = LAUNCHER_BASE + info.file;
    document.querySelectorAll('[data-os-caption]').forEach(function (el) {
      el.textContent = info.caption;
      el.setAttribute('aria-hidden', 'false');
    });
    document.querySelectorAll('a').forEach(function (a) {
      if (a.textContent.trim() === 'Download Launcher' && a.hasAttribute('data-cta')) a.href = url;
    });
    document.querySelectorAll('#get-it article').forEach(function (card) {
      var h = card.querySelector('h3');
      var head = card.querySelector('div p.hud-label');
      if (!h || !head || head.textContent.trim() !== 'Platform') return;
      if (h.textContent.trim() === info.card) {
        head.innerHTML = '<span class="text-(--app-ink,var(--accent-ink))">Your system</span>';
        // the original also inverts the standalone button of the detected OS
        var btn = card.querySelector('a[data-cta][class*="invert-block"]');
        if (btn) {
          ['invert-block', 'border', 'border-line-strong', 'bg-bg', 'text-ink',
           'hover:border-transparent', 'transition-colors'].forEach(function (c) {
            btn.classList.remove(c);
          });
          ['bg-invert-bg', 'text-invert-fg', 'transition-opacity', 'hover:opacity-80']
            .forEach(function (c) { btn.classList.add(c); });
        }
      }
    });
  }

  /* ---------------- right-side ruler ---------------- */
  var RAIL = 60;
  function initRuler() {
    var root = document.documentElement;
    var rail = document.createElement('div');
    rail.id = 'ruler';
    rail.setAttribute('aria-hidden', 'true');
    var digits = '';
    for (var d = 0; d < 3; d++) {
      digits += '<span class="ruler-digit-col" style="transform:translateY(0em)">' +
        '<span>0</span><span>1</span><span>2</span><span>3</span><span>4</span>' +
        '<span>5</span><span>6</span><span>7</span><span>8</span><span>9</span></span>';
    }
    rail.innerHTML =
      '<div id="ruler-track">' +
        '<div id="ruler-band"></div>' +
        '<div id="ruler-cursor">' +
          '<span class="ruler-cursor-line"></span>' +
          '<span class="ruler-cursor-pct"><span class="ruler-digits">' + digits + '</span>' +
          '<span style="margin-left:2px">%</span></span>' +
        '</div>' +
      '</div>';
    document.body.appendChild(rail);
    var track = rail.querySelector('#ruler-track');
    var cursor = rail.querySelector('#ruler-cursor');
    var cols = rail.querySelectorAll('.ruler-digit-col');
    var labels = [];
    var top = 60; // the rail starts 60px below the top, like the original

    function enabled() { return innerWidth >= 1280; }
    function applyAttr() {
      if (enabled()) {
        root.setAttribute('data-ruler', 'on');
        root.setAttribute('data-ruler-side', 'right');
        root.style.setProperty('--ruler-rail', RAIL + 'px');
      } else {
        root.removeAttribute('data-ruler');
        root.removeAttribute('data-ruler-side');
        root.style.removeProperty('--ruler-rail');
      }
    }
    function contentHeight() {
      return Math.max(
        document.body.scrollHeight, document.body.offsetHeight,
        document.documentElement.scrollHeight, document.documentElement.offsetHeight
      );
    }
    function layout() {
      // measure content height, not the viewport (matches the original scale)
      var docH = contentHeight();
      rail.style.display = enabled() ? 'block' : 'none';
      if (!enabled()) return;
      track.style.height = (top + docH + top) + 'px';
      labels.forEach(function (n) { n.remove(); });
      labels = [];
      track.querySelectorAll('.ruler-tick').forEach(function (n) { n.remove(); });
      for (var i = 0; i <= 100; i++) {
        var y = top + (i / 100 * docH) + 'px';
        var tick = document.createElement('span');
        tick.className = 'ruler-tick' + (i % 5 === 0 ? ' ruler-tick-major' : '');
        tick.style.top = y;
        track.appendChild(tick);
        if (i % 5 === 0) {
          var lab = document.createElement('span');
          lab.className = 'ruler-tick-label';
          lab.style.top = y;
          lab.textContent = String(i);
          track.appendChild(lab);
          labels.push(lab);
        }
      }
      update();
    }
    function update() {
      if (!enabled()) return;
      var y = window.scrollY || window.pageYOffset || 0;
      track.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
      cursor.style.top = (top + y) + 'px';
      // the read-out fades in once you start scrolling, as on the original
      rail.classList.toggle('is-scrolling', y > 4);
      var max = document.documentElement.scrollHeight - innerHeight;
      var pct = max > 0 ? Math.round(Math.min(1, Math.max(0, y / max)) * 100) : 0;
      var s = ('00' + pct).slice(-3);
      for (var i = 0; i < cols.length; i++) {
        cols[i].style.transform = 'translateY(-' + Number(s.charAt(i)) + 'em)';
      }
    }
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; update(); });
    }
    applyAttr();
    layout();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', function () { applyAttr(); layout(); });
    addEventListener('load', layout);
    // lazy images change the content height after the first layout pass,
    // so re-measure whenever the body box changes size
    var lastH = 0;
    var relayout = debounce(function () {
      var h = contentHeight();
      if (Math.abs(h - lastH) < 2) return;
      lastH = h;
      layout();
    }, 100);
    lastH = contentHeight();
    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(relayout);
      ro.observe(document.body);
      ro.observe(document.documentElement);
    }
    document.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', relayout, { once: true });
    });
  }

  initTheme();
  initMobileNav();
  initResources();
  initCopy();
  initPlatform();
  initRuler();
  initMotion();
})();
