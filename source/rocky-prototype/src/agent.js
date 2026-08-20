// Rocky agent orchestrator — ties together intent, conversation/scaffolding,
// grounding, deterministic-first routing, the LLM, and telemetry.

const { parseInput } = require('./intent');
const { respond, analyze } = require('./rocky');
const { ROCKY_SYSTEM, buildGroundedContext } = require('./prompt');
const { chatStream, isConfigured } = require('./llm');
const { logInteraction } = require('./session');
const { redact } = require('./redact');

const PROGRESS_RE = /\b(it )?(worked|works now|passed|fixed|resolved|got it|sorted)\b|that (worked|did it)/i;

/**
 * Handle one turn.
 * @returns {Promise<{text:string, usedLLM:boolean, level:string, intent:string}>}
 */
async function handleTurn({ input, ctx, conversation, convo, onToken }) {
  conversation = conversation || convo; // accept either key name
  // SC-005 — redact ONCE at the data boundary, before anything reads the context: the deterministic
  // responder, the grounded prompt, and the model all see the scrubbed copy. live.js already did this
  // (its line 13) but this path did not, so a real deployment error carrying a connection string
  // would have reached the model. redact() is pure, so the caller's ctx is untouched.
  ctx = redact(ctx);
  const parsed = parseInput(input);

  // ----- slash commands handled by the agent (control commands handled by the REPL) -----
  if (parsed.kind === 'command') {
    if (parsed.action === 'set-level') {
      conversation.setLevel(parsed.command); // hint | guided | answer
      if (parsed.arg) return runMessage({ text: parsed.arg, intent: 'general', struggling: false }, { ctx, conversation, onToken });
      // No question supplied → give a grounded response at the new level about the current problem.
      return deterministic(ctx, conversation, `Okay, switching to ${conversation.level} mode.`, 'general', onToken);
    }
    if (parsed.action === 'check') {
      return deterministic(ctx, conversation, null, 'check', onToken);
    }
    if (parsed.action === 'why') {
      return runMessage({ text: parsed.arg || 'Why is this happening?', intent: 'why', struggling: false }, { ctx, conversation, onToken });
    }
  }

  // ----- free-form message -----
  return runMessage(parsed, { ctx, conversation, onToken });
}

// Update scaffolding state from the message, then route deterministic vs LLM.
async function runMessage(msg, { ctx, conversation, onToken }) {
  const text = msg.text;
  if (PROGRESS_RE.test(text)) conversation.registerProgress();
  else if (msg.intent === 'stuck' || msg.struggling) conversation.registerStruggle();
  if (msg.intent === 'answer-request') conversation.setLevel('answer');

  conversation.addUser(text);

  // Deterministic fallback if no model configured (graceful degradation).
  if (!isConfigured()) {
    const det = respond(ctx, conversation.level);
    conversation.addAssistant(det);
    tag(conversation, ctx);
    log(conversation, ctx, msg.intent, false, 0);
    if (onToken) onToken(det);
    return { text: det, usedLLM: false, level: conversation.level, intent: msg.intent };
  }

  // LLM path, grounded with the deterministic findings embedded.
  const system = `${ROCKY_SYSTEM}\n\n${buildGroundedContext(ctx, conversation)}`;
  const messages = conversation.messagesForModel();
  const started = Date.now();
  let out;
  try {
    out = await chatStream(messages, { system, onToken });
  } catch (e) {
    out = respond(ctx, conversation.level); // reflection/recovery: fall back to grounded deterministic
    if (onToken) onToken(out);
  }
  conversation.addAssistant(out || '');
  tag(conversation, ctx);
  log(conversation, ctx, msg.intent, true, Date.now() - started);
  return { text: out || '', usedLLM: true, level: conversation.level, intent: msg.intent };
}

// /check and set-level-without-question → exact, free, grounded state report.
function deterministic(ctx, conversation, prefix, intent = 'general', onToken) {
  const body = respond(ctx, conversation.level);
  const text = prefix ? `${prefix}\n\n${body}` : body;
  conversation.addAssistant(text);
  tag(conversation, ctx);
  log(conversation, ctx, intent, false, 0);
  if (onToken) onToken(text);
  return { text, usedLLM: false, level: conversation.level, intent };
}

// Remember which finding types we've explained (so we don't repeat — research principle #4).
function tag(conversation, ctx) {
  try { for (const f of analyze(ctx).findings) conversation.markTold(f.type); } catch { /* ignore */ }
}

function log(conversation, ctx, intent, usedLLM, latencyMs) {
  let findingTypes = [];
  try { findingTypes = analyze(ctx).findings.map((f) => f.type); } catch { /* ignore */ }
  logInteraction({
    eventUserId: ctx.learner?.eventUserId, stepGuid: ctx.currentStep?.stepGuid,
    level: conversation.level, findingTypes, latencyMs,
    // intent + struggle help future proactivity-trigger design
    ...{ intent, struggle: conversation.struggle, usedLLM },
  });
}

module.exports = { handleTurn };
