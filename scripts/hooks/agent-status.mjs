#!/usr/bin/env node
// PreToolUse / PostToolUse (matcher `Task|Agent`) + SubagentStop : CAPTEUR d'activité des 14 agents projet.
// Maintient .claude/status.json (snapshot, écriture ATOMIQUE temp+rename) + append .claude/agent-events.jsonl
// (historique). Alimente le dashboard tools/agent-control-center/ avec des données 100 % RÉELLES (source:"live").
//
// v2 : parse les findings de la sortie d'agent (sévérité + fichier:ligne) → status.risks (best-effort).
// v3 [ACC Lot 1] : (a) garde le PROMPT COMPLET → agents[nom].message (plus de troncature 80 car) ;
//   (b) hook SubagentStop → lit agent_transcript_path (.jsonl), extrait FIL DE PENSÉE (thinking) + sortie
//   finale + outils utilisés, écrit le détail dans .claude/agent-transcripts/<id>.json (gitignored) et n'attache
//   qu'une RÉFÉRENCE + extraits bornés à status.json (ne pas gonfler status.json). Corrélation prompt→nom par
//   CONTENU (le prompt enregistré est sous-chaîne du 1er message user du transcript) → robuste même en panel PARALLÈLE.
//   NB : les outils sont extraits du TRANSCRIPT à la complétion (pas un matcher `*` large, trop risqué/coûteux) —
//   cohérent avec « fil de pensée affiché à la complétion ».
// NON-BLOQUANT — exit(0) TOUJOURS, même en cas d'erreur : un capteur cosmétique ne casse JAMAIS une session.
import { readFileSync, writeFileSync, renameSync, appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLAUDE_DIR = join(ROOT, '.claude');
const STATUS = join(CLAUDE_DIR, 'status.json');
const STATUS_TMP = join(CLAUDE_DIR, 'status.json.tmp');
const EVENTS = join(CLAUDE_DIR, 'agent-events.jsonl');
const TRANSCRIPTS_DIR = join(CLAUDE_DIR, 'agent-transcripts');

// Bornes (status.json reste léger ; le détail complet va dans agent-transcripts/<id>.json).
const MAX_THINKING_EXCERPT = 1200; // extrait du fil de pensée injecté dans status.json
const MAX_OUTPUT_EXCERPT = 800;    // extrait de la sortie finale
const MAX_THINKING_FULL = 60000;   // garde-fou taille du fil de pensée dans le fichier détail
const MAX_OUTPUT_FULL = 100000;    // garde-fou taille de la sortie dans le fichier détail
const MAX_TOOLS = 60;
const MAX_FIRSTUSER = 16000;       // 1er msg user gardé pour la corrélation (assez pour contenir un long prompt)
const MAX_TRANSCRIPT_BYTES = 30 * 1024 * 1024; // au-delà : on n'extrait pas (anti-timeout du hook) — signalé

// [ACC-LIVE] Démarre le serveur du dashboard en arrière-plan dès qu'un agent se lance — SAUF s'il est
// déjà up (le serveur s'auto-termine sur EADDRINUSE). Détaché (.unref) → survit à ce hook. Non-bloquant.
function ensureAccServer() {
  try {
    const srv = join(ROOT, 'tools', 'agent-control-center', 'server.mjs');
    if (!existsSync(srv)) return;
    spawn(process.execPath, [srv], { detached: true, stdio: 'ignore', cwd: ROOT }).unref();
  } catch { /* ne jamais casser le hook */ }
}

const AGENTS = [
  'orchestrator', 'architect', 'product-manager', 'financial-integrity', 'security-privacy',
  'code-reviewer', 'ai-reviewer', 'documentation-manager', 'projection-validator',
  'silent-failure-hunter', 'test-writer', 'performance-optimizer', 'a11y-auditor', 'code-analyzer',
];
const SEV_RANK = { CRITIQUE: 0, 'ÉLEVÉ': 1, MOYEN: 2, FAIBLE: 3 };
const nowIso = () => new Date().toISOString();

function freshStatus() {
  const agents = {};
  for (const n of AGENTS) agents[n] = { name: n, status: 'idle', task: null, message: null, transcript: null, startedAt: null, lastRun: null, durationMs: null, partial: false, critical: 0, warnings: 0, risks: [] };
  return {
    schemaVersion: 3, updatedAt: nowIso(), source: 'live', currentTask: null,
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
      if (s && s.agents && s.source !== 'example') {
        // Tolérance de migration v2→v3 : garantir les nouveaux champs sur chaque agent.
        for (const n of AGENTS) {
          if (!s.agents[n]) s.agents[n] = freshStatus().agents[n];
          if (s.agents[n].message === undefined) s.agents[n].message = null;
          if (s.agents[n].transcript === undefined) s.agents[n].transcript = null;
        }
        return s;
      }
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

// Normalise un bloc `content` (string | array de blocs) → texte concaténé d'un type donné.
function blocksText(content, kind) {
  if (typeof content === 'string') return kind === 'text' ? content : '';
  if (!Array.isArray(content)) return '';
  const out = [];
  for (const b of content) {
    if (b && b.type === kind) out.push(kind === 'thinking' ? (b.thinking || '') : (b.text || ''));
  }
  return out.join('\n').trim();
}

// [ACC Lot 1] Extrait du transcript .jsonl d'un sous-agent : 1er prompt user (corrélation), fil de pensée,
// sortie finale, outils utilisés. Tolérant : ignore les lignes non-message / non parsables.
function extractTranscript(path) {
  const res = { firstUserText: '', thinking: '', output: '', tools: [], oversize: false };
  let raw = '';
  try {
    if (statSync(path).size > MAX_TRANSCRIPT_BYTES) { res.oversize = true; return res; } // anti-timeout, signalé
    raw = readFileSync(path, 'utf8');
  } catch { return null; }
  const thinks = []; const texts = []; const seenTool = new Set();
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const msg = o && o.message;
    if (!msg || !msg.role) continue;
    if (msg.role === 'user' && !res.firstUserText) {
      const t = blocksText(msg.content, 'text');
      if (t) res.firstUserText = t.slice(0, MAX_FIRSTUSER);
    }
    if (msg.role === 'assistant') {
      const th = blocksText(msg.content, 'thinking');
      if (th) thinks.push(th);
      const tx = blocksText(msg.content, 'text');
      if (tx) texts.push(tx);
      if (Array.isArray(msg.content)) {
        for (const b of msg.content) {
          if (b && b.type === 'tool_use' && b.name && !seenTool.has(b.name) && res.tools.length < MAX_TOOLS) {
            seenTool.add(b.name); res.tools.push(b.name);
          }
        }
      }
    }
  }
  // NB (vérifié LIVE 2026-06-19) : les transcripts SOUS-AGENTS n'ont PAS de blocs `thinking` (thinking reste
  // vide) → on capture la SORTIE finale + les outils. Le « fil de pensée » n'est pas disponible pour les sous-agents.
  res.thinking = thinks.join('\n\n').slice(0, MAX_THINKING_FULL);
  res.output = (texts.length ? texts[texts.length - 1] : '').trim().slice(0, MAX_OUTPUT_FULL); // dernier bloc texte = conclusion
  return res;
}

// [ACC Lot 1] Corrèle un transcript au NOM d'agent par CONTENU (prompt→nom) : le prompt COMPLET enregistré
// (agents[n].message) doit être SOUS-CHAÎNE du 1er message user du transcript ; on garde le match le plus LONG
// (= le plus spécifique). ⚠️ Vérifié LIVE : matcher sur un court préfixe attachait TOUS les transcripts d'un
// panel au 1er agent, car les prompts partagent un long PRÉAMBULE commun (boilerplate de briefing). Le match
// sur le message ENTIER désambiguïse (les prompts divergent après le préambule). Repli : agent running unique.
function matchAgentName(s, firstUserText) {
  const norm = (x) => (x || '').replace(/\s+/g, ' ').trim();
  const hay = norm(firstUserText);
  if (hay) {
    let best = null, bestLen = 0;
    for (const n of AGENTS) {
      const m = norm(s.agents[n].message);
      if (m.length >= 40 && hay.includes(m) && m.length > bestLen) { best = n; bestLen = m.length; }
    }
    if (best) return best;
  }
  const running = AGENTS.filter((n) => s.agents[n].status === 'running');
  return running.length === 1 ? running[0] : null;
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

function writeStatus(s) {
  recompute(s);
  writeFileSync(STATUS_TMP, JSON.stringify(s, null, 2));
  renameSync(STATUS_TMP, STATUS); // atomique
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }

const event = payload.hook_event_name || '';

try {
  if (!existsSync(CLAUDE_DIR)) mkdirSync(CLAUDE_DIR, { recursive: true });

  // ── SubagentStop : capture du transcript (fil de pensée + sortie + outils) ──────────────────
  if (event === 'SubagentStop') {
    const tpath = payload.agent_transcript_path;
    if (!tpath) process.exit(0);
    const ex = extractTranscript(tpath);
    if (!ex) process.exit(0);
    const capturedAt = nowIso();
    const s = readStatus(); s.source = 'live';
    const name = matchAgentName(s, ex.firstUserText); // oversize → firstUserText vide → repli single-running
    const id = String(payload.agent_id || (name || 'agent')).replace(/[^\w.-]/g, '_').slice(0, 80);
    // Transcript trop volumineux : on SIGNALE (pas de silence), sans extraire.
    if (ex.oversize) {
      if (name) { s.agents[name].transcript = { id, file: null, capturedAt, oversize: true, hasThinking: false, tools: [], thinkingExcerpt: '', outputExcerpt: '(transcript trop volumineux — non extrait)' }; writeStatus(s); }
      try { appendFileSync(EVENTS, JSON.stringify({ ts: capturedAt, event: 'transcript-oversize', agent: name, id }) + '\n'); } catch { /* */ }
      process.exit(0);
    }
    // Détail COMPLET (gitignored) — ne gonfle pas status.json. R3 : on n'inscrit le lien `file` QUE si l'écriture réussit.
    let detailWritten = false;
    try {
      if (!existsSync(TRANSCRIPTS_DIR)) mkdirSync(TRANSCRIPTS_DIR, { recursive: true });
      const detail = { agent: name, agentId: payload.agent_id || null, capturedAt, transcriptPath: tpath, thinking: ex.thinking, output: ex.output, tools: ex.tools };
      const dtmp = join(TRANSCRIPTS_DIR, id + '.json.tmp');
      writeFileSync(dtmp, JSON.stringify(detail, null, 2));
      renameSync(dtmp, join(TRANSCRIPTS_DIR, id + '.json'));
      detailWritten = true;
    } catch { /* le détail est optionnel ; status.json reste la source du dashboard */ }
    if (name) {
      s.agents[name].transcript = {
        id, file: detailWritten ? `agent-transcripts/${id}.json` : null, capturedAt,
        thinkingExcerpt: ex.thinking.slice(0, MAX_THINKING_EXCERPT),
        outputExcerpt: ex.output.slice(0, MAX_OUTPUT_EXCERPT),
        tools: ex.tools, hasThinking: ex.thinking.length > 0,
      };
      writeStatus(s);
    }
    try { appendFileSync(EVENTS, JSON.stringify({ ts: capturedAt, event: 'transcript', agent: name, id, thinking: ex.thinking.length, tools: ex.tools.length }) + '\n'); } catch { /* */ }
    process.exit(0);
  }

  // ── Pre/PostToolUse(Task|Agent) : cycle de vie de l'agent (clé = subagent_type) ──────────────
  const agent = payload.tool_input?.subagent_type;
  if ((event !== 'PreToolUse' && event !== 'PostToolUse') || !AGENTS.includes(agent)) process.exit(0);

  const fullPrompt = typeof payload.tool_input?.prompt === 'string' ? payload.tool_input.prompt : null;
  const task = payload.tool_input?.description || (fullPrompt ? fullPrompt.slice(0, 80) : null);

  const s = readStatus();
  s.source = 'live';
  const a = s.agents[agent];

  if (event === 'PreToolUse') {
    a.status = 'running'; a.task = task; a.message = fullPrompt; a.transcript = null;
    a.startedAt = nowIso(); a.lastRun = a.startedAt; a.partial = false; a.durationMs = null; a.risks = [];
    s.pipeline.push({ step: s.pipeline.length + 1, agent, status: 'running', durationMs: null });
    ensureAccServer(); // [ACC-LIVE] démarre le dashboard s'il n'est pas déjà up
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

  writeStatus(s);
} catch { /* capteur cosmétique : ne JAMAIS casser une session */ }

process.exit(0);
