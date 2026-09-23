# Exercise 2: Deploy a model

**Time:** about 12 minutes

> Rocky glows each control as you reach it. Everything he says is written here too.

---

## Step 1 — Click Build to open the build workspace

**Why this matters.** Build is the area of the workspace where you assemble models, prompts and agents into something usable.

**What this is.** Foundry groups the experience into Define, Build and Operate. Build is where you deploy models, prototype prompts in playgrounds and create agents; Operate is monitoring, tracing and evaluation once something is live.

## Step 2 — Click Deployments to manage model deployments

**Why this matters.** A model must be DEPLOYED before anything can call it. This page lists what your project has deployed so far.

**What this is.** A DEPLOYMENT is a named, callable instance of a model with its own capacity (tokens per minute), content-filter policy and version pinning. Your code calls the deployment NAME, never the raw model, which lets you upgrade the model later without touching the code.

## Step 3 — Click Deploy, then 'Deploy a base model'

**Why this matters.** You are about to pick a model from the catalog and stand it up behind an endpoint.

**What this is.** Deploy offers two paths: a BASE model straight from the catalog, or a FINE-TUNED model you trained on your own examples. Labs almost always start with a base model because it is instant and free to create; you pay only for tokens you send.

**Tip.** Base model deployments are cheap to create and delete. Treat them like disposable test endpoints.

## Step 4 — Click 'Deploy a base model'

**Why this matters.** Base model means the model as published by its provider, with no customisation, which is exactly what you want for a first deployment.

**What this is.** A base (foundation) model was pre-trained by its vendor on huge general corpora. You shape its behaviour with PROMPTS at run time rather than by retraining. Fine-tuning comes later, and only when prompting genuinely cannot get you there.

## Step 5 — Search the catalog for gpt-5

Value to enter: `gpt-5`

Rocky copies this to your clipboard, so you can paste it.

**Why this matters.** The catalog is large, so searching by name is the fastest way to the model this lab uses.

**What this is.** The Foundry MODEL CATALOG lists well over a thousand models from Microsoft, OpenAI, Meta, Mistral, Cohere, Hugging Face and others. Each card shows the provider, capabilities (chat, reasoning, embeddings, vision), context window and licensing. Models sold as Microsoft first-party are billed through your Azure subscription.

## Step 6 — Click the gpt-5 model card

**Why this matters.** Opening the model card shows you the exact model, versions and regions before you commit to a deployment.

**What this is.** GPT-5 is OpenAI's frontier model family, served in Azure inside your subscription boundary: your prompts and data are not used to train OpenAI models. The card lists supported deployment types, available versions and per-token pricing.

**Tip.** Note the model VERSION on the card. Deployments pin a version; behaviour can shift between versions.

## Step 7 — Click Deploy on the gpt-5 model page

**Why this matters.** This starts the deployment wizard for the model you chose.

**What this is.** You are not downloading anything. Deploying assigns the model to a managed endpoint that Azure hosts and scales. What you get is a URL, a key (or Entra ID auth) and a deployment name to call from any language.

## Step 8 — Choose Custom settings

**Why this matters.** Custom settings lets you control the deployment name and capacity instead of accepting defaults, which the lab needs for the name step.

**What this is.** The settings you can change: DEPLOYMENT NAME (what code calls), DEPLOYMENT TYPE (Standard = regional, Global Standard = routed worldwide for capacity, Provisioned = reserved throughput), MODEL VERSION, TOKENS-PER-MINUTE rate limit and the CONTENT FILTER policy.

**Tip.** In real projects the TPM limit is what your quota request is about. Labs use small numbers on purpose.

## Step 9 — Set the deployment name to mygpt

Value to enter: `mygpt`

Rocky copies this to your clipboard, so you can paste it.

**Why this matters.** Code and playgrounds address the model by this name, so a short, memorable one makes every later step easier.

**What this is.** The deployment name is a stable alias. Your app sends requests to '.../deployments/mygpt/chat/completions'; if you later redeploy a newer version under the same name, the app keeps working unchanged. Many teams name deployments by purpose (chat-prod, summarizer) rather than by model.

## Step 10 — Click Deploy to create the deployment

**Why this matters.** Deploy creates the endpoint. From here the model is live and billable per token.

**What this is.** Azure allocates capacity from your subscription's quota for that model and region, applies the content filter and exposes the endpoint. It usually takes seconds for Standard deployments. The Deployments list will now show the name, model, version and state.

**Tip.** If you ever see SkuNotAvailable or a quota error, it is a region/quota problem, not something a smaller name or model size fixes.

---

**Checkpoint:** exercise 2 complete. Continue to exercise 3.
