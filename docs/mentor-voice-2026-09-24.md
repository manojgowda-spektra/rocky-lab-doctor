# Rocky — the mentor voice

24 September 2026, second version. How Rocky speaks, what every sentence is built from, and what
shipped today — corrected by three independent reviewers who read the first version against the
code and refuted seventeen of its claims. What they found is folded in below and stated plainly
where it changed a claim.

Every template is quoted from the code as it ships (commit `33fd7bc`). Each carries its evidence
standing: **OBSERVED** (a world change or portal announcement Rocky watched), **INFERRED** (from
the guide's words, the done-ledger, or a belief over control labels — a belief is an inference
however confident), **UNKNOWN** (Rocky says so).

---

## The idea in one paragraph

Rocky already knows where the learner is, what the portal just did, what failed, what the guide
asks next and — when the guide says — why. Until today almost none of it reached the learner: the
coach ladder was delivered through the spinner, the failure channel was used as a mute button, the
guide's purpose clauses and task headings were parsed and discarded, and *"what have I done so
far?"* went to the documentation corpus. Then, when the first pass wired it, a third layer
(`pilot.js compactSteps()`) silently stripped it again before the only `ingest()` call. The mentor
voice is not new intelligence. It is the existing intelligence, said out loud, with the subject of
every sentence being **you** or **the portal** — and with a chain gate that drives the real path
from the guide pane to the spoken sentence, so it cannot go quiet unnoticed a fourth time.

---

## 1. Coach layer design

One rule: **each field of the world model is evidence-backed or null, and null renders as silence
or an admission, never a guess.**

| Surface | Fires when | Builds from | Standing |
| --- | --- | --- | --- |
| **Teaching moment** (`mentor.js`) | a new world change is observed | `lastCompletion`, the next unfinished step (never the one the change belongs to), the guide's task heading | OBSERVED, then INFERRED |
| **Coach ladder** (`coach.js` via `pilot.js`) | every perception tick; POINT → LOCATE → ORIENT → SITUATE → ASK | resolved control, `sayable`, `place`, done-ledger, `why` | mixed, each part labelled by source |
| **Recovery rung 0** | the portal announces a failure | the announcement verbatim, classified | OBSERVED |
| **Recovery rungs 1–3** | the world model's stuck reason | the reason's own counter, the last observed change, the guide's why | OBSERVED reason, INFERRED help |
| **Typed questions** (`lab-context.js`) | the learner asks | Position, the journey, the guide | labelled in the answer |
| **The model** (`background.js`) | nothing deterministic answers | `promptBlock()` plus eight context lines, every one marked | the marks are the contract |

**Precedence:** an open ask box silences everything proactive; a portal failure outranks the stuck
ladder; the moment speaks once per observed change with a 12-second gap; the ladder waits 20
seconds between rungs and stops after three.

**Where the reason comes from**, best first, null when none applies:

1. `step.learn.why` — an author's note on a captured bundle (`webext/bundle/full-bundle.json`,
   `labs[0].tasks[].steps[].learn`; 28 steps carry one)
2. `step.why` — the guide line's own purpose clause. **Measured on 136 real Zava lines: one
   genuine clause.** The first extractor found five, three false, two inverting the guide; it is
   now trusted only from a plain positive sentence. Not spoken on POINT or in the moment, because
   it is the tail of the very line the learner is reading.
3. `step.task` — the task heading above the step. Gated end to end through the shipping path
   (guide-reader → `compactSteps` → `ingest` → `why`). **Not yet seen on a live lab:** no recorded
   CloudLabs pane has shown a `Task N:` heading in its text. REHEARSE.
4. the knowledge base — what this kind of control is for
5. the derived dependency — what later steps name that this step creates

---

## 2. Teaching behaviour

| Before | After (shipped) |
| --- | --- |
| Click Create policy. | Step 4 of 9. Select Create policy > Custom policy. Do not select Quick policy. **This is part of the task "Create the custom departing-user policy".** |
| *(silence on a change)* | **I just saw the list went from 1 to 2 on Policies.** Next, "Return to Policies and confirm that Zava Departing Employee Data Theft appears in the user-policy list." |
| *(silence on an announcement)* | **The portal just announced "Policy created successfully".** Next, "…" |

