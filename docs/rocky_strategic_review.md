# Rocky — Strategic Review (Chief Architect / CPO / CTO cut)

> A full-project critique, redesign, and roadmap. Written to be handed to implementation models as the
> governing strategy document. Challenges everything built and believed to date, including this project's
> own prior conclusions.
> **Created:** 2026-07-02. Companion docs: `rocky_business_case.md`, `rocky_product_strategy.md`,
> `labdoctor_market_gap.md`, `labdoctor_proactive_intel_design.md`, `hackathon_recommendation.md`.

---

## PART 1 — CRITIQUE

### The one-sentence verdict
We have been building the mascot and the moat in the wrong order, on a substrate that doesn't exist yet: the demos are exactly right as a *pitch*, and exactly wrong as a *foundation*.

### 1.1 The two substrate gaps nobody has funded (the weakest point in the whole project)
Everything valuable Rocky does — grounding, troubleshooting, Lab Doctor, prediction, self-healing — rests on two data assets, and **neither is confirmed to exist at the required quality**:

1. **The expected-state model.** Validation definitions exist per step, but their *coverage and richness across the real catalog* is unknown. A validator that checks "resource group exists" cannot ground "did I do this step correctly?" The project's ceiling is exactly this model's ceiling — this was identified before and still has no funded workstream.
2. **The telemetry contract.** Lab Doctor's engine assumes step timings, retries, and error events. The *confirmed* platform reality is poll-based validation results + deployment logs. There is no event bus, no confirmed step-timing source, no retry counts. Our fixtures are richer than the platform. That means the flywheel is currently a story, not a pipeline.

**Fix:** treat both as first-class engineering artifacts. A 5-event telemetry spec (`step_started`, `validation_run{result, attempt}`, `error_seen{code}`, `help_requested`, `session_ended`) negotiated with CloudLabs engineering, and an expected-state audit of the top-50 labs. This is the least glamorous and single highest-leverage work in the project.

### 1.2 Overrated: the character as the product
The EVE-grade companion is beautiful — and it is a *rendering*, not a product. It was built to visual perfection before a single learner interacted with it. Three honest problems:

- **Unproven demand.** Learners don't demonstrably want a companion; they want *unblocking*. Every "wow moment" we listed (the invisible catch, the root-cause reveal, taking the learner's side) works identically when delivered through a plain panel.
- **Enterprise risk.** The buyer is a training-ops lead or partner exec. A cartoon robot in the sales deck can *subtract* credibility from a hard-ROI product. The capability must lead; the character must be optional skin.
- **Wrong help surface.** The best moment for help is *inside the failure*: a "Diagnose" button on the failed validation row, an annotation on the error toast — not a character across the screen that notices. Chat is friction for a stuck learner; one click beats one sentence typed.

**Verdict:** the companion is a *surface* over a Help Kernel. Ship the kernel through embedded surfaces first; A/B the character and let it earn its place with "keep Rocky on" and completion deltas. (It may well win — delight is real — but it must win as evidence, not as identity.)

### 1.3 Overrated: perception maximalism
The architecture lists OCR, vision, UI Automation, on-VM agents, resource graph, event streams. Each sensor added multiplies privacy surface, cost, latency, and noise. The session's own evidence cuts against this: **Lab Doctor found six defect classes — drift, false-fail, false-pass, clarity, env, flake — from three boring sources** (validation results, deploy logs, guide structure). The ~70% of real lab failures are env/permission/timing class, which no screen-pixel sensor helps with.

**Principle to adopt:** a sensor is added only when a specific, *measured* failure mode requires it. On-VM/UIA/vision moves to a research track, gated on the governance checklist. It should not appear in the next two phases of the roadmap.

### 1.4 Overrated: per-learner memory and the skill graph (for now)
CloudLabs learners are largely **event-transient** — an EventUser exists for a day. A longitudinal skill graph across a one-day relationship is fiction, and it drags the heaviest privacy anchor in the project. What actually pays now: **session memory** (built) and **fleet memory** (aggregate patterns). Longitudinal learner models become real only for persistent-identity enterprise programs — Phase 4+, consent-gated, and only if a customer asks.

