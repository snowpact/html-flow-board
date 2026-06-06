#!/usr/bin/env node
// Install or update the FlowBoard Claude Code skill.
//
//   npx github:snowpact/html-flow-board            # interactive: project vs account
//   npx github:snowpact/html-flow-board --project  # ./.claude/skills/flowboard
//   npx github:snowpact/html-flow-board --user     # ~/.claude/skills/flowboard
//
// Re-run anytime to update the skill to the latest version.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const SKILL = 'flowboard';
const CDN = 'https://cdn.jsdelivr.net/gh/snowpact/html-flow-board@main/skills/' + SKILL + '/SKILL.md';
const here = path.dirname(fileURLToPath(import.meta.url));

// Prefer the SKILL.md shipped next to this script; fall back to the CDN.
async function loadSkill() {
  const local = path.join(here, '..', 'skills', SKILL, 'SKILL.md');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  if (typeof fetch !== 'function') {
    throw new Error('SKILL.md not found locally and this Node has no fetch (need Node 18+).');
  }
  const res = await fetch(CDN);
  if (!res.ok) throw new Error('failed to download SKILL.md (HTTP ' + res.status + ')');
  return await res.text();
}

function scopeFromArgs(argv) {
  if (argv.some((a) => a === '--user' || a === '--global' || a === '-g')) return 'user';
  if (argv.some((a) => a === '--project' || a === '--local' || a === '-l')) return 'project';
  return null;
}

function ask(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a.trim()); });
  });
}

async function main() {
  let scope = scopeFromArgs(process.argv.slice(2));
  if (!scope) {
    if (!process.stdin.isTTY) {
      scope = 'project'; // non-interactive (CI / piped): sensible default
    } else {
      console.log('Install the FlowBoard Claude skill into:');
      console.log('  1) this project  → ./.claude/skills/' + SKILL);
      console.log('  2) your account  → ~/.claude/skills/' + SKILL);
      const a = await ask('Choose [1/2] (default 1): ');
      scope = a === '2' ? 'user' : 'project';
    }
  }

  const base = scope === 'user' ? os.homedir() : process.cwd();
  const dir = path.join(base, '.claude', 'skills', SKILL);
  const file = path.join(dir, 'SKILL.md');
  const existed = fs.existsSync(file);

  const content = await loadSkill();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, content, 'utf8');

  console.log((existed ? '↻ Updated' : '✓ Installed') + ' FlowBoard skill → ' + file);
  console.log('  Open Claude Code (or run /skills) to pick it up. Re-run this command to update.');
}

main().catch((err) => {
  console.error('flowboard skill install failed: ' + err.message);
  process.exit(1);
});
