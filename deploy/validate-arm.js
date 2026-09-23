/*
 * validate-arm.js — catch the ARM mistakes that otherwise cost a 30-minute deploy cycle.
 *
 * Not a full ARM evaluator. It checks the things that actually break a CloudLabs lab:
 *   - every parameters() / variables() reference exists
 *   - every parameter the template declares is supplied by the parameters file, and no extras
 *   - the outputs CloudLabs' VM Configuration reads are all present
 *   - exactly one Custom Script Extension (Azure allows one per VM)
 *   - no secret is passed to Rocky's command line (CloudLabs logs commandToExecute)
 *   - every dependsOn names a resource the template declares
 *
 * Usage: node validate-arm.js [template.json] [parameters.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const tplPath = process.argv[2] || path.join(__dirname, 'deploy-01.json');
const parPath = process.argv[3] || path.join(__dirname, 'deploy-01.parameters.json');

const fails = [];
const warns = [];
const oks = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const ok = (m) => oks.push(m);

let tpl; let par;
try { tpl = JSON.parse(fs.readFileSync(tplPath, 'utf8')); ok(`template parses: ${path.basename(tplPath)}`); }
catch (e) { console.log(`[FAIL] template is not valid JSON: ${e.message}`); process.exit(1); }
try { par = JSON.parse(fs.readFileSync(parPath, 'utf8')); ok(`parameters parse: ${path.basename(parPath)}`); }
catch (e) { console.log(`[FAIL] parameters file is not valid JSON: ${e.message}`); process.exit(1); }

const text = JSON.stringify(tpl);
const declaredParams = Object.keys(tpl.parameters || {});
const declaredVars = Object.keys(tpl.variables || {});
const suppliedParams = Object.keys(par.parameters || {});

// ---- references resolve ---------------------------------------------------------------
const usedParams = new Set([...text.matchAll(/parameters\('([^']+)'\)/g)].map((m) => m[1]));
const usedVars = new Set([...text.matchAll(/variables\('([^']+)'\)/g)].map((m) => m[1]));
for (const p of usedParams) if (!declaredParams.includes(p)) fail(`parameters('${p}') is used but never declared`);
for (const v of usedVars) if (!declaredVars.includes(v)) fail(`variables('${v}') is used but never declared`);
for (const p of declaredParams) if (!usedParams.has(p)) warn(`parameter '${p}' is declared but never used`);
if (!fails.length) ok(`${usedParams.size} parameter and ${usedVars.size} variable references all resolve`);

// ---- the parameters file matches the template -------------------------------------------
for (const p of declaredParams) {
  const hasDefault = tpl.parameters[p].defaultValue !== undefined;
  if (!suppliedParams.includes(p) && !hasDefault) fail(`parameter '${p}' has no default and is not in the parameters file`);
}
for (const p of suppliedParams) if (!declaredParams.includes(p)) fail(`parameters file supplies '${p}', which the template does not declare`);
if (!fails.length) ok(`parameters file matches the template (${suppliedParams.length} supplied)`);

// ---- outputs CloudLabs' VM Configuration reads -------------------------------------------
const REQUIRED_OUTPUTS = ['vmServerDnsName', 'vmServerUsername', 'vmServerPassword', 'labVmName'];
const outputs = Object.keys(tpl.outputs || {});
const missingOut = REQUIRED_OUTPUTS.filter((o) => !outputs.includes(o));
if (missingOut.length) fail(`VM Configuration needs these outputs: ${missingOut.join(', ')}`);
else ok(`all VM Configuration outputs present (${outputs.length} total)`);

// ---- resources ---------------------------------------------------------------------------
const resources = tpl.resources || [];
const names = new Set();
for (const r of resources) {
  names.add(`${r.type}/${r.name}`);
}
const cse = resources.filter((r) => (r.properties || {}).type === 'CustomScriptExtension');
if (cse.length === 0) warn('no Custom Script Extension — Rocky will not be installed');
else if (cse.length > 1) fail(`${cse.length} Custom Script Extensions — Azure allows exactly one per VM`);
else ok('exactly one Custom Script Extension');

// dependsOn must point at something the template declares
for (const r of resources) {
  for (const d of r.dependsOn || []) {
    const m = /resourceId\('([^']+)',\s*(.+)\)/.exec(d);
    if (!m) { warn(`dependsOn not understood on ${r.name}: ${d}`); continue; }
    const type = m[1];
    if (![...resources].some((x) => x.type === type)) fail(`${r.name} dependsOn a '${type}' that the template does not declare`);
  }
}

// ---- the secrets rule ----------------------------------------------------------------------
// CloudLabs records commandToExecute in the deployment history, so anything on Rocky's
// command line is effectively logged. Identifiers only.
if (cse.length === 1) {
  const cmd = ((cse[0].properties || {}).protectedSettings || {}).commandToExecute || '';
  const SECRET_PARAMS = declaredParams.filter((p) => (tpl.parameters[p].type || '').toLowerCase() === 'securestring');
  const leaked = SECRET_PARAMS.filter((p) => cmd.includes(`parameters('${p}')`));
  if (leaked.length) fail(`secure parameter(s) passed on the Rocky command line (CloudLabs logs it): ${leaked.join(', ')}`);
  else ok(`no securestring on the command line (${SECRET_PARAMS.length} secure params kept off it)`);

  for (const u of ['rockyBootstrapUrl', 'rockyPackageUrl']) {
    if (!JSON.stringify(cse[0].properties.settings.fileUris).includes(u)) fail(`CSE fileUris does not include ${u}`);
  }
  if (!cmd.includes('rocky-bootstrap.ps1')) fail('CSE does not run rocky-bootstrap.ps1');
  else ok('CSE runs the Rocky bootstrap with the staged package');
}

// ---- placeholders left in the parameters file -------------------------------------------
for (const [k, v] of Object.entries(par.parameters || {})) {
  const val = String((v || {}).value ?? '');
  if (/REPLACE-WITH/i.test(val)) warn(`parameters: '${k}' still has a placeholder — set it before deploying`);
}

// ---- report ---------------------------------------------------------------------------------
console.log('\n=== ARM VALIDATION ===');
oks.forEach((m) => console.log(`  [ok]   ${m}`));
warns.forEach((m) => console.log(`  [warn] ${m}`));
fails.forEach((m) => console.log(`  [FAIL] ${m}`));
console.log(`\n${oks.length} ok, ${warns.length} warning(s), ${fails.length} failure(s)\n`);
process.exit(fails.length ? 1 : 0);
