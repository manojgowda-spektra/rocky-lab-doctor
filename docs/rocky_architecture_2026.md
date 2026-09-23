# Rocky — a real-time lab companion. Architecture, measured.

**Date:** 23 September 2026
**Status:** research complete, measurements taken on this machine, architecture proposed
**Supersedes:** the Clicky-inspired framing in the brief

---

## The short version

Three things in the brief turned out to be wrong, and each one makes Rocky *easier* to build.

1. **Clicky does not do what the brief says it does.** It is macOS-only and vision-based. It
   does not use Windows UI Automation. No Windows cursor-agent using UIA could be found at
   all — the concept is a conflation of two different projects.
2. **Screenshots are not the slow part.** Measured here: a full screen capture is 65 ms while
   a UIA tree scan of a browser window is 849 ms. The accessibility tree is the *slower*
   option on Windows, not the fast one.
3. **For browser labs, neither is the right answer.** The DOM does the same job in **1 ms**,
   measured end to end on a live page, including matching and coordinates.

The architecture that follows is therefore not "Clicky for Windows". It is a **latency
hierarchy**: use the cheapest surface that can answer the question, and treat vision as the
last resort rather than the foundation.

---

## 1. What was measured

All figures from this machine (Windows 11, 1920×1200), medians over repeated runs. Scripts in
`test/`. Nothing below is taken from a datasheet.

### Screen understanding, per observation

| Method | Median | Notes |
|---|---:|---|
| **DOM: full pipeline** (extract → match → coordinates) | **1.0 ms** | live page, shadow DOM pierced |
| DOM: interactive extraction only | 2.9 ms | 66 controls |
| DOM: change signature (poll) | 0.2 ms | the "did anything change?" question |
| DOM: `elementFromPoint` (hover) | 0.1 ms | Explore Mode's core operation |
| UIA: focused element + 3 properties | **2.8 ms** | the fast UIA path |
| UIA: focused element's siblings (15) | 14.9 ms | "what can I click near here" |
| Screen capture (bitmap) | 65 ms | |
| Screenshot via CDP | 157 ms | 172 KB |
| Capture + PNG + base64 | 125 ms | 320 KB payload |
| UIA: filtered scan (onscreen + interactive) | 319 ms | 44 of 470 elements |
| UIA: full tree scan, browser window | 849 ms | 470 elements |
| UIA: full tree scan, File Explorer | **1,887 ms** | **only 64 elements** |

### Why UIA is slow, precisely

A single UIA property read costs **0.15 ms** because it is a cross-process COM call. The cost
is paid **per call**, not per element:

- 470 elements × 3 properties ≈ **215 ms** in round-trips alone.
- File Explorer's 64 elements cost 1,887 ms — *worse per element than Chrome's 470*. Tree size
  is not the variable; call count is.

**A caching request made it worse, not better** — 3,341 ms against 1,549 ms uncached. This is
the opposite of the documented intent and worth knowing before anyone "optimises" that way.

**The conclusion is not "UIA is slow".** It is: *UIA is slow when scanned and fast when
queried.* Focus-scoped access is 2.8 ms — **300× cheaper** than a tree scan. Any design that
enumerates the tree is wrong; any design that asks about the focused element is fine.

### Payload cost, which is really latency cost

| Path | Bytes | Tokens |
|---|---:|---:|
| DOM extraction of 66 controls | 5 KB | ~1,285 |
| Screenshot 1920×1080 | 172 KB | ~1,100–1,500 *just to see it* |

A screenshot costs a comparable number of tokens **and** a network round trip **and** gives
back no element identity — only pixels a model must then localise.

---

## 2. What the research found

### Clicky, corrected

| Claim in the brief | Reality |
|---|---|
| Uses Windows UI Automation | **No.** macOS only; ScreenCaptureKit screenshots + macOS accessibility |
| Represents a Windows pattern to copy | The Windows "Clicky" repos are unofficial forks; **all use screenshots + vision** |
| Proven approach with known latency | **No latency figures published anywhere**, for any variant |

