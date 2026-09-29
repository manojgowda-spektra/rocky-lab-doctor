# The live instructor — a plan to beat the Founderz fellow

29 September 2026. A build plan, written after reading every reference we have. Every claim about
what exists is from the code on this machine, not from a README.

---

## 1. What we are beating

Founderz demoed their "AI fellow" on 23 September (transcript 12:36–15:18). Measured from the
transcript, it does five things:

| It can | How |
| --- | --- |
| Talk, both ways | voice chat |
| See the screen | the learner **shares their screen into the chat** |
| Know the Microsoft tools | "we already have the agentic information programmed into it" |
| Say what to click | *"On the left sidebar, under Agents, click New Agent"* |
| Hand over prompts and code | *"let me shape a clear, ready-to-paste prompt"* |

And four things it cannot do, each of which is the thing a learner actually needs at 11pm on day two
of a 48-hour lab window:

| It cannot | Why it matters |
| --- | --- |
| Point | It **describes** the control. The learner still has to find it. |
| Know where the learner is | It sees a frame, not a lab. No step, no history, no "you did that already". |
| Tell done from said-done | Nothing observes the world. If the learner says it worked, it worked. |
| Stay in the lab | It is a second platform. Kelly, 19:24: *"every platform we add increases drop-off."* |

So "better" is not "a nicer voice". It is: **in the lab, pointing, knowing the lab, honest, and
awake when nobody else is.**

---

## 2. What we already have, measured

Four codebases, each holding one piece. None holds the whole thing.

### Persona (`labpilot/persona`) — the body

An instructor in a side panel next to the streamed VM. Furthest along on presence.

- **Layout is exactly the ask**: VM canvas left, a 390 px panel with her on the right (`index.html:26-62`)
- **Face**: any ARKit-rigged GLB; the current head maps 52/52 shapes (`README`)
- **Voice**: Azure `en-US-Serena:DragonHDLatestNeural`, chosen because it is the only generation that returns both the voice and the full 22-shape viseme stream (`speech.py:23-25`); blend shapes ride along with ordinary TTS billing
- **Narration is pre-spoken and cached**: 246 steps → 40 clusters → 292 clips, 22.5 min, $0.35, 166 s to build (`README`, `clusters.py`)
- **Wrong click caught a round trip early**: every click passes through the Guacamole client before the VM sees it (`pointer.js:157-191`)
- **Eyes are honest**: the VM sidecar resolves the control by UIA and reports `doneStepId` only when every postcondition is met (`vm/agent.py:104-110`)

What is wrong with it, from the code:

- **Her mouth is not honest.** `conductor.js:314-326`: wait 9 s, say the cue, wait 30 s, then `this.done.add(st.id); this.si++` **regardless of whether anything happened**. She marks steps done on a timer. This is the single thing Rocky was built to refuse, and it is the first thing to remove.
- **No microphone.** No STT anywhere in the tree. The learner types.
- **Her answers have no evidence discipline.** `/api/ask` sends question + step + 40 control names to a model at low reasoning and speaks whatever comes back (`main.py:147-188`). The prompt says "do not invent UI"; nothing enforces it.
- **Never run against a real VM.** The README says so plainly: *"the credentials are the blocker, not the code."*
- **Her face is not licensed.** The example head is CC BY-NC. *"Before any customer sees her… this is a procurement question."*
- **The voice cache was never committed** — `narration/cache` is empty in the repo; regenerating is 3 minutes and $0.35.

### Our Rocky (`Cloudlabs - Rocky`) — the brain

Everything Persona's mouth lacks. Weak on presence and on coverage.

