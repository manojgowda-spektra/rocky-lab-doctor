// Demo preflight — run AFTER starting the server (node web/server.js), and KEEP THAT SERVER RUNNING:
// the LLM-enrichment cache lives in the server process, so warming only counts if the same process
// serves the demo. Usage:  node preflight.js
// Checks every demo-critical endpoint, warms the enrichment cache for the labs the demo clicks into,
// and prints a PASS/FAIL checklist with timings. Exit code 0 = ready.

const BASE = process.env.ROCKY_BASE_URL || `http://localhost:${process.env.ROCKY_PORT || 5173}`; // set ROCKY_BASE_URL to preflight a hosted deployment
const DEMO_LABS = ['ODL-DEMO-0001', 'ODL-DEMO-0006', 'ODL-DEMO-0005']; // broken web-app, false-PASS storage, quota/GPU
const results = [];
let failed = 0;

// Every check is tagged with the demo Act it proves, so this script doubles as the live Demo
// Readiness Scorecard (docs/final_demo_runbook.md references this output, never a stale copy).
let ACT = 'Setup';
function act(name) { ACT = name; }
function ok(name, pass, detail) {
  results.push({ act: ACT, name, pass, detail });
  if (!pass) failed++;
}

async function timed(fn) { const t = Date.now(); const v = await fn(); return [v, Date.now() - t]; }
async function get(p) { const r = await fetch(BASE + p); return r.status === 200 ? r.json() : Promise.reject(new Error(`${p} → HTTP ${r.status}`)); }
async function post(p, body) { const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }); return r.status === 200 ? r.json() : Promise.reject(new Error(`${p} → HTTP ${r.status}`)); }

// The launcher starts the server moments before us — wait up to 20s for it instead of failing on
// first contact (a cold laptop on demo morning can take longer than the .bat's fixed sleep).
async function waitForServer(ms = 20000) {
  const deadline = Date.now() + ms;
  for (;;) {
    try { return await get('/api/labstate'); }
    catch (e) { if (Date.now() > deadline) throw new Error(`server not reachable at ${BASE} after ${ms / 1000}s (${e.message})`); }
    await new Promise((r) => setTimeout(r, 500));
  }
}

