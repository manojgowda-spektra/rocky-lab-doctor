// Demo readiness check — verifies every moving part the live demo depends on.
// Run via CHECK_READY.cmd (or: node check-ready.js). Exit 0 = ready.
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const ROOT = __dirname;
const LABS = 'C:/Users/ManojGowda/OneDrive - Spektra Systems LLC/Desktop/Labs';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { cond ? pass++ : fail++; console.log((cond ? ' ✓ ' : ' ✗ ') + name + (extra ? '  — ' + extra : '')); };

function get(p) {
  return new Promise((res) => {
    const rq = http.get({ host: 'localhost', port: 5173, path: p, timeout: 5000 }, (r) => {
      let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => res({ status: r.statusCode, body: s }));
    });
    rq.on('error', () => res(null)); rq.on('timeout', () => { rq.destroy(); res(null); });
  });
}

(async () => {
  console.log('\n=== ROCKY DEMO READINESS ===\n');

  // 1. server
  const home = await get('/labdoctor.html');
  ok('Server running on :5173', !!home && home.status === 200, home ? '' : 'run START_DEMO.cmd (it starts the server)');
  if (!home) { console.log('\n' + fail + ' problem(s) — start the server first, then re-run.'); process.exit(1); }

  // 2. demo pages
  for (const p of ['demo.html', 'rail.html', 'presenter.html', 'checkup.html', 'wingman.html', 'wingman-view.html', 'cloudlabs-sim.html', 'monitor.html', 'amnesty.html', 'campaigns.html', 'receipts.html', 'backstage.html']) {
    const r = await get('/' + p);
    ok('Page: ' + p, !!r && r.status === 200);
  }

  // 3. scan state (segment 07 + live example depend on this)
  const scan = await get('/api/labhealth/real-scan');
  try {
    const j = JSON.parse(scan.body);
    ok('Live-rescan available (Labs folder readable)', j.available && j.canRescan);
    ok('Scan cache at 133 findings', j.totals && j.totals.findings === 133, 'got ' + (j.totals && j.totals.findings));
    const clean = (j.repos || []).filter((r) => r.findingCount === 0).length;
    ok('3 repos clean', clean === 3, 'got ' + clean);
    const caf = (j.repos || []).find((r) => r.name === 'CAF-Infra-Security');
    ok('CAF repo not dirty (live example reverted)', caf && caf.git && !caf.git.dirty);
  } catch { ok('Scan state parse', false); }

  // 4. live-example file present + repo actually clean in git
  ok('Live-example file exists', fs.existsSync(path.join(LABS, 'CAF-Infra-Security', '00-lab-intro.md')));
  try {
    const st = execSync('git status --porcelain', { cwd: path.join(LABS, 'CAF-Infra-Security') }).toString().trim();
    ok('CAF git status clean', st === '', st ? 'DIRTY — run DEMO_REVERT_BUG.cmd' : '');
  } catch { ok('CAF git status clean', false, 'git not reachable'); }

  // 5. upload demo staging
  for (const f of ['Demo-Uploads/Challenge-05.md', 'Demo-Uploads/clean-lab-guide.md',
    'Demo-Uploads/RTIAD-mini/English/Labguide/Lab-1---April-2026.md',
    'Demo-Uploads/RTIAD-mini/Japanese/Labguide/Lab-1---April-2026.md']) {
    ok('Staged: ' + f, fs.existsSync(path.join(ROOT, f)));
  }

  // 5b. guided-demo sample labs load end-to-end
  const samp = await get('/api/demo/samples');
  try { const j = JSON.parse(samp.body); ok('Demo sample labs listed (3)', (j.samples || []).length === 3); }
  catch { ok('Demo sample labs listed (3)', false); }
  const sload = await get('/api/demo/samples?id=challenge05');
  try { const j = JSON.parse(sload.body); ok('Sample lab loads with content', !!(j.files && j.files[0] && j.files[0].content)); }
  catch { ok('Sample lab loads with content', false); }

  // 6. checkup endpoint really scans (round-trip with a known-bad line)
  const chk = await new Promise((res) => {
    const b = JSON.stringify({ files: [{ path: 'g.md', content: 'deploy text-embedding-ada-002 today\n' }] });
    const rq = http.request({ host: 'localhost', port: 5173, path: '/api/checkup', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, (r) => {
      let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => { try { res(JSON.parse(s)); } catch { res(null); } });
    });
    rq.on('error', () => res(null)); rq.end(b);
  });
  ok('Checkup scan round-trip finds a planted token', !!chk && chk.findingCount === 1);

  // 7. wingman
  const wi = await get('/api/wingman/info');
  try {
    const j = JSON.parse(wi.body);
    ok('Wingman KB loaded (' + j.kbEntries + ' answers)', j.kbEntries >= 40);
    ok('Phone URL available', (j.phoneUrls || []).length > 0, (j.phoneUrls || [])[0] || 'no LAN address — use second monitor');
  } catch { ok('Wingman info', false); }

  // 8. AI chat correctly OFF (evidence card must be instant)
  const say = await new Promise((res) => {
    const b = JSON.stringify({ message: 'ping' }); const t0 = Date.now();
    const rq = http.request({ host: 'localhost', port: 5173, path: '/api/say', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, (r) => {
      let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => { try { res({ ms: Date.now() - t0, j: JSON.parse(s) }); } catch { res(null); } });
    });
    rq.on('error', () => res(null)); rq.end(b);
  });
  ok('Companion falls back instantly (AI off by design)', !!say && say.j && say.j.message === null && say.ms < 3000, say ? say.ms + 'ms' : '');

  console.log('\n' + (fail === 0 ? '✅ ALL ' + pass + ' CHECKS GREEN — the demo is ready to show.' : '❌ ' + fail + ' problem(s) — fix before the demo.'));
  process.exit(fail === 0 ? 0 : 1);
})();