- **Completion is an observed world change**, never a click and never a timer (`world-model.js`, `completion-engine.js`)
- **Position is a belief over steps** driven by page evidence; a step number is only spoken from `sayable`
- **Every line the model sees is marked** OBSERVED / INFERRED / UNKNOWN (`mentor.js:570-623`), and the system prompt tells it what each mark permits (`background.js` `ROCKY_SYSTEM`)
- **Recovery diagnoses** from the portal's own failure text and says whose fault it is
- **The five questions** — where am I, what did I do, why does it matter, what next, what if I don't — answered from evidence or not at all
- **32 gates**, mutation-tested; runs from GitHub into a real CloudLabs VM (verified 25 Sep)

What is wrong with it: **15 pointable steps** from the Purview guide, parsed live. No voice. No face beyond the sprite. The VM half is a card, not a person.

### The labpilot compiler (`labpilot/labpilot/compiler`) — the knowledge

- masterdoc → bundle: **120 steps, 86 grounded** for the Foundry agents lab; **246** for the MIQ lab Persona runs on
- each target carries a template crop and a normalised location prior from the guide's own screenshots
- 193 gates; the anchor engine has 42 replay gates on DOM resolution alone

What is wrong with it: a compile step per lab, and the tree has been dormant since mid-July.

### clicky-windows — the voice loop

A generic desktop tutor. No lab knowledge at all, but the input side is done.

- **Hold-to-talk**: hold a hotkey, speak, release (`hotkey.py`, `README`)
- **STT** pluggable: faster-whisper (local), whisper.cpp, Deepgram, OpenAI (`companion_manager.py:536-556`)
- **TTS** pluggable: edge-tts (free), OpenAI, ElevenLabs (`:558-570`)
- **Three-tier grounding** — UIA ~5 ms, then offline OCR ~300 ms, then vision-LLM grid as last resort (`ai/hybrid_pointer.py:1-25`), so the model is never asked to guess pixels when the OS can tell it
- **Privacy guard** — refuses to screenshot sensitive windows (`tutor.py:155-164`)
- Drawing tags the model emits and the overlay renders: `[POINT]`, `[ARROW]`, `[CIRCLE:@Save button]` (`config.py` `_TECHNICAL_RULES`)

### Rocky Desktop (`labpilot/labpilot/desktop`) — the rule that stops two Rockys

*"Exactly one surface owns Rocky at any moment."* A ws bridge between the browser extension and a
UIA bridge, so the browser half and the desktop half never both point at once. We re-derived this
rule independently for `rocky-vm.ps1` (Try-Ring does nothing while a browser is in front). Take theirs.

---

## 3. The design

One sentence: **Persona's body, Rocky's brain, the compiler's knowledge, clicky's ears — in a side
panel on the CloudLabs lab page, with nothing a learner has to install and nothing they have to share.**

```
   CloudLabs lab page (experience.cloudlabs.ai)  — already in both manifests
   ┌──────────────────────────────────────────┬───────────────────────┐
   │                                          │  ┌─────────────────┐  │
   │      the VM, streamed by Guacamole       │  │  her face (GLB) │  │
   │      as a <canvas> in this DOM           │  │  lip-synced to  │  │
   │                                          │  │  Azure visemes  │  │
   │   ┌────────┐  ← glow: a div ON the       │  └─────────────────┘  │
   │   │ Save   │    canvas, pointer-events:   │  step · why · next    │
   │   └────────┘    none, mapped from VM px  │  [hold Space to talk] │
   │                                          │  ▸ typed ask          │
   └──────────────────────────────────────────┴───────────────────────┘
        ▲ every click passes through the           ▲
        │ Guacamole client first: a wrong           │ what she says, and whether a step
        │ click is known before the VM sees it      │ is DONE, come only from here ↓
                                                    │
                       ┌────────────────────────────┴──────────────┐
                       │  Rocky's world model                       │
                       │  belief over steps · done-ledger of        │
                       │  OBSERVED world changes · recovery         │
                       │  OBSERVED / INFERRED / UNKNOWN context     │
                       └───────▲────────────────────▲──────────────┘
                               │                    │
               browser half (DOM engine,     VM sidecar (UIA, postconditions)
               portal tabs, 32 gates)        in the machine, reports rectangles
                                                    ▲
                       the compiled bundle: 120–246 grounded steps per lab,
                       narration clustered and pre-spoken once per lab
```

