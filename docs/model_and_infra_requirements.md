# Rocky — Model & Infrastructure Requirements

> What to provision (you have MSDN/Azure + can deploy models). Split by phase so you only get what's needed now.
> **Created:** 2026-06-30

---

## For P1 (the version we're building now) — minimum

### 1. One chat/reasoning model (Rocky's "brain")
Powers free-form Q&A + natural phrasing on top of the deterministic grounded engine.

| Option | What | Why pick it |
|---|---|---|
| **A. Claude Sonnet 4.6 (recommended for quality)** | via Anthropic API, or Azure AI Foundry / AWS Bedrock / GCP Vertex | Best grounded-reasoning + instruction-following + scaffolding/pedagogy; strongest "don't spoil, stay grounded" behavior |
| **B. Azure OpenAI GPT-4.1 / GPT-4o (easiest on MSDN)** | Azure OpenAI Service deployment in your subscription | Fully Azure-native, simplest to stand up under MSDN, good enough for P1 |

**Recommendation:** if you can deploy Claude (Foundry/Bedrock/Vertex), use **Sonnet 4.6**; otherwise **Azure OpenAI GPT-4.1**. Either works — the prototype's LLM layer is a single pluggable function.

**Deploy settings that matter (and that also answer trust checklist B2):**
- **Region:** pin to a region that matches learner data residency requirements.
- **No training on your data:** confirm the deployment's data-privacy setting (Azure OpenAI = no training by default; can also opt out of human abuse-review). This directly answers B2.
- **Quota (TPM/RPM):** workshops are bursty — request enough tokens-per-minute for peak concurrent learners (e.g., a 200-person workshop). Start with a generous TPM and scale.

### 2. A key/secret store
Azure **Key Vault** to hold the model API key. Rocky's backend reads it from there (never in code).

### 3. Somewhere to run Rocky's backend
The orchestrator (context fetch → redact → ground → call model). Options: Azure **Container Apps** / **App Service** / **Functions**, **or** inside **Cosmos as a scoped agent** (ADR-006 — preferred if the platform team enables a learner-scoped runtime).

> That's it for P1. The grounded diagnosis already runs without a model; the model just adds conversational Q&A.

---

## For P2 (session-aware, proactive) — add later

| Need | Provision | Why |
|---|---|---|
| **Small/fast model** | Claude **Haiku 4.5** or Azure OpenAI **GPT-4o-mini** | High-frequency, low-stakes calls: "is this learner stuck?", intent routing, classification — cheap + fast |
| **Embeddings model** | Azure OpenAI **text-embedding-3-large** (or equivalent) | RAG over lab guides + Cosmos knowledge so Rocky can retrieve relevant guide/pitfall content |
| **Vector store** | **Azure AI Search** or Postgres **pgvector** | Stores the embedded lab guides/docs for retrieval |

---

## Not a model, but required to make it real (tracked elsewhere)
- **CloudLabs API auth** to feed live grounding data (checklist A1) — replaces the prototype's fixtures.
- **Learner-scoped agent runtime / surface** (checklist A2) if hosting inside Cosmos.
- **Per-user OpenAI-credit rails** already exist in CloudLabs — reuse them to meter Rocky's spend.

---

## Cost shape (rough, to size quota)
- P1 interaction ≈ a few thousand tokens in (lab context, trimmed) + a few hundred out. Cheap per call.
- The deterministic engine handles the common "explain my failure" case with **zero model tokens** — the model is only for free-form Q&A, which keeps cost low.
- Meter per-learner via the existing OpenAI-credit system; set a per-session cap.

---

## What I need from you to wire it up
1. Which model you deploy (Claude Sonnet 4.6 **or** Azure OpenAI GPT-4.1/4o).
2. The **endpoint URL** + **deployment name** (for Azure OpenAI) or **API key** (for Anthropic) — put the key in Key Vault; give me the env var names.
3. Then I'll add the matching adapter to `src/llm.js` and the prototype will do live grounded Q&A end-to-end.
