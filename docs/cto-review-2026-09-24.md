# Rocky — technical review and the next 30 days

24 September 2026. Written as a CTO project review. Every claim below is either something I
measured in this codebase or on the live portals today, or it is marked as a judgement.

---

## The answer first

**Fund one thing for two weeks: Rocky speaks from evidence.**

Every sentence Rocky says — proactive or in reply to a question — assembled from the world
model: where you are, what you have done and what I saw that proves it, what just failed in the
portal's own words and what that usually means in a lab, and what comes next. The plumbing for
this exists and was validated on both portals today. What it feeds the learner right now is one
grounding sentence to the model and honest-but-useless lines like *"You are in Microsoft Azure.
I am not certain which step you are on yet."* That gap is the whole product.

**30-day order:** (1) evidence-based coach and recovery → (2) recorded knowledge used at run
time, and one real Azure lab walked end to end → (3) the mentor UX → (4) Lab Doctor surface and
the demo.

---

## 1. What is genuinely solved

| Claim | How I know |
| --- | --- |
| Cross-frame perception on Azure | Clicks and live regions in the cross-origin blade reach the top frame through the relay. Recorded trace has blade clicks in it (commit af10b98). |
| Place on Purview | `aria-current="page"` on 6 of 6 pages forming a path. Live today: `Home` at 0.95. |
| No step number without evidence | Position's `sayable` is the only route to a number in coach, explore, lab-context and now recovery. Live today on both portals: `sayable=null`, nothing spoken. Position can veto *and* authorise; both directions mutation-tested. |
| Completion is a world change, never a click | Rising edge against a baseline for lists, counts, empty states and announcements. 31 unit tests, live-validated on the Purview IRM walk. |
| Failure channel end to end | Provoked a permission error today on Azure and Purview: DOM → Completion → Relay → Position → recovery rung 0 → *"That is a permissions problem, not something you typed wrong…"* |
| Signal derivation from a recording | `derive-pack` scores discrimination across a whole run; satisfy rule is derived, not tuned. |
| Test discipline | Mutation testing is the standard for new gates (15 mutants killed today). Byte-level source integrity gate. A live validator that fails when it validated nothing. |

## 2. What appears solved but is not

This is the list that matters.

1. **Azure place is furniture.** Live today: `place = "Microsoft Azure" (heading @ 0.5)`. That
   is the portal's name, not a page. Rocky then says *"You are in Microsoft Azure"* — true and
   worthless. We eliminated furniture-based confidence on Purview; on Azure it is back in through
   the heading signal. The blade title is the real page and it lives in the child frame.
2. **No completion has ever been observed on Azure.** Every recorded Azure action was
   non-mutating (browse, refresh, filter). The Azure pack has zero completion signals. "Azure
   validation ✅" is true for perception and relay, false for completion.
3. **Recorded knowledge is 0% consumed at run time.** Two real traces, a working deriver, a Lab
   Doctor verdict — and nothing in the extension reads a pack while a learner is working.
   `replay-pack.js` (drift checker, pack consumer) was designed and never built.
4. **"Unified" position is unified in the API, not on the screen.** `content.js` still writes
   four "Step N of M" strings from its own cursor; `watcher.js` keeps its own counters;
   `pilot.js` has `CONF_SHOW`. Six modules still consume none of Position: pilot's own surfaces,
   progress, overlay, controls.
5. **The failure channel was blind until this afternoon.** The Completion Engine read
   `records[i].target`, which for an appended toast is `<body>`. A live region added already
   populated — exactly how Azure delivers its `alertdialog` — was never heard. Fixed and tested
   today; it survived 28 green tests and two "validated" stages because every fixture mutated an
   existing region.
6. **Recovery's dwell feed is unverified.** Rung 0 now runs on evidence. Rungs 1–4 still run on
   `world.stuck`, which rests on the `note()` feed the file's own header says was broken. I did
   not re-verify today that real clicks reach it.
7. **The AI is grounded on one sentence.** `promptLine()` gives the model where the learner is.
   Not what they have done, not what failed, not what the recording says happens here.
8. **Coaching is finding, not teaching.** POINT / LOCATE / ORIENT are sentences about where a
   control is. There is no "why this step exists", no "what you just did means", no workflow
   explanation.

## 3. Technical debt

- Heredoc corruption has shipped control characters into source **seven times**; the byte gate
  catches it, but the authoring workflow is fragile.
- Content scripts are cached until the browser restarts; a page reload tests the old build.
  Every live validation cycle costs a restart (~40 s) and, without the stale-build check I added
  today, silently certifies old code.
- Rival number sources on screen (item 4 above).
- `replay-pack.js` not built. Azure blade unload-on-background (55 → 0 → 55 controls) unhandled.
- `coach.js` keeps `sectionOf()` as a third place engine (fallback). `recovery.js` duplicates
  relay's click-region logic.
- Release gate ordering defect (package integrity before the build) — fixed today. `live-resolve`
  flakes under load: 6/10 fail inside the suite, 10/10 alone.

## 4. Architecture debt

