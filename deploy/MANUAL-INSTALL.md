# Rocky in a lab, by hand — the ten-minute route

For the demo, and for any lab you want to try Rocky in without building a new template.
Deploy a lab you already own, run one command inside it, and Rocky is live with the real
lab identity.

**This is the same install the automatic route performs.** The command calls the same
bootstrap the CloudLabs Custom Script Extension would call, with the same arguments,
writing the same `lab.json`. So a successful manual run is genuine evidence the automatic
route will work, not a rehearsal of a different thing.

---

## What you need first

| | |
|---|---|
| A lab you can deploy | Any existing Azure template of yours. It does not need to be the Foundry lab — Rocky guides the portal, not the VM |
| The package in blob storage | `rocky-package.zip` and `Install-Rocky.ps1`, with a SAS that outlasts the demo |
| GPT-5 quota | Only if you want the learner to complete the deployment step live |

Build and publish the package:

```
cd vmpackage
powershell -ExecutionPolicy Bypass -File .\build-package.ps1
```

Upload `dist\rocky-package.zip` and `bin\Install-Rocky.ps1` to a container, and generate a
read SAS. **The SAS must outlast the demo** — an expired one fails at the download with a
403 and nothing else works.

---

## In the lab VM: one command

Launch the lab, open the VM, start **PowerShell as Administrator**, and run:

```powershell
iwr 'https://<account>.blob.core.windows.net/rocky/Install-Rocky.ps1?<sas>' -OutFile i.ps1
.\i.ps1 -PackageUrl 'https://<account>.blob.core.windows.net/rocky/rocky-package.zip?<sas>' -DeploymentID <id>
```

The Deployment ID is on the lab's **Environment Details** tab. Everything else is optional.

The script downloads the package, installs it, works out what it can about the environment,
prints exactly what Rocky now knows, runs the preflight, and opens Edge on the portal with
Rocky already guiding.

**Administrator matters** only for the desktop shortcut and the logon task. Without it the
install still works and you open Rocky from the launcher.

---

## How Rocky knows which lab he is in

He reads one file, `lab.json`, written at install time. It is filled from three places:

| Field | Where it comes from |
|---|---|
| Deployment ID, ODL id, learner account | What you pass on the command line (Environment Details tab) |
| Resource group, region, subscription, VM name, VM size | **Azure instance metadata**, read by the VM about itself at `169.254.169.254`. No credential, and it cannot be faked |
| Lab code, portal build, start URL | The install command, defaulting sensibly |

Anything you do not supply, he does not claim to know. Ask him about it and he says so.

He also picks up the lab user automatically from `C:\LabFiles\AzureCreds.txt` when the
CloudLabs house bootstrap has already run, which it has in any normal lab.

**What he can then answer, from record rather than from a model:** which lab this is, which
ODL and deployment, the resource group and region, which VM, who is signed in, which step
of how many, how long you have been going. Those answers are instant and cannot be wrong.

**What he refuses to answer:** anything about other learners, the platform's own validation
results, or your cloud resources. He can see this page and this lab. Asked about the rest he
says so plainly rather than improvising — which is the whole reason the other answers can be
trusted.

---

## Check it worked

```powershell
powershell -File C:\ProgramData\Rocky\bin\Rocky-Preflight.ps1
```

Every line should be green. Then, by eye:

- [ ] Rocky appears bottom-right when the portal loads
- [ ] he glows the first control of the lab
- [ ] click the wrong button — he names it and redirects you
- [ ] click Rocky → **Explore**, hover any control — he explains it
- [ ] ask him "which lab am I in" — he answers from `lab.json`, instantly

Install log, if anything is off: `C:\WindowsAzure\Logs\RockyBootstrap.txt`.

---

## Optional: switch on Ask Rocky

Free-text questions need a model. Click the extension icon → **Ask Rocky (AI)**, paste an
Azure AI Foundry endpoint, deployment name and key, **Save**, then **Test** — it sends one
message and shows the reply, so you know before the demo.

Stored in that browser only. Never in the package, never in the repo. Everything else Rocky
does works with the AI switched off, including all the lab facts above.

---

## Remove it

```powershell
powershell -File C:\ProgramData\Rocky\bin\Rocky-Uninstall.ps1
```

Removes the package, the shortcut, the scheduled task and the browser profile. The install
transcript stays on purpose — it is the evidence of what happened.

---

## When to stop doing it by hand

Manual install is right for the demo and for trying Rocky in any lab. It is wrong as a
product: you cannot ask a Microsoft seller to run PowerShell before their own demo. Once the
acceptable-use question has a human answer, the automatic route in
[RUNBOOK.md](RUNBOOK.md) puts Rocky in the lab with no human step at all — and it is the
same install, so everything you learn here carries over.
