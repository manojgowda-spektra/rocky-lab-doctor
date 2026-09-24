/*
 * coach-live.js — does Rocky actually USE the world model, on the real portals?
 *
 * Every gate beside this one feeds the coach and the recovery ladder a hand-built context
 * object. That proves the logic and proves nothing about the wiring: for months coach.js held
 * its own confidence threshold and its own URL-to-place table, and every unit test passed while
 * Rocky said things Position disagreed with.
 *
 * So this reads, from the live portal:
 *
 *   1. what Position believes       place, sayable, workflow state, last completion
 *   2. what Rocky would SAY         pilot.coach(), the real assembled sentence
 *   3. whether the two agree        a number on screen that sayable says is not sayable is a bug
 *   4. the failure channel          end to end, DOM -> completion -> relay -> Position -> hint
 *
 * (4) needs an error, and causing a real one on a lab tenant means doing something destructive
 * to get it. So the script ADDS A LIVE REGION of its own to the page and puts an error string
 * in it — the same mechanism the portal uses, measured on Azure as
 * `role=alertdialog "Client Error - Looks like you don't have the right permissions"`.
 * Everything downstream of that node is the real code path: the real MutationObserver, the real
 * classifier, the real relay, the real Position read, the real ladder. The node is removed
 * afterwards and nothing in the portal's own state is touched.
 *
 *   node test/coach-live.js [port]
 */
'use strict';
const http = require('http');
const net = require('net');
const crypto = require('crypto');

function getJSON(u) {
  return new Promise((res, rej) => {
    http.get(u, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej);
  });
}

