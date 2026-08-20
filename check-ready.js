// Demo readiness check — verifies every moving part the live demo depends on.
// Run via CHECK_READY.cmd (or: node check-ready.js). Exit 0 = ready.
// Design rules: no magic-number pins (assert INTERNAL consistency instead, so a legitimate
// rescan can't turn the gate red), and every hard path is env-overridable.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const ROOT = __dirname;
const LABS = process.env.REAL_LABS_DIR || 'C:/Users/ManojGowda/OneDrive - Spektra Systems LLC/Desktop/Labs';
let pass = 0, fail = 0, warn = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? ' ✓ ' : ' ✗ ') + name + (extra ? '  — ' + extra : '')); };
const note = (name, extra) => { warn++; console.log(' ⚠ ' + name + (extra ? '  — ' + extra : '')); };

function get(p) {
  return new Promise((res) => {
    const rq = http.get({ host: 'localhost', port: 5173, path: p, timeout: 5000 }, (r) => {
      let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => res({ status: r.statusCode, body: s }));
    });
    rq.on('error', () => res(null)); rq.on('timeout', () => { rq.destroy(); res(null); });
  });
}
function post(p, bodyObj) {
  return new Promise((res) => {
    const b = JSON.stringify(bodyObj || {});
    const rq = http.request({ host: 'localhost', port: 5173, path: p, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, (r) => {
      let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => { try { res(JSON.parse(s)); } catch { res(null); } });
    });
    rq.on('error', () => res(null)); rq.end(b);
  });
}

