# Rocky — install it, prove it, demo it

25 September 2026. Written to be followed literally. Supersedes the setup sections of
`demo-runbook-2026-09-24.md`; the beat-by-beat script and talking points there still stand.

Tags: **VERIFIED** — I ran it and saw the output today. **REHEARSE** — must be done once on the
live lab before the demo; it has never been seen there.

---

## The 30-minute answer

> *If I had to start the CloudLabs environment right now and show Rocky in the next 30 minutes,
> exactly what should I do?*

```
 0:00  Close every other Edge window.                                    (see Killer 1)
 0:01  cd "C:\AI-Testing-Workspace\Cloudlabs - Rocky\vmpackage"
       node test/open-rocky.js --fresh "https://experience.cloudlabs.ai"
 0:02  In that new Edge window, sign in to CloudLabs and open the lab.
       Go to the Guide tab, page 5 — Challenge 04.
 0:06  Open a SECOND TAB in the SAME window: https://purview.microsoft.com
       Sign in as the lab user with the TAP.
 0:12  Back on the guide tab. Press Alt+E. Rocky must appear.             ← STOP if he does not
 0:13  node test/coach-live.js            (in a second terminal)          ← must print green
 0:15  Purview tab: Insider Risk Management > Settings > Policy indicators.
       Rocky should name the step and glow a control.
 0:18  Tick the four Office indicators and press Save. Watch for Rocky's
       "I just saw ... Next, ..." — this is the centrepiece. START HERE, not
       at Create policy: finishing Create policy leaves nothing ahead.
 0:24  Then follow his Next: Policies > Create policy > Custom > Submit.
 0:27  Ask Rocky "what have I done so far?" and "which step am I on?"
 0:30  Demo.
```

If anything in the first 15 minutes is not green, **do the Azure-only fallback** (Backup B) —
it needs no lab, no sign-in and no guide.

---

## 1. How Rocky should be installed — and why the alternatives are wrong

**Decision: unpacked extension, loaded with `--load-extension` into a dedicated Edge profile,
running on your own laptop — not on the lab VM.**

That is not a workaround; it is what Rocky ships as. `bin/Rocky-Launch.ps1` does exactly this in
production:

```
--user-data-dir=<rocky profile>  --load-extension=<ext>  --no-first-run
--disable-features=DisableLoadExtensionCommandLineSwitch  --force-renderer-accessibility
```

| Option | Verdict |
| --- | --- |
| **Unpacked + `--load-extension`, own profile** | **Use this.** What every gate exercises, what `Rocky-Launch.ps1` ships, no signing, no policy, no store. Needs a profile that has never been launched otherwise — Edge ignores the switch for an already-running profile. |
| Packaged `.crx` | No. Needs signing and an `ExtensionInstallForcelist` registry policy; Edge blocks side-loaded CRXs. More moving parts, no benefit for a demo. |
| Chrome Web Store | No. Review time, public listing, and the repo is public but the extension is not a product yet. |
| Injected script (CDP / bookmarklet) | No. Rocky's whole design depends on the **isolated world** and `chrome.storage` for the cross-frame relay. An injected script runs in the page world, where `window.LabPilot*` is a different world and the relay cannot work. This was measured earlier in the project. |
| ARM bootstrap onto the lab VM (`bin/rocky-bootstrap.ps1`) | **Not available for a running ODL.** It is a Custom Script Extension that runs at deployment time and needs a blob URL + SAS configured in the template. It also solves the wrong problem — see below. |

**Why not on the lab VM, even manually.** The CloudLabs guide pane lives in the browser that is
showing the lab page. The VM appears *inside* that same page as a canvas. So the guide is in your
browser, not in the VM. Rocky installed inside the VM would never see a guide, and the two halves
could not talk. The lab's own testing notes make the same point: *"The guide never tells the
learner to do this work in the VM's Edge."* Both the guide and the portal must be tabs of the
**same** browser, which is the browser on your laptop. **VERIFIED** by reading the rendered pane
screenshot and the manifest host matches.

