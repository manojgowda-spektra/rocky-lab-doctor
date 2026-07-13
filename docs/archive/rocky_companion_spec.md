# Rocky — Living Companion Spec & Capability Roadmap

> The full "living companion" vision, and an honest map of what's **built now** vs. what
> needs the platform observation layer / data (phased). Driven by the user's companion vision + ADR-001/002/003.
> **Created:** 2026-06-30

---

## Vision (north star)
Rocky is not a chatbot — it's a living, expressive teammate that stays with the learner through the whole lab: relaxed and playful when things go well, and a focused superhero sidekick the moment trouble appears. It reads the lab, knows where the learner is, helps *before* being asked, hints before answering, celebrates wins, and escalates what it can't fix — so the learner never feels alone and never has to explain an issue.

---

## Built NOW (runs in `source/rocky-prototype/web/`)

### Expressive emotion engine (15 states)
Face, eyes, mouth, brows, glow color, posture, and accessories change dynamically:
`happy · excited · curious · thinking · confused · shocked · concerned · proud · sleeping · snoring · hero · celebrate · warning · investigating · idle`. Each is triggered by context (below).

### Living idle behaviour (non-intrusive)
When the learner is progressing smoothly / quiet: cycles idle → curious (look around) → thinking, then **sleeps and snores** (Zzz, breathing), **glides** across the stage occasionally, and tells **technical/cloud/AI/motivational jokes** on a long interval. All suppressed while helping.

### Proactive context engine
Tracks **time-on-step, failed attempts, inactivity, and validation transitions**. Triggers:
- **Hero "wake-up"** ("Hold on… I think I found something.") when there are failing validations and the learner goes quiet — fired **once**, never nagging (ADR-003).
- **Milestone celebration** (confetti + proud/celebrate) when a validation flips fail→pass.

### Confidence-gated guided assistance
A simulated Azure portal panel; when a **high-confidence** finding maps to a UI target (region mismatch), Rocky **points an arrow + highlights** the field and offers **Apply fix** → triggers verify→celebrate. Only points when confident (no guessing).

### Diagnose → fix → verify → celebrate → escalate
Engine diagnoses (region/SKU/quota/authz/**license**), proposes scaffolded fixes; on apply it **re-checks** validations and celebrates; if unresolved/reportable it **auto-builds a support-ready, secret-redacted diagnostic bundle** and files a ticket — the learner explains nothing.

### Pedagogy & safety (carried from the tested agent)
Socratic hint→guided→answer dial with ZPD escalate/fade; grounded in lab state; **secrets/PII redacted before model, logs, and reports**; self-generated engagement telemetry.

---

## Capability Roadmap (honest status)

| Capability (requested) | Status | Approach / tech |
|---|---|---|
| LLM reasoning | ✅ Built | Azure OpenAI (`gpt-5.4-nano`) / Claude, provider-agnostic, streaming |
| Agent workflow / orchestration | ✅ Built | `agent.js`: intent → scaffold → deterministic/LLM routing → telemetry |
| Memory (session) | ✅ Built | `conversation.js` + summarization-based trimming |
| Intent detection | ✅ Built (heuristic) | `intent.js`; **next:** small-model classifier (P2 model tiering) |
| Context: lab/step/validations/expected outcomes/common mistakes | ✅ Built | Lab spec + validation model (fixture now; live via API auth A1) |
| Context: time-on-step / failed attempts / inactivity | ✅ Built | Rocky self-tracks (platform doesn't expose engagement telemetry) |
| Proactive assistance | ✅ Built (threshold) | Context triggers; **future:** predictive timing from learned data |
| Issue detect → diagnose → suggest → verify → escalate | ✅ Built | Engine findings + applyfix verify + redacted report bundle |
| Encourage / celebrate / hints-before-answers | ✅ Built | Emotion engine + pedagogy dial |
| Guided UI pointing | 🟡 Simulated | Works on a mock portal; **real portal** needs browser-extension/DOM access (P3) or CV |
| Real-time portal/resource/deployment state | 🟡 Needs platform | Event bus + Runtime Context API (checklist A3); polling fallback |
| Event monitoring | 🟡 Needs platform | Webhooks/event stream (A3); today = poll |
| UI understanding / computer vision | 🔵 Future R&D | VLM as **fallback** (ADR-002) — telemetry-first; privacy-gated (trust B-items) |
| Predictive assistance | 🔵 Future R&D | Needs logged interaction data → model; seeded by current self-telemetry |
| Learning from user behaviour | 🔵 Future R&D | Learner-profile memory + offline training on the data flywheel |

✅ built now · 🟡 buildable once platform data/auth lands · 🔵 future R&D (needs data + privacy clearance)

---

## Emotion catalog & triggers

| Emotion | Trigger |
|---|---|
| sleeping / snoring | long inactivity, smooth progress |
| idle / curious / thinking | short inactivity (cycles); "looking around" |
| happy | normal answer delivered, no issues |
| excited | applying a fix; positive momentum |
| shocked | a new error/issue suddenly appears (e.g., license injected) |
| investigating | analyzing a detected issue |
| hero | repeated/critical failures, inactivity-with-failure, reportable issue |
| concerned / warning | learner struggling; risky state |
| proud / celebrate | validation(s) pass; step complete (confetti) |
| confused | (reserved) ambiguous learner input |

---

## Non-intrusiveness rules (so Rocky never annoys)
- **Reactive by default; proactivity earned & rate-limited** (ADR-003): hero wake-up fires **once** per issue, not repeatedly.
- Idle antics/jokes only when **smooth & quiet**, on long intervals; **never during help**.
- Guided pointing only at **high confidence**; otherwise Rocky asks.
- Everything dismissible; assistance level user-controlled (spoiler dial).

---

## Honest constraints (what gates the 🔵/🟡 rows)
- **Real screen/portal awareness & pointing at the *actual* Azure portal** needs either a browser extension/DOM bridge or computer vision — both are P3, privacy-sensitive, and require the trust answers (B1–B3) + platform UI-injection point (A3).
- **Predictive & learning-from-behaviour** need a corpus of logged interactions (we now generate the telemetry that seeds it) plus a training/eval pipeline — future.
- Until then, Rocky is **fully alive and genuinely helpful on lab intent + validation/deployment state** — which is the moat and covers the majority of real "stuck" moments.
