# Running Rocky in a real CloudLabs lab — without the partner API

**Date:** 2026-08-20
**Question:** can we skip the blocked partner API and prove Rocky against a real CloudLabs lab —
by installing it in a deployed lab, or otherwise?
**Answer:** yes. There are five routes, four of them documented CloudLabs features, and the
recommended first one puts **no software in the lab at all**.

Basis: the official docs at help.cloudlabs.ai (16 pages fetched), the prior authenticated Cosmos
session, Azure documentation, and a live portability test of Rocky on a simulated bare VM.
Everything below is marked **VERIFIED** (quoted from CloudLabs docs), **INFERRED**, or
**UNKNOWN — must test**.

---

## 1. The unlock we already had and did not notice

The blocker was always "CloudLabs will not give an external system cloud credentials" — which the
Cosmos session confirmed. That is true of the **partner API**. It is not true of the **lab**.

Two template settings, quoted verbatim from `adding-azure-template`:

> **`Create Service Principal`** — *"a Service Principal will automatically get created in the user environment."*
>
> **`Send Service Principal`** — *"The details of the Service Principal, such as Application ID, Application secret key, subscription ID, Tenant ID, and Tenant domain, will be exposed to users in the lab details page."*

**VERIFIED.** CloudLabs will hand a **non-interactive Azure credential** to whoever launches the
lab. Manoj owns templates and can launch his own lab. So the credential problem is solved by a
checkbox — and it sidesteps the Temporary Access Pass / MFA wall that stalled the Purview lab,
because a service principal has no MFA.

That single fact is what makes everything below possible.

---

## 2. What Rocky could then prove, for real

Rocky today asserts findings from **guide text** (real — 133 defects) and from **fixture telemetry**
(simulated). With a lab's own service principal, three of its five engine inputs convert from
fixture to real:

| Engine input | Today | With lab credentials | How |
|---|---|---|---|
| Deployment errors (`deploymentActivityLog`) | fixture | **REAL** | `az deployment operation group list -g <rg>` — real `SkuNotAvailable`, quota, authorisation failures |
| Expected state (`validations[].expected`) | fixture | **REAL, machine-readable** | `az deployment group show` → the ARM parameters/outputs actually deployed. No prose parsing needed |
| Observed state (`validations[].observed`) | fixture | **REAL** | `az resource list -g <rg>` — actual names, regions, SKUs, provisioning state |
| Lab guide | already real | **REAL, and now the guide of the lab actually running** | existing scanner, unchanged |
| Lab identity | n/a | **REAL, needs no credentials at all** | Azure IMDS `169.254.169.254` returns subscription, resource group, region, VM size |

That makes Rocky's core claim — *expected versus observed, therefore a defect* — **genuinely true
on a real lab** for the first time. The region-mismatch story stops being a fixture.

**What stays impossible, whatever we do.** Be strict about this; it protects the pitch:

- **Any fleet view.** One lab, one seat. Cohorts, cross-lab patterns, fleet health, the
  `MIN_AFFECTED` logic — no in-lab source exists. The dashboards stay labelled SIMULATED.
- **CloudLabs' own validation pass/fail.** Rocky can compute its own verdict; it cannot read the
  platform's.
- **Step progress, time-on-step, retries.** Held by the platform. So guide-clarity findings remain out.
- **Deployments that fail before the VM exists.** No VM, no agent. This is the structural blind spot
  of any in-lab approach, and it happens to be our flagship fixture story. Say it out loud before
  someone asks.

---

## 3. The five routes, ranked

### ① Zero-footprint — Rocky on your laptop, real lab, real credentials **← start here**
Create your own On Demand Lab with `Create Service Principal` + `Send Service Principal` enabled.
Launch it as a learner. Copy the service-principal details from the lab details page into Rocky.
Rocky reads the real resource group, the real deployment errors, the real guide — from your laptop.

- **Nothing installed in the lab.** No acceptable-use question, no security review, no platform ask.
- Works whether or not the VM has internet, admin rights, or Node.
- The demo is the *diagnosis* being real, which is the part that matters.
- Effort: small. New code — an Azure reader — but no CloudLabs work beyond the ODL you already
  know how to create.
