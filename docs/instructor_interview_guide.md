# Instructor Interview Guide (Cockpit discovery)

> 3 interviews × 30 minutes with people who actually run CloudLabs events (mix internal + partner).
> Goal: design the Instructor Cockpit from their triage reality, not our imagination. Owner: Manoj.
> **Created:** 2026-07-02. Strategy context: `rocky_strategic_review.md` Part 2, idea #2.

## Recruiting note
"We're designing a live view for instructors running hands-on events — 30 minutes on how you run a class
today. No demo, no pitch; we want your pain, not your approval."

## The questions (in order — let them talk)
**The day (10 min)**
1. Walk me through your last event: class size, lab count, how the day actually went.
2. How do you find out a learner is stuck today? How long does that typically take?
3. What's the worst thing that happened mid-event this year? What did you do in the moment?

**Triage (10 min)**
4. When 5 people are stuck at once, how do you pick who to help first?
5. How do you tell "this learner is confused" from "the lab is broken" from "Azure is being slow"?
6. What do you do when you suspect the lab itself is broken mid-class? Who do you tell? What happens?

**The tool (7 min — show nothing, describe only)**
7. If you had one screen during class, what MUST be on it? (Don't prompt. Then probe: per-learner step
   position? stuck-time? validation failures? nothing/heads-down?)
8. Reaction to: "a dial that sets how much help the AI gives your class today (hints-only / normal / off)."
9. Reaction to: "one click sends a hint to everyone stuck on step 4."
10. Reaction to: "the night before, a rehearsal run tells you which labs in tomorrow's event are broken."

**Red lines (3 min)**
11. What would make you turn this off immediately?
12. Would learners knowing "the instructor can see where I am" change class behavior? Good or bad?

## What we're listening for (score each interview)
- Detection latency today (minutes? never?) → the cockpit's headline value.
- Their natural triage unit (learner? table? step?) → the heatmap's rows.
- Whether "lab is broken" mid-event has NO current escalation path → Rehearsal + incident hooks.
- Appetite vs. allergy for AI helping *their* class → default position of the help dial.
- Any surveillance discomfort → shapes what per-learner detail we show (aggregate-first?).

## Output
One page per interview + a synthesis: top-3 must-haves, top-3 red lines, and a go/no-go on Cockpit v1
scope for Phase 3 (or earlier if the pain is screaming).
