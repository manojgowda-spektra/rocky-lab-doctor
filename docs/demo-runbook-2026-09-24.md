# Rocky — demo runbook

24 September 2026, evening. Supersedes `demo-plan-2026-09-24.md` for execution; that document
remains the analysis and the record of what its four reviewers refuted.

Every Rocky sentence below is quoted from the code as it ships tonight (commit after `4b7d6c4`),
and every capability carries a tag:

- **MEASURED** — seen on the live portal or in a recorded trace doing this exact thing
- **GATED** — a release gate proves it against a test page or in Node
- **REHEARSE** — should work; never seen on the page the demo uses; run it first, cut it if red
- **DO NOT SHOW**

---

## If you had one chance tomorrow

**Purview. Zava "Know Your Data", Challenge 4 — Insider Risk for Departing Users. Fresh profile.
Wizard pre-positioned on its final page. Three beats, ten minutes, and say the limits before
anyone asks.**

1. **Show that Rocky read the guide** — the pointer names the step, glows the control, and gives
   the task it belongs to.
2. **Finish the step and let Rocky see it** — Submit; the list grows; *"I just saw the list went
   from 1 to 2 on Policies. Next, …"* — and then type *"what have I done so far?"* and get the
   same fact back, marked as something he saw.
3. **Show what Rocky will not do** — ask *"which step am I on?"* on a page where his belief is
   under 0.80 and he gives you the step, not a number; switch to Azure and ask where you are, and
   he names the portal rather than pretending to a page.

Then the permission beat if the tenant is set up for it, then the one line: *A chatbot knows what
you tell it. The guide knows what should happen. Rocky knows what did.*

What changed since this morning's plan and makes this runnable: the stuck ladder no longer fires
on a learner filling a form (blocker A is fixed); *"what have I done so far?"* and *"why am I doing
this?"* now get evidence-based answers before the docs corpus can intercept them; the recovery
cards have no "STUCK?" chip; the card scrolls instead of running off the screen.

---

## 1. Readiness — what the audience can actually see today

| Beat | Rocky says (verbatim) | Tag |
| --- | --- | --- |
| **Reads the guide** | preflight names the step count; the pointer: *Select Create policy > Custom policy. Do not select Quick policy.* | GATED (real Edge, test pane); pane detection on the live CloudLabs page **REHEARSE** |
| **…and why it matters** | *This is part of the task "Create the custom departing-user policy".* | GATED end-to-end (chain gate) — **REHEARSE**: no recorded CloudLabs pane has yet shown a `Task N:` heading in its text |
| **Knows the page** | *You are on Policies.* | MEASURED (`aria-current`, six Purview routes) |
| **Sees the change** | *I just saw the list went from 1 to 2 on Policies. Next, "Return to Policies and confirm that Zava Departing Employee Data Theft appears in the user-policy list."* | engine MEASURED on this list during navigation; after a Submit **REHEARSE** — never recorded |
| **Remembers it** | *I have watched the portal change once so far. Most recently the list went from 1 to 2, on Policies. Those are changes I saw, not steps I ticked off.* | GATED; deterministic, no model |
| **Refuses a number it cannot defend** | *You look to be on the step that says "Select Create policy > Custom policy", though I am not sure enough to give you a number.* | GATED; MEASURED that no number is spoken live |
| **Says why, or says the guide doesn't** | *The guide does not say why this step is here, and I would rather not invent a reason. What it does say is "…".* | GATED |
| **Diagnoses a portal failure** | *The portal just reported "You currently aren't assigned to a role group that allows you to view alerts". That is a permissions problem, not something you typed wrong. In a lab it usually means this account has not been given that role. If it was assigned in the last few minutes, wait a moment and refresh; if not, the lab guide or your instructor has to grant it, because nothing you click here will.* | announcement MEASURED on this lab's Policies page; classification GATED; the card appearing live **REHEARSE** |
| **Names why it thinks you're stuck** | *You have clicked 3 times on things other than the control I highlighted. The last change I saw was when the list went from 1 to 2. You are on Policies. The guide says "…" What can you see on the screen?* | GATED; only after three misses of a glowed control — will not fire on form-filling |
| **Admits Azure** | *You are on Microsoft Azure. I cannot yet tell which step you are on. What did you last click?* | MEASURED — the honesty beat, narrate that "Microsoft Azure" is the portal, not the page |

