# Companion v1 — EVE-style character (archived 2026-07-02)

Preserved copies of the three companion HTML apps that existed before the complexity audit
(`docs/rocky_complexity_audit.md`), which found:

- `flagship.html` was **unreachable dead code** — no server route ever served it.
- `index.html` was reachable only via a hidden `/classic` route no real user ever hit.
- `rocky.html`'s canvas rig (11-emotion × 13-tone table, 7 gesture presets, a presence/hover state
  machine, drag-repositioning, an Easter egg, confetti, and an undisclosed "Knowledge Moments" fun-fact
  economy with its own wallet/cooldown governance) was ~230-260 of its 390 lines, built to visual
  perfection with **zero real learners ever having seen it**. Worse: the emotion/tone vocabulary was
  baked into `/api/say`'s required response schema — the same call carrying the explicit
  never-assert-unverified-state honesty gate — creating a real competing-objectives risk on the one
  code path this project's credibility depends on.

None of this was deleted for being *wrong* — the visual craft is genuinely good. It's archived because
no evidence exists that any of it improves completion, satisfaction, or trust over a plain grounded
panel, and the honesty-schema conflict was an active risk, not a hypothetical one. The live app now
ships a ~120-line panel (see `source/rocky-prototype/web/public/rocky.html`) with the same backend.

**If you want to revive this**: do it as an evidence-backed A/B against the plain panel (completion,
"keep Rocky on," satisfaction), not as a default. See `docs/rocky_strategic_review.md` §1.2 and Phase 2
of its roadmap for the intended test design. Keep `emotion`/`tone` OUT of `/api/say`'s response schema
regardless — drive character state from a separate, non-trust-critical call if you bring the rig back.