### 1.5 Wrong assumption: "companion = adoption engine"
The belief was: delight earns observation rights, which feed the flywheel. But **observation rights are granted by contract and consent, not by cuteness** — the buyer signs them, the learner acknowledges them. The actual adoption engine for the *business* is Lab Doctor: "turn this on and your catalog stops rotting" is an easier enterprise sale than "your learners will love this robot." Inversion: **Lab Doctor acquires the account; the companion retains the learner.** The session accidentally proved the independence claim too — Lab Doctor ran end-to-end without any companion involvement.

### 1.6 Wrong assumption: "generic AI can't reach the lab context" is a durable moat
It's true today and eroding fast. MCP is standardizing context access; Copilot already lives inside the Azure portal where the learner works. In 12–24 months, "the assistant can see your environment" will be table stakes. **The durable moat is not the context window — it's the closed loop through the artifact**: authored ground truth (validators + expected state) → fleet outcomes → regeneration (Cosmos Builder). Microsoft can read the learner's screen; it cannot rewrite a partner's lab, re-validate it, and prove the fix worked, because it doesn't own the artifact or the fleet. Every investment decision should be re-ranked against "does this deepen the loop?"

### 1.7 Weak: support strategy measures the wrong thing
"Deflection" counted as "didn't file a ticket" rewards learners giving up. Deflection must be measured as **resolved-and-completed**: the issue Rocky handled, followed by validation passing. Otherwise the support numbers will look great while completion quietly falls.

### 1.8 Weak: business model is unstated
Decide now: **Lab Doctor = premium ops SKU** (hard ROI: QA hours, MTTD, tickets — priced per monitored lab-session); **companion = included differentiator** (win-rate, NPS); **fleet benchmarks = future data product**. Leaving this implicit invites building three products and pricing none.

### 1.9 Underrated: the guide itself is the biggest learning lever
The best pedagogy in the project isn't hints — it's Lab Doctor's guide-clarity findings. A fixed confusing step improves learning for 100% of future learners at zero runtime cost and zero hallucination risk. Learning-science guardrail to add: **productive struggle** — help offered too early harms learning; intervention thresholds should be tuned to protect struggle time, not minimize it. And after any unblock, a one-question optional "quick check" turns rescue into retention (and gives us a transfer-of-learning metric nobody in this market reports).

### 1.10 Remove / park / rename
- **Park:** vision/OCR pipeline; on-VM agent (until the trust checklist is answered by CloudLabs); longitudinal skill graph; the Wizard-of-Oz experiment plan (superseded by a working prototype).
- **Trim:** the insight/joke breadth — keep the budget-wallet, cut the modes to a few that are contextual.
- **Rename:** stop calling the platform capability "Rocky" in buyer conversations. Rocky is the learner-facing persona. The platform layer is Lab Doctor (or a more enterprise name). One pet name for two audiences muddles both stories.

---

## PART 2 — NEW IDEAS (not previously discussed)