**Wow factor, in order:** the Submit moment (if it fires), the refusal beat, the permission
diagnosis, the guide-read-off-the-page. The first is REHEARSE and carries the demo; the other three
are safe.

**What could fail live:** the Submit moment (never recorded after a mutating action; the relay
drops the grid key while the wizard is open, so the sentence arrives when the list re-renders);
the pane not being detected (needs three imperative lines visible); the `Task N:` heading not
being in the pane's text (then the pointer is a plain direction — still fine); the belief stuck at
step 1 so the first glow sits on "Solutions" (narrate whichever control is glowed).

**Do not show:** the misclick call-out (nothing speaks it on this path); the duplicate-name error
(Purview's wording is not in the failure classifier); any Azure error (no repeatable trigger);
Azure completion; Azure place as a capability; the Foundry lab (its gate runs on a mock);
Copilot Studio; M365. Do not type *"which lab is this?"* — `lab.json` is a committed Foundry
fixture until the build step replaces it.

---

## 2. Lab choice

| Lab | Verdict |
| --- | --- |
| **Purview — Zava Challenge 4** | **Best.** Browser-only; place declared on every page; the role-group warning recorded on this very page; the guide is Manoj's. |
| Purview — Challenge 1 (Discover) | **Backup.** Also browser-heavy (OneDrive, SharePoint, classifier tests); the filename artefacts give the dependency rule its best edges. Weaker: Word for the web is a different surface. |
| Azure | Perception and honesty only (10-minute flow). No completion, no place, no error. |
| Foundry | Avoid. Richest authored "why" but the browser gate runs on a mock; unverified on the real portal. |
| Copilot Studio, M365 | Avoid. Zero measurements. |

---

## 3. The flows

### Setup (the day before, in this order)

1. Replace `webext/lab.json` with the Purview lab's identity, or blank it — the committed file
   names a Foundry QA lab and grounds every model answer on it.
2. `node test/open-rocky.js --fresh https://purview.microsoft.com/` — a brand-new profile. A
   restart reloads content scripts but *not* the service worker, and the system prompt changed
   today. Sign in (Manoj).
3. `node test/coach-live.js` green on Purview.
4. Open the CloudLabs lab; confirm the pane is read and the step count is right. Scroll the task
   list into view if not.
5. Demo account has **both** IRM role groups (Admins and Investigators), unless you want the
   role-group banner as the failure beat — then Admins only, and expect Rocky's diagnosis on the
   Policies page.
6. Arm the recorder; do the indicators Save and the policy Submit once on a throwaway name; derive
   the pack. **Tag beat 2 by what the trace shows.** Delete the throwaway policy; keep one.
7. Reopen the wizard to its final Review page in its own tab. Ask *"what have I done so far?"*
   once to confirm the deterministic path. Press Esc to close the card.
8. Sign out, sign in, leave it.

### 5 minutes — the mentor

| Min | You do | Rocky | You say |
| --- | --- | --- | --- |
| 0–1 | Open the lab tab, guide on the left | Preflight: the guide's step count; the pointer on the current step, with its task | "Rocky read that off the page you're looking at. No API, no upload." |
| 1–2 | Show the Policies page | *You are on Policies.* Glow on Create policy (or on step 1's control — narrate whichever) | "He knows the page because the portal declares it. The glow is him reading the guide against the controls in front of you." |
| 2–3 | Wizard tab → Submit → wait for the list | *I just saw the list went from 1 to 2 on Policies. Next, "Return to Policies and confirm …"* | **Stop.** "The guide says what should happen. Rocky saw what did." |
| 3–4 | Type *what have I done so far?* | *I have watched the portal change once so far. Most recently the list went from 1 to 2, on Policies. Those are changes I saw, not steps I ticked off.* | "No model in that answer. He's telling you what he watched — and saying that's what it is." |
| 4–5 | Type *which step am I on?* | *You look to be on the step that says "…", though I am not sure enough to give you a number.* | "He'll say 'step eight of thirty-three' when he can defend it. Until then, the step, not a number." |

**Takeaway:** Rocky watches the portal, not the guide.

### 10 minutes — mentor and recovery

The 5-minute flow, then:

| Min | You do | Rocky | You say |
| --- | --- | --- | --- |
| 5–6 | Type *why am I doing this?* | *This is part of the task "Complete both content-priority stages and preserve policy indicators".* — or, honestly: *The guide does not say why this step is here, and I would rather not invent a reason. What it does say is "…".* | "Either the author's reason, or an admission. Never an invention." |
| 6–8 | **Permission beat.** Account with Admins only: open Alerts | *The portal just reported "You currently aren't assigned to a role group that allows you to view alerts". That is a permissions problem, not something you typed wrong…* | "This is the most common lab defect there is. Rocky says whose fault it is before the learner opens a ticket." |
| 8–10 | Azure window, foreground. Refresh, filter, open a group. Type *where am I?* | Relay click events from the blade frame; *You are on Microsoft Azure. I cannot yet tell which step you are on. What did you last click?* | "Everything on Azure sits in an iframe on another origin. Rocky sees the clicks. He can't place you — that's the portal's name, not a page — and he says so." |

**Takeaway:** Rocky helps when it goes wrong, and says whose fault it was.

### 15 minutes — technical

The 10-minute flow, then:

| Min | What | You say |
| --- | --- | --- |
| 10–12 | Open the console: `LabPilotPosition.read()`, `LabPilotMentor.promptBlock()`. Every line marked OBSERVED / INFERRED / UNKNOWN. | "This is what the model is told. It cannot upgrade an UNKNOWN into a claim, because the prompt forbids it and the data says which is which." |
| 12–13 | Show the stuck ladder *not* firing while you fill three wizard fields with nothing glowed. | "This morning that was three 'attempts' and an orange 'STUCK?' card. An attempt is now a miss of a control Rocky marked. Nothing marked, nothing missed." |
| 13–15 | **Limits, plainly.** Azure completion never observed; the Submit moment never recorded before today; one lab walked; zero learners; the guide-heading reason never yet seen in a rendered pane; `lab.json` a fixture. | "We'd rather you heard these from us. Every one has a date against it." |

**Takeaway:** engineered, measured, honest about its edges.

---

## 4. Every message the audience will hear, and why it is worded that way

The rule behind all of them: the subject is **you** or **the portal**; evidence comes first; a
question back when Rocky cannot see something; the standing of the claim is in the sentence.

| Moment | Before | Now |
| --- | --- | --- |
| Pointer | Click Create policy. | Select Create policy > Custom policy. Do not select Quick policy. **This is part of the task "Create the custom departing-user policy".** |
| Change seen | *(silence)* / That went through — … | **I just saw** the list went from 1 to 2 on Policies. Next, "…" |
| Announcement | The portal says: "…" | The portal **just announced** "…". |
| Stuck (misses) | You have been on this step a little while. It is: … | You have clicked 3 times on things other than the control I highlighted. The last change I saw was when … You are on Policies. The guide says "…" What can you see on the screen? |
| Stuck (pages) | (same timer line) | The page address has changed 4 times since this step began, and I have not seen the step finish. |
| Stuck (quiet) | (same timer line) | Since the list went from 1 to 2, nothing I watch for on this page has moved this step on. |
| Failure | Something just failed. The portal said: "…" | The portal just reported "…". That is a permissions problem, not something you typed wrong… |
| Out of ideas | I am out of useful suggestions for this step | I have run out of ideas from what I can see. Tell me what the screen says — the error, or what happens when you click — and we will work it out. |
| Which step | Step 4 of 9. It says: … | You are on step 4 of 9, which says "…". / You look to be on the step that says "…", though I am not sure enough to give you a number. |
| Done | That is all 9 steps done | You have worked through all 9 steps of the lab, as far as I can see. Anything you want to go back over before you close the lab? |
| Can't place you | I am not certain which step you are on yet. | You are on Policies. 2 of the 9 steps look done, and I cannot yet tell which one you are on. What did you last click? |
| No AI | I can only answer that with my AI switched on… paste an endpoint, model name and key | That one needs the AI, which is not switched on for this lab, and I would rather say so than guess. Ask me about this lab or anything on the screen instead. |

No card carries a "STUCK?" chip any more. The only chips left are provenance: *MY BEST GUESS*,
*FROM THE CLOUDLABS DOCS*, *A KNOWN ISSUE*.

---

## 5. Demo killers

| Killer | Before | On stage |
| --- | --- | --- |
| **Submit moment silent.** Never recorded after a mutating action; relay drops the grid key while the wizard is open | Record one real Submit the day before; keep the beat only if the trace shows a world event | Type *"what have I done so far?"* — if the change was seen it is there; if not, Rocky says so, and that is the honesty beat instead |
| **Stale service worker** | `--fresh`, always | Restart with `--fresh`; sign in |
| **Wrong lab identity** | Replace `lab.json` | Do not ask "which lab is this?" |
| **Pane not read** | Rehearse on the production pane; task list in view | Reload; narrate the step from the guide |
| **First glow on step 1** while you are on step 4 | Rehearse; the belief needs to see step-4 controls | Narrate the glow you have; move on |
| **Role-group banner on page load** (account lacks Investigators) | Give the account both groups, or make it the failure beat | Rocky's diagnosis is true; use it |
| **Ask box mutes a diagnosis** (a Follow-up input on screen silences recovery; failures expire after 45 s) | Failure beats before questions; Esc closes cards | Esc, re-provoke |
| **Purview "Loading Navigation"** | Wait for the rail before each click | "Let it settle" |
| **Azure blade unloads** when backgrounded | Own window, foreground | Refresh, say why |
| **Session expiry** | Sign in 10 min before; keep tabs active | Sign in, reload |
| **The dwell rung** fires while you stand on a page with a glowed control for 45 s | Keep moving on glowed pages; it no longer fires with nothing glowed | Read it out: it names what it observed and asks what you see |
| **Model answers** (if you ask something deterministic cannot answer) | Test one question in the demo profile | The card labels its source; hedged lines are hedged |
| **Company-portal clicks** | Manoj drives | — |

---

## 6. Positioning

**Rocky is the lab mentor who was in the room.**

Not a chatbot: a chatbot knows what you tell it; Rocky watches the portal with you. Not a guide
reader: the guide knows what should happen; Rocky says what did, and when nothing did. Not a
screen reader: a screen reader tells you what is on the page; Rocky tells you what changed, what
it means for the step you are on, and what the guide says comes next — and marks every sentence
as something he saw, something he inferred, or something he does not know.

**The line:** *A chatbot knows what you tell it. The guide knows what should happen. Rocky knows
what did.*

---

## 7. Executive version — 2 minutes

*Setup: fresh profile; signed in; one policy exists; wizard on its final page in its own tab;
Azure Resource groups in a second window; rehearsal Submit recorded and green.*

> **[0:00]** "Hands-on labs fail quietly. A learner clicks Submit, nothing visible happens, and
> they move on with a broken environment or raise a ticket. The guide can't tell them it worked. A
> chatbot can't see their screen. Last quarter we found nineteen defects in one Purview lab — by
> hand."
>
> **[0:25]** "This is Rocky. He's read the guide off this page." *(the pointer names the step and
> its task)* "Watch what happens when I finish this step." *(Submit. Wait for the list.)*
>
> **[0:45]** *(Rocky: "I just saw the list went from 1 to 2 on Policies. Next, …")*
> "He didn't read that from the guide. He watched the portal do it."
>
> **[1:00]** *(Type: what have I done so far?)* *(Rocky: "I have watched the portal change once so
> far. Most recently the list went from 1 to 2, on Policies. Those are changes I saw, not steps I
> ticked off.")* "Every word from what he saw — and he tells you that's what it is."
>
> **[1:20]** *(Type: which step am I on?)* *(Rocky: "You look to be on the step that says '…',
> though I am not sure enough to give you a number.")* "He won't guess. A mentor who guesses is
> worse than none."
>
> **[1:40]** *(Azure window. Type: where am I?)* *(Rocky: "You are on Microsoft Azure. I cannot yet
> tell which step you are on. What did you last click?")* "On Azure the portal doesn't declare the
> page, so he names the portal and asks. That's not a gap in the design. That is the design."
>
> **[1:55]** "A chatbot knows what you tell it. The guide knows what should happen. **Rocky knows
> what did.**"

If anything fails: *"That's live, and he said he couldn't see it rather than making it up — which
is the point."* Move on.

---

## 8. Still true, still open

- No completion after a mutating action has been recorded on Purview. Tomorrow's rehearsal
  Submit is the first.
- No rendered CloudLabs pane has been seen to carry a `Task N:` heading in its text; the task
  reason is gated end to end and unverified live.
- `webext/lab.json` is a committed Foundry fixture.
- Azure place is the portal's name.
- The marked-name dependency rule is unverified on a rendered pane; the filename rule is not
  affected.
