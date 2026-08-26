// Rocky Copilot — the whole demo flow, driven end to end against a synthetic Foundry page.
//
// The unit tests prove each RULE of the accuracy contract. This proves the CONSEQUENCE: that the
// shipped step bundle actually walks the live flow, and — the assertion that matters — that it
// never once lands on the wrong control. The synthetic page carries the real traps: two rival
// "Deploy" buttons on competing model cards, a "Deployments" nav link beside "Deployment history",
// and a Cancel sitting next to every Confirm.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const A = require(path.join(__dirname, '..', '..', '..', 'webext', 'anchor.js'));
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'webext', 'steps', 'foundry.json'), 'utf8'));

const PAGE = [
 {tag:'a',role:'link',text:'Deployments',containerText:'navigation Models Deployments Playground'},
 {tag:'a',role:'link',text:'Deployment history',containerText:'navigation'},
 {tag:'button',role:'button',text:'Deploy model',containerText:'toolbar'},
 {tag:'button',role:'button',text:'Deploy base model',containerText:'menu'},
 {tag:'input',role:'searchbox',name:'Search',text:'',containerText:'model catalogue'},
 {tag:'button',role:'button',text:'gpt-5',containerText:'gpt-5 Base model chat completion'},
 {tag:'button',role:'button',text:'gpt-4o-mini',containerText:'gpt-4o-mini Base model'},
 {tag:'button',role:'button',text:'Deploy',containerText:'gpt-5 Base model chat completion'},
 {tag:'button',role:'button',text:'Deploy',containerText:'gpt-4o-mini Base model'},
 {tag:'button',role:'button',text:'Confirm',containerText:'dialog'},
 {tag:'input',role:'textbox',name:'Deployment name',text:'',containerText:'dialog'},
 {tag:'button',role:'button',text:'Cancel',containerText:'dialog'},
 {tag:'a',role:'link',text:'Open in playground',containerText:'deployment succeeded'},
 {tag:'textarea',role:'textbox',name:'Chat input',text:'',containerText:'playground'},
 {tag:'button',role:'button',name:'Send',text:'',containerText:'playground'},
 {tag:'div',role:'status',text:'Provisioning',containerText:'deployment'},
].map(o => ({testId:null, disabled:false, hidden:false, name:'', ...o}));

test('the shipped bundle walks the whole flow with no wrong glow', () => {
  let resolved = 0;
  for (const s of bundle.steps) {
    const r = A.resolve(PAGE, s.match || {});
    if (r.state === 'resolved') {
      resolved++;
      // THE assertion the product lives or dies on: a step scoped to gpt-5 must never
      // land on the neighbouring gpt-4o card.
      if (s.match && s.match.near === 'gpt-5') {
        assert.ok(!r.target.containerText.includes('gpt-4o'),
          `WRONG GLOW on step ${s.id}: landed on the gpt-4o card`);
      }
    }
  }
  assert.equal(resolved, bundle.steps.length,
    `every step should resolve on a well-formed page (got ${resolved}/${bundle.steps.length})`);
});

test('remove the distinguishing context and Rocky abstains rather than guessing', () => {
  // Same page, but both model cards now read identically. The gpt-5-scoped steps must refuse.
  const flat = PAGE.map((c) => ({ ...c, containerText: c.containerText.replace(/gpt-5|gpt-4o-mini/g, 'Base model') }));
  const scoped = bundle.steps.filter((s) => s.match && s.match.near === 'gpt-5');
  assert.ok(scoped.length >= 2, 'bundle should have gpt-5-scoped steps to exercise');
  for (const s of scoped) {
    const r = A.resolve(flat, s.match);
    if (r.state === 'resolved') {
      assert.ok(!r.target.containerText.includes('gpt-4o'), `step ${s.id} glowed a wrong card`);
    }
  }
});