---

## 2. Build and install

**Build** (already done today — `dist/rocky-package.zip`, 6526 KB, version `1.0.0+b4afefe`):

```powershell
cd "C:\AI-Testing-Workspace\Cloudlabs - Rocky\vmpackage"
powershell -NoProfile -ExecutionPolicy Bypass -File build-package.ps1
```
**VERIFIED**: it runs the logic gates, packs the zip, and **excludes `webext/ai.local.json`** —
your API key is never in the package. The repo is public; keep it that way.

**You do not need the zip for the demo.** The zip is for installing on a VM. For the demo you load
the source directory directly:

```powershell
cd "C:\AI-Testing-Workspace\Cloudlabs - Rocky\vmpackage"
node test/open-rocky.js --fresh "https://experience.cloudlabs.ai"
```

`--fresh` is **mandatory**, not optional. A browser restart reloads content scripts but **not** the
extension's service worker, and `background.js` (the model's system prompt) changed this week. A
persisted profile would run this week's content scripts against last week's worker, everything
would look green, and the ask box would answer with the old prompt. `--fresh` also guarantees no
stale bundle in `chrome.storage` — which would make Rocky print "Step N of M" from an unrelated
Foundry lab.

*(If you must install on a machine rather than launch from source:
`bin\Install-Rocky.ps1` unpacks the zip, drops a Public Desktop shortcut and a logon task, and
`bin\Rocky-Launch.ps1` is what the shortcut runs. Same mechanism, packaged.)*

---

## 3. Verification ladder — nine checks, in order

Run these once during rehearsal. Each has a pass condition you can see.

| # | Check | How | Pass |
| --- | --- | --- | --- |
| 1 | **Rocky loaded** | In the Rocky window, press **Alt+E** on any portal page | Rocky's card appears. If nothing: Killer 1 |
| 2 | **Content scripts injected** | F12 → Console → `document.querySelectorAll('[data-labpilot],#labpilot-overlay-root').length` | ≥ 1 after Alt+E |
| 3 | **The world model is live** | `node test/coach-live.js` in a terminal | prints `[ok]` lines and "Rocky reads the world model and speaks from it, live on: …" |
| 4 | **Guide ingestion** | On the CloudLabs Guide tab, page 5, press **Alt+E** | Rocky names a step from Challenge 04, e.g. *"Select Create policy > Custom policy…"*. **MEASURED** on this template previously (see below); rehearse page 5 specifically |
| 5 | **Glow / highlight** | On the Purview Policies page with the guide tab open | a control is outlined. **REHEARSE** — needs the cross-tab follow (below) |
| 6 | **Mentor mode** | Alt+A → type *why am I doing this?* | *"This is part of the task 'Create the custom departing-user policy'."* or an honest refusal. **VERIFIED** against the real pane text |
| 7 | **Completion detection** | Create a policy; watch the Policies list grow | *"I just saw the list went from 1 to 2 on Policies."* **REHEARSE** — never recorded after a real Submit |
| 8 | **Recovery / failure** | Open a page the account lacks the role for (e.g. Alerts with Admins-only) | *"The portal just reported '…aren't assigned to a role group…'. That is a permissions problem, not something you typed wrong…"* **REHEARSE** |
| 9 | **Honesty** | Alt+A → *which step am I on?* on a page Rocky cannot place | *"You look to be on the step that says '…', though I am not sure enough to give you a number."* **VERIFIED** |

### Cross-tab: how the guide reaches the portal, and that it was measured here

This is the mechanism the demo depends on, and it was built for **this exact lab**.
`test/crosstab-test.js` records the live measurement:

> *Know Your Data SMB, template 15549: the guide renders on experience.cloudlabs.ai and the
> learner works on purview.microsoft.com. `LabPilotGuide.read()` finds the guide ONLY on the
> CloudLabs tab, so the pilot never started on Purview and nothing could glow where the learner
> actually clicks.*

