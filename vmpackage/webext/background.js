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
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
        fetch(req.url, { method: "POST", headers: req.headers, body: JSON.stringify(req.body), signal: ctl.signal })
          .then((r) => r.ok ? r.json() : r.text().then((tx) => { throw new Error(`HTTP ${r.status} ${tx.slice(0, 160)}`); }))
          .then((j) => { clearTimeout(t); const txt = extractAIText(j); sendResponse(txt ? { text: txt } : { error: "empty answer" }); })
          .catch((e) => { clearTimeout(t); sendResponse({ error: String(e && e.message || e) }); });
      });
      return true;

    default:
      return;
  }
});


// ---- Ask-AI request builder (pure; unit-tested) --------------------------------------------
// cfg.endpoint may be a full Responses URL  https://<res>.services.ai.azure.com/openai/v1/responses
// or a resource base  https://<res>.openai.azure.com  (legacy chat-completions path is built).
// cfg.deployment = model / deployment name.  payload = { question | name/role/context, step, page, route, history[] }
const ROCKY_SYSTEM = [
  "You are Rocky, the friendly lab companion inside the Microsoft Foundry (ai.azure.com) and Azure portals.",
  "The learner is doing a hands-on lab. Answer their question helpfully and accurately in plain text, at most 120 words.",
  "Explain concepts (deployments, models, tokens, quotas, playgrounds, agents, RAG, Azure resources) and what portal controls do.",
  "You cannot see the screen: describe, don't claim to have looked. If you are not sure, say so briefly.",
  "Never tell the learner to skip lab steps, never give commands to delete or change resources; if asked, warn about consequences.",
  "Do not reveal keys or secrets. Stay on Azure, AI and this lab; politely decline unrelated requests in one sentence."
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
  // a Foundry project/agents endpoint is not an inference endpoint: go back to the resource root
  if (/^\/api\//i.test(u.pathname)) return u.origin + (isV1Host ? "/openai/v1/responses" : "");
  if (isV1Host && (u.pathname === "" || u.pathname === "/")) return u.origin + "/openai/v1/responses";
  return u.origin + u.pathname.replace(/\/+$/, "");
}

function buildAIRequest(cfg, p) {
  const endpoint = normaliseEndpoint(cfg.endpoint);
  const model = String(cfg.deployment || "").trim();
  const key = String(cfg.apiKey || "").trim();
  if (!endpoint || !model || !key) return { error: "Ask-AI not configured (extension popup → Ask AI: endpoint, model, key)" };
  if (!/^https:\/\//i.test(endpoint)) return { error: "endpoint must start with https://" };
  const ctx = [];
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
  const headers = { "Content-Type": "application/json", "api-key": key, "Authorization": "Bearer " + key };
  if (/\/openai\/v1(\/|$)/i.test(endpoint)) {                       // Foundry v1 Responses API
    let url = /\/responses$/i.test(endpoint) ? endpoint : endpoint.replace(/(\/openai\/v1).*$/i, "$1") + "/responses";
    // Some resources require an api-version even on the v1 surface ("API version not supported").
    // Only sent when the popup's api-version field is filled in; "preview" is the usual value.
    const ver = String(cfg.apiVersion || "").trim();
    if (ver) url += (url.indexOf("?") >= 0 ? "&" : "?") + "api-version=" + encodeURIComponent(ver);
    return { kind: "responses", url, headers, body: { model, instructions: ROCKY_SYSTEM, input: turns, max_output_tokens: 320, temperature: 0.3 } };
  }
  const base = endpoint.replace(/\/openai.*$/i, "");                    // legacy chat completions
  const url = `${base}/openai/deployments/${encodeURIComponent(model)}/chat/completions?api-version=${encodeURIComponent(cfg.apiVersion || "2024-10-21")}`;
  return { kind: "chat", url, headers, body: { messages: [{ role: "system", content: ROCKY_SYSTEM }].concat(turns), max_tokens: 320, temperature: 0.3 } };
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
if (typeof module !== "undefined") module.exports = { buildAIRequest, extractAIText, ROCKY_SYSTEM };
