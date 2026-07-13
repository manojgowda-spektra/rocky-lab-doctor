# Changelog

All notable changes to the Rocky project. Newest first.

## [Unreleased]

### 2026-07-03 — 🎬 Demo-day readiness
- **`preflight.js`** — one-command readiness check: 22 checks across every demo-critical endpoint
  (server/model up, catalog, fleet pattern, risk flag, false-PASS finding, preview-impact 36→100,
  pre-launch lint fires + correctly skips, honest abstention, escalation redaction, apply-fix/reset
  round-trip, dead routes 404) **and warms the LLM-enrichment cache** for the three demo labs
  (cold ~2.6–4.2s → warm 5–8ms). All 22 green.
- **`start-demo.bat`** — starts the server in its own window, runs preflight, opens both demo tabs.
- **Fixed a real demo bug:** the rebuilt companion's proactive nudge fired with `scenario=false`,
  producing a self-contradicting message ("there's a problem" + "I have no data"). Now gated on the
  demo-scenario toggle. Added a "demo data" badge to the lab card (honesty labeling parity with the UI cut).
- **Made the pre-launch lint demonstrable:** the zero-telemetry RAG lab now (realistically) references
  `text-embedding-ada-002`; added the deprecation to `azure-deprecations.json`; lint catches it at 86%
  as `DEPRECATED_DEPENDENCY` (type generalized from CLI-only naming). Verified on screen.
- **`docs/demo_runbook.md`** — fresh runbook matching the post-cleanup UI (the archived one references
  cut features), incl. the three hard judge questions with honest answers and failure fallbacks.
- **Root `README.md`** de-staled: demo quickstart at top; AI-assistant reading order now points at the
  canonical docs (was pointing at archived/empty ones); audit rules codified as the coding protocol.
- Tests: **60/60**; both demo tabs screenshot-verified in final state.

### 2026-07-02 — 🧹 Complexity audit: cut, archived, and simplified (docs/rocky_complexity_audit.md)
A brutal KEEP/DEFER/REMOVE audit (6-agent adversarial red-team, each independently arguing for maximum
simplification against the real codebase) found the project accumulating impressive-looking, unvalidated
complexity. Executed the findings — nothing deleted, everything reversible (moved to archive):
- **Companion character REMOVED.** `rocky.html`'s canvas rig (11-emotion×13-tone table, 7 gesture presets,
  presence/hover state machine, drag, Easter egg, confetti, an undisclosed "Knowledge Moments" fun-fact
  economy) was ~230-260 of 390 lines, built to visual perfection with **zero real learners ever seeing
  it** — and its emotion/tone vocabulary was baked into `/api/say`'s response schema, creating a genuine
  competing-objectives risk with the endpoint's own honesty gate. `flagship.html` was confirmed **fully
  unreachable dead code**; `index.html` reachable only via a hidden `/classic` nobody ever hit. All three
  archived to `design/archive/companion-v1-eve-character/`. Rebuilt `rocky.html` as a ~135-line grounded
  panel (real lab card, chat, honesty toggles) — same backend, zero animation code. `/api/say` now returns
  `{message}` only.
