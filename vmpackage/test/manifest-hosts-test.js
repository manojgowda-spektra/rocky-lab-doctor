/*
 * manifest-hosts-test.js — the manifest must cover the hosts real labs actually send people to.
 *
 * THE BUG THIS PINS. Rocky was not injected on purview.microsoft.com. That was fixed. Then he
 * was not injected on ml.azure.com. Both were found by a person opening a live lab and noticing
 * he was absent — never by a gate.
 *
 * source-integrity-test.js does check the manifest, but against FOUR HARDCODED HOSTS, written
 * the day the Purview gap was found. ml.azure.com was never added to it, so the second outage
 * was as invisible to that gate as the first. A list maintained by hand is only ever as current
 * as the last incident.
 *
 * This gate derives the list instead, from the lab guides a learner is actually given:
 *   C:\AI-Testing-Workspace\Cosmos-Labs\**\Lab Guide\**\*.md
 * If a guide tells someone to go somewhere, Rocky has to work there. Add a lab, and the gate
 * updates itself.
 *
 * ON MATCH-PATTERN SEMANTICS. Substring matching is not good enough and was its own latent bug:
 * `matches.join(' ').indexOf('purview.microsoft.com')` is satisfied by
 * "https://*.purview.microsoft.com/*" alone — which does NOT match the bare host
 * purview.microsoft.com, the very host that was missing. This file implements the real MV3
 * rule: in a host pattern, `*.` matches any number of leading subdomain labels but NOT the
 * bare domain, and a bare `*` matches any host.
 *
 * ALL THREE LISTS MATTER. content_scripts.matches decides whether Rocky loads at all;
 * web_accessible_resources.matches decides whether he can read lab.json, ai.json and the
 * knowledge base once loaded; host_permissions decides whether he may act. A host present in
 * the first but missing from the second gives the worst symptom of the three: Rocky appears,
 * but has forgotten which lab he is in.
 *
 * DOCUMENTATION HOSTS ARE EXCLUDED. learn.microsoft.com is the most linked host in every guide
 * and is never a lab surface — a learner reads it, they do not do the lab on it. Injecting
 * there would be noise, so it is listed as a deliberate exclusion rather than silently dropped.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const PKG = path.join(__dirname, '..');
const GUIDES = path.join('C:', 'AI-Testing-Workspace', 'Cosmos-Labs');

let pass = 0; const fails = [];
function check(name, fn) {
  try { fn(); console.log(`  [ok]   ${name}`); pass++; }
  catch (e) { console.log(`  [FAIL] ${name}`); console.log(`         ${e.message}`); fails.push(name); }
}
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }

// Hosts a guide links but that are not lab surfaces. Each needs a reason: an exclusion without
// one is how a real gap gets quietly waved through.
const NOT_A_LAB_SURFACE = {
  'learn.microsoft.com': 'documentation a learner reads, never a portal they work in',
  'cloudlabs.ai': 'the marketing site and /labs-support contact page; the lab itself runs on ' +
                  'experience.cloudlabs.ai, which IS covered',
  'go.microsoft.com': 'a redirector',
  'aka.ms': 'a redirector',
  'github.com': 'where assets are downloaded from, not where the lab happens',
  'raw.githubusercontent.com': 'asset downloads',
  'www.w3.org': 'XML namespaces in document markup, not a destination',
  'schemas.microsoft.com': 'XML namespaces, not a destination',
};

// ---- collect the hosts real guides send a learner to ------------------------------------------
function findGuides(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findGuides(p, out);
    else if (/\.md$/i.test(e.name) && /[\\/]lab guide[\\/]/i.test(p)) out.push(p);
  }
  return out;
}

const guideFiles = findGuides(GUIDES, []);

console.log('\n=== THE MANIFEST vs WHAT LABS ACTUALLY VISIT ===\n');

check('the lab guides are readable', () => {
  // If the guides move, this gate stops deriving anything and would pass vacuously. Fail
  // loudly instead: a gate that silently checks nothing is the thing this whole file is about.
  assert(guideFiles.length > 0,
    `no lab guides found under ${GUIDES} — this gate would otherwise pass while checking nothing`);
});

const hostCounts = new Map();
for (const f of guideFiles) {
  const text = fs.readFileSync(f, 'utf8');
  const re = /https:\/\/([a-z0-9.-]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    // Trailing punctuation: guides write "...on https://purview.microsoft.com." all the time.
    const host = m[1].toLowerCase().replace(/[.,;:)\]]+$/, '');
    if (!host || !host.includes('.')) continue;
    hostCounts.set(host, (hostCounts.get(host) || 0) + 1);
  }
}

const labHosts = [...hostCounts.keys()].filter((h) => !NOT_A_LAB_SURFACE[h]).sort();
const excluded = [...hostCounts.keys()].filter((h) => NOT_A_LAB_SURFACE[h]).sort();

console.log(`  ${guideFiles.length} lab guide files`);
console.log(`  lab surfaces:  ${labHosts.join(', ') || '(none)'}`);
for (const h of excluded) console.log(`  excluded:      ${h} — ${NOT_A_LAB_SURFACE[h]}`);
console.log('');

// ---- the real MV3 match-pattern rule ----------------------------------------------------------
// <scheme>://<host><path>, where host is "*", "*.domain", or an exact host. Crucially "*.foo.com"
// matches bar.foo.com and a.b.foo.com but NOT foo.com itself.
function patternCoversHost(pattern, host) {
  const m = /^(\*|https?):\/\/([^/]+)(\/.*)?$/.exec(pattern);
  if (!m) return false;
  const pHost = m[2].toLowerCase();
  if (pHost === '*') return true;
  if (pHost.startsWith('*.')) {
    const base = pHost.slice(2);
    return host.endsWith('.' + base);          // deliberately NOT host === base
  }
  return host === pHost;
}
const anyCovers = (patterns, host) => patterns.some((p) => patternCoversHost(p, host));

const manifest = JSON.parse(fs.readFileSync(path.join(PKG, 'webext', 'manifest.json'), 'utf8'));
const csMatches = manifest.content_scripts[0].matches || [];
const warMatches = (manifest.web_accessible_resources || []).flatMap((w) => w.matches || []);
const hostPerms = manifest.host_permissions || [];

// Self-check the matcher, so a bug in it cannot make this whole gate pass vacuously. These are
// the semantics the hand-written substring check got wrong.
check('the match-pattern matcher itself is correct', () => {
  assert(patternCoversHost('https://purview.microsoft.com/*', 'purview.microsoft.com'), 'exact host should match');
  assert(!patternCoversHost('https://*.purview.microsoft.com/*', 'purview.microsoft.com'),
    '*.foo.com must NOT match the bare foo.com — this is exactly the gap that shipped');
  assert(patternCoversHost('https://*.purview.microsoft.com/*', 'eu.purview.microsoft.com'), 'subdomain should match');
  assert(patternCoversHost('https://*.microsoft.com/*', 'purview.microsoft.com'), 'wildcard should cover a subdomain');
  assert(!patternCoversHost('https://*.microsoft.com/*', 'microsoft.com'), 'and not the bare domain');
  assert(patternCoversHost('https://*.office.com/*', 'www.office.com'), 'www is an ordinary subdomain');
});

check('Rocky is injected on every host a lab guide sends a learner to', () => {
  const missing = labHosts.filter((h) => !anyCovers(csMatches, h));
  assert(missing.length === 0,
    `content_scripts.matches does not cover: ${missing.join(', ')}\n` +
    '         Rocky would simply be absent there, which looks like a broken product.');
});

check('and he can read his own resources on all of them', () => {
  // The worse failure of the two: he loads, but lab.json and the knowledge base are unreadable,
  // so he has forgotten which lab he is in.
  const missing = labHosts.filter((h) => !anyCovers(warMatches, h));
  assert(missing.length === 0,
    `web_accessible_resources.matches does not cover: ${missing.join(', ')}\n` +
    '         Rocky would load there but could not read lab.json, ai.json or the knowledge base.');
});

check('and he is permitted to act on all of them', () => {
  const missing = labHosts.filter((h) => !anyCovers(hostPerms, h));
  assert(missing.length === 0, `host_permissions does not cover: ${missing.join(', ')}`);
});

check('every injected host can also read the extension resources', () => {
  // Independent of the guides: any pattern in content_scripts with no counterpart in
  // web_accessible_resources produces the same "loaded but amnesiac" symptom.
  const notShared = csMatches.filter((p) => !warMatches.includes(p));
  assert(notShared.length === 0,
    `injected but cannot read its own resources on: ${notShared.join(', ')}`);
});

check('the hosts named in past outages are still covered', () => {
  // Belt and braces. These two cost a live lab each; they must never regress even if a guide
  // stops mentioning them.
  const REGRESSIONS = ['purview.microsoft.com', 'ml.azure.com'];
  const missing = REGRESSIONS.filter((h) => !anyCovers(csMatches, h) || !anyCovers(warMatches, h));
  assert(missing.length === 0, `a host from a past outage is no longer covered: ${missing.join(', ')}`);
});

console.log('');
if (fails.length) { console.log(`${pass} passed, ${fails.length} FAILED\n`); process.exit(1); }
console.log(`${pass} passed, 0 failed — Rocky works everywhere a lab guide sends a learner.\n`);
