# Session Handover

> **Purpose:** Allow the next AI session to pick up exactly where this one left off.
> **Protocol:** Update at the end of every AI session.

---

## LATEST HANDOVER

### Session: 2026-07-01 (flagship redesign) — EVE-grade Rocky + whole-VM architecture
**What happened:** Major flagship redesign driven by 4 background design/research workflows (ultracode). Built a premium living companion and produced the whole-VM awareness architecture.
- **Run the app:** server `web/server.js` on :5173. **`/rocky.html`** = the flagship living companion (v2). `/flagship.html` = character-face preview. `/index.html` = older cartoon version (superseded).
- **`rocky.html` (v2) features:** eyes-as-emotion canvas rig (14 emotions) on a 60fps `damp()` loop; roaming presence + idle state machine + off-screen wander; floating gesture hands; friendly hero (warm-blue + aura, NOT red); hover gaze+lean+prompt; single-click compact **draggable** panel wired to streaming `/api/chat`; double-click easter eggs; detective mode; **Knowledge Moments** (proactive context-aware insights); tab-return/inactivity awareness; budget-wallet anti-Clippy governance. Uses Azure model via existing server.
- **Design docs (in `design/`):** `rocky-spec.html`, `rocky_living_presence_interaction_spec.html`, `rocky-v2-craft-addendum.html` (EXACT v2 values: Guardian-Teal `#2ee6c8` hero, finger-level hand rig w/ spring 220/26, 8-egg catalog, T0–T3 awareness map), `whole-vm-awareness-reference-architecture.html` (on-VM agent: UIA-first perception ladder, RDP overlay, security/Recall lessons, phased roadmap). Requirements: `docs/rocky_living_presence_requirements.md`, `docs/rocky_design_principles.md`.
- **DONE:** review fixes (2 P0 chat-stream crashes + 5 P1) applied; craft polish (Guardian-Teal `#2ee6c8` hero + aura, finger-level hands, `playdead`/`spin` eggs, perf: skip-when-hidden + hoisted DOM, a11y: reduced-motion media query + `aria-live` + `R`-to-open); calm-presence redesign (rest bottom-right, purposeful movement only, hover-freeze, stable panel); **dynamic Knowledge Moments** (model-generated); **Adaptive Structured Voice** — `/api/say` returns `{emotion,tone,message}` (Azure `response_format:json_object`), client `EMAP`/`TONEBUBBLE` map it to the rig so one response drives expression+gesture+bubble+words.
- **TRUST (2026-07-01, important):** Rocky was fabricating lab state from the fixture. FIXED — `/api/say` honest-by-default (no evidence unless `LIVE_DATA` env or explicit `scenario:true` labeled simulation); every answer returns+logs a provenance `trace` (`logs/say-trace.jsonl`); UI has "🧪 Demo scenario" toggle (default off) + "demo data" badge. Verified: default → "can't verify, no active lab"; scenario → "in this simulated demo…". Principle in memory `rocky-trust-grounding`. **Rule for all future work: never present mock/assumed data as real; gate confident claims on evidence; expose provenance.**
- **PENDING:** (1) tune structured-voice prompt (enforce <28-word brevity; make insights lighter/varied, not over-focused on the failing state); (2) touch/Pointer-Events + keyboard focus-trap + contrast audit; (3) on-VM agent deployment (bake into golden image + ARM/extension config); (4) optional fact-check pass.
- App: `:5173 /rocky.html`. Endpoints: `/api/say` (kind=answer|insight|proactive, structured), `/api/chat` (legacy stream, unused by v2), `/api/applyfix`, `/api/diagnostics`, `/api/report`, `/api/inject`. Craft values in `design/rocky-v2-craft-addendum.html`. Azure key in `.env.local` — rotate (RK-04).
- **NOTE:** Azure key still in `.env.local` — rotate (RK-04). Whole-VM cross-app awareness is P3 (gated on trust answers B1–B3 + platform work).

---

