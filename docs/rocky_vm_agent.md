# Rocky in the whole VM — plan

**Date:** 23 September 2026 · **Status:** feasibility proven on this machine, not yet built

Rocky is a browser extension, so he sees the portal and nothing else. The demo lab
(Microsoft IQ workshop) spends most of its length in **VS Code**, the **Windows file
picker**, **Teams** and **Outlook**. On those steps Rocky is blind, and CloudLabs Copilot —
which at least describes them — is more useful than he is.

This closes that gap.

---

## What was measured on a real Windows machine, today

Not assumed. Run against live applications:

| Question | Result |
|---|---|
| Is UI Automation available without installing anything? | **Yes.** `UIAutomationClient` is in .NET Framework, present on every Windows VM |
| Can it see other applications? | **Yes** — 15 top-level windows, named: VS Code, Chrome, Outlook, Notepad, Teams |
| Can it see *inside* VS Code (an Electron app)? | **Yes** — 3,805 elements, including **545 buttons**, 2,168 text nodes |
| How slow is a full scan of VS Code? | **674 ms** for everything; 30 ms for a targeted one |
| Does it give coordinates? | **Yes** — every element carries a bounding rectangle |
| Does it work on native apps? | **Yes** — Notepad's tabs and document read cleanly |

**A trap worth recording:** a shallow `Children` scan of VS Code returns only 3 buttons
(Minimize, Restore, Close). The real UI is deeper in the tree and needs a `Descendants`
scan. Getting that wrong would look exactly like "UIA does not work with VS Code", which is
a conclusion plenty of people have reached and it is wrong.

## The insight that makes the overlay easy

From the archived architecture, and it is correct: **CloudLabs streams the VM's desktop.**
A top-most window drawn on that desktop is, by definition, in the captured frame. Rocky does
not need to touch RDP, Guacamole or any video path. He draws a window on the VM; the
existing capture path streams it.

If it looks right on the VM, it looks right in the learner's browser.

## What gets built

A **single PowerShell script**. No compiler, no installer, no admin rights, no dependencies
beyond what Windows already ships. It drops into the package next to the extension.

```
rocky-agent.ps1
   UIA scan        find controls in whatever app is focused    (proven: 674 ms worst case)
   matcher         the SAME contract as the browser engine     (0.70 / 0.20 / no contradiction)
   overlay         a transparent always-on-top window          (WinForms layered window)
   bridge          shares the current step with the extension  (a file both can read)
```

**The contract is not re-invented.** The browser resolver scores candidates on name, role,
automation id and container text, requires 0.70, and requires a 0.20 margin over the
runner-up. The agent scores UIA elements the same way, for the same reason: a wrong glow on
the desktop is worse than a wrong glow in a page, because the learner cannot undo a click in
VS Code as easily as a click in a portal.

## How the two halves cooperate

The guide reader already parses the lab guide into ordered targets and **classifies the
surface** of each one — browser, VS Code, terminal, Windows dialog. That classification was
built last, and it is what makes this tractable:

```
guide step  ->  surface?
                browser        -> the extension glows it          (works today)
                VS Code        -> the agent glows it              (this build)
                Windows dialog -> the agent glows it              (this build)
                terminal       -> neither: say so honestly        (nothing to point at)
```

The two share the current step through a small file in the install folder. No sockets, no
native messaging host to register, nothing that needs a security review of its own.

## Order of work

1. **UIA matcher** — port the scoring contract, test it against real VS Code and Notepad
   trees. Pure logic, testable without a UI.
2. **Overlay** — transparent top-most window that draws a ring at a given rectangle. Prove
   it appears in an RDP capture, not just locally.
3. **Bridge** — the extension writes the current step and surface; the agent reads it.
4. **Wire to the guide reader** — desktop steps route to the agent automatically.
5. **Gate it** — the same discipline as the browser half: it must refuse when uncertain,
   and a test must prove the refusal.

## What this does not fix

- **Terminal steps.** A shell has no controls. Rocky can say which command the guide asks
  for, but there is nothing to glow. Copilot is the better tool there and the write-up
  says so.
- **Security review.** A process that reads other applications' UI trees is exactly the kind
  of thing a platform team should look at before it ships in an image. It runs as the
  learner, reads only, and clicks nothing — but that is a conversation to have, not a box
  to tick quietly.
- **The first launch.** The agent has to start. In the demo it is launched by the installer;
  in production it belongs in the image or a logon task.
