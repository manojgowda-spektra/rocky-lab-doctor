// Rocky — interactive, multi-turn learning companion (CLI).
//   node chat.js
// Streams responses; uses your deployed model if configured (.env.local),
// otherwise falls back to the deterministic grounded engine so it still helps.

const path = require('path');
const readline = require('readline');
const { FixtureContextProvider } = require('./src/contextProvider');
const { Conversation } = require('./src/conversation');
const { handleTurn } = require('./src/agent');
const { isConfigured, provider } = require('./src/llm');

const HELP = `Commands:
  /hint            nudge only (default)        /guided   walk through the reasoning
  /answer          give the concrete fix       /check    re-check my lab state (free, exact)
  /why <q>         ask why something happens    /status   show lab + assistance state
  /reset           start the conversation over  /help     this help
  /quit            exit`;

function printStatus(ctx, convo) {
  const failed = (ctx.validations || []).filter((v) => v.status === 'failed').map((v) => v.validationId);
  console.log(`\n  Lab:        ${ctx.lab.title}`);
  console.log(`  Objective:  ${ctx.lab.objective}`);
  console.log(`  Step:       ${ctx.currentStep?.stepGuid} — ${ctx.currentStep?.title}`);
  console.log(`  Failed:     ${failed.join(', ') || '(none)'}`);
  console.log(`  Assistance: ${convo.level}   |   model: ${isConfigured() ? provider() : 'OFF (deterministic only)'}\n`);
}

(async () => {
  const ctx = await new FixtureContextProvider(path.join(__dirname, 'fixtures', 'lab-context.json')).getContext();
  const convo = new Conversation();

  console.log('\n🤖  Rocky — your in-lab companion.  Type /help for commands, /quit to exit.');
  printStatus(ctx, convo);
  console.log(`Try: "my deployment keeps failing with SkuNotAvailable, should I pick a smaller VM?"\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'you ▸ ' });

  // Serial queue so lines never interleave (robust for both TTY and piped input).
  // quit = stop now (/quit); inputEnded = stdin closed → drain the queue, then finish.
  const queue = [];
  let processing = false;
  let quit = false;
  let inputEnded = false;

  function finish() { console.log('\n👋  Keep going — you\'ve got this.\n'); process.exit(0); }

  async function processLine(input) {
    const lower = input.toLowerCase();
    if (lower === '/quit' || lower === '/exit') { quit = true; return; }
    if (lower === '/help') { console.log('\n' + HELP + '\n'); return; }
    if (lower === '/status') { printStatus(ctx, convo); return; }
    if (lower === '/reset') { convo.reset(); console.log('\n(conversation reset)\n'); return; }

    process.stdout.write('\nRocky ▸ ');
    try {
      await handleTurn({ input, ctx, conversation: convo, onToken: (t) => process.stdout.write(t) });
    } catch (e) {
      process.stdout.write(`(error: ${e.message})`);
    }
    process.stdout.write('\n\n');
  }

  async function pump() {
    if (processing) return;
    processing = true;
    while (queue.length && !quit) await processLine(queue.shift());
    processing = false;
    if (quit || inputEnded) return finish();
    rl.prompt();
  }

  rl.prompt();
  rl.on('line', (line) => { const t = line.trim(); if (t) { queue.push(t); pump(); } else rl.prompt(); });
  rl.on('close', () => { inputEnded = true; pump(); });
})();
