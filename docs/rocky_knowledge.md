# How Rocky knows CloudLabs

Rocky can guide the Azure portal click by click. This is the other half: answering questions
about **the platform itself** — what an ODL is, why a deployment failed, how to extend a lab,
why copy-paste does not work in the VM.

None of it is hardcoded. That is the whole design.

---

## The problem with writing it down

CloudLabs is roughly 360 documentation pages and a growing register of resolved issues.
Hand-writing that into a knowledge file would be wrong within a month and unmaintainable
within three. Every portal change, every new feature, every fixed bug would need someone to
remember to update Rocky.

So nothing is authored. The index is **compiled** from sources that already exist and that
someone else already maintains.

## Where the answers come from

| Source | What it gives | Authority |
|---|---|---|
| **help.cloudlabs.ai** | The platform's own documentation. It publishes `llms.txt`, an index of every page, and serves each page as clean markdown. The vendor is telling machines how to read it | Highest for "how does this work" |
| **learner-docs.cloudlabs.ai** | The learner-facing site: troubleshooting, FAQs, connecting to a VM | Highest for "what do I do" |
| **The local Knowledge_Base mirror** | The same pages, captured, so it works offline. Plus the team's **register of real resolved issues** — each with an error signature, a root cause and a verified fix | **Outranks documentation.** It is what actually happened |

Retrieval deliberately prefers a resolved issue over a documentation page on the same
subject. Documentation says what should happen; an issue record says what did.

## Why not embeddings and a vector database

That was the obvious answer and it is the wrong one here.

- It needs a server, an API key and a network round trip. A lab VM may have none of those,
  and every question would cost money.
- Embeddings put a **paraphrase** between the learner and the documentation. That is exactly
  how a confident wrong answer gets made.
- Rocky's whole proposition is that he does not invent. Quoting a real page and naming it is
  worth more than fluent prose about it.

So retrieval is deterministic scoring over a compiled index, running inside the extension.
No network, no key, no per-question cost, and **every answer carries the page it came from**.
A model is still available to phrase an answer, but only over text that was retrieved.

## The answer ladder

Three rungs, cheapest and most trustworthy first:

1. **`lab.json`** — matters of record about this lab. Which ODL, which deployment, which
   resource group. Instant, free, impossible to get wrong.
2. **The CloudLabs corpus** — the platform's documentation and the issue register, quoted
   with its source.
3. **A model** — only for genuinely open questions, and only over what was retrieved.

Below all three: an honest "I cannot see that". Asked about other learners, the platform's
validation results, or the cloud itself, Rocky says so rather than improvising.

## Refusing is a feature

An index that always returns *something* is worse than no index: it makes Rocky confidently
unhelpful. Three checks must all pass before he answers:

- **Coverage** — at least half the meaningful words in the question must appear in the corpus.
- **A specific term** — at least one matched word must be discriminating. A question whose
  only hits are words appearing in thousands of sections is not a CloudLabs question.
- **A score floor**, measured rather than guessed. Real questions score 6.5 and above;
  off-topic ones plateau at 2.8. The floor sits at 4.0, in the gap, and a test fails if the
  corpus ever changes enough to close it.

Two bugs were found by testing this rather than assuming it. "What is the capital of France"
returned a lab-guide page at high confidence, because raw inverse-document-frequency rewards
obscurity and one freak word outscored a genuine match. And a scoring path could produce
`NaN`, which sorts unpredictably and can float above a real answer. Both are now guarded.

## Keeping it current

```
cd vmpackage
node tools/build-knowledge.js              # from the local mirror: offline, seconds
node tools/build-knowledge.js --fetch      # also refresh from the live docs
```

`--fetch` reads `llms.txt`, pulls every page as markdown, and de-duplicates against the
mirror. Last run: 299 of 306 pages fetched, 4,795 duplicate sections correctly dropped.

Rebuild, rebuild the package, and Rocky's knowledge is current. No code changes, nothing to
hand-maintain. Worth doing before a demo and whenever the platform ships something notable.

## What is deliberately not in it

Internal playbooks, meeting notes, cost models and personal working notes are excluded.
Rocky answers a learner: our own process notes are not his to quote, and indexing them only
added noise. "Know when to stop automating" is not an answer to "why did my deployment fail",
and for a while it was — which is how that exclusion came to exist.

Index and manifest pages are excluded too. They mention everything, so they match
everything, and they answer nothing.

## Size

| | |
|---|---|
| Search index | ~6 MB, **loaded only when someone asks a question** |
| Full section text | ~7 MB, opened only when a learner asks to read more |
| In the package | ~6.3 MB compressed, downloaded once at lab deploy |

A learner who never asks a CloudLabs question never downloads the index. Two other ideas
were measured and rejected: delta-plus-base36 packing of the postings made the file **six
times larger**, and trimming snippets saved under a megabyte. Lazy loading was the only
change that mattered.