The genuinely reusable engineering in those forks is their **DPI-scaling and multi-monitor
coordinate mapping** — a real problem that any overlay must solve.

### The accuracy evidence is split, and the split is instructive

**WindowsAgentArena ablation** (the strongest single data point): adding the UIA tree to
pixel detection improved task success **+15% to +57% relative**. Best configuration was
OmniParser + UIA at 19.5%.

**OSWorld-Human latency study** (UCSD, the only dedicated CUA latency work): accessibility
tree generation alone takes **3 to 26 seconds**; WindowsAgentArena's own authors say UIA
queries can take "from a few seconds up to several minutes."

**And the decisive finding for Rocky:** in that study, **LLM calls are 76–96% of task
latency. Grounding is 1.8–3.9%.**

> Optimising perception is optimising the wrong thing. The model call is the cost.

This is why the architecture below is built to **avoid model calls**, not to speed up
screen reading.

### Where the industry landed

| System | Perception | OSWorld |
|---|---|---:|
| OpenAI CUA / Operator | pure vision | 38.1% |
| Anthropic Computer Use | screenshots only | 14.9–22.0% |
| UI-TARS-2 | native vision | 47.5% |
| **UFO2 (Microsoft, Windows-specific)** | **hybrid UIA + vision** | 28.6–32.7% |
| Agent S3 + bBoN | hybrid + best-of-N | 66–72.6% |

Two things matter here. General agents went **pure vision**. The one built specifically for
Windows went **hybrid** — and still attributes **62% of its remaining failures to control
detection**, because "some applications render critical controls using non-standard toolkits
that bypass UIA entirely."

**Human baseline on these benchmarks is 72.4%.** The best autonomous agents have only just
reached it, at 100 steps per task and multiple rollouts. This is the single most important
fact for the autonomy decision in §6.

---

## 3. The constraint that decides everything: the RDP boundary

CloudLabs streams the lab VM's desktop into the learner's browser. Verified against primary
vendor documentation:

- **Apache Guacamole** renders to HTML5 canvas layers. The protocol carries drawing, streaming
  and input instructions. **No instruction carries window titles, control types or
  accessibility data.**
- **Amazon DCV** — AWS's own words: "streams **pixels and not geometries**."
- **Azure Virtual Desktop HTML5** — canvas + WebSocket, requires AVC and WebGL. A video stream.

**Therefore:**

```
Learner's own machine                     Lab VM (Windows)
┌──────────────────────────┐              ┌──────────────────────────┐
│ browser                  │              │  Azure portal in Edge    │
│  ├─ lab guide pane  DOM ✓│              │  VS Code            UIA ✓│
│  └─ remote desktop       │◄──pixels─────│  File Explorer      UIA ✓│
│       = PIXELS ONLY ✗    │              │  the actual work         │
└──────────────────────────┘              └──────────────────────────┘
```

An extension on the learner's machine can read the **guide** but not the **work**. An agent
inside the VM can read the work but has no native access to the guide pane, which lives
outside the VM.

**This is the whole architectural problem**, and it is why the existing build reads the guide
*from inside the VM* through the browser window — which is correct and should stay.

### One documented escape hatch, worth knowing

Guacamole's RDP `static-channels` parameter opens named pipes between an application in the VM
and browser JavaScript. Guacamole's manual says explicitly: *"If you wish to communicate
between an application running on the remote desktop and JavaScript, this is the best way to
do it."* Client API: `Guacamole.Client.onpipe` / `createPipeStream`. Limit: 7-character channel
names, chunk large payloads.

**Do not design on this yet.** It requires a CloudLabs-side connection-parameter change, and
which remoting stack CloudLabs actually uses is unconfirmed. Record it as the upgrade path if
a guide↔VM channel is ever needed. **Do not** build on DCV extensions (unsupported in web
clients) or RDP RAIL (data never reaches JS).

---

## 4. The architecture

### Principle: a latency hierarchy, not a pipeline

