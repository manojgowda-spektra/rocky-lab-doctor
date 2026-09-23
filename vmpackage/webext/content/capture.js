/*
 * LabPilot capture (PLAN-V2 §A author/capture, V2-3 → CAPTURE-MODE robust describe).
 * Turns a clicked element into ONE minimal selector bundle {strategy:"dom", attrs:{...}}
 * that resolves UNIQUELY via LabPilotAnchor (MIN_SCORE 0.7). No hand-authoring: an
 * operator clicks each control once and describe() picks the strongest STABLE signals,
 * combining 2+ so the bundle clears MIN_SCORE and (self-verified) matches exactly one el.
 *
 * Signal priority (strongest stable first):
 *   1. stable id            (reject Fluent/React session ids anywhere) -> {id}
 *   2. field                placeholder and/or fieldLabel + role
 *   3. link                 hrefSuffix + text + role:"link"
 *   4. icon "card"          button/a containing <img alt> -> imgAlt + text + role
 *   5. label + description  clickable text is a superstring, a DESCENDANT is the short
 *                           exact label -> childText + role
 *   6. else                 text (concise visible/accessible label) + role
 * Always add urlPattern (last 1-2 stable path segments, never the volatile project-id
 * segment or query) and scope (dialog/menu/nav/main). Self-verify: if the engine is
 * present and the bundle is not a UNIQUE resolve, add domPath as a tiebreaker.
 */