Rules: the reason is appended, never substituted; only a task heading is appended to the moment
(a knowledge-base note would make it a lecture; a purpose clause would repeat the next line); the
moment says what was *seen*, not what was *achieved* — the one `list-grew` ever recorded on Purview
was a grid rendering on page load; with no reason from any source the sentence stays a direction.

---

## 3. Recovery behaviour

**Rung 0 — the portal said what went wrong.**

> The portal just reported "You currently aren't assigned to a role group that allows you to view
> alerts". **That is a permissions problem, not something you typed wrong. In a lab it usually
> means this account has not been given that role. If it was assigned in the last few minutes,
> wait a moment and refresh; if not, the lab guide or your instructor has to grant it, because
> nothing you click here will.**

The other classes: **conflict** — *"Something with that name is already there. Either an earlier
attempt of yours worked, or you need a different name."*; **not found** — *"The portal could not
find what that action was looking for. Usually that means an earlier step did not finish, rather
than this one being wrong."*; **transient** — *"That one looks temporary. Give it a moment and do
exactly the same thing again."*; **validation** — *"The form is not happy with something on it.
Look for the field marked in red, because the portal puts the reason right next to it."*;
**unknown** — *"I cannot tell what caused that one. What else does the message say?"*

**Rungs 1–3 — the stuck ladder, speaking from what its counter measured.**

| Stuck reason | Rung 1 opens with |
| --- | --- |
| repeated attempts (misses of a glowed control) | You have clicked 3 times on things other than the control I highlighted. |
| oscillating (address changes on this step) | The page address has changed 4 times since this step began, and I have not seen the step finish. |
| after an error (a diagnosis was spoken) | The portal reported an error and nothing has changed since. |
| dwelling (45 s with a control resolved and no miss) | Since the list went from 1 to 2, nothing I watch for on this page has moved this step on. / Nothing I watch for on this page has moved this step on since you reached it. |

