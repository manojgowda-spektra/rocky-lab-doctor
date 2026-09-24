# Traces

Recordings of what a portal actually put on screen while a learner did a lab, used by
`test/replay.js` to SCORE the position model rather than pass/fail it.

## Provenance is the whole point

Every trace declares `provenance`:

- **`captured`** — recorded from a live portal with `test/trace-capture.js`. This is evidence.
- **`synthetic`** — written by hand. This proves the model behaves as its author expected, which
  is a smoke test and nothing more. A model tuned against synthetic traces is tuned against the
  author's beliefs about Purview, not against Purview.

`replay.js` prints a warning when no captured trace is present, because a scorecard built
entirely from synthetic traces measures self-consistency and reads like measured accuracy.

## Recording one

1. Open the portal tab of a running lab. DevTools (F12) → Console.
2. Paste the whole of `test/trace-capture.js`, press Enter.
3. Do the lab normally. Call `__rockyTrace.mark(0)` as you start step 1, `mark(1)` for step 2,
   and `mark('off')` whenever you are deliberately wandering off-procedure. The labels are what
   makes the trace scoreable — an unlabelled trace still records the pages but cannot be scored.
4. `__rockyTrace.save()` downloads it. Drop it in this directory.

Wander on purpose. Visit a different solution, go back, do a step twice, skip one. Those frames
are worth more than the happy path, because the happy path is the case that already works.

## Before committing a trace

Accessible names on a real tenant can contain the lab user's display name or e-mail address.
Read the file before committing it.
