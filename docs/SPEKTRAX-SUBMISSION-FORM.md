# SpektraX Hackathon — Project Details Submission

*Completed 26 August 2026. Every number below is verified against the repo; nothing is estimated
unless it says "est."*

---

**1. TEAM NAME**
`[ONLY ITEM STILL NEEDED FROM YOU]`

**2. BUCKET / TRACK**
`[ONLY ITEM STILL NEEDED FROM YOU]`

**3. TEAM MEMBERS**
- Manoj Gowda — Lab onboarding & QA engineering; the Doctor, honesty architecture, demo — manoj.gowda@spektrasystems.com
- Kiran Gowda — kiran.gowda@spektrasystems.com
- *(add third member if any)*

Repo owner: `manojgowda-spektra`

---

**4. IDEA IN ONE SENTENCE**

We're building Rocky — an AI lab companion that guides learners through hands-on cloud labs
click-by-click AND keeps those labs healthy behind the scenes — for Spektra's lab learners and
lab-content team, so labs stop silently breaking and learners never get stuck.

---

**5. WHICH USER IS THIS BUILT FOR, AND WHY**

Two users, one companion:

a) **Customer / learner** (primary, front-of-house): the person doing a CloudLabs hands-on lab.
Rocky (the Copilot) stands beside them and points at the exact next control, so a renamed button or
a stale guide never dead-ends them.

b) **Spektra colleague — the lab-content / delivery team** (back-of-house): Rocky (the Doctor) reads
every guide, watches the fleet, and drafts fixes so broken labs are caught before a learner hits them.

Why these users: lab reliability is Spektra's core promise. Today a broken step is found late, from a
support ticket, after a learner has already blamed themselves and quit. Rocky serves both sides of
that failure — the learner in the moment, and the team that must keep the guide correct.

**And one thing neither side has today.** Every QA tool detects *failure*. Rocky also detects the
opposite: **a validation that PASSES work which is actually wrong.** In our fixture fleet, 23 of 24
learners passed a "lock down a storage account" check while their storage was still public. Nobody
files a ticket about passing — the learner is delighted. It is invisible to linters, monitoring, LMS
analytics and manual QA, and in a security lab it means certifying people who left the door open.

---

**6. WHAT WE BUILT**

Rocky has two sides sharing one engine and one honesty rule ("never fake green").

**THE COPILOT (in-lab guidance) — the learner-facing product:**
- A Chrome/Edge extension (Manifest V3). Rocky — a gold-halo robot — floats beside the EXACT next
  control, glows it, and says the step, click by click, INSIDE the portal rather than in a
  side-by-side doc. Ships with an always-visible control bar (Back / Next / Finish / Restart) so any
  tester completes the flow even if a control never resolves.
- **Accuracy contract ("never a wrong glow").** Every candidate is scored on six signals — test id,
  accessible name, visible text, container text, role, tag. A control is glowed only when all three
  rules hold: no attribute is *contradicted* (hard fail), the score clears `MIN_SCORE 0.7`, and it
  beats the runner-up by `MARGIN 0.2`. Anything else shows an honest card naming which rule stopped
  it. A wrong match is impossible by construction, not unlikely in practice.
- **Advance only on a real user action** — a real click on the glowed control, or real typing in the
  glowed field. Never a timer.
- **Deterministic and offline.** `anchor.js` contains no model, no network call and no randomness.
  A determinism test runs the resolver 25 times and asserts a single distinct result.
- Three surfaces, one engine: browser DOM (shipped, tested), the VM desktop via Windows UI
  Automation (designed, `design/archive/on-vm-agent-architecture.html`), and a remote-desktop vision
  fallback (designed).

**THE DOCTOR (fleet reliability) — the team-facing product:**
Find (scan every guide, diagnose defects, watch the fleet) · Fix (cluster findings into fix
campaigns, draft PRs a human approves, block regressions in CI) · Help (triage tickets, answer
learners from evidence).

**WHAT IT DOESN'T DO (yet)** — stated plainly because the whole product is about not overclaiming:
- The Copilot's match specs are captured per portal build. A different tenant build may need
  re-capture; the failure mode is an honest card plus Next, never a wrong glow.
- The in-VM desktop guidance is **designed and documented, not built**. Only the browser surface ships.
- The Doctor's fleet dashboard, support/appeals numbers and the "2 a.m. Priya" story run on a
  **labelled digital twin**, not production data. Every screen says so.

**WHERE IT LIVES:**
- Repo: `github.com/manojgowda-spektra/rocky-lab-doctor`
- **Copilot extension: `webext/` in that repo** (or `Rocky-Extension.zip` at the repo root).
  `chrome://extensions` → Developer mode → **Load unpacked** → select `webext/` → open `ai.azure.com`.