Each layer answers what it can and escalates only what it cannot. **Cost rises by roughly 100×
per layer, so each layer must eliminate most of the traffic to the next.**

```
                                          cost        how often it runs
 L0  CHANGE DETECTION                     0.2 ms      continuously (2 Hz)
     DOM signature / UIA focus event      ──────────────────────────────────
     Did anything change at all? 95% of the time: no. Stop here.
                        │ change detected
                        ▼
 L1  STRUCTURAL READ                      1–3 ms      on change only
     DOM extraction, or focus-scoped UIA  ──────────────────────────────────
     What controls exist, where, named what? Never a tree scan.
                        │
                        ▼
 L2  DETERMINISTIC MATCH                  0.1 ms      on change only
     score vs the step's target           ──────────────────────────────────
     0.70 floor, 0.20 margin, no contradicted attribute.
     RESOLVED → glow it. Done. No model was involved.
                        │ ambiguous or absent
                        ▼
 L3  WORKFLOW / TASK GRAPH                ~1 ms       on ambiguity
     where are we in the lab?             ──────────────────────────────────
     Page N of the guide, step M, prerequisites met? Often resolves the
     ambiguity without a model: "two 'Create' buttons, but the guide is on
     the Networking tab, so it is that one."
                        │ still unresolved
                        ▼
 L4  MODEL REASONING                      300–2000 ms rare (target <5% of steps)
     small model first, large on escalation ────────────────────────────────
     Gets TEXT (the 5 KB control list), not pixels. Shapes the QUERY;
     never chooses the glow. L2 still adjudicates the answer.
                        │ model cannot ground it either
                        ▼
 L5  VISION / OCR                         150–800 ms  last resort
     screenshot + Set-of-Mark              ─────────────────────────────────
     Only when structure is genuinely absent: canvas apps, an RDP frame,
     a custom-toolkit control. Set-of-Mark because it is the best measured
     latency-to-accuracy trade available (near-zero overhead, and it
     usually REDUCES step count).
                        │ nothing worked
                        ▼
 L6  HONEST REFUSAL                       0 ms
     "I can see the page but I cannot find 'Default permission'. It may be
      under the ... menu." — naming what it cannot do beats a wrong glow.
```

**The budget this produces**, if 95% of observations stop at L0 and 95% of changes resolve at
L2:

| | |
|---|---|
| Typical observation | **0.2 ms** |
| Typical change → glow | **~4 ms** |
| Ambiguous case | ~5 ms (L3) |
| Genuinely hard case | 300–2000 ms (L4) |
| Model calls per lab session | tens, not thousands |

### Per-surface routing

The layer stack is the same everywhere; the *implementation* of L0/L1 changes by surface.

| Surface | L0 change | L1 read | Measured |
|---|---|---|---|
| **Browser page** (portal labs) | DOM signature | DOM extraction | **0.2 / 2.9 ms** |
| **Native app in VM** (VS Code, dialogs) | UIA focus event | focus-scoped UIA | **~0 / 2.8 ms** |
| **Terminal** | text buffer diff | console API | — |
| **RDP frame** (agent outside VM) | frame hash | **L5 vision only** | 150–800 ms |

The last row is the honest one: if Rocky ever runs *outside* the VM looking at a streamed
desktop, there is no structure and vision is the only option. **That is the case to avoid by
deploying inside the VM**, which the current build already does.

---

## 5. Answering the brief's questions directly

**Primary method?** DOM for browser labs; focus-scoped UIA for native. Not screenshots, and
not UIA tree scans.

**Fallback?** In order: workflow context (L3) → model on the text control list (L4) →
Set-of-Mark vision (L5) → refusal (L6).

**When one fails?** Each layer has a defined escalation and the final fallback is *saying so*,
never a guess. The 0.70/0.20/no-contradiction contract adjudicates at every level, so no layer
can cause a wrong glow — including the model.

**How to keep latency in milliseconds?** Three things, in order of impact:
1. **Do not call a model.** It is 76–96% of latency in every measured system. The layer stack
   exists to make model calls rare, not fast.