- 29 content scripts, all IIFEs on `window.LabPilot*`, load-order dependent (frame.js must be
  first). No modules, no dependency graph.
- `chrome.storage.local` as an event bus. It works and it was the right call over a stale
  worker, but the relay pumps on a cadence; a 1–2 s toast can fall between pumps.
- Two world objects: `LabPilotWorld` and `LabPilotPosition`. Position wraps World; callers
  (recovery included) still reach for World directly.
- No state survives a page load beyond storage. A learner's progress is per tab, in memory.
- The model receives almost none of the world model (item 7).

## 5. Product debt

- **Zero learners have used Rocky.** All value is asserted. No telemetry exists to change that.
- One real lab walked (Purview IRM). One trace is not validation.
- No Azure lab guide has ever been loaded. Every Azure result is the "no guide" state.
- The "premium mentor" experience has not started.
- Lab Doctor is a CLI that prints JSON. Its user — Manoj, QA — has no surface.

## 6. UX debt

- The two bugs the owner reported (cannot drag Rocky; no back button from chat) are the tip.
- Rocky speaks in cards. No visible conversation, no recap of what you did, no progress with
  evidence.
- Honest sentences with no help in them. Honesty without a next move is a dead end for a learner.
- "STUCK?" labels and a mood system: charming in a demo, not premium.
- The ask box is a bare input; answers are grounded on one sentence.

## 7. Reliability risks

- Stale build in a demo (caching). Now detectable, not yet prevented.
- Azure session expiry mid-run — already happened once; a sign-in page was recorded as a lab.
- **Blade unload on tab background.** The lab pattern is guide in one tab, portal in another.
  Every switch to the guide drops Rocky's view of the portal to zero controls.
- Announcement timing: 1–2 s live regions vs a polling relay.
- Permission failures are the most common lab defect (see the six things that cost a week). Rocky
  could not see them until today.

## 8. Scaling risks

- Every lab needs a human recording walk. That is the moat and the bottleneck at once.
- Portal drift: Fluent and Ibiza change; place signatures rot; nothing detects it until a learner
  does. The drift checker is the unbuilt `replay-pack.js`.
- Per-portal engineering. Azure cost four stages. Entra, M365 admin, Fabric and Defender will
  each want their own.
- No telemetry means no way to know what Rocky said, to whom, or whether it helped.

---

## Directions compared

Scale: 1 low – 5 high. Effort is for a usable, validated result, not a prototype.

| Direction | Business | User | Effort | Demo | Long-term | Rank |
| --- | --- | --- | --- | --- | --- | --- |
| **C+D** AI Coach + Recovery, fused as "speaks from evidence" | 4 | 5 | 2 | 5 | 4 | **1** |
| **B** World Model completion (consume it everywhere, retire rivals) | 3 | 3 | 2 | 2 | 5 | 2 — prerequisite, folds into 1 |
| **A** Recorder 2.0 — but only the *consuming* half (`replay-pack`) | 4 | 4 | 3 | 3 | 5 | 3 |
| **E** UX redesign | 3 | 4 | 3 | 5 | 3 | 4 — after 1, or it frames empty sentences |
| **H** Lab Doctor surface | 5 | 2 (learner) / 5 (QA) | 3 | 4 | 5 | 5 — strongest business case, weakest 2-week demo without Azure completion |
| **F** Mentor experience | 4 | 5 | 5 | 5 | 5 | = 1 + 4 + memory. Not a workstream; the destination. |
| **G** Learning analytics | 3 | 1 | 3 | 2 | 4 | 7 — zero learners, zero data |
| **A** Recorder — better *recording* | 2 | 1 | 3 | 1 | 3 | 8 |

Judgement on the split: Lab Doctor is the thing Spektra will pay for first, because it is
Manoj's actual job. But its best demo — *"Rocky found the permission defect before a learner
did"* — needs the same evidence-based coach to show the learner side. Build the coach, and Lab
Doctor's demo comes almost free in week 4.

---

## The one workstream

**Rocky speaks from evidence.** Two weeks.

Why this: it is the only direction where a user feels the change in the first minute, it uses
every piece of infrastructure built so far and needs none new, it is demonstrable on Purview
today, and it turns items 2.4, 2.6, 2.7 and 2.8 from debt into product at once.

What it unlocks: a UX redesign that has something worth framing; a Lab Doctor demo with a learner
side; a model that can answer *"what did I just do?"* correctly; a reason to put the first real
learner in front of Rocky.

---

## Roadmap

### Week 1 — every sentence from the world model
- **Goals.** Retire every rival number and place source on screen. Grounding prompt carries the
  whole world model. Recovery validated live on both portals (done today for rung 0). A "what you
  have done" recap with evidence.
- **Deliverables.** `content.js`, `watcher.js`, `pilot.js`, `progress.js`, `overlay.js` read
  Position only. `promptLine()` → `promptBlock()`: place, completed steps with the observed
  signal, last failure, next step. Recap surface: *"You created the policy — the list went from 3
  to 4."* Dwell feed re-verified or removed.
