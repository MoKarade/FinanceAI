// Agent Control Center — dashboard (vanilla, zéro dépendance).
// Poll /status toutes les 2 s, rend 5 sections. Données réelles (source:"live") ou exemple étiqueté.
// XSS-safe par construction : aucun innerHTML — uniquement textContent + replaceChildren + append.
'use strict';

const POLL_MS = 2000;
const STALE_MS = 10 * 60 * 1000; // un agent "running" sans fin depuis 10 min → affiché "bloqué ?"
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fmtDur = (ms) => ms == null ? '' : ms < 1000 ? ms + ' ms' : (ms / 1000).toFixed(1) + ' s';
const ago = (iso) => {
  if (!iso) return 'jamais'; const d = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (isNaN(d)) return '—'; if (d < 60) return 'il y a ' + d + ' s';
  if (d < 3600) return 'il y a ' + Math.round(d / 60) + ' min'; return 'il y a ' + Math.round(d / 3600) + ' h';
};
const statusLabel = (st) => ({ idle: 'inactif', pending: 'en attente', running: 'en cours', completed: 'terminé', failed: 'échec', stale: 'bloqué ?' }[st] || st);
const sevClass = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

let META = { agents: [], pipeline: [] };
async function loadMeta() { try { META = await (await fetch('agents.meta.json')).json(); } catch { META = { agents: [], pipeline: [] }; } }
function statusOf(a, live) {
  if (live && a.status === 'running' && a.startedAt && (Date.now() - Date.parse(a.startedAt)) > STALE_MS) return 'stale';
  return a.status || 'idle';
}

