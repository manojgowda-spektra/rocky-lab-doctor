Rocky — lab copilot, VM package
===============================

What this is
------------
The copilot that ships inside a CloudLabs lab VM. Rocky stands beside the learner in the
portal, flies to the exact next control, glows it, and says the step in plain words. He
advances only when the learner really clicks. When he cannot identify a control with
confidence he says so instead of guessing: a wrong glow is impossible by construction.

Installed by
------------
The lab's ARM Custom Script Extension, alongside the house bootstrap (psscript-01.ps1).
CloudLabs passes the lab's own identifiers; the bootstrap writes them to lab.json so Rocky
knows which lab, which deployment and which learner. No credential is passed or stored.

Layout (installed to C:\ProgramData\Rocky)
------------------------------------------
  webext\         the browser extension (Manifest V3, Edge/Chrome)
    bundle\test-bundle.json   the step map for THIS lab — replaced per deployment
  bin\
    rocky-bootstrap.ps1   install: expand, write lab.json, fetch the bundle, shortcut, task
    Rocky-Launch.ps1      open the portal with Rocky (the desktop shortcut runs this)
    Rocky-Preflight.ps1   is Rocky correctly installed and can it work here?
    Rocky-Uninstall.ps1   remove everything
  bundles\        offline fallback bundles, used if the registry is unreachable
  agent\          reserved for the Windows UI Automation agent (desktop/VS Code steps)
  VERSION.json    package version, commit and the portal build the bundles were captured on

For the learner
---------------
Double-click "Lab Portal (with Rocky)" on the desktop. Edge opens on the lab portal with
Rocky already there. It also opens automatically about 45 seconds after first logon.
Click Rocky for Back, Next, Finish, Restart, Learn, Explore, Ask and Hide.
Keyboard: Alt+N next, Alt+P back, Alt+L learn panel, Alt+E explore, Alt+A ask.

For the operator
----------------
  Check it:      powershell -File C:\ProgramData\Rocky\bin\Rocky-Preflight.ps1
  Open it:       powershell -File C:\ProgramData\Rocky\bin\Rocky-Launch.ps1
  Reset a run:   powershell -File C:\ProgramData\Rocky\bin\Rocky-Launch.ps1 -Fresh
  Remove it:     powershell -File C:\ProgramData\Rocky\bin\Rocky-Uninstall.ps1
  Install log:   C:\WindowsAzure\Logs\RockyBootstrap.txt

Privacy and footprint
---------------------
The guidance runtime makes no network calls and runs no model: pointing is deterministic.
Nothing leaves the machine unless the learner turns on "Ask Rocky", which sends only the
question plus lab context (step text, page title, a control's label) to a Foundry
deployment whose endpoint and key they enter themselves. Never page content, never keys.
Rocky runs as the logged-on learner, never as System, opens no listening port, and enters
no credentials. Uninstall removes every file, the shortcut and the scheduled task.

Accuracy contract
-----------------
A control glows only when all three hold: no captured attribute contradicts it; its score
reaches 0.70; and it beats the runner-up by 0.20. Otherwise Rocky shows an honest card and
the learner can press Next. Absent information is not a contradiction; only conflicting
evidence disqualifies a candidate.

If a step cannot be found
-------------------------
The portal changed. Rocky says so rather than pointing at the wrong thing. Click him and
choose Next to carry on, and tell the lab owner so the step can be re-captured.
