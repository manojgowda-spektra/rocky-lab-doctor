/* Rocky Copilot — the content script.
 *
 * The ONLY file that touches the live DOM. It does three things and nothing else:
 *   1. describeElement()  — adapt real elements into the plain candidate objects anchor.js scores
 *   2. drive the step bundle — glow when resolved, show an honest card when not
 *   3. advance only on a REAL user action (a click, a real input), never on a timer
 *
 * Deliberately no model call, no network, no per-frame AI. Everything here is computed.
 */
(function () {
  'use strict';
  if (window.__rockyCopilotLoaded) return;
  window.__rockyCopilotLoaded = true;

  const A = window.RockyAnchor;
  const R = window.RockyRender;

  // ── adapt the DOM into scoreable candidates ────────────────────────────────────────
  const CLICKABLE = 'button,a[href],[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],input,textarea,[role="textbox"],[role="searchbox"],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

  function visible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.05) return false;
    return true;
  }

  function accessibleName(el) {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const t = labelledBy.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean)
        .map((n) => n.textContent).join(' ');
      if (t.trim()) return t;
    }
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab && lab.textContent.trim()) return lab.textContent;
    }
    return el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt') || '';
  }

  function describeElement(el) {
    return {
      _el: el,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || implicitRole(el),
      text: (el.innerText || el.value || '').trim().slice(0, 200),
      name: accessibleName(el).trim().slice(0, 200),
      testId: el.getAttribute('data-testid') || el.getAttribute('data-test') || el.getAttribute('data-automation-id') || null,
      containerText: (el.closest('[class*=card],[class*=Card],li,section,article,form') || el.parentElement || el).innerText?.trim().slice(0, 300) || '',
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
      hidden: !visible(el),
    };
  }

  function implicitRole(el) {
    const t = el.tagName.toLowerCase();
    if (t === 'button') return 'button';
    if (t === 'a' && el.hasAttribute('href')) return 'link';
    if (t === 'textarea') return 'textbox';
    if (t === 'input') {
      const ty = (el.getAttribute('type') || 'text').toLowerCase();
      if (ty === 'search') return 'searchbox';
      if (['button', 'submit', 'reset'].includes(ty)) return 'button';
      if (['checkbox', 'radio'].includes(ty)) return ty;
      return 'textbox';
    }
    return null;
  }

  const candidates = () => Array.from(document.querySelectorAll(CLICKABLE)).filter(visible).map(describeElement);

  // ── UI ─────────────────────────────────────────────────────────────────────────────
  const ui = document.createElement('div');
  ui.id = 'rocky-copilot-root';
  ui.innerHTML = `
    <canvas id="rk-canvas"></canvas>
    <div id="rk-glow" hidden></div>
    <div id="rk-bubble" hidden><div id="rk-say"></div><div id="rk-progress"></div></div>
    <div id="rk-card" hidden>
      <div class="rk-card-h"><span class="rk-dot"></span><b id="rk-card-t">Finding this step…</b></div>
      <p id="rk-card-b"></p>
      <div class="rk-card-why" id="rk-card-why"></div>
    </div>
    <div id="rk-bar">
      <span id="rk-bar-step">Rocky</span>
      <button id="rk-back"  title="Previous step">‹ Back</button>
      <button id="rk-next"  title="Skip to next step">Next ›</button>
      <button id="rk-finish" title="Jump to the end">Finish</button>
      <button id="rk-restart" title="Start again">↻</button>
    </div>`;
  document.documentElement.appendChild(ui);

  const $ = (id) => ui.querySelector(id);
  const glowEl = $('#rk-glow'), bubble = $('#rk-bubble'), say = $('#rk-say'),
        progress = $('#rk-progress'), card = $('#rk-card'), cardT = $('#rk-card-t'),
        cardB = $('#rk-card-b'), cardWhy = $('#rk-card-why'), barStep = $('#rk-bar-step');

  const companion = R.makeCompanion($('#rk-canvas'));
  companion.jumpTo(innerWidth - 140, innerHeight - 170);

  // ── flow state ─────────────────────────────────────────────────────────────────────
  let bundle = null, i = 0, watching = null, lastTarget = null;

  function stepNow() { return bundle && bundle.steps[i]; }

  function setBar() {
    if (!bundle) return;
    barStep.textContent = `Rocky · step ${i + 1} of ${bundle.steps.length}`;
    progress.textContent = `${i + 1} / ${bundle.steps.length}`;
    $('#rk-back').disabled = i === 0;
    $('#rk-next').disabled = i >= bundle.steps.length - 1;
  }

  function clearGlow() { glowEl.hidden = true; lastTarget = null; }

  function placeGlow(el) {
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(glowEl.style, {
      left: (r.left - pad) + 'px', top: (r.top - pad) + 'px',
      width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px',
    });
    glowEl.hidden = false;
    // park Rocky beside the control, clamped on screen, never covering it
    const bx = Math.min(Math.max(r.right + 110, 110), innerWidth - 110);
    const by = Math.min(Math.max(r.top + r.height / 2, 120), innerHeight - 130);
    companion.moveTo(bx, by);
    bubble.hidden = false;
    const bw = 260;
    bubble.style.left = Math.min(Math.max(bx - bw / 2, 12), innerWidth - bw - 12) + 'px';
    bubble.style.top = Math.max(by - 190, 12) + 'px';
  }

  function showCard(state, detail) {
    card.hidden = false; bubble.hidden = true; clearGlow();
    companion.setPose('concerned');
    companion.moveTo(innerWidth - 200, innerHeight - 200);
    cardT.textContent = state === 'absent' ? "I can't find this control yet" : "More than one thing matches";
    cardB.textContent = state === 'absent'
      ? "It may not be on screen yet, or this portal build names it differently. I won't guess — use Next when you've done it, or Back to retrace."
      : "Two controls look equally likely, so I'm not going to point at either. Use Next once you've clicked the right one.";
    cardWhy.textContent = detail || '';
  }

  function render() {
    const s = stepNow();
    setBar();
    if (!s) return;
    card.hidden = true;
    companion.setPose('thinking');
    say.textContent = s.say;

    if (s.await === 'url') { bubble.hidden = false; return; }

    const res = A.resolve(candidates(), s.match || {});
    if (res.state === 'resolved') {
      companion.setPose('point');
      lastTarget = res.target._el;
      placeGlow(lastTarget);
      if (s.copyToClipboard) {
        navigator.clipboard?.writeText(s.copyToClipboard).catch(() => {});
        say.textContent = s.say + '  (copied: ' + s.copyToClipboard + ')';
      }
      armAdvance(s, lastTarget);
    } else {
      const why = res.state === 'ambiguous'
        ? `best score ${res.score?.toFixed(2)} vs runner-up ${(res.runnerUp || 0).toFixed(2)} — needs a ${A.MARGIN} margin`
        : `no candidate carried a required signal (${res.rejected || 0} rejected on a contradiction)`;
      showCard(res.state, why);
    }
  }

  // advance ONLY on a real user action against the resolved element
  function armAdvance(s, el) {
    if (watching) { watching(); watching = null; }
    const advance = () => { cleanup(); next(); };
    const onClick = (e) => { if (el.contains(e.target) || e.target === el) advance(); };
    const onInput = () => { if ((el.value || el.innerText || '').trim().length > 0) advance(); };
    const cleanup = () => {
      document.removeEventListener('click', onClick, true);
      el.removeEventListener('input', onInput);
    };
    if (s.advanceOn === 'input') el.addEventListener('input', onInput);
    else document.addEventListener('click', onClick, true);
    watching = cleanup;
  }

  function next() {
    if (!bundle) return;
    const s = stepNow();
    if (s && s.final) return finish();
    if (i < bundle.steps.length - 1) { i++; render(); } else finish();
  }
  function back() { if (i > 0) { i--; render(); } }
  function restart() { i = 0; card.hidden = true; render(); }

  function finish() {
    if (watching) { watching(); watching = null; }
    clearGlow(); card.hidden = true;
    companion.setPose('celebrate');
    companion.moveTo(innerWidth / 2, innerHeight / 2);
    bubble.hidden = false;
    bubble.style.left = (innerWidth / 2 - 130) + 'px';
    bubble.style.top = (innerHeight / 2 - 190) + 'px';
    say.textContent = 'That\'s the whole flow — model deployed and answering. Nicely done.';
    progress.textContent = '✓ complete';
    confetti();
  }

  function confetti() {
    const cols = ['#2ee6c8', '#a78bfa', '#5ef0a0', '#7df9ff', '#ffd36b'];
    for (let n = 0; n < 46; n++) {
      const d = document.createElement('div');
      d.className = 'rk-conf';
      d.style.left = (innerWidth / 2) + 'px';
      d.style.top = (innerHeight / 2) + 'px';
      d.style.background = cols[n % cols.length];
      ui.appendChild(d);
      const dx = (Math.random() - .5) * 520, dy = Math.random() * -320 - 60;
      d.animate([{ transform: 'translate(0,0)', opacity: 1 },
                 { transform: `translate(${dx}px,${dy + 420}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }],
                { duration: 1700 + Math.random() * 700, easing: 'cubic-bezier(.2,.7,.3,1)' });
      setTimeout(() => d.remove(), 2500);
    }
  }

  $('#rk-back').onclick = back;
  $('#rk-next').onclick = () => { if (watching) { watching(); watching = null; } next(); };
  $('#rk-finish').onclick = finish;
  $('#rk-restart').onclick = restart;

  // re-resolve when the portal re-renders (SPA) or the viewport moves
  let pending = null;
  const rerender = () => { clearTimeout(pending); pending = setTimeout(() => { if (bundle && !card.hidden === false) render(); else if (bundle) render(); }, 250); };
  new MutationObserver(rerender).observe(document.body, { childList: true, subtree: true });
  addEventListener('resize', () => { companion.resize(); if (lastTarget) placeGlow(lastTarget); });
  addEventListener('scroll', () => { if (lastTarget) placeGlow(lastTarget); }, true);

  // ── boot ───────────────────────────────────────────────────────────────────────────
  fetch(chrome.runtime.getURL('steps/foundry.json'))
    .then((r) => r.json())
    .then((b) => { bundle = b; i = 0; companion.setPose('happy'); render(); })
    .catch(() => {
      bundle = { steps: [{ id: 'err', say: 'Could not load the step bundle.', match: {} }] };
      showCard('absent', 'steps/foundry.json failed to load');
    });
})();
