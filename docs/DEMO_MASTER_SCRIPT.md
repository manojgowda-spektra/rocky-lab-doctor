# 🎬 ROCKY DEMO — MASTER SCRIPT (the only script)

*Six acts, one direction, ~12 minutes (~8 if you skip Act 5). Every act page carries the
**act strip** — the current act highlighted, provenance badges (REAL / SIM) baked in, and one
big **Next →** button that always goes to the right place, so you can never get lost.
(Act 1 keeps immersion with a compact pill bottom-left; the home page IS the map, so it has
no strip; Act 1's SIMULATED labels are on the page itself.)*

**One rule if you forget everything:** read the act strip out loud, click Next, and never claim
anything the screen doesn't show. Three sentences that survive any disaster:
1) Labs break silently because the cloud changes underneath them.
2) Rocky finds it, drafts the fix, a human approves, and it re-scans to prove it.
3) Everything on screen is labelled real or simulated — we never fake green.

---

## BEFORE THE MEETING (5 min)

| # | DO |
|---|---|
| 1 | Double-click **START_DEMO.cmd** (repo root) — starts the server, runs the readiness check, opens the act map |
| 2 | Confirm the check says **ALL CHECKS GREEN** (any ⚠ advisory tells you which optional beat to skip) |
| 3 | Optional: open **/qa.html** → 🖨 Print — keep the Q&A sheet next to the keyboard |
| 4 | Teams → Do Not Disturb. Browser → **F11**. Share → **Entire screen** |

Numbers policy: **never memorise numbers.** Scan numbers (findings/repos/files/campaigns) are read
live from the scan APIs on every page; static claims (PRs, tests, audits) come from one file
(`source/rocky-prototype/web/facts.json`). If a number on screen surprises you, read it from the
screen — the screen is the source of truth, and the readiness check proved it self-consistent.

---

## ACT 0 · THE MAP (home page · 30s)

**DO:** Nothing — the page you're already on. Point at the act list.
**SAY:**
> This is Rocky — the reliability layer for our hands-on labs. Labs rot silently: the cloud
> changes underneath them even when nobody edits the guide — a model retires, a product gets
> renamed, a translation drops a login token — and a learner at 2 a.m. pays for it.
> I'll show you the whole loop in six short acts — everything marked REAL is our real
> production content, live; everything simulated says SIMULATED on screen.

**DO:** Click **▶ Start the demo**.

## ACT 1 · THE STUCK LEARNER (cloudlabs-sim · SIMULATED · ~3 min)

*A CloudLabs-shaped lab environment: Lab Guide pane on the left, lab VM on the right, validations
per step, the deployment log in the terminal. All labelled SIMULATED.*

**DO:** Point at the guide pane, then the terminal.
**SAY:**
> This is what our learners see — the lab guide, their VM, and validation checks per step.
> This learner is stuck: the deployment failed with *SkuNotAvailable*, and the obvious fix —
> pick a smaller VM size — is **wrong**. The real cause is the resource group landed in the
> wrong region. Watch what Rocky does with that.

**DO:** Step 3 is already open and already red (this learner is mid-failure). Click **Validate**
on it — the checks re-run and now show *expected vs observed* detail → click Rocky (bottom-right)
→ click **"Why failing?"**.
**SAY:**
> Rocky reads the validation results and the deployment log — not the screen, not a guess. It
> shows the contradiction: expected region westus2, observed eastus — and it explicitly refuses
> the tempting VM-size fix. If the AI model is off, you get the same answer as a deterministic
> evidence card — the engine asserts, the AI only narrates.

**DO:** Click **🛟 Escalate**. Point at the packet — then at the terminal's connection-string error.
**SAY:**
> One click and the learner never explains anything: lab, step, root cause, failing checks —
> auto-attached. And look: the terminal showed a password and an API key in the error; the packet
> **redacted both** before anything left the box. Redaction is code, not policy.

**DO:** Click **✓ Apply the fix** → validations re-check → confetti.
**SAY:**
> The learner applies the fix, Rocky re-checks the validations — and only celebrates because the
> checks actually pass. Verified, not promised.