2. **Never scan a tree.** Query the focused element (2.8 ms) instead of enumerating (849 ms).
3. **Send text, not pixels.** 5 KB of named controls beats 172 KB of image that still needs
   localising.

**Is the Clicky approach viable?** The *form factor* yes; the *architecture* no. A floating
cursor companion is a good UX. Building it on screenshots + a vision model would put every
interaction on a 300–2000 ms path for work the DOM does in 1 ms.

---

## 6. Autonomy: guide only, and this is not a close call

**Recommendation: Rocky highlights and explains. He does not move the cursor, click, or fill
forms.** Not in v1, not in v2, and in enterprise training labs probably not ever.

The reasons are evidential, not cautious:

1. **The best autonomous agents reach ~72% on OSWorld, which is human baseline — at 100 steps
   per task with multiple rollouts.** A 28% failure rate is catastrophic in a lab a learner is
   being assessed in.
2. **UFO2, the Windows-specific system, attributes 62% of its failures to control detection** —
   the exact operation an auto-clicker depends on being right.
3. **It destroys the product's purpose.** A learner who watches Rocky click has learned
   nothing. Your own constraints say this: *"default behaviour is scaffolding, not spoiling."*
4. **It converts every bug into an incident.** A wrong glow wastes ten seconds. A wrong click
   in a Power Automate trigger silently breaks the rest of the lab — and Rocky did it, not the
   learner.

There is one safe middle step if it is ever wanted: **scroll the target into view**. It is
reversible, harmless, and removes the most common "I cannot find it" case. Nothing beyond that.

## 7. Confidence model

The existing contract is already right and should not be re-invented:

| Confidence | Test | Behaviour |
|---|---|---|
| **High** | score ≥ 0.70, margin ≥ 0.20, no contradicted attribute | Glow it. Say why in one line. |
| **Medium** | score ≥ 0.70, margin < 0.20 | **Do not glow.** Name the candidates: "two things called Create — the one under Networking?" |
| **Low** | score < 0.70 | Do not point. Say what is missing and offer a known state to return to. |

"Contradicted attribute" is the load-bearing part: if the guide says *button* and the best
candidate is a *link*, that is not a weak match, it is a **different control**, and the score
is discarded rather than reduced. This is what makes a wrong glow structurally impossible
rather than merely unlikely.

**Everything above applies to model output too.** L4 shapes the query; L2 still adjudicates.
A model cannot talk Rocky into pointing at something.

## 8. UI: hybrid, and mostly invisible

**Recommendation: Option D — overlay-first, with a cursor companion only during an active
point.**

- **Ambient state: nothing.** A small, dismissible presence in a corner. The measured budget
  makes continuous watching free, so there is no reason to prove it by talking.
- **When pointing: the glow is the product.** A ring on the actual control, in place. This is
  the thing CloudLabs Copilot structurally cannot do, and it needs no chat window.
- **A cursor companion only while pointing** — a marker that travels to the target and stops.
  Borrowed from Clicky's form factor, which is genuinely good, without its architecture.
- **Text only when there is something to say**, anchored near the control, one or two lines.
- **Chat exists but is not the interface.** It is where a learner asks a question, not where
  guidance is delivered.

The interruption budget already built (8 per session, 12 s minimum gap, backing off when
dismissed) is the right instinct and should govern all of it.

### Explore Mode

Measured at **0.1 ms** per hover in the DOM and **2.8 ms** via focus-scoped UIA, so it can run
on genuine hover with no polling and no perceptible delay.

- Hover → identify (L1) → explain.
- **Cache aggressively.** "What is a Resource Group" has one answer; it does not need a model
  call per hover. A local dictionary covers the common Azure/M365 nouns; the model fills gaps
  and its answers are cached.
- One or two sentences, beginner-level, then stop.
- Off by default, toggled deliberately, because hover-to-explain is delightful when wanted and
  maddening when not.

## 9. Lab understanding

