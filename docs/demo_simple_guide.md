# Rocky demo — the simple guide (one by one, in your own words)

**Print this page.** It is the whole demo in plain words. No jargon, no timing pressure.

---

## How to start (3 steps)

1. Double-click **`START_DEMO.cmd`**. Wait for the windows to open.
2. Make the **demo window** the star (F11 full screen). This is the window people watch.
3. Click **👣 One-by-one**. Now NOTHING moves until you press **→**.

**That's the whole trick:** each screen does its thing, then waits. You explain it in your own
words, take questions, and press **→** when you're ready for the next one. The corner says
"**→ ready**" when the screen is done. Wrong screen? **←** goes back. **R** replays.

---

## Working from home — screen-share setup (Teams/Zoom)

- **Share your ENTIRE screen, not just the browser window.** Your best moment is editing the
  lab file in Notepad — if you share only the browser, the audience never sees the edit.
- **One monitor?** You don't need the presenter console — One-by-one mode shows "→ ready" right
  on the demo screen. Keep this guide printed or on your phone. On your screen keep only two
  things: the demo window (F11) and Notepad behind it (Alt-Tab).
- **Two monitors?** Share screen 1 (demo + Notepad). Keep the presenter console + this guide on
  screen 2. Its Pause/Next buttons always work, even when the shared window loses focus.
- **Before the meeting:** Teams status → **Do Not Disturb**, Windows → **Focus Assist on**,
  close Outlook/WhatsApp — you are sharing your whole screen; one popup ruins the trust theme.
- **Clicked something else and keys stopped?** Click once anywhere on the demo window (the dark
  caption bar at the bottom is safe), then keys work again.
- **Do a 2-minute test share first** (with a colleague, or join the meeting from your phone and
  watch your own share): check the text is readable and the "→ ready" corner is visible.
- Slow/laggy share? Close the camera video or set Teams to "optimize for text" — the demo is
  mostly crisp text, it shares beautifully even on weak connections.

---

## The 17 screens — what you see, and one simple line to say

**1. Title card — "Rocky"**
> "This is Rocky. It keeps our hands-on labs healthy. Green tag = real. Blue tag = practice data. I'll show you both, clearly labeled."

**2. Story card — 2 a.m.**
> "A learner follows our guide at 2 a.m., a step fails, they think it's their fault, and they quit. We never find out. That's the problem."

**3. A learner's lab screen (practice copy)**
> "This is what the learner sees. Three checks are red. And that little robot in the corner — that's Rocky, inside the lab with her."

**4. She asks Rocky for help**
> "She asks: 'should I pick a smaller VM?' Rocky says NO — and shows proof the real problem is the wrong region. It never guesses. (The chat voice is off today — subscription issue — so it shows the proof card instead. That's by design.)"

**5. Backstage feed**
> "This is everything Rocky just did, in plain English, each line labeled real or simulated. Nothing is hidden."

**6. Fleet dashboard (practice data)**
> "Zoom out: 12 labs, 3 broken, 142 learners affected — spotted from results, not from complaints. This dashboard is practice data, clearly labeled."

**7. LIVE scan — the real one** ⭐
> "Now the real thing, live: Rocky is reading 8 of our actual lab repos right now… 133 real problems. And 3 repos came back totally clean — it doesn't cry wolf."

**⭐ THE LIVE EXAMPLE (do it here — this is your showstopper):**
> "Numbers are easy to doubt. So watch — I'll break a lab right now."
- Alt-Tab to Notepad (already open) → paste the line → **Ctrl+S**
- Back to demo → click **↻ Rescan live** → *"134. It caught my mistake — exact file, exact line."*
- Notepad → **Ctrl+Z**, **Ctrl+S** → Rescan again → *"133. Clean again. It tells the truth in both directions."*
- Resume from the presenter window if keys don't respond.

**8. Bring your own lab — the upload page** ⭐
> "Don't take my word about our repos — this page accepts ANY lab guide." Drag **Challenge-05.md** from the Demo-Uploads folder → the retired model appears at its exact line. Click **Scan a whole lab folder** → pick **RTIAD-mini** → the Japanese translation shows its lost login tokens. Drag **clean-lab-guide.md** → "and a clean guide? It says clean."

