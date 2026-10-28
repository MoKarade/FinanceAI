#!/usr/bin/env node
// Agent Control Center — Lot 4 : scan READ-ONLY des runs de workflows → données pour le dashboard.
// Node natif, ZÉRO dépendance, PUR fs (pas de shell, pas de git). TOLÉRANT : un journal illisible est
// ignoré, jamais d'exception propagée. Utilisé par la route GET /workflows de server.mjs.
//
// Source (découverte ACC Lot 4, 2026-06-19) — les workflows SE JOURNALISENT eux-mêmes, pas de hook :
//   <home>/.claude/projects/<projet-encodé>/<session>/
//     workflows/wf_<runId>.json                  ← run TERMINÉ (journal complet)
//     workflows/scripts/<name>-<runId>.js        ← script persisté
//     subagents/workflows/<runId>/journal.jsonl  ← stream LIVE (started/result) tant que le run tourne
//   Un run est EN COURS si son dossier subagents/workflows/<runId>/ existe SANS wf_<runId>.json final.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // racine du repo (= cwd du serveur)
const MAX_RECENT = 12;          // runs terminés affichés (les plus récents)
const MAX_AGENTS = 40;          // agents listés par run (borne d'affichage)
const STALE_MS = 2 * 60 * 60 * 1000; // run « en cours » sans json final depuis > 2 h = fantôme (crash) → stale