### Session: 2026-06-30 (living companion) — emotion + behavior engine
**Milestone:** Upgraded the web character into a full living companion (per the user's expanded vision).
- **`web/public/index.html` rewritten:** 15-emotion engine (face/eyes/mouth/brows/glow/posture/accessories by context), living idle (look-around→think→sleep→snore, glide, jokes), proactive context engine (time-on-step/failed-attempts/inactivity/validation-transitions → hero wake-up once + milestone confetti), confidence-gated guided pointing on a simulated portal, diagnose→fix→verify→celebrate→escalate.
- **`web/server.js`:** added `/api/applyfix` (simulate fix → validations flip pass), `/api/diagnostics`, enriched `/api/report` with auto support-ready summary. **Security fix:** support summary now `redact()`-ed (was leaking the planted deployment-log secret) — re-verified clean.
- **Engine (`src/rocky.js`):** `license-issue` finding + `reportable` flag (+ test). **32 tests green.**
- **Docs:** `docs/rocky_companion_spec.md` (vision + honest capability roadmap: built-now vs needs-platform vs future-R&D), CHANGELOG, registers (TD-10/11 + resolved security).
- **Run:** double-click `start-rocky-web.bat` → http://localhost:5173. Demo flow in prototype README.
- **Honest scope:** real screen/portal CV, predictive, learning-from-behaviour are future (need platform observation + data + trust answers). Everything built is grounded in lab intent + validation/deploy state. Azure key still in `.env.local` — rotate (RK-04).

---

### Session: 2026-06-30 (web character) — animated Rocky UI
**Milestone:** Built the animated web character (the floating-robot vision) as an avatar skin over the tested agent.
- **Files:** `web/server.js` (zero-dep Node http; serves UI + proxies chat SSE so the key stays server-side), `web/public/index.html` (SVG robot: sleep/snore, glide, jokes, superhero-on-stuck; streaming chat; lab panel; report button), `start-rocky-web.bat`.
- **Engine:** added `license-issue` finding + `reportable` flag (rocky.js). UI shows **Report to technical team** → `/api/report` → ticket (logs/reports.jsonl).
- **Endpoints:** `/api/labstate`, `/api/chat` (SSE stream), `/api/inject` (simulate license issue), `/api/report`, `/api/reset`. All smoke-tested OK (deterministic, no billing).
- **Run:** double-click `start-rocky-web.bat` → http://localhost:5173 (or `node web/server.js`). Demo flow in prototype README.
- **NOTE:** still on the fixture lab; character is the avatar skin (ADR-001) over the same grounded agent. Azure key still in `.env.local` — rotate after dev (RK-04).

---

### Session: 2026-06-30 (interactive build) — multi-turn Rocky, research-driven
**Milestone:** Built the interactive, multi-turn Rocky companion — researched, tested (31 tests), proven live on Azure `gpt-5.4-nano`.
- **Research → `docs/rocky_design_principles.md`** (ITS/ZPD, Socratic tutors, agent memory, LLM cost eng; 18 cited principles).
- **New modules** in `source/rocky-prototype/`: `chat.js` (REPL), `src/agent.js`, `src/conversation.js` (memory + hint→guided→answer dial, ZPD escalate/fade), `src/intent.js`, `src/prompt.js` (pedagogy system prompt + grounding), upgraded `src/llm.js` (streaming, retries, timeout, graceful degrade), `convo-demo.js`. Tests: `test/{conversation,intent,agent}.test.js`.
- **Behavior:** deterministic-first (`/check` + failure explanations = 0 tokens); LLM only for free-form; multi-turn memory w/ summarization; slash commands; secrets redacted; self-telemetry to `logs/interactions.jsonl`.
- **Run:** `node chat.js` (interactive), `node convo-demo.js` (scripted), `node demo.js` (vs generic AI), `node --test` (31, never bills model).
- **Fixed 3 bugs via testing/running:** `convo`/`conversation` param mismatch; deterministic path not streaming; piped-stdin `close` aborting the queue.
- **Docs updated:** CHANGELOG, registers (TD-02 resolved; TD-07/08/09 added; backlog interactive=DONE), prototype README.
- **NOTE:** Azure key still in `.env.local` — **rotate after dev** (RK-04).
**Next (still human-gated):** live CloudLabs data provider (needs API auth A1) → real lab; then hallucination eval harness + CI; host as Cosmos agent (ADR-006).

---

### Session: 2026-06-30 (build) — P1 prototype BUILT and running LIVE
**Milestone:** Rocky P1 prototype built in `source/rocky-prototype/` and proven end-to-end.
- `node demo.js` — deterministic grounded diagnosis (no key needed): correctly diagnoses wrong-region root cause vs generic AI's lab-breaking "shrink the VM" advice; redaction PASS.
- `node live-test.js` — **live** call to the user's deployed **Azure OpenAI** model (`gpt-5.4-nano`, endpoint `ai-adotion.cognitiveservices.azure.com`, creds in git-ignored `.env.local`). Model, grounded, gave the correct scaffolded hint (don't shrink VM; fix region). Adapter note: newer model needs `max_completion_tokens` (no custom temperature) — handled in `src/llm.js`.
- Files: `src/rocky.js` (engine), `src/redact.js`, `src/llm.js` (Azure OpenAI + Anthropic auto-detect, loads `.env.local`), `demo.js`, `live-test.js`, `fixtures/lab-context.json`, README, `.gitignore`.
- **SECURITY:** user's Azure key passed through the session (in `.env.local`); recommend rotating it after dev as a precaution.
**Next:** swap `fixtures/lab-context.json` for a live CloudLabs **context provider** (needs API auth — checklist A1); then harden into the P1 agent (tool scope, spoiler dial UI) and host (Cosmos agent per ADR-006 or standalone). Requirements doc: `docs/model_and_infra_requirements.md`.

