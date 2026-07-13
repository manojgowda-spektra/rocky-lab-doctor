// Change Intelligence — Tier-A harvesters (design: docs/change_intelligence_design.md).
// Pulls REAL public feeds and produces CANDIDATE registry entries. Candidates are never live:
// they carry citations and wait for human review before promotion into the scanner registry.
// Zero dependencies; fetch + asOf are injectable so tests run on canned fixtures, no network.

// ---- product token maps: how each ecosystem's versions are actually written in lab guides ----
const PRODUCTS = {
  nodejs:          { label: 'Node.js',        tokens: (c) => [`Node.js ${c}`, `node ${c}`, `nodejs ${c}`] },
  python:          { label: 'Python',         tokens: (c) => [`Python ${c}`] },
  ubuntu:          { label: 'Ubuntu',         tokens: (c) => [`Ubuntu ${c}`] },
  kubernetes:      { label: 'Kubernetes',     tokens: (c) => [`Kubernetes ${c}`, `k8s ${c}`, `AKS ${c}`] },
  terraform:       { label: 'Terraform',      tokens: (c) => [`Terraform ${c}`] },
  dotnet:          { label: '.NET',           tokens: (c) => [`.NET ${c}`, `dotnet ${c}`] },
  postgresql:      { label: 'PostgreSQL',     tokens: (c) => [`PostgreSQL ${c}`, `postgres ${c}`] },
  mysql:           { label: 'MySQL',          tokens: (c) => [`MySQL ${c}`] },
  redis:           { label: 'Redis',          tokens: (c) => [`Redis ${c}`] },
  'windows-server':{ label: 'Windows Server', tokens: (c) => [`Windows Server ${c}`] },
  powershell:      { label: 'PowerShell',     tokens: (c) => [`PowerShell ${c}`] },
  go:              { label: 'Go',             tokens: (c) => [`Go ${c}`, `golang ${c}`] },
};

const dayMs = 86400000;
const daysUntil = (dateStr, asOf) => Math.round((new Date(dateStr) - new Date(asOf)) / dayMs);

// ---- endoflife.date: clean JSON, per-product cycles with EOL dates ----
async function harvestEol({ products = Object.keys(PRODUCTS), withinDays = 365, asOf, fetchImpl = fetch }) {
  const out = [], errors = [];
  for (const p of products) {
    try {
      const res = await fetchImpl(`https://endoflife.date/api/${p}.json`);
      if (!res.ok) { errors.push({ source: `endoflife:${p}`, error: `HTTP ${res.status}` }); continue; }
      const cycles = await res.json();
      for (const c of cycles) {
        if (typeof c.eol !== 'string') continue; // eol:false = still supported, no date
        const d = daysUntil(c.eol, asOf);
        if (d > withinDays) continue; // too far out to act on
        const meta = PRODUCTS[p];
        out.push({
          id: `eol:${p}:${c.cycle}`,
          source: 'endoflife.date', citation: `https://endoflife.date/${p}`,
          type: 'EOL', product: meta.label, cycle: String(c.cycle),
          date: c.eol, daysUntil: d, status: d < 0 ? 'already-eol' : 'approaching',
          tokens: meta.tokens(c.cycle),
          replacement: c.latest ? `${meta.label} ${cycles.find((x) => typeof x.eol !== 'string' || daysUntil(x.eol, asOf) > 365)?.cycle || c.latest}` : null,
          review: 'candidate — promote to registry only after human review',
        });
      }
    } catch (e) { errors.push({ source: `endoflife:${p}`, error: e.message }); }
  }
  return { candidates: out, errors };
}

// ---- Azure Updates RSS: filter retirement/deprecation/rename announcements ----
const RETIRE_RE = /retir|deprecat|end of (life|support)|renam|no longer|will be removed/i;
function parseRssItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const pick = (tag) => { const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`).exec(block); return r ? r[1].replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; };
    items.push({ title: pick('title'), link: pick('link'), pubDate: pick('pubDate'), description: pick('description') });
  }
  return items;
}

async function harvestAzureUpdates({ asOf, fetchImpl = fetch, feedUrl = 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss' }) {
  const out = [], errors = [];
  try {
    const res = await fetchImpl(feedUrl);
    if (!res.ok) return { candidates: [], errors: [{ source: 'azure-updates', error: `HTTP ${res.status}` }] };
    const xml = await res.text();
    for (const item of parseRssItems(xml)) {
      if (!RETIRE_RE.test(item.title)) continue;
      // token heuristic: service name = title minus announcement boilerplate. Deliberately rough —
      // the human reviewer (or a reviewed LLM pass) refines tokens before promotion.
      const svc = item.title
        .replace(/^(Retirement( notice)?|Deprecation|Announcing|Update|Action required|Reminder)[:\-–]\s*/i, '')
        .replace(/\b(will be|is being|is|are)\s+(retired|deprecated|renamed).*/i, '')
        .replace(/\bretirement\b.*/i, '').trim();
      const dm = /(\d{1,2} [A-Z][a-z]+ \d{4})|([A-Z][a-z]+ \d{1,2},? \d{4})/.exec(item.title + ' ' + item.description);
      out.push({
        id: `azup:${item.link.split('/').filter(Boolean).pop() || item.title.slice(0, 40)}`,
        source: 'azure-updates', citation: item.link,
        type: /renam/i.test(item.title) ? 'RENAME' : 'RETIREMENT',
        product: svc || item.title, cycle: null,
        date: dm ? new Date(dm[0]).toISOString().slice(0, 10) : null,
        daysUntil: dm ? daysUntil(new Date(dm[0]).toISOString(), asOf) : null,
        announced: item.pubDate, title: item.title,
        tokens: svc && svc.length >= 6 && svc.length <= 70 ? [svc] : [],
        review: 'candidate — tokens are heuristic; human must refine before promotion',
      });
    }
  } catch (e) { errors.push({ source: 'azure-updates', error: e.message }); }
  return { candidates: out, errors };
}

module.exports = { harvestEol, harvestAzureUpdates, parseRssItems, PRODUCTS, daysUntil };
