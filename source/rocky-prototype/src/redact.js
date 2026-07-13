// Redaction layer (constraint SC-005 / checklist B3): strip secrets + obvious PII
// BEFORE any lab data is shown to a model or logged. Deterministic, no deps.

const PATTERNS = [
  [/\bpassword\s*=\s*[^;\s]+/gi, 'Password=[REDACTED]'],
  [/\b(api[_-]?key|apikey)\s*[:=]\s*[^;\s]+/gi, '$1=[REDACTED]'],
  [/\bsk-[a-z0-9-]{8,}\b/gi, '[REDACTED_KEY]'],
  [/\bconnection ?string\s*[:=]\s*[^\n]+/gi, 'ConnectionString=[REDACTED]'],
  [/\bServer=tcp:[^;\s]+/gi, 'Server=[REDACTED]'],
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]'],
  [/\bBearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]'],
];

function redactString(s) {
  if (typeof s !== 'string') return s;
  return PATTERNS.reduce((acc, [re, repl]) => acc.replace(re, repl), s);
}

// Deep-redact strings within any JSON-like value.
function redact(value) {
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v);
    return out;
  }
  return value;
}

module.exports = { redact, redactString };
