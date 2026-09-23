/*
 * LabPilot LABEL RESOLVER — turn a label from the guide into a resolved control.
 *
 * THE MISSING LINK. The guide reader produces LABELS ("Open Folder", "Publish"). The anchor
 * engine resolves ATTRIBUTE BUNDLES captured by walking a lab once. Nothing joined the two,
 * which is why guide-driven guidance was built and gated but never actually drove a glow.
 *
 * This is that adapter, and it is deliberately thin: it builds candidate bundles from a label
 * and hands them to the EXISTING engine, so the 0.70 / 0.20 / no-contradiction contract still
 * adjudicates every result. Nothing here can cause a wrong glow the engine would not already
 * have allowed.
 *
 * WHAT THE ENGINE ACTUALLY SUPPORTS (checked against anchor-engine.js, not assumed):
 *   text        exact visible text scores 0.6; substring scores 0.36; an exact match on a
 *               DESCENDANT also scores full (Fluent label-in-child controls)
 *   ariaLabel   exact match only, 0.7
 *   fieldLabel  substring of a field's label text, 0.85
 *   role        a SINGLE role name compared to implicitRole(el), 0.2 — never a CSS selector,
 *               and only used to collect candidates when nothing else found any
 *   scope / inLandmark / urlPattern / id / dataAttrs / href / hrefSuffix / imgAlt / childText
 *
 * MIN_SCORE is 0.70, so a bundle must clear that bar to resolve at all. `text` alone tops out
 * at 0.6 — below the floor by design. That is why every bundle here pairs text with a role:
 * "the thing called X that is a button" is the claim a guide actually makes, and it scores
 * 0.6 + 0.2 = 0.8. A bare text match SHOULD fail, and this adapter must not paper over that.
 *
 * WHY MULTIPLE BUNDLES. A label can legitimately be a button's text, its aria-label, or a
 * field's label. Rather than guess, emit one bundle per reading in confidence order and let
 * resolveTarget try each: the first that resolves UNIQUELY wins; if none do, the answer is an
 * honest absent/ambiguous. Same principle as verbReadings() in the guide reader — offer the
 * alternatives, let the live page decide, never flip a coin.
 *
 * window.LabPilotLabel:
 *   bundlesFor(label, opts)   -> [attrs, ...] in confidence order
 *   resolve(label, opts)      -> the engine's verdict for the best reading
 *   resolveAny(labels, opts)  -> first reading that resolves (for guide-reader alternatives)
 */
(function () {
  "use strict";
  if (window.LabPilotLabel) return;

  // The roles a lab guide means when it says click/select/choose. One bundle per role, because
  // the engine compares role as a single value — not a selector list.
  var CLICK_ROLES = ["button", "link", "tab", "menuitem", "option", "treeitem", "checkbox"];
  var FIELD_ROLES = ["textbox", "searchbox", "combobox"];

  function clean(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  /*
   * Build candidate bundles, most specific first. Order matters: it is the order
   * resolveTarget tries, and the first UNIQUE resolution wins.
   *
   * aria-label goes first: when a control has one it is authored, exact, and worth 0.7 on its
   * own. Text+role follows for ordinary buttons and links. Field bundles come last because a
   * guide that says "Enter Name" usually means a field, but "Name" alone rarely does.
   */
  function bundlesFor(label, opts) {
    var t = clean(label);
    if (!t || t.length < 2) return [];
    opts = opts || {};
    var base = { scope: opts.scope, inLandmark: opts.inLandmark, urlPattern: opts.urlPattern };
    var out = [];

    function push(extra) {
      var b = {};
      for (var k in base) if (base[k]) b[k] = base[k];
      for (var k2 in extra) b[k2] = extra[k2];
      out.push(b);
    }

    // 1. authored aria-label, exact (0.70 — clears the floor alone)
    push({ ariaLabel: t });

    // 2. aria-label AND the role, for icon buttons that share a label with static text
    for (var i = 0; i < CLICK_ROLES.length; i++) push({ ariaLabel: t, role: CLICK_ROLES[i] });

    // 3. visible text + click role (0.6 + 0.2 = 0.80) — the common case
    for (var j = 0; j < CLICK_ROLES.length; j++) push({ text: t, role: CLICK_ROLES[j] });

    // 4. a form field whose label contains this text (0.85 alone)
    push({ fieldLabel: t });
    for (var k3 = 0; k3 < FIELD_ROLES.length; k3++) push({ fieldLabel: t, role: FIELD_ROLES[k3] });

    // 5. placeholder, for fields with no visible label at all (0.70)
    push({ placeholder: t });

    // NOTE: no bare { text } bundle. It scores 0.6, below MIN_SCORE, so it could never
    // resolve — including it would only add work and make the intent less clear.
    return out;
  }

  /*
   * Resolve one label. Returns the engine's own verdict object, unchanged, plus the label so
   * a caller can report what was searched for.
   */
  function resolve(label, opts) {
    var A = window.LabPilotAnchor;
    if (!A) return { status: "absent", reason: "no-engine", label: clean(label) };
    var bundles = bundlesFor(label, opts);
    if (!bundles.length) return { status: "absent", reason: "empty-label", label: clean(label) };
    var r = A.resolveTarget(bundles, opts && opts.root) || { status: "absent", reason: "no-result" };
    r.label = clean(label);
    return r;
  }

  /*
   * Try several readings of the same instruction ("File" and "Select File"). The guide reader
   * deliberately returns both when the text cannot distinguish them; this is where it is
   * settled against the live page.
   *
   * A reading that resolves UNIQUELY beats one that is ambiguous, which beats absent — so an
   * ambiguous first reading never suppresses a clean second one.
   */
  function resolveAny(labels, opts) {
    var list = [].concat(labels || []).filter(Boolean);
    var fallback = null;
    for (var i = 0; i < list.length; i++) {
      var r = resolve(list[i], opts);
      if (r.status === "resolved") return r;
      if (r.status === "ambiguous" && !fallback) fallback = r;
    }
    return fallback || { status: "absent", reason: "no-reading-resolved", label: clean(list[0] || "") };
  }

  window.LabPilotLabel = {
    bundlesFor: bundlesFor,
    resolve: resolve,
    resolveAny: resolveAny,
  };
})();
