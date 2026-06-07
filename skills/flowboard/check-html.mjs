#!/usr/bin/env node
// Validate a generated FlowBoard HTML file before declaring it done.
// Syntax-checks every inline <script> (a single bad quote blanks the page) and
// sanity-checks the boilerplate. Exits non-zero on any problem.
//
//   node check-html.mjs path/to/flowboard.html

import fs from 'node:fs';
import vm from 'node:vm';

const file = process.argv[2];
if (!file) { console.error('usage: node check-html.mjs <file.html>'); process.exit(2); }
if (!fs.existsSync(file)) { console.error('✗ not found: ' + file); process.exit(2); }

const html = fs.readFileSync(file, 'utf8');
const problems = [];

// 1) Every inline <script> must be valid JavaScript.
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((m) => m[1])
  .filter((s) => s.trim());
let initFound = false;
for (const code of scripts) {
  if (code.includes('FlowBoard.init')) initFound = true;
  try {
    new vm.Script(code); // syntax check only — never executed
  } catch (e) {
    problems.push('<script> SyntaxError: ' + e.message
      + ' — often an apostrophe/quote in a string; wrap human text in `backticks`.');
  }
}

// 2) Boilerplate sanity (warnings, not failures).
const warnings = [];
if (!scripts.length) problems.push('no inline <script> found');
if (!initFound) warnings.push('no FlowBoard.init({…}) call found');
if (!/<div[^>]*id=["']app["']/.test(html)) warnings.push('no <div id="app"> container found');
if (!html.includes('flowboard.css')) warnings.push('flowboard.css <link> missing');
if (!html.includes('flowboard.js')) warnings.push('flowboard.js <script src> missing');

warnings.forEach((w) => console.warn('⚠ ' + w));

if (problems.length) {
  problems.forEach((p) => console.error('✗ ' + p));
  console.error('✗ ' + file + ' is INVALID — the page would be blank. Fix and re-run.');
  process.exit(1);
}
console.log('✓ ' + file + ' looks valid (' + scripts.length + ' script block(s) parse cleanly).');
