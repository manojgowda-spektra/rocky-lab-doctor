# Draft emails to leads — Rocky open items

> Draft only — review, fill in names, and send. Source: `docs/platform_trust_confirmation_checklist.md`.

---

## Email 1 — to the Platform / Engineering lead

**Subject:** Rocky (in-lab AI companion) — a few platform questions + 3 capability asks

Hi [Name],

We're scoping **Rocky**, a learner-facing AI companion that lives inside CloudLabs labs and helps learners understand each step, interpret validation/deployment failures, and get unstuck — grounded in the actual lab, not generic AI. We've confirmed most of the platform model already; a few things I can only get from you:

**Questions:**
1. **API auth & limits** — When a service calls the partner APIs (`/api/partners/{partnerGuid}/...`), what does it send to authenticate — an API key, or a bearer/OAuth token (Azure AD/Entra)? And are there per-minute rate limits?
2. **Learner-scoped agent** — Today, can a Cosmos Agent run *for a learner* inside a live lab (scoped to that event user + their deployment), or are agents author/operator-only? If nothing learner-facing exists, is one planned?
3. **Guide format** — When we pull a lab guide ("master document"), what format is the content (HTML / Markdown / structured JSON)? Is the module→exercise→step structure available for the guide, and are the Git-backed guides (`listGitDocs`) the recommended way to read guide content?

**Capability asks** (we understand these don't exist yet and would be new work — flagging early so they can be prioritized):
- A **Runtime Context API**: one call returning a learner's current step + objective + latest validation results.
- A **validation/deployment event stream** (webhook/push) so Rocky can react in real time instead of polling.
- An official **UI injection point** in the lab-guide/runtime shell for Rocky's panel.

Happy to walk through the why on any of these. Thanks!

[Your name]

---

## Email 2 — to the Trust / Compliance lead

**Subject:** Rocky (in-lab AI) — security & data-handling confirmations

Hi [Name],

We're scoping **Rocky**, an AI companion embedded next to the learner inside CloudLabs labs. Because it will sit close to learner data and send lab context to an AI model, I need to confirm a few governance points before we design it:

1. **Certifications** — Do we have official proof of SOC 2 Type II, ISO 27001, GDPR (DPA/SCCs), and do we support FERPA (some learners are students)? Marketing references some of these — I need the authoritative artifacts + their scope/date.
2. **AI data handling** — For our AI features: which **region** does inference run in, which **model provider** do we use (e.g. Azure OpenAI), and can we confirm learner prompts/answers are **not stored or used to train** any model?
3. **Learner PII rules** — What learner PII do we actually store, and what should an in-lab AI be allowed to see? Our intended default is **session-scoped context only, with names/emails/secrets stripped before the model** — I'd like to confirm that aligns with policy.

These answers determine which customers we can offer Rocky to and how we must handle data. Thanks!

[Your name]

---

### Why each matters (one-liners, if asked)
- Auth/limits → can't connect Rocky to CloudLabs without them.
- Learner-scoped agent → decides if we reuse the platform or build the foundation ourselves.
- Guide format → decides how cleanly Rocky binds help to each step.
- Runtime Context API / events / injection point → the difference between a polished real-time companion and a bolted-on poller.
- Certifications / AI data handling / PII → the enterprise sales gate and our compliance obligations.
