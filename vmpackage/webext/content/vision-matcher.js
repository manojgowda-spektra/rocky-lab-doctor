/*
 * LabPilot vision matcher (surface:"vision") — the SCOPED fallback for the handful of
 * lab steps that are NOT browser DOM: the native OS file picker (attach brochures) and
 * VS Code / remote-desktop controls when the VM is viewed in-browser (RDP canvas). Those
 * arrive as pixels in a single <canvas>/<video>/<img>, so the DOM anchor engine can't see
 * them. This module template-matches a KNOWN reference crop against that pixel region.
 *
 * It is deliberately NOT a general screen reader (that approach failed): it only fires on
 * whitelisted vision steps, matches a specific stored template, and keeps the SAME
 * accuracy contract as the DOM engine —
 *   - normalized cross-correlation (NCC, range [-1,1]); a resolved match must reach
 *     MIN_SCORE (default 0.90),
 *   - a distinct-location runner-up within MARGIN ⇒ AMBIGUOUS ⇒ no glow (never coin-flip),
 *   - below MIN_SCORE ⇒ ABSENT ⇒ caller shows the instruction card, never a wrong glow.
 * So the worst case degrades to a text card, exactly like a missing DOM element.
 *
 * Pure core (matchTemplate/search/resolve) has NO DOM dependency and is unit-tested in
 * node; the thin browser wrapper (resolveVisionStep) grabs ImageData from the on-page
 * pixel surface and maps the matched pixel rect back to viewport coords for the glow.
 *
 * Dual-loadable: attaches window.LabPilotVision in the extension and module.exports in node.
 */
