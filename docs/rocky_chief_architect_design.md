# Rocky — Chief Architect design

**Date:** 23 September 2026
**Author's remit:** design the best possible Rocky. Failure is not acceptable.
**Method:** measured on this machine where measurable; cited to primary sources where not.
**Supersedes:** `rocky_architecture_2026.md` (which this extends rather than replaces)

---

## 1. Executive summary

Rocky is an **event-driven step tutor with a cheap always-on monitor and a rare, expensive
reasoner** — the shape every credible system in this space converged on, arrived at
independently by intelligent tutoring systems (VanLehn's inner loop), procedural task guidance
(Pro²Assist's change-gating), and production computer-use agents (Operator's injection monitor
in front of its planner).

The design rests on six numbers, three measured here and three from the literature:

| | |
|---|---|
| Full browser perception: detect → extract → match → coordinates | **1.0 ms** (measured) |
| Meaningful page events during a navigation | **3** (measured; 0 while reading) |
| Windows built-in OCR, focused-window region | **49 ms** (measured; Microsoft publishes none) |
| LLM calls as a share of computer-use-agent latency | **76–96%** (OSWorld-Human) |
| Interrupting mid-task vs at a boundary | **2× errors, up to +106% annoyance** (Bailey & Konstan) |
| Students given an answer-giving LLM, after it was removed | **17% worse than never having it** (Bastani, PNAS 2025) |

Those last two are the reason this document exists. You asked for Rocky to be *more*
intelligent by reasoning continuously. The evidence says continuous reasoning is neither what
makes a tutor intelligent nor what learners benefit from — and that the failure mode you are
trying to avoid (a fast but stupid Rocky) and the failure mode you would create (a talkative,
answer-giving Rocky) have very different costs. One is disappointing. The other measurably
harms the learner and reliably gets the product hated.

**The answer to your A/B/C question is C, with a correction to what C means.** The hybrid is
right, but the "always-running lightweight reasoning" should not be a *model*. It should be a
**continuously maintained world model** — a task graph, a learner state, a confidence estimate
— updated on every event in about a millisecond, with a model consulted when that world model
says something interesting has happened. That is how Rocky is continuously context-aware
*and* fast. Intelligence lives in the state, not in the token stream.

---

## 2. Challenge to your assumptions

I was asked not to validate. Five challenges, in descending order of how much they change the
build.

### 2.1 "If AI reasoning is rare, Rocky is not intelligent enough"

This conflates **reasoning frequency** with **context awareness**. They are separable, and
every strong system separates them.

Consider what Rocky needs to know at any instant: which lab, which step, what is on screen,
what the learner just did, whether they are stuck, what comes next. **None of that requires a
model to maintain.** It requires a state machine fed by events — which I measured at 1.0 ms
per update. A model that re-derived it from scratch every few seconds would be slower, more
expensive, *and less reliable*, because it would re-derive it differently each time.

The literature is unanimous on loop structure. Anthropic's Computer Use, OpenAI's CUA, Browser
Use and Microsoft's UFO2 all run the model **once per turn, triggered by an event** — none on
a timer. The one continuously-running model in production is Operator's prompt-injection
monitor, and it is a cheap classifier whose only job is to **pause**, not to plan.

Pro²Assist (IMWUT 2026) is the closest published analogue to Rocky and makes the point
exactly: its VLM reasoner is **gated behind gyroscope and optical-flow thresholds**, and its
output is **suppressed when the predicted step and status match the previous moment**. The
reasoning is rare *by design*, and it achieves 93.6% step accuracy and 2.29× the proactive-
timing score of baselines.

> **Intelligence is in the world model, not the call frequency.** Rocky should know everything,
> all the time, at 1 ms — and speak rarely.

### 2.2 The real risk is the opposite of the one you named

You are worried Rocky will be too quiet to be useful. The evidence says the dangerous
direction is the other one.

- **Bailey & Konstan (N=50):** interrupting during a task rather than between tasks produced
  **2× the errors, +3–27% completion time, +31–106% annoyance**, and double the anxiety
  increase. Deferring "just a few seconds" mitigated most of it.
- **Adamczyk & Bailey:** interrupting at good breakpoints rather than bad ones cut annoyance
  **56%**, and **43%** versus random timing.
- **Swartz's Clippy post-mortem (Stanford, advised by Nass):** the fatal property was that the
  proactive offer "continues to persist... despite being dismissed an arbitrary number of
  times". It "breaks every relevant etiquette rule: it ignores social conventions of when to
  disturb someone, it does not learn from its mistakes". Horvitz's own account is that the
  *research* system had Bayesian goal inference and cost–benefit timing, and the shipped Office
  Assistant "employed a relatively simple rule-based system" without them.

A Rocky that reasons continuously will find something to say continuously. That is the
documented path to being switched off.

### 2.3 Continuous AI is also a privacy architecture decision, not just a cost one

Windows Recall is the cautionary case and it is recent. Continuous capture, on by default,
with OCR text in an unencrypted local SQLite file readable by any user-level process. The
backlash forced: **opt-in, Windows Hello presence, VBS enclave, TPM-bound keys, Purview-based
sensitive-content filtering, per-app/site exclusion, InPrivate never saved** — and it shipped
about a year late, only on hardware that can enforce it.

Microsoft Copilot Vision, designed after that lesson, is **user-initiated and session-bound**:
"Copilot only works with content shared during the active session", and when the session ends
it "immediately stops observing".

Your own `constraints.md` already encodes this as **SC-001: must support a telemetry-only /
no-screen-capture mode**, described as "likely a hard gate for regulated buyers". An
architecture whose default is continuous screen reasoning cannot satisfy that constraint
without being rebuilt. An event-driven architecture that reads structure (not pixels) and
calls a model rarely satisfies it by construction.

### 2.4 "Rocky should help complete labs" is in tension with the product's purpose

**Bastani et al., PNAS 2025**, randomised, ~1,000 students: access to an answer-giving GPT
tutor improved performance *while available* by 48%, then left students **17% worse than
students who never had it** once removed. **31% of first messages were "what is the answer?"**
The tutored variant — same model, prompted to give hints and withhold answers — largely
eliminated the harm.

Khan Academy, over 352k tutoring threads, found that restricting the model's context to *the
work the student had already done* cut latency ~400 ms **and halved instances of giving the
answer away**.

But the opposite failure is real too: in the Khanmigo field study, when the assistant refused
to give answers, "students largely stopped using it."

The resolution is not a dial between helpful and unhelpful. It is **Rocky's existing edge**:
*pointing is not telling*. Showing a learner where "Default permission" is does not tell them
what to set it to. That is the pedagogically correct intervention and it happens to be the one
thing a chat window structurally cannot do.

### 2.5 Assessment Mode as specified would be a compliance problem

You describe it as "identifies where the learner is but does not reveal answers immediately".
"Immediately" implies eventually. If CloudLabs assessments carry any certification value,
a companion that eventually reveals answers invalidates the assessment.

**Recommendation:** Assessment Mode is *observation only* — progress tracking and telemetry for
the instructor, zero guidance to the learner, and a visible indicator that Rocky is silent. If
a customer wants hints during assessment, that is their explicit configuration decision and it
should be logged per session.

---

## 3. The recommended architecture

### 3.1 The shape, in one picture

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │  SENSORS            event-driven, never polled                         │
   │  browser: MutationObserver + history patch + focus/click               │
   │  desktop: UIA event subscriptions (focus, structure, property)         │
   │  cloud:   lab validation / resource state (when available)             │
   └───────────────────────────┬────────────────────────────────────────────┘
                               │  events, ~3 per navigation (measured)
                               ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  PERCEPTION         cheapest surface that can answer                   │
   │  DOM extract 2.9 ms · focus-scoped UIA 2.8 ms · OCR 49 ms · vision     │
   └───────────────────────────┬────────────────────────────────────────────┘
                               │  ScreenState: controls, names, boxes, roles
                               ▼
  ╔════════════════════════════════════════════════════════════════════════╗
  ║  WORLD MODEL            ALWAYS CURRENT · ~1 ms · NO MODEL CALL         ║
  ║                                                                        ║
  ║   TaskGraph        the lab, parsed once: steps, order, surfaces,       ║
  ║                    preconditions, expected end-state                   ║
  ║   Position         belief over "which step am I on" (filtered, not     ║
  ║                    a guess — confidence accumulates over events)       ║
  ║   LearnerState     attempts, errors, dwell, oscillation, mastery       ║
  ║   Resolution       for the current target: resolved / ambiguous /      ║
  ║                    absent, with score and margin                       ║
  ║   InterventionBudget   what was said, when, what was dismissed         ║
  ╚═══════════════════════════╤════════════════════════════════════════════╝
                              │  this IS the continuous awareness you asked for
                              ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  MONITOR            cheap classifier, runs on every event, ~1 ms       │
   │  Is anything worth saying? Decides: SILENT / POINT / ASK / ESCALATE    │
   │  (Operator's injection monitor is the production precedent)            │
   └───────────────────────────┬────────────────────────────────────────────┘
                   ┌───────────┴────────────┐
            95%    │                        │  ~5%
                   ▼                        ▼
         ┌──────────────────┐   ┌──────────────────────────────────────────┐
         │ DETERMINISTIC    │   │  REASONER      LLM, 300–2000 ms          │
         │ point / silent   │   │  receives the WORLD MODEL as text, not   │
         │ 0 model calls    │   │  pixels. Explains, diagnoses, disambig-  │
         └──────────────────┘   │  uates. NEVER chooses the glow.          │
                                └───────────────────┬──────────────────────┘
                                                    │
                                                    ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  GOVERNOR           the last gate before the learner sees anything     │
   │  contract (0.70/0.20/no-contradiction) · interruption budget ·         │
   │  breakpoint deferral · dismissal memory · mode policy                  │
   └────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Answering A vs B vs C explicitly

| | Verdict |
|---|---|
| **A. Strict escalation** | Correct on latency, wrong on proactivity. A pure escalation ladder is *reactive* — it only acts when the learner's action triggers it, so it cannot notice that nothing has happened for four minutes. Rejected as stated. |
| **B. Continuous AI co-pilot** | Rejected. Contradicted by every production loop (all event-driven), by the interruption evidence, by SC-001, and by cost. Would also be *less* accurate: a model re-deriving state each cycle is non-deterministic across cycles. |
| **C. Hybrid** | **Adopted, with the correction that "always-running lightweight reasoning" means an always-current world model plus a cheap monitor, not a small LLM on a timer.** |

**Why the correction matters.** "Always-running lightweight reasoning" naturally reads as "a
small model, often". But a small model on a timer gives you the worst of both: still hundreds
of milliseconds, still non-deterministic, still a per-call cost, and *still* needs a
deterministic layer to check it. Replacing it with a state machine costs 1 ms, is exactly
reproducible, and is auditable after the fact — which matters when a learner says "Rocky told
me to click the wrong thing."

**Where a small model does earn its place** (and this is the one place B is right): the
monitor's hard cases. When behavioural signals are ambiguous — is this learner stuck or just
reading? — a 2B-class classifier over the world-model *text* is genuinely better than a
threshold. That is a bounded, cheap, cacheable call, and it fits the cascade evidence:
FrugalGPT reports up to 98% cost reduction at equal quality; RouteLLM routes 14–26% of queries
to the strong model at 95% of its quality.

### 3.3 The cadence, stated precisely

| Trigger | What runs | Cost |
|---|---|---|
| DOM mutation / UIA event | perception → world model → monitor | **~1–4 ms** |
| Monitor says POINT | resolve + glow | **+0.1 ms** |
| Step boundary reached | world model advances; queued nudges flush | ~1 ms |
| Monitor says ESCALATE | reasoner, on world-model text | 300–2000 ms |
| Learner asks a question | reasoner, always | 300–2000 ms |
| Stuck predicate fires | reasoner, with recovery prompt | 300–2000 ms |
| **Nothing happening** | **nothing** | **0** |

Measured on a live Microsoft SPA: **0 meaningful events in 10 s of reading; 3 during a
navigation.** The idle case is genuinely free.

---

## 4. Why this architecture wins

1. **It is the convergent answer.** ITS (VanLehn), procedural guidance (Pro²Assist, STORM-PSR),
   and production agents (Anthropic, OpenAI, UFO2, Browser Use) independently arrived at
   event-driven + cheap-monitor + rare-reasoner. When four unrelated fields converge, the
   burden of proof is on deviating.
2. **It is fast where speed is perceptible** (the glow, 1 ms) and slow only where the learner
   is already waiting for thought (an explanation).
3. **It is auditable.** Every glow traces to a score, a margin, and a rule. When Rocky is
   wrong, you can say why. A continuously-reasoning Rocky cannot offer that.
4. **It satisfies SC-001 by construction** — structure-first, pixels only on fallback, and a
   telemetry-only mode is a configuration, not a rewrite.
5. **It degrades honestly.** Each layer's failure has a defined successor, ending in "I cannot
   see that" rather than a guess.

---

## 5. Perception design

### 5.1 Browser labs

| Role | Mechanism | Measured |
|---|---|---|
| **Change** | `MutationObserver` (subtree, attributeFilter) + patched `pushState`/`replaceState` + `popstate`/`hashchange` | 0 events idle, 3/navigation |
| **Primary read** | in-page `querySelectorAll` over interactive roles, **piercing shadow roots**, viewport-clipped | **2.9 ms** |
| **Names** | `aria-label` → `innerText` → `value` → `title`, plus `role`, `id`/`data-testid`, disabled state | included above |
| **Coordinates** | `getBoundingClientRect` | included above |
| **Hover** | `elementFromPoint` | **0.1 ms** |
| **Secondary** | CDP `Accessibility.getFullAXTree` if the extension ever runs with debugger rights | unmeasured |
| **Fallback** | screenshot + Set-of-Mark to the reasoner | 157 ms + model |

**Design notes with evidence behind them:**

- **Shadow DOM is not optional.** Measured 7 shadow roots on an ordinary Microsoft page. Both
  leading browser agents pierce them; Browser Use's own write-up concedes "complex sites with
  iFrames and Shadow elements are extremely tricky."
- **Do not adopt Playwright's `ariaSnapshot` semantics wholesale**: its implementation
  deliberately **does not traverse into iframes**, emitting a reference instead. For a portal
  lab with an embedded blade, that is a hole.
- **Cross-origin iframes** need the extension to run in all frames with per-frame state, or
  they are invisible. The current manifest has `all_frames: false` — a known gap to close.
- **Virtualised lists** (Azure portal resource lists) mean the target may not be in the DOM at
  all. The honest behaviour is `absent` plus "scroll the list and I will find it", never a
  guess at where it would be.

### 5.2 VM / desktop labs

| Role | Mechanism | Measured |
|---|---|---|
| **Change** | **UIA event subscriptions** — focus changed, structure changed, property changed | 0 while idle |
| **Primary read** | **focus-scoped**: focused element + parent + siblings | **2.8 ms / 14.9 ms** |
| **Never** | full-tree `FindAll` | **849 ms browser / 1,887 ms File Explorer** |
| **Text fallback** | `Windows.Media.Ocr` on the focused window region | **49 ms** |
| **Grounding fallback** | screenshot + Set-of-Mark → cloud VLM | 157 ms + model |
| **Cursor** | low-level mouse hook for Explore Mode | trivial |

**The single most important implementation change from the current build:** the desktop agent
scans; it must **subscribe**. Measured, a UIA property read is 0.15 ms and the cost is **per
cross-process call, not per element** — which is why File Explorer's 64 elements cost more than
Chrome's 470. A `CacheRequest` made it **2× worse** (3,341 ms vs 1,549 ms), so the obvious
optimisation is a trap.

**Windows OCR is better than expected and nobody has published this.** Measured here on an
unpackaged process: **69 ms full screen, 49 ms for a focused-window region, 42 ms for a
dialog**, `MaxImageDimension` 10,000 px, engine created successfully despite the API reference
claiming package identity is required. It is free, offline, installed everywhere, and fast
enough to sit *below* any cloud vision call in the hierarchy.

**Local vision models are not viable on a lab VM.** No small VLM has a published CPU latency
for a 1080p screenshot; the only data point found is ~7 s for Moondream 0.5B int4 on an i7.
OmniParser v2 is 0.6 s on an **A100**. Lab VMs have no GPU. **Therefore: vision fallback is a
cloud call, and OCR is the local option.** This also disposes of the OmniParser AGPL question —
we are not shipping the detector.

### 5.3 The RDP case, stated plainly

If Rocky ever runs **outside** the VM watching a streamed desktop, there is no structure —
Guacamole, DCV and AVD all confirm pixels only. Then and only then is the pipeline
screenshot → OCR/vision → Set-of-Mark → model, at 150–800 ms + model. **The whole architecture
above exists to ensure this case never occurs**, by running Rocky inside the VM.

---

## 6. Workflow intelligence

This is the part you called most important, and it is the part with the most transferable
prior art.

### 6.1 Ingestion → task graph

```
guide text ──▶ instruction lines ──▶ steps[]
                                      ├─ targets (ordered, from authored (1)(2)(3))
                                      ├─ surface  browser | vscode | terminal | dialog
                                      ├─ preconditions   what must be true first
                                      ├─ expected end-state   what must be true after
                                      └─ hint ladder   point → teach → bottom-out
```

The parser exists and is gated at 100% on the demo lab's instruction lines. Two additions:

- **Partial order, not a list.** Lab steps are often order-independent within an exercise.
  A strict list produces false "you skipped a step" alarms. This is exactly what process-mining
  *conformance checking* solves: model-only moves = skipped, log-only moves = extra,
  synchronous = on track — and prefix alignments handle a trace still in progress.
- **The hint ladder is authored once, per step, at ingestion time.** VanLehn's standard
  sequence — **Point** (mention the condition that makes the step relevant), **Teach** (explain
  the concept briefly), **Bottom-out** (state the step) — is near-universal in ITS. Rocky's
  glow *is* the Point rung, which is a pleasing alignment: his best feature is the
  pedagogically correct first response.

### 6.2 Position tracking: a belief, not a guess

Rocky must never say "you are on step 5" from a single ambiguous observation. Use
**confidence accumulation**, which is what STORM-PSR does for procedure-step recognition
(accumulating frame-level confidence until a threshold, tolerating swapped and repeated steps).

```
P(step = k) updated on each event from:
    URL / page title match            strong
    expected control set present      strong
    expected end-state observed       decisive (advance)
    guide pane scroll position        weak
    elapsed time vs cohort baseline   weak
advance only when P > threshold AND the previous step's end-state is satisfied
```

**Model tracing** (Anderson/Koedinger, Cognitive Tutors) is the right frame for classifying
each learner action: match against the expected next actions for the current state — a match
to a correct path means on-track (multiple valid paths allowed), a match to a known wrong path
triggers error-specific feedback, and no match gives only minimal feedback. The crucial
subtlety: **no match means "I do not recognise this", not "you are wrong."**

### 6.3 Granularity — settled by evidence

VanLehn's 2011 meta-analysis: **step-based tutoring d = 0.76**, answer-based 0.31, and
**substep-based 0.40 — worse than step**. Human tutoring is 0.79, i.e. step-based ITS roughly
matches a human tutor.

> **Rocky operates at the step.** One portal action, one command, one form submission. Not
> keystrokes (substep, measurably worse and far more annoying). Not "did the validator pass"
> (answer-based, half the effect).

### 6.4 Stuck detection

Signals, all cheap, all with literature support:

| Signal | Source |
|---|---|
| Same failing action repeated without variation | wheel-spinning (Beck & Gong: no mastery after 10 opportunities) |
| Very fast retry immediately after an error | Baker's top gaming feature: QUICK-ACTIONS-AFTER-ERROR |
| Dwell far beyond cohort baseline for this step | HelpNeed (Maniktala et al.) |
| Oscillation between pages/tabs | Frustrometer; RUM "back-and-forth" |
| Repeated re-reading of the guide pane | help-avoidance (Aleven et al.) |
| Idle after an error | Frustrometer |

**Calibrate from cohort data, do not borrow thresholds.** The ITS constants (three-in-a-row
mastery, ten opportunities) are calibrated to maths items, not portal steps. Ship with
conservative defaults and tighten from telemetry.

**Precedent for acting on it:** HelpNeed gave a proactive hint at the *start* of a predicted-
unproductive step and got significantly better post-test scores, with a guard of **no more than
three unsolicited hints in a row**.

---

## 7. AI and reasoning design

### 7.1 When the model runs

**Never on a timer.** Four triggers only:

1. **Learner asks.** Always, immediately.
2. **Monitor escalates** — ambiguity the world model could not resolve, an unrecognised state,
   an error it cannot classify.
3. **Stuck predicate fires**, and the interruption budget permits.
4. **Speculative pre-generation** (below).

### 7.2 Speculative pre-generation — how Rocky feels instant

This is the technique that makes an event-driven Rocky feel like a continuous one, and it is
the strongest idea in this document.

**A lab is a known procedure.** While the learner works on step *n*, Rocky already knows what
step *n+1* is. So generate its explanation, its hint ladder and its expected end-state **during
the idle time of step n** — which is most of the session — and cache them keyed by
(lab, step, surface).

When the learner arrives at step *n+1*, the explanation is **already there**. Zero perceived
latency, from a model call made 90 seconds earlier.

Evidence this works: speculative action prediction reports up to 55% next-action accuracy
yielding up to 20% end-to-end latency reduction — *in open-ended settings*. In a lab the
next step is authored, so hit rate should be far higher. UFO2's speculative multi-action cut
steps 12.2–51.5% by validating each speculated step against UIA preconditions before acting —
the same validate-before-use discipline applies here.

Guard: a speculated artefact is **validated against live state before display**, exactly as
UFO2 validates before execution. Stale speculation is discarded, never shown.

### 7.3 Model cascade

| Tier | Job | When |
|---|---|---|
| **None** | point, advance, stay silent | ~95% of events |
| **Small** (2B-class, or rules) | ambiguous stuck signals, intent classification | monitor hard cases |
| **Large** | explanation, diagnosis, disambiguation, free-text Q&A | escalation, questions |

FrugalGPT: up to 98% cost reduction at equal quality via cascade. RouteLLM: 95% of GPT-4
quality at >85% cost reduction, routing only 14–26% of queries to the strong model.

### 7.4 Context discipline — the Khan Academy finding

**Give the model the world model, not the screen.** Specifically: current step text, what the
learner has *already done*, the control list (5 KB), the resolution verdict, and recent
errors. Not a screenshot, not the whole guide, not the future steps.

Khan Academy found that restricting the model to work already done cut latency ~400 ms **and
halved answer-giving**. The same restriction gives Rocky a structural reason not to spoil: he
is not holding the answer in context.

### 7.5 Memory

| Layer | Contents | Lifetime |
|---|---|---|
| **Working** | current step, last N events, active resolution | session |
| **Learner** | per-skill mastery, hint rungs used, dismissals, pace | account, if consented |
| **Lab** | task graph, cohort step baselines, known drift | per lab version |
| **Corpus** | CloudLabs docs, retrieval-gated | static |

Cohort baselines are what make stuck detection calibrated rather than guessed, and they are a
genuine compounding asset: every run of a lab sharpens every later run.

---

## 8. Confidence framework

### 8.1 The decision, formally

Horvitz's mixed-initiative framework gives the exact structure: with an *ask* option available,
there are **two thresholds** — one between silence and asking, one between asking and acting —
derived from the utilities of acting rightly/wrongly and not acting rightly/wrongly. And
critically: *"the utility of unwanted action can diminish significantly with increases in the
depth of a user's focus on another task"* — deep focus **raises** the bar.

```
                 resolution        learner state          → action
  ─────────────────────────────────────────────────────────────────────────
  score ≥ .70, margin ≥ .20    any                        POINT  (glow + one line)
  score ≥ .70, margin < .20    any                        ASK    ("two Creates — the
                                                                  one under Networking?")
  score < .70                  on track                   SILENT
  score < .70                  stuck                      TEACH  (describe, don't point)
  any                          deep focus / mid-step      DEFER to breakpoint
  any                          dismissed this before      SILENT, permanently
```

### 8.2 Multi-source validation

A glow requires agreement, not just a score:

1. **Structural** — the control exists with a matching accessible name and role.
2. **Contract** — score ≥ 0.70, margin ≥ 0.20 over the runner-up.
3. **Non-contradiction** — no attribute contradicts the guide. If the guide says *button* and
   the candidate is a *link*, it is a different control; the score is **discarded, not reduced**.
4. **Positional** — consistent with the current step in the task graph.

Any disagreement → down a rung. This is what makes a wrong glow structurally impossible rather
than statistically unlikely.

### 8.3 Hallucination prevention

- The model **never chooses the glow.** It shapes queries and writes prose. The deterministic
  resolver adjudicates. This is the single most important invariant in the system.
- **Retrieval-gated facts.** CloudLabs answers come from the corpus with a score floor and a
  domain-word test — already built, nonsense scores 0.0.
- **No unverified state claims.** Rocky never says "your deployment succeeded" unless he read
  it. (This is already an explicit project principle and it should extend to every assertion.)
- **Refusal is a first-class outcome**, logged and measured, not an error path.

---

## 9. Operating modes

All five modes are **one engine with different Governor policies** — not five code paths.

| Mode | Monitor threshold | May point | May explain | Proactive | Notes |
|---|---|---|---|---|---|
| **Guided** | low | yes | yes | yes, budgeted | default for training |
| **Observe** | high | on request | on request | only on stuck | the "sit quietly" mode |
| **Explore** | n/a | on hover | yes | never | user-driven, no budget |
| **Recovery** | entered on stuck | yes | yes, escalating | yes | temporary, exits on progress |
| **Assessment** | ∞ | **no** | **no** | **no** | observation only; visible indicator |

**Mode changes are logged.** If a learner switches to Guided during an assessment, that belongs
in the record.

### 9.1 Explore Mode

Measured: **0.1 ms** hover in DOM, **2.8 ms** via focus-scoped UIA. No polling, no perceptible
delay, no model on the common path.

```
hover → identify (0.1 ms) → local dictionary hit? → explain immediately
                          → miss? → small model → cache the answer forever
```

- Answers: *what it is · why it exists · what it does · when to use it*, in two sentences.
- **Cache is permanent per (control, lab).** "What is a Resource Group" has one answer.
- Off by default; a deliberate toggle. Hover-explain is delightful when requested and
  intolerable when not.
- **Never fires while a glow is active** — do not compete with your own guidance.

### 9.2 Recovery Mode

Entered when the stuck predicate fires; exited on observed progress.

```
1. Establish position.   "You are on step 4, and the portal is showing the Networking tab."
2. Point rung.           glow, if resolvable
3. Teach rung.           if still stuck after a further interval
4. Known-state recovery. "Go back to the resource group overview and we will restart from there"
5. Honest stop.          "I cannot see what is wrong. Here is what the guide expects next."
```

Guard from HelpNeed: **no more than three unsolicited hints in a row.** Guard from Bailey:
**defer to a breakpoint** unless the cost of waiting is high (about to delete the wrong
resource → interrupt immediately; that is the "relevant and costly" exception).

---

## 10. Build vs buy vs adapt

Verified licences and maturity. **The headline: buy almost nothing.**

| Component | Decision | Rationale |
|---|---|---|
| **Browser perception** | **Build** (exists) | 2.9 ms measured. Browser Use (MIT) and Stagehand (MIT) are *agents*, not libraries — they drive browsers via CDP from outside. Rocky is an in-page extension observing a human. Wrong shape; **borrow the technique** (AX+DOM merge, shadow piercing), not the dependency. |
| **Desktop UIA** | **Adapt: FlaUI** (MIT) | Has the full event API — `RegisterFocusChangedEvent`, `RegisterStructureChangedEvent`, `RegisterPropertyChangedEvent`. .NET Framework 4.8 target means **no runtime install on a lab VM**. PowerShell cannot pump UIA events (measured: zero captured); this is the fix. |
| **OCR** | **Buy: `Windows.Media.Ocr`** (in Windows) | **49 ms measured.** Free, offline, zero install, no licence question. |
| **Local vision** | **Do not ship** | No small VLM has a viable CPU latency; lab VMs have no GPU. Removes the OmniParser AGPL problem entirely. |
| **Cloud vision** | **Buy** (existing Foundry endpoint) | Only for genuinely structureless surfaces. |
| **Set-of-Mark** | **Adapt** (technique, MIT reference impl) | Best measured latency-to-accuracy trade; near-zero overhead and usually *reduces* step count. |
| **Task graph / state** | **Build** | ~400 lines of state machine. LangGraph is MIT but its always-on server pieces are Elastic-licensed, and it has no scheduler — you own the loop anyway. Temporal is categorically overkill for a single-user local companion. |
| **UI mode machine** | **Build** (or XState if it grows) | XState is MIT and dependency-free, but **unverified whether its bundle avoids `eval`/`new Function`**, which MV3 CSP forbids. Check before adopting. |
| **Telemetry** | **Adapt: OpenTelemetry** (Apache-2.0) | .NET is stable. **Browser OTel is explicitly "experimental and mostly unspecified"** — emit from the background service worker, pin versions, expect to own CORS/CSP. |
| **Guide parsing** | **Build** (exists) | Domain-specific; no library fits. |
| **Retrieval** | **Build** (exists) | Deterministic tf-idf, gated. Sufficient and free. |

**Nothing in the ecosystem replaces Rocky's core.** The agent frameworks all assume the *model*
drives the UI. Rocky's premise is that the *human* drives and Rocky watches. That inverts the
loop, and it is why the borrowings are techniques rather than dependencies.

---

## 11. MVP — smallest thing with the biggest demo impact

**Constraint: browser-only, portal lab, no new infrastructure.** Most of this exists.

| # | Work | Status |
|---|---|---|
| 1 | Wire guide-reader targets → resolver (no captured bundle) | built, **not wired** |
| 2 | World model: task graph + position belief + learner state | **new**, ~400 lines |
| 3 | Monitor: SILENT/POINT/ASK/ESCALATE on the world model | **new**, ~150 lines |
| 4 | Governor: contract + budget + breakpoint deferral + dismissal memory | budget exists; **add deferral + dismissal** |
| 5 | Speculative pre-generation of step *n+1* explanation | **new**, ~100 lines |
| 6 | Explore Mode with permanent local cache | exists; **add cache** |
| 7 | `all_frames: true` + per-frame state | **one-line manifest change + state work** |

**Demo narrative this produces:** open a portal lab Rocky has never seen. He reads the guide,
knows the step, glows the control in 1 ms, stays silent while the learner works, notices a
wrong click and names the right control, answers a question instantly because he pre-generated
the answer, and — when the portal shows something he cannot resolve — **says so**.

The last beat is the one that wins a technical audience.

---

## 12. Production

| Area | Design |
|---|---|
| **Surfaces** | Browser (extension) + VM (FlaUI agent). Same world model, different sensors. |
| **Deployment** | Baked into the lab image, or CSE bootstrap. Versioned with the lab. |
| **Multi-monitor / DPI** | Per-monitor DPI awareness; coordinates normalised per display. (The Clicky forks' one genuinely reusable contribution.) |
| **Telemetry** | OTel from the background worker. **Refusals are the headline metric** — every "I cannot find it" is a lab that drifted or a parser gap. |
| **Observability** | Every glow traces to score/margin/rule. Every model call logs its trigger and cached-vs-live. Session replay of *decisions*, not screens. |
| **Security** | Reads only, clicks nothing, runs as the learner. **Telemetry-only mode (SC-001) must remain a supported configuration.** No screenshots leave the VM without explicit consent; follow Copilot Vision's session-bound precedent, not Recall's continuous-capture one. |
| **Scale** | Everything per-learner and local except model calls and telemetry. Cohort baselines aggregate server-side. |

---

## 13. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Rocky becomes Clippy** | **High** — the default failure mode | Dismissal memory is permanent (Clippy's fatal flaw); breakpoint deferral; budget; Observe as a one-click escape |
| **Portal drift** | Certain | Contract refuses rather than mis-points; drift gate exists; refusal telemetry catches it |
| **Speculation shows stale content** | Medium | Validate against live state before display (UFO2 discipline) |
| **Model gives answers away** | Medium | Context restricted to work already done (Khan: halved it); hint ladder; Assessment Mode silent |
| **Cross-origin iframes invisible** | High on portals | `all_frames: true`; honest refusal where still blind |
| **Enterprise blocks screen reading** | Medium | Structure-first; telemetry-only mode; never default to capture |
| **UIA misses custom controls** | Certain (UFO2: 62% of its failures) | OCR at 49 ms, then cloud vision, then refusal |
| **Stuck thresholds mis-tuned** | High initially | Conservative defaults; calibrate from cohort telemetry; cap unsolicited hints at 3 |

---

## 14. Roadmap

**Phase 1 — MVP (browser).** Items 1–7 above. Exit criterion: on a lab never captured, ≥70% of
instruction lines yield a correct glow or an honest refusal, **zero wrong glows**, median
glow latency < 50 ms.

**Phase 2 — VM.** Rewrite the desktop agent on FlaUI, event-driven and focus-scoped. Add OCR
fallback. Route by surface. Exit criterion: VS Code and Windows dialog steps glow correctly;
full-tree scans never occur.

**Phase 3 — Intelligence.** Stuck detection on cohort baselines; Recovery Mode; per-skill
mastery; speculative pre-generation tuned by hit rate.

**Phase 4 — Enterprise.** Telemetry, observability, modes as policy, security review,
telemetry-only mode, multi-monitor.

---

## 15. Technical stack

| Layer | Choice | Licence |
|---|---|---|
| Browser | MV3 extension, vanilla JS, zero deps | — |
| Desktop | .NET Framework 4.8 + **FlaUI.UIA3** | MIT |
| OCR | `Windows.Media.Ocr` | in Windows |
| Overlay | WinForms layered click-through window | — |
| Reasoner | Azure AI Foundry (existing endpoint) | — |
| State | hand-built machine; SQLite if persistence is needed | — |
| Telemetry | OpenTelemetry (.NET stable; JS from background worker) | Apache-2.0 |
| Tests | Node + raw CDP, zero deps (existing) | — |

---

## 16. If I were Chief Architect and failure were not acceptable

**I would build an event-driven step tutor with a continuously maintained world model, a cheap
monitor, a rare reasoner, and a deterministic governor that has the last word before anything
reaches the learner.**

Concretely, and in this order:

1. **The world model is the product.** A task graph from the guide, a probabilistic position
   belief, a learner state, and a resolution verdict — updated on every event in about a
   millisecond, with no model in the loop. This is what makes Rocky continuously aware, and it
   is what you were really asking for when you asked for continuous AI.
2. **The model never decides what to point at.** It explains, diagnoses and disambiguates. The
   deterministic contract — 0.70 score, 0.20 margin, no contradicted attribute — adjudicates
   every glow. A wrong glow must be structurally impossible, not merely unlikely, because a
   wrong glow from a trusted guide is worse than no guide at all.
3. **Speculative pre-generation, because the procedure is known.** Generate step *n+1*'s
   explanation while the learner works on step *n*, validate it against live state before
   showing it. This is how Rocky feels instantaneous without reasoning continuously — and it is
   the single highest-leverage idea here.
4. **Silence is a feature with a budget.** Dismissals remembered permanently, nudges deferred to
   step boundaries, no more than three unsolicited hints in a row. Clippy failed on etiquette,
   not on capability, and it is the most likely way this fails too.
5. **Point, do not tell.** Rocky's glow is exactly VanLehn's *Point* hint — the pedagogically
   correct first response and the one thing a chat window cannot do. Answer-giving assistants
   leave learners measurably worse off; a pointing one does not.
6. **Refuse out loud.** "I can see the page but I cannot find 'Default permission'" is a good
   outcome, logged and measured. Refusal telemetry is also the drift detector that keeps Rocky
   honest as portals change underneath him.

**Why this and not the alternative.** The continuous-AI Rocky is slower, costs more, cannot be
audited when it is wrong, cannot satisfy the no-screen-capture constraint your own buyers
impose, and will talk its way into being switched off. The architecture above is faster by
three orders of magnitude on the common path, explainable on every decision, cheaper by roughly
the cascade ratios, and — because the intelligence lives in a state machine rather than a token
stream — it is *the same Rocky every time*.

In a training product, being reliably right and occasionally quiet beats being constantly
clever. That is the whole design.
