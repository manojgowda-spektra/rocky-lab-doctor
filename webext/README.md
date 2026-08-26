# Rocky Copilot — browser extension

Rocky stands beside the learner **inside the portal** and points at the exact next control.

## Install (30 seconds, no build step)

1. `chrome://extensions` (or `edge://extensions`)
2. Turn on **Developer mode**
3. **Load unpacked** → select this `webext/` folder
4. Open **https://ai.azure.com** — Rocky appears bottom-right

## What it does

Walks the "deploy a model and chat with it" flow click by click: glows **Deployments → Deploy model
→ the gpt-5 card → deployment name (auto-copied) → Deploy → Playground → prompt → Send**, then
throws confetti.

Advance happens **only on a real user action** — a real click on the glowed control, or real typing
in the glowed field. Never a timer.

## The accuracy contract — "never a wrong glow"

`anchor.js` is the safety-critical half and contains no model, no network and no randomness. A
control is glowed only when all three hold:

| Rule | Value | Meaning |
|---|---|---|
| No contradicted attribute | hard fail | a *present and different* test id / role / tag / exact text disqualifies outright |
| Confidence floor | `MIN_SCORE 0.7` | the winner must be genuinely good |
| Ambiguity margin | `MARGIN 0.2` | the winner must clearly beat the runner-up |

Anything else → **no glow**, and an honest card explaining which rule stopped it. Pointing at the
wrong control is impossible by construction rather than unlikely in practice.

Absent information is **not** a contradiction: a page that simply has no test ids still resolves on
text and role. Only conflicting evidence disqualifies.

Verified by `source/rocky-prototype/test/anchor.test.js` — including a determinism test that runs
the resolver 25 times and asserts a single distinct result.

## Always-finishable

The control bar (**Back / Next / Finish / ↻**) is always visible, so a tester completes the flow
even if a control never resolves. Honesty must never mean a dead end.

## Files

| File | Role |
|---|---|
| `anchor.js` | the resolver — pure, testable in Node, no DOM |
| `content.js` | the only file touching the DOM: adapts elements, drives steps, draws the glow |
| `rocky-render.js` | the companion, ported from the Rocky canvas engine. Pose is driven by resolver state, never by a model |
| `steps/foundry.json` | the step bundle — text AI-authored from the lab guide, match specs captured from the portal |
| `overlay.css` | overlay styling; pointer-events off except the bar and card |

## Honest limits

- Match specs are captured per portal build. A different tenant build may need re-capture — the
  failure mode is an honest card plus Next, never a wrong glow.
- The bundle ships one flow (Microsoft Foundry). Authoring more is a JSON file, not code.