function connect(url) {
  return new Promise((res, rej) => {
    const m = url.match(/^ws:\/\/([^/]+)(\/.*)$/);
    const [h, p] = m[1].split(':');
    const key = crypto.randomBytes(16).toString('base64');
    const s = net.connect(+p, h, () => s.write(
      `GET ${m[2]} HTTP/1.1\r\nHost: ${m[1]}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    let buf = Buffer.alloc(0), up = false, id = 0;
    const waits = new Map(); const events = [];
    s.on('data', (c) => {
      buf = Buffer.concat([buf, c]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; up = true; buf = buf.slice(i + 4); res({ send, events, close: () => s.destroy() }); }
      while (buf.length >= 2) {
        const l0 = buf[1] & 127; let off = 2, len = l0;
        if (l0 === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (l0 === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const pay = buf.slice(off, off + len).toString(); buf = buf.slice(off + len);
        let msg; try { msg = JSON.parse(pay); } catch (e) { continue; }
        if (msg.id && waits.has(msg.id)) { waits.get(msg.id)(msg); waits.delete(msg.id); }
        else if (msg.method) events.push(msg);
      }
    });
    s.on('error', rej);
    function send(method, params) {
      return new Promise((r) => {
        const i = ++id; waits.set(i, r);
        const j = Buffer.from(JSON.stringify({ id: i, method, params: params || {} }));
        const mask = crypto.randomBytes(4); const out = Buffer.alloc(j.length);
        for (let k = 0; k < j.length; k++) out[k] = j[k] ^ mask[k % 4];
        let hdr; const L = j.length;
        if (L < 126) hdr = Buffer.from([0x81, 0x80 | L]);
        else if (L < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x81; hdr[1] = 0x80 | 126; hdr.writeUInt16BE(L, 2); }
        else { hdr = Buffer.alloc(10); hdr[0] = 0x81; hdr[1] = 0x80 | 127; hdr.writeBigUInt64BE(BigInt(L), 2); }
        s.write(Buffer.concat([hdr, mask, out]));
      });
    }
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- what Rocky believes, and what he would say, right now -------------------------------- */
const READ = `(() => { try {
  const P = window.LabPilotPosition, PL = window.LabPilotPilot, RC = window.LabPilotRecovery;
  if (!P) return { here: false, why: 'no Position in this world' };
  const s = P.read();
  let said = null;
  try { said = PL && PL.coach ? PL.coach() : null; } catch (e) { said = { level: 'THREW', text: e.message }; }
  return {
    here: true,
    top: !!(window.LabPilotFrame && window.LabPilotFrame.isTop),
    origin: location.origin,
    sayable: s.sayable,
    place: s.place,
    workflow: s.workflow.state,
    failure: s.recovery.failure,
    lastCompletion: s.lastCompletion ? s.lastCompletion.kind : null,
    coach: said ? { level: said.level, why: said.why, text: said.text } : null,
    recovery: RC ? RC.status() : null,
    hasRecovery: !!RC,
    mentor: (function () {
      var MEN = window.LabPilotMentor;
      if (!MEN) return { here: false };
      try {
        var b = MEN.brief();
        return {
          here: true,
          where: b.where ? b.where.text : null,
          whereWhy: b.where ? b.where.why : null,
          did: b.did ? b.did.text : null,
          why: b.why ? b.why.text : null,
          next: b.next ? b.next.text : null,
          ifNot: b.ifNot ? b.ifNot.text : null,
          journey: MEN.journey().length,
          block: MEN.promptBlock(),
        };
      } catch (e) { return { here: true, threw: e.message }; }
    })(),
    // The coach must reach the learner through announce(), not through the spinner.
    coachViaAnnounce: !!(window.LabPilotRocky && window.LabPilotRocky.announce),
  };
// A throw here used to return undefined, which the caller read as "not ready yet" and then
// waited 60 s for a condition that could never become true. An error must arrive as data.
} catch (e) { return { here: false, why: 'THREW: ' + (e && e.message) }; } })()`;

/*
 * Add a live region carrying a real portal error string, then read the whole chain back.
 * Returns what Position saw and what the ladder would say about it.
 */
const PROVOKE = (text) => `(async () => {
  const P = window.LabPilotPosition, RC = window.LabPilotRecovery;
  if (!P || !RC) return { ok: false, why: 'modules missing' };

  const n = document.createElement('div');
  n.setAttribute('role', 'alert');
  n.id = '__rocky_probe_alert';
  // Off-screen: a learner watching this run should not see a fake error flash up.
  n.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
  n.textContent = ${JSON.stringify(text)};
  document.body.appendChild(n);

  // Live regions are watched, not polled, but the relay pumps on its own cadence.
  const deadline = Date.now() + 8000;
  let seen = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const f = P.read().recovery.failure;
    if (f && f.text && f.text.indexOf(${JSON.stringify(text.slice(0, 20))}) >= 0) { seen = f; break; }
  }

  let diag = null, cls = null;
  if (seen) {
    cls = RC._classify(seen.text);
    diag = RC._diagnose({ rung: 0, lastRungAt: 0, engaged: false, said: 0, saidFailure: null },
                        seen, Date.now());
  }

  try { n.remove(); } catch (e) {}
  return { ok: !!seen, failure: seen, klass: cls, diagnosis: diag };
})()`;

(async () => {
  const port = process.argv[2] || '9600';
  const list = await getJSON(`http://127.0.0.1:${port}/json/list`);
  const targets = list.filter((x) => x.type === 'page' && /purview|azure|cloudlabs/.test(x.url || ''));

  if (!targets.length) { console.log('\n  no portal tab open — nothing to validate against\n'); process.exit(2); }

  console.log('\n=== DOES ROCKY USE THE WORLD MODEL? (live) ===\n');
  let bad = 0;
  const validated = [], skipped = [];
  const say = (ok, label, detail) => { if (!ok) bad++; console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${label}${detail ? '   ' + detail : ''}`); };

  for (const t of targets) {
    const host = (t.url || '').replace(/^https?:\/\//, '').split('/')[0];
    console.log(`  ${'-'.repeat(74)}\n  ${host}\n`);
    const c = await connect(t.webSocketDebuggerUrl);
    await c.send('Runtime.enable');
    await wait(600);
    const ctxs = c.events.filter((e) => e.method === 'Runtime.executionContextCreated')
      .map((e) => e.params.context).filter((x) => x.auxData && x.auxData.type === 'isolated');

    const probe = async () => {
      const list2 = c.events.filter((e) => e.method === 'Runtime.executionContextCreated')
        .map((e) => e.params.context).filter((x) => x.auxData && x.auxData.type === 'isolated');
      let lastWhy = null;
      for (const ctx of list2) {
        let r;
        try { r = await c.send('Runtime.evaluate', { expression: READ, contextId: ctx.id, returnByValue: true }); }
        catch (e) { continue; }
        if (r.result && r.result.exceptionDetails) { lastWhy = 'eval threw: ' + (r.result.exceptionDetails.text || ''); continue; }
        const v = r.result && r.result.result && r.result.result.value;
        if (v && v.here && v.top) return { v, id: ctx.id };
        if (v && v.why) lastWhy = v.why;
      }
      probe.why = lastWhy;
      return null;
    };

    let hit = await probe();

    /*
     * IS THE TAB RUNNING THE CODE WE JUST WROTE?
     *
     * With --load-extension over a persisted profile, a content script only changes on a page
     * load. A validator that reads whatever happens to be in the tab will happily certify the
     * previous build, which is a worse outcome than failing — so check for the API this change
     * introduced and reload if it is not there.
     */
    const current = async (id) => {
      const r = await c.send('Runtime.evaluate', {
        expression: '!!(window.LabPilotRecovery && window.LabPilotRecovery._diagnose)',
        contextId: id, returnByValue: true,
      });
      return !!(r.result && r.result.result && r.result.result.value);
    };

    if (hit && !(await current(hit.id))) {
      console.log('     stale content scripts in this tab — reloading to pick up the build\n');
      await c.send('Page.enable');
      await c.send('Page.reload', {});
      const deadline = Date.now() + 60000;
      hit = null;
      while (Date.now() < deadline) {
        await wait(1500);
        const h = await probe();
        if (h && (await current(h.id))) { hit = h; break; }
      }
      // A portal that has just reloaded is still assembling itself; Position needs the page to
      // settle before its place signal means anything.
      if (hit) await wait(4000);
      if (hit) hit = await probe();
    }

    const top = hit ? hit.v : null;
    const ctxId = hit ? hit.id : null;
    if (!top) {
      console.log(`     no top-frame Position here — ${probe.why || 'no isolated world answered'}\n`);
      skipped.push(host);
      c.close();
      continue;
    }
    validated.push(host);

    console.log(`     place        ${top.place.section || '-'}${top.place.page ? ' > ' + top.place.page : ''}  (${top.place.source} @ ${top.place.confidence})`);
    console.log(`     sayable      ${top.sayable.stepNumber === null ? 'null' : top.sayable.stepNumber + ' of ' + top.sayable.total}  — ${top.sayable.why}`);
    console.log(`     workflow     ${top.workflow}`);
    console.log(`     coach        [${top.coach ? top.coach.level : '-'}] ${top.coach ? JSON.stringify(top.coach.text.slice(0, 150)) : 'nothing'}`);
    console.log('');

    // ---- 1. the coach speaks at all -------------------------------------------------------
    say(!!(top.coach && top.coach.text), 'the coach produces a sentence', top.coach ? top.coach.level : 'null');

    // ---- 2. no number on screen that Position says is not sayable -------------------------
    const spoken = (top.coach && top.coach.text) || '';
    const claimsNumber = /Step\s+\S+\s+of\s/i.test(spoken);
    say(!(claimsNumber && top.sayable.stepNumber === null),
      'Rocky states a step number ONLY when Position allows one',
      `sayable=${top.sayable.stepNumber} spoken=${claimsNumber}`);

    // ---- 3. the coach's place matches Position's place ------------------------------------
    // ORIENT is the level that names a place; when it fires it must name Position's, not one
    // its own URL table invented.
    // Position reports a page on Azure (a heading) and a section on Purview (aria-current),
    // and the coach takes whichever it has — so the check must accept either as well.
    const named = top.place.page || top.place.section;
    if (top.coach && top.coach.level === 'ORIENT' && named) {
      say(spoken.indexOf(named) >= 0,
        'ORIENT names the place Position read', JSON.stringify(named));
    } else {
      console.log(`  [--]   ORIENT not the active level here (${top.coach ? top.coach.level : '-'}) — place check not applicable`);
    }

    // ---- 3b. the mentor layer --------------------------------------------------------------
    const men = top.mentor || { here: false };
    say(men.here, 'the mentor layer is loaded in this frame', men.threw ? 'THREW: ' + men.threw : '');
    if (men.here && !men.threw) {
      console.log(`     mentor.where  ${JSON.stringify(men.where)}`);
      console.log(`     mentor.did    ${JSON.stringify(men.did)}   (journey: ${men.journey})`);
      console.log(`     mentor.next   ${JSON.stringify(men.next)}`);
      console.log(`     mentor.ifNot  ${JSON.stringify(men.ifNot)}`);
      say(typeof men.block === 'string' && men.block.length > 40,
        'the model receives the whole world model, not one sentence',
        men.block ? men.block.length + ' chars' : 'empty');
      // The line that stops the model inventing a summary of work that never happened.
      say(/OBSERVED ACCOMPLISHMENTS/.test(men.block || ''),
        'the grounding names the accomplishments channel explicitly');
      const claimsWork = men.journey === 0 && men.did !== null;
      say(!claimsWork, 'no accomplishment is claimed without an observed world change');
      console.log('');
      console.log('     --- WHAT THE MODEL IS TOLD ---');
      String(men.block || '').split(/\n/).forEach((l) => console.log('       ' + l.slice(0, 104)));
      console.log('');
    }
    say(top.coachViaAnnounce, 'Rocky can deliver a coach line as a card rather than a spinner');

    // ---- 4. the failure channel, end to end ------------------------------------------------
    say(top.hasRecovery, 'the recovery ladder is loaded in this frame');
    if (top.hasRecovery) {
      const ERR = "Client Error - Looks like you don't have the right permissions to do this";
      const r = await c.send('Runtime.evaluate', {
        expression: PROVOKE(ERR), contextId: ctxId, returnByValue: true, awaitPromise: true,
      });
      const v = (r.result && r.result.result && r.result.result.value) || { ok: false };
      say(v.ok, 'a portal error reaches Position through the real chain',
        v.ok ? `"${String(v.failure.text).slice(0, 48)}..."` : 'never arrived');
      if (v.ok) {
        say(v.klass && v.klass.code === 'permission',
          'it is classified as a permissions problem', v.klass ? v.klass.code : '-');
        say(!!(v.diagnosis && v.diagnosis.text),
          'the ladder turns it into something a learner can act on');
        if (v.diagnosis) console.log(`\n     ROCKY WOULD SAY:\n       ${v.diagnosis.text.replace(/(.{92})/g, '$1\n       ')}\n`);
      }
    }
    c.close();
    console.log('');
  }

  console.log('  ' + '-'.repeat(74));

  /*
   * A VALIDATOR THAT VALIDATED NOTHING HAS NOT PASSED.
   *
   * The first version of this script printed "Rocky reads the world model and speaks from it"
   * after skipping the only tab it had — because `bad` was 0 and it never asked whether
   * anything had actually been checked. Silence is not evidence, and a green line that means
   * "I looked at nothing" is worse than a red one.
   */
  if (skipped.length) console.log(`\n  skipped (no Position): ${skipped.join(', ')}`);
  if (!validated.length) {
    console.log('\n  NOTHING WAS VALIDATED — no portal tab answered. This is not a pass.\n');
    process.exit(2);
  }
  if (bad) { console.log(`\n  ${bad} CHECK(S) FAILED\n`); process.exit(1); }
  console.log(`\n  Rocky reads the world model and speaks from it, live on: ${validated.join(', ')}\n`);
})();
