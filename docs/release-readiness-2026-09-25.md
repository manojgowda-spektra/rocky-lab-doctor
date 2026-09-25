# Rocky — release readiness

25 September 2026. A release-candidate assessment. Every number below comes from running the
shipped code, not from reading it; where something is unmeasured it says so.

**Method note.** I commissioned five independent auditors to attack subsystems, VM labs, stress
scenarios, security and learner personas. They stalled and returned nothing. I did not wait on
them and I am not reporting their silence as agreement — everything here is my own measurement.
That gap is itself a finding: no second pair of eyes has reviewed this build.

---

## 1. Executive summary

Rocky is **demo-ready on a narrow, rehearsed path and not production-ready**.

What is genuinely good is unusual: Rocky refuses to say what it has not observed, and that
restraint now runs all the way from the data model to the wording. A learner who asks "what have I
done?" gets either evidence or an admission — never a plausible invention. On the measured demo
path Rocky reads a real CloudLabs guide, names the step and its task, points at the control, and
can quote the portal's own failure and say whose fault it is.

What is not ready is coverage. **Rocky can point at 76 of ~439 instruction-shaped lines across the
22 real guides on this machine — 17%.** On the demo's own challenge that is 5 steps out of 26
instructions. Everything else is invisible to him. Rocky is not yet a mentor for a lab; he is a
mentor for the fraction of a lab his parser recognises, and the product currently has no way to
tell a learner which fraction that is.

Four hardening fixes shipped today, each from a measured failure, each gated and
mutation-checked. All 32 release gates are green.

---

## 2. Readiness scores

Scored for *"a learner uses this unattended"*, not for *"it works in a rehearsal"*.

| Area | Score | Why |
| --- | --- | --- |
| Honesty / evidence discipline | **9** | The strongest thing in the product. Measured: no step number without `sayable`, no accomplishment without an observed world change, OBSERVED/INFERRED/UNKNOWN on every line the model sees |
| Guide ingestion | **5** | Works on the real rendered pane — 5 steps, correct targets, task headings. But 17% of instruction lines corpus-wide, and the learner is never told what was missed |
| Position / place | **7** | Purview `aria-current` is reliable. Azure is the portal's name, and Rocky says so |
| Control highlighting | **6** | Contract is sound (no glow unless unique, occlusion-tested). Unverified on the live Purview wizard, which is where the one recorded mis-glow happened |
| Completion detection | **4** | The engine is real and cross-frame. **No completion after a mutating action has ever been recorded on Purview**, and none at all on Azure |
| Recovery / failure | **7** | Rung 0 is the best thing Rocky says. Purview's own role-group wording is classified. Not yet seen firing on a live error |
| Mentor responses | **7** | Every demo sentence verified by execution. Deterministic answers need no model |
| Workflow understanding | **5** | Task headings and objectives are read. Dependencies fire on ~1 step in 16 and not at all on a rendered pane |
| VM-lab support | **3** | Non-browser steps are announced honestly; PowerShell steps are not parsed at all; fixed today so Rocky no longer misdirects |
| Reliability | **6** | Load-dependent mount failure (0/5 idle, 3/8 busy). Service-worker staleness needs `--fresh` |
| Security / trust | **5** | Prompt-injection surface closed at the prompt today, but unsanitised text still enters verbatim; `lab.json` ships a wrong lab identity |
| Conversation | **3** | Cards, no thread, no memory across sessions |

**Overall: 5.5 / 10 as a product. 8 / 10 as a rehearsed demo.**

---

## 3. Browser-lab readiness — the priority path

**Verified by execution against the real rendered Challenge 04 pane:**

- 29 pane lines → 5 pointable steps, correct targets (`Solutions`, `Settings`, `Save`,
  `Policies`, `Create policy`, `Custom policy`)
- Task headings attach correctly to the steps beneath them
- The pointer sentence, verbatim: *"Step 5 of 5. Select Create policy > Custom policy. Do not
  select Quick policy. This is part of the task 'Create the custom departing-user policy'."*
- Cross-tab publish/follow was measured live on this template previously

