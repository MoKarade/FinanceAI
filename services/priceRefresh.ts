// services/priceRefresh.ts
//
// [PRICE-REFRESH-LIVE] — rafraîchit les `currentPrice` des actifs depuis les quotes live.
//
// Contexte (incident 2026-07-14) : le prix d'un titre est FIGÉ au moment de l'ajout (saisie ou
// quote Finnhub du jour J) et n'est JAMAIS rafraîchi ensuite → le patrimoine affiché dérive de la
// réalité (mesuré : ~230 k$ calculés vs ~250 k$ chez le courtier). Ce service met à jour les prix
// via `getQuote` (source unique marketData : Finnhub/CoinGecko, cache 5 min), avec les règles :
//
//  - PRIX NATIF uniquement : le quote est dans la devise du titre (convention `Asset.currentPrice`,
//    cf CLAUDE.md ASSET-FX-DISPLAY). On ne convertit JAMAIS ici — l'affichage passe par assetValueCad.
//  - DEVISE PROTÉGÉE : si la devise du quote diffère de celle stockée sur l'actif → SKIP (ne jamais
//    corrompre un montant en écrasant un prix EUR par un prix USD) + raison exposée.
//  - CHANGEMENT RÉEL uniquement (panel 2026-07-14) : un quote au MÊME prix que le stocké ne produit
//    AUCUN patch (compté `unchanged`) — sinon `priceUpdatedAt` seul changerait le hash du payload →
//    push Drive à chaque boot + CONFLITS FANTÔMES entre deux appareils qui rafraîchissent les mêmes
//    cours (le mécanisme anti-clobber verrait une « divergence » d'horodatages, pas de données).
//  - HONNÊTE sur la couverture : un symbole non quotable (forfait Finnhub, titre manuel/GIC) est
//    SKIPPÉ avec raison `no-quote` — l'appelant peut le dire à l'utilisateur (jamais de silence,
//    et jamais de prix inventé — no-fake-data).
//  - PROVIDER-AWARE (leçon PERF-BOOT-RATELIMIT) : appels SÉQUENTIELS espacés de `delayMs` (défaut
//    2 500 ms ≈ 24 req/min), sous la limite du provider le PLUS STRICT (CoinGecko free ~30/min).
//    Jamais de Promise.all. Les symboles SANS provider (`hasProvider`) sont skippés d'emblée SANS
//    consommer de pacing (sinon un boot sans clé Finnhub dormait (N−1)×2,5 s pour rien).
//  - DÉFENSE PAR ITÉRATION : une exception inattendue de `getQuote` (contrat « ne rejette jamais »
//    non garanti structurellement) est convertie en skip `error` + logError, sans jeter le progrès
//    des autres symboles.

import type { Asset } from '../types';
import type { Quote } from './marketData';
import { logError } from './errorLogger';

export interface PricePatch {
    currentPrice: number;
    priceUpdatedAt: number;
    /** Devise de l'actif AU MOMENT du quote (undefined = actif legacy sans devise). Revalidée à
     *  l'application : si la devise de l'actif FRAIS diffère (éditée pendant la fenêtre), le patch
     *  est ABANDONNÉ (un prix natif de l'ancienne devise sur la nouvelle = montant mal dénominé). */
    forCurrency: string | undefined;
    /** Self-heal legacy : devise du quote à ÉCRIRE quand l'actif n'en avait pas (le refresh connaît
     *  la vraie devise du titre — sans ça, un actif legacy USD/EUR resterait compté 1:1 CAD à vie).
     *  [Finding sécurité #494] TYPÉE sur l'union supportée (jamais un cast) : depuis le repli Yahoo,
     *  `quote.currency` peut porter n'importe quelle devise mondiale (GBP — voire « GBp » pence
     *  aplati par toUpperCase, facteur ~100×) → une devise hors USD/CAD/EUR ne doit JAMAIS entrer
     *  dans `Asset.currency` (toCurrencyFactor la replierait 1:1, valorisation fausse). */
    healCurrency?: Asset['currency'];
}

/** Devise du quote → union supportée par l'app, ou undefined (rejet). Exporté pour test. */
export function asSupportedCurrency(c: string | undefined): Asset['currency'] | undefined {
    return c === 'USD' || c === 'CAD' || c === 'EUR' ? c : undefined;
}

export type PriceSkipReason = 'no-quote' | 'invalid-price' | 'currency-mismatch' | 'error';

export interface PriceRefreshResult {
    /** Patches par symbole — à fusionner dans les assets COURANTS du store (prix CHANGÉS seulement). */
    patches: Map<string, PricePatch>;
    /** Symboles dont le prix a réellement changé. */
    refreshed: string[];
    /** Symboles quotés dont le prix est IDENTIQUE au stocké (aucun patch → aucun push parasite). */
    unchanged: string[];
    /** Symboles non rafraîchis, avec la raison (à surfacer honnêtement). */
    skipped: Array<{ symbol: string; reason: PriceSkipReason }>;
}