**DO:** Click **Next: Engine →** on the pill (bottom-left).

## ACT 2 · THE ENGINE, LIVE (demo page · REAL · ~4 min)

*The heart. One screen, four stages: Select → Diagnose → Fix → Verify.*

**SAY (on the Select screen):**
> Now the engine itself — and from here everything is real: real guides from our production labs,
> the real engine, live.

**DO:** Click **AI-Developer · Challenge 05**. Let the scan land; point at the activity panel.
**SAY:**
> Rocky scans for retired models, renamed products, end-of-life runtimes, broken images,
> translation losses. There: the guide tells learners to deploy a retired AI model — exact file,
> exact line. No AI decides this; it's a deterministic match, so it's never a hallucination.

**DO:** Click **🛠 Fix** on the first finding → point at the red/green diff → **🛠 Fix everything fixable** → **Verify →**.
**SAY:**
> Rocky drafts the exact change — old line red, new line green. Two things matter. First: it's a
> draft on a copy; the original is untouched; in production this becomes a pull request a human
> reviews — the PR and merge counts are on the receipts page at the end. Second: Rocky doesn't
> claim the fix worked — it **re-runs the same scan on the fixed copy**. *(Read the before/after
> numbers straight off the screen.)* Every drafted fix gone on the re-scan. Proven, not promised.

**DO:** Click **↻ Run another lab** → **RTIAD Workshop · Lab 1 (EN + JA)** → click **💡 Suggest** → **Verify →**.
**SAY:**
> This one's unforgettable: a real guide in English and Japanese. Rocky compares them and finds
> the Japanese translation silently lost the learner's login tokens — a Japanese learner is told
> to literally type the placeholder word as their username. And notice: Rocky does **not**
> auto-fix it. Placing tokens in translated sentences needs a translator, so it flags exactly
> which keys are missing and hands it to a human. Honesty over automation.

**DO:** Click **↻ Run another lab** → **CAF Infra Security · Intro**.
**SAY:**
> And the clean one: Rocky says clean. A tool that flags everything is useless — the clean
> verdicts are why you can trust the findings.

*(If the audience is engaged: "hand me any lab guide" — click **↻ Run another lab** first to get
back to the Select screen, then drag their file into the drop zone. Same engine, live.)*

**DO:** Click **Next: Fleet →** on the act strip.

## ACT 3 · THE FLEET (labdoctor · REAL · ~2 min)

**DO:** Point at the REAL DATA strip (top of the page). Expand one repo row.
**SAY:**
> The same engine across every production repo at once — the findings total, with every finding at
> file and line. Below that, upstream feeds — endoflife.date and Azure updates, harvested on the
> date shown on screen: which models and runtimes are being retired and exactly where our catalog
> references them — so we act before the deadline, not after the tickets.

**OPTIONAL LIVE BEAT** (only if readiness check was fully green):
**DO:** Alt-Tab to Notepad → plant the bug in the CAF repo file (retired model line) → back → **↻ Rescan live** → count goes up by 1 → revert (DEMO_REVERT_BUG.cmd or undo in Notepad) → rescan → baseline again.
**SAY:** *"Live, not a screenshot — I break a real repo, Rocky catches it in about a second; I fix it, the count comes back."*

**DO:** Scroll briefly past the fold. **SAY:**
> Below the fold is the roadmap, honestly fenced as FIXTURE: the same diagnosis running on
> per-learner telemetry — drift, checks that silently pass wrong work, checks that fail correct
> work. That's what this becomes once wired to live validation results.

**DO:** Click **Next: Campaigns →**.

## ACT 4 · DECISIONS, NOT LINT (campaigns · REAL · ~1.5 min)

**DO:** Point at the four stat tiles, then the top campaign (already open).
**SAY:**
> Finding a hundred-plus problems is useless if it lands as a hundred-plus tickets. Grouped by
> root cause they collapse to a handful of campaigns — and the top three cover most of everything.
> One decision, one PR, dozens of findings closed. And when support tickets arrive, they attach to
> these same root causes — fix one campaign, close a whole stack of tickets at once.