---

### Session: 2026-06-30 (latest) — Parallel platform deep-dive + foundational decisions
**Session Type:** 2 background agents interrogating Cosmos AI in parallel (tab 0 + tab 1) + lead decisions
**How:** Two `general-purpose` agents drove the two Cosmos tabs concurrently via `ask_tab.js <q> <label> <tabIndex> new` (tab 0 = platform/integration, tab 1 = data/AI/governance), 6 questions each, Contoso-guarded. Raw answers saved `scratchpad/cosmos/answer_A1..A6, B1..B6` (durable copies of A3/B*/earlier in `research/cosmos_session_2026-06-30/`).

**Decisions locked (lead delegated most; see `docs/decisions.md`):** ADR-001/002/003 RATIFIED; **ADR-004** v1 = P1 Guide-aware → P2 Session-aware, defer P3/P4 ("all but medium risk"); **ADR-005** students/self-paced first; **ADR-006 (proposed)** build Rocky as a scoped learner-facing Cosmos Agent reusing governed read tools + per-user OpenAI-credit rails. **Lead greenlit platform changes** (Runtime Context API, event bus, guide-pane injection point).

**Key new platform findings:** per-user **OpenAI credit** system already exists (`sync/extend-open-ai-credit`); reusable **Cosmos Agent + MCP tool** framework with approvals/audit; `cloudlabs_vm_shadow_url` (staff shadow); on-demand per-learner **validation trigger** (`.../users/{eventUserGuid}/validate`); **no eventing/SSO/LMS/webhooks confirmed**; engagement telemetry (time-per-step/attempts/drop-off/hints) NOT exposed → Rocky must generate its own; certifications/AI-residency/PII rules NOT in catalog → get from trust docs. Full detail in `docs/architecture.md` Part 2b.

**DONE since:** Platform/trust open-items asked to Cosmos (2 parallel agents, PA1-4 + GB1-3) — all 7 need human confirmation (governance flatly; A2/A3 are confirmed platform gaps). Created `docs/platform_trust_confirmation_checklist.md` (ready to hand to leads) and `docs/p1_guide_aware_spec.md` (the buildable P1 foundation).
**To do next — now mostly human/org actions:** (1) Get the checklist answered by platform (A1-A4) + trust (B1-B3) leads; (2) decide pilot lab + team/ownership + LLM budget; (3) then run the P1 spike (step 1 of the spec). AI can still produce solo: the two lead emails, the Wizard-of-Oz design (TASK-D1-01 still open), or scaffold the P1 spike. **Browser still open** (Chrome :9222, Contoso) — reusable: `node <scratch>/cosmos/ask_tab.js "<q>" "<label>" <0|1> new`.

---

### Session: 2026-06-30 (later) — Firsthand Cosmos AI interrogation
**Session Type:** Live platform research via Cosmos AI chat
**How:** Launched user's Chrome with `--remote-debugging-port=9222` (background task `bopses26z`), user logged into Cosmos manually, AI attached over CDP via playwright-core and drove the chat. Driver scripts in scratchpad `cosmos/` (`ask.js`, `status.js`, `inspect.js`). **CONSTRAINT: all Cosmos actions restricted to the Contoso tenant** (ask.js has a Contoso guard).

**What was learned (raw transcripts saved to `research/cosmos_session_2026-06-30/`):**
- CloudLabs platform model fully mapped (Partner→Template→ODL/Event→Event User→Lab Instance; browser-based VM + cloud subscription both first-party controlled). See `docs/architecture.md`.
- API reality: pull APIs for guide/validation-definitions/**per-learner pass-fail results**/deployment logs EXIST. Real-time feed, cloud-credentials/resource-inventory, drift export, and learner-facing AI do NOT (all build-required, first-party feasible).
- Rocky integration architecture drafted (P1 Guide-aware → P2 Session-aware → P3 In-VM → P4 Actionable); Cosmos AI independently corroborated ADR-002 (telemetry-first) + ADR-003 (earn proactivity).
- Cosmos chat eval: well-grounded, cites endpoints, low hallucination, author-facing.
- Updated: `docs/architecture.md`, `research/technical_notes.md`, `memory/assumptions.md` (ASM-003 → PARTIALLY VALIDATED), cross-session memory `cosmos-architecture`.

