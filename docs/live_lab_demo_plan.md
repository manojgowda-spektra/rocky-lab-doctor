# Rocky on a live CloudLabs lab — engineering plan

**Date:** 22 September 2026 (build status added 23 September) · **Owner:** Manoj Gowda
**Build:** the shared `Rocky-Extension.zip` (LabPilot · Rocky 0.7.1, Kiran's build)
**Status:** package built and gated; the CloudLabs side awaits portal work

> **BUILD STATUS — 23 September 2026.** Phase P1 is complete and committed. The VM package,
> the bootstrap, the ARM template, the generated lab guide, the bundle registry publisher and
> six automated gates all exist and pass; `vmpackage/test/run-all.ps1` runs the lot in one
> command. Rocky has been proven to load into real Edge, inject his content scripts, mount his
> overlay and **glow the control that step 1 of the real bundle asks for**, with a screenshot as
> evidence. He has also been made to fail on purpose: rename, duplicate or disable the control
> and he refuses rather than guessing, in all six drift cases.
>
> What is NOT done, and needs you: publishing the artefacts to blob, creating the template and
> the ODL, and the in-lab gate G2. Those are portal clicks and cloud spend. See §6 and the
> runbook at `deploy/RUNBOOK.md`.
>
> Defects found and fixed while building, all in our own code, none in the shared extension:
> the bootstrap claimed the logon task registered after it had failed; every PowerShell script
> was BOM-less UTF-8, which PowerShell 5.1 reads as ANSI; and the browser tests leaked Edge
> processes until a loaded machine made them fail for no product reason. One honest gap stands:
> the vision template PNG is declared but absent, so that one step can only show its card. The
> demo bundle has no vision steps.

Labels used throughout: **VERIFIED** (read in code or docs, or tested today) · **INFERRED** (reasonable, untested) · **UNKNOWN** (must test or ask) · **ASK** (a human at Spektra decides).

---

## 0. What we will show, in one paragraph

A real CloudLabs On-Demand Lab. The learner clicks Launch, CloudLabs deploys the environment and opens the lab VM in the browser. On the VM desktop there is one shortcut: **Lab Portal (with Rocky)**. It opens Edge on the Microsoft Foundry portal and Rocky is already there. He flies to the exact next control, glows it, and says the step; the WHY appears under every instruction. The learner deploys a real GPT-5 model and talks to it in the playground, guided click by click, and Rocky throws confetti at the end. Nothing was installed by hand. Rocky arrived with the lab, because CloudLabs' own deployment hook put him there and told him which lab he was in.

Fallback, same ODL, if anything in the VM route fails on the day: the presenter's own Edge with the extension loaded, driving the same lab in the same tenant. Same Rocky, same steps, one less claim.

---

## 1. What we have — audit of the shared extension (VERIFIED, read in full today)

The zip is **not** the repo's reference extension. It is the production build described in the deck and the combined report: 22 files, Manifest V3, version 0.7.1.

| Component | File | What it does |
|---|---|---|
| Resolver | `content/anchor-engine.js` | Scores DOM candidates: id 1.00 · data-attr 0.90 · fieldLabel / imgAlt / childText 0.85 · ariaLabel / placeholder / hrefSuffix 0.70 · text 0.60 · href 0.50 · domPath 0.40 · role 0.20. **MIN_SCORE 0.70, MARGIN 0.20**, contradiction = hard fail. Session-unstable Fluent/React ids (`field-_r_1t_`, `:r3:`, `fui-`) are blacklisted. `scope` narrows to dialog / menu / nav / main; `inLandmark` narrows to the captured landmark and never falls back to the ambiguous full set; `urlPattern` gates a step to its screen. A resolved-but-disabled control is reported so the caller shows a notice, never a click-me glow. |
| Orchestrator | `content/content.js` | Guidance is a pure function of (live page, step pointer): re-evaluates on DOM mutation and SPA route change. Advances **only** on a real click on the glowed control (or a click inside the matched rect for vision steps). Bounded one-step lookahead for completed-by-navigation; misnavigation guides the learner back. Step pointer persists across full-page navigation. **Loads its bundle from `chrome.storage.local.lpBundle` if present, else `bundle/test-bundle.json` from the extension folder.** |
| Overlay | `content/overlay.js`, `overlay.css` | Glow pinned every frame to the element's rect; with Rocky loaded the glow is hidden until he arrives, then revealed. Card / pill fallback when Rocky is absent. Confetti finale. |
| Character | `content/rocky.js` | The robot. Pose and mood are driven only by resolver state (guide / checking / celebrate / explore). Radial menu is the only UI. |
| Explore | `content/explore.js`, `content/foundry-kb.js` | Dwell 0.9 s or draw a circle → Rocky explains the control from an authored Foundry knowledge base, else an honest role-and-label description. Destructive-click guard: intercepts delete / remove / purge / regenerate, explains, allows a deliberate second click within 8 s. |
| Ask Rocky | `background.js` (service worker), popup | One question plus lab context (step text, page title, control label) to the learner's own Foundry deployment; supports the v1 Responses API and legacy chat completions; answers labelled AI; never moves a glow. Endpoint, model and key stored only in `chrome.storage.local`. |
| Capture | `content/capture.js`, popup | Record-as-you-click authoring: click each control once; `describe()` picks the strongest stable signals, self-verifies uniqueness through the engine, adds `domPath` only as a tiebreaker; export to `labpilot-captures.json`. |
| Vision | `content/vision-matcher.js`, `vision-templates/` | Normalised cross-correlation on a canvas / video / img pixel surface; **MIN 0.90, MARGIN 0.06**, multi-scale 0.9–1.1; one template shipped (Windows file picker Open button). Polls at 400 ms only while a vision step is current. |
| Controls | `controls.js`, `skip.js` | Back / Next / Finish / Restart; Alt+N / P / C / H / L / E / A; auto-finale on the last click. |
| Bundles | `bundle/test-bundle.json` (16 steps, 3 tasks) · `bundle/full-bundle.json` (28 steps, 4 tasks incl. knowledge base + one vision step) | The Microsoft Learn lab "Develop AI with Foundry": name project → Create → Let's go → Build → Deployments → Deploy → base model → search gpt-5 → card → Deploy → Custom settings → name `mygpt` → Deploy → system message → chat → Send. Every step has authored WHY / WHAT / TIP. |

**Host permissions already include `experience.cloudlabs.ai` and `*.cloudlabs.ai`.** Rocky can appear on the CloudLabs lab page itself, not only in the Azure portals.

**Not in the zip:** the automated test suites (they live in Kiran's repo), the Windows UI Automation VM agent, and the bundle compiler. The zip is the runtime only.

**Hygiene items in the zip:** the popup pre-fills Kiran's Foundry endpoint (`foundry-aidev.services.ai.azure.com`) and version text says 0.7.0 while the manifest says 0.7.1. The tester README has a duplicated paragraph. Cosmetic; fix in the package build.

---

## 2. The demo lab — decision

Three candidates were considered.

| Option | Lab | For | Against |
|---|---|---|---|
| **A** | Manoj's onboarded IDP lab (template exists) | Real, already ours | Its Foundry-portal content is one exercise, and a known defect is that the Foundry project may not exist. The rest is VM scripting, which needs the VM agent we do not have in hand. |
| **B — recommended** | **New template: "Develop AI with Microsoft Foundry, guided by Rocky"** wrapping the Learn lab the shared bundle already covers | The bundle already resolves on the current portal; authoring is re-capture only. Pure browser flow, so the browser Copilot alone carries the demo. A real ODL, a real JumpVM, a real GPT-5 deployment. | A new template to create (a few Admin Center forms; you have done this end to end for Purview and IDP). Needs GPT-5 quota in the lab subscription pool. |
| **C** | Same as B, presenter's own browser | Zero VM risk | Does not show "Rocky ships with the lab". |

**Decision: B as the primary, C as the day-of fallback.** Same ODL, same tenant, same bundle; the only difference is where Edge runs.

**Template shape (VERIFIED fields, from our own onboarding reference):** Cloud Platform Azure · Cloud Usage Type *Cloud Resource Usage* · Subscription Type *Shared* · Enable VM Access over HTTP ON · Enable Dynamic Parameters ON · Allocate OpenAI Endpoints ON · Enable Lab Validation OFF for the demo (optional later: one PowerShell validation "a deployment named mygpt exists") · Create Service Principal OFF (not needed for the Copilot) · Allow Global Admin OFF. VM Configuration: the JumpVM, RDP, DNS / username / password mapped to ARM output names. Guide: Learn-style markdown for Tasks 1–3 in a GitHub repo, masterdoc.json as usual.

---

## 3. How Rocky gets the lab details

Rocky does not ask the platform who it is. **CloudLabs tells it at deploy time**, through the same hook every one of our labs already uses.

**VERIFIED precedent (read today in the IDP lab's ARM template and bootstrap):** the Custom Script Extension runs
`powershell -ExecutionPolicy Bypass -File psscript-01.ps1 -AzureUserName … -AzureTenantID … -AzureSubscriptionID … -ODLID … -DeploymentID … -vmAdminUsername … -trainerUserName …`
and the house bootstrap writes `C:\LabFiles\AzureCreds.txt` (user, tenant, subscription, DeploymentID) and installs the CloudLabs Shadow agent. Partner-authored software installed by the bootstrap is therefore not new; it is how the platform's own Shadow agent arrives.

### 3.1 The data layers

| Layer | Rocky learns | From | Needs | Label |
|---|---|---|---|---|
| **0 Identity** | ODL id, DeploymentID, template / lab code, learner UPN, tenant, subscription; resource group, region, VM size | Bootstrap parameters written to `C:\ProgramData\Rocky\lab.json`; Azure IMDS `169.254.169.254` for RG / region with no credentials | Nothing | VERIFIED |
| **1 Lab spec** | The click-map bundle (steps, selectors, WHY / WHAT / TIP), the guide markdown, expected resources | Bundle from **our own registry** (a blob container, `bundles/<labCode>/<portalBuild>.json`); guide from the GitHub masterdoc; ARM template from its blob URL | Nothing (our storage) | VERIFIED sources; registry is ours to create |
| **2 Live environment** | Real deployment errors, resources actually created, expected vs observed | Lab service principal via `Create` + `Send Service Principal` and the `GET-SERVICEPRINCIPAL-*` tokens; `az deployment operation group list`, `az resource list` inside the VM | Two template checkboxes; a security conversation | VERIFIED feature; SP scope UNKNOWN. **Not in this demo.** |
| **3 Platform state** | Validation definitions, the learner's pass/fail, trigger validate, deployment activity log | CloudLabs partner API, polled 10–20 s with back-off | A read-mostly partner credential | VERIFIED endpoints. **Not in this demo.** |

The demo runs on layers 0 and 1. That is deliberate: it proves "Rocky ships with the lab and knows which lab it is" with no platform ask at all. Layers 2 and 3 are the next-quarter rungs and are written up in `in_lab_validation_plan.md` and `final_build_strategy.md`.

### 3.2 Sequence at deploy and at launch

```
CloudLabs deploy ─► ARM ─► JumpVM ─► Custom Script Extension
                                      │  psscript-01.ps1 (house bootstrap, unchanged)
                                      └► Install-Rocky   (new function, last in the script)
                                            1. download rocky-package.zip from our blob (SAS)  → C:\ProgramData\Rocky
                                            2. write lab.json {odlId, deploymentId, labCode, upn, tenant, subscription, portalBuild}
                                            3. fetch bundles/<labCode>/<portalBuild>.json → webext\bundle\test-bundle.json
                                            4. create Public Desktop shortcut "Lab Portal (with Rocky)"
                                            5. (optional) scheduled task at logon: open the portal with Rocky
                                            6. transcript → C:\WindowsAzure\Logs\RockyBootstrap.txt

Learner logs on ─► shortcut ─► msedge.exe --user-data-dir=%LOCALAPPDATA%\Rocky\Edge
                                        --load-extension=C:\ProgramData\Rocky\webext
                                        --no-first-run https://ai.azure.com
               ─► content script loads bundle/test-bundle.json (now the lab's bundle)
               ─► resolver runs → Rocky flies to step 1
```

**Why the bundle is dropped into the extension folder rather than pushed through storage:** the content script already prefers `lpBundle` in storage and falls back to the file in the folder. Replacing the file means **zero changes to the extension for the demo**. The native-messaging route (agent hands the bundle and lab context to the extension at run time) is the proper design for the VM agent phase and is listed under later work.

### 3.3 Edge loading — tested today

- `--load-extension` **works on Edge 153 when Edge is started fresh with it.** VERIFIED today in an isolated profile: the extension registered in `Secure Preferences` with and without the `DisableLoadExtensionCommandLineSwitch` feature flag. The earlier failure in your Work profile was because Edge was already running, so the switch was handed to the existing process and ignored. The launcher therefore uses a **dedicated `--user-data-dir`**, which also keeps the lab profile separate from anything else on the VM.
- **UNKNOWN, test in the VM:** whether Edge shows a "developer mode extensions" prompt at start-up. Mitigation if it does: dismiss it once in the image profile so the dismissal ships with the image, or move to a signed package pushed by policy.
- **Policy route (later, not for this demo):** `ExtensionInstallForcelist` from a self-hosted signed package. Edge documents this policy as available on Windows only when the device is domain-joined or MDM-enrolled; a CloudLabs JumpVM is a workgroup machine (Server Domain blank). UNKNOWN whether a Store-published extension bypasses that. Publishing to the Edge Add-ons store needs a Spektra Partner Center account. ASK.

---

## 4. How it works and why it is accurate

**One idea:** separate *what* to guide (a portable JSON bundle) from *how* to find it (a resolver per surface), under one accuracy contract.

**The contract, enforced in code (VERIFIED in `anchor-engine.js`):** a control glows only when (1) no captured attribute contradicts it, (2) its score reaches 0.70, and (3) it beats the runner-up by 0.20. Text alone scores 0.60 and cannot clear the floor; role alone never resolves. Outcomes are exactly *resolved*, *ambiguous* or *absent*; the last two produce an honest card, never a glow. Absent information is not a contradiction: a page without test ids still resolves on text plus role.

**Advance on truth (VERIFIED in `content.js`):** the pointer moves only on a real click on the glowed control. A bounded one-step lookahead detects completion by navigation; there is no forward scan. Misnavigation shows a "get back on track" card. Full-page navigation resumes at the same step.

**Where the AI is:** authoring (step text and WHY / WHAT / TIP were drafted from the guide and are rendered verbatim) and Ask Rocky (labelled, opt-in, learner's own deployment). The AI never touches the pointing loop. The whole demo runs with Ask Rocky switched off.

**Accuracy evidence to quote:** contract constants above; deck figure 300+ automated checks across browser and VM builds (Kiran's repo; not in the zip, ask for the test run output); repo reference resolver 17 tests including a 25-run determinism test. **For this demo the accuracy proof is the rehearsal resolve report** (section 6, gate G2): every step of the bundle resolved on the lab tenant's portal build, recorded before the meeting.

---

## 5. The VM package

### 5.1 Layout

```
rocky-package.zip
├─ webext\                    LabPilot · Rocky 0.7.1 (unpacked; hygiene fixes applied)
│   └─ bundle\test-bundle.json   ← replaced per deployment by the lab's bundle
├─ bin\
│   ├─ Rocky-Launch.ps1       starts Edge with the dedicated profile + extension, opens the portal
│   ├─ Rocky-Preflight.ps1    VM checks: egress, Edge version, extension registered, bundle present
│   └─ Rocky-Uninstall.ps1    removes everything under ProgramData\Rocky, the shortcut and the task
├─ bundles\                   shipped copies for offline fallback (test-bundle, full-bundle)
├─ agent\                     (phase 2) rocky-agent.exe — Kiran's UIA agent; empty in this demo
├─ VERSION.json               package version, build commit, portal build the bundles were captured on
└─ README.txt
```

Install root `C:\ProgramData\Rocky`. Logs `C:\WindowsAzure\Logs\RockyBootstrap.txt` (the house log folder, so support finds it). No secrets in the package. No listening ports. Nothing runs as System after install; the launcher runs as the logged-on learner.

### 5.2 The bootstrap hook — three ways in, ranked

| Route | How | Status | Use |
|---|---|---|---|
| **Custom Script Extension (recommended for the demo)** | Add `Install-Rocky` to our template's `psscript-01.ps1` (or add `rocky-bootstrap.ps1` to `fileUris` and call it). One CSE per VM is the Azure limit, so we extend the existing script rather than add a second extension. Pass identifiers only. | VERIFIED mechanism; our own template, our own ARM | Demo |
| Deployment Script Repository, *Run On: Deployment Success* | Template-level PowerShell with token-mapped parameters | VERIFIED feature; **UNKNOWN whether it executes inside the VM or in CloudLabs' backend**. If backend, it cannot install anything. | Test once; use if it runs in the VM |
| Custom VM image (Compute Gallery, Specialized) | Package pre-installed in the image; bootstrap only writes `lab.json` and the bundle | VERIFIED route; 15 min+ per image version | Production; not for the first demo, because every package fix would mean an image rebuild |

**Secrets rule:** CloudLabs logs the CSE `commandToExecute` in deployment history (known gotcha from the Purview lab). Rocky's parameters are ODL id, DeploymentID, lab code, UPN, tenant, subscription, bundle base URL. Never the learner password.

**Egress:** the bootstrap downloads from our blob over 443. If the JumpVM has no outbound internet the lab cannot reach ai.azure.com either, so this is not an extra dependency; but the package also embeds the demo bundles as an offline fallback.

### 5.3 Template and ARM changes (your Submit clicks, my preparation)

1. Clone an existing Azure template you own → rename → set the toggles in section 2.
2. ARM: our own `deploy-01.json` hosted in blob with SAS: JumpVM (Windows 11, `Standard_D2s_v5` or the lab's usual size), NSG, CSE with `fileUris` = [`psscript-01.ps1`, `rocky-bootstrap.ps1`], outputs unchanged (`vmServerDnsName`, `vmServerUsername`, `vmServerPassword`, `labVmName`).
3. Deployment Script Repository: none for the demo (avoid the double-run gotcha).
4. VM Configuration: map the four output names.
5. Guide: repo with `masterdoc.json` + `Lab-Guide/Task-1..3.md` (Learn-style, our words).
6. ODL: Registration Required, duration 240 min, 2 seats (you + a rehearsal seat), expiry after the meeting.

---

## 6. Build and test plan — phases with gates

| Phase | Work | Owner | Gate |
|---|---|---|---|
| **P0 Decisions** (today) | Approve option B; confirm GPT-5 quota in the Shared pool region; choose the blob account for the registry; ask Kiran for repo access, test output and the VM agent build | You / Spektra / Kiran | **G0** answers in hand |
| **P1 Package** (1–2 days) | Build `rocky-package.zip` from the shared zip with hygiene fixes; write bootstrap, launcher, preflight, uninstall; write the Learn-style guide and the ARM template; **local test on this laptop**: fresh Edge profile via the launcher, bundle swap, all 16 steps resolve on ai.azure.com in the lab tenant, Explore and Ask Rocky checked, uninstall clean | Me | **G1** local resolve report: 16/16 resolved, 0 wrong glows, launcher idempotent |
| **P2 Lab wiring** (½ day + 30 min deploy) | Upload package, scripts, ARM to blob (SAS to outlast the ODL); create template and ODL (**your clicks**); launch one seat | You (portal) / me (prep) | **G2** in the VM: egress OK · bootstrap log clean · shortcut present · Edge starts with Rocky · 16/16 resolved on the VM's Edge · RDP-over-HTTP performance acceptable |
| **P3 Rehearsal** (½ day) | Full run as a learner from Launch to confetti; time it; re-capture any drifted step with capture mode and republish the bundle; run the fallback (route C) once; write the runbook | Me, you as learner | **G3** rehearsal recorded end to end; runbook signed off |
| **Demo** | Runbook, both routes ready, quota re-checked the morning of | You | |

Estimated total: **3–4 working days** to a rehearsed live demo, assuming quota and egress are fine. The long pole is the template deploy cycle (~30 min per iteration), which is why the package is tested locally first.

**Kill criteria, stated up front:** no GPT-5 quota in the lab region → switch the bundle's model step to whatever is available (the search step's value and the card text change; ten-minute re-capture). Edge dev-mode prompt cannot be suppressed → accept it on the day (one click) and note the signed-package route. JumpVM egress blocked → route C.

---

## 7. Risks and unknowns

| Risk | Likelihood | Mitigation |
|---|---|---|
| Portal build drift between capture and demo day | Medium | Rehearse ≤24 h before; re-capture drifted steps; honest card + Next covers anything missed. Ordered fallback selectors already absorb single-attribute changes. |
| GPT-5 card named differently in the lab tenant (`gpt-5.6-sol`) | Medium | The `t2-selectgpt5` step has 3 selectors; adjust text; re-capture. |
| Edge developer-mode prompt in the VM | Unknown | Test at G2; dismiss in image profile; signed package later. |
| Deployment Script runs in backend not VM | Unknown | We use the CSE anyway. |
| Acceptable-use for partner software in a lab VM | Unknown | The platform's own Shadow agent is installed by the same bootstrap; still, ask a human first (cheapest question). |
| Quota / spend on a GPT-5 deployment | Low | One deployment, deleted after; approve the spend up front. |
| RDP-over-HTTP makes Rocky's flight look choppy | Medium | Keep animation short in the bundle settings if needed; fallback route C shows him at full smoothness. |
| Two implementations (repo reference vs Kiran's build) confuse a technical reviewer | Low | The package ships Kiran's build only; the repo reference stays as the tested resolver spec. |

---

## 8. What I need from you, Spektra and Kiran

**You (decisions):**
1. Approve option B and the phase plan.
2. Which lab subscription / region has GPT-5 quota, and approval for one deployment's spend.
3. Which storage account hosts the Rocky registry and ARM (the one your ARM templates already use is fine).
4. Whether to include a single PowerShell validation ("deployment `mygpt` exists") for a validation moment in the demo. Optional.

**Spektra (asks, humans):**
5. Acceptable-use: partner-authored agent in a lab VM. Yes or no, in writing.
6. Whether Deployment Scripts execute in the lab VM or the backend (informational; we use the CSE).
7. Later: Edge Add-ons publisher account or a code-signing route for the extension.

**Kiran:**
8. Repo access (tests, compiler, capture ingest), the last green test run output, and the VM agent source plus `build-exe.ps1` for phase 2.
9. Confirmation that 0.7.1 is the build to ship and whether a newer capture of the Foundry portal exists.

---

## 9. Later work (not in this demo, already designed)

- **VM agent phase:** Kiran's UIA agent in `agent\`, started at logon; native-messaging host so the extension receives bundle and lab context at run time; desktop and VS Code steps.
- **Layer 2:** `Create` / `Send Service Principal` on the template; Rocky reads real deployment errors and resources; honest refusals become diagnoses.
- **Layer 3:** partner API provider in `src/contextProvider.js`; validation state seeds the step pointer; re-validate after fixes; escalation packet.
- **Author-from-guide:** LLM drafts a bundle from the guide markdown; capture mode verifies; live drift audit as a scheduled job against each bundle.
- **Production distribution:** Specialized image in the Compute Gallery; signed extension via policy or store; telemetry limited to resolve / absent rates and completion funnels.
