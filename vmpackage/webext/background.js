/*
 * LabPilot background service worker (MV3). Owns cross-tab step state + the capture
 * buffer in chrome.storage.local; the content script is the per-surface authority.
 * No guidance logic here.
 */
const DEFAULTS = { lpStepIndex: 0, lpCapture: false };

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(Object.keys(DEFAULTS), (v) => {
    const set = {};
    for (const k in DEFAULTS) if (v[k] === undefined) set[k] = DEFAULTS[k];
    if (Object.keys(set).length) chrome.storage.local.set(set);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "lp-capture":
      // Append a captured selector bundle (tagged with the current step id).
      chrome.storage.local.get(["lpCaptureBuffer"], (v) => {
        const buf = v.lpCaptureBuffer || [];
        buf.push(msg.payload);
        chrome.storage.local.set({ lpCaptureBuffer: buf });
      });
      return;

    case "lp-get-state":
      chrome.storage.local.get(["lpStepIndex", "lpCapture", "lpCaptureBuffer", "lpBundle"], (v) => {
        sendResponse({
          stepIndex: v.lpStepIndex || 0,
          capture: !!v.lpCapture,
          captureCount: (v.lpCaptureBuffer || []).length,
          hasBundle: !!v.lpBundle
        });
      });
      return true; // async response

    case "lp-set-step":
      chrome.storage.local.set({ lpStepIndex: Math.max(0, msg.stepIndex | 0) });
      return;

    case "lp-toggle-capture":
      chrome.storage.local.get(["lpCapture"], (v) => chrome.storage.local.set({ lpCapture: !v.lpCapture }));
      return;

    case "lp-clear-capture":
      chrome.storage.local.set({ lpCaptureBuffer: [] });
      return;

    case "lp-export-capture":
      chrome.storage.local.get(["lpCaptureBuffer"], (v) => sendResponse({ buffer: v.lpCaptureBuffer || [] }));
      return true;

    case "lp-load-bundle":
      chrome.storage.local.set({ lpBundle: msg.bundle, lpStepIndex: 0 });
      return;

    case "lp-ask-ai":
      // ASK ROCKY / Ask AI: relay ONE question to the user's own Foundry deployment (endpoint +
      // model/deployment + key entered in the popup, stored locally). Payload carries only what
      // the learner typed plus lab context (step text, page title/route, a control's role/label).
      // Never page content, never keys. Answers are shown labelled AI and never move a glow.
      chrome.storage.local.get(["lpAI"], (v) => {
        const req = buildAIRequest(v.lpAI || {}, msg.payload || {});
        if (req.error) { sendResponse({ error: req.error }); return; }
        callModel(req, 20000, sendResponse);
      });
      return true;

    case "lp-parse-guide":
      // GUIDE ASSIST: the guide reader's rules have parsed a page, and these are the lines that
      // yielded nothing. Ask the model ONCE what they want clicked, keep only labels that appear
      // verbatim in their own line, and remember the answer by a hash of the text so the same
      // guide never costs a second call. The payload is guide text only - never page content,
      // never keys. What goes back is TARGETS for the resolver's contract, never a glow.
      parseGuideLines(msg.payload || {}, sendResponse);
      return true;

    default:
      return;
  }
});


