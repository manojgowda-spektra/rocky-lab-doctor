/*
 * probe.js — small snippets injected into the page under test.
 *
 * Kept in their own file because building JavaScript inside a JavaScript template literal
 * inside a Python heredoc is how you spend an afternoon fighting backslashes instead of
 * testing the product. Each export is a plain string of page-world code.
 */
'use strict';

const hitTest = (x, y, selector) => `(function () {
  var el = document.elementFromPoint(${x}, ${y});
  var want = document.querySelector(${JSON.stringify(selector)});
  var r = want ? want.getBoundingClientRect() : null;
  return JSON.stringify({
    atPoint: el ? (el.tagName + ' ' + (el.id || el.className || '') + ' "' + (el.textContent || '').trim().slice(0, 30) + '"') : 'nothing',
    isWanted: el === want || (want && want.contains && want.contains(el)),
    rect: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null,
    viewport: { w: window.innerWidth, h: window.innerHeight }
  });
})()`;

const armClickProbe = `(function () {
  window.__pageSawClick = null;
  document.addEventListener('click', function (e) {
    window.__pageSawClick = (e.target && (e.target.textContent || e.target.tagName) || '?').trim().slice(0, 40);
  }, true);
  return true;
})()`;

const readClickProbe = `window.__pageSawClick || 'PAGE-SAW-NOTHING'`;

// Click via the element's own .click(), which is what a keyboard activation does too.
// Content-script listeners registered with capture:true see this exactly as they see a
// mouse click, so it exercises the real path without depending on hit-testing an overlay.
const clickElement = (selector) => `(function () {
  var el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return 'NO-SUCH-ELEMENT';
  el.click();
  return 'clicked: ' + (el.textContent || el.tagName).trim().slice(0, 40);
})()`;

const centreOf = (selector) => `(function () {
  var el = document.querySelector(${JSON.stringify(selector)});
  if (!el) return null;
  var r = el.getBoundingClientRect();
  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
})()`;

const bubbleText = `(function () {
  var nodes = document.querySelectorAll('[data-labpilot="1"]');
  for (var i = 0; i < nodes.length; i++) {
    var t = (nodes[i].innerText || '').trim();
    if (t) return t;
  }
  return '';
})()`;

const crumb = (name) => `document.documentElement.getAttribute(${JSON.stringify(name)}) || 'none'`;

const showError = (text) => `(function () {
  var d = document.getElementById('errslot');
  d.innerHTML = '<div role="alert">' + ${JSON.stringify(text)} + '</div>';
  return true;
})()`;

module.exports = { hitTest, armClickProbe, readClickProbe, clickElement, centreOf, bubbleText, crumb, showError };