**DO:** Click **Next: Watcher →** *(or skip straight to Receipts in the 8-minute cut)*.

## ACT 5 · THE WATCHER (monitor · SIMULATED · ~1.5 min · SKIPPABLE)

**DO:** Click **▶ Advance one sweep** repeatedly: sweep 3 (silent break), sweep 4 (platform incident folds 4 labs into 1 alert), sweep 6 (recovery detected).
**SAY:**
> Testing once is a photo; this is the movie. A scripted, clearly-simulated timeline: a validation
> silently starts passing wrong work — caught. One region change hits four labs — folded into ONE
> incident, not four pages of noise. An author merges the fix — recovery detected automatically.
> And between events: silence. Alerts only on change.

**DO:** Click **Next: Receipts →**.

## ACT 6 · RECEIPTS + THE ASK (receipts · REAL · ~1 min)

**DO:** Point at the tiles (the scan tiles are live from the API; the false-positive tile is the
hand-audited constant), then the ask panel.
**SAY:**
> Everything I showed you, checkable right now: the findings, the repos, the rescan time, the
> hand-audit — zero false alarms in the sample. Pick any finding, open the file, check us.
> Three asks: merge the open pull requests — they're green. Approve a two-week support
> shadow-pilot — that gets us the measured triage number. And re-enable the AI subscription so
> the learner companion gets its voice back — everything you just saw ran without it.
> Thank you — questions welcome.

**Q&A:** the printed **/qa.html** sheet has every anticipated question with the honest answer.
If it's not on the sheet: *"let me verify and come back to you"* — that IS the product philosophy.

---

## 🧯 RESCUE

| Problem | Fix |
|---|---|
| Page looks stuck | F5 — every page reloads to a sane state; the act strip keeps your place |
| Act 1 lab state weird | Help tab → "reset the simulated lab state" |
| Sample won't load in Act 2 | Drag the same file from the `Demo-Uploads` folder instead |
| CAF repo dirty after live beat | **DEMO_REVERT_BUG.cmd** → Rescan live → baseline count |
| Everything died | Close windows → **START_DEMO.cmd** (~1 min, readiness check confirms) |
| Hard question | Q&A sheet → or "let me verify and come back" |

## OPTIONAL EXTRAS (never in the main flow — linked from home/receipts, labelled OPTIONAL)

- **/amnesty.html** — The Guardian: restores wrongly-failed learners behind five gates; refuses
  without a named human (live HTTP 400). SIMULATED mirror of the write endpoint.
- **/intent.html** — The Scholar: step intent extracted from real guides, every fact quote-anchored.
- **/backstage.html** — second screen only: the engine's live decision feed.
- **/qa.html** — the printable Q&A sheet (this replaces the old voice Wingman).

## VIDEO TRACK (recording only, never live)

`/rail.html` (projector) + `/presenter.html` (your screen) — scripted hands-free tour, spoken
lines in `docs/demo_speaking_script.md`. Its captions carry numbers as recorded; re-check them
against `/receipts.html` before recording a new take.

## OPS NOTES

- **Ports:** server on :5173. `EADDRINUSE` → an old server is running; the readiness check
  verifies the running server matches this checkout (`/api/version` vs `git rev-parse`).
- **AI model:** off by design until a key is placed in `source/rocky-prototype/.env.local`
  (both key fields are currently empty). Every surface degrades honestly without it.
- **Real labs folder:** override with `REAL_LABS_DIR` env var if the OneDrive path moves;
  without it the cached scan serves and the live-rescan beat is skipped (advisory ⚠, not red).
- **Ecosystem feeds:** the Act 3 deadlines panel serves a cached harvest (its date is printed on
  screen; day-countdowns are recomputed at render). To refresh before a big demo:
  `node changeintel/run.js "<labs-root>"` from `source/rocky-prototype`.
- **State:** server state is in-memory. Restart = clean slate; Act 1 reset button restores the
  broken-lab fixture; monitor has its own Reset timeline button.