**To do next:** (1) Confirm endpoint names + validation payload schema against live API docs. (2) Resume the Wizard-of-Oz brainstorm (still open — TASK-D1-01). (3) Get ADRs ratified. (4) Optional: ask Cosmos AI about auth/security model + whether a runtime event bus is on the roadmap.
**Browser session:** Chrome on port 9222 may still be open with Cosmos logged in (Contoso). Reusable via CDP for more questions. To ask more: `node <scratch>/cosmos/ask.js "<question>" "<label>" new`.

---

### Session: 2026-06-30 (earlier) — Discovery review + knowledge-base population
**Session Type:** Discovery review + knowledge-base population
**Summary:** Ran a board-level strategic review on "Rocky" (AI companion for CloudLabs), then populated the full project knowledge base with the findings.

---

### What Was Accomplished This Session
- Delivered a 10-section board-level discovery brief on Rocky (verdict: **Great idea, transformational potential, readiness 76/100, conditional on 3 reframes**).
- Researched CloudLabs/Cosmos via public web (Cosmos = AI lab lifecycle platform: Builder + Tester/drift + MCP Agents). Could NOT access Cosmos dashboard (auth-walled) or test its AI chat (no Playwright in session).
- Populated with Rocky-specific content: `docs/vision.md`, `docs/decisions.md` (ADR-001/002/003 PROPOSED), `docs/constraints.md`, `docs/glossary.md`, `docs/roadmap.md`, `research/competitors.md`, `research/market_research.md`, `research/technical_notes.md`, `memory/assumptions.md`, `memory/project_context.md`, `memory/current_state.md`, `tasks/future_ideas.md`.
- Saved cross-session memory: project-rocky, cosmos-architecture, user-manoj.

### What Is Currently In Progress
- **Brainstorming the Wizard-of-Oz (WoW) validation experiment** with Manoj. He explicitly wants to brainstorm more, not receive a finished design. Open design questions were posed to him (setting, lab choice, human-expert interface, metrics, how to test proactivity precision, consent). Awaiting his input.

### What To Do Next
1. Continue the WoW brainstorm; converge on an experiment design, then write it into `tasks/` and `docs/roadmap.md` (Phase D1).
2. **Cosmos firsthand eval (blocked):** needs a Playwright MCP server connected + Manoj logged into `https://cosmos.cloudlabs.ai/dashboard`. Then drive the in-app AI chat and produce concrete upgrade recommendations. (Prepared question list ready — see below.)
3. Get ADR-001/002/003 ratified by Manoj.

### Warnings & Gotchas
- **No browser/Playwright tool is available in the current session** — confirmed via ToolSearch. Cosmos firsthand eval cannot proceed until a Playwright MCP is added (`claude mcp add` / `/mcp` in an interactive session).
- `requirements.md` and `architecture.md` are intentionally still mostly template — we are pre-build; do NOT invent requirements/architecture without validation.
- These docs reflect a *discovery hypothesis*, not frozen truth. ADRs are PROPOSED, not ratified.

### Files Changed This Session
- Populated: docs/vision.md, docs/decisions.md, docs/constraints.md, docs/glossary.md, docs/roadmap.md, research/competitors.md, research/market_research.md, research/technical_notes.md, memory/assumptions.md, memory/project_context.md, memory/current_state.md, memory/session_handover.md, tasks/future_ideas.md
- Cross-session memory: project-rocky.md, cosmos-architecture.md, user-manoj.md, MEMORY.md

### Open Questions
- Can Cosmos expose a learner-facing read API (lab spec + validation + drift)? (#1 unlock)
- What observation model will enterprise security accept?
- What is the junior/student vs senior/professional persona split?
- Does Cosmos already have a chat API to build on (TBD via firsthand eval)?

### Decisions Made This Session
- ADR-001 (agent/avatar decoupling), ADR-002 (telemetry-first), ADR-003 (earned proactivity) — all PROPOSED, pending ratification.

### Prepared Cosmos AI-chat eval question list (for when Playwright is available)
1. What does the chat know about the *current lab* (objective, current step, expected outcome)?
2. Can it see *live cloud resource state* or only docs/text?
3. Does it spoil answers or scaffold? Any assistance-level control?
4. How does it handle a deliberately wrong action / failed deployment?
5. Does it cite sources / ground in validation logic? Hallucination behavior?
6. Latency, and does it retain context across steps (memory)?
7. Is it learner-facing or author-facing today? Any API?
8. What would learners ask it that it currently can't answer?

---

## HANDOVER ARCHIVE

### Session: (earlier 2026-06-30) — Initial structure
Created the project knowledge-management scaffold (all docs/memory/tasks/research/design templates + README + AI_WORKFLOW.md).
