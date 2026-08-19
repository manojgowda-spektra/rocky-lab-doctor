# 🎬 ROCKY GUIDED DEMO — MASTER SCRIPT (do + say)

*One screen, four stages: **Select → Diagnose → Fix → Verify.** You drive every step by clicking —
nothing moves without you. The right-hand panel narrates what the engine is doing, live.
Total: 6–8 minutes + Q&A. The dashboards come after, in order, from the "bigger picture" cards.*

---

## BEFORE THE MEETING (5 min)

| # | DO |
|---|---|
| 1 | Double-click **START_DEMO.cmd** — starts server, runs the readiness check, opens demo + Wingman + Demo-Uploads |
| 2 | Confirm the readiness check says **ALL CHECKS GREEN** |
| 3 | Wingman → **🎙️ Start listening** → hide it BEHIND the demo window. Phone: open the wingman-view URL |
| 4 | Teams → Do Not Disturb. Demo window → **F11**. Share → **Entire screen** |

---

## OPENING (on the Select screen)

**SAY:**
> This is Rocky — the reliability layer for our hands-on labs. Labs break silently: the cloud
> changes underneath them even when nobody edits the guide — a model gets retired, a product gets
> renamed, a translation drops a token — and a learner at 2 a.m. pays for it. Let me show you
> exactly how Rocky works, step by step. Everything on this screen is real — real guides, the real
> engine, live — and later, anything simulated is labeled simulated, on screen. The panel on the
> right shows you what Rocky is doing at every moment — nothing is hidden.

---

## STAGE 1 · SELECT — pick the broken lab

**DO:** Point at the three cards.
**SAY:**
> These are three real guides from our production labs. One tells learners to deploy a retired AI
> model. One is a translation that silently lost the learner's login tokens. And one is perfectly
> fine — that one matters too, you'll see why.

**DO:** Click **AI-Developer · Challenge 05**.

## STAGE 2 · DIAGNOSE — it finds the issues

**DO:** Nothing — the scan runs; findings appear. Point at the activity panel while it works.
**SAY:**
> Rocky is scanning it right now — watch the activity panel: retired models, renamed products,
> end-of-life runtimes, broken images, translation tokens. This is the exact same engine that
> found 133 real issues across our 8 production repos. And there they are: the guide tells
> learners to deploy text-embedding-ada-002 — a model on Azure's retirement path — with the exact
> file and line. No AI decided this; it's a deterministic match, so it's never a hallucination.

## STAGE 3 · FIX — click Fix, see the draft

**DO:** Click **🛠 Fix** on the first finding. Point at the red/green diff.
**SAY:**
> I click Fix — and Rocky drafts the exact change: old line in red, new line in green — the
> retired model replaced with its supported successor, every occurrence in the guide. Two
> important things. First: this is a draft on a copy — the original file is untouched. In
> production this becomes a pull request that a human reviews and merges; Rocky has already
> produced five real pull requests this way, two are merged. Second: Rocky only fixes what can be
> fixed mechanically. Anything needing human judgment becomes a suggestion, not a silent change.

**DO:** Click **🛠 Fix everything fixable** (finishes the rest), then **Verify →**.

## STAGE 4 · VERIFY — the before/after proof

**DO:** Let the re-scan land. Point at BEFORE → AFTER.
**SAY:**
> And here's the part most tools skip: Rocky doesn't claim the fix worked — it re-runs the same
> scan on the fixed copy, live. Before: three issues. After: zero. Same guide, provably healthy.
> That's our rule — we never fake green. Green means re-scanned and verified.

**DO:** Click **⬇ Download the fixed guide** (show the file lands).
**SAY:**
> And the fixed guide is right here — ready to open as the pull request.

## ENCORE 1 — the translation story (30s)

**DO:** Click **↻ Run another lab** → click **RTIAD Workshop · Lab 1 (EN + JA)** → when the finding appears, click **💡 Suggest** → then **Verify →** (it honestly shows: 1 issue remains — needs a human).
**SAY:**
> One more, because it's unforgettable. This is a real guide in English and Japanese. Rocky
> compares them and finds the Japanese translation lost the learner's login tokens — a Japanese
> learner is literally told to type the placeholder word as their username. And notice: Rocky
> does NOT auto-fix this — placing tokens in translated sentences needs a translator. It tells
> you exactly which keys are missing and hands it to a human. Honesty over automation.

## ENCORE 2 — the clean lab (15s)

**DO:** On the Verify screen click **↻ Run another lab** → click **CAF Infra Security · Intro**.
**SAY:**
> And the clean one: Rocky says clean. A tool that flags everything is useless — three of our
> eight production repos came back clean, and that's exactly why you can trust the findings.

*(Optional, if the audience is engaged: "hand me any lab guide" — drag anything they give you
into the drop zone. Same engine, live.)*

## THE BIGGER PICTURE — dashboards, in order

**DO:** On the Verify screen, click the cards left to right (each opens in a new tab; close after each).
**SAY (one line each):**
1. **Fleet dashboard** — "This is everything at once: all 8 repos, 133 findings, plus a labeled digital-twin fleet where we prove the riskier logic safely."
2. **Fix campaigns** — "133 findings collapse into 13 root causes — the top three cover 62%. That's a backlog you can actually merge."
3. **The Watcher** — "Testing once is a photo; this is the movie — continuous sweeps that alert only on change and detect recovery on their own." *(labeled simulated)*
4. **The Guardian** — "When a broken check wrongly fails learners, Rocky can restore them — behind five gates and a named human. No name, it refuses — live." *(the restore runs against a simulated mirror — labeled on screen; production writes are gated)*
5. **Receipts** — "And every claim I made today is on this page, checkable: the PRs, the CI gate that blocked a planted bug in 4 seconds, the zero-in-42 false-alarm audit."

## CLOSE

**SAY:**
> So that's Rocky, end to end: pick any lab — it finds what's broken — drafts the fix — a human
> approves — and it proves the fix worked by re-scanning. The engine asserts, the AI narrates,
> and we never fake green. Three small asks: merge the three open pull requests — they're green;
> approve a two-week support shadow-pilot so we get the business number; and re-enable the AI
> subscription so the learner companion gets its voice back. Thank you — questions welcome.

**Q&A:** repeat each question out loud ("So the question is…") → answer appears on your **phone** → say it in your own words.

---

## 🧯 RESCUE

| Problem | Fix |
|---|---|
| Page looks stuck | F5 → it resets to Select (10 seconds lost, nothing more) |
| Sample won't load | Drag the same file from the Demo-Uploads Explorer window instead |
| Everything died | Close windows → **START_DEMO.cmd** (~1 min) |
| Hard question | Phone (Wingman) → or: "let me verify and come back" |

*Three sentences if you forget everything: 1) Labs break silently because the cloud changes.
2) Rocky finds it, drafts the fix, a human approves, and it re-scans to prove it. 3) Everything
is labeled real or simulated — we never fake green.*
