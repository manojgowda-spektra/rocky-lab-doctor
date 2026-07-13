# Change Intelligence — Keeping Lab Doctor Current for Years

**Date:** 2026-07-05 · **Question:** can Lab Doctor evolve into a continuous ecosystem-monitoring and impact-analysis platform, or will it always depend on humans manually updating rules?

**The honest verdict up front:** yes, it can — with one permanent, deliberate human step. The *hunting* for changes can be ~90% automated. The *vouching* for changes (approving a registry entry before it drives scans and warnings) should stay human forever — not because automation can't do it, but because a QA tool that asserts facts nobody verified destroys its own credibility the first time a feed lies. The realistic steady-state cost is **minutes per week of review**, not hours per day of research. The perpetual engineering cost that nobody should hide: **harvester upkeep** — sources change their formats, and that maintenance is the real price of this system.

The design below is an extension of what's already proven, not a new system: today's scanner is `registry × corpus → findings`. Everything here just industrializes the two inputs.

---

## 1–2. How it learns, and which sources — by reliability tier

The realistic insight: **sources differ wildly in structure. Design per tier, not per logo.**

**Tier A — structured, machine-readable, harvest with plain parsers (no AI):**
| Source | What it gives | How |
|---|---|---|
| **endoflife.date API** | EOL/support dates for ~300 products (K8s, Node, Python, Terraform, .NET, Ubuntu…) as clean JSON | Free API; the single highest-value feed for the long tail |
| **Azure Updates** (RSS/API) | Retirements, deprecations, GA changes, tagged | RSS parser + retirement-tag filter |
| **Azure OpenAI model retirement page** | Model retirement table with dates | Microsoft Learn docs live in **public GitHub repos** — watch the file's commit diff, not the rendered page |
| **OpenAI deprecations page** | Structured deprecation table | Same diff-watching pattern |
| **npm** | `deprecated` field per package version | Registry API — programmatic per dependency |
| **PyPI** | yanked releases, dev-status classifiers | JSON API |
| **GitHub Releases API** | VS Code, Docker, Terraform, K8s release notes | Structured per release; K8s additionally publishes a versioned API-removals guide |

**Tier B — semi-structured prose; harvest automatically, extract with LLM assist, always reviewed:**
Fabric release notes, Power BI "what's new", Power Platform release waves, M365 Message Center (Graph API, needs tenant consent), GitHub changelog blog. An LLM turns an announcement into a *candidate* registry entry (token, type, date, replacement, citation link). The candidate is a draft — never live until merged (same doctrine as fix PRs: AI drafts, humans assert).

**Tier C — effectively unpublishable; do NOT pretend a feed exists:**
Portal UI rearrangements, silent behavior changes, third-party API quirks. Nobody announces "we moved the button." These stay covered by the **two existing backstops**: telemetry (first learners become sensors, detected next sweep) and Cosmos Tester's authoring-time UI walks (its lane, not ours). Any design that claims proactive coverage here is selling vision.

## 3. Can monitoring be automated reliably?

The **harvesting** — yes, with one non-negotiable addition: **freshness monitoring of the harvesters themselves.** A parser that breaks when a page changes doesn't fail loudly — it silently returns nothing, and silent staleness looks identical to "no news." Every source gets a freshness SLO ("Azure Updates normally yields items weekly; alert if 14 days of silence"). This is the same lesson as our monitor: silence must be distinguishable from health. The **extraction** from Tier B prose — automatable to *draft* quality only.

## 4. The Change Intelligence Knowledge Base — as a git repo

The KB is the current `registry.json`, grown up. Crucial pragmatic decision: **the registry is a git repository, and entries arrive as pull requests.**

- Each entry: token(s) + match rules, change type (retirement/rename/deprecation/breaking-change), effective date, recommended replacement, severity, source citation URL, and **a golden test** (sample lines that must/must-not match).
- CI on the registry repo runs every entry against a golden corpus — the Azure-Advisor false-positive lesson, institutionalized: **registry entries are code, and they ship with tests.**
- Review UX is just PR review (evidence in the body, one click to approve) — the exact workflow already proven with the fix PRs. History, rollback, and audit come free from git.

## 5–6. Determining impact — a lookup, not an investigation

This is the part we've already proven; it only needs a better corpus. Extend indexing beyond guide markdown to the whole lab package: **ARM/Bicep/Terraform templates** (resource types + API versions), **validator scripts** (paths, resource types), **code samples**, **package manifests** (package.json / requirements.txt with versions), **config files**. Build an **inverted index**: token → every lab/file/line that references it, refreshed whenever lab repos change (cheap — we scan 268 files in ~1 second; 10,000 is still trivial).

