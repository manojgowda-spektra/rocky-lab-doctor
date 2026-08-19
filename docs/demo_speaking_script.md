# Rocky — Live Demo Speaking Script (~10 minutes)

**How this works:** open `http://localhost:5173/demo.html` on the projector and press Start —
the product drives itself. Open `http://localhost:5173/presenter.html` on your own screen: it shows
these exact lines, the segment number, and a countdown, synced live. The **segment badge top-right
of the demo screen matches the numbers below**, so you can never get lost.

**Controls (either window):** `Space` pause/resume · `→` next · `←` previous · `R` replay segment.
If someone asks a question mid-demo — just press Space, answer, press Space again. That's a feature, show it off.
(Jumping while paused auto-resumes — that's intentional, so the screen and captions never tear.)

**Pace:** calm ~140 words per minute. Segments 6, 11, 12 and 14 leave almost no slack — don't rush them;
everywhere else you have breathing room. If you finish a line early, silence is fine — the
audience is reading the screen.

---

## 01 · Cold open — title card (0:31) — [no tag]

> Good morning. This is Rocky — the reliability layer for our hands-on cloud labs. For the next
> ten minutes or so, the product will drive itself on screen while I explain what you're seeing.
> Everything is labeled: a green tag means real and verifiable, blue means a labeled simulation,
> and amber means both are on screen — labeled which is which. We never pass one off as the other.

## 02 · The 2 a.m. problem — story card (0:27) — [no tag]

> Start with the problem. A learner is doing our lab at 2 a.m. They follow the guide exactly —
> and a step fails. They assume it's their fault, and they quit. We never hear about it, and the
> same broken step fails the next learner too. Labs rot silently: the cloud changes underneath
> them even when nobody edits the guide.

## 03 · The learner's screen — cloudlabs-sim (0:30) — [SIMULATED]

> This is that learner's screen — a simulated CloudLabs environment, and it's labeled simulated,
> top right. The lab guide is on the left, her VM on the right, and three validation checks have
> gone red. Notice the little robot in the corner — that's Rocky, sitting inside the lab with her.

## 04 · Ask Rocky — evidence, not guesses (0:43) — [SIMULATED]

*(The question types itself and the evidence card appears mid-segment.)*

> She asks the obvious question: "deployment keeps failing — should I just pick a smaller VM?"
> Watch the answer. Rocky says no — and shows evidence: the real cause is the wrong region, not
> the VM size. That tempting shortcut would have wasted her hour. One honest note: the
> conversational AI is off today — the subscription holding the language model is disabled while
> we move to a new one — so what you see is Rocky's deterministic evidence card. That's by design:
> when any part is unavailable, Rocky degrades to plain evidence. It never bluffs.

## 05 · Backstage — nothing hidden (0:26) — [MIXED]

> Before we go further — this is Rocky's backstage. Every event you just watched is in this feed,
> in plain English, and every line is tagged with where it came from — real, simulated, fixture,
> or modeled. I'm showing you this early because the theme of this demo is trust: nothing on this
> screen is hidden from you.

## 06 · The fleet view — labdoctor (0:25) — [SIMULATED]

> Now zoom out from one learner to the whole fleet. This dashboard runs on our labeled digital
> twin — twelve labs, and Rocky has flagged three as failing, with 142 learners affected. Not from
> support tickets — from the results themselves. The fleet data is simulated so we can prove the
> logic safely; what comes next is not.

## 07 · LIVE scan of real repos (0:45) — [REAL]

*(The rescan fires by itself; the count lands while you speak.)*

> This part is real, and it's happening live right now — not a screenshot. Rocky is re-scanning
> eight of our actual production lab repositories, 268 guide files, as we watch. There it is:
> 133 real problems. And just as important — three of those eight repos came back completely
> clean. Rocky says "nothing wrong here" when nothing is wrong. A tool that flags everything is
> useless; the clean verdicts are why you can trust the 133.

---

## ⭐ LIVE EXAMPLE — break a lab in front of them (do this at segment 07, ~90s) — [REAL]

This is the moment nobody can doubt: you make a real mistake in a real lab guide, and Rocky
catches it live. **Do the FULL cycle (plant → catch → revert → clean) before resuming the rail** —
the later segments quote 133, so the demo must end back at 133.

**Prep (done by START_DEMO.cmd):** Notepad is already open with
`Labs\CAF-Infra-Security\00-lab-intro.md` — one of the three repos Rocky reports as CLEAN.
Before the room fills, copy this line to your clipboard (from here):

```
> **Task:** Deploy the embedding model `text-embedding-ada-002` for the search index.
```

**The moves + the words:**

1. When segment 07 lands on **133**, press `Space` (pause). Say:
   > Numbers on a dashboard are easy to doubt. So let me break a lab for you, right now.
2. Alt-Tab to Notepad. Point at the title: this is a real guide from CAF-Infra-Security — one of
   the three repos Rocky just called CLEAN. Paste the line at the end. Ctrl+S. Say:
   > I've just added a step telling learners to deploy text-embedding-ada-002 — the same retired
   > model we found in production earlier. A tired author could do this on any Friday.
3. Alt-Tab back to the demo. Click **↻ Rescan live** on the page itself. (~3 seconds) Say:
   > Rescan… there. One hundred thirty-four. The clean repo now shows one finding — the exact
   > file, the exact line I just touched. And notice the pencil mark: Rocky even noticed the
   > repo has uncommitted changes.
4. Alt-Tab to Notepad. Ctrl+Z, Ctrl+S. Back to the demo, click **↻ Rescan live** again. Say:
   > And the other half matters just as much: I remove the mistake, rescan — one hundred
   > thirty-three, and the repo is clean again. It doesn't cry wolf. It reports exactly what's
   > true, in both directions.
5. **Resume from the presenter console** (its ⏯ button — the projector window may not have
   keyboard focus after you clicked inside the page). The rail continues to segment 08.

**Safety net:** if anything goes sideways, double-click `DEMO_REVERT_BUG.cmd` (project root) —
it git-restores the file — then click Rescan once. Never resume the rail while the count reads 134.

---

## 08 · Bring your own lab — upload & scan (0:55) — [REAL]

*(You do the drags — the rail waits in one-by-one mode. Files are staged in the Demo-Uploads
folder, already open in Explorer.)*

> And you don't have to take my word about our repos — this page accepts ANY lab guide.
> *(drag Challenge-05.md onto the page)* Watch — the same engine, live: the retired AI model,
> at its exact line. *(drag the RTIAD-mini folder using 'Scan a whole lab folder')* It even
> compares translations — this is the Japanese guide that silently lost its login tokens.
> *(drag clean-lab-guide.md)* And a clean guide? It says clean. Bring your own lab after this
> call — that's the fastest way to believe it.

## 09 · The finding that stings (0:30) — [REAL]

> One real finding, because it's unforgettable. Our English guides auto-fill each learner's real
> login. In the Japanese translation those placeholders were dropped — so a Japanese learner is
> literally instructed to type the words "RTI underscore username" as their username. Sign-in
> fails and they'll never know why. A human proofreader skims right past this. Rocky found sixteen
> of these, across five languages.

## 10 · Priya's lab — fix drafted (0:28) — [SIMULATED]

*(The page selects her lab and scrolls to the diagnosis by itself.)*

> Back to our 2 a.m. learner. Her lab shows 22 people hit the same wall — wrong region. Rocky has
> already drafted the one-line fix that pins it. And here's the safety rule: Rocky never applies
> anything by itself. Every fix becomes a pull request that a human reviews and merges. Draft,
> approve, verify — in that order, always.

## 11 · The lying checkmark (0:43) — [SIMULATED]

> Now the one that should genuinely worry us. This lab reports one hundred percent completion.
> Everything green. And it is broken. Its own validation check was silently passing learners whose
> storage was still publicly exposed — twenty-three of twenty-four "passed" a security lab while
> leaving the door wide open. No ticket will ever catch that, because nobody complains about
> passing. Rocky catches it by refusing to trust the checkmark — it compares what the check claims
> against what actually happened, and flags the contradiction. This scenario runs on the twin so
> we can prove the logic safely.

## 12 · From 133 problems to 13 decisions — campaigns (0:30) — [REAL]

> Finding 133 problems is useless if it lands as 133 tickets. Rocky's Fixer groups them by shared
> root cause into thirteen campaigns — and the top three cover sixty-two percent of everything.
> This has already produced five real pull requests on our GitHub; two are merged. And when Rocky
> projects the impact of a fix, those numbers are always labeled "modeled" — we don't claim credit
> before a merge.

## 13 · The Watcher — sweep by sweep (0:52) — [SIMULATED]

*(The timeline resets and six sweeps advance on their own, ~6s apart. Narrate over them.)*

> Testing a lab once is a photo. This is the movie. The Watcher sweeps continuously, and — like a
> good security camera — it only speaks when something changes. Watch the sweeps: quiet… quiet…
> there — a silent break, caught the moment it appears. Then four labs fail together and Rocky
> folds them into one incident instead of four alarms. Then steady state — silence again. And at
> the end, notice: recovery is detected automatically. Nobody told it the lab was fixed; it
> verified that itself. This timeline is the labeled twin — the detection logic is the real code.

## 14 · The Guardian — refusal, live (0:40) — [MIXED — simulated cases · real gate]

*(At ~21s the page scrolls to the gate and clicks "Try without a name" by itself — your reveal
line lands right on it.)*

> When a broken check wrongly fails good learners, Rocky can restore their verdicts — but that's
> the most dangerous power in the system, so it sits behind five gates and a named human
> authorizer. And rather than tell you that, I'll prove it: the demo is about to request the
> restore without naming a human… there — refused, live, with an explicit error. That refusal is
> enforced in code, not in a policy document. The case data here is simulated; the gate you just
> saw refuse is the real engine.

## 15 · Receipts (0:38) — [REAL]

> Let's end on what's real and checkable today. 133 defects across 8 production repos — on disk.
> Five pull requests on GitHub, two merged by humans. We deliberately planted a bad change in a
> real repo, and Rocky's CI gate blocked it from merging in four seconds — that's prevention, not
> just detection. And we hand-audited a sample of its findings: zero false alarms in forty-two.
> Every number on this page is checkable — pick any finding, open the file on GitHub.

## 16 · Close — "We never fake green" (0:41) — [no tag]

> So: one system, three jobs. It finds what's broken — including checks that lie. It fixes with a
> human's approval — and it's built to verify the fix actually landed, which you watched it do on
> the twin. And it helps the learner in the moment, honestly. The design rule under all of it:
> the engine asserts, the AI narrates — and we never fake green. Next step is small and safe: a
> two-week support shadow-pilot, measuring one number — how much faster we find root cause.
> Thank you — questions welcome.

## 17 · Thank you / Q&A (holds forever)

*(Hold for questions — this card stays up. Press ← to revisit any screen, e.g. Receipts.
The Q&A armor is below.)*

---

# Q&A armor — the questions you'll get, and the honest answers

**"You test every lab before publishing — how can they rot?"**
Testing at publish time is a photo — it proves the lab worked that day. Labs live for months, and
the cloud moves underneath them: vendors rename products, retire models, change defaults. Nobody
edits the lab, and it still breaks. Rocky is the movie, not the photo — it watches continuously.

**"Is this data real or fake?"**
Both — and it's labeled on every screen, which you saw. The 133 findings, the 8 repos, the 5 pull
requests, the 4-second CI block: real, verifiable on GitHub and on disk. The fleet dashboard and
the learner stories: a labeled digital twin, because we deliberately do not touch production or
real learners without approval. Nothing simulated is ever presented as real.

**"What if the AI hallucinates a problem?"**
It can't — the AI is never allowed to decide anything. A deterministic engine computes every
finding from exact matches at known file and line. The AI only writes the plain-English sentence
around a fact the engine already proved. If the AI is off — like today — findings still stand.

**"Could it auto-fix and break something?"**
No. Every fix is a draft pull request; a human reviews and merges. We proved the refusal path live
in the demo — no named human, no action.

**"How accurate is it?"**
Hand-audited sample: 0 false alarms in 42. Independent re-audit of the localization family:
29 of 29 confirmed. And 3 of 8 repos came back clean — it says "nothing wrong" when nothing is.

**"Why is the AI chat off?"**
The Azure subscription holding the language model is disabled; we're repointing to a new model.
The product degrades gracefully to deterministic evidence cards — the demo showed that honestly
rather than hiding it. Everything that decides is unaffected.

**"Can it check whether screenshots match the steps?"**
Today it catches broken/missing screenshots and case-mismatched image paths (83 of the 133).
Verifying a screenshot's *content* against the step's intent is the next layer — the Scholar
already extracts machine-readable intent per step (129 facts, quote-anchored, on a 2-guide pilot),
which is exactly the ground truth that comparison needs.

**"What does it cost to run?"**
The engine is deterministic — no per-scan AI cost. The AI narration is optional and pennies. The
expensive part was building it; running it is a cron job.

**"What's the next step?"**
A two-week support shadow-pilot: Rocky triages tickets in parallel with one engineer, we measure
the triage-time delta. Zero learner risk, one clear number. It needs a support-team owner and a
ticket export — that's the ask.

---

# Morning-of checklist (10 minutes, before the room fills)

1. **Open the Labs folder once** (`Desktop\Labs` in OneDrive) so OneDrive hydrates the files —
   the live-rescan button only appears if that folder is readable. Don't edit anything in the
   8 lab repos today (an edit changes the live numbers mid-show).
2. Double-click **`START_DEMO.cmd`** (project root) — starts the server, runs preflight, opens both windows.
3. Preflight: expect **53/57 green** — exactly 4 fail, all AI-chat checks (`model=off`), known and
   fine. The demo doesn't use the chat. *(Anything else red = stop and investigate.)*
4. Drag **demo.html** window to the projector, press **F11**. Keep **presenter.html** on your laptop.
   The presenter console is also your reliable remote — its buttons work even if the projector
   window loses keyboard focus.
5. Do one silent full run (~10 min) to warm caches. Spot-check: segment 7 shows "Rescanned in …ms",
   segment 10 scrolls to the diagnosis, segment 14's refusal fires at ~21s.
6. **Rehearse the live example once** (it cleans up after itself): paste the plant line into the
   Notepad file, save, Rescan → 134 · then Ctrl+Z, save, Rescan → 133. Copy the plant line back
   to your clipboard when done. Confirm the count reads **133** before the room fills.
7. Close every other app/notification (Teams especially). Windows Do-Not-Disturb on.
8. When the room's ready: press **Start** on the projector window, walk to the front, speak from the console.

**After the room empties:** if the live example was left half-done (count reads 134), run
`DEMO_REVERT_BUG.cmd` and click Rescan once — the cache must end the day at 133 / 3 clean repos.

**After the demo — restoring the AI chat (when the new model key arrives):** in
`source/rocky-prototype/.env.local`, remove the `# DEMO-OFF # ` prefixes on the `AZURE_OPENAI_*`
lines (or replace them with the new provider's keys), then restart the server. The keys were
commented out deliberately so the Companion's evidence card appears instantly during the demo.
