// Live end-to-end demo: real lab context -> grounded prompt -> YOUR deployed model.
// Run: node live.js   (reads creds from .env.local; never prints the key)
// NOTE: named without "-test" so the test runner never makes billed calls.

const path = require('path');
const { FixtureContextProvider } = require('./src/contextProvider');
const { redact } = require('./src/redact');
const { analyze } = require('./src/rocky');
const { askLLM, ROCKY_SYSTEM } = require('./src/llm');

(async () => {
  const provider = new FixtureContextProvider(path.join(__dirname, 'fixtures', 'lab-context.json'));
  const safe = redact(await provider.getContext());
  const { findings } = analyze(safe);

  const grounded = `LAB CONTEXT (authoritative — ground your answer ONLY in this):
- Lab: ${safe.lab.title}
- Objective: ${safe.lab.objective}
- Required region: ${safe.lab.expectedRegion}
- Current step (${safe.currentStep.stepGuid}): ${safe.currentStep.title}
  Instruction: ${safe.currentStep.instruction}
  Expected outcome: ${safe.currentStep.expectedOutcome}
- Validation results:
${safe.validations.map((v) => `   • ${v.validationId} "${v.description}" => ${v.status.toUpperCase()}${v.observed ? ` (observed region: ${v.observed.region})` : ''}`).join('\n')}
- Deployment log (errors):
${safe.deploymentActivityLog.filter((e) => e.level === 'error').map((e) => `   • ${e.code}: ${e.message}`).join('\n')}
- Engine findings: ${findings.map((f) => f.type + (f.correlatedWith ? ` (caused by ${f.correlatedWith})` : '')).join(', ') || 'none'}

LEARNER QUESTION: "${safe.learnerQuestion}"

Give a short, scaffolded HINT (do not give the full fix unless asked). Tie it to the lab's required outcome.`;

  console.log('Calling your deployed model (grounded prompt)…\n');
  try {
    const answer = await askLLM(ROCKY_SYSTEM, grounded);
    console.log('=== ROCKY (live, model-generated, grounded) ===\n');
    console.log(answer);
  } catch (e) {
    console.log('LLM ERROR:', e.message);
  }
})();