So: the CloudLabs tab **publishes** the parsed guide to a shared record; the Purview tab has no
guide of its own, so it **follows** — ingests the same steps into its own world model and runs the
pilot there, against the real controls. The follower's belief is published back and the guide tab
adopts it; the guide tab's own belief is never imported, because it saw no controls.

Two consequences for the demo:
- **Both tabs must be in the Rocky window.** A portal tab in any other browser sees nothing.
- **Open the guide tab first** and let it settle, so there is something to publish before the
  Purview tab looks for it.

### What check 4 will actually produce

I ran Rocky's guide reader over the **real rendered Challenge 04 pane** (transcribed from the
lab's own screenshot, so no markdown — bold and code spans are styling, exactly as `innerText`
delivers them). **VERIFIED** output:

- 29 pane lines → **5 steps Rocky can point at**, 11 lines offered to the model, the rest ignored
- Task headings attach correctly: steps 1–3 → *"Enable the four required global indicators"*,
  steps 4–5 → *"Create the custom departing-user policy"*
- Targets resolved: `Solutions`, `Insider Risk Management`, `Settings`, `Policy indicators`,
  `Save`, `Policies`, `Create policy`, `Custom policy`
- The demo sentence, verbatim:
  > **Step 5 of 5. Select Create policy > Custom policy. Do not select Quick policy. This is part
  > of the task "Create the custom departing-user policy".**

**One caveat you must know before you speak.** "Step 5 of 5" means *of the five steps Rocky can
point at*, not the guide's own numbering — the guide shows Task 2 step 2. If you draw attention to
the number, explain it in one line: *"that's five of the steps he can point at, not the guide's
numbering"*. Better: don't point at the number; point at the sentence.

---

## 4. The demo flow on this lab

**Lab:** Know-Your-Data-Purview-SMB, **Guide page 5 — Challenge 04: Insider Risk Detection for
Departing Users**. Browser-only, no PowerShell, and the page whose role-group warning is already
recorded in a trace.

**Start Rocky on:** the CloudLabs **Guide tab**, page 5. That is where he reads the steps. Then
work in the Purview tab.

| Beat | You do | Rocky says | You say |
| --- | --- | --- | --- |
| 1 | Guide tab, page 5. Alt+E | names the Challenge 04 step and its task | "He read that off the page you're looking at. No API, no upload — the same guide you're reading." |
| 2 | Switch to the Purview tab → Insider Risk Management → Policies | *You are on Policies.* Glow on the control | "He knows the page because the portal declares it, and the glow is him reading the guide against what's on screen." |
| 3 | **Task 1, not Task 2.** Settings → Policy indicators → tick the four Office indicators → **Save**. Wait for the notification. | *I just saw … **Next, "In Insider Risk Management, open Policies."*** | **Stop here.** "The guide says what should happen. Rocky saw what did — and he knows what comes next." |
| 3b | Now follow that: Policies → Create policy → Custom → name it → Submit | a second change, and the glow moves | "He is not replaying a script. He followed me." |
| 4 | Alt+A → *what have I done so far?* | *I have watched the portal change once so far. Most recently the list went from 1 to 2, on Policies. Those are changes I saw, not steps I ticked off.* | "No model in that answer. He's telling you what he watched — and what kind of evidence it is." |
| 5 | Alt+A → *which step am I on?* | the step, hedged, or a number he can defend | "He'll give a number when he can defend it. Until then, the step." |
| 6 | *(optional)* open a page the account cannot see | the permission diagnosis | "The most common lab defect there is. He says whose fault it is before the learner raises a ticket." |
| 7 | Azure tab → *where am I?* | *You are on Microsoft Azure. I cannot yet tell which step you are on.* | "Azure doesn't declare the page, so he names the portal and asks. That's the design, not a gap." |