const readSafe = (p) => { try { return existsSync(p) ? readFileSync(p, 'utf8') : ''; } catch { return ''; } };
// readJson : sur un wf_*.json qui EXISTE mais ne parse pas (run crashé en pleine écriture), on SIGNALE
// au lieu d'avaler — sinon le run disparaît du dashboard, présenté comme « aucun run » (faux négatif muet).
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { console.warn('[workflow-scan] journal illisible:', p, String(e).slice(0, 80)); return null; } };
const lsDirs = (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const lsFiles = (p) => { try { return readdirSync(p, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name); } catch { return []; } };

// Dossier projet encodé par Claude Code : chaque caractère non alphanumérique du chemin du repo → '-'
// (vérifié : `C:\Users\…\FinanceAI` → `C--Users-…-FinanceAI`). Repli : glob d'un dossier contenant le basename.
function projectDir() {
  const root = join(homedir(), '.claude', 'projects');
  const enc = ROOT.replace(/[^a-zA-Z0-9]/g, '-');
  const primary = join(root, enc);
  if (existsSync(primary)) return primary;
  const base = basename(ROOT).toLowerCase();
  const hit = lsDirs(root).find((d) => d.toLowerCase().includes(base));
  if (hit) return join(root, hit);
  // Ni l'encodage primaire ni le repli basename ne matchent → SIGNALER (sinon 0 run muet présenté comme « aucun »).
  console.warn('[workflow-scan] dossier projet introuvable (encodage Claude Code ?), tenté:', primary);
  return primary;
}

// Sessions = sous-dossiers UUID (on ignore `memory/` et autres dossiers non-session).
function sessionDirs(proj) {
  return lsDirs(proj).filter((d) => existsSync(join(proj, d, 'workflows')) || existsSync(join(proj, d, 'subagents', 'workflows'))).map((d) => join(proj, d));
}

function agentsFromProgress(prog) {
  const out = [];
  for (const e of prog || []) {
    if (e && e.type === 'workflow_agent' && out.length < MAX_AGENTS) {
      out.push({ label: String(e.label || e.agentId || '?').slice(0, 60), model: e.model || null, state: e.state || null, phase: e.phaseTitle || null });
    }
  }
  return out;
}

// Run TERMINÉ : résumé depuis wf_<runId>.json.
function completedRun(jsonPath) {
  const o = readJson(jsonPath);
  if (!o || !o.runId) return null;
  return {
    runId: o.runId,
    name: o.workflowName || 'workflow',
    status: o.status || 'completed',
    summary: (o.summary || '').slice(0, 200),
    startedAt: o.startTime ? new Date(o.startTime).toISOString() : (o.timestamp || null),
    durationMs: o.durationMs ?? null,
    agentCount: o.agentCount ?? (Array.isArray(o.workflowProgress) ? o.workflowProgress.filter((e) => e.type === 'workflow_agent').length : null),
    totalTokens: o.totalTokens ?? null,
    totalToolCalls: o.totalToolCalls ?? null,
    model: o.defaultModel || null,
    phases: (o.phases || []).map((p) => p.title).filter(Boolean).slice(0, 12),
    agents: agentsFromProgress(o.workflowProgress),
  };
}

// Run EN COURS : pas de wf_<runId>.json → état live depuis subagents/workflows/<runId>/.
function runningRun(sess, runId) {
  const rdir = join(sess, 'subagents', 'workflows', runId);
  // Nom : depuis le script persisté workflows/scripts/<name>-<runId>.js.
  let name = 'workflow';
  const scriptsDir = join(sess, 'workflows', 'scripts');
  const sf = lsFiles(scriptsDir).find((f) => f.includes(runId));
  if (sf) name = sf.replace('-' + runId + '.js', '').replace(/\.js$/, '') || name;
  // Progression : journal.jsonl (un 'started' + un 'result' par agentId).
  const started = new Set(), done = new Set();
  for (const line of readSafe(join(rdir, 'journal.jsonl')).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const ev = (() => { try { return JSON.parse(line); } catch { return null; } })();
    if (!ev || !ev.agentId) continue;
    if (ev.type === 'started') started.add(ev.agentId);
    else if (ev.type === 'result') done.add(ev.agentId);
  }
  let startedAt = null; try { startedAt = new Date(statSync(rdir).birthtimeMs || statSync(rdir).mtimeMs).toISOString(); } catch { /* */ }
  const agents = [...started].slice(0, MAX_AGENTS).map((id) => ({ label: id.slice(0, 60), model: null, state: done.has(id) ? 'done' : 'running', phase: null }));
  const age = startedAt ? Date.now() - Date.parse(startedAt) : 0;
  const status = age > STALE_MS ? 'stale' : 'running'; // sans json final depuis > 2 h → fantôme (pas un run vivant)
  return { runId, name, status, summary: '', startedAt, durationMs: null, agentCount: started.size, totalTokens: null, totalToolCalls: null, model: null, phases: [], agents, started: started.size, done: done.size };
}

export function scanWorkflows() {
  const proj = projectDir();
  const enCours = [], recents = [];
  for (const sess of sessionDirs(proj)) {
    const wfDir = join(sess, 'workflows');
    const completedIds = new Set(lsFiles(wfDir).filter((f) => /^wf_.*\.json$/.test(f)).map((f) => f.replace(/\.json$/, '')));
    // Terminés.
    for (const f of lsFiles(wfDir)) {
      if (!/^wf_.*\.json$/.test(f)) continue;
      const r = completedRun(join(wfDir, f));
      if (r) recents.push(r);
    }
    // En cours = dossier subagents/workflows/<runId>/ sans wf_<runId>.json final.
    for (const runId of lsDirs(join(sess, 'subagents', 'workflows'))) {
      if (!/^wf_/.test(runId) || completedIds.has(runId)) continue;
      enCours.push(runningRun(sess, runId));
    }
  }
  const byStart = (a, b) => (Date.parse(b.startedAt || 0) || 0) - (Date.parse(a.startedAt || 0) || 0);
  enCours.sort(byStart);
  recents.sort(byStart);
  return {
    generatedAt: new Date().toISOString(),
    counts: { running: enCours.length, recent: Math.min(recents.length, MAX_RECENT), total: recents.length + enCours.length },
    enCours,
    recents: recents.slice(0, MAX_RECENT),
  };
}

// CLI : `node workflow-scan.mjs` → imprime le JSON (test/debug).
if (process.argv[1] && process.argv[1].endsWith('workflow-scan.mjs')) {
  try { process.stdout.write(JSON.stringify(scanWorkflows(), null, 2) + '\n'); } catch (e) { process.stdout.write(JSON.stringify({ error: String(e) }) + '\n'); }
}
