/*
 * trace-capture.js — record a REAL lab trace from a REAL portal, to score the position model on.
 *
 * WHY THIS EXISTS. Every test of Rocky's position model so far has run on screens I wrote. A
 * model tuned against invented control lists is tuned against my assumptions about Purview, not
 * against Purview. The one thing that would settle whether the belief model works is a recording
 * of what the portal ACTUALLY puts on screen, page by page, while a learner actually does the
 * lab — including the clicks, the wrong turns and the wandering.
 *
 * HOW TO USE IT. Open the portal tab of a running lab, open DevTools (F12) → Console, paste this
 * whole file, press Enter. Then do the lab normally. It records a frame whenever the page
 * settles after a change, and records every click. When you have finished:
 *
 *     copy(__rockyTrace.dump())          // puts the JSON on your clipboard
 *     __rockyTrace.save()                // or downloads it as a .json file
 *
 * It survives SPA navigation by itself, and full page reloads by keeping the trace in
 * sessionStorage. __rockyTrace.status() says how much it has. __rockyTrace.stop() ends it.
 *
 * WHAT IT RECORDS, AND WHY EACH FIELD.
 *
 *   name, role, id, geometry, disabled   exactly what perception.js already gives the world
 *                                        model, harvested the same way, so a replay is faithful
 *                                        and not a flattering reconstruction
 *
 *   scope       nav | menu | dialog | tab | main — which STRUCTURAL region the control sits in.
 *               capture.js already computes this and the live path throws it away, so the model
 *               currently spends three page transitions learning statistically that "Solutions"
 *               is navigation, when the DOM says so on the first frame. Recording it lets us
 *               MEASURE how much that is worth rather than argue about it.
 *
 *   current     aria-current — the portal's own statement of which nav item is the active one.
 *   selected    aria-selected — the same for tabs.
 *               If Microsoft portals set these reliably, they are near-decisive position
 *               evidence and Rocky is ignoring them. If they do not, we need to know that too,
 *               and this is how we find out instead of assuming.
 *
 *   expanded    aria-expanded — whether a menu is open, which is what "hop 1 of this step is
 *               done" actually looks like on screen.
 *
 *   href        the route a link goes to. A nav item whose href matches the current path is the
 *               active one even when aria-current is missing.
 *
 *   clicks      what the learner actually pressed, with a timestamp. Ground truth for the
 *               transition model: this is the only direct evidence of an ACTION rather than a
 *               state.
 *
 * NOTHING IS SENT ANYWHERE. It stays in the page until you copy or download it. It does not
 * read form values, and it truncates every string, so a trace is safe to paste into a repo —
 * but read one before you commit it, because accessible names on a real tenant can contain the
 * lab user's display name or e-mail.
 */
