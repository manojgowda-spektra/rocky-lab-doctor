# Recording Storyboard — the exact on-camera order (for Snagit)
**Purpose:** a single, linear, click-by-click sequence to record one clean end-to-end demo video.
Follow it top to bottom without deviating. ~4–5 minutes of footage. Pair with `master_demo_script.md`
for the exact words to narrate; this file is the *camera order*.

## Before you press Record (2 min)
1. `start-demo.bat` → wait for **✅ READY FOR DEMO**.
2. Open tabs in THIS left-to-right order so Alt-Tab / Ctrl-Tab is linear:
   ① `localhost:5173/backstage.html` → click **✨ Clear**
   ② `localhost:5173/cloudlabs-sim.html`
   ③ `localhost:5173/labdoctor.html`
   ④ `localhost:5173/monitor.html`
   ⑤ `localhost:5173/amnesty.html`
   ⑥ `localhost:5173/receipts.html`
3. On tab ④ (monitor) click **↻ Reset timeline**.
4. Optional but recommended: put backstage on a **second monitor** so it's visible the whole time. If
   single-screen, keep it as tab ① and cut to it where the storyboard says "CUT TO BACKSTAGE".
5. Snagit: **Video capture**, region = the browser window (or full screen if backstage is on screen 2).
   Snagit 2020 → press **PrtScn** (default) → choose **Video** → select region → big red **Record** button
   (countdown 3-2-1). Stop with **PrtScn** again, or the toolbar **Stop**.

---

## THE TAKE (record from here)

**[0:00] Title / problem — tab ①/home or just talk (10s)**
Say: *"Online cloud labs quietly break when Azure changes underneath them. Today you find out from angry
tickets. This is Rocky — watch it find, fix, and prevent that, and narrate itself the whole time."*

**[0:15] CUT TO BACKSTAGE (tab ①) for 3 seconds**
Say: *"This right-hand screen is the system narrating what it's actually doing — nothing scripted."*
(Leave it visible on screen 2 if you can.)

**[0:20] The learner — tab ② cloudlabs-sim**
- It looks like a CloudLabs lab: guide left, VM right, Rocky floating bottom-right. Point at the 3 red FAILs.
- Say: *"A learner is stuck. Her deployment failed. She asks the question everyone asks—"*
- **Click Rocky** (panel springs open) → **click the "Why failing?" chip**.
- Rocky answers (live model if key is up; otherwise the evidence card). Read the punchline:
  *"It refused the tempting wrong fix — 'a smaller VM' — and named the real cause: wrong region. It didn't
  guess; it read her actual checks."*
- BACKSTAGE now shows: *Evidence assembled* → then the AI card. Say: *"See — the engine gathered the
  evidence BEFORE the AI spoke. The AI only narrates."*

**[1:20] Zoom out — tab ③ labdoctor**
- Say: *"That's one learner. Here's the whole fleet."* Point at **3 of 12 failing, 142 learners**.
- **Click "Rescan live"** in the REAL DATA panel → spinner → **133 findings** populate.
  Say: *"These are our REAL production lab repos — 8 of them. Rocky just scanned them live: 133 real
  problems. Three repos came back clean."*
- **Click the top lab ("Deploy a Resilient Web App")** → point at the drift finding (22 learners, eastus
  vs westus2) and the **red/green drafted fix**. Say: *"It already wrote the fix. A human approves it."*

**[2:20] THE TWIST — tab ③, click "Lock Down a Storage Account"**
- Say slowly: *"Look — **100% completion. Everyone passed. And it's broken.** The check was lying — 23 of
  24 learners left their storage wide open. Nobody files a ticket about a passing check. Only Rocky catches this."*
- (This is the moment. Pause here.)

**[3:00] Fix lands & verifies — tab ④ monitor**
- **Click "▶ Advance one sweep"** ×6, narrating: *"silence… silence… there's the silent break at sweep 3…
  four labs folding into ONE incident at 4… steady, so silence at 5… and sweep 6: recovery, detected
  automatically. Nobody marked it fixed — Rocky verified it."*

**[3:45] The guardrail — tab ⑤ amnesty**
- Say: *"When a broken check wrongly fails good learners, Rocky can restore their grades — but only with a
  named human."* **Click "Try without a name →"** → live **HTTP 400 refusal**. BACKSTAGE shows a red GATE card.
- Say: *"The gate is code, not policy."*

**[4:15] Proof / close — tab ⑥ receipts**
- Say: *"Everything on the dashboards is a labelled simulation — we don't touch real learner data without
  approval. But this is real: 133 defects, 8 repos, 5 pull requests, 2 already merged, a bad change blocked
  by CI in 4 seconds. Found, fixed, verified, prevented — and it never fakes green."*

**[4:40] Stop recording (PrtScn / Stop).**

---

## Retake / reset between takes (5 seconds)
Run this one line in a terminal, then reload the tabs:
```
node -e "for(const p of ['reset','monitor/reset','amnesty/reset','backstage/clear']) fetch('http://localhost:5173/api/'+p,{method:'POST'})"
```
(or just click ↻ Reset on the Rocky/monitor pages and ✨ Clear on backstage.)

## If the AI chat is OFF (disabled subscription) during recording
Totally fine — it's honest behaviour, and arguably a stronger clip: Rocky says the model's unreachable
and shows the deterministic **evidence card** instead. Narrate: *"even with the AI turned off, the engine
still catches everything — the AI was only ever narrating."* To get the live-chat clip, re-enable the
subscription (or point Rocky at another OpenAI resource) first, then re-record the [0:20] beat.

## What I (the assistant) can and can't do for the recording
- I CAN: launch Snagit, reset state, and open the tabs in order.
- I CANNOT: press Snagit's record button or click inside the browser for you (no screen-control tool).
  So you drive the clicks above — which is better anyway: a real hand + voice reads as authentic.