1. **Pre-Flight Check.** At lab-launch, before the learner types anything: verify quota, SKU-region availability, marketplace terms, RBAC propagation on *their specific instance*. Greet with "I pre-checked your environment — two issues fixed before you arrived." Env-class failures are the most painful and least learner-fixable class; this kills them **before they happen**. Cheap (platform-side checks), enormous deflection, and no competitor does per-instance pre-session QA.
2. **The Instructor Cockpit.** CloudLabs is event-heavy, and *nobody has designed for the instructor* — the highest-leverage human in the room. Live class heatmap (who's on which step, who's stuck, why), one-click "broadcast a hint," a class-level help dial ("hints only today"), post-event class report. Rocky becomes the instructor's TA. This is the most buyer-visible surface in the whole portfolio and it's mostly telemetry UI — low AI risk.
3. **Event Rehearsal Mode.** Before a 500-person workshop: one click runs the synthetic learner (and optionally live dry-runs) across the event's entire lab list → go/no-go readiness report with drafted fixes. "Never walk into a workshop with a broken lab." Directly monetizable against CloudLabs' event business.
4. **Author-side Lab Linter (shift-left Lab Doctor).** The synthetic probe runs *inside Cosmos Builder as the author types*: "this validator will false-pass," "this SKU retires in 90 days," "step 7 bundles four UI targets." The fleet's finding taxonomy becomes lint rules. ESLint for labs — and it makes the flywheel visible to authors daily.
5. **Ghost runs & fleet hints (the Dark Souls mechanic).** Anonymized successful trajectories become "ghosts": a stuck learner can see the exact path that worked, and failure points carry curated fleet messages — "312 learners stuck here; this fix worked for 89%." Social proof is the strongest form of "it's not you" — and it converts fleet data into direct learner value.
6. **Time-to-Green as the product's One Number.** Every session, lab, and catalog has a time-to-green (all validations pass). Learners see a live green-wall; partners see percentile benchmarks; Rocky's job description becomes "minimize honest time-to-green while protecting learning." Everything — companion, Doctor, cockpit — moves the same metric.
7. **Verifiable hands-on transcripts.** Rocky observes validations and steps; it can emit a signed "what this learner actually did" record — audit-grade, anti-cheating completion evidence. As AI makes certification cheating trivial, *proof of hands-on competency* becomes a premium enterprise claim.
8. **The Incident Model.** A fleet pattern isn't a dashboard row — it's an *incident*: open → notify (Slack/Teams) → track → auto-drafted postmortem. Ops teams already think this way. Positions Lab Doctor as "Datadog + PagerDuty for training catalogs" and buys enterprise integration hooks cheaply.
9. **Self-tuning validations.** We already detect transient flake per validator; feed it back so validators carry learned retry/backoff policies, updated by Cosmos automatically. Small, shippable, authentically "self-healing," zero trust risk (it only makes checks more patient, never more lenient).
10. **Cross-tenant benchmark network.** Anonymized network medians: time-to-green, failure rates, health scores per topic. Every customer makes the benchmark better; the benchmark attracts customers — a true network effect, plus a quarterly "Lab Health Index" as a marketing engine.
11. **The fear-killer skill.** Beginners' #1 emotional blocker is fear of breaking things or running up cost. Rocky knows the expected resource set and can answer "is this normal? did I break something? what does this cost?" Comfort as a feature; measurable in abandonment.
12. **Grounded multilingual delivery.** Render help — and eventually the guide — in the learner's language with cloud terminology kept canonical. Low-risk (grounded in the authored guide), high-value for global training partners.

---

## PART 3 — THE NEXT BIG THING

The evolution ladder, each rung earned by the one below:

- **Rocky 2.0 — the Trinity.** One kernel, three surfaces: learner (companion/panel), instructor (cockpit), author (linter). Same truth, same telemetry, three users. This alone is category-leading in training.
- **Rocky Enterprise — the Reliability Layer for Guided Work.** The engine is "expected-state vs. observed-behavior over a guided flow." Labs are the first guided flow. **Runbooks, onboarding checklists, internal enablement, compliance procedures are all labs.** Same engine, vastly larger market: every enterprise's internal guided work, continuously QA'd by its own usage.
- **Rocky Agent Network / OS.** Grounded lab-context intelligence served via MCP: partners' own tools query "why did this learner's deployment fail?" Rocky stops being an app and becomes the intelligence layer other software builds on.
- **The Knowledge Engine (endgame).** The fleet corpus — failure modes, fixes, time-to-green, confusion hotspots — becomes the training and evaluation substrate for lab-*authoring* AI. Closing the biggest loop of all: **AI authors labs, the synthetic learner pre-validates them, the fleet confirms them, and the corpus makes the next authoring better.** Rocky becomes the trust layer that makes AI-generated technical training safe to sell. That is a category: **Autonomous Lab Reliability**, growing into Guided-Work Reliability.

---

## PART 4 — TOP PRIORITIES (resource-constrained, ranked)

1. **The substrate: telemetry contract + expected-state audit.** Highest strategic value, zero glamour, long lead time — start immediately. Everything else's ceiling.
2. **Lab Doctor on real data.** Swap fixtures for the live validation-results API; weekly catalog report; fleet patterns on real cohorts. Hard ROI to the buyer; begins the moat corpus. (The demo exists; productionizing is mostly ingestion + auth.)
3. **Point-of-failure Troubleshooter pilot.** "Diagnose" button on failed validations in 5 high-traffic labs — the Help Kernel through an embedded surface. Direct learner value, the flywheel's sensor, measurable deflection/completion.
4. **Pre-Flight Check.** Cheapest big win in the portfolio; kills the worst failure class before it exists; demos brilliantly.
5. **Instructor Cockpit v1.** Event DNA, buyer-visible, low AI risk. The wow that closes enterprise deals.

