// LLM client for Rocky — Azure OpenAI, with streaming, bounded retries, timeouts, and graceful
// degradation. Secrets load from .env.local at runtime (never printed/committed).
// (See docs/rocky_design_principles.md §D — production engineering.)
// Single-provider by design: a second provider was scaffolded here previously but was never used,
// never tested, and never wired to a live account — that's latent risk, not real optionality. Swapping
// or adding a provider is a small, contained change to buildRequest() when there's an actual reason to.

const fs = require('fs');
const path = require('path');

(function loadEnvLocal() {
  const p = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const TIMEOUT_MS = Number(process.env.ROCKY_TIMEOUT_MS || 60000);
const MAX_RETRIES = 2;

function provider() { return (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) ? 'azure' : null; }
function isConfigured() { return provider() !== null; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.status && e.status < 500 && e.status !== 429) throw e; // client error: don't retry
      if (attempt < MAX_RETRIES) await sleep(400 * Math.pow(3, attempt)); // 400ms, 1.2s
    }
  }
  throw lastErr;
}

function httpErr(status, body) { const e = new Error(`HTTP ${status}: ${String(body).slice(0, 300)}`); e.status = status; return e; }

async function doFetch(url, options) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw httpErr(res.status, await res.text());
    return res;
  } finally { clearTimeout(t); }
}

function buildRequest(messages, system, stream, json) {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
  const dep = process.env.AZURE_OPENAI_DEPLOYMENT;
  const ver = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';
  return {
    url: `${endpoint}/openai/deployments/${dep}/chat/completions?api-version=${ver}`,
    headers: { 'content-type': 'application/json', 'api-key': process.env.AZURE_OPENAI_API_KEY },
    body: { messages: [{ role: 'system', content: system }, ...messages], max_completion_tokens: 800, stream, ...(json ? { response_format: { type: 'json_object' } } : {}) },
  };
}

// ---- non-streaming ----
async function chat(messages, { system = '', json = false } = {}) {
  if (!isConfigured()) return null;
  const { url, headers, body } = buildRequest(messages, system, false, json);
  const res = await withRetry(() => doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ---- streaming (SSE) ----
async function chatStream(messages, { system = '', onToken } = {}) {
  if (!isConfigured()) return null;
  const { url, headers, body } = buildRequest(messages, system, true);
  let res;
  try {
    res = await withRetry(() => doFetch(url, { method: 'POST', headers, body: JSON.stringify(body) }));
  } catch (e) {
    // Fall back to non-streaming if the deployment rejects streaming.
    const full = await chat(messages, { system });
    if (full && onToken) onToken(full);
    return full;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') continue;
      let json; try { json = JSON.parse(payload); } catch { continue; }
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) { full += delta; if (onToken) onToken(delta); }
    }
  }
  return full;
}

// Backward-compatible one-shot helper.
async function askLLM(systemPrompt, userPrompt) {
  if (!isConfigured()) {
    return '[LLM layer disabled — no provider configured in .env.local. Deterministic answers still work.]';
  }
  return chat([{ role: 'user', content: userPrompt }], { system: systemPrompt });
}

const ROCKY_SYSTEM = require('./prompt').ROCKY_SYSTEM;

module.exports = { chat, chatStream, askLLM, isConfigured, provider, ROCKY_SYSTEM };