- Doctor demo: clone the repo, double-click `START_DEMO.cmd`, follow `docs/DEMO_MASTER_SCRIPT.md`.
  Verified on a fresh clone with no local setup: 39/39 readiness checks green.

---

**7. DEMO PATH (what the jury sees, in order)**

**COPILOT (live):**
1. Load the extension; open Microsoft Foundry (`ai.azure.com`). Rocky appears bottom-right.
2. Rocky glows **Deployments → Deploy model → Deploy base model → search → the gpt-5 card → Confirm
   → deployment name (auto-copied to clipboard) → Deploy**. Each step: fly-in, point, speak. Advance
   only on a real click.
3. Into the **Playground**: type a prompt → **Send**. On the final click Rocky flies to centre and
   throws confetti.

*Expected outcome:* a model deployed and chatted with, guided click-by-click, the glow only ever on
the correct control.

*The moment worth engineering for:* if a control can't be resolved, Rocky **does not guess** — it
shows a card saying which rule stopped it (below the 0.7 floor, or two candidates inside the 0.2
margin) and offers Next. Point at that. It is the product's whole thesis in one screen.

**DOCTOR (live + real artefacts):** 133 real defects across 8 production lab repos, 268 guide files,
in under 4 seconds · 3 repos came back clean · 5 PRs (2 merged by maintainers) · a planted bug
blocked by CI in ~4 seconds · 0-in-42 false alarms in a hand audit.

---

**8. HOW AI IS CENTRAL**

AI does the understanding, diagnosis, repair-drafting and triage; a deterministic engine does the
safety-critical resolution. That split IS the product — **"the engine asserts; the AI narrates"** —
and it is why Rocky can be trusted.

- **Doctor:** an LLM READS every lab guide and result to diagnose what's broken (Find), DRAFTS the
  repair PR and clusters 133 findings into 13 campaigns (Fix), and TRIAGES tickets and answers
  learners from evidence (Help). Without the LLM there is no reading-comprehension of guides or
  root-cause clustering — a plain rules app cannot do it.
- **Copilot:** the step text is AI-authored from the lab guide. The RESOLVER that decides what to
  glow is deterministic on purpose, so the AI can never point at the wrong thing.

**Enforced mechanically, not by policy.** The red/green fix diff is pinned to the deterministic
draft — when we let the model rewrite it, it replaced concrete edits with "investigate this".
`/api/say` returns `{message}` only, with no confidence or emotion field, so the model cannot narrate
its own reliability. And **the entire demo runs with the AI switched off**; every surface degrades to
the deterministic evidence card.

*The regression guard we're proudest of:* the scripted trap question *"my deployment fails with
SkuNotAvailable — should I just pick a smaller VM size?"* Plausible, wrong, costs an hour. Before we
injected the engine's root cause as fact, the model **endorsed the wrong fix 3 times out of 3**. Now
it refuses 4 out of 4, and the preflight asserts it on every run.

**Why not just a normal app:** a normal script hard-codes selectors and breaks on any UI change.
Rocky uses AI to comprehend guides and portals, a scored engine to stay correct, and refuses to act
when it isn't certain.

---

**9. BUSINESS CASE**

**1) Value**

*Measured, on real content:*
- 133 real guide defects found across 8 production repos in **under 4 seconds**; detection was
  previously "whenever a learner complains, or never".
- **0 false positives in 42 hand-audited findings**, and 3 of 8 repos returned clean — a scanner that
  flags everything is noise.
- A deliberately planted bad change **blocked by CI in ~4 seconds**, before it could reach a tenant.
- 133 findings collapse to **13 root-cause decisions**; the top 3 cover **62%**.

*Estimated, and labelled as such:*
- Support deflection: on a labelled twin, tickets collapse ~3:1 to root causes → **est. 30–60% fewer
  lab-related support tickets per release**. Unmeasured on real tickets.
- Learner outcomes: guiding the exact next control → **est. 20–40% fewer stuck/abandoned attempts**.
  Unmeasured — this is precisely the metric the cohort pilot in (2b) is designed to produce.

*The term nobody costs, and the one that matters most:* most blocked learners never file a ticket.
They quit and conclude the technology is hard. That cost lands in completion rates and renewals, not
in a support queue — which is exactly why it has never been measured and never been fixed.

**2) First 3 things Spektra changes in week 1 if picked up**
a) Point the Doctor's scanner (read-only) at the real CloudLabs lab-guide repos; review findings with
   a human.
b) Pilot the Copilot extension with one course cohort; measure stuck-rate and completion vs baseline.
c) Wire the fix-PR flow into a real repo with MANDATORY human approval plus the 4-second regression
   gate in CI.