### The rules that make it better, not just louder

1. **She never says done unless the world changed.** Persona's timer-advance is deleted. `done` is
   written only by the world model, from a postcondition the sidecar observed or a DOM change the
   browser half observed. This is a mutation-tested gate from day one, in the style of the 32 we
   already run.
2. **Everything she says about state is marked before the model sees it.** Persona's `/api/ask`
   context is replaced with `mentor.promptBlock()` — OBSERVED / INFERRED / UNKNOWN on every line —
   and `ROCKY_SYSTEM` as the instruction set. The Founderz fellow will confidently tell a learner
   the deployment succeeded because the learner said so. She will say she cannot see it.
3. **She points; she does not describe.** Browser controls glow through the extension's resolver.
   VM controls glow on the Guacamole canvas from the sidecar's UIA rectangle. If neither resolves,
   she says what to look for — she never guesses a position.
4. **One surface owns her at a time.** Rocky Desktop's rule. The side panel is the only face; the
   browser glow and the VM glow are hands, and only one hand moves.
5. **The lab is spoken once.** Cluster narration is pre-synthesised and cached, so the ordinary path
   costs bandwidth. The model runs only for a question nobody could have predicted, and that answer
   is spoken as it streams so first audio is under two seconds.
6. **Voice both ways, interruptible.** Hold-to-talk (Space while the panel has focus, or a mic
   button) → local faster-whisper or Azure STT → her answer. Barge-in stops her mid-word, as
   Persona already does.
7. **Nothing to install, nothing to share.** The panel is injected by the extension into the
   CloudLabs lab page. The VM sidecar is the `rocky-vm.ps1` one-liner we already ship. No screen
   share; the page already holds the screen.

### What she knows

The compiled bundle, not the live-parsed guide. Measured on the Foundry agents lab that is 120
steps against our 15. Coverage was the headline weakness in the 25 September release report; the
compiler is the answer to it, and it already exists. Cost: one compile per lab, with the QA pass
the playbook describes.

---

## 4. Phases

Each phase is briefed, approved, built, measured, reported — the working agreement. Effort is for
one engineer with the references open; it is not a promise.

### Phase 0 — decisions, before any code (this week)

