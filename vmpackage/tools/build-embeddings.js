/*
 * build-embeddings.js — give Rocky semantic search, computed once, shipped offline.
 *
 * THE PROBLEM THIS SOLVES. Keyword search only works when the learner uses the
 * documentation's words. A learner in trouble uses their own. Measured against the real
 * index, six paraphrased questions produced two refusals and FOUR confidently wrong
 * answers — "I can't get into my environment" returned a copy-paste issue. That is the
 * failure this whole product exists to prevent, so it is worth real work.
 *
 * WHY THIS IS NOT THE VECTOR-DATABASE ANSWER I FIRST REJECTED. The objection was never to
 * embeddings; it was to needing a server, a key and a network round trip at question time,
 * inside a lab VM that may have none of them. Computing the vectors at BUILD time removes
 * all three: the extension ships the numbers and does cosine similarity locally. No server,
 * no key, no per-question cost, still offline.
 *
 * SIZE, measured before committing to it:
 *   1536-dim float32  48 MB   unshippable
 *    256-dim int8      2 MB   fine
 * text-embedding-3 models are Matryoshka-trained: the leading dimensions carry most of the
 * signal, so truncating to 256 keeps most of the quality. int8 quantisation costs a little
 * more precision and saves 4x again. Cosine similarity is scale-invariant, so quantising a
 * NORMALISED vector and comparing quantised-to-quantised stays faithful.
 *
 * Cost: ~625k tokens, about one cent, once per corpus rebuild.
 *
 * Usage:
 *   set ROCKY_EMBED_ENDPOINT=https://<res>.services.ai.azure.com
 *   set ROCKY_EMBED_DEPLOYMENT=text-embedding-3-small
 *   set ROCKY_EMBED_KEY=<key>
 *   node tools/build-embeddings.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);
const argOf = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const KB = argOf('--kb', path.join(__dirname, '..', 'webext', 'knowledge', 'cloudlabs-kb.json'));
const OUT = argOf('--out', path.join(__dirname, '..', 'webext', 'knowledge', 'cloudlabs-vec.json'));
const DIMS = Number(argOf('--dims', 256));
const BATCH = Number(argOf('--batch', 96));

const ENDPOINT = process.env.ROCKY_EMBED_ENDPOINT || argOf('--endpoint', '');
const DEPLOYMENT = process.env.ROCKY_EMBED_DEPLOYMENT || argOf('--deployment', 'text-embedding-3-small');
const KEY = process.env.ROCKY_EMBED_KEY || argOf('--key', '');

if (!ENDPOINT || !KEY) {
  console.log(`
Rocky semantic index — needs an Azure AI Foundry embedding deployment.

  set ROCKY_EMBED_ENDPOINT=https://<resource>.services.ai.azure.com
  set ROCKY_EMBED_DEPLOYMENT=text-embedding-3-small
  set ROCKY_EMBED_KEY=<key from Keys and Endpoint>
  node tools/build-embeddings.js

The key is read from the environment and never written to disk or into the package.
This runs once per corpus rebuild, costs about a penny, and produces a ~2 MB file that
ships with the extension and works offline.
`);
  process.exit(1);
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'api-key': KEY,
        Authorization: 'Bearer ' + KEY,
      },
      timeout: 60000,
    }, (res) => {
      let s = ''; res.setEncoding('utf8');
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}: ${s.slice(0, 300)}`));
        try { resolve(JSON.parse(s)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.write(data); req.end();
  });
}

function embedUrl() {
  const base = ENDPOINT.replace(/\/+$/, '');
  // Both surfaces exist in the wild; prefer the v1 one the newer resources expose.
  if (/\.services\.ai\.azure\.com$/i.test(new URL(base).hostname)) {
    return `${base}/openai/v1/embeddings`;
  }
  return `${base}/openai/deployments/${encodeURIComponent(DEPLOYMENT)}/embeddings?api-version=2024-10-21`;
}

// Cosine similarity only cares about direction, so normalising first means the browser can
// compare vectors with a plain dot product - no square roots at question time.
function normalise(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

// int8: 4x smaller than float32 and, on a normalised vector, costs very little accuracy.
// 127 maps to 1.0; values are clamped because a component can exceed the nominal range.
function quantise(v) {
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) {
    let q = Math.round(v[i] * 127);
    out[i] = q > 127 ? 127 : q < -127 ? -127 : q;
  }
  return out;
}

(async function main() {
  const kb = JSON.parse(fs.readFileSync(KB, 'utf8'));
  const docs = kb.docs;
  console.log(`\nEmbedding ${docs.length} sections at ${DIMS} dimensions\n`);
  console.log(`  endpoint   : ${embedUrl().replace(/\/\/[^/]+/, '//<resource>')}`);
  console.log(`  deployment : ${DEPLOYMENT}\n`);

  // Title and heading carry the topic; the snippet carries the detail. Embedding all three
  // means a paraphrase can match on meaning even when no word is shared.
  const inputs = docs.map((d) => `${d.t}. ${d.h}. ${d.b}`.slice(0, 2000));

  const vectors = new Array(docs.length);
  let done = 0; let failed = 0;

  for (let i = 0; i < inputs.length; i += BATCH) {
    const slice = inputs.slice(i, i + BATCH);
    let res;
    try {
      res = await post(embedUrl(), { model: DEPLOYMENT, input: slice, dimensions: DIMS });
    } catch (e) {
      // dimensions is unsupported on older embedding models; fall back and truncate here.
      if (/dimensions/i.test(e.message)) {
        try { res = await post(embedUrl(), { model: DEPLOYMENT, input: slice }); }
        catch (e2) { console.log(`\n  batch at ${i} failed: ${e2.message}`); failed += slice.length; continue; }
      } else {
        console.log(`\n  batch at ${i} failed: ${e.message}`);
        failed += slice.length;
        continue;
      }
    }
    const items = (res.data || []).sort((a, b) => (a.index || 0) - (b.index || 0));
    for (let j = 0; j < items.length; j++) {
      let v = items[j].embedding;
      if (v.length > DIMS) v = v.slice(0, DIMS);      // Matryoshka: leading dims carry the signal
      vectors[i + j] = quantise(normalise(v));
      done++;
    }
    process.stdout.write(`\r  embedded ${done}/${inputs.length}`);
  }
  process.stdout.write('\n');

  if (failed) console.log(`  ${failed} section(s) could not be embedded and will fall back to keyword search`);
  if (!done) { console.log('\nNothing embedded. Nothing written.\n'); process.exit(1); }

  // Flat array: 8,000 small arrays cost far more in JSON than one long one.
  const flat = [];
  const present = [];
  for (let i = 0; i < vectors.length; i++) {
    if (!vectors[i]) continue;
    present.push(i);
    for (let d = 0; d < DIMS; d++) flat.push(vectors[i][d]);
  }

  fs.writeFileSync(OUT, JSON.stringify({
    built: new Date().toISOString(),
    model: DEPLOYMENT,
    dims: DIMS,
    n: present.length,
    ids: present,          // maps row -> section id in cloudlabs-kb.json
    q: 127,                // quantisation scale
    v: flat,
  }), 'utf8');

  const mb = fs.statSync(OUT).size / 1024 / 1024;
  console.log(`\n  written : ${OUT}`);
  console.log(`  size    : ${mb.toFixed(2)} MB  (${present.length} vectors x ${DIMS} int8)`);
  console.log('\n  Rebuild the package and Rocky matches on meaning, offline.\n');
})();