**Verified across the whole local corpus (22 guides, all Purview):**

| | lines | instruction-shaped | pointable | offered to the model |
| --- | --- | --- | --- | --- |
| totals | 1833 | ~439 | **76 (17%)** | 1178 |

The 1178 unparsed lines reach the AI assist **only if an API key is configured**, and there is no
key by default (`webext/ai.local.json` is absent and gitignored). Without one they are simply
invisible: no glow, no mention, no acknowledgement that Rocky skipped them.

**There is no Azure, Foundry, Copilot Studio or M365 guide on this machine.** Any claim about
Rocky's readiness for those lab styles would be unfounded. The parser is tuned to one house style
— CloudLabs Purview guides with `Task N:` headings and numbered imperative lines.

---

## 4. VM-lab readiness

A VM-centric lab has **one tab**: the guide on one side, the VM as an HTML canvas on the other.
Rocky sees the guide and cannot see inside the VM at all.

**Measured today** on a VM-shaped guide:

| Guide line | Rocky |
| --- | --- |
| "On the lab VM, open Windows PowerShell as administrator." | **not parsed** — invisible |
| "Click on the Visual Studio Code from the VM desktop." | **SURFACE**, honest: *"You do this one in VS Code, which I cannot see from the browser."* |
| "open Solutions > Insider Risk Management." | was **LOCATE**: *"…It may be inside a menu or tab that is not open yet."* — **wrong**, and fixed today |

**Today's behaviour, after the fix.** On `*.cloudlabs.ai` Rocky now says: *"This page is the lab
shell rather than the portal. If you are working inside the lab's own VM I cannot see in there at
all; if the portal is open in another tab of this window, switch to it and I will pick the step up
there."* That is graceful: it states the limit, and it gives the one action that can help.

**What Rocky can still do in a VM lab:** read the guide, name the step and its task, answer
"why am I doing this?", "what does the guide say next?", and explain concepts. **What he cannot
do:** point, detect completion, or diagnose a failure — all three need perception he does not
have.

**Tomorrow** (not built, not proposed as work here): the only honest routes are the learner
running the portal in their own browser rather than the VM, or the lab template installing Rocky
inside the VM via the existing bootstrap so the VM's Edge has its own Rocky. The second needs the
guide to be reachable inside the VM, which today it is not.

---

## 5. Demo readiness

| Beat | Status |
| --- | --- |
| Guide read off the live pane | **Demo-ready** (measured on the real pane) |
| Pointer with the task reason | **Demo-ready** |
| Place on Purview | **Demo-ready** |
| The refusal ("the step, not a number") | **Demo-ready** |
| Typed answers — what have I done / why am I doing this | **Demo-ready**, no model needed |
| The completion moment | **Needs rehearsal** — never recorded after a real Submit |
| The permission diagnosis | **Needs rehearsal** — classified and gated, never seen live |
| The glow on the live wizard | **Needs rehearsal** |
| Azure honesty beat | **Demo-ready** |
| Anything on Azure beyond perception | **Needs fixing** — do not show |
| Conversation / follow-ups | **Needs fixing** — do not show |

---

## 6. Top risks

1. **Coverage silence.** Rocky points at 5 of 26 instructions on the demo challenge and never says
   so. A trainer who notices will ask, and the honest answer undercuts the pitch.
2. **No completion has ever been observed after a mutating action on Purview.** The demo's
   centrepiece is unproven.
3. **Mount failure under load** — 3 in 8 on a busy machine, silent.
4. **`webext/lab.json` is a Foundry QA fixture** — grounds every model answer on the wrong lab.
5. **Unsanitised page text still enters the prompt**; only the prompt rule defends it.
6. **One lab, one portal, one house style.** No evidence for any other.
7. **Zero learners have ever used Rocky.** Every usability claim is inference.
8. **Alt+E is the only way in** and nothing on screen says so.
9. **No second reviewer** on this build — the audit fan-out stalled.
10. **Step numbers are Rocky's count, not the guide's** — "Step 5 of 5" against a guide showing
    Task 2 of 5.

