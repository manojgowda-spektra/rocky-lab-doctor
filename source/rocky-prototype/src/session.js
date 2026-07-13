// Rocky self-generated engagement telemetry.
// CloudLabs does NOT expose time-per-step / attempts / hints-used (see
// docs/architecture.md). So Rocky logs its own interaction events — this seeds
// the data flywheel and the future competency signal. Bounded: raw per-event rows are the input to a
// future aggregation job, not a permanent record, so this file is capped rather than growing forever
// (see docs/rocky_complexity_audit.md — data minimization). A real deployment should aggregate to
// per-stepGuid/per-findingType rollups on a schedule and drop the raw rows entirely once aggregated.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'interactions.jsonl');
const MAX_LINES = 2000; // bounded raw window; trimmed to MAX_LINES/2 once exceeded

function logInteraction(event) {
  // Defensive: telemetry must never break the user experience.
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    const record = {
      ts: event.ts || new Date().toISOString(),
      eventUserId: event.eventUserId || null,
      stepGuid: event.stepGuid || null,
      level: event.level || null,           // hint | guided | answer
      findingTypes: event.findingTypes || [],
      resolved: event.resolved ?? null,     // set when learner confirms recovery
      latencyMs: event.latencyMs ?? null,
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
    trimIfNeeded();
    return record;
  } catch (e) {
    // Swallow — never throw from telemetry.
    return null;
  }
}

function trimIfNeeded() {
  // Only pay the read cost occasionally — check file size (cheap) before counting lines (not-so-cheap).
  const stat = fs.statSync(LOG_FILE);
  if (stat.size < MAX_LINES * 200) return; // rough byte estimate to skip most calls without reading
  const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
  if (lines.length > MAX_LINES) fs.writeFileSync(LOG_FILE, lines.slice(-MAX_LINES / 2).join('\n') + '\n');
}

module.exports = { logInteraction, LOG_FILE };