export interface PriceRefreshDeps {
    getQuote: (symbol: string) => Promise<Quote | null>;
    /** Un provider peut-il quoter ce symbole ? (cf marketData.hasQuoteProvider). Absent = oui pour tous. */
    hasProvider?: (symbol: string) => boolean;
    /** Injectable pour les tests (défaut : vrai setTimeout). */
    sleep?: (ms: number) => Promise<void>;
    /** Espacement entre appels (défaut 2 500 ms ≈ 24/min, sous CoinGecko free ~30/min). */
    delayMs?: number;
    /** Injectable pour les tests (déterminisme). */
    now?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ── Garde de FRÉQUENCE inter-passes (panel 2026-07-15) ──────────────────────────────────────────
// Le pacing 2 500 ms ne borne que le débit INTRA-passe : boot + bouton concurrents (ou reloads
// rapprochés) pouvaient s'entrelacer → ~48 req/min > CoinGecko free (~30/min). Deux gardes :
//  - MUTEX module : une seule passe en vol par onglet (boot et bouton partagent la file) ;
//  - INTERVALLE MIN : une passe non-forcée (boot) est sautée si une passe a fini il y a < 5 min
//    (le bouton force — geste explicite — mais le cache quote 5 min absorbe alors le réseau).
// Résidu accepté : deux ONGLETS simultanés (verrou par onglet) — un 429 éventuel devient un skip
// honnête `no-quote`, jamais une corruption.
const MIN_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let _refreshQueue: Promise<unknown> = Promise.resolve();
let _lastCompletedAt = 0;

const emptyResult = (): PriceRefreshResult => ({ patches: new Map(), refreshed: [], unchanged: [], skipped: [] });

/** Test-only : réinitialise le mutex/l'horodatage inter-passes (isolation entre tests). */
export function __resetPriceRefreshThrottle(): void {
    _refreshQueue = Promise.resolve();
    _lastCompletedAt = 0;
}

/**
 * Rafraîchit les prix des actifs valorisés (symbole présent, quantité > 0). Ne mute RIEN :
 * retourne des patches que l'appelant applique par fusion sur l'état courant (applyPricePatches).
 * Sérialisé (mutex module) ; `force: false` (boot) est SAUTÉ si une passe a fini il y a < 5 min.
 */
export function refreshAssetPrices(
    assets: readonly Asset[],
    deps: PriceRefreshDeps,
    opts?: { force?: boolean },
): Promise<PriceRefreshResult> {
    const now = deps.now ?? (() => Date.now());
    const run = _refreshQueue.then(async () => {
        if (!opts?.force && _lastCompletedAt > 0 && now() - _lastCompletedAt < MIN_REFRESH_INTERVAL_MS) {
            return emptyResult(); // passe récente → rien à refaire (anti-spam reload/boot)
        }
        const result = await runRefresh(assets, deps);
        _lastCompletedAt = now();
        return result;
    });
    _refreshQueue = run.catch(() => undefined);
    return run;
}

async function runRefresh(
    assets: readonly Asset[],
    deps: PriceRefreshDeps,
): Promise<PriceRefreshResult> {
    const sleep = deps.sleep ?? defaultSleep;
    const delayMs = deps.delayMs ?? 2500;
    const now = deps.now ?? (() => Date.now());

    const result: PriceRefreshResult = emptyResult();
    const targets = (assets ?? []).filter((a) => a && a.symbol && (a.quantity || 0) > 0);

    let quoteCalls = 0;
    for (const a of targets) {
        // [HIST-MULTI-PROVIDER] Le symbole de COTATION peut différer du symbole saisi : une
        // résolution de suffixe (`historySymbol`, auto ou saisie) vaut pour les quotes AUSSI —
        // sinon un ticker nu résolu « CW8 → CW8.PA » garderait un prix figé à vie.
        const quoteSymbol = a.historySymbol || a.symbol;
        // Pas de provider pour ce symbole (ex. pas de clé Finnhub, titre manuel) → skip IMMÉDIAT,
        // sans consommer de pacing (getQuote rendrait un null instantané de toute façon).
        if (deps.hasProvider && !deps.hasProvider(quoteSymbol)) {
            result.skipped.push({ symbol: a.symbol, reason: 'no-quote' });
            continue;
        }

        // Espacement AVANT chaque APPEL RÉEL sauf le premier (le cache quote 5 min absorbe les répétitions).
        if (quoteCalls > 0) await sleep(delayMs);
        quoteCalls++;

        let quote: Quote | null;
        try {
            quote = await deps.getQuote(quoteSymbol);
        } catch (e) {
            // Contrat « getQuote ne rejette jamais » non garanti structurellement : une exception ne
            // doit PAS jeter le progrès des symboles déjà traités ni masquer lesquels ont réussi.
            logError({ source: 'network', severity: 'warning', message: `Quote inattendu en échec pour ${a.symbol} (refresh poursuivi)`, error: e });
            result.skipped.push({ symbol: a.symbol, reason: 'error' });
            continue;
        }
        if (!quote) {
            result.skipped.push({ symbol: a.symbol, reason: 'no-quote' });
            continue;
        }
        if (!Number.isFinite(quote.price) || quote.price <= 0) {
            result.skipped.push({ symbol: a.symbol, reason: 'invalid-price' });
            continue;
        }
        // Garde de DEVISE : n'écrase jamais un prix stocké avec un quote d'une autre devise
        // (corromprait la convention prix-natif + toute la conversion FX en aval). On ne compare
        // que si LES DEUX devises sont connues — un actif legacy sans devise est laissé passer
        // (le quote fait alors foi, sa devise étant celle du titre).
        if (a.currency && quote.currency && a.currency !== quote.currency) {
            result.skipped.push({ symbol: a.symbol, reason: 'currency-mismatch' });
            continue;
        }
        // [Finding sécurité #494] Actif legacy SANS devise + quote dans une devise NON SUPPORTÉE
        // (repli Yahoo mondial : GBP/JPY/…) → skip COMPLET : on ne peut ni écrire la devise (hors
        // union Asset.currency) ni écrire le prix (il serait dénommé dans une devise que l'app ne
        // convertit pas — repli 1:1 faux, et « GBp » pence aplati serait ~100× le prix).
        if (!a.currency && quote.currency && !asSupportedCurrency(quote.currency)) {
            result.skipped.push({ symbol: a.symbol, reason: 'currency-mismatch' });
            logError({
                source: 'network', severity: 'warning',
                message: `Cours de ${a.symbol} ignoré : devise ${quote.currency} non supportée (USD/CAD/EUR seulement) — précise la devise de l'actif ou un symbole coté dans une devise supportée.`,
            });
            continue;
        }
        // Prix IDENTIQUE au stocké → aucun patch (pas d'horodatage « frais » trompeur, pas de churn
        // de push Drive, pas de conflit fantôme multi-appareils). Le quote CONFIRME, il ne change
        // rien. Exception : un actif LEGACY sans devise avec un prix identique reçoit quand même le
        // self-heal de devise (une seule fois — ensuite il a une devise).
        if (quote.price === a.currentPrice && a.currency) {
            result.unchanged.push(a.symbol);
            continue;
        }

        const patch: PricePatch = {
            currentPrice: quote.price,
            priceUpdatedAt: now(),
            forCurrency: a.currency || undefined,
        };
        if (!a.currency) {
            const healed = asSupportedCurrency(quote.currency);
            if (healed) patch.healCurrency = healed;
        }
        result.patches.set(a.symbol, patch);
        result.refreshed.push(a.symbol);
    }
    return result;
}

/**
 * Applique des patches de prix sur l'état COURANT des actifs (fusion par symbole), et recalcule
 * `performance` à partir du buyPrice AU MOMENT de l'application (pas celui capturé au lancement —
 * une édition du prix d'achat pendant le refresh est ainsi respectée).
 *
 * À appeler avec les assets AU MOMENT de l'application (pas ceux capturés au lancement) : un pull
 * Drive/une édition survenus pendant le refresh gardent tous leurs AUTRES champs, et un actif
 * disparu entre-temps est ignoré. ⚠️ Pour le champ `currentPrice` lui-même, LE QUOTE FAIT FOI :
 * une édition manuelle du prix d'un titre COTÉ pendant la fenêtre du refresh est remplacée par le
 * cours live (comportement voulu — le cours réel d'un titre coté prime une saisie ; les titres NON
 * cotés/manuels ne reçoivent jamais de patch, ils sont skippés `no-quote` en amont).
 */
export function applyPricePatches(assets: readonly Asset[], patches: Map<string, PricePatch>): Asset[] {
    if (patches.size === 0) return [...assets];
    return assets.map((a) => {
        const p = patches.get(a.symbol);
        if (!p) return a;
        // Revalidation de DEVISE sur l'actif FRAIS : si elle a changé pendant la fenêtre du refresh
        // (édition/pull Drive), le prix natif de l'ANCIENNE devise ne doit pas être écrit sur la
        // NOUVELLE (montant mal dénominé) → patch abandonné, le prochain refresh repartira propre.
        if ((a.currency || undefined) !== p.forCurrency) return a;
        const next: Asset = { ...a, currentPrice: p.currentPrice, priceUpdatedAt: p.priceUpdatedAt };
        if (p.healCurrency && !a.currency) next.currency = p.healCurrency; // typé sur l'union — plus de cast
        if ((a.buyPrice || 0) > 0) {
            next.performance = ((p.currentPrice - (a.buyPrice as number)) / (a.buyPrice as number)) * 100;
        }
        return next;
    });
}
