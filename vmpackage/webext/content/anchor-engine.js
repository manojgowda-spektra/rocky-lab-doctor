/*
 * LabPilot anchor engine (PLAN-V2 §A / V2-2), upgraded from the live Foundry capture
 * run (bus MSG 29-32). Resolves a target's multi-attribute selector bundle to a SINGLE
 * live DOM element, or an honest non-resolution. Accuracy contract: guidance renders
 * ONLY on a resolved element; ambiguity/absence ⇒ non-resolved ⇒ caller shows
 * "checking…", never a guess.
 *
 * Attributes (schema 1.1 + live-run additions): id, dataAttrs, ariaLabel, role, text,
 * placeholder, href, hrefSuffix, fieldLabel, domPath, scope, inLandmark, urlPattern.
 * `inLandmark` (live capture t01-s03: "Create project" appears in HEADER *and* hero) is a
 * finer-grained ancestor-landmark filter than `scope`: when a text+role match is not unique
 * page-wide, restricting to the captured landmark (HEADER/MAIN/NAV/...) picks the intended
 * instance uniquely; if that landmark instance is absent, resolution is honestly absent
 * (we never fall back to the ambiguous full set -- that would risk a wrong glow).
 * Live-run lessons baked in:
 *   - Fluent/React ids embed session-unstable fragments (`field-_r_1t___control`,
 *     `:r3:`) → such ids are BLACKLISTED (never collected/scored/emitted).
 *   - Foundry dialog/nav/menu controls have no stable id → `scope` narrows the
 *     candidate set to the active dialog/nav/menu/main so role+text resolves uniquely.
 *   - Deprecated model Deploy buttons are DISABLED → resolved-but-disabled is reported
 *     so the caller shows a notice/substitution card, never a click-me glow.
 */
