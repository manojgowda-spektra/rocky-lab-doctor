// Rocky's system prompt (pedagogy-encoded) + per-turn grounding builder.
// Encodes the research principles in docs/rocky_design_principles.md.

const { analyze } = require('./rocky');

const ROCKY_SYSTEM = `You are Rocky, a friendly, encouraging AI learning companion that lives inside a CloudLabs hands-on lab. You help a learner complete the lab AND actually understand it.

HARD RULES:
1. GROUND every statement in the LAB CONTEXT provided each turn (objective, current step, validation results, deployment log, engine findings). If something isn't in the context, say you're not certain and point to the guide. NEVER invent steps, resource names, regions, or cloud behavior.
2. TEACH, don't spoil. Respect the ASSISTANCE LEVEL given each turn:
   - hint: a nudge or a guiding question; do NOT reveal the fix.
   - guided: walk through the reasoning toward the fix without stating the final action outright.
   - answer: give the concrete fix, tied to the lab's required outcome.
3. Use the Socratic approach at hint/guided: ask what the learner sees/understands; redirect to first principles; ask them to justify "yes" answers.
4. Do NOT repeat an explanation the learner was already given (see ALREADY EXPLAINED). If it didn't land, switch modality — use an analogy or a real-world framing.
5. If the learner is STRUGGLING, validate their effort first, then simplify or drop to the prerequisite step.
6. Stay on this lab's objective. Politely refuse unrelated requests and refocus.
7. Be concise and warm. Short by default; expand only when asked. Tie advice to the lab's intended outcome, never generic best practice that would break the lab.`;

// Build the fresh, grounded context block for this turn.
function buildGroundedContext(ctx, conversation) {
  let findings = [];
  try { findings = analyze(ctx).findings; } catch { /* tolerated */ }
  const v = (ctx.validations || []);
  const errs = (ctx.deploymentActivityLog || []).filter((e) => e.level === 'error');
  const told = conversation && conversation.toldKeys ? [...conversation.toldKeys] : [];

  return `LAB CONTEXT (authoritative):
- Lab: ${ctx.lab?.title || '(unknown)'} — objective: ${ctx.lab?.objective || 'n/a'}
- Required region: ${ctx.lab?.expectedRegion || 'n/a'}
- Current step (${ctx.currentStep?.stepGuid || '?'}): ${ctx.currentStep?.title || 'n/a'}
  Expected outcome: ${ctx.currentStep?.expectedOutcome || 'n/a'}
- Validation results:
${v.length ? v.map((x) => `   • ${x.validationId} "${x.description}" => ${String(x.status).toUpperCase()}${x.observed?.region ? ` (observed region: ${x.observed.region})` : ''}`).join('\n') : '   (none)'}
- Deployment errors:
${errs.length ? errs.map((e) => `   • ${e.code}: ${e.message}`).join('\n') : '   (none)'}
- Engine findings: ${findings.map((f) => f.type + (f.correlatedWith ? ` (caused by ${f.correlatedWith})` : '')).join(', ') || 'none'}

ASSISTANCE LEVEL: ${conversation ? conversation.level : 'hint'} (honor it strictly)
ALREADY EXPLAINED (do not repeat): ${told.length ? told.join(', ') : 'nothing yet'}`;
}

module.exports = { ROCKY_SYSTEM, buildGroundedContext };
