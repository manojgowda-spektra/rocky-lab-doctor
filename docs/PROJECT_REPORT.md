# Rocky — Project Report

**The reliability layer for hands-on cloud training labs**
Spektra Systems / CloudLabs · Report date: 2026-07-14

> Rocky's promise, in one line: **"The engine asserts; the AI narrates. We never fake green."**

---

## 1. Executive summary

CloudLabs ships hands-on cloud training labs, and those labs quietly break over time even when nobody changed them — a cloud vendor renames a product, retires a model, or shifts a default, and a lab that worked last month now strands a learner at 2am with no explanation. Rocky is one system that does three jobs about this problem: it **finds** the breakage by reading the lab guides and watching learner results, it **fixes** it by drafting a change that a human approves on GitHub and then verifying the fix actually worked, and it **helps** the learner in the meantime with an in-lab companion that answers only from evidence. Pointed at 8 of our real production lab repositories (268 guide documents), Rocky found **133 real defects** — and correctly reported that **3 of those 8 repos were completely clean**, which is how you know it is not just crying wolf. It has already opened **5 real pull requests on GitHub, 2 of them merged**, and it planted-and-blocked a repeat mistake in **4 seconds**. The design principle that makes it trustworthy is strict: a deterministic engine decides every finding, and the AI is only ever allowed to write the plain-English explanation around a fact the engine already proved — so Rocky can honestly say "I don't know" instead of inventing an answer. Two honest caveats up front: the conversational AI chat is switched off today because the Azure subscription holding its language-model resource is disabled (the rest of Rocky works and degrades gracefully), and the fleet-health dashboards run on a clearly-labeled simulated "digital twin," not live production data, because we have deliberately not taken production access without approval.

---

## 2. The problem — labs rot silently, and testing alone misses it

A hands-on lab is not a video; it is a live set of instructions that reaches out into a real cloud. The lab can be perfectly written and still stop working, because the world underneath it moves: a vendor renames "Azure AD" to "Microsoft Entra ID," retires an AI model, ends support for a runtime, or changes which region is the default. Nobody edited the lab — and yet the learner now hits a wall.

Two ideas explain why ordinary testing does not catch this.

**The photo vs. the movie.** Testing a lab once, before you publish it, is a photo: it proves the lab worked *at that instant*. But a lab lives for months and the ground shifts underneath it. What you actually need is the movie — something watching continuously, so that the day the world changes out from under a lab, you find out that day, not from an angry support ticket three weeks later.

**The lying check.** Worse than a lab that fails is a lab whose own validation check reports success while the learner's environment is actually broken. The check says green; reality is red. A green checkmark is supposed to mean "this worked" — but a check can pass for the wrong reason, or keep passing after the thing it was meant to verify has quietly stopped being true. If you only trust the checkmark, you will confidently believe a broken lab is healthy. Rocky is built to catch exactly this: it compares what a lab *claims* against independent evidence of what actually happened, and flags the contradiction.

---

## 3. What Rocky is — three jobs, several hats

Rocky is **one system** that does three jobs. For non-technical readers, this is the whole product in three verbs:

1. **FIND** — read the lab documents and watch learner results to catch problems (including the "lying check").
2. **FIX** — draft a repair, let a human approve it on GitHub, verify it actually worked, then block that same mistake from ever coming back.
3. **HELP** — support the learner in the moment with an in-lab companion that answers from evidence and refuses confident-but-wrong advice.

Inside those three jobs, Rocky wears several "hats." Each hat is one focused part of the system, and each is honest about whether what it shows today is **real** (verifiable on GitHub or on disk) or **simulated** (a labeled digital twin used to prove the logic safely).

| Hat | Plain-English job | Which job | Real or simulated today |
|---|---|---|---|
| 🩺 **Doctor** | Scans and diagnoses the labs; the main health view | FIND | **Real** for the document scan (found the 133 defects); the fleet-health dashboard around it is **simulated** (digital twin) |
| 📄 **Scanner** | Reads the lab guide documents looking for rot | FIND | **Real** — this is what produced the 133 findings across 8 real repos |
| 📡 **Watcher** | Watches continuously; alerts only when something *changes*; auto-detects when a lab recovers | FIND / VERIFY | **Simulated** — the demonstrated timeline runs on the twin; the recovery-detection logic is real |
| 🛠️ **Fixer** | Groups many findings by their shared root cause into a short, mergeable to-do list | FIX | **Real** — it groups the 133 real findings into 13 campaigns; the projected fix-impact is clearly labeled *modeled* |
| ⚖️ **Guardian** | Restores learner verdicts that were failed unfairly — only under 5 gates and a named human | FIX / fairness | **Simulated** data; the human-approval gate itself is **real** and live-provable (it refuses when no human is named) |
| 📋 **Scholar** | Extracts the machine-readable *intent* of each lab step from the guide | FIND-support | **Real** — a 2-guide pilot, ~129 facts extracted, every one quote-anchored to its source |
| 🎧 **Listener** | Collapses a flood of support tickets down to a handful of root-cause incidents | HELP / support | **Simulated** — awaiting a real ticket export (74→24 shown on twin data) |
| 💬 **Companion** | The animated in-lab robot that answers the learner in real time | HELP | **Real** deterministic fallback works today; the conversational AI chat is **off** right now (see caveats) |