(function (root) {
  "use strict";

  var MIN_SCORE = 0.90; // NCC a resolved template match must reach
  var MARGIN = 0.06;    // best must beat any DISTINCT-location runner-up by at least this
  var MIN_SEP = 0.5;    // a runner-up counts as "distinct" only if >= 0.5*max(tw,th) away
  var SCALES = [0.9, 1.0, 1.1]; // multi-scale: tolerate RDP/DPI scaling of the remote frame

  // ---- gray conversion -----------------------------------------------------
  // img = { width, height, data: RGBA (Uint8ClampedArray|Array|Uint8Array) }
  function toGray(img) {
    var n = img.width * img.height, g = new Float64Array(n), d = img.data;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }
    return { width: img.width, height: img.height, g: g };
  }

  // Center a template once (subtract mean); precompute its L2 norm for NCC denominator.
  function prepTemplate(t) {
    var n = t.g.length, mean = 0, i;
    for (i = 0; i < n; i++) mean += t.g[i];
    mean /= n;
    var c = new Float64Array(n), ss = 0;
    for (i = 0; i < n; i++) { c[i] = t.g[i] - mean; ss += c[i] * c[i]; }
    return { width: t.width, height: t.height, c: c, norm: Math.sqrt(ss) || 1e-9, n: n };
  }

  // Nearest-neighbour rescale of a prepared-gray template (for multi-scale search).
  function scaleGray(t, s) {
    var nw = Math.max(2, Math.round(t.width * s)), nh = Math.max(2, Math.round(t.height * s));
    var g = new Float64Array(nw * nh);
    for (var y = 0; y < nh; y++) {
      var sy = Math.min(t.height - 1, Math.floor(y / s));
      for (var x = 0; x < nw; x++) {
        var sx = Math.min(t.width - 1, Math.floor(x / s));
        g[y * nw + x] = t.g[sy * t.width + sx];
      }
    }
    return { width: nw, height: nh, g: g };
  }

  // NCC of prepared template T against haystack gray H at top-left (ox,oy).
  function nccAt(H, T, ox, oy) {
    var tw = T.width, th = T.height, hw = H.width, hg = H.g, tc = T.c;
    var sum = 0, x, y, hr;
    for (y = 0; y < th; y++) { hr = (oy + y) * hw + ox; for (x = 0; x < tw; x++) sum += hg[hr + x]; }
    var hmean = sum / T.n;
    var num = 0, hss = 0, tr;
    for (y = 0; y < th; y++) {
      hr = (oy + y) * hw + ox; tr = y * tw;
      for (x = 0; x < tw; x++) { var hd = hg[hr + x] - hmean; num += hd * tc[tr + x]; hss += hd * hd; }
    }
    var den = Math.sqrt(hss) * T.norm;
    if (den < 1e-9) return 0;
    return num / den;
  }

  // Coarse-to-fine scan of one prepared template over a haystack gray image.
  // Returns { score, x, y, second } where `second` is the best score at a location
  // separated from the winner by >= MIN_SEP*max(tw,th) (a genuinely different match).
  function scanOne(H, T, stride) {
    var tw = T.width, th = T.height;
    if (tw > H.width || th > H.height) return { score: -2, x: 0, y: 0, second: -2 };
    var S = Math.max(1, stride | 0);
    var best = -2, bx = 0, by = 0, x, y, sc;
    for (y = 0; y + th <= H.height; y += S) {
      for (x = 0; x + tw <= H.width; x += S) {
        sc = nccAt(H, T, x, y);
        if (sc > best) { best = sc; bx = x; by = y; }
      }
    }
    // refine ±S around the coarse winner at step 1
    if (S > 1) {
      var x0 = Math.max(0, bx - S), x1 = Math.min(H.width - tw, bx + S);
      var y0 = Math.max(0, by - S), y1 = Math.min(H.height - th, by + S);
      for (y = y0; y <= y1; y++) for (x = x0; x <= x1; x++) {
        sc = nccAt(H, T, x, y);
        if (sc > best) { best = sc; bx = x; by = y; }
      }
    }
    // second-best at a DISTINCT location (uniqueness / no-coin-flip guard)
    var sep = MIN_SEP * Math.max(tw, th), second = -2;
    for (y = 0; y + th <= H.height; y += S) {
      for (x = 0; x + tw <= H.width; x += S) {
        if (Math.abs(x - bx) < sep && Math.abs(y - by) < sep) continue;
        sc = nccAt(H, T, x, y);
        if (sc > second) second = sc;
      }
    }
    return { score: best, x: bx, y: by, second: second };
  }

  // Search a template across SCALES; keep the strongest peak. `opts.scales`/`opts.stride`
  // overridable (tests pass scales:[1], stride:1 for exactness).
  function search(haystackImg, templateImg, opts) {
    opts = opts || {};
    var H = toGray(haystackImg);
    var base = toGray(templateImg);
    var scales = opts.scales || SCALES;
    var stride = opts.stride != null ? opts.stride : Math.max(1, Math.round(Math.min(base.width, base.height) / 6));
    var best = { score: -2, x: 0, y: 0, second: -2, w: base.width, h: base.height, scale: 1 };
    for (var i = 0; i < scales.length; i++) {
      var g = scales[i] === 1 ? base : scaleGray(base, scales[i]);
      var T = prepTemplate(g);
      var r = scanOne(H, T, stride);
      if (r.score > best.score) best = { score: r.score, x: r.x, y: r.y, second: Math.max(r.second, best.second), w: g.width, h: g.height, scale: scales[i] };
      else if (r.second > best.second) best.second = r.second;
    }
    return best;
  }

  // Apply the accuracy contract → resolved | ambiguous | absent (mirrors the DOM engine).
  function resolve(haystackImg, templateImg, opts) {
    opts = opts || {};
    var minScore = opts.threshold != null ? opts.threshold : MIN_SCORE;
    var margin = opts.margin != null ? opts.margin : MARGIN;
    var b = search(haystackImg, templateImg, opts);
    if (b.score < minScore) return { status: "absent", score: b.score, reason: "below-threshold" };
    if (b.second >= b.score - margin) return { status: "ambiguous", score: b.score, second: b.second };
    return { status: "resolved", score: b.score, rect: { x: b.x, y: b.y, w: b.w, h: b.h }, scale: b.scale };
  }

  // ---- template registry (browser) ----------------------------------------
  // Reference crops are stored as web_accessible PNGs and decoded to ImageData once, keyed
  // by templateId. Until a crop is registered, a vision step resolves ABSENT ⇒ card
  // fallback (safe: an un-captured step shows instructions, never a wrong glow).
  var TEMPLATES = {};
  function registerTemplate(id, imageData) { TEMPLATES[id] = imageData; }
  function hasTemplate(id) { return !!TEMPLATES[id]; }

  // ---- browser wrapper ------------------------------------------------------
  // Find the on-page pixel surface hosting the remote frame / picker (RDP canvas, a
  // <video>, or a full-viewport <img>). Heuristic: the largest such element.
  function findPixelSurface(doc) {
    doc = doc || (typeof document !== "undefined" ? document : null);
    if (!doc) return null;
    var els = [].slice.call(doc.querySelectorAll("canvas,video,img"));
    var best = null, bestArea = 0;
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      var a = r.width * r.height;
      if (a > bestArea && r.width > 200 && r.height > 150) { bestArea = a; best = els[i]; }
    }
    return best;
  }

  // Grab ImageData (RGBA) from a pixel surface via an offscreen 2D context.
  function grabImageData(surface) {
    try {
      var r = surface.getBoundingClientRect();
      var w = Math.max(1, Math.round(surface.naturalWidth || surface.videoWidth || surface.width || r.width));
      var h = Math.max(1, Math.round(surface.naturalHeight || surface.videoHeight || surface.height || r.height));
      var cv = (typeof OffscreenCanvas !== "undefined") ? new OffscreenCanvas(w, h)
             : Object.assign(document.createElement("canvas"), { width: w, height: h });
      var ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(surface, 0, 0, w, h);
      return { data: ctx.getImageData(0, 0, w, h), pxW: w, pxH: h, cssRect: r };
    } catch (e) { return null; } // tainted canvas / cross-origin frame ⇒ null ⇒ card fallback
  }

  // Pull the vision spec off a step's target selector(s): { templateId, threshold, cardText }.
  function visionSpec(step) {
    if (!step || !step.targets) return null;
    for (var i = 0; i < step.targets.length; i++) {
      var sels = step.targets[i].selectors || [];
      for (var j = 0; j < sels.length; j++) {
        var a = sels[j].attrs || sels[j];
        if (a && a.templateId) return a;
      }
    }
    return null;
  }

  // Resolve a vision step against the live page. Returns:
  //   { status:"resolved", viewportRect, score }  — glow here
  //   { status:"card", cardText }                 — no confident glow ⇒ show instructions
  function resolveVisionStep(step, ctx) {
    var spec = visionSpec(step);
    if (!spec) return { status: "card", cardText: (step && step.text) || "Do this step" };
    var card = { status: "card", cardText: spec.cardText || (step && step.text) || "Do this step" };
    if (!hasTemplate(spec.templateId)) return card; // not captured yet ⇒ honest card
    var surface = (ctx && ctx.surface) || findPixelSurface(ctx && ctx.doc);
    if (!surface) return card;
    var grab = grabImageData(surface);
    if (!grab) return card;
    var res = resolve(grab.data, TEMPLATES[spec.templateId], { threshold: spec.threshold });
    if (res.status !== "resolved") return card;
    // map matched pixel rect → viewport CSS coords (account for surface scaling)
    var sx = grab.cssRect.width / grab.pxW, sy = grab.cssRect.height / grab.pxH;
    return {
      status: "resolved", score: res.score,
      viewportRect: {
        left: grab.cssRect.left + res.rect.x * sx,
        top: grab.cssRect.top + res.rect.y * sy,
        width: res.rect.w * sx,
        height: res.rect.h * sy
      }
    };
  }

  var api = {
    // pure core (node-tested)
    resolve: resolve, search: search, matchTemplate: search, toGray: toGray,
    // browser
    resolveVisionStep: resolveVisionStep, registerTemplate: registerTemplate,
    hasTemplate: hasTemplate, findPixelSurface: findPixelSurface, grabImageData: grabImageData,
    _config: { MIN_SCORE: MIN_SCORE, MARGIN: MARGIN, MIN_SEP: MIN_SEP, SCALES: SCALES }
  };
  if (root) root.LabPilotVision = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