---

## 7. Critical fixes before production

1. **Tell the learner what Rocky cannot see.** After ingesting, say plainly: *"I can point at 5 of
   the steps on this page; the rest I can read to you but not point at."* This is the single
   biggest honesty gap left, and it is a wording change on an existing surface.
2. **Record one real completion on Purview** and make the completion claim evidence-backed.
3. **Replace or blank `webext/lab.json`** in the build so no demo is grounded on a fixture.
4. **Make the mount deterministic**, or detect a failed mount and say so rather than staying dark.
5. **Get a second reviewer** over the mentor and recovery wording before it reaches a learner.

## 8. Nice to have

Conversation history in the card; a visible affordance instead of Alt+E only; retiring the
remaining ALL-CAPS chips outside recovery; the Azure blade title as place; drift detection from a
recorded pack; reconciling Rocky's step numbering with the guide's own.

---

## 9. Do not demonstrate

Azure completion. Azure place as a capability. The misclick call-out. The duplicate-name conflict.
Any Azure error. Foundry (its gate runs on a mock). Copilot Studio, M365, Entra. Multi-tab
following (untested — my harness could not load it). Conversation depth. *"Which lab is this?"*

## 10. Do demonstrate

The guide read off the page the audience is looking at. The pointer with its task reason. The
completion moment, if rehearsal proves it. *"What have I done so far?"* answered from observation.
The refusal to give a number Rocky cannot defend. The permission diagnosis. The Azure admission.

---

## 11. Final recommendation

**Demo it tomorrow on the rehearsed Purview path. Do not call it production-ready.**

Run the 10-minute flow in `demo-install-and-run.md`, starting at **Task 1's Save** — measured to
be the only start that leaves the teaching moment a *"Next, …"* to offer. Rehearse the completion
moment and the permission beat the morning of, and cut whichever is not green. Say the coverage
number out loud before anyone finds it: *"he points at five of the steps on this page today, and
he'll tell you when he can't."* That sentence costs nothing and buys the room's trust for
everything else.

---

## The three answers

### Top 10 most likely to fail

1. The completion moment after Submit — never recorded on Purview
2. Rocky not mounting at all on a loaded laptop (3 in 8 measured)
3. The glow landing on the wrong control in the Create-policy wizard, or not at all
4. A question outside the deterministic set reaching the docs corpus and answering oddly
5. The guide pane not parsing on a page you did not rehearse (17% corpus average)
6. The permission beat not firing because the account has both role groups
7. Sign-in / TAP stalling in a fresh profile mid-demo
8. Rocky quoting "Step 5 of 5" against a guide plainly showing more steps
9. The Azure blade blank after the tab was backgrounded
10. A stale service worker silently running last week's prompt (no `--fresh`)

### Top 10 most likely to impress

1. *"I just saw the list went from 1 to 2 on Policies. Next, '…'"* — he watched, he didn't read
2. The refusal: *"…though I am not sure enough to give you a number."*
3. The permission diagnosis naming the environment, not the learner
4. Reading the guide off the very page the audience is looking at — no API, no upload
5. *"What have I done so far?"* answered from observation, with the evidence named as evidence
6. The task reason on the pointer — direction plus meaning
7. The Azure admission, volunteered rather than extracted
8. Seeing clicks inside Azure's cross-origin blade
9. OBSERVED / INFERRED / UNKNOWN on every line the model is given
10. Lab Doctor: Rocky walking the lab before a learner does and reporting which steps are silent

### What must be fixed before calling Rocky production-ready

- **Coverage honesty** — Rocky must state what he cannot see, per page, unprompted. Today a
  learner cannot distinguish "nothing to say" from "blind here". This is the one that would
  damage trust at scale.
- **An observed completion on a mutating action**, on both portals. Without it the central claim
  is unproven.
- **Deterministic mounting**, or an explicit failure.
- **A real lab identity in the package**, not a QA fixture.
- **Sanitisation of page text** entering the prompt, not just a prompt-level rule.
- **First real learners.** Every usability judgement in this document is inference, including
  mine.
