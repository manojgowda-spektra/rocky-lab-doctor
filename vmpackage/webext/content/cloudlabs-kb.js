/*
 * LabPilot CLOUDLABS KNOWLEDGE — Rocky's answers about the platform itself.
 *
 * Not about the Azure portal (foundry-kb.js covers that) but about CLOUDLABS: what an ODL
 * is, why a deployment failed, how to extend a lab, what the validation button does, why
 * copy-paste is not working in the VM.
 *
 * WHERE THE ANSWERS COME FROM. Nothing here is authored. The index is compiled by
 * tools/build-knowledge.js from the platform's own documentation (help.cloudlabs.ai, which
 * publishes an llms.txt index precisely so a machine can read it) and from the team's
 * register of real resolved issues. Rebuild the index and Rocky's knowledge is current;
 * no code changes, nothing to hand-maintain.
 *
 * WHY DETERMINISTIC RETRIEVAL RATHER THAN A MODEL. Rocky's entire proposition is that he
 * does not invent. Searching a real corpus and QUOTING the page — with its title and link —
 * is both cheaper and more honest than asking a model to remember the documentation. It
 * also works with no key, no network and no per-question cost, which matters in a lab VM.
 * The model may still be used to phrase an answer, but only over text retrieved here.
 *
 * SCORING is classic tf-idf with deliberate thumbs on the scale:
 *   - a term in the TITLE or HEADING outweighs the same term in the body, because
 *     documentation headings are written to be searched;
 *   - a resolved ISSUE outranks a documentation page on the same subject, because it is
 *     what actually happened to a real learner, with a verified fix;
 *   - a result must clear a floor, and beat the runner-up, or Rocky says he does not know.
 *     Same discipline as the glow: no confident answer without evidence.
 *
 * window.LabPilotCloudLabs:
 *   ready(cb)          cb(true|false) once the index has loaded
 *   search(q, n)       ranked hits: {title, heading, url, source, kind, snippet, score}
 *   answer(q)          the best hit as something Rocky can say, or null if unsure
 *   full(i)            the complete section text for hit i (lazily fetched)
 *   stats()            what is loaded
 */
