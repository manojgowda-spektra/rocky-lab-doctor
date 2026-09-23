Rocky — guided hands-on labs (Chrome/Edge extension)
====================================================

Rocky is your lab copilot: he floats beside the EXACT next control, points at it,
and tells you what to do — click by click — right inside the portal.

INSTALL (1 minute)
  1. Open  chrome://extensions   (or  edge://extensions)
  2. Turn on "Developer mode" (top-right)
  3. Click "Load unpacked" and select this  webext  folder
  4. "LabPilot . Rocky" appears.

TRY IT
  1. Go to  https://ai.azure.com  and open (or create) a project.
  2. Rocky appears and starts guiding the "deploy a model" walkthrough.
  3. Follow the glow. Rocky flies to each control, points, and explains the step.

ROCKY IS THE ONLY UI - CLICK HIM
  There is no toolbar. Click Rocky and his options fan out in a ring around him:
    < Back      previous step               Next >     next step (use it if a control looks
    Finish      confetti finish any time                different on your build)
    Restart     start over                  Learn      WHY / WHAT panel on/off
    Explore     pause + explore (below)     Ask        ask Rocky anything (AI, see below)
    Hide        hide Rocky (he returns on the next step)
  Click Rocky again, click elsewhere, or press Esc to close the ring. Rocky stays exactly
  where he is; near a screen edge the ring bends to the side that has room.

The confetti finish also fires automatically when you reach the last step. If a step
can't be found on your portal build, Rocky says so honestly - click him and choose Next.
Keyboard: Alt+N next, Alt+P back, Alt+C celebrate, Alt+H hide, Alt+L learn panel, Alt+E explore/resume, Alt+A ask Rocky.

Rocky only glows a control when he can identify it uniquely - he never points at the
wrong thing.

EXPLORE MODE (click Rocky!)
  Click Rocky and pick "Explore". Guiding pauses and Rocky watches instead:
    - REST your mouse on any button, box or icon for a second, or DRAW A SMALL CIRCLE
      around it with the mouse (no click needed): Rocky flies there and tells you what
      it is and what it does.
    - Click something he knows and he adds a short comment.
    - Try to Delete / Remove / Purge / Regenerate a key and he STOPS the click, explains
      the consequence, and only lets a deliberate second click within 8 seconds through.
  Click Rocky -> "Resume" (or Alt+E). Exploring is remembered across pages.

ASK ROCKY ANYTHING (AI)
  One-time setup: click the extension icon -> "Ask Rocky (AI)". The Foundry endpoint is
  pre-filled; enter the MODEL / DEPLOYMENT NAME (e.g. gpt-4.1-mini) and paste the API KEY,
  Save, then Test. Everything stays in this browser only.
  Then: click Rocky -> "Ask" (or Alt+A) in either mode and type any question.
  Rocky sends your question plus lab context (current step and its notes, page title, the
  control you last looked at) - never page content, never keys. Answers are labelled AI,
  the box stays open for follow-ups, and in Explore mode an "Ask AI" button also appears
  in his explanations. The AI never decides where Rocky points - that stays deterministic.

LEARN AS YOU CLICK
  Rocky does not just point. Under every instruction he tells you WHY the step
  matters; click "What is this?" to read WHAT the technology is (deployments,
  model catalog, system messages, embeddings, RAG...) and a TIP. Alt+L toggles it.
