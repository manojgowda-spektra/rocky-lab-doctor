# Rocky — Spatial Presence & Ambient Life: Behavior State Machine

> Build-ready spec for Rocky's *living presence* layer: idle/ambient state machine, roaming &
> pathing, off-screen exit/reappearance, awareness-implication rules, and strict intrusiveness caps.
> Pairs with the flagship VISUAL/MOTION/AI spec (eyes-as-emotion, 60fps loop, bubbles) — this
> document owns **where Rocky is, how it moves, and how often it does anything.**
> **Created:** 2026-07-01 · Workflow: `rocky-living-presence`

---

## 0. The one rule that overrides everything

**Rocky is furniture that occasionally becomes a teammate — never the other way around.**

Clippy/Bonzi failed not because they moved, but because they *interrupted the primary task,
ignored context, did not respect user agency, and did not remember choices* (windowsforum,
thenewstack, This-vs-That). Bonzi crossed further into hostile/deceptive territory. So every
behavior below is gated by a **budget system** (§6) and obeys **calm-technology**: presence lives
in the *periphery* and only moves to the center when the user invites it or when it has earned a
genuinely useful observation (calmtech.com, principles.design). Motion-based peripheral cues are
specifically the *most effective* low-intrusion awareness signal — so Rocky leans on small motion,
not sound or pop-ups (Calm Technology / Ambient Awareness, ebrary.net).

If you are ever unsure whether a behavior is too much: it is. Cut its probability in half.

---

## 1. Vocabulary & global clock

- **Tick:** the ambient scheduler runs a decision pass every **1000 ms** (decoupled from the 60fps
  render loop — render interpolates between anchors; the brain thinks once per second). Cheap, and
  matches calm-tech "glanceable, not animated-busy."
- **Anchor:** a screen position Rocky can occupy. Anchors are *derived from the real lab UI at
  runtime* (see §3), never hardcoded pixels.
- **Dwell:** how long Rocky stays in a state before the scheduler is allowed to pick a new one.
- **Budget:** a rolling allowance of "noticeable" actions (§6). Idle micro-life is free; anything
  that draws the eye costs budget.
- **User-active vs user-idle:** user-active = input (key/mouse/scroll/lab-event) within the last
  **8 s**. Drives the macro-mode in §2.

---

## 2. Macro-modes (the outer layer)

Rocky is always in exactly one **macro-mode**. Macro-mode sets the *energy ceiling* for the inner
ambient state machine. This is the single biggest distraction control: when the user is working,
Rocky calms down automatically (mirrors NotiSprite/Clawd "sleep when idle / DND" patterns, and the
"60s → doze" desktop-pet convention).

| Macro-mode | Entry condition | Energy ceiling | What Rocky may do |
|---|---|---|---|
| **ENGAGED** | Panel open, or user asked a question, or hovering Rocky | n/a (foregrounded) | Full attention, faces user, no roaming. Ambient machine paused. |
| **ATTENTIVE** | User-active in last 8 s (typing/clicking in lab) | LOW | Tiny idle only (breathe, blink, micro-look). **No roaming, no off-screen, no proactive bubbles** except earned-help (§5). Stays put in a corner. |
| **AMBIENT** | No user input for 8 s–90 s | MEDIUM | Full idle catalog + roaming + look-at-UI. Occasional off-screen. This is "Rocky pottering about while you read." |
| **DROWSY** | No input 90 s–4 min | LOW (winding down) | Slows, yawns, stretches, settles into a corner. Roaming rare. |
| **ASLEEP** | No input > 4 min | MINIMAL | Sleeps in a corner (slow breathe, occasional "z"). **Wakes instantly** (< 200 ms) on any input or lab event. |

**Transitions are debounced:** require the condition to hold for 1 full tick before switching, so a
single stray mouse-move doesn't yank Rocky out of sleep and back repeatedly (anti-flicker).

