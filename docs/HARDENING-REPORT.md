# Rocky hardening — what was found, fixed, and left alone

Branch `harden/blind-spots`. Gates went from **17 to 22**, and — more to the point — five of
them can now fail. Two defects were live in the shipping artefact when this started.

---

## The single most valuable finding

**The suite was green partly because three checks could not fail.**

Content scripts run in an isolated world. `Runtime.evaluate` in the page world cannot see
`window.LabPilotRocky`; it returns `undefined` whatever Rocky is doing. Three separate places
were built on top of that mistake:

| Where | What it claimed | Why it could not fail |
|---|---|---|
| `verify-loaded.js:368` | "no uncaught errors from our own files" | read `window.__lpErrors`, which **nothing in the extension has ever written** — a repo-wide grep found one hit, the read itself. It also read the page world, so a producer would have been invisible anyway. |
| `drift-test.js:214` | "must refuse, never guess" | the probe's catch returns `status:'ERROR'`, and `'ERROR' !== 'resolved'`, so **4 of 6 cases passed on an engine that threw on everything** |
| `live-resolve.js:256` | same contract | same rule, 4 of its expectations |

The `__lpErrors` one is the exact shape of the defect that shipped: `explain()` threw a
ReferenceError, every Explore explanation died, and the suite printed *ALL GATES GREEN*.

Measured, by making `LabPilotAnchor.resolve()` throw unconditionally:

```
drift-test.js   old logic: 4 passed, 2 failed      new: 0 passed, 6 failed
live-resolve.js old logic: 4 expectations passing  new: 0 passed, 10 failed
```

The four that stayed green included the two that exist to protect the accuracy contract:
*"two identical buttons — must refuse, not guess"* and *"disabled control must not be offered
as clickable"*.

---

## Two defects that were live in the shipped artefact

**1. The manual installer still carried the defect it was fixed for.**
`dist/Install-Rocky.ps1` was a stale, hand-placed copy. `build-package.ps1` published
`bin/rocky-bootstrap.ps1` but never `bin/Install-Rocky.ps1`, so every rebuild left the old
file untouched. It differed from `bin/` by exactly two lines, and both were the original bug:

```
line  26   .\rocky-package.zip     ->  .<CR>ocky-package.zip
line 182   agent\rocky-agent.ps1   ->  agent<CR>ocky-agent.ps1
```

Anyone installing by hand got *"Illegal characters in path"* from a bug fixed months ago.

**2. A live Azure OpenAI key was being packed into the shipped zip.**
`webext/ai.local.json` is gitignored precisely because it holds a real key. The staging step
copies `webext\` wholesale with `Copy-Item -Recurse`, and `.gitignore` has no say over that.
Verified by extracting the built package: the file was present, endpoint and key intact. It
would have been installed onto every learner VM.

The build's own secret scanner does catch this and refuses to build — that guard works. The
fix adds the second line at the point the artefact is actually assembled, and a gate that
fails if such a file is ever found inside the zip.

---

## Everything fixed

| # | Defect | Fix | Proven by |
|---|---|---|---|
| 1 | Harness could not reach the isolated world; probed the same empty world twice, then fell back to the page world | Buffer `Runtime.executionContextCreated` from before navigation, select the extension's own context. **No fallback** | 3 shipped defects reintroduced, each caught |
| 2 | `window.__lpErrors` never written by anything | New `content/error-collector.js`, loaded first; check moved to where the isolated world is reachable | top-level `throw` in `skip.js` → `[FAIL]` naming `skip.js:45` |
| 3 | A crash counted as a refusal in 2 gates | `ERROR` is a failure everywhere except an `any` expectation | sabotaged engine: 4-passed → 0-passed |
| 4 | Ask-AI spinner waited forever on a dead MV3 worker | 20s deadline, `lastError` read, `done` flag so neither side clobbers the other | test written first, shown failing |
| 5 | Explain-cache gated the whole ask path on a storage callback that might never fire | 3s deadline; on timeout releases **without** caching `{}` | test written first, shown failing |
| 6 | Stale `dist/Install-Rocky.ps1` | Build publishes it from `bin/` | byte comparison, now identical |
| 7 | Live API key packed into the zip | Deleted from the stage, never from source | planted secret → `[FAIL]` |
| 8 | Nothing read the bytes that ship (`dist` in `SKIP_DIRS`) | New `package-integrity-test.js` | injected `0x07`, staled a script, both caught |
| 9 | Host list hardcoded to 4 hosts; `ml.azure.com` never added after that outage | New `manifest-hosts-test.js` derives hosts from the 25 real lab guides | removed Purview coverage → caught in all 3 lists |
| 10 | Host check was a substring match | Real MV3 match-pattern rule | see below |
| 11 | `Next`/`Back` died in an empty catch, defeating the menu's own "I BROKE" reporter | Report and re-throw; read `lastError`; stop writing a pointer from a failed read | 3 of 4 failed on old code |
| 12 | Corpus lookup denied knowledge Rocky had, with no trace | Log it; behaviour unchanged | — |

**On #10, the substring bug was not theoretical.** With only
`https://*.purview.microsoft.com/*` in the manifest, Rocky is **absent** from
`purview.microsoft.com` — `*.` matches subdomains but never the bare domain:

```
old gate:  indexOf("purview.microsoft.com") >= 0   ->  PASS
new gate:  content_scripts.matches does not cover: purview.microsoft.com
```

---

## Judged not worth fixing

**59 of the original 61 empty catches stay.** They were judged individually, not blanket
replaced. The ones on a path where a learner is *waiting* were fixed (#4, #5, #11, #12). The
rest are best-effort side effects where failing must not break rendering — persisting a
toggle, a cosmetic dim, a DOM nudge, the error reporter's own last-resort catch. Changing
those would add risk and remove none.

**`cloudlabs.ai` is excluded from the host gate**, with the reason recorded in the file: the
guides link `cloudlabs.ai/labs-support`, a support contact page, not a lab surface. The lab
itself runs on `experience.cloudlabs.ai`, which is covered. `learn.microsoft.com` is excluded
on the same grounds. Every exclusion carries a stated reason so one cannot quietly hide a gap.

**10 of 22 raw findings were refuted** under adversarial verification and dropped. Two of
those were real defects in the old `interaction-live.js` that had already been fixed by the
time verification ran.

---

## Honest limits

- **The 20s and 3s deadlines are judgement calls**, not measurements. They are long enough not
  to fire on a slow lab VM and short enough to beat a learner's patience, but nobody has
  timed a real Foundry round trip on a loaded CloudLabs VM.
- **`error-collector.js` cannot attribute unhandled promise rejections** to our files when the
  rejection carries no stack, so a few may be missed. Uncaught errors are filtered reliably by
  `chrome-extension://` source.
- **The interaction harness runs against `mock-lab.html`, not a real portal.** It proves the
  functions run and the events land; it does not prove Rocky is *correct* on a live Purview page.
- **Browser gates are genuinely flaky under sequential load.** Two failures during this work
  looked exactly like regressions and were not. One caveat worth knowing: piping a test
  through `tail` masks its exit code — check the exit code directly before believing a pass.
- **`ai.local.json` is present in the working tree**, so `build-package.ps1` will refuse to
  build until it is moved aside. That is the secret scanner working as designed, not a
  regression. It was restored byte-identical after testing.

---

## Files

New gates: `package-integrity-test.js`, `manifest-hosts-test.js`, `ask-deadline-test.js`,
`controls-report-test.js`. Rewritten: `interaction-live.js`. New shipped file:
`webext/content/error-collector.js`.

Nine commits, each with its failing-test evidence in the message.
