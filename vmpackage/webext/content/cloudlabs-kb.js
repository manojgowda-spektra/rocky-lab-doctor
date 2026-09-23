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

  // Same contract as the anchor engine: a result must be genuinely good, and clearly better
  // than the next one, or there is no answer.
  var MIN_SCORE = 3.0;
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
    try {
      fetch(chrome.runtime.getURL('knowledge/cloudlabs-kb.json'))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { KB = j; done(!!j); })
        .catch(function () { done(false); });
    } catch (e) { done(false); }
  }
  function done(ok) {
    waiting.splice(0).forEach(function (cb) { try { cb(ok); } catch (e) {} });
  }

  function search(q, n) {
    if (!KB) { load(); return []; }   // kicks off the fetch; the caller retries via ready()
    var terms = tokenise(q);
    if (!terms.length) return [];
    var N = KB.docs.length;
    var scores = Object.create(null);

    // Distinct terms only: a word repeated in the question should not count twice.
    var uniq = [];
    for (var u = 0; u < terms.length; u++) if (uniq.indexOf(terms[u]) < 0) uniq.push(terms[u]);

    var matchedTerms = 0;
    var perDoc = Object.create(null);      // id -> how many DISTINCT query terms it matched

    for (var i = 0; i < uniq.length; i++) {
      var posting = KB.idx[uniq[i]];
      if (!posting) continue;
      matchedTerms++;
      // A term in 3 documents is more informative than one in 3,000 - but cap it. Without a
      // cap a single freak word ("capital", present in one section) outscores a genuine
      // two-word match, which is how an unrelated question gets a confident answer.
      var idf = Math.min(Math.log(1 + N / posting.length), 4.5);
      for (var j = 0; j < posting.length; j++) {
        var id = posting[j];
        scores[id] = (scores[id] || 0) + idf;
        perDoc[id] = (perDoc[id] || 0) + 1;
      }
    }

    var ids = Object.keys(scores);
    if (!ids.length) return [];

    // COVERAGE. If the corpus matched one word of a four-word question, it does not answer
    // that question however rare the word was. This is the check that turns "capital of
    // France" from a confident wrong answer into an honest silence.
    var coverage = matchedTerms / uniq.length;
    if (uniq.length > 1 && coverage < 0.5) return [];

    // At least one matched term must be reasonably specific. A question whose only hits are
    // words appearing in thousands of sections is not answered by this corpus, whatever the
    // coverage arithmetic says.
    var specific = false;
    for (var v = 0; v < uniq.length; v++) {
      var pl = KB.idx[uniq[v]];
      if (pl && pl.length < N * 0.08) { specific = true; break; }
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
      // matching a single rare word, whatever the idf arithmetic says.
      s *= (perDoc[id] / uniq.length);

      // A resolved issue beats a doc page on the same subject: it is what actually happened,
      // with a fix someone verified.
      if (d.k === 'issue') s *= 1.4;

      hits.push({ id: id, score: s, title: d.t, heading: d.h, url: d.u, source: d.s, kind: d.k, snippet: d.b });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, n || 5);
  }

  // The honest gate. A weak best hit, or a best hit no better than the next, means the
  // corpus does not actually answer this - and saying so is the correct answer.
  function answer(q) {
    var hits = search(q, 3);
    if (!hits.length) return null;
    var best = hits[0];
    if (best.score < MIN_SCORE) return null;
    if (hits[1] && best.score < hits[1].score * MARGIN) {
      // Two sections are equally plausible. Offer both rather than picking one at random.
      return {
        text: 'A couple of pages cover that. "' + best.title + (best.heading ? ' — ' + best.heading : '') +
              '" and "' + hits[1].title + '". Which are you after?',
        ambiguous: true, hits: hits.slice(0, 2),
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
      return KB ? { sections: KB.n, terms: Object.keys(KB.idx).length, built: KB.built, sources: KB.sources } : null;
    },
    _test: { tokenise: tokenise, MIN_SCORE: MIN_SCORE, MARGIN: MARGIN },
  };
  // No eager load: the first call to ready()/answer() fetches the index. A learner who never
  // asks a CloudLabs question never pays for it.
})();
