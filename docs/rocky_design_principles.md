# Rocky — Design Principles (from research)

> Distilled from research on intelligent tutoring systems (ITS), Socratic AI tutors, conversational-agent engineering, and production LLM apps. These principles drive the interactive Rocky build. Sources at bottom.
> **Created:** 2026-06-30

---

## A. Pedagogy (how Rocky teaches)

1. **Scaffolding hierarchy, answer LAST.** Clarify what the learner knows → guiding prompt → worked/analogous example → full answer only after genuine struggle or explicit request. *(Socratic tutor research; ITS)*
2. **Fade support over time (ZPD).** When the learner is moving smoothly, give less and wait longer; when they falter, step back in. Replace specific hints with general prompts, then just check finished work. *(ZPD / scaffolding-fade)*
3. **Don't accept "yes" — require justification.** Ask the learner to explain their reasoning; redirect to first principles ("what's actually happening here?") instead of handing the formula. *(Socratic)*
4. **Track misconceptions; don't repeat failed explanations.** If an explanation didn't land, switch modality (analogy, real-world framing), don't repeat it. *(Socratic)*
5. **Handle frustration explicitly.** Detect struggle signals (repeated wrong attempts, vague/short replies, "I'm stuck"), validate effort first, then change strategy or drop to an easier prerequisite.
6. **Stay on the objective.** Politely refuse off-topic tangents; refocus on the lab's goal. *(subject-boundary guardrail)*

## B. Conversation & memory

7. **Multi-turn session memory.** Remember what's been tried/told this session; summarize older turns when history grows (summarization-based context management) to control tokens and stay coherent.
8. **Adaptive assistance level (the spoiler dial).** Track a per-session level (hint → guided → answer); escalate on struggle/explicit ask, de-escalate (fade) on progress.

## C. Grounding & safety (trust)

9. **Ground every turn** in lab context (objective, step, validation results, deployment log). If it's not in context, say so and point to the guide — never invent steps or cloud specifics. *(anti-hallucination)*
10. **Clarify when ambiguous** rather than guessing; reflect/recover on errors.
11. **Redact secrets/PII before the model** (already enforced in `redact.js`).

## D. Production engineering (reliable, cheap, fast)

12. **Deterministic-first routing.** Known failures (validation/deploy errors) are answered by the deterministic engine with **zero LLM tokens**; only free-form Q&A hits the model. *(cost: output tokens are 3–5× input)*
13. **Control response length** and **summarize long history** — the biggest cost levers.
14. **Model tiering (P2):** small/fast model for struggle-detection/routing; strong model for tutoring.
15. **Robust client:** streaming for latency, bounded retries/backoff, timeouts, and **graceful degradation** — if no model/key, fall back to deterministic answers so Rocky still helps.
16. **Telemetry + eval:** log each turn (level, findings, struggle, latency); build a hallucination/quality eval set against ground-truth validation logic.

## E. UX (feels like a great copilot)

17. **Slash commands** for common intents: `/hint`, `/guided`, `/answer`, `/check`, `/why`, `/status`, `/help`, `/reset`. *(Copilot/Cursor pattern)*
18. **Concise, encouraging tone.** Short by default; expand on request. Decoupled avatar (text persona; ADR-001).

---

## Sources
- ZPD / scaffolding-fade in adaptive instructional systems — Springer/ResearchGate; structural-learning.com ZPD guide.
- Scaffolding language learning via multimodal tutoring with pedagogical instructions — arXiv 2404.03429.
- Customisable Socratic AI physics tutor (system-prompt patterns, hint hierarchy, frustration handling) — arXiv 2507.05795.
- Khanmigo / Socratic tutor design (don't give the answer; guardrails) — Khan Academy case studies; aicompetence.org.
- Memory in the age of AI agents; evaluating memory via multi-turn interactions — arXiv 2512.13564, 2507.05257.
- Production LLM cost/latency optimization (output-token cost, caching, routing, retry control) — Braintrust, Tribe AI, Redis, Maxim AI guides.
- AI coding-assistant chat UX (slash commands, context) — GitHub Copilot docs/blog; Cursor guides.