Then impact analysis is a join: `new registry entry × index = affected labs, files, lines`. Package versions need range semantics (manifest parsing, not token match) — more engineering, same principle.

## 7. Proactive warnings — free once 4–6 exist

Because entries carry effective dates, deadline warnings fall out automatically: *"35 labs reference a service retiring in 90 days"* is `SELECT labs WHERE token=X` plus a date subtraction — rendered on the dashboard, escalating at 90/60/30 days, each drill-down showing exact file:line evidence. For mechanical classes (renames, 1:1 model swaps), the existing fix-drafter opens the PRs.

## 8–9. Automation boundary

**Fully automated forever:** harvesting, dedup, candidate drafting, index refresh, impact joins, deadline warnings, CI gating (on the *merged* registry), fix drafting for mechanical classes, post-merge verification rescans, harvester freshness alerts.

**Human forever:** ① merging registry entries (facts gate — minutes/week), ② merging content fixes (already the doctrine), ③ replacement judgment where not 1:1 (ada-002 → we chose 3-small *because* it keeps 1536 dims; that was judgment, not lookup), ④ severity/deadline overrides, ⑤ anything changing validation semantics.

## 10. Architecture (steady-state)

```
  Tier A parsers ─┐
  Tier B LLM     ─┼→ normalizer/dedup → CANDIDATE ENTRIES (PRs w/ citation + golden test)
   extractors    ─┘                          │
                                   [HUMAN MERGE — gate #1]
                                             ↓
                        CHANGE REGISTRY (git, versioned, CI-tested)
                                             ↓
        corpus INDEX (guides+templates+validators+manifests) ← lab repos
                                             ↓
              IMPACT ENGINE → dashboard warnings (90/60/30d)
                            → CI gates (auto-updated registry)
                            → fix drafter → PRs → [HUMAN MERGE — gate #2]
                                             ↓
                              rescan verification (automatic)

  Reactive backstop (already built): telemetry monitor — catches whatever no feed announced.
```

## Risks & limitations (the ones that actually bite)

1. **Harvester rot** — the #1 recurring cost. Mitigate: prefer APIs and docs-as-code diffs over HTML scraping; freshness SLOs; keep each harvester ~50 lines and disposable.
2. **Feed lies / ambiguity** (dates slip, retirements get extended — NCv3 famously did). The human merge gate + citation link is the defense; entries record the source so corrections are one PR.
3. **Token collision at scale** (the Azure-Advisor class). Defense already built: word-boundary matching + per-entry golden tests + the standing FP audit.
4. **Version-range semantics** for packages — token matching is wrong there; needs manifest parsing (bounded engineering, phase 3).
5. **The unannounced change** — permanent blind spot for the registry; permanently covered by telemetry. Say this plainly rather than papering over it.
6. **Consistent wrongness** (guide and validator wrong in the same way) — no contradiction exists; only humans or Tester-style execution catch it.

## Roadmap (each phase shippable and provable in the sandbox)

- **Phase 1 (~1–2 wks):** registry-as-repo with schema + golden-test CI; harvesters for endoflife.date, Azure Updates RSS, Azure OpenAI + OpenAI deprecation tables (docs-diff watchers); candidate-PR pipeline. *Provable now: run harvesters, generate real candidate entries, measure review load.*
- **Phase 2 (~1–2 wks):** corpus indexer across full lab packages (templates/validators/manifests); impact engine + deadline warnings on the dashboard.
- **Phase 3 (~2 wks):** Tier B prose extractors (Fabric/Power BI/Power Platform/M365) with LLM drafting; npm/PyPI manifest checks.
- **Phase 4 (ongoing, small):** harvester freshness SLOs + health panel; quarterly registry audit ritual (re-run the FP sample audit).

## Final assessment

Lab Doctor **can** realistically become a continuous change-intelligence platform, because the hard half (registry × corpus → evidence-backed findings → drafted fixes → CI gates → verification) is already built and proven on real repos. What's missing is industrialized registry supply, and that is mostly plumbing with one honest constraint: **a thin human approval layer is permanent by design.** The right way to sell that constraint: it's the same human-in-the-loop gate that makes the fix workflow trustworthy — the system hunts, drafts, and proves; humans vouch. Budget: one engineer part-time after Phase 3, dominated by harvester upkeep. Any pitch promising "zero human maintenance" would be the same overclaiming this project has systematically refused.