(function () {
  'use strict';
  if (window.__rockyTrace) { console.log('[trace] already running —', window.__rockyTrace.status()); return; }

  var KEY = '__rockyTrace_v1';
  var MAX_CONTROLS = 400;
  var SETTLE_MS = 700;          // how long the page must be quiet before a frame is worth taking
  var MIN_GAP_MS = 400;         // never two frames closer than this

  // ---- the same harvest perception.js does, so the replay is faithful --------------------
  var SEL = 'a[href],button,input,select,textarea,summary,[role="button"],[role="link"],' +
            '[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="radio"],' +
            '[role="combobox"],[role="textbox"],[role="searchbox"],[role="switch"],[tabindex]';

  function txt(el) {
    try { return (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(); }
    catch (e) { return ''; }
  }
  function accessibleName(el) {
    var a = el.getAttribute && el.getAttribute('aria-label');
    if (a && a.trim()) return a.trim().slice(0, 100);
    var lb = el.getAttribute && el.getAttribute('aria-labelledby');
    if (lb) {
      var parts = lb.split(/\s+/).map(function (id) {
        var n = document.getElementById(id); return n ? txt(n) : '';
      }).filter(Boolean);
      if (parts.length) return parts.join(' ').slice(0, 100);
    }
    var t = txt(el);
    if (t) return t.slice(0, 100);
    var v = el.value || el.title || el.placeholder || (el.getAttribute && el.getAttribute('alt'));
    return (v || '').toString().trim().slice(0, 100);
  }
  function roleOf(el) {
    var r = el.getAttribute && el.getAttribute('role');
    if (r) return r;
    switch (el.tagName) {
      case 'A': return el.getAttribute('href') ? 'link' : 'generic';
      case 'BUTTON': case 'SUMMARY': return 'button';
      case 'TEXTAREA': return 'textbox';
      case 'SELECT': return 'combobox';
      case 'INPUT':
        var t2 = (el.getAttribute('type') || 'text').toLowerCase();
        return t2 === 'search' ? 'searchbox' : (t2 === 'checkbox' ? 'checkbox' : (t2 === 'radio' ? 'radio' : 'textbox'));
      default: return 'generic';
    }
  }

  // ---- the signals the live path currently discards ---------------------------------------
  function scopeOf(el) {
    if (!el.closest) return 'main';
    if (el.closest('[role="dialog"],[role="alertdialog"],dialog')) return 'dialog';
    if (el.closest('[role="menu"],[role="listbox"],[role="menubar"]')) return 'menu';
    if (el.closest('[role="tablist"]')) return 'tab';
    if (el.closest('nav,[role="navigation"]')) return 'nav';
    if (el.closest('[role="banner"],header')) return 'banner';
    if (el.closest('[role="complementary"],aside')) return 'aside';
    return 'main';
  }
  function landmarkLabel(el) {
    // Which navigation, specifically. Portals have several: a global one, a solution one, a
    // breadcrumb. "Solutions" in the global nav and "Policies" in the solution nav are very
    // different evidence, and they are indistinguishable without this.
    try {
      var lm = el.closest('nav,[role="navigation"],[role="tablist"],[role="dialog"],[role="menu"]');
      if (!lm) return '';
      return (lm.getAttribute('aria-label') || lm.getAttribute('title') || '').slice(0, 60);
    } catch (e) { return ''; }
  }
  function hrefOf(el) {
    var h = el.getAttribute && el.getAttribute('href');
    if (!h) return '';
    try { return new URL(h, location.href).pathname.slice(0, 120); } catch (e) { return String(h).slice(0, 120); }
  }

  function harvest(root, out, depth) {
    if (depth > 6) return;
    var nodes;
    try { nodes = root.querySelectorAll(SEL); } catch (e) { return; }
    for (var i = 0; i < nodes.length && out.length < MAX_CONTROLS; i++) {
      var el = nodes[i];
      if (el.closest && el.closest('#labpilot-overlay-root')) continue;   // never record Rocky
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (r.width < 2 || r.height < 2) continue;
      if (r.bottom < 0 || r.top > window.innerHeight) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      var g = function (n) { return el.getAttribute ? (el.getAttribute(n) || '') : ''; };
      out.push({
        name: accessibleName(el),
        role: roleOf(el),
        id: el.id || g('data-testid') || g('name') || '',
        x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
        w: Math.round(r.width), h: Math.round(r.height),
        disabled: el.disabled === true || g('aria-disabled') === 'true',
        // the discarded signals
        scope: scopeOf(el),
        landmark: landmarkLabel(el),
        current: g('aria-current'),
        selected: g('aria-selected'),
        expanded: g('aria-expanded'),
        href: hrefOf(el),
      });
    }
    var all;
    try { all = root.querySelectorAll('*'); } catch (e) { return; }
    for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) harvest(all[j].shadowRoot, out, depth + 1);
  }

  // ---- the trace ---------------------------------------------------------------------------
  var T;
  try { T = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { T = null; }
  if (!T || !T.frames) {
    T = {
      name: 'untitled — rename me',
      provenance: 'captured',
      capturedAt: new Date().toISOString(),
      portal: location.host,
      note: 'Set truth on each frame: the 0-based step index the learner was really on, or "off".',
      frames: [],
    };
  }
  var started = Date.now();
  var lastFrame = 0;
  var settleTimer = 0;
  var stopped = false;

  function persist() {
    try { sessionStorage.setItem(KEY, JSON.stringify(T)); } catch (e) { /* quota: keep in memory */ }
  }

  function frame(why) {
    if (stopped) return;
    var now = Date.now();
    if (now - lastFrame < MIN_GAP_MS) return;
    var controls = [];
    var t0 = performance.now();
    harvest(document, controls, 0);
    var f = {
      t: now - started,
      why: why,
      url: location.href,
      title: document.title,
      controls: controls,
      harvestMs: Math.round((performance.now() - t0) * 10) / 10,
      truth: null,                 // FILL THIS IN — see note above
    };
    // Identical consecutive screens are not new evidence, and recording thirty of them would
    // teach a replay that staring at a page is thirty confirmations. Keep one, and count it.
    var prev = T.frames[T.frames.length - 1];
    var sig = f.url + '|' + controls.map(function (c) { return c.name; }).join('\u0001');
    if (prev && prev._sig === sig) { prev.repeats = (prev.repeats || 1) + 1; persist(); return; }
    f._sig = sig;
    f.repeats = 1;
    T.frames.push(f);
    lastFrame = now;
    persist();
    console.log('[trace] frame ' + T.frames.length + ' (' + why + ') — ' + controls.length + ' controls, ' +
                f.harvestMs + 'ms — ' + location.pathname);
  }

  function settle(why) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(function () { frame(why); }, SETTLE_MS);
  }

  // clicks: the only direct evidence of an ACTION rather than a state
  function onClick(e) {
    if (stopped) return;
    var el = e.target;
    try { if (el.closest && el.closest('#labpilot-overlay-root')) return; } catch (x) { return; }
    var hit = null;
    try { hit = el.closest(SEL) || el; } catch (x) { hit = el; }
    var c = {
      t: Date.now() - started,
      name: hit ? accessibleName(hit) : '',
      role: hit ? roleOf(hit) : '',
      scope: hit ? scopeOf(hit) : '',
      afterFrame: T.frames.length,
    };
    T.clicks = T.clicks || [];
    T.clicks.push(c);
    persist();
    console.log('[trace] click: "' + c.name + '" (' + c.scope + ')');
    settle('after-click');
  }

  var mo = new MutationObserver(function () { settle('dom-change'); });
  try { mo.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) { /* ignore */ }
  document.addEventListener('click', onClick, true);

  // SPA route changes do not fire a load event
  var lastUrl = location.href;
  var urlTimer = setInterval(function () {
    if (stopped) return;
    if (location.href !== lastUrl) { lastUrl = location.href; settle('url-change'); }
  }, 300);
  window.addEventListener('popstate', function () { settle('popstate'); });

  frame('start');

  window.__rockyTrace = {
    status: function () {
      return T.frames.length + ' frame(s), ' + ((T.clicks || []).length) + ' click(s), ' +
             (stopped ? 'STOPPED' : 'recording') + '. Pages: ' +
             Array.from(new Set(T.frames.map(function (f) { return f.url.replace(/^https?:\/\/[^/]+/, ''); }))).join(', ');
    },
    mark: function (truth) {
      // Label the most recent frame with the step the learner is really on. Call it as you go:
      // __rockyTrace.mark(0) while doing step 1, __rockyTrace.mark('off') while wandering.
      var f = T.frames[T.frames.length - 1];
      if (f) { f.truth = truth; persist(); console.log('[trace] frame ' + T.frames.length + ' truth = ' + truth); }
      return this.status();
    },
    markAll: function (truth) {
      // Label every so-far-unlabelled frame. Useful if you do a whole step then remember.
      var n = 0;
      T.frames.forEach(function (f) { if (f.truth == null) { f.truth = truth; n++; } });
      persist(); console.log('[trace] labelled ' + n + ' frame(s) as ' + truth);
      return this.status();
    },
    name: function (s) { T.name = String(s); persist(); return T.name; },
    frame: function () { lastFrame = 0; frame('manual'); return this.status(); },
    stop: function () {
      stopped = true; clearInterval(urlTimer); clearTimeout(settleTimer);
      try { mo.disconnect(); } catch (e) {}
      document.removeEventListener('click', onClick, true);
      console.log('[trace] stopped. ' + this.status());
      return this.status();
    },
    dump: function () {
      var out = JSON.parse(JSON.stringify(T));
      out.frames.forEach(function (f) { delete f._sig; });
      return JSON.stringify(out, null, 1);
    },
    save: function () {
      var blob = new Blob([this.dump()], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rocky-trace-' + (T.name || 'lab').replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      return 'downloading ' + a.download;
    },
    reset: function () { T.frames = []; T.clicks = []; persist(); return 'cleared'; },
    _trace: function () { return T; },
  };

  console.log('%c[trace] recording. Do the lab normally.', 'font-weight:bold');
  console.log('  __rockyTrace.mark(0)     label the current frame as step 1 (0-based), or "off"');
  console.log('  __rockyTrace.status()    how much is recorded');
  console.log('  __rockyTrace.save()      download the trace  (or copy(__rockyTrace.dump()))');
})();
