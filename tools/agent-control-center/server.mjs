#!/usr/bin/env node
// Agent Control Center — serveur de dev LOCAL (Node http natif, ZÉRO dépendance).
// Sert le dashboard statique + GET /status (lit .claude/status.json, repli status.example.json) + GET /health.
// Bind 127.0.0.1 UNIQUEMENT (dev-only, jamais exposé réseau, jamais shippé). Lancement : `npm run acc`.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const STATUS = join(ROOT, '.claude', 'status.json');
const EXAMPLE = join(HERE, 'status.example.json');
const PORT = Number(process.env.ACC_PORT) || 4317;
const HOST = '127.0.0.1';

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
// Whitelist stricte (anti path-traversal) : seuls ces fichiers du dossier sont servables.
const STATIC = new Set(['index.html']); // dashboard auto-contenu (CSS+JS inline)

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

server.listen(PORT, HOST, () => {
  console.log(`\n  Agent Control Center  →  http://${HOST}:${PORT}\n`);
  console.log(`  Lit .claude/status.json (données RÉELLES si présent, sinon EXEMPLE étiqueté).`);
  console.log(`  Lance une revue d'agents (/review-all) pour voir de la vraie activité.\n`);
});
