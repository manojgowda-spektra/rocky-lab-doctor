# Living Registers — Rocky

> Continuously maintained: Architecture Review · Risk Register · Technical Debt · Improvement Backlog · Optimization Opportunities.
> **Last Updated:** 2026-06-30

---

## 1. Architecture Review (current)

**State:** P1 prototype is modular, tested (17 tests), and proven live. Clean seams:
`ContextProvider` (data) → `redact` (safety) → `rocky` engine (deterministic findings) → `llm` (optional NL layer) → `session` (telemetry).

**Strengths:** telemetry-first (cheap, private); deterministic core runs with zero LLM tokens; provider-swappable; provider-agnostic LLM; secrets isolated in `.env.local`.

**Gaps to close before "product":** live data provider (needs auth A1); conversation memory (single-turn today); no CI; no structured logging/observability; engine rule coverage still small; LLM responses unevaluated for hallucination at scale.

---

## 2. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Status |
|---|---|---|---|---|---|
| RK-01 | Proactivity imprecision (Clippy) | Med | High | Reactive-first; precision-gated (ADR-003); P1 has no proactivity | Controlled |
| RK-02 | Enterprise surveillance/governance veto | Med | High | Telemetry-only mode; redaction; trust checklist B1-B3 | Open (needs trust answers) |
| RK-03 | Teaching-hallucination (confidently wrong) | Med | High | Ground in validation logic; "say if unsure" system prompt; needs eval harness | Partly mitigated |
| RK-04 | Azure API key exposed (passed through session) | High (already) | Med | Rotate key post-dev; `.gitignore`; never printed | **Action: rotate key** |
| RK-05 | Model API drift (params/versions change) | Med | Low | Adapter isolates calls; pin api-version; covered by smoke | Controlled |
| RK-06 | No live data yet → demo stays on fixtures | High | Med | Live provider stub ready; unblock via auth (A1) | Open |
| RK-07 | LLM cost at workshop scale | Med | Med | Deterministic-first (0 tokens for common case); per-user OpenAI-credit rails; small model for P2 triggers | Designed-for |
| RK-08 | Learner-scoped agent runtime may not exist (A2) | Med | High | Confirmed gap; fallback = external service reusing APIs | Open (needs platform) |

---

## 3. Technical Debt Register

| ID | Debt | Why it exists | Payback |
|---|---|---|---|
| TD-01 | Context is a fixture, not live | Auth pending (A1) | Implement `LiveCloudLabsContextProvider` fetches when auth lands |
| ~~TD-02~~ | ~~Single-turn LLM~~ | — | **RESOLVED** — multi-turn memory + summarization shipped |
| TD-03 | Limited error-rule coverage | Started with top cases | Grow `ERROR_RULES` + `FINDING_EXPLAINERS` from real labs |
| TD-04 | No CI pipeline | Local prototype | Add GitHub Actions: `node --test` on push |
| TD-05 | Guide content parsing not implemented | Format unconfirmed (A4) | Parse master-doc/Git-backed guide once format confirmed |
| TD-06 | No hallucination eval harness | Speed | Add a graded eval set comparing Rocky vs validation logic |
| TD-07 | Struggle detection is keyword heuristic | Simple v1 | Upgrade to a small-model classifier (P2 model tiering) |
| TD-08 | LLM grounding enforced only by prompt | No verifier yet | Add a post-response groundedness check vs validation logic |
| TD-09 | `chat.js` bound to one fixture lab | Prototype | Parameterize lab/learner once live provider lands |
| TD-10 | Guided pointing works on a **simulated** portal | No real portal access | Real pointing needs browser-extension/DOM bridge or CV (P3) |
| TD-11 | Emotion/proactive triggers are rule-based | No learned model yet | Predictive timing once interaction telemetry corpus exists |

### Resolved this session
- **SEC:** report/diagnostics bundle leaked a deployment-log secret → now redacted server-side (SC-005). Caught in smoke test, fixed, re-verified clean.
- 3 web/agent bugs (param mismatch, deterministic stream emit, piped-stdin queue abort).

---

## 4. Improvement Backlog (prioritized)

| Pri | Item | Value |
|---|---|---|
| P0 | Live CloudLabs `ContextProvider` (on auth) | Real data → real demo |
| ✅ DONE | Interactive multi-turn CLI "talk to Rocky" | Built, 31 tests, proven live (2026-06-30) |
| P1 | Hallucination eval harness (Rocky vs ground truth) | Trust gate; quality bar |
| P1 | Spoiler-dial UX (learner sets hint/guided/answer) | Pedagogy control (IDEA-003) |
| P1 | CI (GitHub Actions running tests) | Safety net |
| P2 | Minimal web panel (the guide-pane surface) | Visual demo of placement |
| P2 | More error rules + cloud-specific (AWS/GCP) branches | Coverage |
| P2 | Competency-signal seed from telemetry | Future revenue SKU |

---

## 5. Optimization Opportunities

- **Token cost:** deterministic engine already answers the common "why did it fail" with **zero LLM tokens** — keep routing there first; only escalate to the model for free-form Q&A.
- **Latency:** cache per-lab context (guide + validation defs change rarely) per session; only re-poll learner progress/log.
- **Model tiering:** use a small/fast model (Haiku 4.5 / GPT-4o-mini) for classification/"is stuck"; reserve the strong model for tutoring (P2).
- **Polling cost (no event bus):** adaptive poll interval (back off when idle, tighten after an action) until a real event stream exists.

---

*Update this file as part of every meaningful change (see AI_WORKFLOW.md).*