---

## 4. How it works — the engine asserts, the AI narrates

The single most important design decision in Rocky is a separation of duties:

- **A deterministic engine decides.** Every finding is computed by plain, auditable code — no AI in the loop for the *decision*. If the engine says a guide references a retired model, it is because the engine matched that exact string against a known list, at a known file and line. The same input always gives the same output.
- **The AI only narrates.** The language model is never allowed to decide *whether* something is broken. It is handed a fact the engine already proved and asked only to write a clear sentence about it for a human. If the AI is unavailable, the finding still stands — you just get the engine's evidence card instead of a friendly paragraph.

That is why Rocky can be trusted around leadership decisions: **it never fakes green, and it never invents a problem.** When it cannot verify something, it says "I don't know" rather than guessing.

**Contradiction detection, in plain words.** This is how Rocky catches the "lying check." For a given lab, Rocky holds two things side by side: what the lab's own validation *claims* ("this learner passed") and independent evidence of what actually happened in their environment. When those disagree — the check says pass but the evidence says the learner's storage account is still publicly exposed — Rocky raises a contradiction. It is not trusting the checkmark; it is auditing the checkmark against reality.

---

## 5. What it found — the real results

Everything in this section is **real** and verifiable in GitHub or on disk. Rocky scanned **8 real production lab repositories** containing **268 markdown guide files** and found **133 real defects** (a live re-scan on 2026-07-14 confirmed the count).

Crucially, **3 of the 8 repos came back completely clean** — Rocky said "nothing wrong here" precisely when nothing was wrong. A tool that flags everything is useless; the clean verdicts are what make the 133 findings credible.

**Findings by type (adds up to 133):**

| Type of defect | Count |
|---|---|
| Broken images (screenshots that no longer exist) | 71 |
| Missing credential tokens in translated guides | 16 |
| Deprecated dependencies (old models / commands) | 16 |
| Asset-path case mismatch (works on Windows, 404 on the web) | 12 |
| Renamed products (e.g. old vendor names) | 12 |
| End-of-life runtimes (Node 16 / 18) | 5 |
| Locale release drift | 1 |
| **Total** | **133** |

The localization-related family (**29 findings**) was independently re-audited with different tooling: **29 of 29 confirmed, 0 false positives.** In a separate, hand-audited sample of the scanner's output, the false-positive rate was **0 out of 42**.

### Four concrete findings (quoted with file and line)

**A. The Japanese credential-token story** (the clearest example of silent harm)
`RTIAD-Workshop-April-2026/Japanese/Labguide/Lab-1.md`
The English guide uses **4 `<inject>` tokens** — placeholders the platform fills in with the learner's *real* login credentials at runtime. The Japanese translation of that guide has **zero** of them. So a Japanese learner is literally instructed to type the placeholder word **`RTI_username`** as their username. Their sign-in step then fails, and they have no way to know why — the instruction looked complete. The French, German, Spanish and Portuguese guides are partially affected too, for **16** missing tokens in total. This is the kind of defect a human proofreader skims right past and a photo-style test never sees.

**B. The retired AI model**
`ai-developer/Dotnet/challenges/Challenge-05.md:112`
The guide tells learners to deploy **`text-embedding-ada-002`**, a model on Azure's official retirement path. Learners following it are building on something scheduled to disappear. Rocky drafted the fix (switch to `text-embedding-3-small`), which is open as pull request **ai-developer#5**.

**C. The stale locale release**
`RTIAD` English masterdoc
The English course is pointed at the **April-2026** release, but **30 non-English entries** still point at the **February-2026** release — so every non-English learner is silently served a two-month-old version of the course.

**D. The path-case trap**
`German Lab-2`
The guide references images at `../media/` (lowercase), but the actual folder is `Media` (capital M). All **69** image references work fine on Windows (which ignores case) and return 404 the moment the guide is served from case-sensitive hosting like GitHub. They do not fail one at a time — they all break at once.