Unchanged in principle from the current build, which is already right: **parse the guide,
build an ordered task graph, never guess a target.**

```
guide pane text
   ├─ instruction lines → ordered click targets, with authored (1)(2)(3) order
   ├─ surface classification → browser / VS Code / terminal / dialog
   ├─ prerequisites and validations → what must be true before and after
   └─ page position → where the learner is now
```

Two additions worth making:

1. **Position tracking, not just step parsing.** The brief's example is right: for "Create a
   Virtual Machine", Rocky must know whether the learner is on Azure Home, a resource group,
   the VM list, the creation wizard, or Review+Create. That is L3, it is cheap, and it is what
   turns a step list into guidance.
2. **Expected-state assertions.** "After this step the portal should show a resource named X."
   This is how mistakes and dead ends are detected without watching for errors specifically.

**Where a model genuinely helps** — and this is the honest scope of AI in Rocky:
- Steps written for a human to interpret ("select the most appropriate label"), where the
  correct behaviour is usually to explain the criterion rather than point.
- Free-text questions from the learner.
- Diagnosing an unexpected error against the CloudLabs knowledge corpus.
- Ambiguity that L3 could not resolve.

Not: deciding what to glow.

## 10. Build order

**MVP — the demo.** Mostly exists. What is missing is the wiring.
1. Wire the guide reader's targets into the resolver so guidance follows the guide with no
   captured bundle. *(Built and gated; not yet driving the extension.)*
2. L0 change detection on the DOM signature (0.2 ms) as the observation loop.
3. L3 position tracking — which guide page, which step, which portal blade.
4. Explore Mode on the DOM path with a cached local dictionary.

**V1 — the whole VM.**
5. Rewrite the desktop agent from scanning to **event-driven, focus-scoped** UIA. The current
   agent scans; the measurements say that is 300× more expensive than necessary.
6. Route by surface: browser steps to the extension, desktop steps to the agent.
7. Set-of-Mark vision at L5, for canvas and custom-toolkit controls only.

**V2 — production.**
8. Expected-state assertions and mistake detection.
9. The Guacamole `static-channels` bridge, *if* CloudLabs confirms the stack.
10. Telemetry on refusals — every "I cannot find it" is a lab that changed or a parser gap, and
    that is the feedback loop that keeps Rocky honest as portals drift.

## 11. Risks

| Risk | Reality | Mitigation |
|---|---|---|
| **Portal drift** breaks matching | Certain. Azure ships weekly | Contract refuses rather than mis-points; drift gate already tests rename/duplicate/disable |
| **Model latency in the demo** | 300–2000 ms when it happens | Layer stack makes it rare; pre-warm; never block a glow on a model |
| **UIA misses custom controls** | Measured reality: UFO2's 62% failure mode | L5 vision fallback, then honest refusal |
| **Enterprise objects to screen reading** | A process reading other apps' UI is a real security conversation | Runs as the learner, reads only, clicks nothing; `SC-001` telemetry-only mode must stay possible |
| **Demo lab is the wrong shape** | Measured: the Purview lab yields 17 glowable targets, 100% browser; the IQ workshop is VS Code-heavy | Choose a portal lab; the measurement harness exists to check any candidate |
| **Guacamole channel assumption** | Stack unconfirmed | Not on the critical path; upgrade only |

---

## What I would change about the brief

- **Drop Clicky as the model.** Its form factor is worth borrowing; its architecture would
  make Rocky slower and less accurate than he already is.
- **Stop treating screenshots as the enemy and accessibility as the cure.** Measured here, the
  screenshot is 65 ms and the accessibility scan is 849 ms. The real distinction is
  **scanned vs queried**, not vision vs accessibility.
- **Aim the optimisation at model calls, not perception.** 76–96% of latency in every measured
  system. Perception is already essentially free if done correctly.
- **Reconsider "Rocky should use AI continuously."** The most useful thing Rocky does — point
  at the right control in 1 ms and refuse when unsure — is better without a model. AI should be
  the *exception path*, and it will feel faster and be more trustworthy for it.
