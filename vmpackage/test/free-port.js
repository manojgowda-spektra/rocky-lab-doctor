/*
 * free-port.js — get a debugging port that is actually free, instead of rolling dice.
 *
 * THE BUG THIS REPLACES. Four browser tests each picked a random port in a fixed range:
 *
 *   live-resolve.js    9300 + rand(400)      -> 9300..9699
 *   verify-loaded.js   9400 + rand(400)      -> 9400..9799
 *   drift-test.js      9500 + rand(400)      -> 9500..9899
 *   behaviour-test.js  9600 + rand(300)      -> 9600..9899
 *
 * Every one of those ranges contains 9600, which is the port the live lab browser uses
 * (test/open-rocky.js). When a test rolled that number, Edge could not bind it, the test
 * connected to the ALREADY-RUNNING browser instead, found no mock page there, and reported
 * "the extension never injected" — a failure with nothing whatever to do with the extension.
 *
 * That is what made the release gate flaky. It failed three times in one session and passed on
 * an unchanged tree each time, which is the worst kind of gate: one nobody trusts, on a build
 * step that exists to be trusted.
 *
 * WHAT THIS DOES INSTEAD. Asks the operating system for an ephemeral port, notes it, releases
 * it, then confirms nothing is answering there before handing it back. There is still a
 * theoretical window between releasing and Edge binding — that is unavoidable without handing
 * Edge a socket — but it is microseconds against a range that deliberately included a port
 * known to be in use.
 */
'use strict';
const net = require('net');
const http = require('http');

function ephemeral() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

// Is something already speaking DevTools here? If so the port is not ours, whatever the OS says.
function occupied(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 400 }, (r) => {
      r.resume(); resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * A debugging port nothing else is using.
 * @param {number} [tries] how many times to try before giving up
 */
async function freePort(tries) {
  const n = tries || 8;
  for (let i = 0; i < n; i++) {
    const p = await ephemeral();
    if (!(await occupied(p))) return p;
  }
  throw new Error('could not find a free debugging port after ' + n + ' attempts');
}

module.exports = { freePort, occupied };