(async () => {
  console.log('\n=== ROCKY DEMO READINESS ===\n');

  // 1. server up + it is THIS checkout (stale-server detection via the build stamp)
  const home = await get('/');
  ok('Server running on :5173', !!home && home.status === 200, home ? '' : 'run START_DEMO.cmd (it starts the server)');
  if (!home) { console.log('\n' + fail + ' problem(s) — start the server first, then re-run.'); process.exit(1); }
  const ver = await get('/api/version');
  try {
    const v = JSON.parse(ver.body);
    let localCommit = null;
    try { localCommit = execSync('git rev-parse --short HEAD', { cwd: ROOT, timeout: 3000 }).toString().trim(); } catch {}
    if (v.commit && localCommit) ok('Server is this checkout (not a stale process)', v.commit === localCommit, v.commit + ' vs ' + localCommit);
    else note('Server build stamp', 'commit unavailable — cannot prove freshness');
  } catch { ok('Server /api/version', false); }

  // 2. the demo flow pages (Acts 1-6 + home + shared nav + extras)
  for (const p of ['home.html', 'cloudlabs-sim.html', 'demo.html', 'labdoctor.html', 'campaigns.html', 'monitor.html', 'receipts.html', 'nav.js', 'qa.html', 'amnesty.html', 'intent.html', 'backstage.html', 'rail.html', 'presenter.html']) {
    const r = await get('/' + p);
    ok('Page: ' + p, !!r && r.status === 200);
  }

  // 3. facts.json — served, and consistent with the live scan (the anti-contradiction check)
  const factsR = await get('/api/facts');
  let facts = null;
  try { facts = JSON.parse(factsR.body); ok('Facts served (/api/facts)', !!(facts && facts.static)); }
  catch { ok('Facts served (/api/facts)', false); }

  // 4. scan state — INTERNAL consistency, not a hardcoded total
  const scan = await get('/api/labhealth/real-scan');
  try {
    const j = JSON.parse(scan.body);
    ok('Real scan cache available', !!j.available);
    if (j.available) {
      const sum = (j.repos || []).reduce((n, r) => n + (r.findingCount || 0), 0);
      ok('Scan self-consistent (totals = sum of repos)', j.totals && j.totals.findings === sum, j.totals.findings + ' vs ' + sum);
      const clean = (j.repos || []).filter((r) => r.findingCount === 0).length;
      if (facts && facts.static) ok('Clean-repo count matches facts.json', clean === facts.static.cleanRepos, clean + ' vs ' + facts.static.cleanRepos);
      const caf = (j.repos || []).find((r) => r.name === 'CAF-Infra-Security');
      ok('CAF repo not dirty in the cache (live example reverted)', caf && caf.git && !caf.git.dirty);
      if (j.canRescan) ok('Live-rescan available (Labs folder readable)', true);
      else note('Live rescan unavailable', 'Labs folder not on this host — cached scan serves; SKIP the live-rescan beat in Act 3');
    }
  } catch { ok('Scan state parse', false); }

  // 5. live-example repo — present, hydrated (OneDrive), and git-clean
  if (fs.existsSync(LABS)) {
    const cafFile = path.join(LABS, 'CAF-Infra-Security', '00-lab-intro.md');
    ok('Live-example file exists', fs.existsSync(cafFile));
    try { fs.readFileSync(cafFile); ok('Live-example file hydrated (OneDrive readable)', true); }
    catch { ok('Live-example file hydrated (OneDrive readable)', false, 'OneDrive may be dehydrated — open the folder once'); }
    try {
      const st = execSync('git status --porcelain', { cwd: path.join(LABS, 'CAF-Infra-Security') }).toString().trim();
      ok('CAF git status clean', st === '', st ? 'DIRTY — run DEMO_REVERT_BUG.cmd' : '');
    } catch { ok('CAF git status clean', false, 'git not reachable'); }
  } else {
    note('Labs folder not found at ' + LABS, 'set REAL_LABS_DIR to override; live-rescan beat unavailable, cached scan still serves');
  }

  // 6. guided-demo staging + end-to-end sample load
  for (const f of ['Demo-Uploads/Challenge-05.md', 'Demo-Uploads/clean-lab-guide.md',
    'Demo-Uploads/RTIAD-mini/English/Labguide/Lab-1---April-2026.md',
    'Demo-Uploads/RTIAD-mini/Japanese/Labguide/Lab-1---April-2026.md']) {
    ok('Staged: ' + f, fs.existsSync(path.join(ROOT, f)));
  }
  const samp = await get('/api/demo/samples');
  try { const j = JSON.parse(samp.body); ok('Demo sample labs listed (3)', (j.samples || []).length === 3); }
  catch { ok('Demo sample labs listed (3)', false); }
  const sload = await get('/api/demo/samples?id=challenge05');
  try { const j = JSON.parse(sload.body); ok('Sample lab loads with content', !!(j.files && j.files[0] && j.files[0].content)); }
  catch { ok('Sample lab loads with content', false); }

  // 7. the engine's three demo arcs, end-to-end through /api/checkup (broken / needs-human / clean)
  const arcs = [
    { id: 'challenge05', wantMin: 1, label: 'broken guide yields findings' },
    { id: 'rtiad', wantMin: 1, label: 'translation guide yields the token-loss finding' },
    { id: 'clean', wantMax: 0, label: 'clean guide yields zero findings' },
  ];
  for (const a of arcs) {
    const det = await get('/api/demo/samples?id=' + a.id);
    let rep = null;
    try { rep = await post('/api/checkup', { files: JSON.parse(det.body).files }); } catch {}
    const n = rep ? rep.findingCount : -1;
    ok('Checkup arc: ' + a.label, rep && (a.wantMin != null ? n >= a.wantMin : n === a.wantMax), n + ' finding(s)');
  }

  // 8. Q&A knowledge base (powers /qa.html)
  const qa = await get('/api/qa');
  try { const j = JSON.parse(qa.body); ok('Q&A sheet loaded (' + (j.entries || []).length + ' answers)', (j.entries || []).length >= 40); }
  catch { ok('Q&A sheet', false); }

  // 8b. The printed sheet cannot contradict the screens: the KB's number claims must match the
  // live scan + facts.json. Any rescan/audit that changes a number turns THIS red until the KB
  // prose is updated — a red gate beats a live-demo contradiction.
  try {
    const kbText = (JSON.parse(qa.body).entries || []).map((e) => (e.a || '') + ' ' + (e.n || '')).join('\n');
    const scanJ = JSON.parse(scan.body);
    const camp = JSON.parse((await get('/api/labhealth/campaigns')).body);
    const claims = [
      ['automated tests', /(\d+) automated tests/, facts && facts.static && facts.static.tests],
      ['pull requests', /(\d+) pull requests/, facts && facts.static && facts.static.pullRequests],
      ['findings total', /found (\d+) real defects/, scanJ.available && scanJ.totals.findings],
      ['guide files', /(\d+) guide files/, scanJ.available && scanJ.totals.files],
      ['repos scanned', /scanned (\d+) real production lab repositories/, scanJ.available && scanJ.repoCount],
      ['campaigns', /into (\d+) campaigns/, camp.available && camp.stats.campaigns],
      ['top-3 coverage', /top 3 campaigns cover (\d+)%/, camp.available && camp.stats.top3CoveragePct],
    ];
    for (const [what, re, actual] of claims) {
      const m = kbText.match(re);
      if (!m || actual === false || actual == null) continue; // claim absent or source unavailable — nothing to contradict
      ok('Q&A sheet consistent: ' + what, Number(m[1]) === actual, m[1] + ' vs ' + actual);
    }
  } catch { ok('Q&A consistency check', false); }

  // 9. companion honesty path: with AI off it must fall back INSTANTLY (no hang)
  const t0 = Date.now();
  const say = await post('/api/say', { message: 'ping' });
  const ms = Date.now() - t0;
  const labst = await get('/api/labstate');
  let aiOn = false; try { aiOn = JSON.parse(labst.body).model !== 'off'; } catch {}
  if (aiOn) ok('Companion AI answers (model on)', !!(say && say.message), ms + 'ms');
  else ok('Companion falls back instantly (AI off by design)', !!say && say.message === null && ms < 3000, ms + 'ms');

  console.log('\n' + (fail === 0
    ? '✅ ALL ' + pass + ' CHECKS GREEN' + (warn ? ' (' + warn + ' advisory note(s) above)' : '') + ' — the demo is ready to show.'
    : '❌ ' + fail + ' problem(s) — fix before the demo.'));
  process.exit(fail === 0 ? 0 : 1);
})();
