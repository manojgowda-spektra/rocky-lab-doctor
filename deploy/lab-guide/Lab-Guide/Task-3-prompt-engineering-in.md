# Exercise 3: Prompt engineering in the Playground

**Time:** about 4 minutes

> Rocky glows each control as you reach it. Everything he says is written here too.

---

## Step 1 — Type the system message (Instructions)

Value to enter: `You are a travel assistant that provides information on travel services available from Margie's Travel.`

Rocky copies this to your clipboard, so you can paste it.

**Why this matters.** The system message defines who the model is and what it may do, before any user says a word.

**What this is.** Chat models take a conversation of ROLES: system (instructions), user and assistant. The SYSTEM message sets persona, scope, tone and rules; it is the single most powerful lever in prompt engineering and is sent with every request. Here it turns a general model into Margie's Travel's assistant.

**Tip.** Be specific about what the model must NOT do. Refusals and scope come from the system message.

## Step 2 — Type your question to the model

Value to enter: `Where can I stay in New York?`

Rocky copies this to your clipboard, so you can paste it.

**Why this matters.** This is a user turn: a real question the assistant must answer within the rules you just set.

**What this is.** The playground is a no-code client for the chat completions API. Everything you type becomes a 'user' message; the reply is an 'assistant' message. Below the box you can see parameters like temperature (creativity vs. determinism) and max tokens (reply length cap).

## Step 3 — Click Send and read the answer — that's your model live. You're done!

**Why this matters.** Send makes the actual API call. What comes back is your deployment answering live.

**What this is.** Your messages are tokenised, sent to the endpoint you named, and the model generates the reply token by token (that is the streaming effect). Watch the answer: it is fluent but GENERIC, because the model only knows its training data and your prompt, not Margie's Travel's real brochures. That gap is what grounding (RAG) fixes next.

**Tip.** Ask yourself: where did this answer come from? If you cannot point to a source, neither can the model.

---

**You are done.** You deployed a real model and had a real conversation with it. Rocky guided every click, and told you why each one mattered.
