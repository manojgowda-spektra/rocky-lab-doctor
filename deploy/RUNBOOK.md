# Rocky live-lab demo — runbook

Everything needed to take Rocky from this repo to a live CloudLabs lab, and to run the
demo. Follow it in order. Anything marked **YOURS** is a portal click that is Manoj's, not
the build's.

---

## 0. Before anything, confirm three facts

| Fact | How | Why it stops the demo |
|---|---|---|
| GPT-5 quota in the lab subscription, in one named region | Azure portal, quota blade, or ask CloudLabs ops | The catalogue step and the whole deployment fail without it |
| The storage account for the package | Whichever account already hosts your ARM templates | The Custom Script Extension fetches from it at every deploy |
| Acceptable use: partner software inside a lab VM | Ask a human at Spektra, in writing | This is the only thing that can veto the in-VM route |

If the third answer is no, the demo still runs: skip to **Fallback** at the end.

---

## 1. Build the package

```
cd vmpackage
powershell -ExecutionPolicy Bypass -File .\build-package.ps1
```

Gates that must all pass before it will pack:
- every file the manifest declares is present
- every bundle parses and has steps
- every PowerShell script parses
- no secret or personal endpoint anywhere in the package
- the offline bundle audit is clean
- **the shipped anchor engine, in real headless Edge, resolves correctly on a deliberately
  ambiguous page, and refuses to glow where it should refuse**

Output: `vmpackage/dist/rocky-package.zip` and `vmpackage/dist/rocky-bootstrap.ps1`.

## 2. Test the install locally, before any cloud spend

```
powershell -ExecutionPolicy Bypass -File .\test\install-local.ps1
```

This runs the bootstrap exactly as the Custom Script Extension will, then the preflight,
then opens Edge with Rocky on the mock portal page, and finally uninstalls. If this is not
clean, nothing about the lab will be.

## 3. Publish the artefacts **YOURS**

Upload to the storage account, in a container such as `rocky`:
- `rocky-package.zip`
- `rocky-bootstrap.ps1`
- `deploy/deploy-01.json` and `deploy/deploy-01.parameters.json`

Generate a SAS that **outlasts the ODL** — ARM re-fetches on every learner launch, so an
expired SAS breaks future deployments, not just the first. Put the two Rocky URLs into
`deploy-01.parameters.json`, replacing the `REPLACE-WITH` placeholders, and set `location`
to the region with quota. Re-run `node deploy/validate-arm.js`: it must report zero
failures and no remaining placeholder warnings.

## 4. Create the template **YOURS**

Admin Center → Templates → ADD, or clone an Azure template you already own.

| Field | Value |
|---|---|
| Name | Develop AI with Microsoft Foundry, guided by Rocky |
| Cloud Platform | Microsoft Azure |
| Cloud Usage Type | Cloud Resource Usage |
| Subscription Type | Shared |
| Approx. Deployment Duration | 15 |
| Cloud Template URL | blob URL + SAS of `deploy-01.json` |
| Parameter Template URL | blob URL + SAS of `deploy-01.parameters.json` |
| Excluding Output Parameters | `vmServerPassword`, `trainerUserName`, `trainerUserPassword` |
| User Lab Experience Types | RDP over HTTP |

Toggles: **ON** — Enable VM Access Over HTTP, Enable Dynamic Parameters, Install VM Agent
for Idle Detection, Show Resources Tab. **OFF** — Create Service Principal, Allow Global
Admin Privilege, Enable Lab Validation (nothing to validate in this demo), Hackathon.

Deployment Script Repository: **leave empty**. The ARM Custom Script Extension already runs
the bootstrap; registering it again would run it twice.

VM Configuration: Name `labvm-<DeploymentID>`, Type RDP, and map Server DNS Name /
Username / Password to the ARM **output names** `vmServerDnsName`, `vmServerUsername`,
`vmServerPassword`.

## 5. Publish the guide **YOURS**

```
node deploy/build-guide.js
```

Push `deploy/lab-guide/Lab-Guide/*.md` to the lab-guide repo, replace `RAW_BASE` in
`masterdoc.json` with the raw GitHub base for that repo and branch, and set the template's
**Github Master Document URL** to the masterdoc. The guide is generated from the same
bundle Rocky runs, so the two cannot disagree.

## 6. Create the ODL and launch **YOURS**

On Demand Labs → ADD. Map the template. Registration Required, duration 240 minutes,
2 seats (you and one rehearsal seat), expiry the day after the demo. Register yourself,
launch, and wait out the deployment.

## 7. Gate G2 — prove it in the VM

In the lab VM, open PowerShell and run:

```
powershell -ExecutionPolicy Bypass -File C:\ProgramData\Rocky\bin\Rocky-Preflight.ps1
```

All green is required. Then check, by eye:

- [ ] `C:\WindowsAzure\Logs\RockyBootstrap.txt` has no warnings you have not already seen
- [ ] the desktop shows **Lab Portal (with Rocky)**
- [ ] the shortcut opens Edge and Rocky appears bottom-right
- [ ] `lab.json` carries the real ODL id, deployment id, resource group and region
- [ ] all 16 steps resolve on this tenant's portal build, end to end
- [ ] Rocky's flight is smooth enough over RDP-in-browser

Any step that does not resolve: open Rocky's popup, turn on capture mode, click the real
control, export `labpilot-captures.json`, update the bundle, and republish it to the
registry. No redeploy needed if `rockyBundleBaseUrl` is set.

## 8. Rehearse — no more than 24 hours before

Run the whole thing as a learner, from Launch to confetti. Time it. Then run the fallback
once, so both paths are warm. Re-check GPT-5 quota on the morning of.

---

## Demo, in order

1. Open the CloudLabs lab page. Show that this is an ordinary ODL, nothing special.
2. Launch. While it deploys, say what is happening: CloudLabs is building the environment
   and, in the same step, installing the copilot and telling it which lab this is.
3. Open the VM. Double-click **Lab Portal (with Rocky)**.
4. Rocky appears and glows **Deployments**. Follow him: catalogue, gpt-5, name, Deploy.
5. While the model provisions, click Rocky and choose **Explore**. Hover a control the lab
   never mentions; he explains it. Hover something destructive; he blocks the click.
6. Go to the playground, send a prompt, get a real answer from the model you just deployed.
7. Confetti.
8. Close with the honest part: a step he cannot identify shows a card and Next, never a
   wrong glow. Offer to show it by pointing the bundle at a stale selector.

**If something breaks mid-demo:** Rocky's control bar always has Next. Use it and keep
talking. That is the designed behaviour, not a save.

---

## Fallback: presenter's browser, same lab

If the in-VM route is blocked or fails on the day, the demo is identical except Edge runs
on your laptop:

```
powershell -ExecutionPolicy Bypass -File vmpackage\bin\Rocky-Launch.ps1 -Root <repo>\vmpackage
```

Same ODL, same tenant, same bundle, same Rocky. The only claim you drop is "it ships inside
the lab". Say that plainly rather than glossing it.

---

## Uninstall / reset between runs

```
powershell -ExecutionPolicy Bypass -File C:\ProgramData\Rocky\bin\Rocky-Uninstall.ps1
```

Removes the package, the shortcut, the scheduled task and the browser profile. The
bootstrap transcript stays, on purpose: it is the evidence of what happened.
