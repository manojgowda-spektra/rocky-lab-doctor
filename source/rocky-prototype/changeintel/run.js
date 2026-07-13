#!/usr/bin/env node
// Change Intelligence CLI — harvest real feeds, assess impact against real lab repos, write both
// the candidate registry file (awaiting human review) and the impact report.
// Usage: node changeintel/run.js "<labs-root>" [withinDays=365]

const fs = require('fs');
const path = require('path');
const { harvestEol, harvestAzureUpdates } = require('./harvest');
const { assessImpact, renderReport } = require('./impact');

(async () => {
  const labsRoot = process.argv[2];
  const withinDays = Number(process.argv[3] || 365);
  if (!labsRoot || !fs.existsSync(labsRoot)) { console.error('usage: node changeintel/run.js <labs-root> [withinDays]'); process.exit(1); }
  const asOf = new Date().toISOString();

  console.log(`harvesting (asOf ${asOf.slice(0, 10)}, window ${withinDays}d)…`);
  const eol = await harvestEol({ withinDays, asOf });
  const az = await harvestAzureUpdates({ asOf });
  const candidates = [...eol.candidates, ...az.candidates];
  const errors = [...eol.errors, ...az.errors];
  console.log(`  endoflife.date: ${eol.candidates.length} candidates · azure-updates: ${az.candidates.length} candidates · harvest errors: ${errors.length}`);
  for (const e of errors) console.log(`  ! ${e.source}: ${e.error}`);

  const candFile = path.join(__dirname, '..', 'labdoctor', 'registry-candidates.json');
  fs.writeFileSync(candFile, JSON.stringify({ harvestedAt: asOf, review: 'ALL entries are candidates — human review required before promotion to the scanner registry', candidates, errors }, null, 1));
  console.log(`  wrote ${candidates.length} candidates -> ${candFile}\n`);

  const impacts = assessImpact(candidates, labsRoot);
  const report = renderReport(impacts, { totalCandidates: candidates.length });
  const repFile = path.join(__dirname, '..', 'labdoctor', 'impact-report.json');
  fs.writeFileSync(repFile, JSON.stringify({ generatedAt: asOf, impacts }, null, 1));
  console.log(report);
  console.log(`\nfull impact data -> ${repFile}`);
})();
