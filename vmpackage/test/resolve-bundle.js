/*
 * resolve-bundle.js — offline audit of a step bundle against the anchor engine.
 *
 * Two questions this answers WITHOUT a portal, a tenant or a login:
 *   1. Is every step well formed — does it carry selectors the engine can actually score?
 *   2. Could any step's selector set clear MIN_SCORE on its own evidence, or is it so thin
 *      that it can only ever resolve by luck?
 *
 * It does NOT claim a step will resolve on the live portal: only a run against the real
 * page can say that (that is gate G1/G2 in the plan). What it does catch, in one second,
 * is the whole class of authoring mistakes that would otherwise surface in front of a
 * learner: a step with no selectors, a selector of only `role`, a blacklisted volatile id,
 * a vision step with no template, a missing urlPattern.
 *
 * Usage: node test/resolve-bundle.js [bundle.json ...]
 */
'use strict';
const fs = require('fs');
const path = require('path');

// The engine is a browser IIFE that assigns window.LabPilotAnchor; give it a window.
const ROOT = path.join(__dirname, '..');
function loadEngine() {
  const src = fs.readFileSync(path.join(ROOT, 'webext', 'content', 'anchor-engine.js'), 'utf8');
  const sandbox = { window: {}, document: undefined, console };
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'console', src)(sandbox.window, undefined, console);
  if (!sandbox.window.LabPilotAnchor) throw new Error('anchor-engine.js did not expose LabPilotAnchor');
  return sandbox.window.LabPilotAnchor;
}

// Mirrors the engine's own weights so we can judge a selector's ceiling without a DOM.
const W = {
  id: 1.0, dataAttrs: 0.9, fieldLabel: 0.85, imgAlt: 0.85, childText: 0.85,
  ariaLabel: 0.7, placeholder: 0.7, hrefSuffix: 0.7, text: 0.6, href: 0.5,
  domPath: 0.4, role: 0.2,
};
const MIN_SCORE = 0.7;
const UNSTABLE_ID = /(_r_[a-z0-9]+_)|(:r[a-z0-9]+:)|^fui-/i;
const NON_SCORING = new Set(['scope', 'urlPattern', 'inLandmark', 'state', 'disabled']);

function ceiling(attrs) {
  let s = 0;
  for (const k of Object.keys(attrs)) {
    if (NON_SCORING.has(k)) continue;
    if (W[k] !== undefined) s += W[k];
  }
  return Math.round(s * 100) / 100;
}

function auditStep(step, ctx, out) {
  const id = step.id || '(no id)';
  const where = `${ctx} ${id}`;
  const targets = step.targets || (step.target ? [step.target] : []);

  if (!step.text) out.warn.push(`${where}: no instruction text`);
  if (!targets.length) { out.fail.push(`${where}: no targets — nothing to point at`); return; }

  if (step.surface === 'vision') {
    // The matcher reads attrs.templateId and looks the crop up in vision-templates/.
    // A declared-but-absent PNG is not fatal at runtime (the step shows its card), but it
    // means the step can never glow, so the operator must know before the demo.
    const tmplDir = path.join(ROOT, 'webext', 'vision-templates');
    const manifest = path.join(tmplDir, 'manifest.json');
    let listed = [];
    if (fs.existsSync(manifest)) listed = JSON.parse(fs.readFileSync(manifest, 'utf8')).templates || [];
    const wanted = targets.flatMap((t) => (t.selectors || [])
      .filter((s) => s.strategy === 'vision')
      .map((s) => (s.attrs || {}).templateId));
    if (!wanted.length) { out.fail.push(`${where}: surface=vision but no vision selector`); return; }
    for (const w of wanted) {
      if (!w) { out.fail.push(`${where}: vision selector has no templateId`); continue; }
      const entry = listed.find((t) => t.id === w);
      if (!entry) { out.fail.push(`${where}: templateId '${w}' is not in vision-templates/manifest.json`); continue; }
      const png = path.join(tmplDir, entry.file);
      if (!fs.existsSync(png)) out.warn.push(`${where}: template '${w}' is declared but ${entry.file} is missing — this step will show its card and never glow`);
      else out.ok.push(`${where}: vision template '${w}' present (${entry.file})`);
    }
    return;
  }

  let best = 0;
  let n = 0;
  for (const t of targets) {
    for (const sel of t.selectors || []) {
      if (sel.strategy && sel.strategy !== 'dom') continue;
      const attrs = sel.attrs || {};
      n++;
      const c = ceiling(attrs);
      if (c > best) best = c;
      if (attrs.id && UNSTABLE_ID.test(attrs.id)) out.fail.push(`${where}: selector uses a volatile id '${attrs.id}' (engine blacklists these)`);
      const scoring = Object.keys(attrs).filter((k) => !NON_SCORING.has(k) && W[k] !== undefined);
      if (scoring.length === 1 && scoring[0] === 'role') out.fail.push(`${where}: selector is role-only — can never resolve`);
      if (!attrs.urlPattern) out.warn.push(`${where}: selector has no urlPattern — not gated to a screen`);
    }
  }
  if (!n) { out.fail.push(`${where}: no dom selector`); return; }
  if (best < MIN_SCORE) out.fail.push(`${where}: best selector tops out at ${best} < MIN_SCORE ${MIN_SCORE} — cannot clear the floor`);
  else out.ok.push(`${where}: ${n} selector(s), best ceiling ${best}`);
}

function auditBundle(file, A) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  const out = { ok: [], warn: [], fail: [] };
  let steps = 0;
  for (const lab of b.labs || []) {
    for (const task of lab.tasks || []) {
      for (const step of task.steps || []) { steps++; auditStep(step, `${task.id}/`, out); }
    }
  }
  return { title: b.title, steps, out };
}

// The engine must also agree with the contract the extension advertises.
function auditEngine(A) {
  const problems = [];
  const r1 = A.resolve ? 'function' : 'missing';
  if (r1 !== 'function') problems.push('engine exposes no resolve()');
  return problems;
}

function main() {
  const A = loadEngine();
  const files = process.argv.slice(2).length
    ? process.argv.slice(2)
    : fs.readdirSync(path.join(ROOT, 'webext', 'bundle')).filter((f) => f.endsWith('.json')).map((f) => path.join(ROOT, 'webext', 'bundle', f));

  const eng = auditEngine(A);
  eng.forEach((p) => console.log(`  [FAIL] engine: ${p}`));

  let failed = eng.length;
  for (const f of files) {
    const r = auditBundle(f, A);
    console.log(`\n=== ${path.basename(f)} — ${r.title} (${r.steps} steps) ===`);
    r.out.ok.forEach((m) => console.log(`  [ok]   ${m}`));
    r.out.warn.forEach((m) => console.log(`  [warn] ${m}`));
    r.out.fail.forEach((m) => console.log(`  [FAIL] ${m}`));
    console.log(`  -- ${r.out.ok.length} ok, ${r.out.warn.length} warning(s), ${r.out.fail.length} failure(s)`);
    failed += r.out.fail.length;
  }
  console.log('');
  if (failed) { console.log(`${failed} FAILURE(S) — fix the bundle before shipping.`); process.exit(1); }
  console.log('Bundle audit clean. (Live resolution still has to be proven on the real portal.)');
}

main();