- **Risks.** Retiring `content.js` strings touches the oldest code; regressions in glow/point.
- **Success.** Live on Purview: ask *"what have I done so far?"* and get the right answer with
  the evidence. No on-screen number anywhere Position did not authorise.

### Week 2 — recorded knowledge at run time, and Azure for real
- **Goals.** A pack changes what Rocky does. One Azure lab guide walked with a mutating step.
  Azure place from the blade title, not the heading.
- **Deliverables.** `replay-pack.js`: per-step completion signals from the pack drive
  completion where generic signals are absent; drift report when the recorded signal never
  appears. Azure: a real guide loaded, a resource group created and observed as `list-grew`,
  place from the blade frame's heading via the relay. Blade unload handled (hold last known
  state, mark it stale).
- **Risks.** Azure creation needs a lab tenant and spends money — owner's click. Blade heading
  may not be stable across blades.
- **Success.** On Azure: Rocky states the step, sees the resource group appear, says so. On
  Purview: a pack-driven completion fires on a step that has no generic signal.

### Week 3 — the mentor UX
- **Goals.** Rocky looks and reads like a trainer beside you, not an extension.
- **Deliverables.** Draggable, with a back button (the two reported bugs first). A conversation
  panel with history. Progress with evidence, not a bar. Failure card that quotes the portal and
  says what to do. One voice: the trainer's. Remove moods and labels that do not teach.
- **Risks.** Redesign scope creep; the overlay's occlusion and anchoring must keep working.
- **Success.** A trainer watches a five-minute Purview run and does not ask *"why did it say
  that?"* once.

### Week 4 — Lab Doctor surface, hardening, the demo
- **Goals.** The QA side has a face. The demo cannot fall over.
- **Deliverables.** Lab Doctor page: record a walk → verdict with findings and fixes. Stale-build
  prevention (build stamp checked at inject). Session-expiry detection (*"you have been signed
  out"*, not a recorded sign-in page). Relay pump tightened or event-driven for announcements.
  The 12-minute demo script: QA records → Lab Doctor flags → learner runs → Rocky catches the
  permission failure and explains it.
- **Risks.** Time. If week 2's Azure work slips, this week absorbs it.
- **Success.** The demo runs three times in a row on a fresh profile without an engineer
  touching it.

---

## Against the Founders AI Fellow concept

I am taking "AI Fellow" as the archetype it is being compared to: a chat-first AI mentor that
answers from curated knowledge in a coaching voice, remembers the person across sessions, and
does not see what they are actually doing. I have not verified the product's specifics; if it
does more than this, the comparison shifts.

**Where Rocky is stronger**
- Rocky sees the real portal, in every frame. A chat mentor knows what you tell it.
- Completion is observed, not claimed. *"Did it work?"* has an evidence-based answer.
- Rocky refuses to guess a step number or a cause. That restraint is rare and it is what
  trainers trust.
- Rocky catches the lab's defects, not only the learner's. A permission failure is a lab problem
  and Rocky now says so.
- Rocky's knowledge of a lab comes from a recorded walk of that exact lab, not from documentation
  about the product in general.

**Where Rocky is weaker**
- Conversation. Rocky speaks in cards and single sentences. A chat mentor holds a thread.
- Memory. Nothing survives a page load. A mentor remembers last week.
- Explanation depth. Rocky can say where a control is; it cannot yet say why the step exists or
  what the concept behind it is.
- Polish. Two reported UX bugs and a mood system versus a designed product.
- Breadth. Two portals, one lab. A chat mentor covers whatever its corpus covers on day one.

**To clearly outperform**
Grounding is the differentiator only if the talk is as good. Rocky needs: a real conversation
surface with history (week 3); the model grounded on the full world model so every answer is
about *this* learner *right now* (week 1); workflow explanations — why this step, what it
changed — drawn from the guide and the recording (weeks 1–2); and memory across sessions of what
this learner has done and where they struggled. Then the comparison becomes: a mentor who was in
the room versus one who was told about it afterwards.

---

## Final answer

*If Rocky had to impress customers, leadership and technical trainers within 30 days, what would
you build next and in what exact order?*

1. **Every sentence from evidence** (week 1). Retire rival counters, ground the model on the
   full world model, ship the recap with proof and the failure diagnosis validated today. This
   is the first minute of every demo.
2. **One real Azure lab, seen through** (week 2). Load a guide, create something, watch Rocky
   see it appear. Without this, Azure is a perception demo and everyone in the room knows it.
3. **Recorded knowledge drives Rocky** (week 2, alongside). The pack changes behaviour and
   reports drift. This is the moat made visible: *"Rocky knows this lab because we walked it."*
4. **The mentor UX** (week 3). Drag, back, conversation, progress with evidence, one voice.
   Framing for sentences that are now worth framing.
5. **Lab Doctor with a face, and the demo hardened** (week 4). QA records, Lab Doctor flags,
   learner runs, Rocky catches the failure. Three clean runs on a fresh profile.

Not on the list for 30 days: more architecture, better recording, analytics, new portals.

What could sink it: Azure completion never being demonstrated (item 2.2), and the blade unload
when a learner switches to the guide tab. Both are week-2 work and neither is optional.
