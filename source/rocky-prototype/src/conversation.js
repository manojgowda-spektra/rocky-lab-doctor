// Conversation/session state for multi-turn Rocky.
// Implements: assistance-level dial (hint→guided→answer), ZPD-style escalate/fade,
// struggle tracking, "don't repeat what I already explained", and summarization-based
// history trimming to control tokens on long sessions. (See docs/rocky_design_principles.md)

const LEVELS = ['hint', 'guided', 'answer'];

class Conversation {
  constructor({ maxRecent = 8 } = {}) {
    this.history = [];        // { role: 'user'|'assistant', content }
    this.summary = '';        // rolling summary of trimmed older turns
    this.levelIdx = 0;        // index into LEVELS
    this.struggle = 0;        // consecutive struggle signals
    this.toldKeys = new Set();// topics/explanations already given (avoid repeating)
    this.maxRecent = maxRecent;
  }

  get level() { return LEVELS[this.levelIdx]; }
  setLevel(name) { const i = LEVELS.indexOf(name); if (i >= 0) this.levelIdx = i; return this.level; }
  escalate() { this.levelIdx = Math.min(this.levelIdx + 1, LEVELS.length - 1); return this.level; }
  fade()     { this.levelIdx = Math.max(this.levelIdx - 1, 0); return this.level; }

  // ZPD calibration: struggle steps support up; progress fades it back down.
  registerStruggle() { this.struggle += 1; if (this.struggle >= 2) this.escalate(); return this.struggle; }
  registerProgress() { this.struggle = 0; this.fade(); }

  markTold(key) { if (key) this.toldKeys.add(key); }
  wasTold(key) { return this.toldKeys.has(key); }

  addUser(content) { this.history.push({ role: 'user', content }); this._trim(); }
  addAssistant(content) { this.history.push({ role: 'assistant', content }); this._trim(); }

  // Keep the last maxRecent turns verbatim; fold older ones into a short summary.
  _trim() {
    if (this.history.length <= this.maxRecent) return;
    const overflow = this.history.splice(0, this.history.length - this.maxRecent);
    const folded = overflow
      .map((m) => `${m.role === 'user' ? 'Learner' : 'Rocky'}: ${m.content.replace(/\s+/g, ' ').slice(0, 160)}`)
      .join(' | ');
    this.summary = (this.summary ? this.summary + ' | ' : '') + folded;
    if (this.summary.length > 1200) this.summary = '…' + this.summary.slice(-1200);
  }

  // Messages for the model: optional summary as a leading assistant note, then recent turns.
  messagesForModel() {
    const msgs = [];
    if (this.summary) msgs.push({ role: 'assistant', content: `(Earlier in this session: ${this.summary})` });
    return msgs.concat(this.history);
  }

  reset() {
    this.history = []; this.summary = ''; this.levelIdx = 0; this.struggle = 0; this.toldKeys.clear();
  }
}

module.exports = { Conversation, LEVELS };