The character polish, whole-VM work, skill graph, and additional demo fixtures all rank **below** these — explicitly.

---

## PART 5 — ROADMAP

**Phase 1 (0–3 mo) — Foundations & Proof.**
Features: telemetry contract v1 (5 events); expected-state audit of top-50 labs; Lab Doctor reading real validation telemetry (read-only weekly Catalog Health report); Troubleshooter pilot (embedded panel) on 5 labs.
Dependencies: CloudLabs eng buy-in on events; API auth; partner consent for pilot.
Risks: telemetry gaps larger than expected (mitigate: derive coarse timings from validation polls); auth friction.
Outcomes: first real detection of a broken lab before a ticket; deflection and completion deltas on pilot labs.
Metrics: MTTD (target: days → hours), resolved-and-completed deflection %, pilot completion delta, expected-state coverage % of top-50.

**Phase 2 (3–6 mo) — Close the Loop.**
Features: draft-fix → Cosmos Builder PR flow (human-approved); self-tuning validations; Pre-Flight Check; fleet-pattern incidents with Slack/Teams alerts; companion character as opt-in A/B against the embedded panel.
Dependencies: Builder write API; Phase-1 telemetry live.
Risks: first bad draft-fix burns author trust (mitigate: confidence gates, evidence-first UI, easy rollback); A/B contamination.
Outcomes: **first self-healed lab in production** (detected → drafted → approved → re-validated); env-class tickets measurably down.
Metrics: QA hours −30%, drafted-fix acceptance rate >60%, pre-flight catch rate, A/B: "keep Rocky on" %, completion delta character-vs-panel.

**Phase 3 (6–12 mo) — The Event Layer.**
Features: Instructor Cockpit; Event Rehearsal mode; live event telemetry; ghost-hints v1 (curated); fear-killer + multilingual skills.
Dependencies: event-session telemetry; instructor design partners (interview 3+ now).
Risks: instructor workflow misfit (mitigate: co-design); hint curation cost.
Outcomes: marquee partners run events with rehearsal + cockpit; sales cites it in wins.
Metrics: event NPS, instructor adoption %, rehearsal go/no-go accuracy, stuck-time reduction in ILT.

**Phase 4 (12–18 mo) — Intelligence & Scale.**
Features: predictive radar calibrated against realized breaks (ECE tracked); author-side linter GA in Builder; benchmark network alpha; verifiable transcripts; consent-gated learner memory for persistent-identity customers only.
Dependencies: 6+ months of fleet corpus; multi-tenant anonymization framework.
Risks: prediction credibility (only surface calibrated bands); benchmark participation cold-start (seed with own catalog).
Metrics: radar precision on realized breaks, linter findings-per-authored-lab, % catalog under monitoring, first data-product revenue.

**Phase 5 (18–30 mo) — The Platform.**
Features: Reliability layer for runbooks/onboarding (first non-lab vertical); Rocky agents via MCP; knowledge-corpus products; AI-authored labs gated by synthetic-learner validation.
Dependencies: everything above; enterprise design partner outside training.
Risks: focus dilution (gate: only enter when lab-market metrics are green).
Metrics: non-lab pilot value, MCP integrations, % of new labs AI-authored-and-auto-validated.

---

## PART 6 — THE CEO MEMO

**Why invest.** Our costs and our customers' trust both scale with the catalog, and the catalog rots on the cloud vendors' schedule, not ours. Today that's managed with human QA and support tickets — linear cost, reactive quality. The engine we've prototyped turns every learner session into a free QA run and every failure into a drafted fix. Quality becomes compounding instead of decaying.

**Why now — the sharp version.** Generative authoring (Cosmos) is about to collapse the marginal cost of *creating* labs. More content at the same rot-rate means **more rot** — reliability becomes the bottleneck of the entire AI-authoring strategy. Whoever owns reliability owns the right to scale content. Simultaneously, MCP-style standards will soon let any generic copilot see a learner's context; the 12–24-month window is to entrench the thing context access can't copy: the closed loop through the artifact.

**Why competitors struggle.** Autonomous lab QA needs four things at once: lab execution, authored ground truth (validators/expected state), fleet telemetry, and a regeneration engine to draft fixes in-format. Skillable has the validation primitive pointed at grading learners, not labs. Instruqt has author-side CI, human-driven. Microsoft's Drasi proved synthetic detection and stopped — no fleet ranking, no fix drafting, and no ownership of partners' artifacts. We hold all four ingredients today.