- Risk: essentially none. Reading your own lab with credentials the platform handed you.

### ② `Deployment Script Repository` — the documented in-lab hook
A template-level field, not an ARM edit. Docs, verbatim: *"This feature allows you to run any or
multiple PowerShell scripts which can be utilized for automation in different scenarios."* Four
trigger points: **Deployment Initiation · Deployment Success · Manual Run · Deployment Deletion**.

- **VERIFIED as a feature.** `Deployment Success` is exactly the hook a lab-QA agent wants.
- **UNKNOWN:** whether these run in CloudLabs' backend or in the lab tenant, and as which identity.
  That decides whether this is an install mechanism or a validation mechanism. Ask Cosmos.

### ③ ARM Custom Script Extension in your own template
CloudLabs' own base templates already use it: *"which will use the Windows Custom Script Extension
script to setup the needed configurations in the backend"* (e.g. `InstallPython`). You author and
host the ARM template yourself, in your own blob storage.

- **VERIFIED** that the mechanism exists and CloudLabs uses it. Windows only.
- **INFERRED** that you may add *your own* extension pointing at *your own* script. The docs only
  document toggling CloudLabs' preset software flags. Settle by test, not by asking.
- Constraint: the template `Outputs` section is mandatory and must stay default.

### ④ Custom VM image via Azure Compute Gallery
Fully documented (`creating-the-vm-images`): build a VM, install what you want, capture to an Azure
Compute Gallery as a **Specialized** image version, point the template at it.

- **VERIFIED.** This is how you would ship Rocky for real, later.
- Heaviest option: image build, 15+ minutes per version, regional replication, ongoing maintenance.
- The template field `Any Pre-Manual Steps Required` exists precisely for this.

### ⑤ Rocky's checks as a CloudLabs **PowerShell Validation** — the native path
The most interesting finding, for the product rather than the demo. Validations run **as Azure
Functions in CloudLabs' own backend**, and — quoted — *"You don't have to handle the authentication
part in your PowerShell scripts for validations because the authentication script for Azure/AWS will
be automatically appended to the beginning of your PowerShell script."* They run as **System**
(CloudLabs' service principal) or **AAD Principal**, take template outputs as parameters, and return
`@{Status="Succeeded"; Message="…"} | ConvertTo-Json`.

That is a first-party, authenticated, already-supported place to run diagnostic logic. It is not a
demo route — it is the answer to "how would this ship as a platform feature", and it is worth
knowing that the socket already exists.

---

## 4. The first experiment — one session, pass/fail

**Goal:** prove Rocky can diagnose a real CloudLabs lab. Kill it fast if it can't.

**Manoj only** (portal Create/Submit — mine to prepare, yours to click):
1. Create a template (or clone an existing one you own) with **`Create Service Principal` = yes**
   and **`Send Service Principal` = yes**. Point it at a lab you know well.
2. Create an ODL from it, register one seat — yours. This is the "Rocky QA" event the safe-validation
   ladder already called for (rung M1).
3. Launch it. Note from the lab details page: Application ID, secret key, subscription ID, tenant ID,
   resource group name.

**Then, inside the running lab, four checks that settle everything** (I can script these; each takes
seconds):

| # | Check | Settles |
|---|---|---|
| 1 | `az login --service-principal -u <appId> -p <secret> --tenant <tenant>` | Does the credential work non-interactively? **The whole thesis.** |
| 2 | `az deployment operation group list -g <rg>` | Are real deployment errors readable? (the fixture replacement) |
| 3 | `az resource list -g <rg>` + `az deployment group show -g <rg> -n <dep>` | Real observed vs real expected? |
| 4 | `curl -I https://raw.githubusercontent.com` from the lab VM | Egress open? (decides routes ②–④) |

**Pass:** checks 1–3 succeed → route ① is live and I build the Azure reader.
**Fail on 1:** the SP isn't usable → fall back to the learner running Rocky by hand in the lab, and
the pitch changes from "agent watches the lab" to "learner runs the check" — still real, still a demo.

**What I can prepare in advance, before you click anything:** the collector script, the
`InVmContextProvider` that feeds Rocky's existing engine (there's already a provider seam in
`src/contextProvider.js` next to `FixtureContextProvider`), and a redacted-by-default output format.
No engine changes — the whole point is that the engine stays the same and only the data source
becomes real.