| Decision | Owner | Why it blocks |
| --- | --- | --- |
| **The face.** Commission or license an ARKit head (Avaturn, Avatar SDK, or a bought asset). | You | The current head is non-commercial. Swapping is one line; choosing is not ours. |
| **The voice.** DragonHD Serena, or another DragonHD voice — it must be that generation for the viseme stream. | You | Everything downstream is cached per voice. |
| **The first lab.** Purview (ours, 15 steps, live-verified), Foundry agents (120 compiled, never run live), or MIQ (246, Persona's). | You | The demo lab decides which grounding path is exercised first. |
| **Revoke the committed tokens** in `kirangowdat-spektra/labpilot`. | Kiran | Nothing here uses them; they are still live. |
| Azure Speech key handling: environment only, never on disk, never in the repo. | Me | The lesson from the tokens above. |

### Phase 1 — she appears, and she is honest (≈ 2 weeks)

The side panel on the CloudLabs lab page, driven by Rocky's world model.

- Extension injects Persona's `stage.js` + `face.js` + panel into `experience.cloudlabs.ai` (host already permitted). Main-world script for the Guacamole hook; the panel itself in the isolated world.
- `conductor.js` rewritten: no `waitFor` timer. Advance only on a `done` event from the world model. Stall → cue → **stay**.
- `/api/ask` replaced: `mentor.promptBlock()` in, `ROCKY_SYSTEM` as instructions, streamed answer → TTS → face. Typed questions only in this phase.
- Narration: `clusters.py` + `narrate.py` run over the chosen lab's bundle; `prebuild.py` caches the clips.
- Pointing: browser half glows as today; VM half maps the sidecar's rectangle onto the canvas (`pointer.js` maths, kept).
- **Gates**: never-done-without-evidence (mutation-tested); every spoken state claim traces to an OBSERVED line; first-audio latency on a cached line < 300 ms; on an unpredicted answer < 2.5 s.
- **Exit**: one real learner, one real lab, the whole lab, and a recording.

### Phase 2 — she listens (≈ 2 weeks)

- Hold-to-talk in the panel; STT via faster-whisper locally or Azure Speech (decide on latency measured, not preference).
- Barge-in wired to the mic: speaking over her stops her.
- Wrong click spoken at the Guacamole hop — *"that's Discard, the one you want is two to the right"* — from the resolver's own rectangle, never from the model.
- Recovery: the browser half's `diagnose()` output spoken in her voice, with whose fault it is.
- **Gates**: STT round-trip budget; a wrong click is named within one second; no keystroke, form value or password ever leaves the page (the recording rule we already keep).

### Phase 3 — she carries the whole lab, and reports it (≈ 2 weeks)

- Rocky Desktop's one-owner bridge adopted so VS Code, installers and dialogs are hers too.
- Validators run on her `done` ledger, so completion reporting is per step and evidence-backed — the thing a screen-share chat can never produce.
- Second lab compiled; the compile + QA pass timed and written down as the per-lab cost.
- First cohort. Measured: completion, time-on-step, questions asked, answers judged by a person.

---

## 5. The scorecard we will show

| | Founderz fellow | Ours, after Phase 1 | After Phase 3 |
| --- | --- | --- | --- |
| Sees the screen | if the learner shares it | always, it is the page | always, and the desktop |
| Points at the control | no — describes it | yes, browser and VM | yes, every surface |
| Knows the step | no | yes, belief from evidence | yes |
| Says "done" only on evidence | no | **yes, gated** | yes |
| Marks what it does not know | no | **yes, on every line** | yes |
| Voice out, lip-synced | yes | yes | yes |
| Voice in | yes | typed | **yes** |
| Interruptible | yes | yes | yes |
| Second platform | **yes** | no | no |
| Works at 11pm on day two | no | yes | yes |
| Feeds completion reporting | no | partial | **yes** |
| Cost per lab hour | model on every turn | cached; model only on questions | same |

---

## 6. Risks, in the order they bite

1. **The face licence.** Not engineering. Decided or nothing customer-facing ships.
2. **Persona has never met a real VM.** Phase 1's exit criterion exists for this reason. Budget a
   week for what the real Guacamole client does differently from the mock.
3. **The Guacamole hook from an extension.** `pointer.js` wraps `guacMouse.onmousedown`; from an
   extension that needs a main-world script, and the lab page's client object must be reachable.
   If it is not, the fallback is the sidecar's own click observation, a round trip later — the
   feature survives, the "before the VM sees it" trick does not. Verify in the first two days.
4. **Speech key handling.** One environment variable, held by the server, never by the page. The
   labpilot repo shows what happens otherwise.
5. **Answer quality on the unpredicted question.** Persona's README says it: *"what she says to an
   unexpected question needs a person to judge."* Rocky's context discipline removes the false
   state claims; it does not make every answer good. A person judges fifty of them before a cohort.
6. **Coverage still costs a compile per lab.** Better than 15 steps; not free. The per-lab cost is
   measured and written down in Phase 3, not guessed now.

---

## 7. What I am not proposing

- Not replacing the browser extension or the world model. They are the brain and they are gated.
- Not an Electron overlay inside the VM. Persona's README lists the three bug classes that killed
  it — z-order, focus theft, clicks landing on the overlay — and the canvas-div design cannot have
  them.
- Not a screen-share. That is the thing we are beating.
- Not waiting on the Founderz integration decision. This is the product; that was a customer.
