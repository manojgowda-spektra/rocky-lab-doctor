/* LabPilot popup — dev step controls + capture toggle + capture export. */
function send(msg) { return new Promise((res) => chrome.runtime.sendMessage(msg, res)); }
function getLocal(keys) { return new Promise((res) => chrome.storage.local.get(keys, res)); }
function setLocal(obj) { return new Promise((res) => chrome.storage.local.set(obj, res)); }

let stepIndex = 0;

async function refresh() {
  const s = await send({ type: "lp-get-state" });
  if (s) { stepIndex = s.stepIndex || 0; document.getElementById("step").textContent = stepIndex; }
  const v = await getLocal(["lpCaptures", "lpCapture"]);
  const caps = v.lpCaptures || [];
  document.getElementById("capcount").textContent = caps.length;
  const cap = document.getElementById("capstate");
  const on = !!v.lpCapture;
  cap.textContent = on ? "on" : "off";
  cap.className = on ? "on" : "off";
}

function status(msg) { document.getElementById("status").textContent = msg || ""; }

document.getElementById("next").addEventListener("click", async () => {
  await send({ type: "lp-set-step", stepIndex: stepIndex + 1 }); refresh();
});
document.getElementById("prev").addEventListener("click", async () => {
  await send({ type: "lp-set-step", stepIndex: Math.max(0, stepIndex - 1) }); refresh();
});
document.getElementById("toggle").addEventListener("click", async () => {
  await send({ type: "lp-toggle-capture" }); setTimeout(refresh, 60);
});
document.getElementById("clear").addEventListener("click", async () => {
  // Reset the whole capture session (array + step pointer + legacy buffer).
  await setLocal({ lpCaptures: [], lpCaptureIndex: 0, lpCaptureBuffer: [] });
  document.getElementById("capjson").style.display = "none";
  status("Cleared captures.");
  refresh();
});

// EXPORT: download the lpCaptures array as labpilot-captures.json so Cowork can ingest it
// WITHOUT reading chrome.storage. Falls back to an <a download> blob, and always mirrors
// the JSON into a selectable textarea (copy path) if the download API is unavailable.
document.getElementById("export-captures").addEventListener("click", async () => {
  const v = await getLocal(["lpCaptures"]);
  const caps = v.lpCaptures || [];
  const json = JSON.stringify(caps, null, 2);
  const ta = document.getElementById("capjson");
  ta.value = json; ta.style.display = "block"; ta.select();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const filename = "labpilot-captures.json";
  let downloaded = false;
  try {
    if (chrome.downloads && chrome.downloads.download) {
      chrome.downloads.download({ url, filename, saveAs: true });
      downloaded = true;
    }
  } catch (e) { downloaded = false; }
  if (!downloaded) {
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  }
  status("Exported " + caps.length + " captures → " + filename + " (or copy from the box).");
});

refresh();


// ---- Ask AI (optional): endpoint + deployment + key for EXPLORE mode's "Ask AI" button ----
async function aiRefresh() {
  const v = await getLocal(["lpAI"]); const a = v.lpAI || {};
  document.getElementById("ai-endpoint").value = a.endpoint || "";
  document.getElementById("ai-deployment").value = a.deployment || "";
  document.getElementById("ai-key").value = a.apiKey || "";
  document.getElementById("ai-version").value = a.apiVersion || "";
  document.getElementById("ai-status").textContent = (a.endpoint && a.deployment && a.apiKey) ? "Ask Rocky: configured — click Rocky → Ask Rocky, or Alt+A" : "Ask Rocky: off (needs model name + key; Rocky still explains from lab notes)";
}
document.getElementById("ai-save").addEventListener("click", async () => {
  const a = { endpoint: document.getElementById("ai-endpoint").value.trim(), deployment: document.getElementById("ai-deployment").value.trim(),
              apiKey: document.getElementById("ai-key").value.trim(), apiVersion: document.getElementById("ai-version").value.trim() };
  if (a.endpoint && !/^https:\/\//i.test(a.endpoint)) { document.getElementById("ai-status").textContent = "Endpoint must start with https://"; return; }
  await setLocal({ lpAI: a }); aiRefresh();
});
document.getElementById("ai-clear").addEventListener("click", async () => { await setLocal({ lpAI: null }); aiRefresh(); });
aiRefresh();

document.getElementById("ai-test").addEventListener("click", async () => {
  const st = document.getElementById("ai-status"); st.textContent = "Testing…";
  const a = { endpoint: document.getElementById("ai-endpoint").value.trim(), deployment: document.getElementById("ai-deployment").value.trim(),
              apiKey: document.getElementById("ai-key").value.trim(), apiVersion: document.getElementById("ai-version").value.trim() };
  await setLocal({ lpAI: a });
  const r = await send({ type: "lp-ask-ai", payload: { question: "Reply with exactly: Rocky online." } });
  st.textContent = r && r.text ? "OK — " + r.text.slice(0, 80) : "Failed — " + (r && r.error || "no response");
});