window.LabPilotAnchor = (function () {
  "use strict";

  var W = {
    id: 1.0, dataAttr: 0.9, fieldLabel: 0.85, ariaLabel: 0.7, placeholder: 0.7,
    hrefSuffix: 0.7, text: 0.6, href: 0.5, domPath: 0.4, role: 0.2, imgAlt: 0.85, childText: 0.85
  };
  var MIN_SCORE = 0.7;   // a resolved match must reach this
  var MARGIN = 0.2;      // and beat the runner-up by this (else ambiguous)
  var MAX_SCAN = 4000;

  // Session-unstable id fragments (Fluent UI `_r_1t_`, React useId `:r3:`) — reject
  // ids CONTAINING them, not just whole-string (live finding, MSG 29).
  var UNSTABLE_ID = /(_r_[a-z0-9]+_)|(:r[a-z0-9]+:)/i;
  function isUnstableId(id) { return !id || UNSTABLE_ID.test(id); }

  function norm(s) { return (s == null ? "" : String(s)).replace(/\s+/g, " ").trim().toLowerCase(); }

  function isVisible(el) {
    if (!el || el.nodeType !== 1 || !el.isConnected) return false;
    var win = el.ownerDocument.defaultView || window;
    var st = win.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  }

  function isDisabled(el) {
    if (!el) return false;
    if (el.disabled === true) return true;
    var ad = el.getAttribute && el.getAttribute("aria-disabled");
    return ad === "true" || ad === "";
  }

  function isField(el) {
    var t = el.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
    var role = el.getAttribute && el.getAttribute("role");
    return role === "textbox" || role === "combobox" || role === "searchbox" ||
      (el.getAttribute && el.getAttribute("contenteditable") === "true");
  }

  function visibleText(el) {
    var al = el.getAttribute && el.getAttribute("aria-label");
    if (al) return norm(al);
    if (el.value && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return norm(el.value);
    var t = norm(el.innerText || el.textContent || "");
    if (!t) { var ph = el.getAttribute && el.getAttribute("placeholder"); if (ph) return norm(ph); }
    return t;
  }

  // The accessible field label of a form control (aria-label / label[for] / wrapping
  // label / aria-labelledby) — used by fieldLabel resolution (live run: Foundry inputs).
  function fieldLabelText(el) {
    var doc = el.ownerDocument || document;
    var al = el.getAttribute && el.getAttribute("aria-label");
    if (al) return norm(al);
    if (el.id) {
      var lb = doc.querySelector('label[for="' + (window.CSS ? CSS.escape(el.id) : el.id) + '"]');
      if (lb) return norm(lb.textContent);
    }
    var wrap = el.closest && el.closest("label");
    if (wrap) return norm(wrap.textContent);
    var lbby = el.getAttribute && el.getAttribute("aria-labelledby");
    if (lbby) {
      var txt = lbby.split(/\s+/).map(function (id) { var n = doc.getElementById(id); return n ? n.textContent : ""; }).join(" ");
      return norm(txt);
    }
    return "";
  }

  // Narrow the candidate search to a UI region. Returns null when a required scope
  // (e.g. an active dialog) isn't present ⇒ resolution is honestly absent.
  function scopeRoot(scope, doc) {
    doc = doc || document;
    if (!scope || scope === "page") return doc;
    var map = {
      dialog: '[role="dialog"],[role="alertdialog"],dialog',
      nav: 'nav,[role="navigation"]',
      menu: '[role="menu"],[role="listbox"]',
      main: 'main,[role="main"]',
      section: 'section,[role="region"]'
    };
    var sel = map[scope];
    if (!sel) return doc;
    var nodes = Array.prototype.slice.call(doc.querySelectorAll(sel)).filter(isVisible);
    if (nodes.length === 0) return (scope === "section" || scope === "main") ? doc : null; // dialog/nav/menu must exist
    return nodes[nodes.length - 1]; // topmost/last = the active one
  }

  // Ancestor-landmark selectors for `inLandmark`. Keyed by the captured landmark name
  // (case-insensitive), each mapping to element + ARIA-role forms of that landmark.
  var LANDMARK_SEL = {
    header: 'header,[role="banner"]', banner: 'header,[role="banner"]',
    main: 'main,[role="main"]',
    nav: 'nav,[role="navigation"]', navigation: 'nav,[role="navigation"]',
    footer: 'footer,[role="contentinfo"]', contentinfo: 'footer,[role="contentinfo"]',
    aside: 'aside,[role="complementary"]', complementary: 'aside,[role="complementary"]',
    region: 'section,[role="region"]', section: 'section,[role="region"]',
    form: 'form,[role="form"]'
  };
  function landmarkSelFor(name) {
    if (!name) return null;
    return LANDMARK_SEL[String(name).trim().toLowerCase()] || null;
  }
  // True iff el sits inside (or is) an instance of the named landmark.
  function inLandmarkMatch(el, name) {
    var sel = landmarkSelFor(name);
    if (!sel) return true;          // unknown landmark name => do not filter (fail honest, never over-restrict)
    if (!el || !el.closest) return false;
    if (el.matches && el.matches(sel)) return true;
    return !!el.closest(sel);
  }

  function dataSelector(dataAttrs) {
    var parts = [];
    for (var k in dataAttrs) {
      if (!Object.prototype.hasOwnProperty.call(dataAttrs, k)) continue;
      var name = k.indexOf("data-") === 0 ? k : "data-" + k;
      parts.push("[" + CSS.escape(name) + '="' + String(dataAttrs[k]).replace(/"/g, '\\"') + '"]');
    }
    return parts.join("");
  }

  function qsa(root, sel) {
    try { return Array.prototype.slice.call(root.querySelectorAll(sel)); } catch (e) { return []; }
  }

  function collectCandidates(attrs, root) {
    var out = new Set();
    try {
      if (attrs.id && !isUnstableId(attrs.id)) {
        qsa(root, '[id="' + CSS.escape(attrs.id) + '"]').forEach(function (e) { out.add(e); });
      }
      if (attrs.dataAttrs && Object.keys(attrs.dataAttrs).length) {
        var dsel = dataSelector(attrs.dataAttrs);
        if (dsel) qsa(root, dsel).forEach(function (e) { out.add(e); });
      }
      if (attrs.fieldLabel) {
        var want = norm(attrs.fieldLabel);
        qsa(root, "input,textarea,select,[role=textbox],[role=combobox],[role=searchbox],[contenteditable]")
          .forEach(function (e) { if (fieldLabelText(e).indexOf(want) >= 0) out.add(e); });
      }
      if (attrs.ariaLabel) {
        qsa(root, "[aria-label]").forEach(function (e) { if (norm(e.getAttribute("aria-label")) === norm(attrs.ariaLabel)) out.add(e); });
      }
      if (attrs.childText) {
        // Fluent "label + description" / "title + subtitle" controls (menu items,
        // cards): the exact identity is a DESCENDANT's own text; the clickable
        // ancestor's text is a superstring (label+desc) so plain text ties.
        var wantChild = norm(attrs.childText);
        qsa(root, 'button,a,[role="button"],[role="link"],[role="menuitem"],[role="option"],[role="tab"],[role="treeitem"],[tabindex]').forEach(function (e) {
          var kids = e.querySelectorAll ? e.querySelectorAll("*") : [];
          for (var ki = 0; ki < kids.length; ki++) { if (norm(kids[ki].textContent) === wantChild) { out.add(e); break; } }
        });
      }
      if (attrs.imgAlt) {
        // Fluent "card" controls (e.g. model catalog) are buttons whose exact
        // identity lives in a child <img alt="..."> (the visible button text
        // includes the subtitle, so text alone ties gpt-5 with gpt-5-nano/etc).
        var wantAlt = norm(attrs.imgAlt);
        qsa(root, 'button,a,[role="button"],[role="link"],[role="option"],[tabindex]').forEach(function (e) {
          var im = e.querySelector && e.querySelector("img[alt]");
          if (im && norm(im.getAttribute("alt")) === wantAlt) out.add(e);
        });
      }
      if (attrs.placeholder) {
        var wp = norm(attrs.placeholder);
        qsa(root, "[placeholder]").forEach(function (e) { if (norm(e.getAttribute("placeholder")).indexOf(wp) >= 0) out.add(e); });
      }
      if (attrs.hrefSuffix) {
        qsa(root, "a[href]").forEach(function (e) { if ((e.getAttribute("href") || "").replace(/[?#].*$/, "").indexOf(attrs.hrefSuffix, 0) >= 0 && endsWithPath(e.getAttribute("href"), attrs.hrefSuffix)) out.add(e); });
      }
      if (attrs.href) {
        qsa(root, "a[href]").forEach(function (e) { var h = e.getAttribute("href") || ""; if (h === attrs.href || h.indexOf(attrs.href) >= 0) out.add(e); });
      }
      if (attrs.domPath) {
        try { var byPath = root.querySelector(attrs.domPath); if (byPath) out.add(byPath); } catch (e) { /* bad selector */ }
      }
      if (attrs.text && out.size < 60) {
        var sel = 'a,button,input,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],' +
          '[role="option"],[role="checkbox"],[role="searchbox"],[role="treeitem"],[tabindex],label,li';
        var wanted = norm(attrs.text), scanned = 0, nodes = qsa(root, sel);
        for (var i = 0; i < nodes.length && scanned < MAX_SCAN; i++, scanned++) {
          var vt = visibleText(nodes[i]);
          if (vt && (vt === wanted || vt.indexOf(wanted) >= 0 || wanted.indexOf(vt) >= 0)) out.add(nodes[i]);
        }
      }
      if (out.size === 0 && attrs.role) {
        qsa(root, '[role="' + CSS.escape(attrs.role) + '"]').forEach(function (e) { out.add(e); });
      }
    } catch (e) { /* never throw out of resolution */ }
    return Array.from(out);
  }

  function endsWithPath(href, suffix) {
    if (!href) return false;
    var path = href.replace(/[?#].*$/, "");
    return path === suffix || path.slice(-suffix.length) === suffix;
  }

  function implicitRole(el) {
    var explicit = el.getAttribute && el.getAttribute("role");
    if (explicit) return explicit;
    switch (el.tagName) {
      case "A": return el.getAttribute("href") ? "link" : null;
      case "BUTTON": return "button";
      case "INPUT":
        var t = (el.getAttribute("type") || "text").toLowerCase();
        return t === "search" ? "searchbox" : (t === "checkbox" ? "checkbox" : "textbox");
      case "TEXTAREA": return "textbox";
      default: return null;
    }
  }

  function scoreEl(el, attrs) {
    var s = 0;
    if (attrs.id && !isUnstableId(attrs.id) && el.id === attrs.id) s += W.id;
    if (attrs.dataAttrs) {
      var keys = Object.keys(attrs.dataAttrs), hit = 0;
      keys.forEach(function (k) {
        var name = k.indexOf("data-") === 0 ? k : "data-" + k;
        if (el.getAttribute && el.getAttribute(name) === String(attrs.dataAttrs[k])) hit++;
      });
      if (keys.length) s += W.dataAttr * (hit / keys.length);
    }
    if (attrs.fieldLabel && fieldLabelText(el).indexOf(norm(attrs.fieldLabel)) >= 0) s += W.fieldLabel;
    if (attrs.ariaLabel && el.getAttribute && norm(el.getAttribute("aria-label")) === norm(attrs.ariaLabel)) s += W.ariaLabel;
    if (attrs.childText) {
      var _wc = norm(attrs.childText), _kids = el.querySelectorAll ? el.querySelectorAll("*") : [];
      for (var _ci = 0; _ci < _kids.length; _ci++) { if (norm(_kids[_ci].textContent) === _wc) { s += W.childText; break; } }
    }
    if (attrs.imgAlt) {
      var _im = el.querySelector && el.querySelector("img[alt]");
      if (_im && norm(_im.getAttribute("alt")) === norm(attrs.imgAlt)) s += W.imgAlt;
    }
    if (attrs.placeholder && el.getAttribute && norm(el.getAttribute("placeholder")).indexOf(norm(attrs.placeholder)) >= 0) s += W.placeholder;
    if (attrs.hrefSuffix && endsWithPath(el.getAttribute && el.getAttribute("href"), attrs.hrefSuffix)) s += W.hrefSuffix;
    if (attrs.role && implicitRole(el) === attrs.role) s += W.role;
    if (attrs.text) {
      var vt = visibleText(el), wanted = norm(attrs.text);
      if (vt === wanted) s += W.text;
      else {
        var _exactKid = false, _tk = el.querySelectorAll ? el.querySelectorAll("*") : [];
        for (var _ti = 0; _ti < _tk.length; _ti++) { if (norm(_tk[_ti].textContent) === wanted) { _exactKid = true; break; } }
        if (_exactKid) s += W.text;                                   // Fluent label-in-child == exact
        else if (vt && (vt.indexOf(wanted) >= 0 || wanted.indexOf(vt) >= 0)) s += W.text * 0.6;
      }
    }
    if (attrs.href && el.getAttribute) {
      var h = el.getAttribute("href") || "";
      if (h === attrs.href) s += W.href; else if (h && h.indexOf(attrs.href) >= 0) s += W.href * 0.6;
    }
    if (attrs.domPath) { try { if (el.matches && el.matches(attrs.domPath)) s += W.domPath; } catch (e) { } }
    if (!isVisible(el)) s *= 0.3;
    return s;
  }

  function resolve(attrs, rootOverride) {
    if (!attrs) return { status: "absent", reason: "no-attrs" };
    if (attrs.urlPattern && location.href.indexOf(attrs.urlPattern) < 0) return { status: "absent", reason: "url-mismatch" };
    var root = rootOverride || scopeRoot(attrs.scope, document);
    if (!root) return { status: "absent", reason: "scope-absent" };
    var cands = collectCandidates(attrs, root).filter(function (e) { return e && e.isConnected; });
    if (cands.length === 0) return { status: "absent", reason: "no-candidates" };
    // inLandmark: narrow to the captured landmark instance. Only applies when the
    // attribute is set (inert for every selector that omits it) and only ever REDUCES
    // the candidate set. If the named landmark instance holds none of the candidates,
    // the intended element is absent here => honest absent (no ambiguous fall-back).
    if (attrs.inLandmark && landmarkSelFor(attrs.inLandmark)) {
      var narrowed = cands.filter(function (e) { return inLandmarkMatch(e, attrs.inLandmark); });
      if (narrowed.length === 0) return { status: "absent", reason: "landmark-absent" };
      cands = narrowed;
    }
    var scored = cands.map(function (el) { return { el: el, score: scoreEl(el, attrs) }; })
      .filter(function (c) { return c.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
    // Ancestor-suppression: a passive wrapper (e.g. a <label> or <li> that merely
    // CONTAINS the real control) must never tie with or out-rank the actionable
    // element inside it — the innermost actionable candidate wins. Drop any candidate
    // that is an ANCESTOR of an equal-or-higher-scoring candidate. Sorted desc, so any
    // j < i already scores >= this one; a higher-scoring ancestor (e.g. an imgAlt/childText
    // CARD whose inner <span>/<img> is never itself collected) keeps its descendant later
    // in the list => never dropped. This only ever REDUCES the candidate set.
    scored = scored.filter(function (c, i) {
      for (var j = 0; j < i; j++) {
        if (scored[j].el !== c.el && c.el.contains && c.el.contains(scored[j].el)) return false;
      }
      return true;
    });
    if (scored.length === 0) return { status: "absent", reason: "zero-score" };
    var best = scored[0];
    if (best.score < MIN_SCORE) return { status: "absent", reason: "below-min", score: best.score };
    if (scored.length > 1 && best.score - scored[1].score < MARGIN) return { status: "ambiguous", count: scored.length, score: best.score };
    return { status: "resolved", element: best.el, score: best.score, disabled: isDisabled(best.el) };
  }

  function resolveTarget(selectors, root) {
    if (!selectors || !selectors.length) return { status: "absent", reason: "no-selectors" };
    var ambiguous = false;
    for (var i = 0; i < selectors.length; i++) {
      var attrs = selectors[i] && (selectors[i].attrs || selectors[i]);
      var r = resolve(attrs, root);
      if (r.status === "resolved") return r;
      if (r.status === "ambiguous") ambiguous = true;
    }
    return { status: ambiguous ? "ambiguous" : "absent", reason: "no-selector-resolved" };
  }

  // ---- V2-4: menu-chain resolution + type-step / action semantics ------------
  // A "chain" is an ordered list of selector-bundles, e.g.
  //   [Deploy button, "Custom settings" menuitem].
  // Only the trigger resolves before the click; after the click the menu opens
  // and its item resolves. We glow the FURTHEST link that currently resolves
  // uniquely (deepest progress so far), and stay honestly absent if none do —
  // never guessing a later link into existence. Stateless: each call reflects
  // exactly what the live DOM currently supports.
  function linkResolve(link, root) {
    if (!link) return { status: "absent", reason: "no-link" };
    if (Array.isArray(link)) return resolveTarget(link, root);
    if (Array.isArray(link.selectors)) return resolveTarget(link.selectors, root);
    return resolve(link.attrs || link, root);
  }

  function resolveChain(links, root) {
    if (!links || !links.length) return { status: "absent", reason: "empty-chain" };
    var chosen = null, chosenIdx = -1, sawAmbiguous = false;
    for (var i = 0; i < links.length; i++) {
      var r = linkResolve(links[i], root);
      if (r.status === "resolved") { chosen = r; chosenIdx = i; }
      else if (r.status === "ambiguous") sawAmbiguous = true;
    }
    if (chosen) {
      chosen.chainIndex = chosenIdx;
      chosen.chainLength = links.length;
      chosen.chainComplete = (chosenIdx === links.length - 1);
      return chosen;
    }
    return { status: sawAmbiguous ? "ambiguous" : "absent", reason: "chain-unresolved" };
  }

  // A full step = primary target (+ optional `then` menu-chain) (+ optional
  // `value` to type). Returns the resolution plus an `action`:
  //   "type"   — a resolved field that expects `value` typed into it,
  //   "notice" — resolved but disabled/deprecated (non-actionable, no click glow),
  //   "click"  — the normal actionable glow.
  // `value` only applies at the FINAL link of a chain (never mid-chain).
  function resolveStep(step, root) {
    if (!step) return { status: "absent", reason: "no-step" };
    var links = [];
    if (Array.isArray(step.selectors)) links.push({ selectors: step.selectors });
    else if (step.attrs || step.role || step.id || step.text || step.ariaLabel ||
             step.fieldLabel || step.placeholder || step.hrefSuffix || step.href) {
      links.push(step.attrs ? { attrs: step.attrs } : step);
    }
    if (step.then) links = links.concat(Array.isArray(step.then) ? step.then : [step.then]);
    if (!links.length) return { status: "absent", reason: "no-target" };
    var r = links.length > 1 ? resolveChain(links, root) : linkResolve(links[0], root);
    if (r.status !== "resolved") return r;
    var atFinal = (r.chainComplete !== false); // single-link steps have no chainComplete
    var value = atFinal ? step.value : undefined;
    if (value != null && value !== "") { r.action = "type"; r.value = String(value); }
    else if (r.disabled) { r.action = "notice"; }
    else { r.action = "click"; }
    return r;
  }

  return {
    resolve: resolve, resolveTarget: resolveTarget, resolveChain: resolveChain,
    resolveStep: resolveStep, isVisible: isVisible,
    isDisabled: isDisabled, isUnstableId: isUnstableId, visibleText: visibleText,
    fieldLabelText: fieldLabelText, scopeRoot: scopeRoot,
    _weights: W, _config: { MIN_SCORE: MIN_SCORE, MARGIN: MARGIN }
  };
})();