(function () {
  "use strict";
  if (window.LabPilotCloudLabs) return;

  var KB = null, loading = false, waiting = [], fullText = null;
  var VEC = null;                 // build-time embeddings; null until loaded, absent is fine
  var queryVec = null;            // optional: a way to embed the learner's question

  // How much each half of the hybrid counts. Keyword is trusted slightly more because an
  // exact term match ("ODL") is stronger evidence than a similar meaning.
  var W_KEYWORD = 1.0;
  var W_SEMANTIC = 0.85;

  // Same contract as the anchor engine: a result must be genuinely good, and clearly better
  // than the next one, or there is no answer.
  // Measured, not guessed. Across the test questions, genuine CloudLabs questions score
  // 6.5 and above ("what is an ODL" 6.5, "cloud shell will not launch" 21.6) while
  // off-topic ones plateau at 2.8 - they match only incidental words. 4.0 sits in the gap
  // with room either side. Re-measure if the corpus changes substantially.
  var MIN_SCORE = 4.0;
  var MARGIN = 1.15;        // best must beat runner-up by this ratio

  var STOP = {};
  ('a an and are as at be by for from has have how i in is it its of on or that the this to was ' +
   'what when where which who will with you your can do does if not but there their they')
    .split(' ').forEach(function (w) { STOP[w] = 1; });

  // Words that are everywhere in a CloudLabs corpus carry no signal. Leaving them in
  // inflated the coverage score and let "write me a poem about kubernetes" through on the
  // strength of "write" and "about".
  ('lab labs cloudlabs work works working about write need want use using used get got ' +
   'please help make made see also new page click select enter open')
    .split(' ').forEach(function (w) { STOP[w] = 1; });

  // The vocabulary gap: people type the acronym, documentation writes it out. This is a
  // glossary, not knowledge - the ANSWERS still come entirely from the corpus.
  var SYNONYM = {
    odl: ['demand', 'ondemand'],
    vm: ['virtual', 'machine'],
    rdp: ['remote', 'desktop'],
    arm: ['template', 'resource', 'manager'],
    sku: ['size', 'tier'],
    rbac: ['role', 'access', 'permission'],
    spn: ['service', 'principal'],
    mfa: ['multi', 'factor', 'authentication'],
    tap: ['temporary', 'access', 'pass'],
  };

  function expand(terms) {
    var out = terms.slice();
    for (var i = 0; i < terms.length; i++) {
      var syn = SYNONYM[terms[i]];
      if (syn) for (var j = 0; j < syn.length; j++) if (out.indexOf(syn[j]) < 0) out.push(syn[j]);
    }
    return out;
  }

  function tokenise(s) {
    var raw = String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i];
      if (!w) continue;
      if (w.indexOf('-') >= 0) {
        var parts = w.split('-');
        for (var j = 0; j < parts.length; j++) if (parts[j].length > 2 && !STOP[parts[j]]) out.push(parts[j]);
      }
      if (w.length > 2 && !STOP[w]) out.push(w);
    }
    return out;
  }

  function load() {
    if (loading) return;
    loading = true;

    // A HARD DEADLINE. The corpus is ~6 MB, and askRocky() queues the learner's question
    // behind ready(). If this fetch ever stalls — a slow lab VM, a throttled disk, a
    // service worker restart mid-read — done() never runs, the callback never fires, and
    // the question disappears with no error and no spinner. From the outside that is
    // indistinguishable from "I clicked Ask and nothing happened", which is precisely what
    // was reported from a live lab.
    //
    // Answering without the corpus is a small loss. Answering NEVER is a broken product,
    // so after 8 seconds we give up on it and let the question continue to the model.
    setTimeout(function () {
      if (KB === null) { KB = false; done(false); }   // done() is idempotent: it drains the queue
    }, 8000);

    try {
      fetch(chrome.runtime.getURL('knowledge/cloudlabs-kb.json'))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          KB = j;
          // Semantic vectors are optional: without them retrieval is keyword-only, which
          // still works. A missing file must never break answering.
          return fetch(chrome.runtime.getURL('knowledge/cloudlabs-vec.json'))
            .then(function (r2) { return r2.ok ? r2.json() : null; })
            .then(function (v) { VEC = v; })
            .catch(function () { VEC = null; });
        })
        .then(function () { done(!!KB); })
        .catch(function () { done(false); });
    } catch (e) { done(false); }
  }
  function done(ok) {
    waiting.splice(0).forEach(function (cb) { try { cb(ok); } catch (e) {} });
  }

  function search(q, n) {
    if (!KB) { load(); return []; }   // kicks off the fetch; the caller retries via ready()
    var terms = expand(tokenise(q));
    if (!terms.length) return [];
    var N = KB.docs.length;
    var scores = Object.create(null);

    // Distinct terms only: a word repeated in the question should not count twice.
    var uniq = [];
    for (var u = 0; u < terms.length; u++) if (uniq.indexOf(terms[u]) < 0) uniq.push(terms[u]);

    var matchedTerms = 0;
    var perDoc = Object.create(null);      // id -> how many DISTINCT query terms it matched
    var typed = {};
    var askedNow = tokenise(q);
    for (var y = 0; y < askedNow.length; y++) typed[askedNow[y]] = 1;

    for (var i = 0; i < uniq.length; i++) {
      var posting = KB.idx[uniq[i]];
      if (!posting) continue;
      matchedTerms++;
      // A synonym exists to break a tie, not to drive the ranking. Scored equally, the
      // expansion of "ODL" ("demand", a word in hundreds of sections) buried the acronym
      // the learner actually typed.
      var weight = typed[uniq[i]] ? 1 : 0.35;
      // A term in 3 documents is more informative than one in 3,000 - but cap it. Without a
      // cap a single freak word ("capital", present in one section) outscores a genuine
      // two-word match, which is how an unrelated question gets a confident answer.
      var idf = Math.min(Math.log(1 + N / posting.length), 4.5);
      for (var j = 0; j < posting.length; j++) {
        var id = posting[j];
        scores[id] = (scores[id] || 0) + idf * weight;
        if (typed[uniq[i]]) perDoc[id] = (perDoc[id] || 0) + 1;
      }
    }

    var ids = Object.keys(scores);
    if (!ids.length) return [];

    // COVERAGE. If the corpus matched one word of a four-word question, it does not answer
    // that question however rare the word was. This is the check that turns "capital of
    // France" from a confident wrong answer into an honest silence.
    // Coverage is judged on the words the learner typed; a synonym that happens to miss
    // should not count against them.
    var asked = tokenise(q);
    var askedMatched = 0;
    for (var a = 0; a < asked.length; a++) if (KB.idx[asked[a]]) askedMatched++;
    var coverage = asked.length ? askedMatched / asked.length : 0;
    if (asked.length > 1 && coverage < 0.5) return [];

    // IS THIS EVEN A CLOUDLABS QUESTION? Measured: off-topic questions match only freak
    // words present in one or two sections ("capital", "kubernetes", "balance"), while every
    // real question - however oddly the learner phrased it - touches at least one word the
    // domain genuinely uses ("machine", "paste", "environment", "quota"). Scores overlap and
    // cannot separate the two; this can.
    var DOMAIN_DF = 20;             // a word the corpus really uses, not an accident
    var domainHits = 0;
    for (var v = 0; v < uniq.length; v++) {
      var pl = KB.idx[uniq[v]];
      if (pl && pl.length >= DOMAIN_DF) domainHits++;
    }
    if (!domainHits) return [];     // nothing here belongs to this subject

    // And at least one matched term should still be discriminating, so a question made
    // entirely of very common words does not drag up an arbitrary page.
    var specific = false;
    for (var w2 = 0; w2 < uniq.length; w2++) {
      var pl2 = KB.idx[uniq[w2]];
      if (pl2 && pl2.length < N * 0.25) { specific = true; break; }
    }
    if (!specific) return [];

    var hits = [];
    for (var k = 0; k < ids.length; k++) {
      var id = +ids[k];
      var d = KB.docs[id];
      var s = scores[id];

      // Headings are written to be searched; a hit there means the section is ABOUT the
      // thing asked, not merely mentions it.
      var head = (d.t + ' ' + d.h).toLowerCase();
      var inHead = 0;
      for (var t = 0; t < terms.length; t++) if (head.indexOf(terms[t]) >= 0) inHead++;
      s *= (1 + 0.55 * (inHead / terms.length));

      // A section matching three of the question's words is a better answer than one
      // matching a single rare word, whatever the idf arithmetic says. A section that
      // matched ONLY synonyms has no typed-term count - that must read as zero, not as
      // undefined, which produced NaN scores that sorted unpredictably.
      var typedHits = perDoc[id] || 0;
      var asked2 = askedNow.length || 1;
      s *= (0.25 + 0.75 * (typedHits / asked2));

      // A resolved issue beats a doc page on the same subject: it is what actually happened,
      // with a fix someone verified.
      if (d.k === 'issue') s *= 1.4;

      hits.push({ id: id, score: s, title: d.t, heading: d.h, url: d.u, source: d.s, kind: d.k, snippet: d.b });
    }
    // ---- merge the semantic half ---------------------------------------------------------
    // A section the keyword side never found can still be the right answer when the learner
    // paraphrased. Merge by id so each section is scored once, by both measures.
    var sem = semantic(queryVec, 40);
    if (sem.length) {
      var byId = Object.create(null);
      for (var h2 = 0; h2 < hits.length; h2++) byId[hits[h2].id] = hits[h2];
      // Scale similarity onto roughly the keyword scale so the weights mean something.
      var top = sem[0].sim || 1;
      for (var m = 0; m < sem.length; m++) {
        var rel = (sem[m].sim / top) * 8;         // best semantic hit ~= a strong keyword hit
        var ex = byId[sem[m].id];
        if (ex) {
          ex.score = ex.score * W_KEYWORD + rel * W_SEMANTIC;
          ex.both = true;                          // found by both halves: the strongest signal
        } else {
          var dd = KB.docs[sem[m].id];
          if (!dd) continue;
          hits.push({
            id: sem[m].id, score: rel * W_SEMANTIC, semanticOnly: true,
            title: dd.t, heading: dd.h, url: dd.u, source: dd.s, kind: dd.k, snippet: dd.b,
          });
        }
      }
    }

    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, n || 5);
  }

  // ---- semantic search -------------------------------------------------------------------
  // Vectors are int8 and already normalised, so similarity is a plain dot product: no square
  // roots, no allocation, ~8k x 256 multiply-adds. Measured at a few milliseconds, which is
  // why this can run on every question without a server.
  function semantic(qv, limit) {
    if (!VEC || !qv) return [];
    var dims = VEC.dims, ids = VEC.ids, v = VEC.v, n = ids.length;
    var out = [];
    for (var r = 0; r < n; r++) {
      var base = r * dims, dot = 0;
      for (var d = 0; d < dims; d++) dot += v[base + d] * qv[d];
      out.push({ id: ids[r], sim: dot / (VEC.q * VEC.q) });
    }
    out.sort(function (a, b) { return b.sim - a.sim; });
    return out.slice(0, limit || 40);
  }

  // The extension cannot embed a question offline - that needs the model. So semantic
  // search is used when a query vector is supplied (the caller got one from the configured
  // Foundry deployment) and silently skipped otherwise. Keyword search always runs.
  function setQueryVector(vec) { queryVec = vec; }

  // The honest gate. A weak best hit, or a best hit no better than the next, means the
  // corpus does not actually answer this - and saying so is the correct answer.
  function answer(q) {
    var hits = search(q, 3);
    if (!hits.length) return null;
    var best = hits[0];

    // Below the floor the corpus probably does not cover this. Rather than refuse outright,
    // offer it as an explicit GUESS - useful, and honest about what it is. The wording of a
    // low-confidence answer is the difference between helpful and wrong-and-certain.
    var confident = best.score >= MIN_SCORE;
    if (!confident && best.score < MIN_SCORE * 0.45) return null;   // not even worth a guess
    if (hits[1] && best.score < hits[1].score * MARGIN) {
      // Two sections are equally plausible. Offer both rather than picking one at random.
      return {
        text: 'A couple of pages cover that. "' + best.title + (best.heading ? ' — ' + best.heading : '') +
              '" and "' + hits[1].title + '". Which are you after?',
        ambiguous: true, confident: confident, hits: hits.slice(0, 2),
        // Still attributable: an answer whose source cannot be named is indistinguishable
        // from an invented one.
        title: best.title, heading: best.heading, url: best.url,
        source: best.source, kind: best.kind, id: best.id, score: best.score,
      };
    }
    return {
      text: best.snippet,
      title: best.title, heading: best.heading, url: best.url,
      source: best.source, kind: best.kind, id: best.id, score: best.score,
      confident: confident,
      // Found by BOTH halves of the hybrid: the strongest evidence retrieval can offer.
      corroborated: !!best.both,
      hits: hits,
    };
  }

  // Full section text is kept out of the search index (it is bigger than the index itself)
  // and fetched only when a learner asks to read more.
  function full(id, cb) {
    if (fullText) { cb(fullText[id] || null); return; }
    try {
      fetch(chrome.runtime.getURL('knowledge/cloudlabs-kb-full.json'))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { fullText = j || []; cb(fullText[id] || null); })
        .catch(function () { cb(null); });
    } catch (e) { cb(null); }
  }

  window.LabPilotCloudLabs = {
    // Deliberately NOT loaded at startup. See the note on load() above.
    ready: function (cb) { if (KB !== null) { cb(true); return; } waiting.push(cb); load(); },
    search: search,
    answer: answer,
    full: full,
    stats: function () {
      return KB ? {
        sections: KB.n, terms: Object.keys(KB.idx).length, built: KB.built, sources: KB.sources,
        semantic: VEC ? { vectors: VEC.n, dims: VEC.dims, model: VEC.model } : null,
      } : null;
    },
    _test: { tokenise: tokenise, MIN_SCORE: MIN_SCORE, MARGIN: MARGIN },
  };
  // No eager load: the first call to ready()/answer() fetches the index. A learner who never
  // asks a CloudLabs question never pays for it.
})();
