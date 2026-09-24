# Rocky — the mentor voice

24 September 2026. How Rocky speaks, what every sentence is built from, and what shipped today.

Every template below is quoted from the code as it ships, not drafted for this document. Each one
carries its evidence standing — **OBSERVED** (a world change or a portal announcement Rocky
watched), **INFERRED** (from the guide's words or the done-ledger), **UNKNOWN** (Rocky says so) —
because a mentor who cannot tell the learner which of the three they are hearing is a chatbot with
better manners.

---

## The idea in one paragraph

Rocky already knows where the learner is, what the portal just did, what failed, what the guide
asks next and why the guide says it matters. Until today almost none of that reached the learner:
the coach ladder was delivered through the spinner, the failure channel was used as a mute button,
the purpose clause in every guide line was parsed and thrown away, and "what have I done so far?"
went to the documentation corpus. The mentor voice is not new intelligence. It is the existing
intelligence, finally said out loud — with the subject of every sentence being **you** or **the
portal**, never Rocky and never "the step".

---

## 1. Coach layer design

One rule decides what Rocky may say: **each field of the world model is either evidence-backed or
null, and null renders as silence or an admission, never as a guess.** The coach layer is the set
of surfaces that turn those fields into sentences.

| Surface | Fires when | Builds from | Standing |
| --- | --- | --- | --- |
| **Teaching moment** (`mentor.js`) | A new world change is observed | `lastCompletion` + the next unfinished step + the guide's reason for it | OBSERVED, then INFERRED |
| **Coach ladder** (`coach.js`, via `pilot.js`) | Every perception tick, degrading POINT → LOCATE → ORIENT → SITUATE → ASK | resolved control, `sayable`, `place`, done-ledger, and now `why` | mixed, each part labelled by source |
| **Recovery rung 0** (`recovery.js`) | The portal announces a failure | the announcement, verbatim, classified | OBSERVED |
| **Recovery rungs 1–3** | The world model's stuck reason | the reason itself, the last observed change, the guide's why | OBSERVED reason, INFERRED help |
| **Typed questions** (`lab-context.js`) | The learner asks | Position, the journey, the guide | labelled in the answer |
| **The model** (`background.js`) | A question nothing deterministic answers | `promptBlock()`, every line marked | the marks are the contract |

**Precedence when several could speak:** an open ask box silences everything proactive; a portal
failure outranks the stuck ladder; the teaching moment speaks once per observed change with a
12-second gap; the ladder waits 20 seconds between rungs and stops after three. Restraint is the
design — a mentor who talks constantly is a mentor you stop hearing.

**Where the reason comes from**, best first, and null when none applies:

1. `step.learn.why` — an author's note on a captured bundle (28/28 steps on the Foundry lab)
2. `step.why` — the purpose clause in the guide's own line: *"to sign in to GitHub Copilot"*.
   **Measured on the 136 real Zava lines: one genuine clause.** The first version produced five,
   three of them false and two inverting the guide (*"Do not disable unrelated settings merely to
   make the page contain only four selections"* became *"This step is here to make the page contain
   only four selections."*). It is now trusted only from a plain positive sentence — no negation,
   not the "Use <tool> to <do it>" form, not "the option to …", lower-case verb. On formal lab
   prose this fires rarely; when it fires it is the author's reason and cannot be backwards.
3. `step.task` — the task heading the step sits under: *"Create the custom departing-user policy"*.
   This is the source that fires on most Purview steps, because the guide is organised by task.
4. the knowledge base — what this kind of control is for
5. the derived dependency — what later steps name that this step creates

Items 2 and 3 are new today and are the ones that fire on Purview and Azure, where nobody has
written notes.

---

## 2. Teaching behaviour

**A direction becomes a lesson by adding the guide's reason — and only the guide's.**

| Before | After (shipped) |
| --- | --- |
| Click Create policy. | Step 4 of 9. Select Create policy > Custom policy. **This is part of Create the custom departing-user policy.** |
| Click on Continue with GitHub. | Click on Continue with GitHub to sign in to GitHub Copilot. **This step is here to sign in to GitHub Copilot.** |
| (no completion message at all) | **That went through — the list went from 1 to 2.** Next, return to Policies and confirm that Zava Departing Employee Data Theft appears in the user-policy list. |

Rules:
- The reason is appended, never substituted — the instruction stays first, because the learner
  is about to act on it.
- A knowledge-base or derived reason is used in the coach and in recovery rung 2, but **not** in
  the teaching moment. The moment is short by design; a generic note would make it a lecture.
- With no reason from any source, the sentence stays a plain direction. Rocky does not invent one.
- "Why is Microsoft asking me to do this?" is answered at the task level (*"This is part of…"*),
  which is the level the author wrote it at. Rocky does not manufacture product rationale.

---

## 3. Recovery behaviour

**Rung 0 — the portal said what went wrong.** Shipped strings:

> Something just failed. The portal said: "Client Error — Looks like you don't have the right
> permissions" **That is a permissions problem, not something you typed wrong. In a lab it usually
> means the account has not been given the role yet. Wait a minute, refresh, and try again — role
> assignments take time to take effect.**

The six classes and their moves: **permission** (above), **conflict** — *"Something with that name
is already there. Either an earlier attempt of yours worked, or you need a different name."*,
**not found** — *"Whatever that was pointing at is not there. Usually it means an earlier step did
not finish, rather than this one being wrong."*, **transient** — *"That one looks temporary. Give it
a moment and do exactly the same thing again."*, **validation** — *"The form is not happy with
something on it. Look for the field marked in red — the portal puts the reason right next to it."*,
**unknown** — *"I cannot tell what caused that one."* Purview's *"You currently aren't assigned to a
role group…"* — recorded on the Insider Risk lab — is now classified as permission.

**Rungs 1–3 — the stuck ladder, now speaking from its reason.** The world model knows *why* it
thinks the learner is stuck; the ladder used to say "you have been on this step a little while" for
all four reasons. Shipped:

| Stuck reason (OBSERVED) | Rung 1 opens with |
| --- | --- |
| repeated attempts | You have clicked around this step a few times and the page has not changed. |
| oscillating | You have moved between pages a few times without landing on the one this step needs. |
| after an error | The portal reported an error and nothing has changed since. |
| dwelling | Nothing on the page has changed for a while. |

…followed, when there is one, by *"The last thing I saw the portal do was the list went from 1 to
2."*, then *"You are on Policies. The step is: … What can you see on the screen?"* Rung 1 ends by
asking, because the learner can see something Rocky cannot.

Rung 2 teaches from the guide's reason before the knowledge base. Rung 3: *"You are on Policies,
and I cannot line that up with this step. Let us get back to somewhere we both recognise…"* Stop:
*"I have run out of ideas from what I can see. Tell me what the screen says — the error, or what
happens when you click — and we will work it out."*

**The feed was wrong, and it is fixed.** Every click anywhere counted as an attempt, so a learner
filling three wizard fields correctly was "stuck" by the third; and the page-change counter was
never reset, so four page moves early in a lab made every later step read as "oscillating" for the
rest of the session. Now a click is an attempt only when it misses a glowed control, and the
page-change count resets when the step advances, as attempts already did. Without this, no
rewording of rung 1 could have made recovery feel intelligent.

---

## 4. Mentor conversation models

Five shapes. Every message is one of them.

**A. The moment** — proactive, on an observed change. *Evidence → next → why next.*
> That went through — the list went from 1 to 2. Next, return to Policies and confirm that Zava
> Departing Employee Data Theft appears in the user-policy list.

**B. The pointer** — proactive, when the control resolves. *Direction → reason.*
> Step 4 of 9. Select Create policy > Custom policy. This is part of Create the custom
> departing-user policy.

**C. The diagnosis** — proactive, on a portal failure. *Quote → whose fault → one move.*
> Something just failed. The portal said: "…" That is a permissions problem, not something you
> typed wrong…

**D. The check-in** — proactive, when stuck. *What I observed → where you are → the step → a
question back.*
> You have clicked around this step a few times and the page has not changed. You are on Policies.
> The step is: Select Create policy > Custom policy. What can you see on the screen?

**E. The answer** — reactive, to a typed question. *Answer first → its standing → what is known
instead.*
> I have not yet watched the page change in a way that proves a step finished, so I will not claim
> anything is done. What I can see is that you are on Home.

Model answers (F) follow the same order and are governed by the prompt in §9.

---

## 5. Message templates

Placeholders in `{}`; standing in brackets.

**Where am I**
- `You are on {place}. That is step {n} of {m}.` — [OBSERVED place, OBSERVED/INFERRED number by source]
- `You are on {place}.` — [OBSERVED] when the number is not sayable
- *(nothing)* — when neither is known; the coach's ORIENT/SITUATE line carries the admission

**What did I accomplish**
- `{n} things I watched happen, the latest first: {e1}; {e2}; {e3}. Those are portal changes I saw, not steps I ticked off.` — [OBSERVED]
- `One thing I watched happen: {e1}. Those are portal changes I saw…` — [OBSERVED]
- `I have not yet watched the page change in a way that proves a step finished, so I will not claim anything is done. What I can see is that you are on {place}.` — [UNKNOWN, with what is known]

**Why does it matter**
- `This step is here {purpose}.` — [INFERRED from the guide's purpose clause]
- `This is part of {task}.` — [INFERRED from the task heading]
- `"{label}" is {what} {does}` — [INFERRED from the knowledge base]
- `This is where {artefact} gets made, and {a later step needs it | N later steps need it}.` — [INFERRED, derived]
- *(nothing)* — no source

**What should I do next**
- `Next, {next step, guide's words}.` — [INFERRED from the done-ledger]
- `It says: {step text}` / `Step {n} of {m}. It says: {step text}` — [INFERRED / OBSERVED number]

**What happens if I don't**
- `Step {k} needs {artefact}: "{later step text}"` — [INFERRED, derived; numbered only when sayable]
- `A later step needs {artefact}: "…"` — [INFERRED, unnumbered]
- *(nothing)* — the common case, by design (one tracked step in sixteen has an edge)

**Something failed**
- `Something just failed. The portal said: "{verbatim}" {move}` — [OBSERVED quote, INFERRED move]

**You look stuck**
- `{reason sentence} {last observed change} You are on {place}. The step is: {text} What can you see on the screen?`

**Done**
- `That is all {m} steps of {lab}. Before you close it — anything you want to go back over?`

**Cannot place you**
- `You are in {section}. {done} of {total} look done, and I cannot yet tell which one you are on. What did you last click?`
- `I have no guide for this page. What are you trying to get done? I can still tell you about anything on screen.`

---

## 6. Coaching scenarios (Purview, Zava Challenge 4)

**Scenario 1 — the learner opens Policies with the guide read.**
Coach, POINT: *"Select Create policy > Custom policy. This is part of Create the custom
departing-user policy."* Glow on Create policy. No number: the belief has not converged. Standing:
INFERRED (guide), OBSERVED (place).

**Scenario 2 — the learner submits the policy.**
List re-renders 1 → 2. Moment: *"That went through — the list went from 1 to 2. Next, return to
Policies and confirm that Zava Departing Employee Data Theft appears in the user-policy list."*
Standing: OBSERVED, then INFERRED. Journey records it. Asked *"what have I done so far?"*: *"One
thing I watched happen: the list went from 1 to 2 (on Policies). Those are portal changes I saw,
not steps I ticked off."*

**Scenario 3 — the account lacks the Investigators role.**
Portal announces *"You currently aren't assigned to a role group that allows you to view alerts."*
Rung 0: *"Something just failed. The portal said: '…' That is a permissions problem, not something
you typed wrong. In a lab it usually means the account has not been given the role yet…"* Standing:
OBSERVED quote. The stuck ladder is pre-empted.

**Scenario 4 — the learner wanders between Settings and Policies four times.**
Rung 1: *"You have moved between pages a few times without landing on the one this step needs. The
last thing I saw the portal do was the list went from 1 to 2. You are on Settings. The step is: …
What can you see on the screen?"* Twenty seconds later, rung 2 with the guide's reason. Then rung
3. Then stop. The counter resets the moment the step advances.

**Scenario 5 — the learner fills the wizard correctly, slowly.**
Nothing. Three clicks on fields Rocky has nothing glowed on are the learner working, not three
attempts. Before today this was scenario 4.

**Scenario 6 — the learner asks "which step am I on?" mid-wizard.**
*"It says: Enter the policy name Zava Departing Employee Data Theft…"* — the step, no number,
because confidence is under 0.80. When it is over: *"Step 5 of 9. It says: …"*

---

## 7. Workflow guidance examples

- **Objective → task → step.** The pane's *"In this challenge, you will… create the custom policy
  Zava Departing Employee Data Theft…"* is kept as the objective; *"Task 2: Create the custom
  departing-user policy"* attaches to every step beneath it; each step's own *"to …"* clause is its
  purpose. Rocky answers "what does this accomplish?" at whichever level the author wrote.
- **What it unlocks.** *"This is where Zava Auto-Label Policy gets made, and 2 later steps need
  it."* — derived from the guide naming the artefact later. Fires on about one tracked step in
  sixteen on the real corpus; silent otherwise.
- **Expected outcome.** The guide's *"and wait for the success notification"* is exactly the kind
  of announcement the Completion Engine listens for; when it arrives, the moment says so.
- **Recorded knowledge.** A recorded walk tells Lab Doctor which steps are observable at all. Steps
  it marks *silent* are steps where Rocky will not have a moment to speak — the honest expectation
  is set before the learner arrives, not discovered during.

---

## 8. Explanation improvements shipped today

| Gap | Fix | Where |
| --- | --- | --- |
| Purpose clauses parsed and discarded | kept as `step.why`, only from a plain positive sentence — the first version inverted the guide on 2 of 136 real lines and is pinned by tests | guide-reader.js |
| Task headings and the objective skipped as non-steps | `step.task`, `read().objective` | guide-reader.js |
| World-model rebuilt steps from text alone, dropping `raw`, `why`, `task`, `learn` | passed through on ingest | world-model.js |
| No why on POINT | appended from `mentor.why()` | pilot.js → coach.js |
| Moment said what changed, not what next was for | appends the next step's guide reason | mentor.js |
| Rung 1 was a timer talking | opens with the observed stuck reason and the last observed change | recovery.js |
| Rung 2 went to the KB first | guide's reason first | recovery.js |
| Any click was an attempt; page moves never reset | attempts need a glowed target; resets on advance | recovery.js, world-model.js |
| "What have I done so far?" went to the docs corpus | answered from the journey, or honestly not | lab-context.js |
| Model could not tell observed from inferred | every prompt line marked | mentor.js, background.js |

---

## 9. Prompt changes

`ROCKY_SYSTEM` (rewritten earlier today as instructions to an instructor) gains one rule:

> Each Context line is marked OBSERVED, INFERRED or UNKNOWN. Quote OBSERVED lines as fact. Hedge
> INFERRED lines ('the guide suggests', 'it looks like'). Never upgrade an UNKNOWN line into a
> claim, and when the learner asks about something UNKNOWN, say what you can see instead.

And `promptBlock()` now reads, live on Purview:

```
UNKNOWN (position): Rocky is NOT certain which step the learner is on (position unknown). What is known: in Home…
UNKNOWN (accomplishments): none observed yet this session. Rocky has not watched the page change in a way that proves a step finished. Do NOT tell the learner they have completed anything.
UNKNOWN (consequence): nothing in the guide names anything this step creates, so do not claim a consequence for skipping it.
```

…and, when there is evidence:

```
OBSERVED (position): The learner is on step 4 of 9.
OBSERVED (accomplishments) — world changes Rocky watched happen, in order:
• the list went from 1 to 2 (on Policies)
INFERRED from the guide (why the current step matters, guide-task): This is part of Create the custom departing-user policy.
INFERRED from the done-ledger (next unfinished step, in the guide's own words): Return to Policies and confirm…
OBSERVED (portal failure, verbatim): "You currently aren't assigned to a role group that allows you to view alerts"
```

The old cap of 110 words is gone; length follows content. Lists stay forbidden — the bubble is
320px wide.

---

## 10. Immediate implementation plan

**Shipped today, gated, mutation-tested (19 of 19 mutants killed), live-validated:** everything in
§8. Gates: mentor 47, recovery 30, pilot 26, guide 21, coach 20, typed questions 6 (new). All 32
release gates green.

**Next, in order — each a wording-or-wiring change on an engine that already runs:**

1. **Retire the ALL-CAPS chips** except the provenance ones (`FROM THE CLOUDLABS DOCS`, `A KNOWN
   ISSUE`, `MY BEST GUESS`, `AI ·`). The rung-0 diagnosis still wears "STUCK?".
2. **Bubble max-height and scroll.** No prompt fits a five-part answer into 320px without it.
3. **Recovery rung 2's last fallback** still says *"This step wants you to find…"*; steps do not
   want things.
4. **Replace the committed `webext/lab.json` fixture** or blank it — it grounds every model answer
   on a Foundry lab that is not running.
5. **The dependency rule's marked-name path** is unverified on a rendered guide pane; one look at a
   live pane's `innerText` decides whether it ships or is cut to filenames.
6. **Azure place.** Read the blade title through the relay so "You are on Microsoft Azure" becomes a
   page name.
7. **Record one real Submit on Purview.** Nobody has watched a completion after a mutating action.
   The moment is designed for it and has never been seen.

Not in this plan: new engines, new modules, new storage, a conversation surface. The voice is
carried by the cards Rocky already has; the next surface is a UX decision, not a mentor one.
