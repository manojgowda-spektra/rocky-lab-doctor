# Rocky inside the lab VM — the command

One line, pasted into the VM. Nothing to download by hand, no extension to side-load, no sign-in.

---

## The command

**Which shell you are in matters.** A CloudLabs Windows VM usually opens PowerShell, not Command
Prompt. Use the matching form — the two are not interchangeable, and the failure is ugly rather
than obvious.

### In PowerShell (the usual case)

Three short lines, pasted one at a time:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
```
```powershell
iwr -useb https://raw.githubusercontent.com/manojgowda-spektra/rocky-lab-doctor/main/vmpackage/agent/rocky-vm.ps1 -OutFile $env:TEMP\rocky.ps1
```
```powershell
& $env:TEMP\rocky.ps1
```

Three short lines rather than one long one on purpose: a long line pasted through a streamed VM
desktop can arrive duplicated or truncated, and lands you at a `>>` continuation prompt with no
clue which part went wrong. Each line here is valid on its own, so a bad paste fails visibly.

`Set-ExecutionPolicy ... -Scope Process` lasts only for that console. `iwr -useb` is
`Invoke-WebRequest -UseBasicParsing`. Verified in a clean Windows PowerShell 5.1 on
25 September 2026.

> **Do not paste the Command Prompt form below into PowerShell.** PowerShell expands `$f` inside
> the outer double-quoted string before the inner `powershell` ever sees it, so the command arrives
> as `=Join-Path ... -OutFile ; & -SelfTest` and throws three CommandNotFoundException errors. This
> happened on a live VM.

### In Command Prompt or the Run box

One line, with no double quotes inside the outer pair:

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Join-Path $env:TEMP 'rocky-vm.ps1'; iwr -UseBasicParsing 'https://raw.githubusercontent.com/manojgowda-spektra/rocky-lab-doctor/main/vmpackage/agent/rocky-vm.ps1' -OutFile $f; & $f"
```

Verified through `cmd.exe` on 25 September 2026. `cmd.exe` does not expand `$f`, which is exactly
why this form works there and fails in PowerShell.

The command downloads and runs a script from the public `rocky-lab-doctor` repository. That is the
whole trust story: public raw GitHub over HTTPS, no credentials, no token, nothing written outside
`%TEMP%` and `%ProgramData%\Rocky`.

---

## What you should see, in order

| Time | What happens |
| --- | --- |
| ~2 s | Console prints the lab name and its 5 pages, read from the lab's own `masterdoc.json` |
| ~3 s | A small card appears bottom-right of the VM desktop and greets the learner by the lab's name |
| ~5 s | The card reads out the prerequisites — the guide's own words, not a paraphrase |
| ~30 s | `extension installed: 30 content scripts` |
| ~35 s | `handed the extension all 5 pages: 469 lines` |
| ~40 s | Edge opens by itself, maximised, on the Purview portal, with Rocky already inside it |

If Edge opens and the console never printed those last two lines, Rocky is in the browser but
**blind** — see *If something goes wrong*.

---

## Why Rocky opens Edge himself

This is the part that looks like a flourish and is not. Edge ignores `--load-extension` for a
profile that is **already running**. A learner who clicks the ordinary Edge icon gets a browser with
no Rocky in it, no glow, and nothing on screen to say anything is missing. Opening it from the
script is the only way the extension is certainly loaded.

So: let Rocky open the browser. If the learner opens Edge themselves first, close it and re-run.

---

## Why the whole guide is handed over, not one page

Inside the VM the browser shows the portal and nothing else — no guide pane to read, no second tab
to follow. Whatever the installer hands over is what Rocky holds **until the lab ends**; nothing
inside the VM ever tells him the learner has turned the page.

Handing over page 1 would leave him reciting the prerequisites through Challenge 03. So he hands
over all five pages. Measured on this lab: the pages yield 3, 2, 1, 4 and 5 steps separately and
15 together — the same fifteen, in guide order, none lost and none invented — parsed in 3.6 ms.

---

## Options

| Flag | What it does |
| --- | --- |
| `-SelfTest` | Fetch and parse the guide, print what was found, exit. No window, no browser, no install. Run this first: it is the cheapest way to prove the VM has outbound HTTPS, which is the most likely thing to be missing. In PowerShell that is `& $env:TEMP\rocky.ps1 -SelfTest`. |
| `-Masterdoc <url>` | Another lab. Point it at that lab's `masterdoc.json` — the same file CloudLabs renders from. Defaults to the Zava Purview lab. |
| `-LabName "<name>"` | A shorter name for the card, when the lab's own title is long. |
| `-NoBrowser` | Desktop card only. Does not install the extension and does not open Edge. |
| `-Page <n>` | Hand over one page instead of all five. `0` (the default) means the whole guide. |
| `-NoUi` | Parse and print only. No card. |

Example — check a different lab without touching the VM desktop:

```
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=Join-Path $env:TEMP 'rocky-vm.ps1'; iwr -UseBasicParsing 'https://raw.githubusercontent.com/manojgowda-spektra/rocky-lab-doctor/main/vmpackage/agent/rocky-vm.ps1' -OutFile $f; & $f -SelfTest -Masterdoc 'https://<raw-url>/masterdoc.json'"
```

`-SelfTest` exits non-zero if the guide parsed but yielded nothing to say, so it is safe to use as a
pre-session check.

---

## What Rocky will not do

He will not click anything, will not read keystrokes, will not type into a form, and will not claim
a step is finished that he has not seen finished. He says what the guide says and what he can see.
That is the same contract the browser half keeps.

---

## If something goes wrong

**`browser half unavailable (...)`** — the VM could not reach `github.com` to fetch the extension.
The desktop card still works and still reads the guide; only the in-browser half is missing. Check
outbound HTTPS from the VM.

**`the extension copied incompletely (N of 30 content scripts)`** — a partial copy. Delete
`%ProgramData%\Rocky\webext` and re-run; the installer refuses to continue on a short copy rather
than loading an extension that silently does nothing.

**Edge opens with no Rocky in it** — almost always an Edge that was already running. Close every
Edge window and re-run the command.

**The card never appears** — run with `-NoUi` to see whether the guide is being read at all. If the
guide reads fine with `-NoUi`, the problem is the window, not the lab.

**Nothing at all, no output** — the VM has no outbound HTTPS, so the guide itself could not be
fetched. There is no offline mode: Rocky reads the live guide or he says nothing.

---

## What has not been tested

Every line above was measured on a development machine against the live GitHub URLs and the live
lab guide. **None of it has yet run inside a real CloudLabs VM.** The things a real VM could still
break: outbound HTTPS to `raw.githubusercontent.com` and `github.com`, whether the streamed desktop
shows a `WS_EX_NOACTIVATE` window, and whether Edge there honours `--load-extension`.

That is a ten-minute check on a live deployment, and it is the last thing standing between this and
"ready to use".
