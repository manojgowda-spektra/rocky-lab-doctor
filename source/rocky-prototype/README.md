# Rocky P1 Prototype — grounded, lab-aware learning companion

A **runnable** Rocky: a multi-turn, pedagogy-first companion that uses a learner's
*actual* validation failures + deployment errors + the lab's *intended* outcome to
give the **correct, scaffolded** help — where generic AI gives plausible-but-lab-breaking advice.

## Run it
```bash
# Web UI — the animated character (recommended):
node web/server.js    # then open http://localhost:5173   (or double-click start-rocky-web.bat)

# Terminal:
node chat.js          # interactive multi-turn companion (uses your model if configured)
node convo-demo.js    # scripted 3-turn demo (proves memory + scaffolding + streaming)
node demo.js          # side-by-side: Rocky (grounded) vs generic AI (blind)
node --test           # 31 tests (deterministic; never makes billed model calls)
```

### Web UI — the character
An SVG robot that sleeps/snores when idle, glides, tells technical jokes, and jumps into
**superhero mode** when it detects you're stuck or an issue appears. The brain stays
server-side (model key never reaches the browser); the UI is the avatar skin (ADR-001).
**Demo flow to try:** open it → Rocky wakes and notices the failed deployment → ask
*"should I pick a smaller VM?"* → watch the grounded answer stream → click **/answer** →
click **⚠ Inject license issue** → Rocky goes superhero and offers **🛟 Report to technical team** → ticket issued.
The **deterministic grounded engine runs with no API key**. To enable free-form Q&A,
put model creds in `.env.local` (Azure OpenAI or Anthropic — see `src/llm.js`).

## In-chat commands
`/hint` `/guided` `/answer` (the spoiler dial) · `/check` (free, exact state report) ·
`/why <q>` · `/status` · `/reset` · `/help` · `/quit`

## What it proves (the moat)
- **Grounding:** reads lab objective, module→exercise→step validations, per-learner pass/fail, deployment log.
- **Correlation no one else does:** links a `SkuNotAvailable` deploy error to the *wrong-region* validation failure and the lab's required region → true root cause (not "shrink the VM").
- **Pedagogy (researched):** Socratic scaffolding with a hint→guided→answer dial that escalates on struggle and **fades on progress** (ZPD); never repeats a failed explanation. See `../../docs/rocky_design_principles.md`.
- **Multi-turn memory** with summarization-based trimming to control tokens.
- **Cost discipline:** deterministic-first (`/check` and failure explanations cost **0 tokens**); model only for free-form Q&A; streaming + bounded retries + graceful degradation.
- **Safety:** secrets/PII redacted before the model; session telemetry self-generated.

## Architecture
```
ContextProvider ─▶ redact ─▶ agent (intent → scaffold → route)
   (fixture/live)              │  deterministic-first ──▶ rocky engine (findings)  [0 tokens]
                               └  free-form ───────────▶ llm (stream, retry)  ─▶ prompt (grounded, pedagogy)
                                          conversation (memory, level, struggle) · session (telemetry)
```
| File | Role |
|---|---|
| `chat.js` | Interactive REPL (serialized turns; TTY + piped safe) |
| `src/agent.js` | Orchestrator: intent → scaffolding → deterministic/LLM routing → telemetry |
| `src/rocky.js` | Deterministic grounded diagnosis (findings + scaffolded explanations) |
| `src/conversation.js` | Memory, assistance-level dial, ZPD escalate/fade, summarization |
| `src/intent.js` | Slash commands + intent classification + struggle detection |
| `src/prompt.js` | Pedagogy system prompt + per-turn grounding builder |
| `src/llm.js` | Azure OpenAI + Anthropic, streaming, retries, timeouts, graceful degrade |
| `src/redact.js` | Secret/PII redaction (runs first) |
| `src/contextProvider.js` | Fixture provider (live CloudLabs stub ready for API auth) |
| `src/session.js` | Self-generated engagement telemetry (JSONL) |
| `test/*.test.js` | 31 tests: engine, redaction, conversation, intent, agent routing |

## From prototype → product
1. Implement `LiveCloudLabsContextProvider` fetches (needs API auth — checklist A1).
2. Host as a scoped Cosmos Agent (ADR-006) reusing per-user OpenAI-credit rails.
3. Add a hallucination eval harness + CI; grow `ERROR_RULES`; add a web panel surface.
