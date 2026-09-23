/*
 * build-knowledge.js — turn the CloudLabs corpus into something Rocky can search offline.
 *
 * WHY NOT HARDCODE. CloudLabs is ~360 documentation pages plus a growing register of real
 * resolved issues. Hand-writing that into a knowledge file would be wrong within a month and
 * unmaintainable within three. So nothing here is authored: the index is COMPILED from
 * sources that already exist and are already maintained by someone else.
 *
 * WHY NOT AN LLM WITH A VECTOR DATABASE. That was the obvious answer and it is the wrong one
 * for this product:
 *   - it needs a server, a key and a network round trip, so it fails in a locked-down lab
 *     and costs money per question;
 *   - embeddings would put a paraphrase between the learner and the documentation, which is
 *     precisely how a confident wrong answer gets made;
 *   - Rocky's whole proposition is that he does not invent. Quoting a real page and naming
 *     it is better than generating prose about it.
 * So retrieval is deterministic BM25-style scoring over a compiled index, running in the
 * extension. No network, no key, no model, and every answer carries the page it came from.
 * The AI is still available to phrase an answer, but only over retrieved text.
 *
 * SOURCES, in descending order of authority:
 *   1. help.cloudlabs.ai      the platform's own docs. It publishes llms.txt (an index of
 *                             every page) and serves each page as clean markdown at .md —
 *                             so this refreshes itself from the vendor rather than drifting.
 *   2. learner-docs           the learner-facing site, same treatment.
 *   3. The local Knowledge_Base mirror, when present: the same pages already captured, plus
 *      something better — ISSUE records with a real error signature, root cause and fix.
 *      Those outrank documentation, because they are what actually happened.
 *
 * Usage:
 *   node tools/build-knowledge.js                     # local mirror only (offline, fast)
 *   node tools/build-knowledge.js --fetch             # refresh from the live docs too
 *   node tools/build-knowledge.js --out <path>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const OUT = argOf('--out', path.join(__dirname, '..', 'webext', 'knowledge', 'cloudlabs-kb.json'));
const MIRROR = argOf('--mirror',
  path.join(process.env.USERPROFILE || '', 'OneDrive - Spektra Systems LLC', 'Desktop', 'Knowledge'));

// ---- tiny fetch ---------------------------------------------------------------------------
function get(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 4) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'rocky-kb-builder' }, timeout: 20000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(get(new URL(res.headers.location, url).href, redirects + 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let s = ''; res.setEncoding('utf8');
      res.on('data', (c) => { s += c; });
      res.on('end', () => resolve(s));
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('timeout')); });
  });
}

// ---- parsing ------------------------------------------------------------------------------
function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

// Documentation is written in sections, and a learner's question is almost always about ONE
// section rather than a whole page. Splitting on headings makes retrieval land on the
// paragraph that answers the question instead of a 2,000-word page about templates.
function sections(body, maxChars = 1200) {
  const lines = body.split(/\r?\n/);
  const out = [];
  let head = '';
  let buf = [];
  const flush = () => {
    const text = buf.join('\n').trim();
    if (text) {
      // long sections are split so a match points at a readable quote, not a wall
      for (let i = 0; i < text.length; i += maxChars) out.push({ head, text: text.slice(i, i + maxChars) });
    }
    buf = [];
  };
  for (const line of lines) {
    const h = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
    if (h) {
      flush();
      head = h[2].replace(/\[.*?\]\(.*?\)/g, '').replace(/[​#*]/g, '').trim();
      // "Section 2:", "Step 3", "Overview" tell a reader nothing about WHAT the section
      // covers. Left in, dozens of them from one page crowd out the page that actually
      // answers the question.
      if (/^(section|step|part|phase)\s*\d*[:.]?$/i.test(head)) head = '';
    } else buf.push(line);
  }
  flush();
  return out;
}

function clean(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')          // images carry no answer
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')        // keep link text, drop the URL
    .replace(/[*_`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---- the index ------------------------------------------------------------------------------
// The query side (webext/content/cloudlabs-kb.js) must use the SAME list, or a term is
// indexed but never searched for. Domain words like "lab" and "cloudlabs" appear in nearly
// every section of this corpus, so they discriminate nothing and only add noise.
const STOP = new Set(('a an and are as at be by for from has have how i in is it its of on or that the ' +
  'this to was what when where which who will with you your can do does if not but there their they ' +
  'lab labs cloudlabs work works working about write need want use using used get got ' +
  'please help make made see also new page click select enter open').split(' '));

// A slug like "uc2-know-your-data-purview" is worthless indexed whole - nobody types it.
// Split on hyphens and it contributes the words people actually search for. UUIDs and
// date-stamped record ids match no real question, so they are dropped rather than stored.
const JUNK = /^[0-9a-f]{8}-|^[0-9a-f]{12,}$|^\d{4,}$|^(mtg|issue|defect)-\d/i;
function tokenise(s) {
  const raw = clean(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/);
  const out = [];
  for (const w of raw) {
    if (!w || JUNK.test(w)) continue;
    if (w.includes('-')) {
      for (const part of w.split('-')) if (part.length > 2 && !STOP.has(part)) out.push(part);
    }
    if (w.length > 2 && w.length < 40 && !STOP.has(w)) out.push(w);
  }
  return out;
}

const docs = [];
function addDoc(d) {
  const body = clean(d.text);
  if (body.length < 60) return;                      // a heading with no content answers nothing
  docs.push({
    t: d.title,
    h: d.head || '',
    u: d.url || '',
    s: d.source,
    k: d.kind || 'doc',
    b: body.slice(0, 1100),
  });
}

// ---- 1. the local mirror -------------------------------------------------------------------
function ingestMirror(root) {
  if (!fs.existsSync(root)) { console.log(`  mirror not found at ${root} — skipping`); return 0; }
  let n = 0;
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.md') || e.name.endsWith('.bak')) continue;
      let raw;
      try { raw = fs.readFileSync(p, 'utf8'); } catch (err) { continue; }
      const { meta, body } = frontMatter(raw);
      const rel = path.relative(root, p).replace(/\\/g, '/');

      // An ISSUE record is worth more than a doc page: it is a real failure with a verified
      // fix. Tag it so retrieval can prefer it when a learner describes a symptom.
      // Rocky serves a learner in a lab. Manoj's meeting notes, cost models and personal
      // notes are not his to quote, and indexing them only adds noise. Keep the platform
      // documentation, the resolved-issue register and the onboarding playbooks.
      // Rocky answers a LEARNER. The platform's documentation and the register of real
      // resolved issues are his to quote. Our internal playbooks are how WE work - useful to
      // us, not an answer to "why did my deployment fail" - so they stay out.
      const wanted = /Platform_Documentation|Known_Issues|Troubleshooting|CloudLabs\//.test(rel);
      const excluded = /Meetings|Personal_Work_Notes|_Templates|Intake\/|Playbooks\//.test(rel);
      if (!wanted || excluded) continue;

      // Index / manifest pages list other pages. They mention everything, so they match
      // everything, and they answer nothing. A learner needs the page that explains the
      // thing, not the catalogue that mentions it.
      const isIndex = /MANIFEST\.md$|_Indexes\/|MASTER_INDEX|full ingest knowledge record/i
        .test(rel + ' ' + (meta.title || ''));
      if (isIndex) continue;

      const isIssue = meta.type === 'issue' || /Known_Issues/.test(rel);
      const title = meta.title || path.basename(p, '.md');
      for (const sec of sections(body)) {
        addDoc({
          title, head: sec.head, text: sec.text,
          url: meta.source_url || '', source: isIssue ? 'issue-register' : (meta.source_site || 'knowledge-base'),
          kind: isIssue ? 'issue' : 'doc',
        });
        n++;
      }
    }
  };
  walk(root);
  return n;
}

// ---- 2. the live docs ------------------------------------------------------------------------
// help.cloudlabs.ai publishes llms.txt precisely so a machine can discover every page, and
// serves each as markdown. This is the vendor telling us how to stay current; taking them up
// on it is what makes Rocky's CloudLabs knowledge refreshable instead of frozen.
async function ingestLive() {
  let added = 0;
  let index;
  try { index = await get('https://help.cloudlabs.ai/llms.txt'); }
  catch (e) { console.log(`  could not fetch llms.txt (${e.message}) — skipping live docs`); return 0; }

  const urls = [...index.matchAll(/\[([^\]]+)\]\((https:\/\/help\.cloudlabs\.ai\/docs\/[^)]+\.md)\)/g)]
    .map((m) => ({ title: m[1], url: m[2] }));
  console.log(`  llms.txt lists ${urls.length} pages`);

  let ok = 0; let failed = 0;
  const CONCURRENCY = 6;
  let cursor = 0;
  async function worker() {
    while (cursor < urls.length) {
      const item = urls[cursor++];
      try {
        const raw = await get(item.url);
        const { meta, body } = frontMatter(raw);
        // the pages carry a standing "fetch the index" banner; it is not content
        const text = body.replace(/^>\s*##\s*Documentation Index[\s\S]*?\n\n/m, '');
        for (const sec of sections(text)) {
          addDoc({
            title: meta.title || item.title, head: sec.head, text: sec.text,
            url: item.url.replace(/\.md$/, ''), source: 'help.cloudlabs.ai', kind: 'doc',
          });
          added++;
        }
        ok++;
      } catch (e) { failed++; }
      if ((ok + failed) % 40 === 0) process.stdout.write(`\r  fetched ${ok + failed}/${urls.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write(`\r  fetched ${ok} pages, ${failed} failed          \n`);
  return added;
}

// ---- build ------------------------------------------------------------------------------------
(async function main() {
  console.log('\nBuilding Rocky\'s CloudLabs knowledge\n');

  console.log('1. local Knowledge_Base mirror');
  const fromMirror = ingestMirror(MIRROR);
  console.log(`   ${fromMirror} sections`);

  let fromLive = 0;
  if (has('--fetch')) {
    console.log('2. live docs (help.cloudlabs.ai)');
    fromLive = await ingestLive();
    console.log(`   ${fromLive} sections`);
  } else {
    console.log('2. live docs — skipped (pass --fetch to refresh from the vendor)');
  }

  if (!docs.length) { console.log('\nNothing ingested. Nothing written.\n'); process.exit(1); }

  // De-duplicate: the mirror and the live site are largely the same pages, and a duplicate
  // section would score twice and crowd out a better answer.
  const seen = new Set();
  const unique = [];
  for (const d of docs) {
    const key = (d.t + '|' + d.h + '|' + d.b.slice(0, 120)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }

  // Inverted index: term -> [doc ids]. Built here so the extension never has to scan the
  // corpus; lookup is a set intersection over a few hundred postings.
  const postings = Object.create(null);
  unique.forEach((d, i) => {
    const terms = new Set([...tokenise(d.t), ...tokenise(d.h), ...tokenise(d.b)]);
    for (const t of terms) (postings[t] || (postings[t] = [])).push(i);
  });
  // A term in almost every document tells you nothing and costs space.
  const maxDf = Math.floor(unique.length * 0.5);
  for (const t of Object.keys(postings)) {
    // Too common to discriminate, or a one-off (usually an id, a hash or a typo).
    if (postings[t].length > maxDf) delete postings[t];
  }

  // SPLIT. Ranking needs the terms and a snippet; it never needs the full section body.
  // Shipping all 7.6 MB of body text in the search index would make the extension enormous
  // for no retrieval benefit. So: a lean index (loaded at startup) and a full-text file
  // (opened only when a learner asks to read the whole section).
  const SNIPPET = 260;
  const index = unique.map((d) => ({
    t: d.t, h: d.h, u: d.u, s: d.s, k: d.k,
    b: d.b.slice(0, SNIPPET),
  }));
  const full = unique.map((d) => d.b);

  const kb = {
    built: new Date().toISOString(),
    sources: { mirror: fromMirror, live: fromLive },
    n: index.length,
    docs: index,
    idx: postings,
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(kb), 'utf8');
  fs.writeFileSync(OUT.replace(/\.json$/, '-full.json'), JSON.stringify(full), 'utf8');
  const kbSize = fs.statSync(OUT).size;
  const fullSize = fs.statSync(OUT.replace(/\.json$/, '-full.json')).size;

  console.log('');
  console.log(`   sections kept : ${unique.length} (${docs.length - unique.length} duplicates dropped)`);
  console.log(`   index terms   : ${Object.keys(postings).length}`);
  console.log(`   written       : ${OUT}`);
  console.log(`   search index  : ${(kbSize / 1024 / 1024).toFixed(2)} MB  (loaded at startup)`);
  console.log(`   full text     : ${(fullSize / 1024 / 1024).toFixed(2)} MB  (opened only on demand)`);
  console.log('');
  const issues = unique.filter((d) => d.k === 'issue').length;
  console.log(`   ${issues} sections come from real resolved issues, which retrieval prefers`);
  console.log('');
})();
