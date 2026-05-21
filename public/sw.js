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

const CACHE_NAME = 'financeai-v1';
const PRECACHE_URLS = ['/', '/index.html', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
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
    if (url.pathname.startsWith('/assets/')) {
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

    // Network-first pour index.html et le reste (avec fallback cache offline)
    event.respondWith(
        fetch(req)
            .then((res) => {
                if (!res || res.status !== 200) return res;
                const clone = res.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                return res;
            })
            .catch(() => caches.match(req).then((hit) => hit || caches.match('/index.html')))
    );
});
