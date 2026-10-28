#!/usr/bin/env node
// Agent Control Center — Lot 2 : scan READ-ONLY du backlog + git → données pour le dashboard.
// Node natif, ZÉRO dépendance. TOLÉRANT (le BACKLOG est semi-libre) : une ligne non reconnue est ignorée,
// jamais d'exception propagée (mode dégradé). Utilisé par la route GET /backlog de server.mjs.
//
// Sources : BACKLOG.md (items), docs/A_FAIRE_MOI.md (en attente humaine), git (branche + vélocité),
// HANDOVER.md (nb de tests déjà tenu — PAS de re-run vitest coûteux).
//
// Sécurité : on n'exécute QUE des commandes FIXES (git/gh) via execFileSync (PAS de shell → aucune
// injection possible ; zéro entrée utilisateur interpolée). Best-effort : timeout court, stderr muet, jamais bloquant.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKLOG = join(ROOT, 'BACKLOG.md');
const AFAIRE = join(ROOT, 'docs', 'A_FAIRE_MOI.md');
const HANDOVER = join(ROOT, 'HANDOVER.md');

const readSafe = (p) => { try { return existsSync(p) ? readFileSync(p, 'utf8') : ''; } catch { return ''; } };
// Exécution SANS shell (execFile) de commandes FIXES → aucune injection. Jamais bloquant.
const run = (file, args) => {
  try { return execFileSync(file, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000, windowsHide: true }).trim(); }
  catch { return ''; }
};

const ITEM_RE = /^[-*]\s*\[([ xX~])\]\s*\*\*\[([A-Za-z0-9_.-]+)\]\*\*\s*(.*)$/;
const SECTION_RE = /^#{2,4}\s+(.+?)\s*$/;
const PRIO_RE = /\b(P[0-3]|CRITICAL|CRITIQUE|HIGH|MEDIUM|MOYEN|LOW)\b/i;

// Marqueur d'un item : 🧭 décision Marc · 👤 action humaine · 🔧 Claude (défaut).
function markerOf(rest) {
  if (/🧭/.test(rest)) return 'marc';
  if (/👤/.test(rest)) return 'human';
  return 'claude';
}

