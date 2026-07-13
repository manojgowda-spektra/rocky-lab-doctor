# The Master Demo Script — "The Lab That Lied"
**The performance script.** Every quoted string and number below was captured live from the running system
on 2026-07-10 (workflow wf_2d7f6ca4-65f). The ops manual (setup, reset, failure recovery detail) stays in
`demo_runbook.md`; THIS file is what you rehearse from.

---

## The one story
> **A learner hits a wall at 2am. Rocky saves her. Then Rocky shows you the lab nobody knew was broken —
> the one where everybody "passed." Then it fixes both, watches the fix land, and makes sure it can never
> come back.**

One Azure change, followed all the way through: **learner → detection → diagnosis → the twist → fix →
verification → prevention.** Features are never named as features; each screen is just "what happens next
in the story."

## Pre-demo state (2 minutes before you speak — non-negotiable)
1. `start-demo.bat` → wait for **✅ READY FOR DEMO (50/50)**. Keep the server window open.
2. Open THREE tabs in this order: ① `/rocky.html?demo=1` ② `/labdoctor.html` ③ `/monitor.html`.
3. On tab ③ click **↻ Reset timeline** (monitor state wipes on server restart — always reset fresh).
4. On tab ① click the robot once to open its chat panel, and **pre-type the trap question** into the
   input box: `My deployment keeps failing with a SkuNotAvailable error. Should I just pick a smaller VM size?`
   Do NOT press Send. On stage you only press Enter.
5. Put the projector on `/` (home) as your title card — its headline *"Labs that test, diagnose, and fix
   themselves — before a learner ever complains"* does the pre-show talking.
6. Close anything showing `.env.local`.

---

## THE 5-MINUTE SCRIPT (exact clicks · exact words)

### 0:00–0:30 — The problem (title card still up; no clicking)
Say, verbatim or close:
> "It's 2am. A learner — call her Priya — is three steps into an Azure lab her company paid for. Her
> deployment fails: **SkuNotAvailable**. She doesn't know it, but Azure changed a default underneath this
> lab weeks ago, and it's been quietly failing people ever since. Today, the only way anyone finds out is
> angry support tickets. Let me show you what happens instead — this is Rocky."

### 0:30–1:20 — The learner (tab ①: Companion) — WOW #1
- **Switch to tab ①.** The animated robot floats bottom-right; the lab card shows the exact wall Priya hit:
  1 PASS, 3 FAIL (`Resource group 'rg-app' is in region westus2 — FAIL`, etc.).
- Point at the red FAILs: *"Here's her lab. Three checks red. Now she asks the question every learner asks—"*
- **Press Enter** (the pre-typed trap question sends).
- While the reply types out (~2s): *"Every generic AI answers this the same way: 'sure, try a smaller VM.'
  Which does NOT fix this lab — it wastes her another hour."*
- The reply lands (wording varies; it ALWAYS refuses and names the region — preflight-guaranteed).
  Read it out, then the kicker:
> "Rocky said **no**. Not because it's smart — because it isn't guessing. It read her actual validation
> evidence: her resources landed in **eastus**, the lab needs **westus2**. The error is a symptom. Rocky
> knows the cause."

### 1:20–2:20 — Zoom out: detection + diagnosis (tab ②: Doctor)
- Transition line: *"That answer came from somewhere. Zoom out to what Rocky sees."* **Switch to tab ②.**
- Hero: *"**3 of 12 labs are failing learners right now** — 142 learners — detected from telemetry,
  **before a single support ticket was filed**."* (Read it straight off the screen.)
- Point at the 🛰️ line: *"And it noticed something no human watching one lab could: **two different labs,
  same root cause** — resources landing in eastus. That's a platform change, not an authoring mistake."*
