// Intent parsing for Rocky: slash commands + free-form classification + struggle detection.
// (See docs/rocky_design_principles.md — UX slash commands; frustration handling.)

const SLASH = {
  '/hint': 'set-level', '/guided': 'set-level', '/answer': 'set-level',
  '/check': 'check', '/why': 'why', '/status': 'status',
  '/help': 'help', '/reset': 'reset', '/quit': 'quit', '/exit': 'quit',
};

function parseInput(raw) {
  const text = (raw || '').trim();
  if (text.startsWith('/')) {
    const [cmd, ...rest] = text.split(/\s+/);
    const key = cmd.toLowerCase();
    const action = SLASH[key];
    if (action) return { kind: 'command', command: key.slice(1), action, arg: rest.join(' ').trim() };
    return { kind: 'command', command: 'unknown', action: 'unknown', arg: text };
  }
  return { kind: 'message', text, intent: classify(text), struggling: detectStruggle(text) };
}

function classify(text) {
  const t = text.toLowerCase();
  if (/\b(did i|is it (right|correct|ok)|check( my)?|validate|am i (done|finished|correct))\b/.test(t)) return 'check';
  if (/(^|\b)why\b|why (does|is|do|did|are)|explain why|how come/.test(t)) return 'why';
  if (/just (tell|give) me|the (full )?answer|show me how|full (fix|answer|solution)|stop asking( me)? questions/.test(t)) return 'answer-request';
  if (detectStruggle(text)) return 'stuck';
  return 'general';
}

function detectStruggle(text) {
  const t = text.toLowerCase();
  if (/stuck|confused|don'?t (get|understand|know)|no idea|frustrat|giving up|give up|lost|makes no sense|still (failing|broken|not working)/.test(t)) return true;
  // Very short, low-content replies often signal disengagement/frustration.
  if (t.length > 0 && t.split(/\s+/).length <= 2 && /^(no|nope|nothing|idk|help|ugh|what)\b/.test(t)) return true;
  return false;
}

module.exports = { parseInput, classify, detectStruggle, SLASH };
