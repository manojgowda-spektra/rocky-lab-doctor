/* Rocky demo — the ACT STRIP. One shared nav for the whole showcase so no page can drift.
   Usage:  <script src="/nav.js" data-act="2"></script>          → full strip (fixed, top)
           <script src="/nav.js" data-act="1" data-slim></script> → floating pill (immersive pages)
   The strip is the presenter's map: current act highlighted, provenance badge baked into each
   label (the screen says REAL/SIM so the presenter never has to remember to), one Next button. */
(function () {
  const ACTS = [
    { n: 1, href: '/cloudlabs-sim.html', label: 'Learner', full: 'Act 1 — The stuck learner (a simulated CloudLabs lab)', prov: 'SIM' },
    { n: 2, href: '/demo.html', label: 'Engine', full: 'Act 2 — The engine, live: Select → Diagnose → Fix → Verify on real guides', prov: 'REAL' },
    { n: 3, href: '/labdoctor.html', label: 'Fleet', full: 'Act 3 — The fleet: every production repo scanned', prov: 'REAL' },
    { n: 4, href: '/campaigns.html', label: 'Campaigns', full: 'Act 4 — Findings grouped by root cause into a mergeable plan', prov: 'REAL' },
    { n: 5, href: '/monitor.html', label: 'Watcher', full: 'Act 5 — Continuous sweeps over time (simulated fleet) — skippable in the short cut', prov: 'SIM' },
    { n: 6, href: '/receipts.html', label: 'Receipts', full: 'Act 6 — Every claim, checkable + the ask', prov: 'REAL' },
  ];
  const me = document.currentScript;
  const act = Number(me.dataset.act || 0);
  const slim = me.hasAttribute('data-slim');
  const cur = ACTS.find((a) => a.n === act);
  const next = ACTS.find((a) => a.n === act + 1);
  const prev = ACTS.find((a) => a.n === act - 1);

  const css = document.createElement('style');
  css.textContent = `
  #actstrip{position:fixed;top:0;left:0;right:0;z-index:9999;height:38px;display:flex;align-items:center;gap:6px;
    padding:0 14px;background:#070a10f2;border-bottom:1px solid #ffffff14;backdrop-filter:blur(6px);
    font:12px/1 "Segoe UI",system-ui,sans-serif;color:#8b98a6}
  #actstrip a{text-decoration:none;color:inherit}
  #actstrip .home{font-weight:800;color:#eaf2f6;margin-right:8px;display:flex;align-items:center;gap:6px;font-size:12.5px}
  #actstrip .home:hover{color:#2ee6c8}
  #actstrip .acts{display:flex;gap:2px;align-items:center;flex:1;min-width:0;overflow:hidden}
  #actstrip .act{display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;white-space:nowrap;border:1px solid transparent}
  #actstrip .act:hover{border-color:#ffffff22;color:#eaf2f6}
  #actstrip .act.cur{background:#2ee6c81c;border-color:#2ee6c855;color:#eaf2f6;font-weight:700}
  #actstrip .act .n{font-family:ui-monospace,Consolas,monospace;font-size:10.5px;color:#5f6b78}
  #actstrip .act.cur .n{color:#2ee6c8}
  #actstrip .pv{font-size:8px;font-weight:800;letter-spacing:.5px;padding:1.5px 5px;border-radius:4px}
  #actstrip .pv.REAL{background:#2ee6c824;color:#2ee6c8}
  #actstrip .pv.SIM{background:#6ba6ff24;color:#a9cbff}
  #actstrip .nextbtn{display:flex;align-items:center;gap:6px;background:#2ee6c8;color:#04241f;font-weight:800;
    border-radius:8px;padding:7px 13px;font-size:12px;white-space:nowrap}
  #actstrip .nextbtn:hover{filter:brightness(1.08)}
  #actstrip .prevbtn{color:#5f6b78;padding:6px 8px;border-radius:7px;white-space:nowrap}
  #actstrip .prevbtn:hover{color:#eaf2f6}
  @media(max-width:900px){#actstrip .act:not(.cur) .lbl{display:none}}
  #actpill{position:fixed;left:14px;bottom:12px;z-index:9999;display:flex;align-items:center;gap:10px;
    background:#070a10e8;border:1px solid #ffffff22;border-radius:999px;padding:7px 8px 7px 14px;
    font:12px/1 "Segoe UI",system-ui,sans-serif;color:#c7d3db;box-shadow:0 10px 34px #0008;backdrop-filter:blur(6px)}
  #actpill .where{white-space:nowrap} #actpill .where b{color:#fff}
  #actpill a{text-decoration:none}
  #actpill .go{background:#2ee6c8;color:#04241f;font-weight:800;border-radius:999px;padding:6px 12px;white-space:nowrap;font-size:11.5px}
  #actpill .go:hover{filter:brightness(1.08)}
  #actpill .hm{color:#8b98a6;font-size:13px;padding:0 2px} #actpill .hm:hover{color:#fff}
  @media print{#actstrip,#actpill{display:none}}`;
  document.head.appendChild(css);

  function build() {
    if (slim) {
      const pill = document.createElement('div');
      pill.id = 'actpill';
      pill.innerHTML =
        `<a class="hm" href="/" title="Demo home">⌂</a>` +
        `<span class="where">Act <b>${act} of ${ACTS.length}</b> — ${cur ? cur.full.replace(/^Act \d+ — /, '') : ''}</span>` +
        (next ? `<a class="go" href="${next.href}" title="${next.full}">Next: ${next.label} →</a>` : '');
      document.body.appendChild(pill);
      return;
    }
    const bar = document.createElement('div');
    bar.id = 'actstrip';
    bar.innerHTML =
      `<a class="home" href="/" title="Demo home — the act map">🤖 Rocky</a>` +
      `<div class="acts">` +
      ACTS.map((a) =>
        `<a class="act${a.n === act ? ' cur' : ''}" href="${a.href}" title="${a.full}">` +
        `<span class="n">${a.n}</span><span class="lbl">${a.label}</span><span class="pv ${a.prov}">${a.prov}</span></a>`
      ).join('') +
      `</div>` +
      (prev ? `<a class="prevbtn" href="${prev.href}" title="${prev.full}">← ${prev.label}</a>` : `<a class="prevbtn" href="/">← Home</a>`) +
      (next
        ? `<a class="nextbtn" href="${next.href}" title="${next.full}">Next: ${next.label} →</a>`
        : `<a class="nextbtn" href="/" title="Back to the act map">Finish → Home</a>`);
    document.body.prepend(bar);
    document.body.style.paddingTop = (parseFloat(getComputedStyle(document.body).paddingTop) || 0) + 38 + 'px';
  }
  if (document.body) build(); else addEventListener('DOMContentLoaded', build);
})();