Two more for flavor, both real: a broken screenshot reference at `AI-Agents-using-Microsoft-Frameworks/Instructions/Labs/Lab04.md:67`, and an out-of-date product name ("Azure AD," renamed to Microsoft Entra ID back in 2023) still sitting at `OpenAIWorkshop/ARCHITECTURE.md:379`. The same `OpenAIWorkshop` also still tells learners to install **Node.js 16**, which reached end-of-life in September 2023.

---

## 6. The closed loop — find → fix → verify → prevent

Finding problems is only the first quarter. Rocky closes the whole loop. Steps 1, 2 and 4 are proven on
**real** repositories today; step 3's recovery-detection is demonstrated on the **labeled digital twin**
(the detection logic is real; the timeline it runs on is simulated — see §8):

1. **Find** *(REAL)* — the scan above: 133 findings on 8 repos.
2. **Fix** *(REAL)* — Rocky drafts the repair as a real GitHub pull request that a **human** reviews and merges. Nothing is ever applied silently. To date: **5 real pull requests opened, 2 merged.**
   - **Merged:** `MCW#1` — Azure AD → Microsoft Entra ID.
   - **Merged:** `ai-developer#2` — the CI gate itself (see step 4).
   - **Open and green, awaiting merge:** `ai-developer#4` (end-of-life runtimes), `ai-developer#5` (`ada-002` → `3-small`), `OpenAIWorkshop#2` (Node version floors).
3. **Verify** *(SIMULATED timeline, real logic)* — once a fix merges, the **Watcher** confirms the lab actually recovered rather than assuming it. On the labeled digital-twin timeline it auto-detected the recovery on its own, without being told — the recovery-detection logic is real; the timeline it ran against is the simulated twin, not yet a live merged-PR event.
4. **Prevent** *(REAL)* — the merged **CI gate** stops the same class of mistake from re-entering the catalog. We proved it: a regression was deliberately planted into a real repo, and the gate **blocked it from merging in 4 seconds.**

Feeding the loop is **change intelligence** — Rocky watches public feeds (endoflife.date and Azure Updates) so it warns *before* a lab breaks. A real example of the warning it produces: **"Python 3.10 reaches end-of-life in about 118 days"** — together with the exact count of guide files that still reference it.

---

## 7. Trust & honesty design — the moat

Rocky's real competitive advantage is not that it finds problems; it is that leadership can *believe* what it reports. The trust design is deliberate:

- **The engine asserts every finding; the AI only writes prose around facts already computed.** No finding depends on a language model's opinion.
- **Every fix is a draft that a human approves.** Nothing is applied automatically.
- **Every number is labeled real / simulated / modeled**, on every screen. When Rocky cannot verify something, it says "I don't know."
- **Production access was deliberately not taken without approval** — which is the entire reason the labeled digital twin exists.

The evidence that this discipline holds up:
- **0 out of 42** false positives in the hand-audited scanner sample (and 29/29 on the localization re-audit).
- **104 automated tests passing** across **17 test files**.
- A **57-check preflight** runs before any live demo, so what you see on stage is verified first.
- The digital twin has already earned its keep: adversarial simulation against it uncovered **2 real bugs in Rocky's own engine.**

---

## 8. What's real vs. simulated today (the honest table)

| Capability | Status | Basis |
|---|---|---|
| Scanning lab guide documents for rot | **REAL** | 133 findings on 8 real repos, 268 files |
| The 133 findings & the by-type breakdown | **REAL** | Verifiable on disk; live re-scan 2026-07-14 |
| Pull requests / fixes on GitHub | **REAL** | 5 opened, 2 merged |
| The CI prevention gate | **REAL** | Blocked a planted regression in 4 seconds |
| Change-intelligence feeds (EOL / Azure Updates) | **REAL** | Public data feeds |
| Intent extraction (Scholar) | **REAL** | 2-guide pilot, ~129 facts, 100% quote-anchored |
| Automated test suite & preflight | **REAL** | 104 tests / 17 files; 57-check preflight |
| The human-approval gate refusing when no human is named | **REAL** | Live-provable (returns an explicit refusal) |
| Fleet health & learner counts (dashboards) | **SIMULATED** | 12-lab digital twin, labeled on every screen |
| The false-pass & region-drift scenarios | **SIMULATED** | Twin scenarios that prove the engine's logic |
| Fix-impact projections (e.g. health 36→100) | **MODELED** | Explicitly "not executed, pending author merge" |
| Support ticket collapse (74→24) | **SIMULATED** | Twin data; awaiting a real ticket export |
| Amnesty case pool (8 eligible / 2 excluded) | **SIMULATED** | Twin data; the gate behavior itself is real |
| Conversational AI chat | **OFF today** | Subscription disabled (see caveats) |

