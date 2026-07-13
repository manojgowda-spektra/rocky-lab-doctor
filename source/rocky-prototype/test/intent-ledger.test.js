// The Intent Ledger's deterministic core: task splitting on real-world heading formats, and the
// mechanical faithfulness audit (verbatim quote-anchoring) that CI re-runs on guide diffs. The LLM
// extraction itself is NOT tested here (network); only the machinery that keeps it honest.
const { test } = require('node:test');
const assert = require('node:assert');
const { splitTasks, auditTask } = require('../intent/extract');

const PAD = ' filler text to clear the stub-section minimum length'.repeat(5);
const GUIDE = `# Lab 1

## Task 1: Create the storage account
1. Open the **Azure portal** and create a storage account named **stgdemo123**.
2. Set **Public access** to Disabled.${PAD}

## Task 2: Configure networking
1. Select the **Networking** tab and choose **Private endpoint**.${PAD}

## Summary
Too short.`;

test('splitTasks: task headings win, stub sections are skipped', () => {
  const { tasks, splitMode } = splitTasks(GUIDE);
  assert.equal(splitMode, 'task-headings');
  assert.equal(tasks.length, 2, 'Summary is not a task; stubs are skipped');
  assert.equal(tasks[0].title, 'Task 1: Create the storage account');
  assert.ok(tasks[0].body.includes('stgdemo123'));
});

test('splitTasks: falls back to generic h2 sections when no Task headings exist', () => {
  const { tasks, splitMode } = splitTasks(`# T\n\n## Exercise A\ncontent${PAD}\n\n## Exercise B\ncontent${PAD}`);
  assert.equal(splitMode, 'generic-h2');
  assert.equal(tasks.length, 2);
});

test('auditTask: verbatim quotes ground a fact; paraphrases and inventions do not', () => {
  const task = splitTasks(GUIDE).tasks[0];
  const audit = auditTask(task, {
    objective: 'Create a storage account', expectedOutcome: 'Account exists with public access disabled',
    verifiableFacts: [
      { fact: 'account name', quote: 'a storage account named **stgdemo123**' }, // verbatim -> grounded
      { fact: 'public access', quote: 'Set **Public   access** to Disabled' },   // whitespace-normalized -> grounded
      { fact: 'invented region', quote: 'deploy to West US 2' },                 // not in source -> UNGROUNDED
    ],
  });
  assert.equal(audit.grounded, 2);
  assert.equal(audit.ungrounded, 1);
  assert.equal(audit.ok, true, '3 facts + objective + outcome = structurally ok (grounding is scored separately)');
});

test('auditTask: unparseable model output and thin extractions fail structurally', () => {
  const task = splitTasks(GUIDE).tasks[0];
  assert.equal(auditTask(task, { _parseError: true }).ok, false);
  const thin = auditTask(task, { objective: 'x', expectedOutcome: 'y', verifiableFacts: [{ fact: 'a', quote: 'stgdemo123' }] });
  assert.equal(thin.ok, false, 'fewer than 3 facts is not a usable sidecar');
});