window.LabPilotCapture = (function () {
  "use strict";
  var A = window.LabPilotAnchor;
  var UNSTABLE_ID = /(_r_[a-z0-9]+_)|(:r[a-z0-9]+:)|^fui-/i;

  function norm(s) { return (s == null ? "" : String(s)).replace(/\s+/g, " ").trim(); }
  function isStableId(id) { return !!id && !UNSTABLE_ID.test(id); }

  function implicitRole(el) {
    var explicit = el.getAttribute && el.getAttribute("role");
    if (explicit) return explicit;
    switch (el.tagName) {
      case "A": return el.getAttribute("href") ? "link" : null;
      case "BUTTON": return "button";
      case "SUMMARY": return "button";
      case "INPUT":
        var t = (el.getAttribute("type") || "text").toLowerCase();
        return t === "search" ? "searchbox" : (t === "checkbox" ? "checkbox" : "textbox");
      case "TEXTAREA": return "textbox";
      case "SELECT": return "combobox";
      default: return null;
    }
  }

  function scopeOf(el) {
    if (!el.closest) return "main";
    if (el.closest('[role="dialog"],[role="alertdialog"],dialog')) return "dialog";
    if (el.closest('[role="menu"],[role="listbox"]')) return "menu";
    if (el.closest('nav,[role="navigation"]')) return "nav";
    return "main"; // main/none both anchor via scopeRoot("main") -> <main> or whole doc
  }

  function hrefSuffixOf(el) {
    var h = el.getAttribute && el.getAttribute("href");
    if (!h) return null;
    try {
      var p = new URL(h, location.href).pathname.replace(/\/+$/, "");
      var seg = p.split("/").pop();
      return seg ? "/" + seg : (p || null);
    } catch (e) { return null; }
  }

  function isField(el) {
    var t = el.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return true;
    var r = el.getAttribute && el.getAttribute("role");
    return r === "textbox" || r === "combobox" || r === "searchbox";
  }

  function cardImgAlt(el) {
    // Icon "card": a clickable whose exact identity is a child <img alt="...">.
    var role = implicitRole(el);
    var clickable = el.tagName === "BUTTON" || el.tagName === "A" ||
      role === "button" || role === "link" || role === "option";
    if (!clickable) return null;
    var im = el.querySelector && el.querySelector("img[alt]");
    if (!im) return null;
    var alt = norm(im.getAttribute("alt"));
    return alt || null;
  }

  // A concise DESCENDANT label when the clickable's own text is a "title + subtitle"
  // superstring (Fluent menu items / cards). Returns the shortest LEADING descendant
  // text that the full text starts with (the title), or null when no such split exists.
  function childLabelOf(el, fullTextLc) {
    if (!el.querySelectorAll || !fullTextLc) return null;
    var kids = el.querySelectorAll("*");
    var best = null; // { raw, lc, len }
    for (var i = 0; i < kids.length; i++) {
      var raw = norm(kids[i].textContent);
      if (!raw) continue;
      var k = raw.toLowerCase();
      if (k.length >= fullTextLc.length) continue;   // must be a proper (shorter) part
      if (k.length > 48) continue;                   // concise only
      if (fullTextLc.indexOf(k) !== 0) continue;     // the LEADING label (title)
      if (!best || k.length < best.len) best = { raw: raw, lc: k, len: k.length };
    }
    return best ? best.raw : null;
  }

  var VOLATILE_SEG = /(^[0-9a-f]{8}-[0-9a-f]{4})|(^[0-9a-f]{16,}$)|(\d{3,})/i;
  function urlPatternOf() {
    try {
      var segs = location.pathname.split("/").filter(function (s) { return s.length > 0; });
      var stable = segs.filter(function (s) { return !VOLATILE_SEG.test(s); });
      if (!stable.length) return location.hostname;
      var take = stable.slice(-2);
      // drop a leading route marker (very short segment like "r"/"e")
      if (take.length === 2 && take[0].length <= 2) take = take.slice(1);
      return "/" + take.join("/");
    } catch (e) { return location.hostname; }
  }

  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    var parts = [], node = el;
    while (node && node.nodeType === 1 && parts.length < 6) {
      if (isStableId(node.id)) { parts.unshift("#" + CSS.escape(node.id)); break; }
      var tag = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { parts.unshift(tag); break; }
      var sibs = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
      if (sibs.length > 1) tag += ":nth-of-type(" + (Array.prototype.indexOf.call(sibs, node) + 1) + ")";
      parts.unshift(tag);
      node = parent;
    }
    return parts.join(" > ") || null;
  }

  function stableDataAttrs(el) {
    if (!el.attributes) return null;
    var da = {}, has = false;
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (/^data-(testid|test-id|automationid|automation-id|bi-id|telemetryid)$/i.test(a.name)) { da[a.name] = a.value; has = true; }
    }
    return has ? da : null;
  }

  // Build the strongest MINIMAL attribute set for `el` following the signal priority.
  function coreAttrs(el) {
    var attrs = {};
    var role = implicitRole(el);

    // 1. stable id wins outright (id selector is unique + full-weight 1.0).
    if (isStableId(el.id)) {
      attrs.id = el.id;
      if (role) attrs.role = role;
      return attrs;
    }

    // stable data hooks are as good as an id — prefer them next.
    var da = stableDataAttrs(el);
    if (da) { attrs.dataAttrs = da; if (role) attrs.role = role; return attrs; }

    // 2. form field: placeholder and/or accessible field label + role.
    if (isField(el)) {
      var fl = A ? A.fieldLabelText(el) : "";
      var ph = el.getAttribute && el.getAttribute("placeholder");
      if (ph) attrs.placeholder = norm(ph);
      if (fl) attrs.fieldLabel = fl;
      var aria = el.getAttribute && el.getAttribute("aria-label");
      if (!ph && !fl && aria) attrs.ariaLabel = norm(aria);
      if (role) attrs.role = role;
      return attrs;
    }

    var fullText = norm(el.innerText || el.textContent || "");
    var fullLc = fullText.toLowerCase();

    // 3. link: last path segment + text + role:link.
    if (el.tagName === "A" && el.getAttribute("href")) {
      var hs = hrefSuffixOf(el);
      if (hs) attrs.hrefSuffix = hs;
      if (fullText && fullText.length <= 80) attrs.text = fullText;
      attrs.role = "link";
      if (!hs && !fullText) { var al = el.getAttribute("aria-label"); if (al) attrs.ariaLabel = norm(al); }
      return attrs;
    }

    // 4. icon "card": button/a wrapping an <img alt="X">.
    var alt = cardImgAlt(el);
    if (alt) {
      attrs.imgAlt = alt;
      attrs.text = alt; // an EXACT descendant span often carries the same short label
      if (role) attrs.role = role;
      return attrs;
    }

    // 5. label + description: the clickable's own text is a superstring; a DESCENDANT
    //    carries the short exact title.
    var childText = childLabelOf(el, fullLc);
    if (childText && childText.toLowerCase() !== fullLc) {
      attrs.childText = childText;
      if (role) attrs.role = role;
      return attrs;
    }

    // 6. plain control: concise visible/accessible label + role.
    var aria2 = el.getAttribute && el.getAttribute("aria-label");
    if (aria2) attrs.ariaLabel = norm(aria2);
    if (fullText && fullText.length <= 80) attrs.text = fullText;
    if (role) attrs.role = role;
    return attrs;
  }

  function confidenceOf(attrs) {
    if (attrs.id || attrs.dataAttrs) return 0.98;
    if (attrs.fieldLabel || attrs.imgAlt || attrs.childText) return 0.92;
    if (attrs.hrefSuffix || attrs.placeholder || attrs.ariaLabel) return 0.85;
    return attrs.text ? 0.7 : 0.4;
  }

  function isUnique(attrs) {
    if (!A || typeof A.resolve !== "function") return true; // no engine -> can't self-verify
    try {
      var r = A.resolve(attrs);
      return r && r.status === "resolved";
    } catch (e) { return true; }
  }

  function describe(el, now) {
    if (!el || el.nodeType !== 1) return null;
    var attrs = coreAttrs(el);
    attrs.scope = scopeOf(el);
    attrs.urlPattern = urlPatternOf();

    // Self-verify: prefer the combination that yields exactly one match. If the engine
    // reports it is NOT a unique resolve, add a domPath tiebreaker (last resort, 0.4).
    if (!isUnique(attrs)) {
      var path = cssPath(el);
      if (path) { attrs.domPath = path; }
    }

    return { strategy: "dom", attrs: attrs, capturedAt: (now || new Date().toISOString()), confidence: confidenceOf(attrs) };
  }

  return {
    describe: describe, cssPath: cssPath, scopeOf: scopeOf,
    hrefSuffixOf: hrefSuffixOf, urlPatternOf: urlPatternOf, coreAttrs: coreAttrs
  };
})();