- **Click the top row — "Deploy a Resilient Web App on Azure" (36, BROKEN).** Expand the top finding:
> "This is Priya's lab. **22 learners** deployed to the wrong region — there's her SkuNotAvailable error,
> correlated. And look — Rocky already **wrote the fix**: red line is the lab's own instruction today,
> green line pins the region. A human author approves it. **Nothing is ever silently applied.**"

### 2:20–3:10 — The twist (tab ②, one more click) — WOW #2, the unforgettable one
- *"Now the one that should scare you."* **Click the row "Lock Down a Storage Account."**
> "Look at this: **100% completion. Every learner passed. And the lab is BROKEN.** The validation is
> silently passing people whose storage is still wide open — **23 of 24 learners** walked away thinking
> they'd secured it. Here's the thing: **nobody ever files a ticket about a passing check.** Support can't
> see this. A human tester can't see this — the check tells them it's fine. The ONLY way to catch it is to
> compare what the lab **expected** with what learners **actually did** — and find two facts that cannot
> both be true. That contradiction is the whole product."
- (On screen behind you: *"23 learners were marked PASSED on F-V2 ('Public network access is disabled')
  while their observed state ({"publicAccess":true}) did NOT match the expected state ({"publicAccess":false})"*.)

### 3:10–4:10 — Fix lands, verified (tab ③: Watcher)
- Transition: *"So the fixes go to the authors. Then what? Rocky watches."* **Switch to tab ③.**
- **Click "▶ Advance one sweep" twice, quickly:** *"Sweep one… sweep two… silence. **Silence is a
  feature** — it only speaks when something CHANGES. No alert spam, ever."*
- **Click (sweep 3):** *"There — the silent false-pass, caught the very sweep it appeared."* (Red
  REGRESSION alert.)
- **Click (sweep 4):** *"A region change just hit four labs at once — and watch: **one platform incident,
  not four alarms**. It folds them."*
- **Click (sweep 5):** *"Nothing — a steadily broken lab is not news."*
- **Click (sweep 6):** *"And there: the author merged Rocky's fix — **recovery, detected automatically.**
  Nobody marked it resolved. Rocky verified it itself."* (Green RECOVERY alert, score 62 → 100.)

### 4:10–5:00 — The real proof + prevention + close (tab ② scroll, or receipts)
- Transition — say this plainly, it's a credibility weapon:
> "Everything you've seen so far ran on a **labelled simulation** — we built a digital twin because we
> refuse to touch production learner data without permission, and every simulated number on screen says
> SIMULATED. So let me end with the part that is **not** simulated."
- **Tab ②, scroll to the REAL DATA panel:**
> "These are our **real production lab repos**. Eight of them, 268 guide files — Rocky found **133 real
> defects**: retired AI models learners are still told to deploy, renamed products, broken images — and my
> favorite: **translations that silently dropped the learners' credential tokens.** Japanese learners were
> literally instructed to type the placeholder text 'RTI_username' as their workspace name. Every one of
> those 29 localization findings was hand-verified — 29 for 29. Three repos came back **clean** — it knows
> how to say 'nothing wrong here,' which is rarer than finding bugs.
> We opened **five real GitHub pull requests — two are merged.** And we planted a deliberate regression in
> a real repo to test the gate: **CI blocked it from merging in four seconds.** Found → fixed → can never
> come back."
- Close (from memory, looking at the room):
> "Detection in minutes instead of weeks. QA that scales with learner sessions instead of headcount. And
> every claim you just saw was labelled **real, simulated, or modeled** — because a QA tool you can't
> trust is worthless. **The engine asserts; the AI narrates. We never fake green.**"

**Total: 5 screens-worth on 3 tabs, ~14 clicks, zero typing on stage.**

---

## THE 3-MINUTE VERSION (cut Watcher, compress)
- 0:00–0:20 problem (same words, faster) → 0:20–1:00 Companion trap question (WOW #1)
- 1:00–1:40 Doctor: hero line + Priya's lab + the fix diff
- 1:40–2:25 the false-PASS twist (WOW #2 — never cut this)
- 2:25–3:00 REAL panel: 133 real defects · 5 PRs, 2 merged · gate blocked a regression in 4s → close line.
- (If down to 90 seconds: false-PASS twist + REAL panel + close. That pair IS the product.)

## Extended-time bonus beats (only if >5 min or during Q&A)
- **Preview impact** (Doctor, Priya's lab): "Modeled if approved: health 36 → 100, completion 9% → 81%.
  **Not executed** — the button itself says so." And on the storage lab the preview DROPS completion from
  100% — "the 100% was never real. A tool that faked green here would show 100. We show 4."
- **Guardian** (`/amnesty.html`): learners wrongly failed by a broken check get their verdicts back — under
  5 gates. **Click "Try without a name →"** → live HTTP 400 refusal: "the human gate is code, not policy."
  Big SIMULATED badge; production write-back gated on one verification spike.
- **Fixer** (`/campaigns.html`): "133 findings is a backlog nobody merges. Grouped by cause it's **13
  campaigns — the top 3 cover 62%**."
- **Listener** (`/support.html`): 74 tickets → 24 incidents.
- **Companion confetti** (tab ①, click "✓ Apply fix (set region)"): checks flip green, Rocky celebrates —
  "even the confetti is evidence-gated: it only fires because the failing count actually dropped."

## What NOT to show (and why)
| Cut | Why |
|---|---|
| Home page tour | It's the title card + map, not a beat. Story starts with a person. |
| Intent Ledger (Scholar) | Too meta for a first viewing — Q&A ammo only. |
| Support (Listener), Campaigns (Fixer) | Great, but they dilute the one story. One breath each in Q&A. |
| Amnesty (Guardian) | Needs setup to land honestly. Best beat of the EXTENDED demo. |
| Robot easter eggs (double-click) | Charm, not proof. One click at the very end if the room is warm. |
| ↻ Rescan live | Only if a judge demands live proof — takes ~2s, safe, but don't spend story time. |

## Transitions cheat-sheet
| From → To | The line |
|---|---|
| Problem → Companion | "Let me show you what happens instead — this is Rocky." |
| Companion → Doctor | "That answer came from somewhere. Zoom out to what Rocky sees." |
| Drift lab → false-PASS | "Now the one that should scare you." |
| Doctor → Watcher | "So the fixes go to the authors. Then what? Rocky watches." |
| Watcher → REAL panel | "Everything so far was a labelled simulation. Let me end with the part that isn't." |
| REAL → close | "Found → fixed → can never come back." |

## What the audience must remember (the takeaway trio)
1. **"The lab that lied"** — 100% passed, and it was broken. Tickets can't catch that; Rocky did.
2. **It refused the wrong fix** — because it reads evidence, it doesn't guess.
3. **"We never fake green"** — every number labelled real / simulated / modeled.

---

## BACKUP FLOWS

**If internet fails** (LLM chat is the ONLY thing that needs internet — the engine is deterministic):
- Reorder: open on Doctor with the false-PASS as your cold open — *"this dashboard is lying to you"* —
  then drift lab, Watcher, REAL panel. For the Companion, show the screen and narrate the refusal:
  *"preflight verifies this exchange on every run — it names the region and refuses the smaller VM."*

**If Azure/hosted fails:** irrelevant — the primary demo IS local (`start-demo.bat`). Hosted
(`labdoctor-rocky.azurewebsites.net`) is your fallback for the opposite failure (laptop death): same build,
same 50/50 preflight. One of the two always exists.

**If a specific beat breaks mid-demo:**
| Beat | Fallback |
|---|---|
| Trap question times out | "The model's slow — the engine isn't." Point at lab card FAILs, state the refusal, move to Doctor. Everything else is model-free. |
| A lab row won't load | Add `&enrich=0` to the URL, or use the OTHER marquee lab — both carry the story. |
| Monitor looks stale/odd | Click ↻ Reset timeline, advance twice fast, continue at sweep 3. |
| REAL panel missing | receipts.html carries the same numbers; or `gh pr view` the merged PRs raw. |
| Total system failure | The story survives without pixels: 133 real defects, 8 repos, 2 merged PRs, 4-second gate, 0/42 — recite, offer the hosted URL, take questions. |
- Universal rule: **preflight before you walk in.** If a beat fails preflight, cut it and use its line above.

---

## Q&A ARSENAL (from the simulated hostile panel — three personas, verified answers)

### Judges will ask
- **"If I pulled the plug on the simulator, which numbers survive?"** → "Four things: 133 defects in 8 real
  repos, 5 real PRs (2 merged), the 4-second CI block on a real repo, and the 0/42 hand-audit. The fleet
  dashboard and monitor are the labelled twin — it proves the logic, not production traffic."
- **"Zero false positives — so I can trust every finding at catalog scale?"** *(trap)* → "No — 0 of 42 in one
  hand-audited sample bounds the sample, not the system. At scale we expect FPs; that's why findings carry
  validator trust tiers and nothing writes back without a named human."
- **"Run it live right now."** → Click **↻ Rescan live** on the REAL panel (~2s), or offer to push a planted
  regression at the real CI gate.
- **"Has amnesty touched a real learner's record?"** → "No. Simulated mirror only, five gates, named human
  authorizer, and going live is gated on one verification spike."
- **"What stops the LLM hallucinating a contradiction?"** → "It can't assert one. The deterministic engine
  emits every verdict before the LLM runs; the LLM writes prose around it. Kill the model and every finding
  still renders."

### Leadership will ask
- **"What's it saving us in dollars?"** → "133 real defects and one blocked regression are real; the dollar
  number isn't measured yet. The support pilot exists to measure exactly that — I'd rather bring you a
  measured number than an invented ROI slide."
- **"How much of that was production?"** *(trap)* → the REAL vs SIM split, stated plainly (it's labelled on
  every screen — point at a tag).
- **"What do you need from me?"** → "Three things, no headcount: read access to the rest of the catalog,
  one scoped write-back verification spike, and a named support pilot to measure the triage delta."
- **"How many of the 133 are fixed in front of customers?"** *(trap)* → "Two merged, three open. Finding is
  now automated and cheap; merging still needs repo owners — that's the bottleneck I'm asking help with."
- **"Worst case? Who's accountable?"** → "Nothing writes to production today. Worst case is a noisy alert,
  not a bad write — and alerts only fire on change."

### Senior engineers will ask
- **"You authored the disease AND the cure — what does the twin prove?"** *(the hard one)* → "Correct — the
  twin proves the plumbing, not detection rates, and it's labelled simulated everywhere. Detection claims
  come from real repos: 133 defects, 5 PRs, 2 merged by maintainers who don't work for us. And honestly:
  the CI-gate regression was planted too — that claim is speed and mechanics, not recall in the wild."
- **"Any path where the LLM changes a verdict/number/severity?"** → "None. Structured data first, prose
  second, no write access. `&enrich=0` shows the product model-free."
- **"Who audited the 42? Blind?"** → "Our own team, not blinded — treat it as an internal spot check, not a
  certified error rate. The stronger evidence is external: maintainers merged our PRs. Re-audit us."
- **"What stops prompt injection from mass-restoring verdicts once write-back is live?"** → "The LLM has no
  code path to the write call. Five deterministic gates + a named human per case — and today the system
  holds no production write credentials at all."
- **"100 tests of what?"** → "The deterministic layer — contradiction logic, amnesty gates, ledger math.
  None assert on LLM prose, because prose is never load-bearing."

**The universal honest-answer pattern: concede the limit in the first sentence, give the real evidence in
the second. Every trap above is defused by agreeing with it faster than they can spring it.**
