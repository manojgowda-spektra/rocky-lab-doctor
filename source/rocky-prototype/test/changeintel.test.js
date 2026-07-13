// Change Intelligence tests — canned feed fixtures (no network), deterministic asOf.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { harvestEol, parseRssItems, harvestAzureUpdates } = require('../changeintel/harvest');
const { assessImpact } = require('../changeintel/impact');

const ASOF = '2026-07-04T00:00:00Z';
const mockFetch = (byUrl) => async (url) => {
  for (const [k, v] of Object.entries(byUrl)) if (url.includes(k)) return { ok: true, json: async () => v, text: async () => v };
  return { ok: false, status: 404 };
};

test('harvestEol: past EOL and approaching EOL become candidates; far-future does not', async () => {
  const fx = { 'endoflife.date/api/nodejs.json': [
    { cycle: '16', eol: '2023-09-11', latest: '16.20.2' },
    { cycle: '20', eol: '2026-08-30', latest: '20.19.0' },   // 57 days out
    { cycle: '24', eol: '2028-04-30', latest: '24.4.0' },    // beyond window
    { cycle: '26', eol: false, latest: '26.4.0' },           // still supported, no date
  ] };
  const { candidates, errors } = await harvestEol({ products: ['nodejs'], withinDays: 365, asOf: ASOF, fetchImpl: mockFetch(fx) });
  assert.equal(errors.length, 0);
  const cycles = candidates.map((c) => c.cycle).sort();
  assert.deepEqual(cycles, ['16', '20'], 'exactly the past + approaching cycles');
  const c16 = candidates.find((c) => c.cycle === '16');
  assert.equal(c16.status, 'already-eol');
  assert.ok(c16.tokens.includes('Node.js 16'));
  assert.ok(c16.citation.includes('endoflife.date'));
  const c20 = candidates.find((c) => c.cycle === '20');
  assert.equal(c20.status, 'approaching');
  assert.equal(c20.daysUntil, 57);
});

test('azure RSS: retirement items become candidates with citations; ordinary updates are ignored', async () => {
  const xml = `<rss><channel>
    <item><title>Retirement: Azure Widget Service will be retired on 30 September 2026</title><link>https://azure.microsoft.com/updates/w1</link><pubDate>Tue, 01 Jul 2026 00:00:00 Z</pubDate><description>Migrate before 30 September 2026.</description></item>
    <item><title>Generally Available: Faster disks</title><link>https://azure.microsoft.com/updates/w2</link><pubDate>Tue, 01 Jul 2026 00:00:00 Z</pubDate><description>New disk SKU.</description></item>
  </channel></rss>`;
  assert.equal(parseRssItems(xml).length, 2);
  const { candidates } = await harvestAzureUpdates({ asOf: ASOF, fetchImpl: mockFetch({ '/azure/rss': xml }) });
  assert.equal(candidates.length, 1, 'only the retirement item');
  assert.equal(candidates[0].type, 'RETIREMENT');
  assert.ok(candidates[0].tokens[0].includes('Azure Widget Service'));
  assert.ok(candidates[0].date, 'deadline extracted from the announcement');
  assert.ok(/human/.test(candidates[0].review), 'candidates always declare the review requirement');
});

test('impact: matches real content, skips vendor dirs and minified lines, sorts by urgency', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-impact-'));
  const mk = (p, s) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), s); };
  mk('LabA/guide.md', '# Setup\nInstall Node.js 16 or newer.\n');
  mk('LabA/.venv/site-packages/lib.py', '# works since Node.js 16 lol\n');       // vendor noise — must be skipped
  mk('LabB/pipeline.json', '{"a":"' + 'x'.repeat(500) + ' Node.js 16"}');        // minified — must be skipped
  mk('LabB/steps.md', 'Use Python 3.10 for this exercise.\n');
  const candidates = [
    { id: 'eol:nodejs:16', tokens: ['Node.js 16'], product: 'Node.js', cycle: '16', type: 'EOL', date: '2023-09-11', daysUntil: -1027, status: 'already-eol', source: 't', citation: 't' },
    { id: 'eol:python:3.10', tokens: ['Python 3.10'], product: 'Python', cycle: '3.10', type: 'EOL', date: '2026-10-31', daysUntil: 118, status: 'approaching', source: 't', citation: 't' },
    { id: 'eol:go:1.1', tokens: ['Go 1.1'], product: 'Go', cycle: '1.1', type: 'EOL', date: '2013-01-01', daysUntil: -4000, status: 'already-eol', source: 't', citation: 't' },
  ];
  const impacts = assessImpact(candidates, root);
  assert.equal(impacts.length, 2, 'only candidates with real references');
  assert.equal(impacts[0].id, 'eol:nodejs:16', 'most urgent (already EOL) first');
  assert.equal(impacts[0].referenceCount, 1, 'vendor + minified hits excluded');
  assert.equal(impacts[0].references[0].file, 'guide.md');
  assert.equal(impacts[1].references[0].evidence, 'Use Python 3.10 for this exercise.');
  fs.rmSync(root, { recursive: true, force: true });
});