(async () => {
  console.log(`\nRocky/Lab Doctor demo preflight → ${BASE}\n`);
  try {
    // 1. Server + model
    act('Setup');
    const [state] = await timed(() => waitForServer());
    ok('Server up, lab state loads', !!state.lab, `lab="${state.lab.title}"`);
    ok('LLM configured', state.model && state.model !== 'off', `model=${state.model}`);

    // 1b. Unified front door: "/" serves the home page (the single entry point that ties every hat together)
    const homeRoot = await fetch(BASE + '/');
    const homeRootHtml = homeRoot.status === 200 ? await homeRoot.text() : '';
    ok('Home page serves at "/" (unified front door)', homeRoot.status === 200 && /the reliability layer for hands-on cloud labs/.test(homeRootHtml));
    ok('Home links every hat + companion (no orphan pages)', ['/labdoctor.html', '/campaigns.html', '/monitor.html', '/amnesty.html', '/intent.html', '/support.html', '/rocky.html?demo=1', '/receipts.html'].every((h) => homeRootHtml.includes('href="' + h + '"')));
    const notFound = await fetch(BASE + '/does-not-exist-xyz');
    ok('Unknown route returns a friendly page home (no dead end)', notFound.status === 404 && /Back to Rocky/.test(await notFound.text()));

    // 2. Catalog
    act('Act 3 — Diagnosis');
    const [cat, tCat] = await timed(() => get('/api/labhealth/catalog'));
    ok('Catalog analyzes', cat.labCount >= 10 && cat.broken >= 1, `${cat.labCount} labs, ${cat.broken} broken, health ${cat.catalogHealth} (${tCat}ms)`);
    ok('Cross-lab fleet pattern present', (cat.fleetPatterns || []).length >= 1);
    ok('Risk radar flags the healthy-but-at-risk lab', (cat.riskRadar || []).some((r) => r.labId === 'ODL-DEMO-0011'));

    // 3. Warm the enrichment cache for every lab the demo clicks into (cold ≈ 4-8s, warm ≈ <0.5s)
    for (const id of DEMO_LABS) {
      const [rep, tCold] = await timed(() => get(`/api/labhealth?lab=${id}`));
      const [, tWarm] = await timed(() => get(`/api/labhealth?lab=${id}`));
      ok(`Lab detail + LLM enrichment: ${id}`, Array.isArray(rep.findings), `cold ${tCold}ms → warm ${tWarm}ms, ${rep.findings.length} findings`);
      ok(`  cache effective for ${id}`, tWarm < 1500, `${tWarm}ms`);
    }

    // 4. The demo's marquee findings actually fire
    ok('False-PASS finding fires (100% completion yet broken)', (await get('/api/labhealth?lab=ODL-DEMO-0006')).findings.some((f) => f.subtype === 'false-pass'));

    // 5. Preview-fix-impact (honest framing: model, not test)
    act('Act 4 — Action');
    const [pv, tPv] = await timed(() => post('/api/labhealth/preview-fix-impact', { lab: 'ODL-DEMO-0001', approved: [] }));
    ok('Preview-fix-impact models 36→~100', pv.before.score < 60 && pv.after.score >= 95, `${pv.before.score} → ${pv.after.score} (${tPv}ms)`);

    // 6. Pre-launch lint: fires on the NEW lab, skips labs with telemetry
    act('Act 2 — Detection');
    const lint = await get('/api/labhealth/probe?lab=ODL-DEMO-0012');
    ok('Pre-launch lint finds the deprecated embedding model in the new lab', (lint.findings || []).some((f) => f.quotedTrigger === 'text-embedding-ada-002'));
    const lintSkip = await get('/api/labhealth/probe?lab=ODL-DEMO-0005');
    ok('Pre-launch lint correctly SKIPS labs that have telemetry', lintSkip.skipped === true);

    // 6a2. Real catalog scan: the marquee real-data beat must be present and discriminating
    const rs = await get('/api/labhealth/real-scan');
    ok('Real catalog scan available with findings', rs.available === true && rs.totals && rs.totals.findings > 0, rs.available ? `${rs.repoCount} repos, ${rs.totals.findings} findings` : 'missing real-scan-results.json');
    ok('Real scan discriminates (some repos clean)', (rs.repos || []).some((x) => x.findingCount === 0), (rs.repos || []).filter((x) => x.findingCount === 0).map((x) => x.name).join(', ').slice(0, 60));
    ok('Real scan findings carry file:line evidence', (rs.repos || []).some((x) => x.findings.some((f) => f.file && f.line && f.evidence)));

    // 6a3. Ecosystem change intelligence: cached impact report loads with dated, cited impacts
    act('Act 6 — Future Product');
    const eco = await get('/api/labhealth/ecosystem');
    ok('Ecosystem impact report available with cited impacts', eco.available === true && (eco.impacts || []).length > 0 && eco.impacts.every((i) => i.citation && i.referenceCount > 0), eco.available ? `${eco.impacts.length} upstream changes touch the catalog` : 'missing impact-report.json');

    // Intent Ledger pilot: real guides, quote-anchored facts, dashboard serves
    const intent = await get('/api/intent/pilot');
    ok('Intent Ledger pilot available, facts quote-anchored to source', intent.available === true && intent.summary.tasks > 0 && intent.summary.faithfulnessPct >= 95, intent.available ? `${intent.summary.guides} guides, ${intent.summary.facts} facts, ${intent.summary.faithfulnessPct}% anchored` : 'missing pilot-report.json');
    const intentPage = await fetch(BASE + '/intent.html');
    ok('Intent Ledger dashboard page serves', intentPage.status === 200 && (await intentPage.text()).includes('Intent Ledger'));

    // 6a4. Fix campaign plan: real findings batched by cause, cross-repo campaigns ranked first
    act('Act 4 — Action');
    const camp = await get('/api/labhealth/campaigns');
    ok('Campaign plan batches ALL real findings by cause', camp.available === true && camp.stats.campaigns > 0 && camp.stats.findings === rs.totals.findings, camp.available ? `${camp.stats.findings} findings → ${camp.stats.campaigns} campaigns, top 3 cover ${camp.stats.top3CoveragePct}%` : 'missing real-scan-results.json');
    ok('Campaign plan surfaces a cross-repo upstream-change campaign', (camp.campaigns || []).some((c) => c.repoCount >= 2 && c.cause.kind === 'upstream-change'), camp.campaigns && camp.campaigns[0] && camp.campaigns[0].title);
    const campPage = await fetch(BASE + '/campaigns.html');
    ok('Campaigns dashboard page serves', campPage.status === 200 && (await campPage.text()).includes('Fixer'));

    // 6a5. False-FAIL Amnesty demo (SIMULATED): drafted packet, live human gate, reversion guard
    await post('/api/amnesty/reset', {});
    const am = await get('/api/amnesty/scenario');
    ok('Amnesty drafts eligible verdicts from a fleet-confirmed regression', am.simulated === true && am.packet.eligible.length >= 4 && am.packet.cases[0] && am.packet.cases[0].regression === true, `${am.packet.eligible.length} eligible, ${am.packet.ineligible.length} excluded`);
    ok('Amnesty excludes wrong-work and no-evidence learners (gates working)', am.packet.ineligible.some((x) => x.reason === 'state-mismatch') && am.packet.ineligible.some((x) => x.reason === 'no-evidence'));
    const noAuth = await fetch(BASE + '/api/amnesty/execute', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    ok('Amnesty REFUSES execution without a named human (400)', noAuth.status === 400);
    const exec = await post('/api/amnesty/execute', { authorizedBy: 'preflight@demo' });
    ok('Amnesty executes with a human, restores verdicts, reversion guard clear', exec.executed && exec.executed.written >= 4 && exec.executed.failed === 0 && exec.reconcile && exec.reconcile.halt === false, exec.executed ? `${exec.executed.written} written, ${exec.reconcile.contradicted.length} contradicted` : 'no execution');
    await post('/api/amnesty/reset', {});
    const amPage = await fetch(BASE + '/amnesty.html');
    ok('Amnesty dashboard page serves', amPage.status === 200 && (await amPage.text()).includes('False-FAIL Amnesty'));

    // 6b. The drift fix-draft must quote EACH lab's own step text (it was once hardcoded to lab 0001's)
    act('Act 3 — Diagnosis');
    const lab4 = await get('/api/labhealth?lab=ODL-DEMO-0004&enrich=0');
    const lab4drift = (lab4.findings || []).find((f) => f.type === 'drift') || { draftFix: {} };
    ok("Drift fix quotes the lab's own step text (0004 → rg-data)", /rg-data/.test(lab4drift.draftFix.before || ''), `before="${(lab4drift.draftFix.before || '').slice(0, 60)}"`);

    // 6c. Support Intelligence (simulated twin fleet): overview + packet build
    act('Act 6 — Future Product');
    const so = await get('/api/support/overview');
    ok('Support overview: tickets collapse to incidents (simulated)', so.simulated === true && so.stats.incidents > 0 && so.stats.tickets > so.stats.incidents, `${so.stats.tickets} tickets → ${so.stats.incidents} incidents (${so.stats.collapseRatio}:1)`);
    const firstTicket = so.incidents[0] && so.incidents[0].tickets[0];
    const pk = await get(`/api/support/packet?ticket=${encodeURIComponent(firstTicket)}`);
    ok('Support packet builds with evidence + simulated provenance', !!(pk.finding && pk.finding.evidence.length) && /SIMULATED/i.test(pk.provenance.dataSource), pk.ticketId);

    // 6d. Continuous monitor (scripted twin timeline): regression fires exactly at the scripted sweep,
    // and the reliability ledger derives cases/SLI/trust from the same sweeps (run through the sweep-6 recovery)
    act('Act 5 — Assurance');
    await post('/api/monitor/reset', {});
    let regressionAt = null, platformAt = null, lastLedger = null;
    for (let s = 1; s <= 6; s++) {
      const snap = await post('/api/monitor/advance', {});
      if (!regressionAt && snap.alerts.some((a) => a.type === 'regression' || a.type === 'new-finding')) regressionAt = s;
      if (!platformAt && snap.alerts.some((a) => a.type === 'platform-incident')) platformAt = s;
      lastLedger = snap.ledger;
    }
    ok('Monitor: silent break detected at the scripted sweep (3)', regressionAt === 3, `first alert at sweep ${regressionAt}`);
    ok('Monitor: multi-lab break folds into ONE platform incident (sweep 4)', platformAt === 4, `platform incident at sweep ${platformAt}`);
    act('Act 4 — Action');
    ok('Ledger: 5 cases opened, sweep-6 recovery closed exactly one', !!lastLedger && lastLedger.totals.cases === 5 && lastLedger.totals.closed === 1, lastLedger && `${lastLedger.totals.cases} cases, ${lastLedger.totals.closed} closed`);
    ok('Ledger: fix queue holds the 4 open cases ranked by learner cost', !!lastLedger && lastLedger.queue.length === 4 && lastLedger.queue.every((c, i, a) => !i || a[i - 1].costLearnerSweeps >= c.costLearnerSweeps), lastLedger && lastLedger.queue.map((c) => c.costLearnerSweeps).join(' ≥ '));
    ok('Ledger: the platform incident links all 4 drift cases to ONE incident id', !!lastLedger && new Set(lastLedger.cases.filter((c) => c.type === 'drift').map((c) => c.incidentId)).size === 1);
    ok('Ledger: validator trust flags the false-pass check (tier B, nothing else blamed)', !!lastLedger && Object.values(lastLedger.trust).length === 1 && Object.values(lastLedger.trust)[0].falsePass === 1 && Object.values(lastLedger.trust)[0].tier === 'B');
    await post('/api/monitor/reset', {});

    // 7. Companion answer path (live LLM, demo scenario on) + honest default (scenario off)
    act('Rocky (Trust Layer)');
    const [sayDemo, tSay] = await timed(() => post('/api/say', { message: 'Did I complete this step correctly?', kind: 'answer', scenario: true }));
    ok('Companion answers in demo scenario', !!sayDemo.message, `${tSay}ms — "${(sayDemo.message || '').slice(0, 70)}…"`);
    const sayHonest = await post('/api/say', { message: 'Did I complete this step correctly?', kind: 'answer', scenario: false });
    ok('Companion abstains honestly with no scenario', /can(no|['’])t|don['’]t have|no (live|active|lab)|not connected|unable to verify/i.test(sayHonest.message || ''), `"${(sayHonest.message || '').slice(0, 70)}…"`);

    // 7b. THE moat moment: the scripted trap question. Rocky must point at the region, not endorse the
    // smaller VM. (The audit caught the un-checked version endorsing it in 3 of 3 runs.)
    const trap = await post('/api/say', { message: 'My deployment keeps failing with a SkuNotAvailable error. Should I just pick a smaller VM size?', kind: 'answer', scenario: true });
    const trapMsg = trap.message || '';
    ok('Companion refuses the plausible-but-wrong fix (trap question)', /region|eastus|west ?us ?2/i.test(trapMsg) && !/^\s*(in this simulated demo,?\s*)?(yes|sure|yeah)\b/i.test(trapMsg) && !/smaller (vm|size) (often helps|can help|should work)/i.test(trapMsg), `"${trapMsg.slice(0, 90)}…"`);

    // 8. Learner-side flows: inject → applyfix → escalate → reset (leaves state clean for the demo)
    act('Rocky (Trust Layer)');
    await post('/api/inject', { type: 'license' });
    const rep = await post('/api/report', { reason: 'preflight' });
    ok('Escalation produces a redacted ticket', /^ROCKY-/.test(rep.ticket) && !JSON.stringify(rep.summary).includes('Sup3rSecret'), rep.ticket);
    await post('/api/applyfix', {});
    const after = await get('/api/labstate');
    ok('Apply-fix flips region validations green', after.validations.filter((v) => v.status === 'failed').length <= 1);
    await post('/api/reset', {});
    const clean = await get('/api/labstate');
    ok('Reset restores pristine demo state', clean.validations.filter((v) => v.status === 'failed').length === 3);

    // 9. Dead routes stay dead
    act('Cleanup');
    for (const dead of ['/classic', '/api/insight', '/api/labhealth/ask']) {
      const r = await fetch(BASE + dead, { method: dead.startsWith('/api') ? 'POST' : 'GET' });
      ok(`Removed route 404s: ${dead}`, r.status === 404);
    }
  } catch (e) {
    ok('Preflight aborted', false, e.message);
  }

  // Flat detail list (unchanged format — scripts/CI grep this)
  for (const r of results) console.log(`${r.pass ? ' PASS ' : '*FAIL*'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);

  // Per-Act readiness scorecard — the live Demo Readiness Checklist. ACT_ORDER fixes display order
  // to the narrative sequence; any tag not listed (should not happen) sorts after by first appearance.
  const ACT_ORDER = ['Setup', 'Act 2 — Detection', 'Act 3 — Diagnosis', 'Act 4 — Action', 'Act 5 — Assurance', 'Act 6 — Future Product', 'Rocky (Trust Layer)', 'Cleanup'];
  const byAct = new Map();
  for (const r of results) { if (!byAct.has(r.act)) byAct.set(r.act, { pass: 0, fail: 0 }); byAct.get(r.act)[r.pass ? 'pass' : 'fail']++; }
  console.log('\n── Demo Readiness Scorecard ──────────────────────────────');
  for (const name of [...ACT_ORDER, ...[...byAct.keys()].filter((k) => !ACT_ORDER.includes(k))]) {
    const s = byAct.get(name); if (!s) continue;
    const total = s.pass + s.fail;
    console.log(`  ${s.fail === 0 ? '✅' : '❌'} ${name.padEnd(24)} ${s.pass}/${total}`);
  }
  console.log('  ────────────────────────────────────────────────────────');
  console.log(`  TOTAL  ${results.length - failed}/${results.length}  (Act 1 — The Problem has no automated check: it is the pitch, not a system behavior)`);
  console.log('────────────────────────────────────────────────────────────\n');

  console.log(`${failed === 0 ? '✅ READY FOR DEMO — keep this server process running (the cache is warm in it).' : `❌ ${failed} check(s) failed — fix before demo.`}\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
