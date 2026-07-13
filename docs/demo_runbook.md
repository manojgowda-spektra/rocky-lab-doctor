# Final Demo Runbook — Rocky
> **Presenting live? Rehearse from [`master_demo_script.md`](master_demo_script.md)** — the click-by-click
> performance script ("The Lab That Lied") with exact narration, timings, backups, and the Q&A arsenal.
> This runbook remains the ops manual (setup, reset, recovery, golden examples).
**The ONLY current runbook.** Rewritten 2026-07-06 as one unified identity: **Rocky is one system that
wears several hats** — 🩺 Doctor (scans + diagnoses), 🛠️ Fixer (drafts fixes, groups campaigns),
📡 Watcher (continuous monitor + reliability ledger), ⚖️ Guardian (False-FAIL Amnesty), 📋 Scholar
(Intent Ledger), 🎧 Listener (support intelligence), and 💬 Companion (the learner-facing character).
Never present these as separate products or "two engines" — they are one Rocky, wearing different hats
for different audiences. Every number below was verified live against the running system (local **and**
hosted) on the date of writing — see the live scorecard in
[Demo Readiness Checklist](#12-demo-readiness-checklist) for how to re-verify it yourself in under a
minute before you walk in. Superseded prior versions: `docs/archive/*`.

**Story arc (say this to yourself before anything else):** Problem → Detection → Diagnosis → Action →
Assurance → Future. Every act below hands off cleanly to the next — that handoff *is* the pitch.

---

## 0. Demo State Checklist (do this first, ~2 minutes)
1. `cd source/rocky-prototype`
2. Double-click **`start-demo.bat`** — or manually: `node web/server.js` in one terminal, `node preflight.js`
   in a second. Wait for **`✅ READY FOR DEMO`** and the **Demo Readiness Scorecard** (8 rows, all ✅, 50/50).
3. Keep the server terminal window open the whole time — the LLM cache lives in that process (cold
   clicks cost 2-4s, warm ones cost <100ms). The cache also now persists to disk
   (`logs/enrich-cache.json`), so a crash mid-rehearsal doesn't cost you the warm state back.
4. Close/hide any window showing `.env.local` (the live Azure key). Don't screen-share it.
5. **Start at the front door: open `/` (the home page).** This is the single entry point — it tells the whole
   story (value → the 6-stage workflow → all seven hats → role views) and every card links straight into the
   right hat. You can run the entire demo from home, clicking in and using each page's logo (top-left) to
   come back. If you prefer tabs, the hat order is: Doctor → Companion (`/rocky.html?demo=1`) → Fixer →
   Watcher → Guardian → Scholar → Listener → Receipts.
6. **Fallback URL**, no laptop dependency: `https://labdoctor-rocky.azurewebsites.net` — hosted, verified,
   same 50/50 scorecard. Use it if wifi or the laptop misbehaves (see [§10 Failure Recovery](#10-failure-recovery-procedures)).

## 1. The Story (say this first, ~15 sec)
*"Cloud labs silently rot — Azure changes under them, and today you find out from angry support
tickets. We built Rocky — one system that wears several hats: as Doctor it tests and diagnoses labs, as
Fixer it drafts and groups the fixes, as Watcher it remembers every case it's ever seen, and as
Companion it has the learner's back the whole time. Same engine, same honesty, every hat. Every single
claim it makes is labeled: observed, predicted, or modeled. We never fake green."*

## 2. Golden Examples (use only these — the strongest, most-verified instance of each)
| Category | Golden example | Where |
|---|---|---|
| Deprecated model | `text-embedding-ada-002` in the **new, zero-telemetry** lab (ODL-DEMO-0012) — caught by deterministic pre-launch lint before one learner arrives | `labdoctor.html` → click the new lab |
| Deprecated model (REAL, cross-repo) | Same token, **2 real repos** (OpenAIWorkshop + ai-developer), 13 findings — now **one campaign**, not two bugs | `campaigns.html` → CAMP-01 |
| Product rename | `Azure AD` → `Microsoft Entra ID`, real repo MCW-App-modernization — **fixed, PR merged** | `receipts.html` / PR link below |
| Broken validation (drift) | ODL-DEMO-0001, 22 learners, `eastus` vs `westus2`, correlated `SkuNotAvailable` | `labdoctor.html` → "Deploy a Resilient Web App" |
| False-PASS (the moat moment) | ODL-DEMO-0006, 100% completion, storage check silently passing public buckets | `labdoctor.html` → "Lock Down a Storage Account" |
| False-FAIL + Amnesty | 5 gates, wire-tested — now a **clickable dashboard** running against a simulated mirror of the write endpoint (see §9) | `amnesty.html` |
| Intent Ledger | 2 real guides, 129 facts, **100% quote-anchored** to source | `intent.html` |
| Campaign grouping | 133 real findings → **13 campaigns, top 3 cover 62%** | `campaigns.html` |
| PR creation | ai-developer#5 (ada-002 fix — clean re-cut of the conflicted #1), ai-developer#4 (EOL runtimes + "gate the gate"), OpenAIWorkshop#2 (Node floors) — all **OPEN, green, mergeable now** | `gh pr view` or GitHub |
| PR merge | MCW#1 (renamed products), ai-developer#2 (CI gate itself) — both **MERGED** | GitHub |
| CI failure (protection working) | ai-developer#3 — deliberate regression PR, **CI failed in 4 seconds**, closed as planned | GitHub Actions run log |
| CI protection (self-hardening) | ai-developer#4's own gate check passed **because** the PR fixed a hole where the gate never ran on itself | GitHub Actions run log |

## 3. Full Demo Script (6 Acts, ~9-10 min total, trim to time available)

### Act 1 — The Problem (~30 sec, no screen yet)
*"A learner opens a hands-on lab. Azure has changed something underneath it since it was authored —
a region default, a model retirement, a renamed portal blade. The lab's own validation checks either
silently pass wrong work, or fail correct work. Nobody notices until support tickets pile up — and a
ticket only tells you a learner is unhappy, never why. Today, finding out means a human manually
re-running the lab, or waiting for enough complaints to notice a pattern. That doesn't scale past one
lab, let alone a catalog."*

### Act 2 — Detection (~2 min) — Tab: `labdoctor.html`, REAL DATA panel
1. **Hero framing**: "3 of 12 labs are failing learners right now — detected from telemetry, before a
   single support ticket." Point at the health ring (84) and *learners in impacted labs: 142*.
2. **REAL DATA panel**: *"Everything else you'll see today runs on our simulated demo fleet — but THIS
   panel is our real production lab repositories: 8 repos, 133 findings, every one with file:line
   evidence, 3 repos come back completely clean."* Click a finding, show the exact evidence line.
3. **CI Gate**: *"Detection alone doesn't stop rot from coming BACK. We put a gate in CI on a real repo —
   it diffs findings against a baseline and fails a pull request only on NEW rot. We proved it: a
   deliberate regression PR failed the gate in 4 seconds** and was closed. That's PR #3 on `ai-developer`,
   real GitHub Actions, real red X."*
4. Click the **NEW lab** ("Build a RAG App…") → pre-launch lint fires automatically, catches
   `text-embedding-ada-002`. *"Zero learners yet — deterministic token match, not AI guessing, caught
   before a single person walks into it."*

### Act 3 — Diagnosis (~2.5 min) — Tab: `labdoctor.html`
1. **Cross-lab pattern** (🛰️): *"Two different labs, same root cause — resources landing in East US
   where the required SKU isn't available. One's a VM lab, one's a Functions lab — a platform-level
   change, not an authoring mistake. No human watching one lab could see this."*
2. Click **"Lock Down a Storage Account"** → the money line: *"100% completion, and it's BROKEN. The
   validation silently PASSES learners whose storage is still public. Nobody complains about a passing
   check — tickets can't see this. Only comparing expected-vs-observed across the fleet can."* Show the
   evidence (23 learners, observed `publicAccess:true` vs expected `false`) and the drafted fix
   targeting **the check, not the learner**.
3. Click **"Deploy a Resilient Web App"** → 3 findings ranked by severity then learners affected. Open
   the drift finding: evidence, diagnosis, red/green fix diff — the red line is the lab's own real step
   text. *"Every fix is a draft — a human author approves; nothing is silently applied."*
4. **Contradiction framing, said explicitly once**: *"Every finding here is two facts that can't both be
   true at once — 100% completion AND broken storage; author intent AND observed outcome. That
   contradiction, not a guess, is what triggers a finding."*

### Interlude — Rocky puts on its Companion hat (~1.5 min) — Tab: `/?demo=1`
1. **Frame it**: *"Same broken lab, from the learner's chair."* A small animated robot character greets
   you on load — this is the same Rocky you've been watching, now wearing its Companion hat instead of
   its Doctor one. Click it once to open the chat panel; double-click it for a hidden easter-egg
   animation (harmless, just personality).
2. Ask **"Did I complete this step correctly?"** → grounded answer naming the region mismatch — watch
   Rocky's expression shift to *detective* while it reasons and *concerned* once it answers, because the
   lab genuinely has a failing check right now, not because it's performing an emotion on request.
3. Ask **"My deployment keeps failing with SkuNotAvailable. Should I just pick a smaller VM size?"** →
   Rocky refuses; the error is a *symptom* of the wrong region. *"Generic AI says 'try a smaller VM' —
   that breaks the lab. Rocky reasons from the lab's validation evidence."*
4. Click **⚠ License issue** → **🛟 Escalate** → watch Rocky strike its *hero* pose (a protective teal
   halo) and the redacted diagnostics render in the chat log: `ConnectionString=[REDACTED]`. *"The learner
   never explains anything, secrets never leave the box — and Rocky only strikes that pose because a
   ticket was genuinely filed, a fact it can check, not a feeling it's asked to fake."*
5. Click **✓ Apply fix** → the region validations flip green and Rocky visibly **celebrates with confetti**
   — but only because the failing-check count actually dropped. *"Even the celebration is evidence-gated —
   if the fix hadn't worked, it wouldn't throw confetti. Not one animation on this screen is decorative
   without also being true."*
6. **The trust close**: toggle **Demo scenario off** → the lab panel dims, the pill flips to "not
   connected," and Rocky's expression settles to a plain neutral (not sad — just honest). Ask "did I
   complete this step?" again → it says it has no live lab connected and can't verify. *"A wrong confident
   answer is worse than admitting insufficient information — and note Rocky doesn't fake distress or
   enthusiasm here either; the character's honesty extends to its own body language."* Click **↻ Reset**
   before moving on.

### Act 4 — Action (~2 min) — Tabs: `labdoctor.html` → `campaigns.html` → `monitor.html`
1. **Preview-fix-impact**: click it on the web-app lab → *"Modeled if approved: health 36 → 100,
   completion 9% → 81%. NOT executed — pending author merge."* Say it straight: *"this is a model of the
   best case and the UI says so — we don't fake verification."*
2. Switch to **`campaigns.html`**: *"133 real findings is a backlog nobody merges. Grouped by CAUSE it's
   13 campaigns, and the top 3 cover 62%. CAMP-01 is one upstream model retirement touching 2 repos —
   that's a Dependabot-shaped unit of work."* Expand it, show the real file:line samples.
3. Switch to **`monitor.html`**: click **Advance one sweep** to sweep 3, 4, then 6. *"Alerts only on
   CHANGE — silent false-pass at sweep 3, four labs folding into ONE platform incident at sweep 4,
   recovery at sweep 6."* Point at the **Reliability Ledger** panel below: *"every case, error budget,
   and validator trust tier is DERIVED from those sweeps — the fix queue is ranked by one honest number,
   learner-sweeps lost, and a validator that's wrong twice gets tier-tracked like a faulty sensor."*
4. **The amnesty beat** — switch to `amnesty.html`: *"When a validator regresses into failing CORRECT
   work, this restores the learners' verdicts — but only under five gates that make writing a wrong PASS
   structurally impossible."* Point at the five gates, the eligible table (state-proven victims) and the
   excluded table (wrong-work and no-evidence learners, with the reason shown). Then the money move:
   click **"Try without a name"** — the write is refused live (HTTP 400). Type an authorizer, click
   **Authorize & restore** — verdicts flip to RESTORED and the reversion guard reports 0 contradicted.
   Say it plainly: *"this runs against a simulated mirror of the platform's write endpoint — the big blue
   badge says SIMULATED — because we don't touch the real write endpoint until we've verified how it
   behaves. Same code, proven over real HTTP in the test suite."* (See §9 for the honest framing.)

### Act 5 — Assurance (~1.5 min) — Tab: `monitor.html`, then back to `labdoctor.html`
1. Still on `monitor.html`: *"Sweep 5 — nothing. A steadily broken fleet is not news; the monitor stays
   silent on steady state, even a steady BROKEN state. That silence is deliberate — an alert on every
   sweep trains people to ignore alerts."*
2. **Recovery**: *"Sweep 6 — the author merged the fix. Recovery detected, and the ledger closes the
   case automatically — same mechanism, no separate 'is it fixed' logic."*
3. **CI enforcement, close the loop**: *"And the CI gate you saw detect rot in Act 2 is the same
   mechanism that PREVENTS it from coming back — that regression PR failing in 4 seconds wasn't a demo,
   it's the gate armed on a real repo, blocking a real pull request."*

### Act 6 — Future Product (~1.5 min, only if time/interest remains) — Tab: `support.html`
1. **Support Intelligence**: *"74 simulated tickets collapse to 24 incidents. A ticket is a signal, never
   proof — a lab is blamed only when fleet diagnosis confirms a matching defect. A healthy lab is never
   blamed no matter how many people complain about it."*
2. **Change Intelligence** (back on `labdoctor.html`, Ecosystem panel): *"Live feeds, not hardcoded rules —
   217 real candidates harvested from endoflife.date and Azure Updates collapsed to 6 cited catalog
   impacts, including Python 3.10 EOL with a dated deadline and the exact 4 files that reference it."*
3. **Intent Ledger** — switch to `intent.html`: *"We piloted extracting each lab step's intent —
   objective, expected outcome, checkable facts — on two real guides. Every fact came back anchored to a
   verbatim quote from the source, 100% of the time."* Expand a guide, point at the green ✓ ANCHORED
   badges and the quotes beneath each fact. *"A green anchor proves the quote is real — human review is
   still the gate for whether the interpretation is right, and the UI says so. This is the machine-readable
   model of authored intent the platform doesn't have today, and the foundation for a validator coverage map."*
4. **Action Plane, the honest close**: *"The False-FAIL Amnesty engine is fully built and proven against
   a live HTTP wire path — five gates that make writing a wrong verdict structurally impossible, and it
   refuses to run without a named human. One production spike, verifying how the platform's own write
   endpoint behaves, is what turns it on."*

## 4. Executive Script (~90 seconds, no screen required — use if you have a hallway minute)
*"Hands-on cloud labs break silently when Azure changes underneath them, and today the company finds
out from angry learners. We built a system that watches every learner session as a live test,
diagnoses defects by finding contradictions no single tester would ever spot — like a check that's
100% passing work that's actually broken — and drafts the fix for a human to approve. It's already
running on real production lab repositories: 133 real defects found, two fixes already merged, and a
CI gate that blocked a real regression from merging in four seconds. It remembers every case it's ever
seen, so it can tell you which fix is worth doing first and which validator can't be trusted. Nothing
it does is ever silently applied — every claim is labeled real, predicted, or simulated, on purpose."*

## 4b. Five-Minute Stakeholder Pitch (covers: how it works, efficiency, honest gaps, integration path)
Use when you have exactly 5 minutes with all tabs already open and need to hit: how it works, how useful/
efficient it is, what's honestly missing, and how it gets integrated — in that order, simple words, timed.

**0:00–0:30 — the problem** (no tab): *"Online cloud labs quietly break. Azure changes underneath them and
the lab's own checks start lying. Today we only find out from angry tickets, weeks later. What I'm about to
show you finds these breaks in minutes and drafts the fix automatically."*

**0:30–1:45 — how it works** (`labdoctor.html`): point at the health ring (3/12 failing, found before any
ticket). Click "Lock Down a Storage Account" — *"100% of learners are marked passed... but the check is
broken. It's quietly approving wrong work. Nobody complains, so it was invisible until we compared what
learners actually did against what the lab expected. Find two facts that can't both be true, and you've
found a real bug, not a guess."*

**1:45–2:30 — Rocky, quick** (`/?demo=1`): the wrong-VM refusal, then click Apply fix — *"it only celebrates
when a fix actually worked. Even the character doesn't fake success."* (Cut first if running long.)

**2:30–3:15 — efficiency & usefulness** (`campaigns.html` → `monitor.html`): *"133 real findings across 8
repos. Grouped by cause, that's 13 campaigns — top 3 cover 62%. One decision, many labs fixed. And a
deliberately-broken test PR was blocked from merging in 4 seconds. Less manual testing, fewer tickets,
faster fixes."*

**3:15–4:00 — what's honestly missing** (no tab — say this plainly): *"Three real gaps. One: three fixes
are ready to merge right now — that's your click, not mine. Two: it can draft a corrected grade for a
learner wrongly failed, but needs one safety check before it's allowed to write that live — today it only
proves itself on a labeled practice copy. Three: proven on 8 repos, not the whole catalog yet. Every number
here is real and re-checkable live."*

**4:00–4:45 — how we'd integrate it** (no tab): *"Three steps. First, connect real learner data — a config
change, not a rebuild. Second, run the one safety check that lets it write fixes live, not just report
them. Third, pilot it on one real training event — sweep 72 hours before, fix what it finds, measure the
ticket drop. No new infrastructure, no new team."*

**4:45–5:00 — close**: *"It catches what humans structurally can't — a check that lies to everyone at once
— and it never pretends to know something it doesn't. That honesty is the product, as much as the
bug-finding is."*

*Extra time? Add the `amnesty.html` "try without a name" 400-refusal click — the single most memorable
guardrail moment in the whole demo.*

## 5. Technical Script (for engineering-literate judges — leads with rigor, not features)
Open with: *"Three engineering decisions carry this whole system, and I'll show you evidence for each."*
1. **Deterministic-first, LLM-narrates-only.** Every finding is asserted by comparing expected vs.
   observed state — pure logic, zero model calls. The LLM only writes the English sentence around an
   already-computed fact. Turn the model off (`&enrich=0`) and every finding, evidence line, and fix
   draft still renders — show it.
2. **Adversarial testing found two real bugs, not hypothetical ones.** The digital twin's *compound*
   scenario (drift + false-pass on the same lab) caught a real absorption bug in the diagnosis engine —
   drift explanation was silently swallowing the false-pass finding. Separately, building the amnesty
   engine surfaced a second-order bug: naively writing a corrected verdict back would have erased the
   fleet evidence and faked a "recovery" while the validator kept wronging new learners. Both are fixed,
   both are regression-tested (`test/sim.test.js`, `test/amnesty.test.js`). *This is what "adversarial
   simulation earns its keep" looks like in a diff, not a slide.*
3. **104 tests, 50 live preflight checks, provenance on every claim.** `node --test` from the repo root.
   Every UI surface carries an explicit REAL / FIXTURE / MODELED / SIMULATED label — grep the codebase,
   you will not find a place where simulated output is presented unlabeled as production truth.

If pressed on architecture: contradiction-based diagnosis (author intent vs. observed outcome vs. public
announcements) → continuous monitor (sweep-diff, alerts only on change) → reliability ledger (cases
derived from monitor history, never independently asserted) → campaign planner (groups by cause, not
symptom) → the Action plane sits behind one verified unknown: the platform's write-endpoint semantics.

## 6. Backup Script (if the live system is unavailable — laptop dead, wifi down, server crashed)
**Tier 1 — hosted fallback (try first, costs 10 seconds):** switch to
`https://labdoctor-rocky.azurewebsites.net` — same build, same 50/50 scorecard, zero local dependency.
**Tier 2 — fully narrated, no screen:** walk the six acts as a spoken story using the exact verified
numbers in this document (they don't change without a redeploy, and this doc is updated at every
redeploy) — Act 2: "8 repos, 133 findings, 3 clean, CI gate blocked a regression in 4 seconds." Act 3:
"100% completion, silently broken, 23 learners." Act 4: "133 findings, 13 campaigns, top 3 cover 62%."
Act 5: "recovery detected automatically at the scripted sweep, same mechanism that gates CI." The story
survives without a browser because every number in it is a fact you're reciting, not a live claim you're
making — say that explicitly if a judge notices you've gone off-screen: *"I'm reciting real numbers from
the last verified run, not inventing them on the spot — happy to pull up the hosted URL if you want to
watch it live."*
**Tier 3 — LLM down specifically (not a system outage):** stay on-screen. The engine is
deterministic-first — catalog, findings, evidence, fix drafts, campaigns, ledger, and monitor all work
with the model off. Say: *"the AI narrates, the engine asserts — watch it run without the AI,"* and add
`&enrich=0` to any lab-detail URL to prove it live.

## 7. Judge Question Bank
- **"Is this live production data?"** — "Two data classes, both labeled everywhere in the UI: REAL is
  our actual production lab repositories (133 findings, real PRs, real CI gate) — genuinely live,
  re-scannable in front of you. SIMULATED is a digital twin we built after deciding NOT to touch the
  live CloudLabs learner-facing portal without authorization — its telemetry is fixture-seeded against
  the real, documented API shapes. The diagnosis engine is identical code either way; only the data
  source changes."
- **"Did the self-heal actually re-run anything?"** — "No, and the UI says so: it's a projected-impact
  model, not a re-validation. Real re-validation needs a round-trip through the lab's own build/deploy
  pipeline — that's roadmap, and we refuse to fake it meanwhile."
- **"Prove the storage lab number, then."** — Do it live: preview-fix-impact on the storage lab drops
  completion 100% → 4% because "the corrected check now rejects work the broken check was silently
  passing — the 100% was never real." A tool that faked green here would show 100; we show 4.
- **"Why won't Copilot/ChatGPT just do this?"** — "They answer from general knowledge; this answers from
  this learner's validation evidence, this lab's authored intent, and this fleet's baseline. They can't
  see any of the three, and they can't get the lab fixed behind the learner. The loop — detect, draft,
  approve, remember, prevent — requires owning the artifact and the fleet history, which is exactly the
  reliability ledger and campaign planner you just saw."
- **"How many false positives?"** — "0 out of 42 hand-audited real findings. We institutionalized that
  audit rather than quoting it once — `audit-sample.js` is a real script in the repo."
- **"What's actually left to build?"** — "One thing gates the whole Action plane: verifying how the
  platform's own (currently unused) write-back endpoint behaves — does a written verdict persist, is it
  visible to the learner, is it audited. Everything downstream of that answer — amnesty, a validation-panel
  presence for the companion — is already built, and you can click through the amnesty pipeline end to end
  on `amnesty.html` against a simulated mirror of that endpoint. The spike swaps the mirror for production."
- **"Where does the lint's confidence number come from?"** — "It doesn't have one anymore — the card
  says 'deterministic · token match' because the match itself is exact. What's uncertain is only whether
  a given retirement breaks this specific lab's flow, and we say that in plain words instead of faking a
  percentage."
- **"Show me a fix that actually merged."** — MCW#1 (Azure AD → Microsoft Entra ID) and ai-developer#2
  (the CI gate itself) are both merged, real GitHub PRs — open them.

## 8. Objection Handling
- **"This is just regex + a GPT wrapper."** — Concede the regex part fully: the scanner and the CI gate
  ARE deterministic token matching, on purpose (zero model risk on the checks that gate a merge). The
  part that isn't grep: cross-learner contradiction diagnosis (comparing thousands of individual
  observed-vs-expected outcomes to find a check that's WRONG, not a lab that's broken), fleet-scale
  pattern detection no single session can produce, and a reliability ledger that derives error budgets
  and validator trust from case history. Offer the twin-found bug story here — that's a defect a regex
  script cannot find because it requires cross-referencing an evolving state over time.
- **"Your simulated data proves nothing — of course it works on data you made up."** — Two real bugs
  were found BY the simulation, not planted for the demo: the drift/false-pass absorption bug and the
  amnesty self-masking bug. A rigged simulation that only confirms what you already believe wouldn't
  have surfaced either — those were adversarial, unplanned discoveries. Separately: 8 real repos, 133
  real findings, 4 real PRs, 1 real CI gate are not simulated at all.
- **"Why not just use Datadog / an existing APM tool?"** — APM tools watch infrastructure health
  (latency, errors, CPU) — they have no concept of "this Azure lab's step 3 expects a resource group in
  westus2." This system's unit of truth is the lab's own authored validation contract, compared against
  what actually happened to a real learner. That semantic layer doesn't exist in general observability
  tooling and can't be bolted on without owning the lab content and validation definitions the way we do.
- **"A human tester would have caught the storage bug eventually."** — Only by getting unlucky enough to
  test with the wrong state and noticing the check passed anyway — which is precisely the scenario a
  human tester has no reason to try, since the check SAID pass. It took comparing 23 learners' actual
  observed state against the documented expectation, at fleet scale, to see it. One session can't
  produce that signal.
- **"You could have hardcoded these demo numbers."** — Every number quoted in this document is
  reproducible by running `node preflight.js` yourself, right now, against either the local server or
  the hosted URL — offer to let the judge run it.

## 9. Handling the Amnesty question (there IS a dashboard — but it runs against a simulated mirror)
`amnesty.html` is a **live, clickable dashboard**, and you should demo it — but be precise about what it
writes to. It executes the full pipeline (draft → human gate → write → reversion guard) against an
**in-process mirror of the platform's write endpoint**, not production. This is deliberate and it's the
honest framing, not a hedge: *"Everything you're clicking is real code — the same `action/amnesty.js`
that's wire-tested over HTTP in the suite. What it writes to is a simulated mirror, labeled SIMULATED in
the big blue badge, because we haven't yet run the one spike that verifies how the platform's real
write-back endpoint behaves. We refuse to click a button that claims to write to production before we've
verified production. That's the same discipline behind every 'modeled, not executed' label you saw
earlier."* The **two moments to land**: (1) click *Try without a name* → live HTTP 400 refusal, proving
the human gate is code not policy; (2) after executing, point at the reversion-guard row — *"0
contradicted, and every write preserved the machine verdict beneath it, so the false-fail case stays
OPEN until the validator is actually fixed. Restoring a learner's verdict never masks the defect."*
If a judge wants the proof beneath the UI: run `node --test test/amnesty.test.js` live — 4/4 in under a
second, including the full HTTP wire-path test and the no-self-masking invariant.

## 10. Failure Recovery Procedures
- **Server won't start / port in use** → the server prints exactly what to do (`set ROCKY_PORT=5174`, or
  use the existing window). Preflight waits up to 20s for a slow boot before failing.
- **A lab detail feels slow** → you clicked a lab preflight didn't warm; one-time ~2-4s cost, then
  cached to disk. Narrate over it: "it's drafting with the model right now."
- **LLM times out / errors** → 15s timeout (`ROCKY_TIMEOUT_MS`), UI gives up at 20s with a friendly
  message. Fall to Tier 3 of the Backup Script — the engine works with the model off.
- **State polluted from rehearsal** (validations already green, monitor mid-timeline) → click **↻ Reset**
  on the Rocky tab and **↻ Reset timeline** on `monitor.html`. `preflight.js` also resets both as its
  last step, so re-running it before you present is always safe.
- **Wifi drops mid-demo** → local server has no internet dependency except live LLM calls; catalog,
  findings, campaigns, ledger, monitor all keep working. Only the companion's live chat needs the model.
- **Someone clicks something during Q&A that leaves state dirty** → same reset procedure; takes <5 sec.

## 11. Demo Reset Procedures (routine, between rehearsals or presentations)
1. `node preflight.js` — resets Rocky's learner state AND the monitor timeline as its final two steps,
   independent of pass/fail on everything else above them.
2. If you want a fully cold start (new server process, empty disk cache): stop the server window, delete
   `logs/enrich-cache.json` (optional — only needed to re-test cold-click timings), restart via
   `start-demo.bat`.
3. Hosted deployment resets the same way: `ROCKY_BASE_URL=https://labdoctor-rocky.azurewebsites.net node preflight.js`.

## 12. Demo Readiness Checklist
Run `node preflight.js`. You are ready when you see:
```
── Demo Readiness Scorecard ──────────────────────────────
  ✅ Setup                    5/5
  ✅ Act 2 — Detection        5/5
  ✅ Act 3 — Diagnosis        11/11
  ✅ Act 4 — Action           13/13
  ✅ Act 5 — Assurance        2/2
  ✅ Act 6 — Future Product   5/5
  ✅ Rocky (Trust Layer)      6/6
  ✅ Cleanup                  3/3
  ────────────────────────────────────────────────────────
  TOTAL  50/50
────────────────────────────────────────────────────────────
✅ READY FOR DEMO
```
Every row maps to one Act in §3 — if a row shows a ❌, that Act's beats are not safe to present live;
either fix the underlying failure or skip straight to that Act's material in the Backup Script (§6).
This scorecard is generated by `preflight.js`, not hand-maintained — it cannot go stale the way a
written checklist can.

## After the demo
- Rotate the Azure OpenAI key (`.env.local`) if it's been used from a shared or demo-visible laptop.
- Capture every question asked — they are market signal for what to build next, more reliable than any
  roadmap guess.
- Merge the three real, verified, already-green fixes sitting open (each is one `gh pr merge` click):
  `ai-developer#4` (EOL-runtime CI gate), `ai-developer#5` (ada-002 → 3-small; the clean replacement for
  the conflicted #1 — close #1 in its favor), and `OpenAIWorkshop#2` (Node floors → 22 LTS).
