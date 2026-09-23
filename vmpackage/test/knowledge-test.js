/*
 * knowledge-test.js — does Rocky actually answer CloudLabs questions correctly?
 *
 * An index that is fast and small but returns the wrong page is worse than no index: it
 * makes Rocky confidently unhelpful. So this asks the questions a learner or an admin
 * actually asks, in their own words, and checks the page that comes back is the right one.
 *
 * It also checks the refusals, which matter just as much: a question the corpus cannot
 * answer must return nothing rather than the least-bad match.
 *
 * Runs the shipped retrieval code against the shipped index.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const EXT = path.join(__dirname, '..', 'webext');
const KB_PATH = path.join(EXT, 'knowledge', 'cloudlabs-kb.json');

if (!fs.existsSync(KB_PATH)) {
  console.log('\n[FAIL] no knowledge index. Build it first:  node tools/build-knowledge.js\n');
  process.exit(1);
}

// Load the shipped retrieval module in a fake window, with fetch wired to the real file, so
// this tests the code that ships rather than a reimplementation of it.
function loadModule() {
  const code = fs.readFileSync(path.join(EXT, 'content', 'cloudlabs-kb.js'), 'utf8');
  const kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  const win = {};
  const chrome = { runtime: { getURL: (p) => p } };
  const fetchImpl = (p) => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(p.includes('-full') ? JSON.parse(fs.readFileSync(KB_PATH.replace('.json', '-full.json'), 'utf8')) : kb),
  });
  new Function('window', 'chrome', 'fetch', code)(win, chrome, fetchImpl);
  return win.LabPilotCloudLabs;
}

const CL = loadModule();

// The index loads asynchronously; wait for it before asking anything.
function ready() {
  return new Promise((resolve) => CL.ready(resolve));
}

// Real questions, in the words people use. `want` is a regex the winning page's title or
// heading must match — deliberately loose, because there is often more than one right page.
const QUESTIONS = [
  // --- core concepts an admin or learner asks about ---
  { q: 'what is an ODL',                          want: /on.?demand lab|odl/i },
  { q: 'what is a template in cloudlabs',         want: /template/i },
  { q: 'how do I add an azure template',          want: /azure template|adding.*template/i },
  { q: 'what is a hot instance',                  want: /hot instance/i },
  { q: 'how do lab validations work',             want: /validat/i },
  { q: 'how do I author a lab guide',             want: /lab guide|authoring/i },

  // --- the things that go wrong, which is most of what Rocky will be asked ---
  { q: 'copy paste not working in the lab VM',    want: /copy.?paste|clipboard/i },
  { q: 'cannot connect to the lab virtual machine', want: /rdp|connect|virtual machine|websocket/i },
  { q: 'cloud shell will not launch',             want: /cloud shell/i },
  { q: 'I never received the lab email',          want: /email|junk|spam|safe sender/i },

  // --- operations ---
  { q: 'how do I extend the lab duration',        want: /duration|extend|expiry|time/i },
  { q: 'how is quota planned for labs',           want: /quota|capacity/i },
];

// Questions the corpus genuinely cannot answer. Returning a page here would be a
// hallucination by retrieval rather than by a model - equally damaging.
const SHOULD_REFUSE = [
  'what is the capital of France',
  'write me a poem about kubernetes',
  'what is my bank balance',
];

(async function main() {
  const ok = await ready();
  if (!ok) { console.log('\n[FAIL] the index did not load\n'); process.exit(1); }

  const stats = CL.stats();
  console.log('\n=== CAN ROCKY ANSWER CLOUDLABS QUESTIONS? ===\n');
  console.log(`index: ${stats.sections} sections, ${stats.terms} terms, built ${stats.built.slice(0, 10)}`);
  console.log(`sources: ${JSON.stringify(stats.sources)}\n`);

  let pass = 0; const fails = [];

  for (const c of QUESTIONS) {
    const a = CL.answer(c.q);
    if (!a) { fails.push(`"${c.q}" -> no answer at all`); console.log(`  [FAIL] "${c.q}"`); console.log('         returned nothing'); continue; }
    const subject = `${a.title || ''} ${a.heading || ''}`;
    // An ambiguous answer is acceptable if one of the offered pages is right.
    const hay = a.ambiguous ? a.hits.map((h) => h.title + ' ' + h.heading).join(' ') : subject;
    if (c.want.test(hay)) {
      pass++;
      const label = a.ambiguous ? '(offered a choice) ' : '';
      console.log(`  [ok]   "${c.q}"`);
      console.log(`         -> ${label}${subject.trim().slice(0, 78)}${a.kind === 'issue' ? '   [resolved issue]' : ''}`);
    } else {
      fails.push(`"${c.q}" -> got "${subject.trim().slice(0, 60)}"`);
      console.log(`  [FAIL] "${c.q}"`);
      console.log(`         got: ${subject.trim().slice(0, 78)}`);
      console.log(`         expected something matching ${c.want}`);
    }
  }

  console.log('');
  console.log('--- must refuse rather than guess ---');
  for (const q of SHOULD_REFUSE) {
    const a = CL.answer(q);
    if (!a) { pass++; console.log(`  [ok]   "${q}" -> correctly no answer`); }
    else {
      fails.push(`"${q}" -> invented an answer: "${(a.title || '').slice(0, 50)}"`);
      console.log(`  [FAIL] "${q}" -> returned "${(a.title || '').slice(0, 50)}" (score ${a.score && a.score.toFixed(1)})`);
    }
  }

  // Every answer must be attributable. An answer with no title is unquotable, and an
  // unquotable answer is indistinguishable from an invented one.
  console.log('');
  console.log('--- every answer must name its source ---');
  const a = CL.answer('what is an ODL');
  if (a && a.title) { pass++; console.log(`  [ok]   answers carry a title (${a.source || 'no source'}${a.url ? ', linkable' : ''})`); }
  else { fails.push('answers do not carry a title'); console.log('  [FAIL] an answer arrived with no title'); }

  console.log('');
  if (fails.length) {
    console.log(`${pass} passed, ${fails.length} FAILED\n`);
    fails.forEach((f) => console.log(`  - ${f}`));
    console.log('');
    process.exit(1);
  }
  console.log(`${pass} passed, 0 failed — Rocky answers from the documentation, and refuses when it does not cover the question.\n`);
})();
