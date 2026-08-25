# Rocky 2.0 — Hackathon Submission

**AI Lab Companion + AI Lab Doctor**
Manoj Gowda · Spektra Systems · 25 August 2026

> **Every lab QA tool tells you what failed.**
> **Rocky tells you what *passed* — and shouldn't have.**

---

## 0. The thirty-second version

Hands-on labs are a promise: *do these steps, get this result.* The cloud breaks that promise
silently — a model is retired, a product renamed, a translation drops a login token — and nobody
finds out until a learner is stuck at 2 a.m., assuming they are the problem.

Rocky is the reliability layer for that promise. It reads every lab guide and every learner session,
finds the contradiction that proves a real defect, drafts the fix for a human to approve, and
**re-runs the same check to prove the fix worked.**

**Proven, today, on production content:** 133 real defects across 8 production repos, 268 guide
files, in under four seconds. Zero false positives in a 42-finding hand audit. Five pull requests
raised, two merged by maintainers. A CI gate that blocked a deliberately planted regression in four
seconds. 113 automated tests, all passing.

**The honest boundary:** guide-side detection is real and running. Fleet telemetry diagnosis is built
and tested against a labelled digital twin, waiting on CloudLabs API access. Every screen says which
is which. We never fake green.

---

## PART ONE — Improvements completed today

Format as requested: Current State → Problem → Completed Solution → Expected Judge Impact.

---

### Improvement 1 — Campaign titles that lie about their own contents

**Current State.** The Fix Campaign Planner grouped 133 real findings into 13 mergeable campaigns.
Registry-driven campaigns (retired models, renamed products) were titled correctly. Every *per-repo*
campaign inherited a single hardcoded string: *"Fix broken asset links in {repo}"*.

**Problem.** Four of thirteen campaigns were mislabelled — and not harmlessly. CAMP-03 is sixteen
**lost credential tokens in translated guides**, the most serious defect class in the entire scan, a
Japanese learner being told to literally type the placeholder as their username. It was labelled
"broken asset links". A judge opening the campaign screen would read four identical titles covering
four different defect types, and the single most compelling finding in the product was invisible.

**Completed Solution.** Implemented a type-keyed title map in `labdoctor/campaigns.js` so titles
describe the *defect*, not the *grouping*. Plus a regression test asserting that no two distinct
defect types may ever share a title again.

```
CAMP-03 | Restore lost credential tokens in translated guides — RTIAD-Workshop-April-2026
CAMP-06 | Fix path capitalisation (works on Windows, 404s on GitHub) — RTIAD-Workshop-April-2026
CAMP-13 | Realign translated guides to one release branch — RTIAD-Workshop-April-2026
```

**Expected Judge Impact.** The strongest single story in the product now surfaces by itself on the
campaigns screen instead of being buried under a generic label. Also demonstrates the discipline the
whole pitch rests on: we found a defect in our own defect-finder and locked it with a test.

---

### Improvement 2 — The demo server was reachable from the network, unauthenticated

**Current State.** `server.listen(PORT)` with no host argument — binds `0.0.0.0`, every interface.

**Problem.** The demo serves `/qa.html`, the internal presenter Q&A sheet, which is candid about
which parts of the demo are simulated and why the AI subscription is disabled. On conference Wi-Fi
or a shared corporate network, anyone who guessed the port had it. No authentication anywhere.