**The moat, precisely.** Not the character, not context access — (1) the closed loop through the artifact, (2) the accumulating failure-mode corpus (the largest structured record of how cloud labs break and how they were fixed), (3) the benchmark network effect, (4) the trust architecture (evidence-typed findings, draft-only fixes, calibrated abstention) that enterprises can actually audit.

**Category-defining claim.** "Self-maintaining hands-on labs": the labs test themselves, flag themselves, draft their own fixes, and prove the fix worked — with humans as editors, not inspectors. Nobody in training can say this sentence today.

**What kills it (ranked by likelihood):**
1. **Substrate starvation** — we never fund the telemetry contract and expected-state model, and the whole thing stays a demo. (Most likely, most boring, fully in our control.)
2. **A trust incident** — one confidently-wrong answer or bad auto-fix in an enterprise pilot. (Mitigation is built: provenance, draft-only, abstention — keep it non-negotiable.)
3. **Mascot-led selling** — leading with the character and getting laughed out of enterprise rooms. (Capability leads; character is an A/B.)
4. **Microsoft bundles "good enough"** — Copilot-in-portal does 60% free. (Counter: multi-cloud, partner-owned artifacts, the loop, speed.)
5. **Privacy/works-council blowback** on learner observation. (Counter: aggregate-first, consent, telemetry-only default, EU-friendly posture from day one.)

**The ask.** A small dedicated team — two engineers, one product owner with pedagogy background, one Cosmos liaison — two quarters, gated at Phase 1 metrics. The prototype and research are done; this is now an integration-and-proof problem.

---

## PART 7 — FINAL RECOMMENDATION (with full authority)

**STOP**
- Character/visual polish and new companion behaviors. It's at demo-grade; further investment is decoration until an A/B earns it.
- All whole-VM/OCR/vision exploration. Park it behind the governance checklist.
- Skill-graph and longitudinal memory design. Fleet + session memory only, until a persistent-identity customer exists.
- Building richer *fixtures*. The fixtures are now ahead of the platform and are hiding the substrate gap.

**START (this week)**
- The **telemetry contract** conversation with CloudLabs engineering — longest lead time, highest leverage, everything depends on it.
- The **expected-state audit** of the real top-50 catalog: coverage, richness, gaps — the number that sets everyone's ceiling.
- **Real-data ingestion** for Lab Doctor (validation-results + deployment-log APIs behind the existing `ContextProvider` seam).
- **Instructor discovery**: interviews with 3 instructors who run CloudLabs events; the cockpit is designed from their triage reality.
- A **Pre-Flight Check spike** (~2 weeks): per-instance quota/SKU/terms verification at launch.

**REDESIGN**
- Architecture, from the agent-centric "Perceive → Ground → Reason → Act" to a **three-plane platform**:
  **Truth Plane** (guide + validators + expected-state, versioned in Cosmos) · **Signal Plane** (telemetry contract, fleet aggregation, the corpus) · **Action Plane** (thin surfaces over one Help/QA kernel: learner panel *and optionally the character*, instructor cockpit, author linter, ops incidents). The companion becomes one renderer among four — which is exactly the demotion it needs and the promotion the kernel deserves.
- Positioning: split the names. Rocky = the learner persona. The platform capability gets an enterprise name. Two audiences, two stories, one engine.
- Metrics: adopt **Time-to-Green** as the north-star operational metric and **resolved-and-completed** as the only deflection definition.

**PRIORITIZE (in order)**
1. Substrate (telemetry contract + expected-state audit)
2. Lab Doctor on real data
3. Point-of-failure Troubleshooter pilot (embedded surface)
4. Pre-Flight Check
5. Instructor Cockpit v1

**The brutal summary.** Everything built so far — the companion, Lab Doctor, the probe, the radar, the console — is the right *pitch* and won the argument. The product now lives or dies on unglamorous things no demo shows: an event spec, an expected-state audit, real API ingestion, and an instructor interview. Ship the moat in a plain suit; let the mascot audition for its job in an A/B. The endgame — AI authors the labs, the synthetic learner pre-validates them, the fleet confirms them — is worth organizing the whole company around, and it starts with five telemetry events.