**What the simulated side demonstrates.** The digital twin is a **12-lab** fleet with an overall health of **84/100**, showing **3 broken labs + 1 on watch** and **142 learners** in the impacted labs. It exists to prove Rocky's logic safely, and it carries the two most important teaching scenarios:

- **The false pass (the "lying check" made concrete):** the lab *"Lock Down a Storage Account"* shows **100% completion** yet is genuinely **broken** — its validation check `F-V2` was silently **passing 23 of 24 learners** whose storage was still publicly accessible (evidence showed `publicAccess: true` where the lab expected `false`). Every one of those learners "passed" a security lab while leaving the door open.
- **The region drift:** in *"Deploy a Resilient Web App,"* **22 of 43 learners** deployed to `eastus` instead of `westus2`, which correlated with a `SkuNotAvailable` error on VM size `Standard_D4s_v5`. Rocky's drafted fix pins the region so the next learner cannot fall into the same hole.

For the fix backlog, Rocky's **Fixer** collapses the **133 real findings into 13 campaigns**, and the **top 3 campaigns cover 62%** of everything — turning a long list into a handful of decisions. The projected effect of clearing them (health **36→100**, completion **9%→81%**) is shown as **modeled, not executed.**

---

## 9. Integration & safe real-world validation

We are not going to point Rocky at live learners on day one. There is a documented **risk ladder — LOW → MEDIUM → HIGH** (`docs/safe_validation_and_integration.md`), and each rung produces the evidence that justifies the next.

- **LOW risk (running today, zero production contact):** scanning our cloned real repos, the labeled digital twin, public feeds, and the CI gate on our own forks. This is where the 133 findings and 5 PRs already came from.
- **MEDIUM risk (next step, needs partner consent, no real learners):** create a **self-owned "Rocky QA" CloudLabs event** — a test tenant built from the platform's own primitives, populated only with **team-owned seats** (no real learners). We run a couple of labs ourselves and point Rocky's read-only data adapter at those seats. This is the first time Rocky sees real API data, and it does so with nobody's learning at stake.
- **HIGH risk (explicitly gated, each needs a named approval):** touching any write path, polling live in-progress events, or restoring real learner verdicts — never before the lower rungs have proven safe.

**Recommended first real-world pilot: a support shadow-pilot.** This is the lowest-risk, clearest-payer starting point, and the underlying tool (the Listener) is already built. Rocky triages incoming support tickets *in parallel* with one support engineer who keeps making all the decisions; we simply measure how much faster the root cause is found. That triage-time delta is the business case, and it never touches a learner's environment.

**Approvals needed to begin:**
- Partner-account owner consent to create the "Rocky QA" test event.
- A support-team owner and a ~2-week ticket export (a CSV is enough) for the shadow-pilot.
- Platform/engineering guidance on API rate limits before any polling.
- Data-privacy sign-off for *any* real-learner data, even read-only and even historical.

---

## 10. Current status & honest caveats

These are stated plainly because hiding them would violate the exact honesty principle the product is built on.

- **The AI chat is off right now.** The Azure subscription that holds the OpenAI resource is disabled (read-only). Re-enabling it needs billing/IT, or Rocky can be pointed at a different OpenAI resource. Everything deterministic keeps working, and the chat **degrades gracefully to a deterministic evidence card** rather than crashing — this is honest, designed behavior, not a failure.
- **The hosted app is stopped.** The Azure App Service deployment is currently stopped (same disabled subscription), so the **local demo is primary** today.
- **Fleet telemetry is the digital twin, not production.** Every fleet number in this report that is labeled simulated comes from the twin. Connecting real CloudLabs data is a configuration change plus the approvals listed above — not a rebuild.

---

## 11. Roadmap / recommended next steps

1. **Unblock the AI chat** — re-enable the disabled subscription or repoint Rocky at a working OpenAI resource, and restart the hosted app. (Billing/IT dependency.)
2. **Get the 3 open PRs merged** — `ai-developer#4`, `ai-developer#5`, `OpenAIWorkshop#2` are green and waiting; merge capacity, not detection, is the bottleneck.
3. **Stand up the "Rocky QA" test event** (MEDIUM rung) — the first real API data, with no real learners at risk.
4. **Launch the support shadow-pilot** — one engineer, a 2-week ticket export, and one measured number: the triage-time delta. This is the recommended first business case.
5. **Roll the CI gate repo-by-repo, advisory first then armed** — prevention compounds; every repo under the gate is one that cannot silently rot again.
6. **Widen change intelligence** — keep the public feeds warning us before labs break, and fold each new warning into the prevention registry with a human vouching for it.

---

*Every real number in this report is verifiable on GitHub or on disk; every simulated or modeled number is labeled as such, consistent with Rocky's core rule: the engine asserts, the AI narrates, and we never fake green.*
