// Intent Ledger PILOT — tests the vision's gate ("extraction accuracy audit") on REAL lab guides.
// Extracts a per-task intent sidecar {objective, expectedOutcome, verifiableFacts[]} with an LLM,
// then runs a MECHANICAL faithfulness audit: every extracted fact must carry a quote that appears
// VERBATIM in the source task (whitespace-normalized). An unanchored fact is UNGROUNDED and counts
// against the guide's faithfulness score.
//
// Honesty limits (stated up front, in the output too):
//  - the audit proves quotes are REAL, not that extraction is COMPLETE or semantically right —
//    human review remains the gate; this pilot only measures whether that review can be fast
//  - outputs are DRAFTS; nothing downstream consumes them until the gate passes with a human
//
// Usage: node intent/extract.js "<guide.md>" ["<guide2.md>" ...]   (writes intent/drafts/ + report)

const fs = require('fs');
const path = require('path');
const { chat, isConfigured } = require('../src/llm');

const DRAFTS = path.join(__dirname, 'drafts');

// Split a real guide into tasks on `## Task N:` headings (the dominant real-world format);
// falls back to all `## ` sections when no Task headings exist.
function splitTasks(md) {
  const lines = md.split(/\r?\n/);
  const marks = [];
  lines.forEach((l, i) => { if (/^##\s+Task\s+\d+/i.test(l)) marks.push(i); });
  const generic = marks.length === 0;
  if (generic) lines.forEach((l, i) => { if (/^##\s+\S/.test(l)) marks.push(i); });
  const tasks = [];
  for (let m = 0; m < marks.length; m++) {
    const start = marks[m], end = m + 1 < marks.length ? marks[m + 1] : lines.length;
    const body = lines.slice(start + 1, end).join('\n').trim();
    if (body.length < 200) continue; // skip stub sections
    tasks.push({ title: lines[start].replace(/^#+\s*/, '').trim(), body });
  }
  return { tasks, splitMode: generic ? 'generic-h2' : 'task-headings' };
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

const SYSTEM = `You extract the authored INTENT of a hands-on lab task. Reply with STRICT JSON:
{"objective": "<what the learner is supposed to accomplish, one sentence>",
 "expectedOutcome": "<the observable end-state if the task succeeded, one sentence>",
 "verifiableFacts": [{"fact": "<one concrete, checkable configuration value / resource name / action>", "quote": "<short VERBATIM excerpt from the task text that states it>"}]}
Rules: 3-8 facts. Every quote MUST be copied character-for-character from the task text (it will be machine-verified). Never invent services, names, or values not present in the text.`;

async function extractTask(task) {
  const raw = await chat(
    [{ role: 'user', content: `Task title: ${task.title}\n\nTask text:\n${task.body.slice(0, 6000)}` }],
    { system: SYSTEM, json: true }
  );
  try { return JSON.parse(raw); } catch { return { _parseError: true, raw: String(raw).slice(0, 200) }; }
}

// The mechanical audit: quote-anchoring per fact + structural checks per task.
function auditTask(task, ext) {
  if (!ext || ext._parseError) return { ok: false, reason: 'unparseable model output', grounded: 0, ungrounded: 0, facts: [] };
  const body = norm(task.body);
  const facts = (ext.verifiableFacts || []).map((f) => ({ ...f, grounded: !!f.quote && body.includes(norm(f.quote)) }));
  return {
    ok: !!ext.objective && !!ext.expectedOutcome && facts.length >= 3,
    grounded: facts.filter((f) => f.grounded).length,
    ungrounded: facts.filter((f) => !f.grounded).length,
    facts,
  };
}

async function pilotGuide(file) {
  const md = fs.readFileSync(file, 'utf8');
  const { tasks, splitMode } = splitTasks(md);
  const out = { source: file, splitMode, extractedAt: new Date().toISOString(), review: 'DRAFT — requires human review; mechanical audit checks quote-anchoring only', tasks: [] };
  let grounded = 0, total = 0, structuralFails = 0;
  for (const t of tasks) {
    const ext = await extractTask(t);
    const audit = auditTask(t, ext);
    grounded += audit.grounded; total += audit.grounded + audit.ungrounded;
    if (!audit.ok) structuralFails++;
    out.tasks.push({ title: t.title, objective: ext.objective || null, expectedOutcome: ext.expectedOutcome || null, facts: audit.facts, audit: { ok: audit.ok, grounded: audit.grounded, ungrounded: audit.ungrounded, reason: audit.reason } });
  }
  out.summary = {
    tasks: tasks.length, structuralFails,
    facts: total, grounded, ungrounded: total - grounded,
    faithfulnessPct: total ? Math.round((100 * grounded) / total) : 0,
  };
  return out;
}

module.exports = { splitTasks, auditTask, norm };

if (require.main === module) (async () => {
  if (!isConfigured()) { console.error('LLM not configured (.env.local) — the pilot needs the extraction model.'); process.exit(1); }
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: node intent/extract.js <guide.md> [...]'); process.exit(1); }
  fs.mkdirSync(DRAFTS, { recursive: true });
  const report = [];
  for (const f of files) {
    const r = await pilotGuide(f);
    const slug = path.basename(f, '.md').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
    const dest = path.join(DRAFTS, `${slug}.intent.json`);
    fs.writeFileSync(dest, JSON.stringify(r, null, 1));
    console.log(`${path.basename(f)}: ${r.summary.tasks} tasks (${r.splitMode}) · ${r.summary.facts} facts · ${r.summary.faithfulnessPct}% quote-anchored · ${r.summary.structuralFails} structural fail(s) → ${dest}`);
    report.push({ file: f, ...r.summary, draft: dest });
  }
  fs.writeFileSync(path.join(__dirname, 'pilot-report.json'), JSON.stringify({ ranAt: new Date().toISOString(), note: 'mechanical faithfulness ≠ semantic accuracy — human review is the gate', guides: report }, null, 1));
})();