// ---- one model call, shared by every message type that talks to the model ------------------
// POST `req` (from buildRequest) and hand `done` either { text } or { error }. Ask Rocky and the
// guide assist both come through here, so the retry logic exists exactly once.
function callModel(req, timeoutMs, done) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);

  // Models disagree about which request fields they accept, and the rules change with
  // every release. Rather than maintain a table of which model wants what, listen to
  // the service: if it names an unsupported parameter, drop that one field and try
  // again. One retry only - a second failure is a real problem worth reporting.
  const attempt = (body, retried) => fetch(req.url, {
    method: "POST", headers: req.headers, body: JSON.stringify(body), signal: ctl.signal,
  })
    .then((r) => (r.ok ? r.json() : r.text().then((tx) => {
      const err = new Error(`HTTP ${r.status} ${tx.slice(0, 200)}`);
      err.detail = tx;
      throw err;
    })))
    .then((j) => { clearTimeout(t); const txt = extractAIText(j); done(txt ? { text: txt } : { error: "empty answer" }); })
    .catch((e) => {
      const detail = String((e && e.detail) || (e && e.message) || "");
      const named = /unsupported[_ ]?parameter|unrecognized request argument|is not supported with this model|unknown parameter/i.test(detail);
      if (!retried && named) {
        // Which field? The message usually names it; fall back to the usual suspects.
        const next = Object.assign({}, body);
        const m = /['"]([a-z_]+)['"]/i.exec(detail);
        let dropped = null;
        if (m && m[1] && m[1] in next) { delete next[m[1]]; dropped = m[1]; }
        else if ("temperature" in next) { delete next.temperature; dropped = "temperature"; }
        else if ("max_completion_tokens" in next) { delete next.max_completion_tokens; dropped = "max_completion_tokens"; }
        if (dropped) return attempt(next, true);
      }
      clearTimeout(t);
      done({ error: String((e && e.message) || e) });
    });

  attempt(req.body, false);
}


// ---- Ask-AI request builder (pure; unit-tested) --------------------------------------------
// cfg.endpoint may be a full Responses URL  https://<res>.services.ai.azure.com/openai/v1/responses
// or a resource base  https://<res>.openai.azure.com  (legacy chat-completions path is built).
// cfg.deployment = model / deployment name.  payload = { question | name/role/context, step, page, route, history[] }
const ROCKY_SYSTEM = [
  "You are Rocky, a lab companion standing beside a learner inside the Microsoft Foundry (ai.azure.com) and Azure portals.",
  "Answer in plain text, at most 110 words, warm and direct, like a good colleague leaning over: contractions, short sentences, no lists unless asked.",
  // Grounding is the whole point. The context block is real observed data; anything not in
  // it is not something Rocky knows, and saying so is a better answer than a plausible guess.
  "GROUNDING: the Context block holds facts actually observed — the lab identity, the environment, which step the learner is on, what they clicked, what errors appeared. Prefer it over your own assumptions, and quote it when it answers the question.",
  "HONESTY: if the Context does not contain what is needed, say plainly that you cannot see it rather than inventing it. You can see this page and this lab only — never other learners, the platform's validation results, or the cloud resources themselves. Never state a resource exists, a step passed, or a deployment succeeded unless the Context says so.",
  "Explain concepts (deployments, models, tokens, quotas, playgrounds, agents, RAG, Azure resources) and what portal controls do, in terms of what this learner is doing right now.",
  "If the learner seems stuck or has hit an error, say what it means and the single next thing to try — do not list five options.",
  "A light touch of humour is fine when things are going well; never when something has just failed.",
  "Never tell the learner to skip lab steps, never give commands to delete or change resources; if asked, warn about the consequence.",
  "Do not reveal keys or secrets. Stay on Azure, AI and this lab; politely decline anything else in one sentence."
].join(" ");

