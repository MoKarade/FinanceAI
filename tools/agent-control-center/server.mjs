#!/usr/bin/env node
// Agent Control Center — serveur de dev LOCAL (Node http natif, ZÉRO dépendance).
// Sert le dashboard statique + GET /status (lit .claude/status.json, repli status.example.json) + GET /health.
// Bind 127.0.0.1 UNIQUEMENT (dev-only, jamais exposé réseau, jamais shippé). Lancement : `npm run acc`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

// [ACC Lot 2] lecture backlog + git — import DYNAMIQUE avec repli : un scanner corrompu ne doit PAS
// empêcher le serveur de servir /status + le dashboard (revue silent-failure-hunter).
let scanBacklog = () => ({ error: 'backlog-scan indisponible' });
import('./backlog-scan.mjs').then((m) => { if (m && typeof m.scanBacklog === 'function') scanBacklog = m.scanBacklog; }).catch(() => { /* le reste du serveur fonctionne sans /backlog */ });
// [ACC Lot 4] scan des runs de workflows — même repli dynamique.
let scanWorkflows = () => ({ error: 'workflow-scan indisponible' });
import('./workflow-scan.mjs').then((m) => { if (m && typeof m.scanWorkflows === 'function') scanWorkflows = m.scanWorkflows; }).catch(() => { /* le reste du serveur fonctionne sans /workflows */ });

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const STATUS = join(ROOT, '.claude', 'status.json');
const EXAMPLE = join(HERE, 'status.example.json');
const PORT = Number(process.env.ACC_PORT) || 4317;
const HOST = '127.0.0.1';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
// Whitelist stricte (anti path-traversal) : seuls ces fichiers du dossier sont servables.
const STATIC = new Set(['index.html']); // dashboard auto-contenu (CSS+JS inline)
let backlogCache = null; // [ACC Lot 2] cache court de /backlog (scan backlog+git)
let workflowCache = null; // [ACC Lot 4] cache court de /workflows (scan des runs)

async function readStatus() {
  // Données RÉELLES si .claude/status.json existe (source:"live") ; sinon EXEMPLE clairement étiqueté.
  try {
    const raw = await readFile(STATUS, 'utf8');
    const s = JSON.parse(raw);
    if (s && s.agents) return { body: JSON.stringify(s), source: s.source || 'live' };
  } catch { /* absent/corrompu → exemple */ }
  try {
    const raw = await readFile(EXAMPLE, 'utf8');
    const s = JSON.parse(raw);
    s.source = 'example';
    return { body: JSON.stringify(s), source: 'example' };
  } catch {
    return { body: JSON.stringify({ source: 'example', agents: {}, pipeline: [], activeAgents: [], completedAgents: [], pendingAgents: [], decision: { verdict: 'PENDING' } }), source: 'example' };
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}`);
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      return res.end(JSON.stringify({ status: 'healthy' }));
    }
    if (url.pathname === '/status') {
      const { body, source } = await readStatus();
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store', 'X-ACC-Source': source });
      return res.end(body);
    }
    // [ACC Lot 2] backlog + git. Cache court (2 s) : le dashboard poll, on évite de relancer git à chaque requête.
    if (url.pathname === '/backlog') {
      const now = Date.now();
      if (!backlogCache || now - backlogCache.t > 2000) {
        try { backlogCache = { t: now, body: JSON.stringify(scanBacklog()) }; }
        catch (e) { backlogCache = { t: now, body: JSON.stringify({ error: 'scan failed', detail: String(e) }) }; }
      }
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(backlogCache.body);
    }
    // [ACC Lot 4] runs de workflows (terminés + en cours). Cache court (2 s).
    if (url.pathname === '/workflows') {
      const now = Date.now();
      if (!workflowCache || now - workflowCache.t > 2000) {
        try { workflowCache = { t: now, body: JSON.stringify(scanWorkflows()) }; }
        catch (e) { workflowCache = { t: now, body: JSON.stringify({ error: 'scan failed', detail: String(e) }) }; }
      }
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      return res.end(workflowCache.body);
    }
    // Statiques (whitelist stricte)
    const name = url.pathname === '/' ? 'index.html' : normalize(url.pathname).replace(/^[/\\]+/, '');
    if (!STATIC.has(name)) { res.writeHead(404); return res.end('Not found'); }
    const data = await readFile(join(HERE, name));
    res.writeHead(200, { 'Content-Type': MIME[extname(name)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return res.end(data);
  } catch (e) {
    res.writeHead(500); res.end('ACC server error');
  }
});

server.on('error', (e) => { if (e.code === 'EADDRINUSE') process.exit(0); throw e; }); // déjà up → cette instance s'efface
server.listen(PORT, HOST, () => {
  console.log(`\n  Agent Control Center  →  http://${HOST}:${PORT}\n`);
  console.log(`  Lit .claude/status.json (données RÉELLES si présent, sinon EXEMPLE étiqueté).`);
  console.log(`  Lance une revue d'agents (/review-all) pour voir de la vraie activité.\n`);
});