…then *"The last change I saw was when the list went from 1 to 2."* (or *"The last thing I saw was
the portal say '…'."*), *"You are on Policies. The guide says '…' What can you see on the
screen?"*

Rung 2 is the guide's reason alone, else the knowledge base, else *"If 'Create policy' is not on
the screen, it is probably inside a menu or tab you have not opened yet. Open the ones near the top
of the page and tell me what appears."* Rung 3: *"You are on Policies. Let's reset to a place we
both recognise. Go back to the page this task started on, and I will pick the step up from
there."* Stop: *"I have run out of ideas from what I can see. Tell me what the screen says — the
error, or what happens when you click — and we will work it out."* No card carries a chip; orange
is kept for a real portal error.

**The feed, corrected three ways.** Every click anywhere counted as an attempt, so a learner
filling three wizard fields correctly was "stuck" by the third — now only a click that misses a
glowed control counts. The page-change counter was never reset — now it resets when the step
advances. Dwelling fired after 45 quiet seconds with nothing glowed — now it needs a resolved
control the learner could be failing to click. And "after an error" could never fire because
nothing fed `errors`; a spoken diagnosis now does. Four reasons, four reachable.

---

## 4. Mentor conversation models

**A. The moment** — *seen → next → why next.* *I just saw the list went from 1 to 2 on Policies.
Next, "Return to Policies and confirm …" This is part of the task "…".*

**B. The pointer** — *direction → reason.* *Select Create policy > Custom policy. This is part of
the task "Create the custom departing-user policy".*

**C. The diagnosis** — *quote → whose fault → one move.* *The portal just reported "…". That is a
permissions problem, not something you typed wrong…*

**D. The check-in** — *what I measured → last change → where you are → the step → a question
back.* *You have clicked 3 times on things other than the control I highlighted. The last change I
saw was when … You are on Policies. The guide says "…" What can you see on the screen?*

**E. The answer** — *answer first → its standing → what is known instead.* *I have not yet
watched the page change in a way that proves a step finished, so I will not claim anything is
done. What I can see is that you are on Home.*

---

## 5. Message templates

**Where am I**
- `You are on step {n} of {m}, which says "{text}".` — [INFERRED number, from `sayableStep()` only]
- `You look to be on the step that says "{text}", though I am not sure enough to give you a number.` — [INFERRED, hedged]
- `The guide is open but I cannot tell which line you are on. What did you last click?` — [UNKNOWN]
- *(`brief().where` — `You are on {place}. That is step {n} of {m}.` — is model grounding only; no surface speaks it)*

**What did I accomplish**
- `I have watched the portal change {n} times so far. Most recently {e1}, on {place}; before that {e2}; and before that {e3}. Those are changes I saw, not steps I ticked off.` — [OBSERVED]
- `I have watched the portal change once so far. Most recently …` — [OBSERVED]
- `I have not yet watched the page change in a way that proves a step finished, so I will not claim anything is done. What I can see is that you are on {place}.` — [UNKNOWN]

**Why does it matter**
- `This is part of the task "{task}".` — [INFERRED, guide heading]
- `You do that {purpose}.` — [INFERRED, guide clause; rung 2 and the model only]
- `"{label}" is {what} {does}` — [INFERRED, knowledge base]
- `This is where {artefact} gets made, and {a later step needs it | N later steps need it}.` — [INFERRED, derived]
- `The guide does not say why this step is here, and I would rather not invent a reason. What it does say is "{text}".` — [UNKNOWN]

**What should I do next**
- `Next, "{next step}."` — [INFERRED, done-ledger, never the step just changed]

**What happens if I don't** — model grounding only until a surface speaks it:
- `Step {k} needs {artefact}: "{later step}"` / `A later step needs {artefact}: "…"` — [INFERRED, derived]

**Something failed** — `The portal just reported "{verbatim}". {move}` — [OBSERVED quote]

**Done** — `You have worked through all {m} steps of {lab}, as far as I can see. Anything you want to go back over before you close the lab?` — [INFERRED — the ledger infers]

**Cannot place you** — `You are on {page}. {done} of the {total} steps look done, and I cannot yet tell which one you are on. What did you last click?` / `I have no guide for this page. What are you trying to get done? I can still tell you about anything on screen.`

**Not on screen** — `"{label}" is not showing anywhere I can see on this page. It usually lives in the left-hand menu, or behind the gear icon.`

---

## 6. Scenarios (Purview, Zava Challenge 4)

1. **Learner opens Policies with the guide read.** POINT: *Select Create policy > Custom policy. Do
   not select Quick policy. This is part of the task "Create the custom departing-user policy".*
   — the task line only if the pane carries the heading (REHEARSE).
2. **Learner submits the policy.** *I just saw the list went from 1 to 2 on Policies. Next, "Return
   to Policies and confirm …"* Asked *what have I done so far?*: *I have watched the portal change
   once so far. Most recently the list went from 1 to 2, on Policies. Those are changes I saw, not
   steps I ticked off.* — REHEARSE: never recorded after a Submit.
3. **The account lacks the Investigators role.** Rung 0, verbatim quote, permission move. The stuck
   ladder is pre-empted. *(The announcement is recorded on this lab's Policies page.)*
4. **The learner moves between Settings and Policies four times.** *The page address has changed 4
   times since this step began, and I have not seen the step finish. …* Then rung 2, rung 3, stop.
   The counter resets when the step advances.
5. **The learner fills the wizard correctly, slowly.** Nothing — no control is glowed, so clicks
   are not misses and dwelling does not arm. *(Before today: three "attempts" and an orange
   "STUCK?" card at the third field.)*
6. **"Which step am I on?" mid-wizard.** *You look to be on the step that says "Enter the policy
   name Zava Departing Employee Data Theft…", though I am not sure enough to give you a number.*

---

## 7. Workflow guidance

Objective → task → step: the pane's *"In this challenge, you will …"* is kept; *"Task 2: …"*
attaches to the steps beneath it; each step's own *"to …"* clause is its purpose when it is a plain
positive one. Rocky answers "what does this accomplish?" at whichever level the author wrote. What
it unlocks: the derived dependency, on roughly one tracked step in sixteen. Expected outcome: the
guide's *"and wait for the success notification"* is what the Completion Engine listens for.
Recorded knowledge: Lab Doctor marks a step *silent* when a walk produced no observable change,
which is the honest expectation set before a learner arrives.

---

## 8. What shipped today

| Gap | Fix |
| --- | --- |
| Purpose clauses parsed and discarded | kept as `step.why`, only from a plain positive sentence; the first extractor inverted the guide on 2 of 136 real lines and is pinned by tests |
| Task headings and the objective skipped | `step.task`, `read().objective` |
| World-model rebuilt steps from text alone | ingest passes `raw / why / task / learn` through |
| **`pilot.js compactSteps()` stripped them again before the only `ingest()` call** | passed through, exported, and a chain gate drives guide-reader → compactSteps → ingest → why on a real line — the test that would have caught it |
| No why on POINT | task reason appended from `mentor.why()`; purpose clause deliberately not |
| Moment claimed causation and could name the step just finished | *"I just saw …"*; the next step skips the believed step; quoted, not lower-cased |
| Rung 1 was a timer talking | opens with what its counter measured and the last observed change |
| Any click was an attempt; page moves never reset; dwell needed no target; "after-error" never fed | all four corrected |
| "What have I done so far?" went to the docs corpus | answered from the journey, count matching the list, or an honest refusal |
| No typed route to "why am I doing this?" | answered from the guide's reason or an honest refusal |
| Eight of nine model context lines unmarked, under "What is actually true right now" | every line marked OBSERVED / INFERRED / UNKNOWN / PROVISIONED; a belief is INFERRED |
| "STUCK?" chip on a permissions diagnosis | no chips on recovery cards |
| Card could run off the screen | `max-height`, scroll |
| Displayed step text kept backticks | stripped from `text`; `raw` keeps them |

---

## 9. Prompt

`ROCKY_SYSTEM` is written as instructions to an instructor (British spelling, subject "you" or the
portal, one sentence for a simple question, up to about 150 words for an explanation, never a
list) and says what each mark permits: *quote OBSERVED, hedge INFERRED, never upgrade UNKNOWN*.

What the model receives on Purview with no guide read — **read live through `coach-live.js`**:

```
UNKNOWN (position): Rocky is NOT certain which step the learner is on (no guide has been read on this page)…
UNKNOWN (accomplishments): none observed yet this session… Do NOT tell the learner they have completed anything.
UNKNOWN (consequence): nothing in the guide names anything this step creates…
```

What it would receive with evidence — **the code's output on a fixture, not yet observed on a
portal**:

```
INFERRED (position): The learner is on step 4 of 9.
OBSERVED (accomplishments) — world changes Rocky watched happen, in order:
• the list went from 1 to 2 (on Policies)
INFERRED (why the step Rocky is pointing at matters, from the guide's task heading): This is part of the task "…".
INFERRED from the done-ledger (next unfinished step, in the guide's own words): Return to Policies and confirm …
OBSERVED (portal failure, verbatim): "You currently aren't assigned to a role group…"
```

---

## 10. Status and what is next

**Shipped and gated:** everything in §8. Gates: mentor 47, recovery 30, pilot 27 (with the chain
gate), guide 23, coach 20, typed questions 6. All 32 release gates green in one run. Each new guard
was checked by deleting it and watching its gate go red; the sweep scripts are working files, not
committed. Live on Purview and Azure: the coach delivered as a card, the block marked, the failure
pipeline exercised with a synthetic node — not a real portal error.

**Not yet seen on a live lab, in the order it matters for the demo:**

1. A completion after a mutating action on Purview (the Submit moment). Never recorded.
2. A `Task N:` heading in a rendered CloudLabs pane's text (the task reason).
3. `webext/lab.json` is a committed Foundry fixture that grounds every model answer until replaced.
4. `**` surviving in a rendered pane (the marked-name dependency rule; filenames are unaffected).
5. Azure place — still the portal's name.
6. The remaining ALL-CAPS chips outside recovery (explore, watcher, pilot preflight).
