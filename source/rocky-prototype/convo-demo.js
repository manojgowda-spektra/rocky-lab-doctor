// Scripted multi-turn demo — proves memory + scaffolding + grounding + streaming
// against the live model, deterministically (no readline). Run: node convo-demo.js
const path = require('path');
const { FixtureContextProvider } = require('./src/contextProvider');
const { Conversation } = require('./src/conversation');
const { handleTurn } = require('./src/agent');
const { isConfigured, provider } = require('./src/llm');

const turns = [
  'my deployment keeps failing with SkuNotAvailable, should I just pick a smaller VM size?',
  "I think I picked the wrong region but I'm not sure how to check",
  '/answer',
];

(async () => {
  const ctx = await new FixtureContextProvider(path.join(__dirname, 'fixtures', 'lab-context.json')).getContext();
  const convo = new Conversation();
  console.log(`model: ${isConfigured() ? provider() : 'OFF (deterministic)'}\n` + '─'.repeat(72));
  for (const input of turns) {
    console.log(`\nyou ▸ ${input}`);
    process.stdout.write('Rocky ▸ ');
    const r = await handleTurn({ input, ctx, conversation: convo, onToken: (t) => process.stdout.write(t) });
    console.log(`\n   [level=${r.level}  usedLLM=${r.usedLLM}  intent=${r.intent}  struggle=${convo.struggle}]`);
  }
  console.log('\n' + '─'.repeat(72) + `\nturns in memory: ${convo.history.length}  |  explained: ${[...convo.toldKeys].join(', ')}`);
})();
