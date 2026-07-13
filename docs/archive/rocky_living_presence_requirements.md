# Rocky — Living Presence & Interaction Requirements

> Captured verbatim-in-spirit from the product vision. Source requirements for the flagship build;
> the parallel "living presence" design workflow deepens these into build-ready specs.
> **Created:** 2026-07-01

---

## Design goal
Users must NOT see Rocky as a chatbot — they should treat it as a **digital teammate**. Target reactions:
*"I actually enjoyed having Rocky around." · "It felt like Rocky was working with me." · "I missed Rocky when it disappeared." · "Rocky made the lab less stressful and more fun."*

## Presence & movement
- Freely moves around the screen; appears **curious**, as if observing what the user does.
- Sometimes **wanders off-screen, disappears, and reappears** from another location.
- Surprises the user with small reactions, observations, celebrations, tips.
- Goal: users feel Rocky is genuinely **present and aware**. Never distracting.

## Idle behavior catalog
Float, look at UI elements, pretend to inspect things, sit/relax, yawn, sleep, snore, daydream, stretch, look confused, look excited, react to progress. All natural, never distracting.

## Mouse — hover
On hover over Rocky: immediately **pause**, **look at the cursor**, focus attention, show a friendly prompt — *"Need help?" / "Got a question?" / "Stuck somewhere?" / "Want me to take a look?"* Expression adapts.

## Mouse — click
On click: a **premium animated interaction** → a sleek, modern, futuristic, lightweight **floating assistant panel** opens with polished motion. Delightful every time.

## Conversation style
After a question: Rocky **thinks → analyzes context → understands the lab → reviews info → responds**. Responses are **short, helpful, accurate, context-aware, actionable** — never long/boring/generic/doc-dumps. Adaptive personality: funny / serious / professional / encouraging / excited / calm / supportive.

**Voice examples (rewrite pattern):**
- ❌ "Please verify whether the Azure resource has been successfully deployed."
  ✅ "Looks like the deployment isn't done yet. Give it a minute and we'll continue 🚀"
- ❌ "The permission assignment appears to be missing."
  ✅ "Aha! Found the culprit 👀 You don't have the required role yet. Let's fix that."

## Living-companion features (beyond chat)
Notice repeated mistakes & offer help; celebrate completed sections; comment on unusually fast progress; gently check on inactive users; remember preferences; adapt personality per learner; detect confidence level & assist accordingly; simplify complex instructions; hints before answers; mini-achievements/rewards during long labs.

## Magical moments (memorable beats)
- Disappears into a **portal** and returns with a hint.
- Puts on **detective glasses** while investigating an issue.
- Wears a tiny **superhero cape** when fixing a problem.
- **Falls asleep** after long inactivity, **wakes instantly** when needed.
- Big **celebration** animation when a hard deployment finally succeeds.

## Mandate
Think beyond assistants/chatbots. Invent interactions never seen in a lab platform. Draw on game design, AI companions, onboarding, and user psychology. Engaging, not manipulative. If a better idea exists, implement it.

---
*Status: requirements captured. Design synthesis in progress (workflow `rocky-living-presence`). Implementation follows the merged flagship + presence spec.*