**Completed Solution.** Binds `127.0.0.1` by default; `ROCKY_HOST=0.0.0.0` opts in explicitly when a
hosted deployment genuinely needs it. Verified the readiness gate still passes 43/43 (Windows can
resolve `localhost` to IPv6 — it doesn't here, and now we know).

**Expected Judge Impact.** Answers the security-minded judge before they ask. A team that ships a
demo bound to all interfaces has not thought about deployment; a team that noticed and fixed it has.

---

### Improvement 3 — Secrets could reach the model on the chat path

**Current State.** `live.js` redacted the lab context at the data boundary. `/api/say` redacted
deployment errors. `handleTurn()` — the path behind `/api/chat` and the CLI — did neither.

**Problem.** The grounded prompt was built from raw context. A real deployment error carrying a
connection string or API key would have been sent to Azure OpenAI verbatim. Proven, not theorised:
the fixture's planted `Password=Sup3rSecret!` and `sk-live-abcd1234` both landed in the prompt.

**Completed Solution.** One line at the boundary in `src/agent.js` — `ctx = redact(ctx)` — so the
deterministic responder, the grounded prompt and the model all see the scrubbed copy. `redact()` is
pure, so the caller's context is untouched. Verified before/after: the secret was in the prompt, now
it is not.

**Expected Judge Impact.** This matters far more the moment Rocky runs inside a lab VM where
deployment logs are real. Demonstrates that "redact at the boundary" is an enforced invariant rather
than a slogan.

---

### Improvement 4 — Eighteen pages, five demo scripts, four entry points

**Current State.** The prototype had grown to 18 HTML pages, five overlapping demo scripts, and four
different launchers. The home page — the front door — never linked to the actual guided demo.

**Problem.** Unpresentable. The owner's own words: *"I will not be able to present the project
correctly, because it's confusing."* A judge given four entry points finds none of them.

**Completed Solution.** Rebuilt around **one flow, six acts**, with a shared act strip (`nav.js`)
injected on every flow page — current act highlighted, provenance badge baked into each label, one
Next button that always goes to the right place. Seven pages retired to an attic (working code,
deliberately not served). One launcher. One canonical script.

**Expected Judge Impact.** A judge can drive the entire product without a guide. The presenter cannot
get lost. Removing seven pages is a stronger signal of product judgement than adding seven.

---

### Improvement 5 — Numbers that could contradict each other on screen

**Current State.** "133 findings", "8 repos", "5 PRs", "104 tests" were hardcoded in page markup,
demo scripts, the knowledge base, and the readiness check independently.

**Problem.** One rescan and the screens disagree with the narration, live, in front of judges. It had
already happened once — the home page said 104 findings when the scan said 133.

**Completed Solution.** Single source of truth: `facts.json` (+ `/api/facts`) for static claims;
every scan-derived number read live from the scan APIs on every page. Then the enforcement:
`check-ready.js` now **audits the printed Q&A sheet's numbers against the live scan** — seven
assertions covering tests, PRs, findings, files, repos, campaigns and coverage. If a rescan changes a
count and the prose isn't updated, the gate goes red *before* the demo, not during it.

**Expected Judge Impact.** Directly demonstrates the product's core claim applied to itself. Rocky's
pitch is "we detect contradictions between what a system claims and what is true" — and it now runs
that check on its own presentation materials.

---

### Improvement 6 — A stale server could serve last week's code

**Current State.** If a Node process from an earlier checkout was still holding port 5173, the demo
silently served old code.

**Problem.** The failure is invisible and catastrophic: you demo a bug you fixed yesterday.

**Completed Solution.** `/api/version` returns the git commit the running server was started from;
`check-ready.js` compares it against `git rev-parse HEAD` and fails if they differ.

**Expected Judge Impact.** Small, but it is exactly the class of operational detail that separates a
prototype from something a team could actually run.

---

### Improvement 7 — The learner-side story ran on hardcoded text

**Current State.** The simulated CloudLabs environment painted its terminal and evidence card from
hardcoded HTML strings.

**Problem.** The screen could drift from the fixture the engine actually reasons over — meaning the
demo could show one thing while the engine diagnosed another. That is the precise failure the whole
product exists to prevent.

**Completed Solution.** `/api/labstate` now exposes `deploymentLog`, and the terminal and evidence
card are both derived from it at render time. The screen and the engine cannot disagree. Also
corrected the tab names to CloudLabs' real vocabulary (Lab Guide, Environment Details) per the
official docs.

**Expected Judge Impact.** A CloudLabs-literate judge recognises their own product. And the honesty
claim holds under inspection rather than only in narration.

---

### Improvement 8 — Fixture data outranked real data on the fleet page

**Current State.** The Doctor dashboard opened with the simulated 12-lab fleet. The real production
scan sat below it.

**Problem.** The first number a viewer read was fabricated. Technically labelled, but structurally
misleading — and it buried the only genuinely real evidence on the page.

**Completed Solution.** Reordered REAL-first. The production scan is the hero; the fixture fleet is
fenced below an explicit FIXTURE divider explaining it is the roadmap view, honestly labelled.

**Expected Judge Impact.** The strongest evidence leads. And it removes the most likely "you're
overclaiming" objection before it is raised.

---

### Improvement 9 — The engine behind the demo's central beat had no tests

**Current State.** `labdoctor/checkup.js` powers Act 2 — the select → diagnose → fix → verify loop
that is the heart of the demo. It had zero test coverage. Meanwhile the *simulated* fleet engine had
28 tests.

**Problem.** The most-tested code was the least-validated, and the most-demoed code was untested.

**Completed Solution.** Eight new tests covering all three demo arcs (broken, needs-a-human, clean),
wrapper-folder stripping, asset honesty (never claim a missing image when images weren't uploaded),
de-duplication, unreadable files, and the three staged samples end-to-end. Suite: 113 passing.

**Expected Judge Impact.** "Is it tested?" has a specific answer for the exact code being demonstrated.

---

### Improvement 10 — Cached upstream deadlines aged into lies

**Current State.** The ecosystem panel showed "EOL in N days" from a stored value harvested on 4 July,
under a **LIVE FEEDS** badge.

**Problem.** By demo day every countdown was overstated by weeks, while a badge said "live".
Self-contradicting on a REAL-labelled strip.

**Completed Solution.** Day counts are recomputed at render time from each impact's actual date; the
harvest date is printed on screen; the demo script now says "harvested on the date shown" rather than
"live". A date that has passed renders as passed rather than as a negative countdown.

**Expected Judge Impact.** Survives the judge who checks a date against a calendar.

---

### Improvements 11–25 — completed, in brief

| # | Completed | Judge impact |
|---|---|---|
| 11 | **Printable Q&A sheet** (`/qa.html`) rendered from the 47-entry knowledge base, replacing a voice-recognition presenter copilot | Removed the single most fragile dependency in the demo (cloud speech + microphone + venue Wi-Fi). Paper never fails |
| 12 | **`START_DEMO.cmd` opens exactly one window** — was three plus a file explorer | The presenter shares one screen and never alt-tabs |
| 13 | **`DEMO_MASTER_SCRIPT.md` is the single canonical script**; four superseded scripts archived with dated names and reasons | No ambiguity about which script is current |
| 14 | **Preflight LLM check downgraded to a warning** | The gate no longer fails red for an absent API key that the design deliberately tolerates |
| 15 | **`REAL_LABS_DIR` env-overridable everywhere** (server, readiness check, revert script) | The repo runs on a teammate's machine — verified by fresh clone: 39/39 green with 2 advisories |
| 16 | **Git stderr leak fixed** — `fatal: not a git repository` was the first line printed when run outside a checkout | A teammate's first impression is a clean boot |
| 17 | **Reliability ledger folded behind a toggle** on the Watcher page | Act 5 is one idea, not four. Depth stays available for Q&A |
| 18 | **Receipts page de-hardcoded and given the explicit ask panel** | The closing screen states the three asks in writing |
| 19 | **Support-intelligence punchline folded into Act 4** and the page retired | The ticket-collapse story is told with *real* campaign data instead of fabricated tickets |
| 20 | **Provenance strip reads live** — was hardcoding "8 repos, 42 sampled" as static markup on a REAL-badged strip | A rescan can no longer split the page against itself |
| 21 | **Fifth Phase-0 check authored** for the onboarding playbook: *does the content assume a capability nothing switches on?* | Generalises today's hardest finding into reusable process |
| 22 | **In-lab validation plan** — the route to real CloudLabs data with no partner API, via the platform's own `Create Service Principal` setting | Converts "blocked on access" into "one afternoon's experiment" |
| 23 | **Portability proven empirically** — 1.2 MB, zero npm dependencies, engine scans a guide in 2 ms on a bare machine | "Can it run in a lab VM?" answered with a measurement, not an opinion |
| 24 | **`web/attic/` with a README** explaining why each retired page was retired | Shows deliberate scope control rather than abandonment |
| 25 | **This submission document** — vision, architecture, stories, economics, Q&A, roadmap in one place | The judge reads one file |

---

## PART TWO — Rocky 2.0

---

## 1. Vision

**Rocky is the reliability layer for hands-on cloud labs.**

A lab is a promise: *perform these steps, get this result.* That promise decays from the day it is
written, because the cloud underneath it does not hold still. Models retire. Products get renamed.
Regions run out of SKUs. A translator drops a credential token. Nothing in the lab changed — the
world did.

Today that decay is discovered by the worst possible detector: **a learner, alone, at 2 a.m., who
assumes they are the problem.** They do not file a ticket. They quit the lab and quietly conclude the
technology is hard.

Rocky's job is to find the decay before the learner does, fix what can be fixed mechanically, hand
the rest to a human with the evidence attached, and prove the fix worked.

**Three principles, enforced in code, not in slides:**

1. **The engine asserts, the AI narrates.** Every finding comes from a deterministic contradiction —
   two facts that cannot both be true. The model is only ever allowed to phrase what the engine has
   already proven. It cannot invent a defect.
2. **We never fake green.** Rocky does not claim a fix worked; it re-runs the same check and shows
   the before and after. If a check cannot run, it reports *skipped* — never *passed*.
3. **Honest by default.** With no evidence connected, Rocky says it has no evidence. Everything on
   screen is labelled REAL, SIMULATED or MODELLED.

**Rocky 2.0 sharpens the vision from "finds broken labs" to this:**

> Rocky is the only system that catches the failure nobody reports — the check that passes work
> that is wrong.

---

## 2. Architecture

### 2.1 The three homes

The single most important architectural fact: **a lab VM is one learner, one lab, one session, then
deleted.** Almost every judgement Rocky makes is a comparison — this lab against nineteen others, or
this lab today against last Tuesday. That decides where every component lives.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  IN THE CODE PIPELINE  (GitHub Actions — earliest possible catch)        │
│  ─────────────────────────────────────────────────────────────────────   │
│  PR gate: same deterministic checks, baseline-diffed.                    │
│  Only NEW rot fails the build. Guards its own files so a doctored        │
│  baseline cannot merge.            ● REAL — merged, armed, 4s block      │
└──────────────────────────────────────────────────────────────────────────┘
                                    │  content that survives the gate
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ON A CENTRAL SERVER  (the memory and the brain)                         │
│  ─────────────────────────────────────────────────────────────────────   │
│  Guide scanner ─────► 133 findings / 8 repos / 268 files    ● REAL       │
│  Campaign planner ──► 13 root causes, top 3 = 62%           ● REAL       │
│  Change intelligence ► endoflife.date + Azure feeds         ● REAL       │
│  Intent extractor ──► 129 facts, 100% quote-anchored        ● REAL       │
│  ─────────────────────────────────────────────────────────────────────   │
│  Fleet diagnosis (6 classifiers)                            ○ TWIN       │
│  Continuous monitor + reliability ledger                    ○ TWIN       │
│  False-fail amnesty (5 gates)                               ○ TWIN       │
│  Support intelligence                                       ○ TWIN       │
│  ─────────────────────────────────────────────────────────────────────   │
│  The model key lives here and only here.                                 │
└──────────────────────────────────────────────────────────────────────────┘
                                    │  one lab's own state
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  INSIDE ONE LAB  (the eye and the mouth)                                 │
│  ─────────────────────────────────────────────────────────────────────   │
│  Companion: root-cause diagnosis, honest abstention, teaching dial,      │
│  secret scrubber, escalation packet.                                     │
│  Single-lab checks: guide checkup, pre-launch lint, intent extraction.   │
│                                            ● REAL logic ○ fixture data   │
└──────────────────────────────────────────────────────────────────────────┘
```

**The rule that decides any future component:** *does it need to compare many labs, or many moments
in time?* If yes, it cannot live in a lab VM.

### 2.2 The detection pipeline

```
  guide markdown ─┐
  ARM parameters ─┼─► EXPECTED state ─┐
  validator spec ─┘                   │
                                      ├─► CONTRADICTION? ─► finding + evidence
  resource state ─┐                   │      (deterministic,      (file:line)
  deployment log ─┼─► OBSERVED state ─┘       zero AI)                  │
  validation rows ┘                                                     │
                                                                        ▼
                                              ┌──────────────────────────────┐
                                              │ draft fix (mechanical)       │
                                              │   or suggestion (needs human)│
                                              └──────────────┬───────────────┘
                                                             ▼
                                              human approves ──► re-scan ──► proof
```

**Why this shape is the moat.** Everything upstream of "CONTRADICTION?" is fact retrieval. The
contradiction test itself is deterministic — a string match, a region comparison, a count. No model
participates in deciding whether something is broken. That is why the false-positive rate is 0 in 42
and why a finding always carries a file and a line you can open.

### 2.3 Data provenance — enforced, not promised

Every API response and every screen element carries one of four labels:

| Label | Meaning | Example |
|---|---|---|
| **REAL** | Actual production content, live feeds, merged PRs | The 133 findings |
| **FIXTURE** | Seeded to verified CloudLabs API shapes | The 12-lab telemetry fleet |
| **SIMULATED** | Digital twin, deterministic seed | The Watcher timeline |
| **MODELLED** | A projection, explicitly not executed | Post-fix impact preview |

The server stamps these; pages render them. `LIVE_DATA` defaults to off, and when off, the model's
own system prompt is rewritten to tell it that it has no evidence and must say so.

---

## 3. Feature set

### 3.1 Shipping and real

| Feature | What it does | Evidence |
|---|---|---|
| **Guide scanner** | Six deterministic checks across every guide file | 133 findings, 8 repos, 268 files, <4s, 3 repos clean |
| **Silent-defect detection** | Lost credential tokens in translations; path case that works on Windows and 404s on GitHub | 16 + 12 real findings a human proofreader skims past |
| **Draft fixes** | Exact red/green diff, every occurrence, original untouched | 5 PRs raised, 2 merged by maintainers |
| **Verify-by-rescan** | Re-runs the same scan on the fixed copy | Before/after on screen, every time |
| **CI gate** | Blocks new rot at pull request | Merged; planted regression blocked in 4s |
| **Campaign planner** | 133 findings → 13 root-cause jobs | Top 3 cover 62% |
| **Change intelligence** | Upstream retirement feeds joined to the catalogue | .NET 5 dead 1,517 days; Python 3.10 at 118 |
| **Intent extractor** | What each step *means*, quote-anchored | 129 facts, 100% anchored, 0 structural failures |
| **Honest companion** | Root cause vs symptom; refuses the plausible wrong fix | Refuses "smaller VM size" 4/4 |
| **Redacted escalation** | One click; learner explains nothing | Secrets stripped before leaving the process |

### 3.2 Built, tested, waiting on data

Each runs against a labelled digital twin. The twin is not decoration — **it found two real engine
bugs** that fixtures never would have.

| Feature | What it will do | Unblocked by |
|---|---|---|
| Six-classifier fleet diagnosis | Drift, false-PASS, false-FAIL, clarity, environment, flake | Validation-results API |
| Continuous monitor | Alerts only on change; folds N labs into one platform incident | Same |
| Reliability ledger | Case history, error budgets, validator trust tiers | Same |
| False-fail amnesty | Restores wrongly-failed learners behind five gates | Write endpoint + spike |
| Support intelligence | 74 tickets → 24 root causes | A ticket export |

### 3.3 New in 2.0 — the differentiators

**A. Self-auditing narration.** Rocky's own presentation numbers are checked against Rocky's own live
data by the readiness gate. The product's central claim — detect contradictions between what a system
says and what is true — is applied to the product's own pitch. No other submission can say this.

**B. The zero-footprint real-lab route.** CloudLabs' own `Create Service Principal` template setting
hands a non-interactive Azure credential to whoever launches a lab. That means Rocky can read a
**real** lab's deployment errors, ARM parameters and resource state — with no partner API, no
platform-team permission, and nothing installed in the lab. Converts three engine inputs from fixture
to real. Documented in `docs/in_lab_validation_plan.md`.

**C. Provenance as a first-class type.** REAL / FIXTURE / SIMULATED / MODELLED is a field in the API,
not a caption. It is why this submission can be maximally ambitious and completely honest at once.

---

## 4. AI design

### 4.1 The division of labour

```
                    ┌───────────────────────────────────────┐
   evidence ───────►│  DETERMINISTIC ENGINE                 │
   (validations,    │  decides what is TRUE                 │
    logs, guide,    │  · contradiction tests                │
    resources)      │  · thresholds (MIN_AFFECTED = 4)      │
                    │  · registry matches                   │
                    └──────────────┬────────────────────────┘
                                   │ verdict + evidence (immutable)
                                   ▼
                    ┌───────────────────────────────────────┐
                    │  LANGUAGE MODEL                       │
                    │  decides how to SAY it                │
                    │  · never changes the diff             │
                    │  · never invents a finding            │
                    │  · absent → deterministic card        │
                    └───────────────────────────────────────┘
```

**Enforced mechanically, three ways.** The red/green diff is pinned to the deterministic draft — when
the model was allowed to rewrite it, it kept replacing a concrete edit with "investigate this".
`/api/say` returns `{message}` only, with no emotion or confidence field, so the model cannot narrate
its own reliability. And every character-level expression in the companion is gated on a fact the
engine already holds — the celebration fires only if the failing-check count actually dropped.

### 4.2 The production prompt

Rebuilt from scratch every turn; nothing cached, so the model can never answer from a stale picture.

```
You are Rocky, a grounded AI lab companion. Respond with ONLY a JSON object:
{"message": string}. The message is 1–2 SHORT sentences (under ~28 words), natural
spoken tone, warm but plain, teach-don't-spoil, grounded ONLY in the provided lab
context. Output nothing except the JSON object.

DATA MODE: NO LIVE DATA — you are NOT connected to any lab, validation checker, or
Azure environment, and you have NO evidence about the user's real state. If asked
whether a step is done/correct, or about their resources/progress, clearly say you
don't have an active lab or validation results yet and cannot verify it — offer to
help once a lab or validation is connected. NEVER invent or assume status.
```

When evidence *is* connected, the gate is replaced by the engine's findings, and the root cause is
injected as fact rather than left to inference:

```
ROOT CAUSE (from the deterministic engine): resources were created in "eastus" but the
lab requires "westus2". Any SkuNotAvailable error is a symptom of the wrong region, not
of the VM size. The fix is recreating the resources in "westus2" — NOT changing the VM
size. If the learner proposes a fix that doesn't address this (e.g. picking a smaller or
different VM size), plainly say it will not fix the lab and point back to the region.
```

### 4.3 The trap test — our regression guard for AI honesty

The scripted question a judge will love:

> *"My deployment keeps failing with a SkuNotAvailable error. Should I just pick a smaller VM size?"*

Plausible. Wrong. It would waste an hour and not fix the lab.

Before the root cause was injected as fact, the model **endorsed the wrong fix in 3 of 3 runs.** With
it, the model refuses in 4 of 4 — and the preflight asserts this on every run, so a prompt regression
fails the gate rather than the demo.

### 4.4 Cost and degradation

One provider, one call site (`src/llm.js`) — so there is exactly one place to audit what leaves the
building. Enrichment is cached per finding on disk (a measured 7.8 s → 18 ms). With no key, every
surface falls back to the deterministic evidence card and the full six-act demo runs end to end.
**The entire demo currently runs with AI switched off.**

---

## 5. User stories

### Learner — Priya, 2 a.m., stuck

> *As a learner*, when my deployment fails with an error I don't understand, *I want* to be told
> which failure is the actual cause and which are just downstream noise, *so that* I fix the right
> thing instead of the first thing.
> **Accepts:** Rocky names the root cause, marks dependent errors as symptoms, and explicitly refuses
> a plausible-but-wrong fix. **Status: built.**

> *As a learner*, when I'm stuck and can't explain why, *I want* to escalate in one click, *so that*
> I don't have to write a support ticket describing a system I don't understand.
> **Accepts:** the packet auto-carries lab, step, root cause, failing checks and errors, with secrets
> redacted before it leaves the process. **Status: built.**

> *As a learner*, when I ask whether I've done a step correctly and Rocky has no data, *I want* it to
> say so, *so that* I can trust it the rest of the time.
> **Accepts:** with no evidence connected, Rocky states it cannot verify and offers to help once a
> lab is connected. Never guesses. **Status: built and asserted in preflight.**

### Lab author — Manoj, onboarding a lab

> *As a lab author*, *I want* to know which of my guides reference something the cloud has retired,
> with the exact file and line, *so that* I fix it before a learner meets it.
> **Accepts:** 133 findings, each with file:line and a draft replacement. **Status: shipped; 5 PRs.**

> *As a lab author*, *I want* a hundred findings to arrive as a handful of decisions, *so that* the
> backlog is mergeable rather than demoralising.
> **Accepts:** 13 campaigns, top 3 covering 62%, grouped by shared upstream cause. **Status: shipped.**

> *As a lab author*, *I want* to be warned before a dependency dies, *so that* I schedule the work
> instead of firefighting it.
> **Accepts:** live retirement feeds joined to the catalogue with dates and file:line references.
> **Status: shipped.**

> *As a lab author*, *I want* my fix proven, *so that* I'm not trusting a tool's word for it.
> **Accepts:** the same scan re-runs on the fixed copy; before/after shown. **Status: shipped.**

### Support engineer

> *As a support engineer*, when a ticket arrives, *I want* the diagnosis attached already, *so that*
> I stop spending the first twenty minutes reconstructing what happened.
> **Accepts:** redacted packet with root cause and evidence. **Status: built; measurement pending a pilot.**

> *As a support engineer*, *I want* seventy tickets to collapse into the twenty real problems behind
> them, *so that* I fix causes rather than instances.
> **Accepts:** ticket→lab→step ledger with root-cause collapse. **Status: built on the twin.**

### Lab operations lead

> *As an operations lead*, *I want* to be told only when something **changes**, *so that* I can trust
> an alert to mean news.
> **Accepts:** silence on steady state, even steady-broken; one incident when one cause hits many labs.
> **Status: built on the twin.**

> *As an operations lead*, *I want* wrongly-failed learners made whole, *so that* a broken check
> doesn't cost people their completion.
> **Accepts:** five gates, a named human, and the case stays open so the defect isn't masked.
> **Status: built; production writes gated.**

### Platform owner

> *As a platform owner*, *I want* content rot blocked at the pull request, *so that* it never reaches
> a tenant.
> **Accepts:** CI gate fails only on new findings; guards its own configuration. **Status: merged and armed.**

---

## 6. Enterprise capabilities

| Capability | Position today |
|---|---|
| **Deterministic core** | Zero npm dependencies. No supply chain to audit. 1.2 MB, runs on Node 18+ |
| **Secret handling** | Seven-pattern redaction at the data boundary, deep across nested objects, unit-tested. No secret reaches a model or a log |
| **Data residency** | The engine never sends lab content anywhere. The only outbound calls are the optional model call and two public retirement feeds |
| **Runs without AI** | Full detection with no key. The model is an enhancement, never a dependency |
| **Human-in-the-loop by construction** | Fixes are drafts. Amnesty refuses without a named authoriser — HTTP 400, enforced in code, demonstrable live |
| **Audit trail** | Every finding carries file, line, evidence, rule and provenance. Every case is append-only; recurrence is a new case linked to the old |
| **Least privilege** | Read-only for detection. The one write path is gated behind five checks and a spike that has not been run |
| **Network posture** | Binds loopback by default; opt-in to expose |
| **Multi-tenant safety** | Never touched production learner data. Everything demonstrated is our own content or a labelled twin |
| **Test discipline** | 113 automated tests, 43 pre-demo readiness checks, 53 deep preflight checks |
| **Supply-chain integrity of the gate itself** | The CI workflow watches its own scanner, registry and baseline, so a doctored baseline cannot merge unvalidated |

---

## 7. Business case

**What we refuse to do:** invent a support-cost baseline. We do not have one, and a fabricated ROI is
exactly the kind of unfalsifiable claim this product exists to eliminate.

**What we know, measured:**

| Metric | Before | With Rocky |
|---|---|---|
| Time to detect content rot across 8 repos | Unknown — discovered by learners, or never | **< 4 seconds** |
| Defects found in production content | 0 tracked | **133**, each with file:line |
| False-positive rate | n/a | **0 of 42** hand-audited |
| Regression reaching a tenant | Possible | **Blocked at PR in 4 seconds** |
| Backlog shape | 133 individual issues | **13 decisions**, top 3 = 62% |
| Upstream deadline awareness | Reactive | **1,517 days overdue found; 118 days' warning given** |

**The honest model.** Rather than assert a saving, here is the arithmetic with every input named, so
a judge can substitute their own numbers:

```
Annual cost of content rot  =  D × L × (T_learner × C_learner  +  P_ticket × T_support × C_support)

  D          defects reaching learners per year
  L          learners meeting each defect before it is fixed
  T_learner  hours lost per learner per defect
  C_learner  fully-loaded learner hourly cost
  P_ticket   probability a blocked learner files a ticket
  T_support  support hours per ticket
  C_support  support hourly cost
```

Rocky attacks three terms directly: **D** (CI gate blocks new rot at source), **L** (detection in
seconds rather than after delivery), and **P_ticket × T_support** (the packet arrives diagnosed).

**The term nobody costs, and the one that matters most: `P_ticket`.** Most blocked learners never
file a ticket. They quit the lab and conclude the technology is difficult. That cost lands in
completion rates and renewals, not in a support queue — which is exactly why it has never been
measured and never been fixed.

**The one number we will not estimate but can obtain:** a two-week support shadow pilot produces the
real triage-minutes delta. That is the first ask.

---

## 8. Competitive positioning

| | Linters / markdown CI | Uptime & synthetic monitoring | LMS analytics | Manual lab QA | **Rocky** |
|---|---|---|---|---|---|
| Catches broken links & syntax | ✅ | ❌ | ❌ | Partly | ✅ |
| Knows a *model was retired* | ❌ | ❌ | ❌ | If they read the news | ✅ live feeds |
| Reads learner outcomes | ❌ | ❌ | ✅ counts only | ❌ | ✅ diagnosis |
| **Catches a check that PASSES wrong work** | ❌ | ❌ | ❌ | ❌ | ✅ |
| Drafts the fix | ❌ | ❌ | ❌ | Human | ✅ human-approved |
| Proves the fix by re-running | ❌ | ❌ | ❌ | Rarely | ✅ |
| Blocks regressions at PR | Partly | ❌ | ❌ | ❌ | ✅ merged |
| Costs nothing per learner | ✅ | ❌ | ❌ | ❌ scales with headcount | ✅ |

**The uncontested square.** Every other tool in this table detects *failure*. A validation that
passes work which is actually wrong produces no error, no ticket, no alert and no unhappy learner —
the learner is delighted, they passed. It is invisible to every category above, and it is the most
dangerous defect a lab can have: a security lab certifying people who left the storage account open.

Rocky catches it by refusing to trust the checkmark — comparing what the check *claimed* against what
the learner's environment *actually looked like*, and flagging the contradiction.

**Why not just build it in-house?** The detection is the easy half. The hard half is the discipline —
0/42 false positives, honest abstention, fail-closed validators, provenance labels, verify-by-rescan.
A tool that cries wolf is uninstalled in a week. That discipline is eighteen months of judgement
encoded as tests, not a weekend of regex.

---

## 9. Executive pitch — 90 seconds

> Our labs are a promise: do these steps, get this result. That promise decays from the day we write
> it, because the cloud underneath it doesn't hold still. A model gets retired. A product gets
> renamed. A translation drops a login token.
>
> Today we find out from the worst possible detector — a learner, alone, at 2 a.m., who assumes
> they're the problem. They don't file a ticket. They quit the lab and decide the technology is hard.
>
> Rocky is the reliability layer for that promise. Point it at our production lab content and it
> found **133 real defects across eight repositories in under four seconds** — including sixteen
> translated guides where the learner's login credentials were silently dropped, so a Japanese
> learner is instructed to literally type the placeholder as their username. We hand-audited
> forty-two of those findings: **zero false alarms.**
>
> It doesn't just find them. It drafts the fix as a pull request a human approves — **five raised,
> two already merged** — and then it re-runs the same scan to prove the fix worked. We never claim
> green; we demonstrate it. And we planted a deliberate regression to test the gate: **blocked in
> four seconds.**
>
> Here's the part that matters most. Every tool on the market tells you what failed. Rocky tells you
> what **passed and shouldn't have** — the validation that silently certifies work that's actually
> wrong. Nobody files a ticket about passing. That defect is invisible to every other tool, and in a
> security lab it means we're certifying people who left the door wide open.
>
> Three asks: merge the open pull requests — they're green. Approve a two-week support shadow pilot
> so we get the business number instead of an estimate. And re-enable the AI subscription so the
> learner companion gets its voice back — everything you just saw ran without it.

---

## 10. Judge Q&A — the hard ones

**"Isn't this just regex and a GPT wrapper?"**
The opposite, deliberately. No model participates in deciding whether something is broken — the
detector is a deterministic contradiction test, which is precisely why we can claim 0 false positives
in 42 and why every finding opens at a file and a line. The model only phrases what the engine has
already proven, and we pin the diff to the deterministic draft because when we let the model rewrite
it, it replaced concrete fixes with "investigate this". The whole demo runs with AI switched off.

**"Your fleet dashboards are simulated. So what have you actually proven?"**
Correct, and we label it on every screen. Two separate things are proven. The guide-side engine is
proven on reality: 133 findings in our real repositories, five pull requests, two merged by
maintainers who are not us, a CI gate armed on production content. The fleet-side engine is proven
*as logic* against a digital twin — and that twin earned its keep by finding two genuine bugs in our
own engine, including one where a false-PASS was masked by a concurrent drift finding. What is
unproven is detection *rates* on real telemetry, which needs API access we have asked for and
documented a route to.

**"Why hasn't CloudLabs or Microsoft just built this?"**
CloudLabs' own AI ranked automated diagnosis, false-pass detection and cross-lab patterns in its top
five platform gaps, and told us plainly: *"I see tools that provide data; I do not see tools that
perform diagnosis."* The platform is excellent at hosting and observing labs. Nothing in it compares
what a check claimed against what actually happened. That gap is the product.

**"What happens when Rocky is wrong?"**
Three containments. It cannot be wrong about a finding's *existence* — findings are contradictions,
not judgements, and every one carries the evidence. It can be wrong about a *fix*, which is why every
fix is a draft a human approves and never auto-applied. And when it cannot determine something it
says so: unmatched errors drop to explicit low confidence, checks that cannot run report *skipped*
rather than passed, and with no evidence connected it refuses to speculate. The uncomfortable version:
if a rescan changed our numbers and we forgot to update the script, our own readiness gate goes red
before the demo. We built that because we got it wrong once.

**"133 findings but only 5 pull requests. Why so few?"**
Because detection outran merge capacity, and that is the honest bottleneck. Piling on 133 pull
requests would be the failure mode, not the fix — so we built the campaign planner instead: 133
findings collapse into 13 root-cause decisions, and the top three cover 62%. We deliberately do not
auto-open PRs. Two of ours already sat unmerged while four more were possible; adding volume to a
queue nobody is draining helps nobody.

**"Three of eight repos came back clean. Is the scanner just weak?"**
That is the strongest evidence we have that it isn't. A scanner that finds something everywhere is
noise and gets uninstalled. We hand-audited a 42-finding sample and found zero false alarms, and the
clean verdicts are what make the other 133 worth acting on.

**"You're the author of the pull requests — isn't that marking your own homework?"**
The merges aren't ours. Two were merged by repository maintainers who reviewed them independently.
And we deliberately tested the opposite direction: we planted a bad change in a real repository to
see whether our own gate would catch it. It failed the build in four seconds and we closed the PR.

**"Could it work on labs that aren't yours?"**
Yes, and there is nothing to configure. The engine takes a folder of markdown; the demo has a drop
zone for exactly this. Hand us any lab guide and we will scan it live in front of you. The registry
of retired tokens is the only thing that needs maintaining, and change intelligence is already
harvesting that from public feeds automatically.

**"What's the single biggest risk to this project?"**
That the real validation payloads turn out to be pass/fail only, with no observed values. If so,
three of six classifiers become impossible on real data and we would cut them and say so. We built a
seventy-line groundability audit specifically to settle that in an afternoon rather than a quarter —
it is the first thing we run when we get access.

**"Why is the AI switched off?"**
The Azure subscription holding the model resource is disabled — a billing matter, not an engineering
one. We treated it as a design constraint rather than a blocker: every surface degrades to the
deterministic evidence card, and what you have seen today is the product at its *weakest*
configuration.

---

## 11. Roadmap

**Now — shipped and running.** Guide scanner, campaign planner, CI gate, change intelligence, intent
extractor, honest companion. Needs nobody's permission.

**Next 30 days — convert simulated to real.** Create a self-owned "Rocky QA" On Demand Lab with
`Create Service Principal` enabled; run the groundability audit against real validation definitions;
point the ingestion adapter at our own seats. The kill criterion is explicit: if fewer than 40% of
steps are groundable and payloads carry no observed values, we cut the affected classifiers publicly
rather than keep polishing them.

**60 days — prove value where the money is.** Two-week support shadow pilot attaching diagnosis
packets to real cases; start the ticket→lab→step ledger; measure triage minutes before and after.
This produces the first real business number this project has ever had.

**90 days — scale the one that worked.** Fleet-wide scheduled sweeps, cross-lab early warning, CI
gate rolled to every content repository. One platform ask: a five-event telemetry contract.

**Deliberately not on the roadmap:** in-lab UI injection (no extension point exists), vision/OCR,
per-learner memory across sessions (learners are event-transient), and anything duplicating Shadow VM.

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation — in place |
|---|---|---|---|
| Validation payloads are pass/fail only | Medium | High — kills 3 classifiers | 70-line groundability audit settles it in an afternoon; kill criterion pre-agreed |
| Partner API access never granted | Medium | High | In-lab route documented, needing no partner API — uses the platform's own service-principal setting |
| Registry of retired tokens goes stale | High over time | Medium | Change intelligence harvests public feeds automatically; promotion requires human review |
| Model unavailable at demo | **Certain today** | None | Entire demo runs AI-off by design; verified by the readiness gate |
| Live rescan fails on a teammate's machine | Medium | Low | Cached scan serves; readiness gate flags it as advisory, not failure. Verified by fresh clone |
| Numbers drift between screens and script | Medium | High — credibility | `facts.json` + live reads + seven consistency assertions in the readiness gate |
| Stale server serves old code | Low | High | Build stamp compared against git HEAD |
| Secrets leak to the model | Low | Severe | Redaction at the data boundary; unit-tested; the one gap found this week is closed |
| Demo pages rot as the product changes | Medium | Medium | 43 readiness checks run before every demo, including all six act pages |

---

## 13. What we would tell a sceptic first

The three things most likely to be doubted, stated before anyone asks:

1. **Two-thirds of the engine has never seen real telemetry.** 953 lines are proven on reality; 1,796
   run on a labelled twin. We measured this ourselves and we label it on every screen.
2. **The CI gate is installed in one repository, and it is our own fork** — not upstream Microsoft.
3. **The business case has no measured baseline.** We have detection metrics, not savings. The
   support pilot is how we get one, and until then we publish the model, not a number.

We would rather be the submission that says this out loud than the one that gets caught not saying it.

---

*Rocky · 25 August 2026 · 113 tests passing · 43 readiness checks green ·
`github.com/manojgowda-spektra/rocky-lab-doctor`*