**Close:** *A chatbot knows what you tell it. The guide knows what should happen. Rocky knows what
did.*

### Why Task 1, measured

Rocky reads **5 steps** from the Challenge 04 pane. Where you start decides whether the
centrepiece sentence is complete:

| Start at | Belief after | Steps ahead | The teaching moment says |
| --- | --- | --- | --- |
| **Task 1 Save** (step 3) | 2 of 5 | **2** | *I just saw … **Next, "In Insider Risk Management, open Policies."*** |
| Task 2 Create policy (step 5) | 4 of 5 | 0 | *I just saw …* and nothing more |

Two further reasons for Task 1: its guide line is literally *"Select Save and wait for the success
notification"* — the clearest completion signal in the lab — and finishing step 5 first auto-marks
the four before it done, so Rocky has nothing left to guide you to.

### Safest pages
Purview **Insider Risk Management → Policies**, **Settings → Policy indicators**, **Alerts**
(read-only). Azure **Resource groups** (browse, Refresh, filter — nothing mutating).

### Actions to avoid
- Anything in **Challenge 2 Task 3** (PowerShell, Graph, tenant settings).
- Endpoint DLP / Defender work — the VM is **not onboarded to Defender for Endpoint** in this
  tenant, per the lab's own testing notes. It will fail and it is not Rocky's fault.
- Deleting policies or labels during the demo.
- Clicking **Quick policy** to "show the misclick" — nothing speaks it on this path.
- Typing *"which lab is this?"* — `webext/lab.json` is a committed Foundry fixture and will name
  the wrong lab.

---

## 5. Rehearsal checklist

**Before (30 min, the day before or the morning of)**

- [ ] Close every other Edge. Check: no other `msedge.exe` windows.
- [ ] `git pull` and `powershell -File test/run-all.ps1` → **ALL GATES GREEN** on an idle machine
- [ ] Replace `webext/lab.json` with this lab's identity, or blank the `labCode` — otherwise every
      model answer is grounded on a Foundry QA fixture
- [ ] `node test/open-rocky.js --fresh "https://experience.cloudlabs.ai"`
- [ ] Sign in to CloudLabs; open the lab; Guide tab; page 5
- [ ] Second tab, same window: `https://purview.microsoft.com`; sign in as the lab user with the
      TAP; complete any passkey/MFA prompt **now**, not during the demo
- [ ] Verification checks 1–5 above
- [ ] Create one policy end to end **once**, watching for check 7. Note whether the completion
      sentence fires and at what moment (it arrives when the list re-renders, not when the toast
      shows). **Tag beat 3 by what you saw.**
- [ ] Leave exactly one policy in the list; reopen the wizard to its final Review page in a third tab
- [ ] Decide the role-group beat: both IRM role groups = no banner; Admins-only = the banner is
      your failure beat
- [ ] Optional: `ai.local.json` present and one question answered, if you want model answers

**During**

- Work only in the Rocky window. Keep the Azure tab in its **own window**, foregrounded when used —
  the Azure blade unloads when its tab is backgrounded.
- Let Purview settle (the left rail finishes loading) before each click.
- Ask questions **after** any failure beat, or press **Esc** first: while an answer card with a
  follow-up box is open, Rocky suppresses proactive diagnoses, and a failure expires after 45 s.

**After**

- Delete the demo policy if the environment is being reused.
- `node test/coach-live.js` once more if anything looked wrong, and keep the output.

---

## 6. Demo killers