**3) What productization takes**
An AI "author-from-guide + live-capture" pipeline for match specs (so labs self-onboard), per-tenant
config, real fleet telemetry to replace the simulated dashboard, a security review and signing for
the extension and the in-VM agent, SSO/permissions, and moving the simulated support/appeals and
companion chat onto real ticketing behind the same human gates.

---

**10. DATA USED**

Public + synthetic only. Public Microsoft Learn / mslearn lab repositories and CloudLabs-style guide
content (our own forks) for the Doctor's scans; public retirement feeds (endoflife.date, Azure
Updates) for change intelligence; a labelled synthetic "digital twin" for the fleet dashboard,
support/appeals and the 2 a.m. story; a synthetic Foundry-shaped page for the Copilot's automated
flow test. **No production or customer data was used.** No learner data was read at any point.

---

**11. AI TOOLS & MODELS**

*Build-time:* Claude (Cowork / Claude Code) for code, documents, the deck and the videos; piper
(Lessac) neural TTS, run offline, for the video voiceovers.

*In-product:* a large language model (GPT-5 / Claude class) for guide comprehension, defect
diagnosis, fix/PR drafting and ticket triage; a deterministic DOM/UIA engine (**no model**) for
control resolution. Single provider, single call site, so there is exactly one place to audit what
leaves the building.

---

**12. WHAT EACH AI TOOL PRODUCED**

- **Claude:** the browser extension (companion renderer, anchor engine, glow overlay, control bar),
  the Doctor's scanners and campaign planner, the CI gate, the six-act demo flow, the test suites
  (130 tests), the pitch deck, and the narrated demo videos + transcripts.
- **piper TTS:** the voiceover tracks, synced to on-screen captions.
- **In-product LLM:** guide defect diagnoses, drafted fix PRs, ticket clustering, evidence-based
  learner answers, and the Copilot's step text authored from the lab guide.

---

**13. ROUGHLY % AI-ASSISTED VS HUMAN-WRITTEN**

~85% AI-assisted, ~15% human. Humans owned the architecture and the honesty rules, the live portal
capture, every PR approval, and all review/QA; AI generated the bulk of the code, documents and media
under that direction.

---

**14. TEAM CONTRIBUTION**

- **Manoj Gowda** — The Doctor: guide scanners (133 findings / 8 repos), campaign clustering, the CI
  regression gate, change intelligence, the six-act demo flow, and the provenance/honesty
  architecture that governs both halves.
- **Kiran Gowda** — LabPilot / in-VM direction and portal capture; live demo.
- *(third member — adjust to your actual split)*

---

**15. RISKS / WHAT COULD BREAK IT (top 3)**

1. **Selector drift on live portals.** A tenant's portal build differs and the exact control can't be
   resolved. *Mitigation, already built:* an honest "I can't find this control" card naming the rule
   that stopped it, plus an always-visible Next; the glow never fires on the wrong thing. Roadmap:
   AI author-from-guide + live re-capture.
2. **The fleet half is unproven on real data.** Two-thirds of the engine (1,796 of 2,749 lines) has
   never seen real telemetry. *Mitigation:* a 70-line groundability audit settles in one afternoon
   whether real validation payloads carry the observed values the classifiers need — with a
   pre-agreed kill criterion if they don't.
3. **Trust guardrails must hold.** The human-approval gate, the 4-second regression gate and the
   near-zero false-alarm rate are the whole value. If any regress, trust breaks. *Mitigation:* 130
   automated tests and 43 pre-demo readiness checks, including seven that audit our own presentation
   numbers against live scan data — so a stale claim fails the gate before it reaches a judge.

---

## Verification appendix

Everything a judge can check, and how.

| Claim | Verify |
|---|---|
| 133 defects / 8 repos / 268 files / 3 clean | `START_DEMO.cmd` → Act 3, or `/api/labhealth/real-scan` |
| 0 in 42 false positives | `labdoctor/audit-sample.js` |
| 5 PRs, 2 merged | GitHub: `manojgowda-spektra` (MCW#1, ai-developer#2 merged) |
| CI blocks a planted bug in ~4s | `labdoctor/ci/labdoctor.yml`; ai-developer#3 (closed, deliberate) |
| 130 tests pass | `cd source/rocky-prototype && node --test` |
| 43 readiness checks | `node check-ready.js` |
| Copilot never wrong-glows | `node --test test/anchor.test.js test/copilot-flow.test.js` — 17 tests incl. a full-flow run over a synthetic Foundry page with rival Deploy buttons |
| MIN_SCORE 0.7 / MARGIN 0.2 are real | asserted in `anchor.test.js`, so the quoted numbers cannot drift from the code |
| Runs on a teammate's machine | fresh clone, no Labs folder: 39/39 green, 2 advisories |
