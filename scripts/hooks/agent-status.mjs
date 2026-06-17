#!/usr/bin/env node
// PreToolUse / PostToolUse (matcher `Task|Agent`) : CAPTEUR d'activité des 14 agents projet.
// Maintient .claude/status.json (snapshot, écriture ATOMIQUE temp+rename) + append .claude/agent-events.jsonl
// (historique). Alimente le dashboard tools/agent-control-center/ avec des données 100 % RÉELLES (source:"live").
//
// v2 : parse les findings de la sortie d'agent (sévérité + fichier:ligne) → status.risks (best-effort).
// NON-BLOQUANT — exit(0) TOUJOURS, même en cas d'erreur : un capteur cosmétique ne casse JAMAIS une session.
import { readFileSync, writeFileSync, renameSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAUDE_DIR = join(ROOT, '.claude');
const STATUS = join(CLAUDE_DIR, 'status.json');
const STATUS_TMP = join(CLAUDE_DIR, 'status.json.tmp');
const EVENTS = join(CLAUDE_DIR, 'agent-events.jsonl');

const AGENTS = [
  'orchestrator', 'architect', 'product-manager', 'financial-integrity', 'security-privacy',
  'code-reviewer', 'ai-reviewer', 'documentation-manager', 'projection-validator',
  'silent-failure-hunter', 'test-writer', 'performance-optimizer', 'a11y-auditor', 'code-analyzer',
];
const SEV_RANK = { CRITIQUE: 0, 'ÉLEVÉ': 1, MOYEN: 2, FAIBLE: 3 };
const nowIso = () => new Date().toISOString();

function freshStatus() {
  const agents = {};
  for (const n of AGENTS) agents[n] = { name: n, status: 'idle', task: null, startedAt: null, lastRun: null, durationMs: null, partial: false, critical: 0, warnings: 0, risks: [] };
  return {
    schemaVersion: 2, updatedAt: nowIso(), source: 'live', currentTask: null,
    progress: { done: 0, active: 0, pending: 0, total: 0, pct: 0 },
    activeAgents: [], completedAgents: [], pendingAgents: [],
    criticalIssues: 0, warnings: 0,
    decision: { verdict: 'PENDING', reason: 'Aucune activité', blockedBy: [] },
    agents, pipeline: [], risks: [], audits: [], scores: {},
  };
}

function readStatus() {
  try {
    if (existsSync(STATUS)) {
      const s = JSON.parse(readFileSync(STATUS, 'utf8'));
      if (s && s.agents && s.source !== 'example') return s;
    }
  } catch { /* corrompu/absent → vierge */ }
  return freshStatus();
}

// v2 — parse best-effort les findings d'un agent : sévérité (CRITIQUE/ÉLEVÉ/MOYEN/FAIBLE) + fichier:ligne.
// Ignore les négations (« 0 CRITIQUE », « aucun finding élevé »). Retourne compteurs + risques structurés.
function parseFindings(resp, agent) {
  let text = '';
  try { text = typeof resp === 'string' ? resp : JSON.stringify(resp); } catch { return { crit: 0, warn: 0, risks: [] }; }
  const sevRe = /\b(CRITIQUE|[ÉE]LEV[ÉE]S?|MOYENS?|FAIBLES?)\b/i;
  const fileRe = /([\w./@-]+\.[a-z]{1,5}:\d+)/i;
  const neg = /\b(0|aucun|aucune|z[ée]ro|pas de|no|sans)\b[^.]{0,16}$/i;
  const risks = []; let crit = 0, warn = 0;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(sevRe);
    if (!m) continue;
    if (neg.test(line.slice(0, m.index))) continue; // négation juste avant la sévérité
    const raw = m[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const sev = raw.startsWith('CRIT') ? 'CRITIQUE' : raw.startsWith('ELEV') ? 'ÉLEVÉ' : raw.startsWith('MOY') ? 'MOYEN' : 'FAIBLE';
    if (sev === 'CRITIQUE') crit++; else if (sev === 'ÉLEVÉ' || sev === 'MOYEN') warn++;
    if (sev !== 'FAIBLE') {
      const f = line.match(fileRe);
      if (f && risks.length < 12) {
        const cause = line.replace(sevRe, '').replace(fileRe, '').replace(/[|*#>=\-—•]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150);
        risks.push({ severity: sev, agent, file: f[1], cause });
      }
    }
  }
  return { crit, warn, risks };
}

function recompute(s) {
  const active = [], completed = [], pending = [], blocked = [];
  let crit = 0, warn = 0; let allRisks = [];
  for (const n of AGENTS) {
    const a = s.agents[n];
    if (a.status === 'running') active.push(n);
    else if (a.status === 'completed' || a.status === 'failed') completed.push(n);
    else if (a.status === 'pending') pending.push(n);
    crit += a.critical || 0; warn += a.warnings || 0;
    if ((a.critical || 0) > 0) blocked.push(n);
    if (a.risks && a.risks.length) allRisks = allRisks.concat(a.risks);
  }
  s.activeAgents = active; s.completedAgents = completed; s.pendingAgents = pending;
  s.criticalIssues = crit; s.warnings = warn;
  s.risks = allRisks.sort((x, y) => (SEV_RANK[x.severity] ?? 9) - (SEV_RANK[y.severity] ?? 9)).slice(0, 20);
  const total = active.length + completed.length;
  s.progress = { done: completed.length, active: active.length, pending: pending.length, total, pct: total ? Math.round((completed.length / total) * 100) : 0 };
  s.decision = crit > 0
    ? { verdict: 'NO-GO', reason: `${crit} finding(s) critique(s)`, blockedBy: blocked }
    : active.length > 0 ? { verdict: 'PENDING', reason: 'Revue en cours', blockedBy: [] }
      : completed.length > 0 ? { verdict: 'GO', reason: `${warn} avertissement(s), 0 critique`, blockedBy: [] }
        : { verdict: 'PENDING', reason: 'Aucune activité', blockedBy: [] };
  s.currentTask = (active[0] && s.agents[active[0]]?.task) || s.currentTask || null;
  s.updatedAt = nowIso();
  return s;
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const event = payload.hook_event_name || '';
const agent = payload.tool_input?.subagent_type;
if ((event !== 'PreToolUse' && event !== 'PostToolUse') || !AGENTS.includes(agent)) process.exit(0);

const task = payload.tool_input?.description || (typeof payload.tool_input?.prompt === 'string' ? payload.tool_input.prompt.slice(0, 80) : null);

try {
  if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true });
  const s = readStatus();
  s.source = 'live';
  const a = s.agents[agent];

  if (event === 'PreToolUse') {
    a.status = 'running'; a.task = task; a.startedAt = nowIso(); a.lastRun = a.startedAt; a.partial = false; a.durationMs = null; a.risks = [];
    s.pipeline.push({ step: s.pipeline.length + 1, agent, status: 'running', durationMs: null });
    try { appendFileSync(EVENTS, JSON.stringify({ ts: nowIso(), event: 'start', agent, task }) + '\n'); } catch { /* */ }
  } else {
    a.status = 'completed'; a.lastRun = nowIso();
    a.durationMs = a.startedAt ? (Date.parse(a.lastRun) - Date.parse(a.startedAt)) : null;
    const { crit, warn, risks } = parseFindings(payload.tool_response, agent);
    a.critical = crit; a.warnings = warn; a.risks = risks;
    const p = [...s.pipeline].reverse().find((x) => x.agent === agent && x.status === 'running');
    if (p) { p.status = 'completed'; p.durationMs = a.durationMs; }
    try { appendFileSync(EVENTS, JSON.stringify({ ts: nowIso(), event: 'end', agent, durationMs: a.durationMs, critical: crit, warnings: warn }) + '\n'); } catch { /* */ }
  }

  recompute(s);
  writeFileSync(STATUS_TMP, JSON.stringify(s, null, 2));
  renameSync(STATUS_TMP, STATUS);
} catch { /* capteur cosmétique : ne JAMAIS casser une session */ }

process.exit(0);
