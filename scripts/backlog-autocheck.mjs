#!/usr/bin/env node
// backlog-autocheck — coche docs/BACKLOG.md à partir des [ID] en tête des messages de
// commit poussés sur main.
//
// Convention (cf CLAUDE.md) : un item AUTO-cochable porte son ID entre crochets sur la
// ligne de case, ex. `- [ ] [D5] ...` ou `- [ ] **[D5]** ...`. Les cases SANS [ID]
// (tests manuels de Marc) ne sont JAMAIS cochées automatiquement.
//
// Idempotent. Le commit final est taggé [skip-backlog] → ni la CI ni cette Action ne
// se redéclenchent dessus. Test local : `IDS=D5,G0 node scripts/backlog-autocheck.mjs`.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BACKLOG = 'docs/BACKLOG.md';
const before = (process.env.BEFORE_SHA || '').trim();
const after = (process.env.AFTER_SHA || 'HEAD').trim();
const isZero = (s) => !s || /^0+$/.test(s); // 1er push / branche neuve → before = 000…

// Sujets des commits de ce push.
let log = '';
try {
  const range = isZero(before) ? `-1 ${after}` : `${before}..${after}`;
  log = execSync(`git log --no-merges --format=%s ${range}`, { encoding: 'utf8' });
} catch { try { log = execSync('git log -1 --format=%s', { encoding: 'utf8' }); } catch { /* noop */ } }

// IDs = [ID] en tête de chaque sujet de commit.
const ids = new Set();
for (const line of log.split('\n')) {
  const m = line.match(/^\s*\[([A-Za-z0-9][A-Za-z0-9.\-_]*)\]/);
  if (m) ids.add(m[1]);
}
if (process.env.IDS) for (const id of process.env.IDS.split(',')) if (id.trim()) ids.add(id.trim());
if (ids.size === 0) { console.log('backlog-autocheck : aucun [ID] dans les commits poussés.'); process.exit(0); }

let md = readFileSync(BACKLOG, 'utf8');
const original = md;
let count = 0;
const ticked = new Set();
for (const id of ids) {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Case OUVERTE dont la ligne contient [ID] (lookahead) → coche.
  const re = new RegExp(`^(\\s*[-*] )\\[ \\]((?=[^\\n]*\\[${esc}\\])[^\\n]*)$`, 'gm');
  md = md.replace(re, (_full, p1, p2) => { count++; ticked.add(id); return `${p1}[x]${p2}`; });
}
if (md !== original) {
  writeFileSync(BACKLOG, md);
  console.log(`backlog-autocheck : ${count} case(s) cochée(s) pour ${[...ticked].join(', ')}.`);
} else {
  console.log(`backlog-autocheck : aucun item ouvert ne porte un [ID] correspondant à ${[...ids].join(', ')}.`);
}