function cleanDesc(rest) {
  return rest
    .replace(/^[✅🔧🧭👤⏳◑✓❌~\s]+/, '')
    .replace(/\([^)]*\)/g, ' ')      // (PR #..., dates)
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function parseBacklog() {
  const raw = readSafe(BACKLOG);
  const items = [];
  let section = '';
  for (const line of raw.split(/\r?\n/)) {
    const sm = line.match(SECTION_RE);
    if (sm) { section = sm[1].replace(/[*`#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80); continue; }
    const m = line.match(ITEM_RE);
    if (!m) continue;
    const st = m[1].toLowerCase(); const id = m[2]; const rest = m[3] || '';
    const state = st === 'x' ? 'done' : st === '~' ? 'partial' : 'open';
    const pm = rest.match(PRIO_RE);
    let priority = pm ? pm[1].toUpperCase() : null;
    if (priority === 'CRITIQUE') priority = 'CRITICAL';
    if (priority === 'MOYEN') priority = 'MEDIUM';
    items.push({ id, state, marker: markerOf(rest), big: /⏳/.test(rest), priority, section, desc: cleanDesc(rest) });
  }
  return items;
}

// Items « en attente de Marc » non-[ID] de A_FAIRE_MOI.md (titres de section ## / ### encore ouverts).
function parseAFaire() {
  const raw = readSafe(AFAIRE);
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^#{2,3}\s+(.+?)\s*$/);
    if (!m) continue;
    const title = m[1].replace(/[*`#]/g, '').replace(/\s+/g, ' ').trim();
    if (/FAIT|✅/.test(title)) continue; // sections déjà faites
    if (title) out.push({ id: null, source: 'A_FAIRE_MOI', desc: title.slice(0, 120), marker: 'human' });
  }
  return out.slice(0, 30);
}

// « En cours » : id dérivé de la branche git active (claude/<slug>) + PR ouvertes (titres contenant [ID]).
function inProgress(items) {
  const ids = new Set();
  const branch = run('git', ['branch', '--show-current']); // ex. claude/acc-lot2-backlog
  const slug = branch.replace(/^claude\//, '').toLowerCase();
  if (slug) {
    for (const it of items) {
      const key = it.id.toLowerCase().replace(/[_.]/g, '-');
      // Match STRICT (évite « FISC-RE » qui matcherait la branche `fisc-re-capital-loss`) :
      // égalité, ou l'un est préfixe de l'autre sur une frontière `-`.
      if (key === slug || key.startsWith(slug + '-') || slug.startsWith(key + '-')) ids.add(it.id);
    }
  }
  // PR ouvertes (gh, best-effort) : extraire les [ID] des titres.
  const prRaw = run('gh', ['pr', 'list', '--state', 'open', '--json', 'number,title,headRefName', '--limit', '30']);
  let prs = [];
  try { prs = prRaw ? JSON.parse(prRaw) : []; } catch { prs = []; }
  for (const pr of prs) {
    const idm = ((pr.title || '') + ' ' + (pr.headRefName || '')).match(/\[([A-Za-z0-9_.-]+)\]/);
    if (idm) { const want = idm[1].toLowerCase(); for (const it of items) if (it.id.toLowerCase() === want) ids.add(it.id); }
  }
  return { ids, branch, prs: prs.map((p) => ({ number: p.number, title: (p.title || '').slice(0, 90), branch: p.headRefName })).slice(0, 12) };
}

function metrics() {
  const ho = readSafe(HANDOVER);
  // nb de tests : 1ʳᵉ occurrence "~2176 tests" du HANDOVER (bandeau de tête = le plus récent ; PAS de re-run vitest).
  let tests = null;
  // Capte "~2176 tests", "2176/2176 tests" ET "~2164 verts" (le HANDOVER varie le mot).
  const tm = ho.match(/~?\s*([0-9]{3,5})\s*(?:\/\s*[0-9]{3,5})?\s*(?:tests|verts)/i);
  if (tm) tests = Number(tm[1]);
  const wk = run('git', ['log', '--since=7.days', '--oneline']);
  const commits7d = wk ? wk.split(/\r?\n/).filter(Boolean).length : null;
  const lastCommit = run('git', ['log', '-1', '--format=%cI']) || null;
  return { tests, commits7d, lastCommit };
}

// Phases du brief (BRIEF MARC) : best-effort depuis le HANDOVER ("Phase N … ✅/FAITE/en cours").
function phases() {
  const ho = readSafe(HANDOVER);
  const out = [];
  for (const m of ho.matchAll(/\*\*Phase\s*([0-9]+)\*\*([^\n→]*)/gi)) {
    const seg = m[2] || '';
    out.push({ phase: Number(m[1]), label: seg.replace(/[*`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60), done: /FAITE|✅/i.test(seg) });
    if (out.length >= 6) break;
  }
  return out;
}

export function scanBacklog() {
  const items = parseBacklog();
  const { ids: enCoursIds, branch, prs } = inProgress(items);

  const fait = items.filter((i) => i.state === 'done');
  const reste = items.filter((i) => i.state !== 'done');
  // « En attente » = bloqué sur un HUMAIN : décision Marc (🧭) OU action humaine (👤). Sinon Claude → « à venir ».
  const waiting = (i) => i.marker === 'marc' || i.marker === 'human';
  const enCours = reste.filter((i) => enCoursIds.has(i.id));
  const enAttente = reste.filter((i) => !enCoursIds.has(i.id) && waiting(i));
  const aVenir = reste.filter((i) => !enCoursIds.has(i.id) && !waiting(i));

  return {
    generatedAt: new Date().toISOString(),
    branch, prs,
    counts: { total: items.length, fait: fait.length, enCours: enCours.length, enAttente: enAttente.length, aVenir: aVenir.length },
    enCours, enAttente: enAttente.concat(parseAFaire()), aVenir, fait: fait.slice(0, 60),
    phases: phases(),
    metrics: metrics(),
  };
}

// CLI : `node backlog-scan.mjs` → imprime le JSON (test/debug).
if (process.argv[1] && process.argv[1].endsWith('backlog-scan.mjs')) {
  try { process.stdout.write(JSON.stringify(scanBacklog(), null, 2) + '\n'); } catch (e) { process.stdout.write(JSON.stringify({ error: String(e) }) + '\n'); }
}
