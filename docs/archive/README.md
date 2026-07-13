# Archive

Moved here 2026-07-02 during a complexity audit (`docs/rocky_complexity_audit.md`). Nothing deleted —
these are preserved for historical reference or future re-activation, but are **not current truth**.
If you're an implementation model reading this repo cold: start at `docs/rocky_strategic_review.md` and
`docs/rocky_complexity_audit.md`, not anything in this folder.

- **Superseded strategy** (`rocky_business_case.md`, `rocky_product_strategy.md`, `roadmap.md`,
  `hackathon_recommendation.md`, `architecture.md`): explicitly superseded by `rocky_strategic_review.md`,
  which says so in its own opening paragraph. `roadmap.md` also directly contradicts
  `hackathon_recommendation.md` (one says "not building," the other says "MVP built" two days later) —
  they were never reconciled, which is exactly why they're archived rather than left live.
- **Companion visual/behavioral spec sprawl** (`rocky_companion_spec.md`, `rocky_living_presence_*`,
  `rocky-spec.html`, `rocky-v2-craft-addendum.html`, `rocky-hand-rig.html`): ~4,000 lines specifying an
  animated character in exhaustive detail. `rocky_strategic_review.md` §1.2 already concluded the
  character is "a rendering, not a product" and should ship only as an optional, unproven skin. As of
  this audit the character's animation/gesture/presence code has been removed from the live app entirely
  (see the complexity audit) — these specs are preserved in case a future, evidence-backed redesign wants
  the reference material, not because they describe anything currently built.
- **On-VM / whole-VM architecture** (`whole-vm-awareness-reference-architecture.html`,
  `on-vm-agent-architecture.html`, `security_privacy_governance_spec.md`): parked per the strategic
  review §1.3 — no measured failure mode currently justifies this investment tier.
- **Empty scaffolding** (`requirements.md`, `ui_notes.md`, `ux_notes.md`): were unfilled templates with
  no content. Kept (not deleted, since this project has no version control) in case the structure is
  useful later, but they never contained anything to lose.

Nothing in this folder should be treated as an active source of truth or reconciled against the current
docs — read `docs/rocky_strategic_review.md` and `docs/rocky_complexity_audit.md` instead.
