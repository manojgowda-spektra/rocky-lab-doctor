# Prompt for a parallel hardening session

Copy everything below the line into a new Claude Code session opened at
`C:\AI-Testing-Workspace\Cloudlabs - Rocky`.

---

You are hardening **Rocky**, a browser-extension lab companion for CloudLabs, in
`C:\AI-Testing-Workspace\Cloudlabs - Rocky`. Another session is working on features in the
same repo — **commit early and often on a branch**, and rebase rather than fighting over
`main`.

Use the **Workflow** tool for the fan-out work. This is exactly the shape it exists for:
many independent audits over a fixed file list, then adversarial verification of each
finding before anything is changed.

## The situation, stated plainly

Rocky has **17 gates, all green**, and has still shipped **six broken releases in two days**
to a live lab. Every defect was invisible to the suite. This is not bad luck; it is a
systematic blind spot, and your job is to find and close it rather than to add more tests of
the kind that already pass.

The six that reached a learner:

| Defect | Why no gate caught it |
|---|---|
| `agent\rocky-agent.ps1` became `agent<CR>ocky-agent.ps1` | no gate read the bytes of shipped files |
| 3 regex `\b` became backspace chars, parser silently matched nothing | a regex that matches nothing throws no error |
| `LabPilotRocky.explain()` threw a ReferenceError — every Explore explanation dead | no gate ever called `explain()` |
| Rocky not injected on `purview.microsoft.com`, then `ml.azure.com` | no gate checked the manifest against real lab hosts |
| Enter in the ask box did nothing while the button worked | no gate ever opened the ask box |
| `context()` crashed on `st.steps[...]` into an **empty catch**; questions vanished | the crash was swallowed, so nothing observable failed |

**The pattern:** the suite tests JavaScript logic in Node. Every one of these only failed
when a human interacted with a real browser, or when a file was read as bytes rather than
executed.

## The root cause you must design around

**Content scripts run in an isolated world.** `Runtime.evaluate` in the page world *cannot
see* `window.LabPilotRocky` — it returns `undefined` no matter what Rocky is doing. Several
existing probes check exactly that and are therefore structurally incapable of failing
correctly.

`test/interaction-live.js` is a **half-finished** attempt to fix this. It is deliberately
NOT wired into `test/run-all.ps1`. It currently cannot reach the extension's execution
context. Finishing it — by enumerating CDP `Runtime.executionContextCreated` events and
selecting the context whose `auxData.type === 'isolatedWorld'` for the extension — is
probably the single highest-value thing you can do.

## Known debt, already counted

**66 empty `catch {}` blocks** across `webext/content/*.js` and `background.js`:

```
18 explore.js   8 rocky.js     7 controls.js   7 content.js    4 watcher.js
 4 skip.js      4 recovery.js  4 overlay.js    3 guide-reader.js
 2 lab-context.js  1 each: pilot, perception, explain-cache, cloudlabs-kb, anchor-engine
```

One of these directly caused the worst bug: a `TypeError` was swallowed and the learner's
question disappeared with no error, no spinner, nothing. Every one of these is a potential
silent failure.

**Do not blanket-replace them.** Many are correct — a cache write that fails must not break
rendering. Judge each: a catch on a *best-effort side effect* is fine; a catch around
*something the user is waiting for* is a defect. Where it is fine, say so in the comment so
the next reader does not re-litigate it.

## What to do

### Phase 1 — Find the blind spots (fan out, read-only)

Run parallel audits, one per area. Each returns findings, not fixes.

1. **Isolated-world reachability.** Which existing gates check things they cannot see? List
   every probe whose assertion is structurally always-true or always-false.
2. **Silent failure.** Walk every path a learner can trigger (click Rocky → each menu item,
   hover, circle-draw, Ask, Explore toggle, Alt+A, Alt+E, dismiss). For each, find every
   place a throw or an unfired callback would produce *nothing on screen*.
3. **Optimistic assumptions.** Every `x.y[z]`, `arr.length`, `obj.prop.prop` reachable from a
   user action where the left side can legitimately be undefined — failed fetch, race,
   not-yet-loaded. `context()` crashed exactly this way.
4. **Manifest vs reality.** Extract every host from the real lab guides in
   `C:\AI-Testing-Workspace\Cosmos-Labs\**\Lab Guide\**\*.md` and check all three of
   `content_scripts.matches`, `web_accessible_resources.matches` and `host_permissions`.
5. **Async without a deadline.** Every `fetch`, `sendMessage`, and callback-queue
   (`ready(cb)`) that a user action waits on. Two of these already hung forever.
6. **The shipped artefact.** Unzip `dist/rocky-package.zip` and verify it against the source
   tree: every declared file present, no mangled escapes, `ai.json`/`lab.json` BOM-free.

### Phase 2 — Verify adversarially

Every finding gets independent verification before it is believed. Use distinct lenses, not
three identical checks: *does this actually reproduce*, *is the fix worse than the bug*,
*would a learner ever hit this state*. Majority rules; discard what does not survive.

A finding that cannot be **reproduced** is not a finding. Write the reproduction first.

### Phase 3 — Fix, gated

For each surviving finding:
- write the failing test **first**, and show it failing on the current code
- fix it
- show the test passing
- verify the gate catches a reintroduction of the bug

**A test that has never failed proves nothing.** This has bitten here already: a `sed` that
silently matched nothing produced a "passing" verification that verified nothing.

## Rules

- **`vmpackage/test/run-all.ps1` must stay green.** Run it before and after. It is the
  release gate.
- **Never write PowerShell or JS string literals through a shell heredoc.** `\r`, `\b` and
  `\a` get eaten before the file is saved. This has happened five times in this repo. Use
  the Write/Edit tools, or a Python script written as a *file*.
- `.ps1` files need a UTF-8 BOM; `lab.json` and `ai.json` must NOT have one. Both directions
  have caused real bugs. `test/source-integrity-test.js` enforces this.
- Browser tests are flaky under load and the symptoms look exactly like code regressions
  (everything `absent`, guide parses 0 steps). Re-run on a quiet machine before believing a
  failure. `test/edge-util.js` has `sweepStaleProfiles` for this.
- Do not weaken the accuracy contract: **score ≥ 0.70, margin ≥ 0.20, no contradicted
  attribute**. A wrong glow is worse than no glow. If a fix requires relaxing it, the fix is
  wrong.
- Everything is vanilla JS, MV3, zero dependencies. No `eval`, no `new Function` in shipped
  code (CSP).

## Orientation

- `docs/rocky_chief_architect_design.md` — the architecture and why
- `docs/rocky_architecture_2026.md` — the measurements behind it
- `vmpackage/webext/content/` — 21 content scripts; load order is in `manifest.json`
- `vmpackage/test/` — 17 gates driven by `run-all.ps1`

Content script load order:

```
anchor-engine · vision-matcher · vision-templates · rocky · overlay · capture
foundry-kb · watcher · lab-context · cloudlabs-kb · perception · world-model
label-resolver · guide-reader · content · skip · controls · explain-cache
explore · pilot · recovery
```

## Deliverable

A branch with: the finished isolated-world harness wired into `run-all.ps1`, one gated fix
per verified finding, and a short report — what was found, what was fixed, what was judged
not worth fixing and why.

**Report honestly.** If a fix is unverified, say so. If the suite is green only because a
test cannot fail, say that loudest of all — that is the most valuable thing you can find.