// Normalise whatever the user pasted into an inference endpoint we can call.
//   https://<res>.services.ai.azure.com/api/projects/<proj>   (Foundry PROJECT endpoint, not inference)
//   https://<res>.services.ai.azure.com                       (bare resource on the v1 surface)
//   https://<res>.services.ai.azure.com/openai/v1[/responses] (already right)
//   https://<res>.openai.azure.com                            (legacy: chat-completions path is built later)
function normaliseEndpoint(raw) {
  let e = String(raw || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(e)) return e;
  let u; try { u = new URL(e); } catch (err) { return e; }
  const isV1Host = /\.services\.ai\.azure\.com$/i.test(u.hostname) || /\.cognitiveservices\.azure\.com$/i.test(u.hostname);

  // A Foundry PROJECT endpoint is not an inference endpoint, so fall back to the resource
  // root. This is the one case where rewriting is right: the URL cannot serve a request.
  if (/^\/api\//i.test(u.pathname)) return u.origin + (isV1Host ? "/openai/v1/responses" : "");

  // Bare resource: point at the v1 Responses surface.
  if (u.pathname === "" || u.pathname === "/") return u.origin + (isV1Host ? "/openai/v1/responses" : "");

  // Anything else was pasted deliberately - keep the path AND the query. Dropping the
  // query silently discarded the api-version the portal tells people to include, which
  // then failed with no clue why.
  return u.origin + u.pathname.replace(/\/+$/, "") + (u.search || "");
}

// The modern chat-completions shape. `model` is included because some surfaces require it
// even when the deployment is already named in the URL, and max_completion_tokens is the
// current spelling - max_tokens is rejected by newer models.
function chatBody(model, system, turns, maxTokens) {
  return {
    model: model,
    messages: [{ role: "system", content: system }].concat(turns),
    max_completion_tokens: maxTokens || 400,
  };
}

/*
 * One request builder for every call Rocky makes to the model. Endpoint normalisation, the
 * Responses-vs-chat routing, the headers and the api-version handling live here and nowhere
 * else, so a feature that needs the model (Ask Rocky, the guide assist) supplies only its
 * instructions, its turns and an output budget - it cannot get the plumbing subtly different.
 */
function buildRequest(cfg, system, turns, limits) {
  const endpoint = normaliseEndpoint(cfg.endpoint);
  const model = String(cfg.deployment || "").trim();
  const key = String(cfg.apiKey || "").trim();
  if (!endpoint || !model || !key) return { error: "Ask-AI not configured (extension popup → Ask AI: endpoint, model, key)" };
  if (!/^https:\/\//i.test(endpoint)) return { error: "endpoint must start with https://" };
  const lim = limits || {};
  const headers = { "Content-Type": "application/json", "api-key": key, "Authorization": "Bearer " + key };
  // The Responses API is served at /openai/v1/responses AND at /openai/responses (the
  // latter with an explicit api-version). Only matching the first sent a perfectly good
  // endpoint down the legacy chat-completions path, which is a different API entirely.
  if (/\/openai\/(v1\/)?responses/i.test(endpoint) || /\/openai\/v1(\/|$)/i.test(endpoint)) {
    let url = /\/responses(\?|$)/i.test(endpoint) ? endpoint
            : endpoint.replace(/(\/openai\/v1).*$/i, "$1") + "/responses";
    // Some resources require an api-version even on the v1 surface ("API version not supported").
    // Only sent when the popup's api-version field is filled in; "preview" is the usual value.
    const ver = String(cfg.apiVersion || "").trim();
    if (ver && !/[?&]api-version=/i.test(url)) {
      url += (url.indexOf("?") >= 0 ? "&" : "?") + "api-version=" + encodeURIComponent(ver);
    }
    return { kind: "responses", url, headers, body: { model, instructions: system, input: turns, max_output_tokens: lim.responses || 320, temperature: 0.3 } };
  }
  // Chat completions. If the user pasted a full chat-completions URL, honour it exactly -
  // including its api-version. Otherwise build one, preferring the version they configured
  // over our default: a model newer than the default version is rejected outright.
  if (/\/chat\/completions/i.test(endpoint)) {
    return { kind: "chat", url: endpoint, headers,
             body: chatBody(model, system, turns, lim.chat) };
  }
  const base = endpoint.replace(/\/openai.*$/i, "");
  const url = `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(cfg.apiVersion || "2024-10-21")}`;
  return { kind: "chat", url, headers, body: chatBody(model, system, turns, lim.chat) };
}

function buildAIRequest(cfg, p) {
  const ctx = [];
  if (p.grounding) ctx.push(`What is actually true right now: ${p.grounding}`);
  if (p.observed) ctx.push(`Observed: ${p.observed}`);
  if (p.upcoming) ctx.push(`Steps coming up: ${p.upcoming}`);
  if (p.lab) ctx.push(`Lab: ${p.lab}`);
  if (p.step) ctx.push(`Current step ${p.stepNo || ""}: ${p.step}`);
  if (p.learn) ctx.push(`Step notes: ${p.learn}`);
  if (p.title || p.route) ctx.push(`Page: ${p.title || ""} (${p.route || ""})`);
  if (p.name) ctx.push(`Control the learner is asking about: "${p.name}" role=${p.role || "?"} section=${p.context || "?"} state=${(p.state || []).join(",") || "none"}`);
  if (p.kb) ctx.push(`Rocky's own notes on it: ${p.kb}`);
  const question = p.question ? String(p.question).slice(0, 600) : "Explain what this control is and what it does, in a bit more depth.";
  const turns = [];
  (p.history || []).slice(-4).forEach((h) => { if (h && h.q && h.a) { turns.push({ role: "user", content: String(h.q).slice(0, 400) }); turns.push({ role: "assistant", content: String(h.a).slice(0, 600) }); } });
  turns.push({ role: "user", content: (ctx.length ? "Context:\n" + ctx.join("\n") + "\n\n" : "") + "Question: " + question });
  return buildRequest(cfg, ROCKY_SYSTEM, turns);
}
function extractAIText(j) {
  if (!j) return "";
  if (typeof j.output_text === "string" && j.output_text.trim()) return j.output_text.trim();
  if (Array.isArray(j.output)) {                                        // Responses API shape
    const parts = [];
    j.output.forEach((o) => { (o && o.content || []).forEach((c) => { if (c && (c.type === "output_text" || c.type === "text") && c.text) parts.push(c.text); }); });
    if (parts.length) return parts.join("\n").trim();
  }
  const m = j.choices && j.choices[0] && j.choices[0].message;           // chat completions shape
  if (m && m.content) return String(m.content).trim();
  return "";
}


// ---- Guide assist: request builder + validation (pure; unit-tested) ------------------------
// The rules in guide-reader.js parse most guide lines for free. The lines they cannot read come
// here, numbered, and the model says which controls each one names. Nothing it returns is
// believed until it has been checked against the source line it claims to describe.
const PARSE_SYSTEM = [
  "You read numbered lines from a hands-on lab guide and list the on-screen controls the learner must click, in click order.",
  "Reply with STRICT JSON only: no prose, no markdown, no code fences. The reply is an array of objects {\"i\": <line number>, \"targets\": [<control name>, ...], \"surface\": <surface>}.",
  "Include ONLY lines that tell the learner to act on a named control. Omit headings, explanations, warnings, outcomes and anything that names no control.",
  "Each target is the control's visible name copied VERBATIM from that line, exact characters and exact case, one entry per control. Never a value to type, a URL, a file name, a menu path joined with '>', or a paraphrase.",
  "surface is \"browser\" for a web-page control; otherwise one of \"VS Code\", \"the VM desktop\", \"a terminal\", \"a Windows dialog\", \"a desktop application\".",
  "If no line names a control, reply with []."
].join(" ");

const PARSE_SURFACES = ["browser", "VS Code", "the VM desktop", "a terminal", "a Windows dialog", "a desktop application"];
const PARSE_MAX_LINES = 60;        // per call
const PARSE_MAX_TARGETS = 5;       // per line
const PARSE_CACHE = "lpGuideParse";
const PARSE_CACHE_MAX = 40;        // guide pages remembered; a lab has a dozen or so

function buildParseRequest(cfg, lines) {
  const numbered = lines.map((l, i) => `${i}: ${String(l).slice(0, 400)}`).join("\n");
  const turns = [{ role: "user", content: "Lines:\n" + numbered }];
  return buildRequest(cfg, PARSE_SYSTEM, turns, { responses: 1500, chat: 1500 });
}

// FNV-1a over the text: a stable cache key that is cheap, dependency-free, and sends the text
// nowhere. Collisions are theoretical at this scale; the length is folded in regardless.
function hashText(s) {
  s = String(s || "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0") + "-" + s.length.toString(16);
}

function squash(s) { return String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim(); }

// Does `label` occur verbatim in `line` (case- and whitespace-insensitive)? Returns the label
// AS THE LINE SPELLS IT, or null. The resolver scores against the live page, so the guide's own
// spelling is the one to hand it - not the model's.
function verbatimIn(line, label) {
  const want = squash(label);
  if (want.length < 2 || want.length > 48) return null;
  const re = new RegExp(want.split(" ").map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+"), "i");
  const m = re.exec(String(line));
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

/*
 * Turn the model's reply into steps the guide reader can merge: [{ line, targets, surface }].
 * Returns null when the reply is not JSON at all (so the caller does not cache a failure), and
 * [] when it parsed but nothing survived. A returned label survives only if its own source line
 * contains it - that single rule is what stops an invented target ever reaching the resolver.
 */
function parseModelSteps(text, lines) {
  const raw = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const a = raw.indexOf("["), b = raw.lastIndexOf("]");
  if (a < 0 || b <= a) return null;
  let arr;
  try { arr = JSON.parse(raw.slice(a, b + 1)); } catch (e) { return null; }
  if (!Array.isArray(arr)) return null;

  const out = []; const seen = {};
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    // The line is named by index (what was asked for) or by its text (tolerated, if exact).
    let idx = Number.isInteger(item.i) ? item.i : -1;
    if (idx < 0 && typeof item.line === "string") idx = lines.findIndex((l) => squash(l) === squash(item.line));
    if (idx < 0 || idx >= lines.length || seen[idx]) continue;
    const line = String(lines[idx]);
    const targets = [];
    for (const t of (Array.isArray(item.targets) ? item.targets : [])) {
      const spelled = verbatimIn(line, typeof t === "string" ? t : (t && t.label));
      if (spelled && !targets.includes(spelled)) targets.push(spelled);
      if (targets.length >= PARSE_MAX_TARGETS) break;
    }
    if (!targets.length) continue;
    seen[idx] = true;
    out.push({ line, targets, surface: PARSE_SURFACES.includes(item.surface) ? item.surface : "browser" });
  }
  return out;
}

// Behind 'lp-parse-guide': cache, config, call, validate, remember, reply.
function parseGuideLines(p, sendResponse) {
  const lines = (Array.isArray(p.lines) ? p.lines : []).map((l) => String(l || "").trim()).filter(Boolean).slice(0, PARSE_MAX_LINES);
  if (!lines.length) { sendResponse({ steps: [] }); return; }
  const hash = hashText(lines.join("\n"));
  chrome.storage.local.get(["lpAI", PARSE_CACHE], (v) => {
    const cache = (v && v[PARSE_CACHE]) || {};
    const hit = cache[hash];
    if (hit && Array.isArray(hit.steps)) { sendResponse({ steps: hit.steps, cached: true }); return; }

    const req = buildParseRequest((v && v.lpAI) || {}, lines);
    if (req.error) { sendResponse({ skipped: true }); return; }        // no AI configured: silence, by design

    callModel(req, 30000, (r) => {
      if (!r || !r.text) { sendResponse({ error: (r && r.error) || "empty answer" }); return; }
      const steps = parseModelSteps(r.text, lines);
      if (steps === null) { sendResponse({ error: "model reply was not JSON" }); return; }   // not cached: a bad reply is not an answer
      cache[hash] = { steps, at: Date.now() };
      const keys = Object.keys(cache);
      if (keys.length > PARSE_CACHE_MAX) {
        keys.sort((x, y) => (cache[x].at || 0) - (cache[y].at || 0));
        for (let i = 0; i < keys.length - PARSE_CACHE_MAX; i++) delete cache[keys[i]];
      }
      const put = {}; put[PARSE_CACHE] = cache;
      try { chrome.storage.local.set(put); } catch (e) { /* the cache is never load-bearing */ }
      sendResponse({ steps });
    });
  });
}

if (typeof module !== "undefined") module.exports = { buildAIRequest, buildRequest, buildParseRequest, parseModelSteps, hashText, extractAIText, ROCKY_SYSTEM, PARSE_SYSTEM };