- **Self-heal reframed, not removed.** The "Approve & re-validate" flow (score 36→100 with a checkmark and
  pulse) was circular: it grades its own diagnosis and calls the grade a test result — no real system is
  ever re-run. Renamed end-to-end (`revalidate`→`simulatePostFixOutcome`, route→
  `/api/labhealth/preview-fix-impact`, UI copy→"Modeled if approved... Not executed — no real system was
  re-run"). The underlying triage value (which fixes recover the most health) is real and kept; the false
  claim of verification is gone.
- **Predictive Risk Radar cut from 8-9 guessed-weight signals to 2 evidence-backed flags.** The shipped
  code had already silently drifted from its own design doc (documented 9 signals, implemented 7, with
  undocumented magic numbers) — a provenance problem, not just a calibration one. Cut the 0-100 score,
  bands, and horizon-estimate strings entirely (fake precision with zero real outcomes to calibrate
  against); kept only a verifiable fact (retired-dependency token match) and an observed-this-run
  inference (shares a fragile attribute with labs already drifting).
- **Synthetic Learner Probe cut from 12 finding types to 2.** Only `RETIRED_SKU_TOKEN` and
  `DEPRECATED_CLI_ALIAS_OR_COMMAND` were deterministic (zero model risk, unit-tested); the other 10 were
  uncalibrated LLM speculation indistinguishable in the UI from real findings. Reframed as a **pre-launch
  lint**, restricted to labs with zero telemetry (`probeLab` now skips labs that already have real fleet
  data — real evidence beats a guess). **Ask Lab Doctor deleted entirely** (route, prompt, UI): every
  answer it could give was already on screen; zero validated demand; a real (if narrow) prompt-injection
  surface via probe-authored finding titles laundered into a second LLM call as "trusted" context.
- **Cost/dead-code cuts:** deleted the untested, never-run Anthropic provider branch from `llm.js`
  (Azure-only now, ~30% smaller, 100% of what remains is test-covered); added an in-memory cache to
  `enrichFinding` keyed by (lab, finding) — proven **7.8s → 18ms** on a repeat lab-detail fetch; deleted
  the dead `/api/insight` endpoint and the live but purely-entertainment `kind:'insight'` fun-fact loop
  (up to 9 unprompted LLM calls/session, zero evidence it reduced abandonment).
- **Data minimization:** `logs/say-trace.jsonl` no longer persisted server-side — the trace is returned to
  the caller (who already has it) and never written to disk (previously stored full prompt text + raw
  learner input, forever, with zero downstream reader). `logs/interactions.jsonl` now bounded to 2,000
  lines (trims to half on overflow) instead of growing forever.
- **Docs: 34 → 17 in `docs/`, 7 → 2 in `design/`.** Archived (not deleted) superseded strategy
  (`roadmap.md` directly contradicted `hackathon_recommendation.md` two days later — never reconciled),
  ~4,000 lines of companion visual/behavioral specs for a character just removed from the live app,
  on-VM/whole-VM architecture docs for a track already parked, and empty scaffolding templates. See
  `docs/archive/README.md`.
- **Tests:** 57→**60**, all still deterministic; updated for every renamed/reshaped API. Full smoke-test
  verified live: dead routes 404, caching measured, honest self-heal copy confirmed via screenshot.

### 2026-07-02 — 🩺 Lab Doctor v3.1: research-grounded honesty (structural, not prompt-deep)
- Folded the `labdoctor-proactive-intel` research memo (5 agents, web + Microsoft Learn) → `docs/labdoctor_proactive_intel_design.md`. Made the probe's honesty **structural**:
  - **Evidence model `PREDICTED / INFERRED / NEEDS_TELEMETRY` — OBSERVED is unreachable by construction** (only the fleet engine emits it). Abstention (`NEEDS_TELEMETRY`) is a first-class, positively-valued output.
  - **Verbatim-anchor post-processor:** every probe finding must carry a `quoted_trigger` that is a real substring of the spec; unanchored findings are dropped in code (verified live — `anchorRejected` count > 0). High-staleness/live-state claims are forced to abstain.
  - **Deterministic checks (zero model risk):** retired-SKU / deprecated-command token match against `labdoctor/azure-deprecations.json` (real, citable: NCv3 retirement 2025-09-30, `allowBlobPublicAccess` flip, `az vm image accept-terms` removal, Entra ID rename, …). Caught Lab E's real hardcoded `Standard_NC6s_v3` at 93% PREDICTED; substring-overlap dedup so `Standard_NC6` doesn't double-fire.
- **Risk radar → horizon model:** weighted-hazard signals (preview-dependence, shared-drift-SKU blast-radius, region-selectable, age×velocity multiplicative, marketplace, health-decline), evidence-tagged (Observed/Inferred), with a **retired-SKU IMMINENT override**; bands map to horizons (IMMINENT ~0–90d / ELEVATED ~this quarter / WATCH ~6mo). IMMINENT reserved for a dated deprecation; attribute-only risk caps at ELEVATED (honest).
- **Ask console** prompt hardened: cite every claim to a lab, tag provenance (never upgrade Predicted→Observed), abstain on *insufficient* (not just empty) context, never assert unverified state, fixes are drafts.
- **UI:** observed / predicted / inferred / needs-telemetry evidence badges; risk-radar horizon; observed+predicted findings shown side-by-side on one lab.
- **Tests:** +2 (retired-SKU catch + dedup, IMMINENT-reserved-for-deprecation) → **59 total**, all deterministic.

### 2026-07-02 — 🩺 Lab Doctor v3: proactive intelligence (probe + risk radar + Ask console)
- **🔮 Synthetic Learner Probe** (`labdoctor/intel.js` + `GET /api/labhealth/probe?lab=`): an LLM agent that mentally *walks* a lab's spec (guide + validation defs) and **predicts** where a real learner will get stuck or where the guide/validators are wrong — **before any learner runs it.** The answer to Microsoft Drasi's synthetic-user, but grounded in our authored ground truth and it drafts the fix. Everything is labelled **PREDICTED (not observed)**, calibrated confidence, abstains when the lab looks fine. Deterministic tag-based fallback with no LLM. Verified live: on a brand-new RAG-with-AI-Search lab it predicted the region-drift trap (85%), preview-feature risk, and validator mismodeling.
- **🔭 Predictive Risk Radar** (`computeRisk()` in catalog): deterministic, evidence-backed forecast of which *currently-healthy* labs break next — strongest signal is sharing a fragile attribute (SKU family, region-selectable step) with the labs in an **active fleet drift pattern**, plus guide age + declining-health trend. Flagged "Batch Scoring on a D-series VM Pool" **high risk (72)**: *"looks healthy now, but likely to break next — uses D-series VMs, the same family already failing in an active drift pattern; guide is 175 days old."*
- **💬 Ask Lab Doctor** (`askCatalog()` + `POST /api/labhealth/ask`): a conversational analyst that answers **only** from the analyzed catalog (scores, findings, patterns, risks) — cites labs, distinguishes observed vs. predicted, refuses to invent, drafts content-team notes. Grounded context is a compact projection (no raw telemetry in the prompt).
- **Zero-telemetry labs** get a proper **`new`/unproven** status (never falsely "healthy") with a "run the synthetic probe" CTA; excluded from the health average.
- **UI:** amber risk-radar banner, Ask console (suggested-question chips + threaded answers, light markdown), **observed vs. predicted** finding badges, `new`-lab probe flow. Deep-links: `?ask=`, `?probe=1` (plus existing `?heal=1`, `?lab=`).
- **Tests:** +7 (labTags, new-lab status, risk radar + healthy-only guard, deterministic probe conservatism, grounding-context no-leak) → **57 total**, all deterministic. Grounding memo pending from the `labdoctor-proactive-intel` research workflow.

### 2026-07-02 — 🩺 Lab Doctor v2: self-heal + fleet intelligence + false-PASS
- **Self-healing loop (engine-backed, honest):** `applyApprovedFixes()` applies approved fixes' forward effect to a COPY of the telemetry and re-analyzes → real before/after. `revalidate()` + `POST /api/labhealth/revalidate`. UI: **"⚡ Approve all & re-validate"** animates the health ring (Lab A **36 → 100**, completion **9% → 81%**), marks findings resolved, labelled *projected — pending author merge* (never mutates the catalog; a human approved every fix). Guarded so a heal can never fabricate a false-pass.
- **Cross-lab fleet intelligence (the moat):** findings carry a root-cause `signature`; `detectFleetPatterns()` correlates them across the catalog. Two labs failing to the same East US SKU drift now surface a **"🛰️ Fleet pattern — a platform-level change, not an authoring mistake"** banner. No single-lab QA (or generic AI) can produce this.
- **False-PASS detection (the silent one):** a check that PASSES learners whose observed state ≠ expected is flagged critical (Lab F: *"silently PASSING learners whose work is wrong"* — 96% of fleet, **100% completion yet BROKEN**). The scariest QA defect, invisible to tickets.
- **Catalog scaled to 10 labs** with drift-over-time **history sparklines** + 7-day deltas; hero shows **healed projection (82 → 97)**, broken/watch counts, learners affected.
- **`/` now serves the flagship** EVE-character companion; the earlier chat-panel build moved to `/classic`.
- **Tests:** +7 (false-pass, env signature, self-heal, no-fabricated-false-pass, fleet pattern, healed rollup) → **50 total**, all deterministic. Verified via headless screenshots incl. the animated heal.

### 2026-07-02 — 🩺 Lab Doctor MVP: autonomous lab QA (hackathon build)
- **Shipped the hackathon pick** (docs/hackathon_recommendation.md): Lab Doctor turns fleet telemetry + the Cosmos-authored spec into continuous, autonomous lab QA — detect broken labs, rank by fleet impact, draft author-ready fixes. Rocky is the learner-facing face; Lab Doctor is the moat.
- **Competitive research** (7-agent workflow) → docs/labdoctor_market_gap.md. Validated the white space (full telemetry→diagnose→rank→draft-fix loop exists nowhere in the lab domain), the category to own (**Autonomous Lab QA**), and the top threat (Microsoft **Drasi** — detection only). Folded 3 design constraints into the build: **C1** never silently mutate (draft-only, human-approves), **C2** RCA/triage is the value center, **C3** disambiguate flake vs. drift via fleet aggregation.
- **Engine** `labdoctor/analyze.js` (deterministic-first, zero-dep, redact-first): per-validation/step fleet aggregation → anomaly rules (region **drift** w/ symptom absorption, **validation-bug** = correct learners failing a check [the C3 killer signal], **guide-clarity**, **transient/flake** correctly *downgraded*, env-permission, generic) → fleet-impact ranking → health score → optional **LLM classify + before/after fix draft** with evidence-grounded provenance + confidence.
- **Endpoints** `/api/labhealth/catalog` + `/api/labhealth?lab=` (LLM enrich on by default, `enrich=0` to skip; degrades gracefully with no LLM).
- **UI** `web/public/labdoctor.html` — premium Catalog Health dashboard: worst-first catalog, lab detail with ranked findings, evidence, grounded diagnosis, red/green fix diff, confidence, **projected-health** tease, and a **draft-only / human-approves** gate on every fix.
- **Demo tie-in** (two acts): reciprocal links between Rocky (learner) ↔ Lab Doctor (platform); `?demo=1` deep-links land the flagship character in the matching broken-lab scenario.
- **Fixtures** `fixtures/lab-catalog.json`: 3 labs — one deliberately broken (region drift + a validation bug + a confusing step), one healthy, one with a transient that must NOT be flagged broken (the restraint demo).
- **Tests:** +11 (`test/labdoctor.test.js`) → **43 total**, all deterministic. Verified end-to-end (deterministic + live Azure LLM enrichment) via headless screenshots.

### 2026-07-01 — TRUST FIX: honest-by-default grounding + provenance trace
- **Bug (caught by Manoj):** Rocky confidently described a failing deployment (westus2/region-mismatch/SKU) with no real lab — because the server always fed the mock `fixtures/lab-context.json` findings into the prompt as if real.
- **Fix:** `/api/say` is now **honest by default** — no evidence is passed unless `LIVE_DATA` (real CloudLabs APIs) or an explicit **`scenario:true`** (labeled simulation). Default → Rocky says it can't verify / has no active lab. Simulation → frames it as "in this simulated demo…".
- **Provenance trace** returned + logged (`logs/say-trace.jsonl`) on every answer: {userInput, live, scenario, evidenceUsed, dataSource, memoryUsed, toolsCalled, ragUsed, screenshotAnalysis, evidenceFound, finalPrompt}. Client logs it to console.
- **UI:** "🧪 Demo scenario" toggle (off by default) + "demo data" badge; removed false "I've read your lab" claims. Principle saved to memory `rocky-trust-grounding`.

### 2026-07-01 — Calm companion + dynamic knowledge + Adaptive Structured Voice
- **Calm-presence redesign:** Rocky rests quietly bottom-right; **moves only with purpose** (floats to point at an issue, then returns) — no wandering/off-screen trips. **Hover freezes him** (faces cursor, no drift-away). **Panel stabilized** (placed once, no per-frame motion).
- **Dynamic Knowledge Moments:** insights now **model-generated** from live lab context (varied style, non-repeating via recent-list), not hardcoded. New server endpoint; curated library kept only as offline fallback.
- **Adaptive Structured Voice** (`/api/say`): the model returns ONE JSON `{emotion, tone, message}` that drives expression + eyes + posture + hand gesture + bubble style + words together — a single source of truth. Azure `response_format: json_object`; robust parse + fallback. Client `EMAP`/`TONEBUBBLE` map the response to the rig; *celebrating* tone fires confetti, *serious*→alert, *mysterious*→thought.
- **Adversarial-review fixes applied:** 2 P0 chat-stream crashes + 5 P1 behavior bugs; perf (skip when tab hidden, hoisted DOM lookup); a11y (reduced-motion media query, `aria-live` bubbles, `R` to open panel).
- **Pending:** tighter voice brevity + more varied insights; touch/Pointer-Events + keyboard focus-trap + contrast audit.

### 2026-07-01 — Flagship redesign arc (EVE-grade) + whole-VM architecture
- **Design specs produced** (in `design/`): `rocky-spec.html` (flagship visual/motion/AI), `rocky_living_presence_interaction_spec.html` (presence/voice/magical moments), `rocky-v2-craft-addendum.html` (hands rig, Guardian-Teal hero, 8 easter eggs, T0–T3 awareness), `whole-vm-awareness-reference-architecture.html` (on-VM agent: UIA-first perception, RDP overlay, security, phased roadmap). Driven by 4 research/design workflows.
- **`web/public/flagship.html`** — canvas character core: eyes-as-emotion rig (14 emotions), 60fps rAF + `damp()` interpolation, cursor gaze-follow, Aurora-glass look.
- **`web/public/rocky.html` (v2)** — full living companion: roaming presence + idle state machine + off-screen wander; **floating gesture hands**; **friendly hero** (warm-blue + protective aura, redesigned from aggressive red); hover→gaze+lean+"Need help?"; **single-click compact draggable panel** wired to streaming AI; **double-click easter eggs** (dizzy/glitch/fall/float-away); **detective mode**; tab-return + inactivity awareness; budget-wallet anti-Clippy governance.
- **Knowledge Moments engine** — proactive, short, context-aware insights keyed to lab topic (curated accurate library + topic detection + strict cooldown/no-repeat/cap/DND governance).
- **Honest scope:** whole-Windows-VM awareness (cross-app/portal/screen) is the P3 on-VM-agent phase; in-browser Rocky senses lab state + activity + tab focus only.

### 2026-06-30 — Living companion: emotion + behavior engine
- **15-state emotion engine** (happy/excited/curious/thinking/confused/shocked/concerned/proud/sleeping/snoring/hero/celebrate/warning/investigating/idle) — face, eyes, mouth, brows, glow, posture, accessories all change by context.
- **Living idle behaviour:** look-around → think → sleep → **snore**, **glide**, and jokes (cloud/programming/AI/motivational) — suppressed while helping (non-intrusive, ADR-003).
- **Proactive context engine:** tracks time-on-step / failed attempts / inactivity / validation transitions → **hero wake-up** ("Hold on… I think I found something.", fired once) and **milestone celebration** (confetti) on fail→pass.
- **Confidence-gated guided pointing:** arrow + highlight on a simulated portal field → **Apply fix → verify → celebrate**.
- **Diagnose→fix→verify→escalate:** auto-builds a **secret-redacted, support-ready diagnostic bundle** + ticket; learner explains nothing. New endpoints `/api/applyfix`, `/api/diagnostics`.
- **SECURITY FIX:** support summary/report now redacts the deployment-log secret it previously leaked (`ConnectionString=[REDACTED]`) — caught + fixed during smoke test.
- Engine: `license-issue` finding (+test) → **32 tests**, all green.
- Spec + honest capability roadmap: `docs/rocky_companion_spec.md`.

### 2026-06-30 — Rocky Web: the animated character (avatar skin)
- **Built a local web UI** (`web/server.js` + `web/public/index.html`, zero deps) — an SVG robot that **sleeps & snores when idle, glides, tells technical jokes**, and snaps into **superhero mode** when it detects the learner is stuck or an issue appears; **streams** grounded answers from the agent.
- **Architecture (ADR-001):** brain stays server-side (agent + model key never in the browser); the UI is the configurable avatar skin.
- **Issue detection + escalation:** added a `license-issue` finding type + `reportable` flag to the engine; UI surfaces a **"Report to technical team"** button → `/api/report` returns a ticket id (logged to `logs/reports.jsonl`).
- **Endpoints:** `/api/labstate`, streaming `/api/chat` (SSE), `/api/inject` (simulate a license issue), `/api/report`, `/api/reset`. Smoke-tested all (deterministic, no model billing).
- **Launcher:** `start-rocky-web.bat` (opens browser + starts server).

### 2026-06-30 — Interactive multi-turn Rocky (research-driven)
- **Researched** ITS/ZPD pedagogy, Socratic AI tutors (Khanmigo, arXiv), conversational-agent memory, and production LLM engineering → `docs/rocky_design_principles.md` (18 cited principles).
- **Built** the interactive companion: `chat.js` REPL + modules `agent`, `conversation`, `intent`, `prompt`; upgraded `llm.js` (streaming, bounded retries, timeouts, graceful degradation, Azure+Anthropic).
- **Pedagogy:** hint→guided→answer **spoiler dial** that escalates on struggle and **fades on progress** (ZPD); never repeats a failed explanation; slash commands (`/hint /guided /answer /check /why /status /reset`).
- **Cost discipline:** deterministic-first routing — `/check` + failure explanations cost **0 tokens**; multi-turn memory with summarization-based trimming.
- **Tests:** +14 (conversation, intent, agent routing) → **31 total**, forced deterministic so tests never bill the model.
- **Proven live** (Azure `gpt-5.4-nano`): streamed, grounded, Socratic multi-turn; refuses the lab-breaking "shrink the VM" advice.
- **Fixed 3 bugs found by testing/running:** `convo`/`conversation` param mismatch (also broke `chat.js`); deterministic path didn't emit to stream; piped stdin `close` aborted the queue before draining.

### 2026-06-30 — P1 prototype: hardened + tested
- **Refactored** the prototype into clean modules: `ContextProvider` seam (fixture today / live CloudLabs stub for tomorrow), findings-driven extensible engine, redaction, LLM adapter (Azure OpenAI + Anthropic auto-detect), self-telemetry.
- **Added test suite** (17 tests, `node --test`): smoke, region/SKU correlation (regression lock for the `regionMiss.actual` bug), redaction edge cases, quota/authz/no-finding/malformed-input failure scenarios, baseline contrast.
- **Generalized engine** beyond the single scenario: region-mismatch, sku-not-available, quota-exceeded, authorization-failed, generic validation-failed — with scaffolded hint/guided/answer per finding.
- **Added** input validation + graceful error handling, `ContextProvider` abstraction, JSONL self-telemetry (`src/session.js`), `package.json`, `.gitignore`.
- **Fixed** Azure adapter for newer reasoning models (`max_completion_tokens`, no custom temperature).
- **Renamed** `live-test.js` → `live.js` so the test runner never makes billed LLM calls.

### 2026-06-30 — P1 prototype: first working build
- Built `source/rocky-prototype/`: grounded, lab-aware diagnosis proving Rocky gives the *correct* fix where generic AI gives lab-breaking advice.
- Verified **live end-to-end** against the user's Azure OpenAI deployment (`gpt-5.4-nano`).

### 2026-06-30 — Discovery & definition
- Board-level strategic review (verdict: great idea, ~80/100). Full knowledge base populated.
- Firsthand CloudLabs platform research via Cosmos AI (18 questions). Architecture + integration plan.
- Decisions ADR-001…006; platform/trust confirmation checklist; P1 spec; model & infra requirements.