| # | Killer | Root cause | Detect | Workaround | Backup |
| --- | --- | --- | --- | --- | --- |
| 1 | **Rocky does not appear at all** | Load-dependent. Measured: 0 failures in 5 runs idle, 3 in 8 with ten other Edge instances. Content scripts inject but nothing mounts | Alt+E does nothing; check 2 returns 0 | **Reload the tab.** It mounts on the next load. Close other browsers first | Backup A |
| 2 | **Stale service worker** | A restart reloads content scripts, not the worker; the system prompt changed this week | Ask box answers oddly while everything else is green | Relaunch with `--fresh` and sign in again | — |
| 3 | **Guide not read** | The pane needs ≥3 imperative lines visible and under 60 000 characters. Not an iframe problem: the guide reader has no frame guard and runs in every frame | Alt+E on the guide tab names no step | Scroll the task list into view; reload. If still nothing, the guide beat is cut | Backup B |
| 4 | **No glow** | The control is ambiguous or covered, or the belief is still on step 1 | Rocky speaks but nothing is outlined | Narrate whichever control *is* glowed; or move to the step whose control is unique | — |
| 5 | **No completion sentence** | Never recorded after a real Submit; the relay drops the grid key while the wizard is open, so it arrives on the list re-render | Nothing after Submit | Ask *"what have I done so far?"* — if it was seen, it is there; if not, Rocky says so, and **that is the honesty beat** | — |
| 6 | **Permission banner opens the demo** | The account has IRM Admins but not Investigators | Rocky diagnoses on the Policies page before you start | It is true — make it the failure beat, first | — |
| 7 | **TAP sign-in stalls** | A fresh profile forces MFA / passkey registration | Sign-in loops during the demo | Do the sign-in during rehearsal so the profile is warm. Do **not** use `--fresh` again after that | — |
| 8 | **Wrong lab identity** | `webext/lab.json` is a committed Foundry QA fixture | *"which lab is this?"* names `foundry-develop-ai` | Replace it before the demo; do not ask the question | — |
| 9 | **Azure blade blank** | The blade unloads when its tab is backgrounded (55 controls → 0) | Azure beat shows nothing | Own window, foregrounded; refresh the blade | — |
| 10 | **Model answers are odd or absent** | `ai.local.json` missing or the key is stale | *"That one needs the AI, which is not switched on for this lab…"* | Use only the deterministic questions: *where am I*, *which step am I on*, *what have I done so far*, *why am I doing this* — **none of them need the model** | — |
| 11 | **Lab expired** | ODL-PURVIEWSMB-2400568 had a 6-hour timer and was noted with ~1 day left on 24 Sep — it is almost certainly **dead** | The lab page will not open | Start a fresh ODL of template 15549. Every step here is unchanged; only the user and TAP differ | Backup B |

### Backup A — Purview, no guide
Rocky on `purview.microsoft.com` alone. Still shows: place at 0.95, the honesty beat, the typed
questions, and the failure diagnosis. Loses the guide-reading and the glow. **VERIFIED** working
tonight.

### Backup B — Azure only, no lab, no sign-in
`node test/open-rocky.js --fresh "https://portal.azure.com"`, then
`node test/coach-live.js`. Shows: cross-frame perception in the Azure blade, the marked context
block the model receives, the full permission diagnosis through the real pipeline, and the Azure
honesty beat. Needs no CloudLabs environment at all. **VERIFIED** working tonight on both portals.

---

## 7. What is verified, and what is not

**Verified today**
- Guide ingestion on the real rendered Challenge 04 pane: 5 steps, correct targets, task headings
  attached, the exact POINT sentence
- The manifest matches `experience.cloudlabs.ai`, `purview.microsoft.com`, `portal.azure.com`
- The package builds and excludes the local secret
- All 32 release gates green; `coach-live.js` green on Purview and Azure
- Every typed answer and every recovery sentence, printed by executing the code
- The mount failure is load-dependent, not a product defect

**Not verified — rehearse these**
- Rocky reading **page 5 specifically** on `experience.cloudlabs.ai`. That the pane is readable there at all is already measured (see below)
- Cross-tab on the live pair: guide on CloudLabs, work on Purview
- A completion after a real Submit — never recorded on Purview
- TAP sign-in in a fresh profile