function render(s) {
  const live = s.source !== 'example';
  const banner = $('source-banner');
  if (live) banner.hidden = true;
  else { banner.hidden = false; banner.textContent = "⚠ Données d'EXEMPLE — pas de vraie activité. Lance une revue d'agents (/review-all) pour des données réelles."; }

  const verdict = (s.decision && s.decision.verdict) || 'PENDING';
  const pill = $('verdict-pill'); pill.textContent = verdict; pill.className = 'verdict ' + (verdict === 'NO-GO' ? 'NOGO' : verdict);
  $('updated').textContent = s.updatedAt ? 'maj ' + ago(s.updatedAt) : '';

  const p = s.progress || {};
  $('m-active').textContent = (s.activeAgents || []).length;
  $('m-done').textContent = (s.completedAgents || []).length;
  $('m-pending').textContent = (s.pendingAgents || []).length;
  $('m-crit').textContent = s.criticalIssues || 0;
  $('m-warn').textContent = s.warnings || 0;
  $('m-pct').textContent = (p.pct || 0) + '%';

  // Pipeline
  const pipe = $('pipeline'); pipe.replaceChildren();
  const steps = (s.pipeline && s.pipeline.length)
    ? s.pipeline.map((x) => ({ label: x.agent, status: x.status, dur: x.durationMs }))
    : (META.pipeline || []).map((label) => ({ label, status: 'pending', dur: null }));
  if (!steps.length) pipe.appendChild(el('div', 'empty', 'Aucune étape — lance une revue.'));
  steps.forEach((x, i) => {
    const li = el('li', x.status);
    li.append(el('span', 'p-step', '#' + (i + 1)), el('span', 'p-agent', x.label), el('span', 'st ' + x.status, statusLabel(x.status)));
    if (x.dur != null) li.appendChild(el('span', 'p-dur', fmtDur(x.dur)));
    pipe.appendChild(li);
  });

  // Agents (14 depuis meta, enrichis du status)
  const grid = $('agents'); grid.replaceChildren();
  const liveAgents = s.agents || {};
  const list = META.agents.length ? META.agents : Object.values(liveAgents).map((a) => ({ name: a.name }));
  $('agents-count').textContent = '(' + list.length + ')';
  list.forEach((meta) => {
    const a = liveAgents[meta.name] || { name: meta.name, status: 'idle' };
    const st = statusOf(a, live);
    const card = el('div', 'agent');
    const head = el('div', 'agent-head');
    head.append(el('span', 'agent-name', meta.name), el('span', 'st ' + st, statusLabel(st)));
    card.appendChild(head);
    const m = el('div', 'agent-meta');
    if (meta.model) m.appendChild(el('span', 'badge ' + meta.model, meta.model));
    if (meta.priority && meta.priority !== 'normal') m.appendChild(el('span', 'badge ' + meta.priority, meta.priority));
    card.appendChild(m);
    const task = el('div', 'agent-task');
    if (a.task) task.textContent = a.task; else task.appendChild(el('span', 'muted', meta.role || 'inactif'));
    card.appendChild(task);
    const foot = el('div', 'agent-foot');
    foot.append(el('span', null, a.lastRun ? ago(a.lastRun) : 'jamais exécuté'), el('span', null, a.durationMs != null ? fmtDur(a.durationMs) : ''));
    card.appendChild(foot);
    grid.appendChild(card);
  });

  // Risques (best-effort en live)
  $('risks-tag').hidden = !live;
  renderList($('risks'), s.risks || [], (r) => {
    const row = el('div', 'row');
    row.appendChild(el('span', 'sev ' + sevClass(r.severity), r.severity || '?'));
    const b = el('div', 'body');
    if (r.file) b.appendChild(el('div', 'file', r.file));
    b.appendChild(el('div', 'desc', [r.cause, r.impact, r.fix].filter(Boolean).join(' — ')));
    if (r.agent) b.appendChild(el('div', 'desc muted', r.agent));
    row.appendChild(b); return row;
  }, live ? 'Aucun risque structuré (extraction des findings = v2).' : 'Aucun risque.');

  // Audits
  $('audits-tag').hidden = !live;
  renderList($('audits'), s.audits || [], (au) => {
    const row = el('div', 'row');
    row.appendChild(el('span', 'res ' + (au.result || 'warn'), (au.result || '').toUpperCase()));
    const b = el('div', 'body');
    b.appendChild(el('div', null, au.label || ''));
    if (au.detail) b.appendChild(el('div', 'desc', au.detail));
    row.appendChild(b); return row;
  }, live ? 'Aucun audit structuré (v2).' : 'Aucun audit.');

  // Verdict + scores
  $('scores-tag').hidden = !live;
  const dec = $('decision'); dec.className = 'decision ' + (verdict === 'NO-GO' ? 'NOGO' : verdict);
  dec.replaceChildren(el('span', 'big', verdict), el('span', 'reason', (s.decision && s.decision.reason) || ''));
  const scores = s.scores || {}; const sc = $('scores'); sc.replaceChildren();
  const keys = [['security', 'sécurité'], ['financial', 'financier'], ['quality', 'qualité'], ['ux', 'UX'], ['documentation', 'doc'], ['global', 'global']];
  if (Object.keys(scores).length) keys.forEach(([k, lbl]) => { const d = el('div', 'score'); d.appendChild(el('b', null, scores[k] != null ? scores[k] : '—')); d.appendChild(el('span', null, lbl)); sc.appendChild(d); });
  else sc.appendChild(el('div', 'empty', live ? 'Scores agrégés = v3 (nécessite des findings structurés).' : 'Pas de scores.'));
}

function renderList(node, items, rowFn, emptyMsg) {
  node.replaceChildren();
  if (!items || !items.length) { node.appendChild(el('div', 'empty', emptyMsg)); return; }
  items.forEach((it) => node.appendChild(rowFn(it)));
}

async function poll() {
  try {
    const res = await fetch('/status', { cache: 'no-store' });
    const s = await res.json();
    $('conn').textContent = '● live'; $('conn').className = 'conn';
    render(s);
  } catch {
    $('conn').textContent = '● serveur injoignable'; $('conn').className = 'conn down';
  }
}

(async function init() { await loadMeta(); await poll(); setInterval(poll, POLL_MS); })();