**9. The Japanese finding (real)**
> "My favorite real find: the Japanese guide lost its login placeholders in translation — learners were literally told to type 'RTI_username' as their username. Of course it fails. Rocky found 16 of these in 5 languages."

**10. Priya's lab — the fix (practice data)**
> "22 learners hit the same wall — wrong region. Rocky already wrote the fix. But the rule is: Rocky never changes anything itself. A human reviews and approves every fix."

**11. The lying checkmark (practice data)**
> "The scary one: this lab says 100% success — and it's broken. Its own check was passing people whose work was wrong. Nobody complains about passing, so no ticket ever catches this. Rocky compares the claim against reality and catches the lie."

**12. 133 problems → 13 campaigns (real)**
> "133 problems sounds like 133 tickets. Rocky groups them by root cause into 13 fix campaigns — the top 3 cover 62%. Five real pull requests came out of this; two are already merged."

**13. The Watcher (practice data)**
> "Testing once is a photo; this is the movie. Watch the sweeps: it stays quiet, catches a silent break the moment it appears, folds 4 failures into 1 alert, and notices recovery by itself."

**14. The Guardian gate (practice data, real refusal)**
> "Rocky can restore learners who were failed unfairly — the most dangerous power here. So watch: it will try WITHOUT naming a responsible human… refused, live. That refusal is code, not policy."

**15. Receipts (real)**
> "What's real today: 133 defects, 8 repos, 5 pull requests, 2 merged, a planted bug blocked by the safety gate in 4 seconds, zero false alarms in a 42-sample audit. Pick any number and check it."

**16. Close card**
> "One system, three jobs: find what's broken, fix it with human approval, help the learner meanwhile. Our rule: we never fake green. Next step is a small 2-week support pilot measuring one number — how much faster we find root cause."

**17. Thank-you card**
> "Thank you — questions welcome." (This card stays up. Press ← anytime to show a screen again.)

---

## 🎧 Wingman — your invisible helper (on your phone)

Wingman listens to the meeting, recognizes what's being asked, and puts the **answer on your
phone** — with every project number ready to read out. The share can never see your phone.

**Setup (once, 2 minutes):**
1. `START_DEMO.cmd` opens the **wingman page** — click **🎙️ Start listening** (allow the mic once).
2. It shows a **phone URL** (like `http://10.x.x.x:5173/wingman-view.html`). Open that on your
   phone (same Wi-Fi). Keep the phone next to you, plugged in.
3. Hide the wingman window **behind** the full-screen demo (don't minimize it). Done — invisible.

**How to use it in the meeting (one habit):** when someone asks something, **repeat the question
out loud** — *"So the question is: how accurate is the scanner?"* That's good presenting anyway,
and it's exactly what Wingman transcribes (works even with headphones on). One second later your
phone shows the answer with the right numbers. Read it in your own words.

**What the phone shows:** the current segment's say-line at the top (so the phone alone is enough
to present from), the last question heard, and up to 3 matched answers — best match first, each
with its key numbers and where it's verifiable. If nothing matches, it tells you to say:
*"Good question — let me verify that and come back to you."* (That honest answer IS the brand.)

**Backup:** if voice misses, type the question into the wingman window's text box — same answers.

**Honesty rules built in:** Wingman only suggests — **you** speak. Every answer keeps the
real-vs-simulated labels. And when your new AI key lands, it can additionally draft free-form
answers, clearly tagged "AI draft — check numbers before saying."

---

## If something goes wrong (keep calm, it's all recoverable)

| Problem | Do this |
|---|---|
| Keys don't work on the projector | Use the **presenter window's buttons** — they always work |
| Wrong screen / need to re-show | **←** back, **→** forward, **R** replay |
| Live example stuck at 134 | Double-click **`DEMO_REVERT_BUG.cmd`**, then click Rescan once |
| Someone asks a hard question | The **Q&A answers** are at the end of `demo_speaking_script.md` |
| Total blackout / restart needed | Close windows, run `START_DEMO.cmd` again (~1 min) |

**The three sentences to remember if you forget everything else:**
1. "Labs break silently because the cloud changes — even when nobody edits the lab."
2. "Rocky finds it, drafts the fix, a human approves, and it proves the fix worked."
3. "Everything you saw is labeled real or simulated — we never fake green."