Rationale: a screen-roamer that keeps moving *while you type* is the #1 cited annoyance and CPU/
distraction complaint for roaming pets (howtogeek, mac-pet). Tying roaming energy to user-idleness
removes that failure mode entirely.

---

## 3. Anchors & "looking at the UI" (awareness substrate)

Rocky must look like it is *paying attention to the lab*, not wandering a blank canvas. NPC
believability research: an idle character that "freezes after finishing an action" reads as
obviously artificial; convincing ambient characters need *idle + locomotion + look-at-points-of-
interest + reaction* (gameaipro Ch.36; mocaponline). So Rocky's world is the lab UI.

**Anchor discovery (runtime, no hardcoding):**
1. On load and on DOM mutation (throttled to every 3 s), scan for candidate **points of interest
   (POIs):** the active step/instruction block, primary action buttons (Deploy/Submit/Validate),
   code/terminal area, validation/status indicators, and screen corners (rest spots).
2. Each POI gets a weight: **active step 0.40, focused input/button 0.25, terminal/output 0.15,
   status/validation badge 0.15, neutral corner 0.05.** Weights bias where Rocky chooses to go and
   what it "looks at."
3. Rocky never overlaps interactive elements: anchors sit in the **margin/gutter** beside a POI
   (offset 24–40px outside the element's bounding box, clamped to viewport). It points its gaze *at*
   the element without covering it.

**Look-at behavior:** independent of body position, Rocky's eyes/head orient toward a chosen POI
(hand off the actual gaze render to the flagship eyes-as-emotion system; this layer only supplies
the target POI + a confidence/curiosity tag). Gaze re-targets on a slow cadence (see `LOOK_AT`
below) so it scans rather than darts.

---

## 4. The ambient idle state machine (inner layer)

Active only in **AMBIENT / DROWSY** (and a tiny subset in ATTENTIVE). Each tick, if current dwell
has elapsed, pick the next state by weighted random — but **weights are conditioned on macro-mode
and on the current POI context** (so Rocky "reacts to" what's near it). This is the standard game-AI
ambient pattern: weighted selection from an idle library with 2–3 variants each + context
sensitivity to avoid the "repetitive = not intelligent" tell (gameaipro; mocaponline).

### 4.1 States, dwell times, base weights

Dwell = uniform random in the given range. Base weight is for AMBIENT mode; multipliers adjust it.

| State | Dwell (s) | Base wt | Visible? (costs budget) | Notes |
|---|---|---|---|---|
| `IDLE_BREATHE` | 3–7 | 28 | no (free micro-life) | Default rest. Sinusoidal bob + blink. The "alive at all times" baseline (mocaponline). |
| `LOOK_AROUND` | 2–4 | 16 | no | Eyes/head scan 2–3 POIs in sequence. Cheap curiosity. |
| `LOOK_AT_POI` | 3–6 | 14 | no | Locks gaze on the weighted-pick POI (§3) — "watching what you're doing." |
| `INSPECT` | 4–8 | 8 | **yes (small)** | Leans toward a POI, "detective" beat (peers, tilts head). Implies investigating. |
| `STRETCH` | 2–3 | 6 | no | Secondary motion; resets the loop, breaks repetition. |
| `FIDGET` | 2–4 | 6 | no | Micro: glance at user area, small hop, look back. 2–3 variants. |
| `REPOSITION` (roam) | travel 0.8–1.6 | 10 | **yes (small)** | Walk/float to a *new* nearby anchor. Pathing in §4.3. |
| `DAYDREAM` | 5–10 | 4 | no | Gaze drifts to a corner, slow. Reads as "thinking." |
| `YAWN` | 2–3 | 3 (DROWSY×4) | no | Winding-down tell. |
| `WANDER_OFF` (exit) | see §4.4 | 2 | **yes (medium)** | Leaves screen. Heavily gated. |
| `PEEK` | 1.5–3 | 2 | **yes (small)** | Pokes in from an edge, watches, may retreat or enter. Charm beat (Shimeji edge-cling lineage). |

**Self-transition damping:** the state you just left has its weight ×0.25 for the next pick (no
"breathe, breathe, breathe"). After any visible state, force at least one free state before another
visible one can be chosen — guarantees quiet between noticeable beats.

### 4.2 Weight multipliers by macro-mode

| State group | ATTENTIVE | AMBIENT | DROWSY | ASLEEP |
|---|---|---|---|---|
| Free micro (breathe/look/fidget/stretch) | ×1 (breathe + micro-look only) | ×1 | ×0.6 | sleep-loop only |
| `INSPECT` / `LOOK_AT_POI` | look-at allowed, inspect ×0 | ×1 | ×0.3 | ×0 |
| `REPOSITION` (roam) | ×0 | ×1 | ×0.2 | ×0 |
| `WANDER_OFF` / `PEEK` | ×0 | ×1 | ×0 | ×0 |
| `YAWN` | ×0 | ×0.5 | ×4 | ×0 |

So in ATTENTIVE (you're actively working) Rocky reduces to: sit in corner, breathe, blink, and
*occasionally glance at what you clicked* — present and aware, zero roaming, zero pop-ups. That is
the entire distraction-safety story in one row.

### 4.3 Roaming / pathing

- **Pick target anchor:** weighted by POI weight (§3) × inverse-distance (prefer nearby; never
  teleport across the whole screen in one hop) × novelty (anchor not used in last 3 hops gets ×1.5).
- **Path:** ease along a gentle curve (quadratic Bézier with a small perpendicular arc) at
  **180–260 px/s**, decelerating into the anchor. Never straight-line robotic, never frantic.
- **Hop budget:** at most **1 REPOSITION per ~25 s** in AMBIENT (enforced by §6 budget, not a hard
  timer, so it feels organic). Travel itself is brief (0.8–1.6 s) so motion is a glance, not a show.
- **Edge affinity (Shimeji heritage):** rest anchors near screen edges/corners are preferred for
  long dwells — Rocky "lives at the margins," keeping the center clear for the lab (shimejis.xyz,
  deviantart FAQ). It may cling to a panel edge or sit on the bottom margin.

### 4.4 Off-screen exit & reappearance (the "I missed Rocky" mechanic)

This is the signature presence beat — and the easiest to overdo, so it is the most strictly gated.

**Eligibility (all must hold):**
- Macro-mode == AMBIENT (never while you're working or while panel open).
- At least **120 s** since the last off-screen event.
- Budget available (§6); `WANDER_OFF` is a *medium*-cost action.
- A "reason" exists for a graceful return (see return-with-purpose below) OR it's a pure-charm exit
  (capped tighter — max once per 5 min).

**Exit sequence:**
1. Telegraph (~0.6 s): glance toward an edge, a beat of "about to go" (so it never just vanishes
   mid-frame — abrupt disappearance reads as a bug, not life).
2. Travel off the nearest sensible edge (or, for the magical variant, step into a **portal** and it
   closes — ties to the "portal" magical moment in requirements).
3. **Hidden dwell:** random **4–12 s** (charm exit) or until the return *reason* is ready (purpose
   exit, e.g. "fetched a hint"). Hard cap hidden time at 15 s — gone too long stops being playful
   and starts feeling broken/abandoned.

**Reappearance:**
- Re-enter from a **different** edge/corner than the exit (the surprise — "reappears elsewhere").
  Choose the new entry near a *currently relevant* POI when there is a purpose, so the return reads
  as intentional ("went and looked at this for you").
- Entrance telegraph: `PEEK` first (~1 s) then commit, OR portal-return for the magical beat. Either
  way Rocky arrives *facing the user/POI*, not back-turned.
- **Interrupt rule:** if the user becomes active *while Rocky is off-screen*, cancel the playful
  return; Rocky quietly re-appears in a corner in ATTENTIVE posture, no fanfare. Never make the user
  wait on a bit.

**Frequency ceiling:** ≤ **3 off-screen round-trips per 10 min**, and absolutely **0** while
ENGAGED/ATTENTIVE. Charm-only exits ≤ 1 per 5 min.

---

## 5. Implying awareness of the user's actions

Awareness is *implied*, not announced. Three escalating tiers; the higher the tier, the rarer and
the more it must be *earned* (Clippy's sin was high-tier interruider on low-quality predictions).

**Tier 1 — Gaze & orientation (free, always on in ATTENTIVE+):**
React to user input *with the body/eyes only, no text.* On click/scroll/keypress in a region, Rocky
*looks toward it* (re-target gaze to the nearest POI to the event) within ~300–500 ms. This single
behavior does 80% of the "it's watching with me" work at zero intrusion cost — it's the calm-tech
peripheral-motion cue (ebrary.net). Cooldown 1.5 s so it doesn't strobe during fast typing.

**Tier 2 — Silent expression beats (cheap, AMBIENT):**
React to *lab state changes* (not raw input) with expression/posture, still no text: deployment
running → `INSPECT` lean + "watching" expression; validation passed → a small bounce/spark; an error
appears → tilt head, "detective glasses" beat. These map to lab events the flagship loop already
emits. Cost: small budget each; max ~1 per 20 s.

**Tier 3 — Proactive utterance (expensive, must be genuinely useful):**
A *floating bubble* with words. Allowed ONLY for:
- Celebrating a *completed section / hard deployment success* (high value, users love it).
- A *gentle check-in* after the user has been idle/stuck a long time (DROWSY/ASLEEP wake).
- An *earned observation*: same mistake ≥ 2–3 times, or unusually fast progress.

Tier-3 rules (this is where Clippy died — respect them):
- **Hard cap: ≤ 1 proactive utterance per 90 s, and ≤ 4 per lab section.** Question-answering
  (user-initiated) does not count against this.
- **Never during active typing** (ATTENTIVE with keystrokes in last 3 s) — defer to the next pause.
- **Always dismissible and self-dismissing** (auto-fade after ~8 s if ignored).
- **Remember dismissals:** if the user dismisses/ignores a given proactive type twice, halve its
  frequency for the session (honors user agency — the explicit Clippy lesson, thenewstack).
- One outstanding bubble at a time; newer high-value beat supersedes a stale low-value one.

---

## 6. The budget system (master intrusiveness cap)

A single rolling budget makes "never distracting" enforceable rather than aspirational.

- **Wallet:** starts at **6 points**, refills **+1 point every 20 s**, capped at 6.
- **Costs:** free states = 0. Small-visible (`INSPECT`, `REPOSITION`, `PEEK`, Tier-2 beat) = **1**.
  Medium (`WANDER_OFF` round-trip) = **3**. Tier-3 utterance = **4**.
- If the wallet can't afford the chosen action, Rocky falls back to a **free** state instead (it
  just keeps quietly breathing/looking). No queuing, no "catching up" later — skipped is skipped.
- **Macro-mode gates spend:** ATTENTIVE caps spend at 0 (free only). ENGAGED bypasses (user asked).
  ASLEEP spends nothing.

Net effect, worst case in pure AMBIENT idle: a noticeable beat roughly every **15–25 s**, a roam
about every **25 s**, an off-screen trip a few times per 10 min, a proactive word at most every
90 s — and *all of it collapses to near-stillness the instant the user touches the keyboard.* That
is the quantitative definition of "delightful but never distracting."

---

## 7. State diagram (text)

```
                 user input / lab event (<200ms wake)
   ┌──────────────────────────────────────────────────────────┐
   │                                                            │
[ASLEEP] ──no input>4m── [DROWSY] ──no input 90s── [AMBIENT] ──input──┐
   ▲          ▲  (yawn,stretch,settle)   ▲ (roam, look-at,        │
   │          └──────────input───────────┘  inspect, wander-off)  ▼
   │                                                          [ATTENTIVE]
   │                                              (corner, breathe, glance only)
   │                                                          │   ▲
   └──────────────────────────────────────────────────────────┘   │
                                                    hover/ask/panel │ panel close
                                                                    ▼ │
                                                              [ENGAGED]
                                                  (faces user, full attention, no roam)

Inner loop (only in AMBIENT/DROWSY), each tick after dwell elapses:
  pick state ~ weighted_random(base_wt × mode_mult × poi_context × novelty),
  damp last state ×0.25, enforce free-state-between-visible, check budget → else free state.
```

---

## 8. What to hand to the flagship VISUAL/MOTION layer

This presence brain is decoupled from rendering. Per tick it emits a small **intent object** the
render layer consumes:

```
{
  macroMode:  "AMBIENT",
  state:      "INSPECT",
  bodyTarget: {x, y},          // anchor in viewport coords (eased toward at 60fps)
  gazeTarget: {x, y},          // POI to look at (eyes-as-emotion system orients)
  emotionTag: "curious",       // hint for the expression engine
  utterance:  null,            // or {tier:3, text, kind:"celebrate", ttlMs:8000}
  budgetLeft: 4
}
```

Render interpolates `bodyTarget`/`gazeTarget` smoothly; the brain never moves pixels itself.

---

## 9. Anti-Clippy / anti-Bonzi checklist (acceptance gate)

- [ ] Rocky **stops roaming and goes quiet** whenever the user is actively typing/clicking. (ATTENTIVE)
- [ ] No proactive text more than once / 90 s; never mid-keystroke. (§5 Tier-3 caps)
- [ ] Every proactive bubble is **dismissible + self-fading**, and **dismissals are remembered**. (agency)
- [ ] Rocky **never overlaps interactive UI**; lives in margins/corners. (§3)
- [ ] Off-screen trips ≤ 3 / 10 min, hidden ≤ 15 s, always telegraphed (no buggy vanish). (§4.4)
- [ ] **Zero sound** by default; awareness is carried by peripheral *motion*, not audio/pop-ups. (calm-tech)
- [ ] A global **"focus / DND"** toggle freezes Rocky to a still corner sprite. (NotiSprite/Clawd pattern)
- [ ] No deception, no nags to install/upgrade, no fake urgency. (anti-Bonzi)
- [ ] Wakes < 200 ms and never makes the user *wait* on an animation to get help. (§4.4 interrupt rule)

---

## Sources

- Shimeji roaming / edge-cling / climb / idle-randomization heritage — shimejis.xyz; DeviantArt
  Shimeji FAQs (vickyviolet, charm-box); SourceForge Shimeji-ee.
- Why Clippy failed (interruption, ignored context, no agency, didn't honor choices) — Windows Forum
  "Clippy Lessons for Microsoft Copilot"; The New Stack "Humanity vs. Clippy"; Office Assistant
  (Wikipedia). Bonzi = deception/spyware on top of intrusion — This-vs-That BonziBuddy vs Clippy.
- Illusion of life / ambient NPC idle design (idle+locomotion+look-at-POI+reaction; freeze =
  artificial; repetition breaks believability; 2–3 idle variants; breathing/blink baseline) —
  GameAIPro Ch.36 "Breathing Life into Your Background Characters"; MoCap Online NPC Animation
  guide; GeniusCrate "Science of Idle Animations"; arXiv 2509.05023 (idle believability).
- Calm technology / ambient awareness (periphery↔center, motion as best low-intrusion cue,
  notifications carry cognitive cost even unread) — calmtech.com; principles.design "Principles of
  Calm Technology"; ebrary.net "Ambient Awareness"; AI UX Playground "Ambient Presence Displays".
- Modern desktop-pet conventions (sleep-when-idle ~60s, wake-on-move, Do-Not-Disturb/focus mode,
  roamers distract more than menu-bar pets) — NotiSprite; Clawd-on-Desk (GitHub); howtogeek desktop
  pets; mac-pet.com 2026 guide.
