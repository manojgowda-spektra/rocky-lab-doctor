// Rocky P1 prototype — runnable proof.  Run: node demo.js
// Proves the novel capability: grounded, lab-aware diagnosis vs blind generic AI.

const path = require('path');
const { FixtureContextProvider } = require('./src/contextProvider');
const { respond, genericBaseline, analyze } = require('./src/rocky');
const { logInteraction } = require('./src/session');

const bar = (t) => '\n' + '='.repeat(72) + `\n${t}\n` + '='.repeat(72);

(async () => {
  const provider = new FixtureContextProvider(path.join(__dirname, 'fixtures', 'lab-context.json'));
  const ctx = await provider.getContext();

  console.log(bar('SCENARIO (real lab state)'));
  console.log(`Lab:        ${ctx.lab.title}`);
  console.log(`Objective:  ${ctx.lab.objective}`);
  console.log(`Learner on: Step ${ctx.currentStep.stepGuid} — ${ctx.currentStep.title}`);
  console.log(`Failed:     ${ctx.validations.filter((v) => v.status === 'failed').map((v) => v.validationId).join(', ')}`);
  console.log(`Asks:       "${ctx.learnerQuestion}"`);

  const { findings } = analyze(ctx);

  console.log(bar('ROCKY (grounded) — default scaffolded hint'));
  console.log(respond(ctx, 'hint'));
  console.log(bar('ROCKY (grounded) — if learner asks for the full answer'));
  console.log(respond(ctx, 'answer'));

  console.log(bar('GENERIC AI (same question, blind to the lab) — the baseline'));
  console.log(genericBaseline());

  console.log(bar('WHY THIS IS NOVEL'));
  console.log(
`Generic AI tells the learner to change the VM size — which PASSES the error but
FAILS the lab (it requires West US 2 + that VM). Rocky knows the lab's intended
outcome AND the learner's live validation/deployment state, so it gives the fix
that completes the lab. That intersection is the moat.`);

  // Self-generated telemetry (CloudLabs doesn't expose engagement metrics).
  logInteraction({ eventUserId: ctx.learner?.eventUserId, stepGuid: ctx.currentStep?.stepGuid, level: 'hint', findingTypes: findings.map((f) => f.type) });

  const { ctx: redacted } = analyze(ctx);
  const safe = !JSON.stringify(redacted).includes('Sup3rSecret');
  console.log(bar('SAFETY CHECK'));
  console.log(`Secret/PII redacted before reasoning: ${safe ? 'PASS' : 'FAIL'}`);
  console.log('Telemetry written to logs/interactions.jsonl (Rocky self-generates engagement data).');
})();
