// P2.9 PWA — service worker minimal.
//
// Stratégie :
//   * cache-first sur /assets/* (chunks hashés, immutable — safe)
//   * network-first sur tout le reste (index.html, manifest.json, etc.)
//   * skipWaiting + clientsClaim → mise à jour aggressive au prochain reload
//
// Compatible avec lazyWithRetry (P1.4) : on ne cache JAMAIS index.html
// avec un TTL long ; les chunks 404 ne peuvent donc pas survivre en cache.
//
// Note : ce SW est uniquement chargé en PROD (vite import.meta.env.PROD).

const CACHE_NAME = 'financeai-v3';
const PRECACHE_URLS = ['/', '/manifest.json', '/icon.svg'];

// P2.9 fix : précache individuel (vs cache.addAll qui échoue all-or-nothing).
// Sur Vercel, '/index.html' peut 404 (rewrite vers '/'), ce qui
// faisait tomber tout le batch. Maintenant chaque resource est tentée
// séparément, on continue même si une échoue.
async function precacheIndividually(cache) {
    await Promise.all(PRECACHE_URLS.map(async (url) => {
        try {
            const res = await fetch(url, { cache: 'reload' });
            if (res.ok) await cache.put(url, res);
        } catch {
            // silent : la resource manquante ne bloque pas le SW
        }
    }));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => precacheIndividually(cache))
            .then(() => self.skipWaiting())
            .catch(() => { /* silent fail — le SW fonctionnera quand même au prochain fetch */ })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return; // pas de cache pour Era / Finnhub / Anthropic

    // Cache-first pour /assets/* (chunks Vite hashés, immutable)
    // + portfolio-history.csv (historique immuable côté serveur, peut être
    // grand ~50KB, vaut le coup d'éviter le re-fetch à chaque load).
    if (url.pathname.startsWith('/assets/') ||
        url.pathname === '/portfolio-history.csv' ||
        url.pathname === '/test-portfolio-history.csv') {
        event.respondWith(
            caches.match(req).then((hit) => {
                if (hit) return hit;
                return fetch(req).then((res) => {
                    if (!res || res.status !== 200) return res;
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                    return res;
                }).catch(() => hit || Response.error());
            })
        );
        return;
    }

    // Network-first pour index.html et le reste (avec fallback cache offline).
    // 2026-05-22 : les requêtes de navigation sont forcées en `no-store`. Sans
    // ça, fetch(req) pouvait servir un index.html depuis le cache HTTP du
    // navigateur (stale) → index pointant vers d'anciens hashes de chunks →
    // utilisateur coincé sur du vieux code après un deploy. Online = toujours
    // frais ; offline = fallback cache via le .catch ci-dessous.
    const fetchOpts = req.mode === 'navigate' ? { cache: 'no-store' } : undefined;
    event.respondWith(
        fetch(req, fetchOpts)
            .then((res) => {
                if (!res || res.status !== 200) return res;
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                return res;
            })
            .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
});
