# Rocky next to CloudLabs Copilot — what to build, and why

**Date:** 23 September 2026 · **Trigger:** CloudLabs Copilot is live in the lab shell. Seen
running in a real lab (Nedbank SQL) alongside the guide pane.

---

## What Copilot already is, stated fairly

It is **inside the platform**, and that gives it three things Rocky cannot take by effort:

- **It knows where the learner is.** Its header reads "Page 4 · Module 2". The platform hands
  it that; Rocky has to work it out.
- **It reads the guide as data**, so it works on *every* lab from day one. No capture pass.
- **Clean, in-shell UI**, with an honest scope note: *"I can give hints and explanations, but
  I can't run commands or provide graded solutions."*

It is good. Pretending otherwise would waste everyone's time.

## The one thing it does not do

**It cannot point.** It can say *"Click on Default permission (1) and then set it to Allow
all (2)"* — which is exactly what the guide already says. The learner still has to find
"Default permission" among a hundred controls in a VS Code panel they have never seen.

Rocky glows it. That is the entire difference, and on the right lab it is a large one.

## The lab that decides this

The demo lab is **Microsoft Technical Workshop: Build AI Context with Microsoft IQ**. Read
its guide and the case makes itself. A sample of consecutive instructions:

> Click on **Continue with GitHub** … Select **File** (1) and then **Open Folder** (2) …
> Navigate to **C:\\** (1), then select the **miq-project** folder (2) and then **Select
> folder** (3) … Click **Auto** (1) and then set the model to **Claude Sonnet 5** (2) …
> Click on the **elipses** (1) and then **Remove** (2)

Hundreds of clicks across the Azure portal, VS Code, Fabric, Copilot Studio, Power Apps,
Teams and Outlook. Every one of them is a thing to point at. A learner who mis-clicks in
Copilot Studio loses ten minutes; one who mis-clicks in the Power Automate trigger silently
breaks the rest of the lab.

**This is the strongest possible lab for Rocky and the weakest for a chat window.**

## The measurement that decides the build

The guide is written in a consistent idiom, and it parses. Against a sample of its
instructions:

| | |
|---|---|
| Instruction lines | 20 |
| Machine-parseable | **20 (100%)** |
| Click targets extracted | 26 |

The `(1)`, `(2)`, `(3)` markers are not decoration — they are the **click order inside a
single instruction**, written by the lab author. Parsing them yields targets like
`(1) Models`, `(2) Trust Workspace to enable models`, `(1) Auto`, `(2) Claude Sonnet 5`.

No model needed for any of that. A regex gets it.

## So: build guide-reading, not a better chat

Rocky stops needing a captured bundle. He reads the guide pane that is already on screen,
extracts the ordered click targets, and hands them to the resolver that already exists —
the one with the 0.70 / 0.20 / no-contradiction contract that makes a wrong glow impossible.

```
guide pane (already in the DOM)
   -> parse instructions + (1)(2)(3) order      deterministic, no model
   -> "find a control labelled 'Open Folder'"
   -> the existing anchor engine                 unchanged, still contract-bound
   -> glow it, or say honestly that it cannot find it
```

**Where a model helps, and only there:** when the parse is ambiguous, or the learner asks a
question. It shapes the *query*; it never chooses what to glow. The safety contract survives
intact, which is the whole reason anyone should trust the glow at all.

## What Rocky still cannot do, said plainly

- **The VM desktop.** Much of this lab happens in **VS Code** and native dialogs. Rocky is a
  browser extension; he cannot see them. That needs the Windows UI Automation agent, which
  is not in this build. On those steps he should say so rather than pretend.
- **Terminal labs.** On something like the Nedbank SQL lab the work is all in a shell. There
  is nothing to point at, and Copilot wins on its own ground. Say that too.
- **Platform position.** Copilot is told the page number. Rocky reads it from the DOM — good
  enough, but it is inference rather than fact.

## The honest positioning

> Copilot explains the step. Rocky shows you where it is.
>
> On a portal lab — the Azure portal, Fabric, Copilot Studio, Foundry — that is the
> difference between reading "click the ellipsis, then Remove" and seeing the ellipsis
> glow. On a terminal lab, Copilot is the better tool, and Rocky should say so.

Two products, different jobs. The fight is only real on portal labs, and on those Rocky wins
by doing something a chat window structurally cannot.

## Build order

1. **Guide reader** — parse the guide pane into ordered targets. Deterministic, gated by
   tests against this lab's real text.
2. **Wire it to the resolver** — no bundle, any lab. Reuse the existing engine untouched.
3. **Honest fallback** — when a step is in VS Code, the terminal, or a native dialog, say
   which surface it is on and that he cannot see it. Never a wrong glow, never a pretence.
4. **Only then**, if it earns its place: a model pass for ambiguous instructions.