---

## 5. Rocky is already portable — tested, not assumed

I copied the prototype to a folder outside the repo, deleted `.env.local` and `logs/`, pointed
`REAL_LABS_DIR` at a non-existent path, and booted it:

- **1.2 MB, 90 files, zero npm dependencies.** Minimum Act 2 kit: ~465 KB / 36 files.
- Every page served. Every endpoint either worked or returned a labelled `available:false`.
- **The engine worked**: scanning an arbitrary guide found the retired model and the renamed product
  at their exact lines, in 2 ms.
- One 500: the pre-staged sample cards (they need `Demo-Uploads` two levels above the prototype).
- One cosmetic defect found and fixed: git's *"fatal: not a git repository"* leaking to stderr on boot.

**Kit hygiene — required before Rocky goes anywhere near a customer-facing VM:**

1. **Do not ship `web/copilot-kb.json`.** It is served publicly at `/api/qa` and it is candid
   internal material — including why the AI is off and exactly which parts of the demo are simulated.
2. **Bind to localhost.** `server.listen(PORT, …)` currently binds `0.0.0.0` with no auth.
   One-word fix: `server.listen(PORT, '127.0.0.1', …)`.
3. **Strip personal paths from data files.** `real-scan-results.json`, `campaign-plan.json` and the
   intent drafts contain `C:/Users/ManojGowda/OneDrive - Spektra Systems LLC/…` and are returned
   verbatim in API responses.
4. **Watch the fixture secret.** `fixtures/lab-context.json` carries a deliberately fake
   `sk-live-abcd1234` for the redaction test. On a DLP-monitored VM that string starts a conversation.
5. **Never copy the repo folder** — only a purpose-built kit. The repo carries strategy docs,
   competitor analysis, the Cosmos discovery write-up and lead emails.

---

## 6. Open questions — for Cosmos AI chat, and for a human

Answered by the docs already: service principal injection, Deployment Script Repository, custom VM
images, CSE mechanism, inject keys, validation authoring. **Do not re-ask those.**

Still genuinely unknown — worth Manoj's time in Cosmos chat:

1. **Deployment Script Repository:** do those PowerShell scripts run in CloudLabs' backend or in the
   lab tenant, and under which identity? *(Decides whether ② is an install hook or a validation hook.)*
2. **Own Custom Script Extension:** may a template owner add their own `CustomScriptExtension`
   resource pointing at their own script URL, without platform-team review? *(Docs only show
   CloudLabs' preset toggles.)*
3. **Outbound internet from the JumpVM:** unrestricted on 443, or filtered? Name the control.
   *(Not in the docs at all. Faster to test than to ask.)*
4. **Local administrator** on the JumpVM — the docs only ever say "VM Admin Username", never state
   the learner is an admin.
5. **Service principal scope:** is the injected SP scoped to the resource group or the subscription,
   and with which role? *(Decides how much Rocky can read.)*
6. **My own event's results without partner credentials:** can a lab owner export per-attendee
   validation results for their own event as CSV from the Admin Center UI? *(If yes, the fleet
   dashboards could run on real data with no API at all.)*

**Ask a human, not the AI:** whether any written acceptable-use or security standard governs running
partner-authored software inside a lab. A model will invent a plausible policy title. This is the one
thing that can veto routes ②–④, so it is also the cheapest thing to ask first — and asking first is
good politics.

Rule for reading any Cosmos answer: if it does not name an exact field, route, or document title,
treat it as UNKNOWN however confident the prose sounds. That was the dominant failure mode last time.

---

## 7. Recommendation

Do route ① first: **your own ODL, service principal enabled, Rocky reading it from your laptop.**
It needs no permission from anyone, puts nothing in the lab, and converts the single most important
claim — *Rocky diagnoses real labs* — from simulated to real. Everything else (in-lab install,
custom image, native validation) becomes a follow-on once the diagnosis is proven and the
acceptable-use question has a human answer.

The honest headline it earns: **"this is a real CloudLabs lab, and Rocky found the fault in it from
the lab's own deployment data."** Today we can only say that about guide text.
