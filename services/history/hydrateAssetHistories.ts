// services/history/hydrateAssetHistories.ts
//
// [PORTFOLIO-HISTORY] Hydrate `Asset.priceHistory` (clôtures natives datées) depuis la chaîne
// marketData.getHistory (Finnhub → repli Yahoo proxy → CoinGecko crypto), DEPUIS LE PREMIER ACHAT
// de chaque titre (« depuis que je les ai », demande Marc 2026-07-22). Remplace l'ancien chemin
// stub (fetchAssetHistory → CSV mort → priceHistory jamais rempli → graphes vides).
//
// Sécurité/rate-limit (pattern priceRefresh, leçon PERF-BOOT-RATELIMIT) :
//  - boucle SÉQUENTIELLE, sleep 2 500 ms entre APPELS RÉSEAU potentiels (≈24/min, sous la limite du
//    provider le PLUS STRICT — CoinGecko free ~30/min) ; pas de sleep pour les symboles sautés ;
//  - sélection AVANT la boucle : seuls les actifs SANS historique ou PÉRIMÉ (lastHistorySync > 24h)
//    sont traités — un boot ordinaire ne refait pas N requêtes (le cache IDB 24h absorbe déjà) ;
//  - anti-course : le patch est appliqué par SYMBOLE sur l'état FRAIS du store au moment de
//    l'écriture (un pull Drive pendant l'hydratation n'est pas écrasé) — même patron qu'applyPricePatches ;
//  - JAMAIS en mode test (les fixtures persona portent leur propre priceHistory).
//
// Deps injectables → testable sans réseau ni vrais timers.

import type { Asset } from '../../types';
import type { HistoryPoint } from '../marketData';
import { coinGeckoQuoteCurrencyFor, coinGeckoIdFor } from '../marketData/providers/coingecko';
import { getEffectivePurchases } from '../../utils/assetPurchases';
import { logError } from '../errorLogger';

export interface HydrateHistoryDeps {
    /** Contrat façade : `[]` = vide VALIDE, `null` = ERREUR (chaîne entière en échec). */
    getHistory: (symbol: string, from: Date, to: Date) => Promise<HistoryPoint[] | null>;
    hasProvider?: (symbol: string) => boolean;
    sleep?: (ms: number) => Promise<void>;
    delayMs?: number;
    now?: () => number;
}

export interface HydrateHistoryResult {
    /** Patches par symbole : historique natif FUSIONNÉ (ancien ∪ nouveau) + horodatage de sync
     *  (+ `historySymbol` quand une VARIANTE de suffixe a résolu le titre — persisté sur l'actif
     *  pour que les syncs suivantes frappent directement le bon symbole). */
    patches: Map<string, { priceHistory: Array<{ date: string; price: number }>; lastHistorySync: number; historySymbol?: string }>;
    /** [HIST-MULTI-PROVIDER] `detail` = phrase FR prête à afficher (diagnostic par titre) ;
     *  `detailPrivacySafe` = même diagnostic SANS AUCUN montant (rendu en mode discret — finding
     *  sécurité #494 : `detail` peut interpoler `currentPrice`, un montant $ ne sort pas du DOM
     *  masqué) ; `triedSymbols` = tous les symboles réellement tentés (principal + variantes). */
    skipped: Array<{
        symbol: string;
        reason: 'fresh' | 'no-provider' | 'no-first-date' | 'empty' | 'error' | 'currency-mismatch';
        detail?: string;
        detailPrivacySafe?: string;
        triedSymbols?: string[];
    }>;
}

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // au-delà : re-sync (aligné sur le TTL cache 'history')
const DEFAULT_DELAY_MS = 2_500;

/**
 * L'actif a-t-il besoin d'une (re)synchronisation d'historique ? (exporté pour test)
 * Éligibilité ALIGNÉE sur buildMarketData (qty≠0 OU achats connus — un actif VENDU garde sa
 * courbe passée) : avant, un actif qty=0 à purchases non vides était attendu par le graphe mais
 * JAMAIS hydraté → exclu à vie en silence (panel 2026-07-22).
 */
export function needsHistorySync(a: Asset, now: number): boolean {
    if (!a.symbol) return false;
    if ((a.quantity || 0) === 0 && getEffectivePurchases(a).length === 0) return false;
    if (!a.priceHistory || a.priceHistory.length === 0) return true;
    return !a.lastHistorySync || now - a.lastHistorySync > STALE_AFTER_MS;
}

/**
 * Fusionne l'historique EXISTANT avec les nouveaux points (le nouveau gagne à date égale, les
 * anciens points HORS de la nouvelle fenêtre survivent). Sans fusion, un provider à fenêtre
 * bornée (CoinGecko free ~365 j) REMPLAÇAIT tout : un crypto détenu > 1 an perdait chaque jour
 * son point le plus ancien (panel 2026-07-22). Exportée pour test.
 */
export function mergePriceHistories(
    existing: Array<{ date: string; price: number }> | undefined,
    fresh: Array<{ date: string; price: number }>,
): Array<{ date: string; price: number }> {
    const byDate = new Map<string, number>();
    for (const p of existing || []) {
        if (p.date && Number.isFinite(p.price) && p.price > 0) byDate.set(p.date, p.price);
    }
    for (const p of fresh) byDate.set(p.date, p.price);
    return [...byDate.entries()]
        .map(([date, price]) => ({ date, price }))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** [HIST-STORE-SIZE] Au-delà de cet âge, le stocké passe à 1 point/semaine. */
export const DOWNSAMPLE_AFTER_DAYS = 365;
const DAY_MS = 86_400_000;

/**
 * [HIST-STORE-SIZE] (mesuré 2026-07-31 : ~116 Ko persistés, +6 Ko/mois, ~384 Ko à 5 ans — dans
 * CHAQUE push Drive + localStorage) Downsample du STOCKÉ : les points plus vieux que 365 j sont
 * réduits à 1 point/semaine (le DERNIER de chaque semaine — ÷5 le stock ancien) ; la dernière
 * année reste quotidienne (courbes 1M/3M/6M/YTD/1A intactes). Appliqué au moment d'écrire le
 * patch d'hydratation (après mergePriceHistories) : les points crypto > 365 j (fenêtre CoinGecko,
 * non re-téléchargeables) sont CONSERVÉS en hebdomadaire, jamais supprimés — c'est la raison
 * d'être de mergePriceHistories, le downsample ne la trahit pas. Pur, `nowMs` injectable.
 */
export function downsamplePriceHistory(
    history: Array<{ date: string; price: number }>,
    nowMs: number,
): Array<{ date: string; price: number }> {
    const cutoffMs = nowMs - DOWNSAMPLE_AFTER_DAYS * DAY_MS;
    const recent: Array<{ date: string; price: number }> = [];
    // Semaine → DERNIER point (l'entrée est triée ascendante : les suivants écrasent).
    const oldByWeek = new Map<number, { date: string; price: number }>();
    for (const p of history) {
        const t = Date.parse(`${p.date}T00:00:00Z`);
        if (!Number.isFinite(t)) continue; // date illisible : ne pas la garder ni la propager
        if (t >= cutoffMs) recent.push(p);
        else oldByWeek.set(Math.floor(t / (7 * DAY_MS)), p);
    }
    return [...oldByWeek.values(), ...recent];
}

/**
 * [HIST-COVERAGE-TOTAL] Variantes de symbole à tenter quand la chaîne d'historique ne rend RIEN
 * pour le symbole saisi (bug Marc 2026-07-23 : « Amundi EM Asia marche pas », ticker Euronext
 * saisi sans suffixe → Yahoo 404 → « vide légitime » caché 24 h). Seulement pour un ticker NU
 * (sans suffixe `.XX`, sans préfixe place `X:`, sans `-` crypto) et NON-crypto ; les suffixes
 * sont déduits de la DEVISE déclarée de l'actif (EUR → Euronext/XETRA, CAD → TSX/TSXV).
 * Exporté pour test.
 */
export function historySymbolVariants(symbol: string, currency: string | undefined): string[] {
    if (!symbol || /[.:\-]/.test(symbol)) return [];
    if (coinGeckoIdFor(symbol)) return []; // crypto : CoinGecko fait foi, jamais de suffixe boursier
    const SUFFIXES: Record<string, string[]> = {
        EUR: ['.PA', '.DE', '.AS', '.MI'],
        CAD: ['.TO', '.V'],
    };
    return (SUFFIXES[(currency || '').toUpperCase()] ?? []).map((s) => `${symbol}${s}`);
}

/**
 * Le dernier close d'une VARIANTE est-il PLAUSIBLE vs le prix courant connu de l'actif ?
 * Garde anti-collision de ticker (« ABC » nu peut désigner un AUTRE titre sur « ABC.PA ») : sans
 * référence de prix courant on REFUSE (afficher la courbe d'un autre titre avec assurance serait
 * la pire violation no-fake-data) ; avec référence, on exige un facteur ≤ 2. Exporté pour test.
 */
export function variantClosePlausible(lastClose: number, currentPrice: number | undefined): boolean {
    const ref = Number(currentPrice);
    if (!Number.isFinite(ref) || ref <= 0) return false;
    return lastClose >= ref * 0.5 && lastClose <= ref * 2;
}

/** Date du premier achat connu (purchases effectifs, sinon dateBought), ou null. */
function firstPurchaseDate(a: Asset): string | null {
    const purchases = getEffectivePurchases(a);
    let first: string | null = null;
    for (const p of purchases) {
        if (p.date && (!first || p.date < first)) first = p.date;
    }
    if (!first && a.dateBought) first = a.dateBought;
    return first || null;
}

// [Finding code-reviewer #494 — ÉLEVÉ, mesuré] MUTEX module (même patron que priceRefresh
// `_refreshQueue`) : le boot (App.tsx) et le bouton « Actualiser » (Investments) pouvaient tourner
// EN CONCURRENCE — sonde : 2 appels réseau réels pour le même symbole, débit doublé face au
// provider le plus strict (CoinGecko ~30/min) → 429 en « panne » trompeuse dans le diagnostic.
// Les passes sont SÉRIALISÉES ; la fraîcheur (needsHistorySync + cache 24 h) évite le sur-coût.
let _hydrateQueue: Promise<unknown> = Promise.resolve();

export function hydrateAssetHistories(
    assets: Asset[],
    deps: HydrateHistoryDeps,
    opts?: {
        /** [HIST-MULTI-PROVIDER] Geste EXPLICITE « Resynchroniser » : ignore la fraîcheur 24 h
         *  (l'appelant purge aussi le cache 'history' du jour) — jamais utilisé au boot. */
        force?: boolean;
    },
): Promise<HydrateHistoryResult> {
    const run = _hydrateQueue.then(() => runHydrate(assets, deps, opts));
    _hydrateQueue = run.catch(() => undefined); // une passe en échec ne bloque pas la file
    return run;
}

async function runHydrate(
    assets: Asset[],
    deps: HydrateHistoryDeps,
    opts?: { force?: boolean },
): Promise<HydrateHistoryResult> {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const delayMs = deps.delayMs ?? DEFAULT_DELAY_MS;
    const now = deps.now ?? Date.now;

    const patches: HydrateHistoryResult['patches'] = new Map();
    const skipped: HydrateHistoryResult['skipped'] = [];
    let networkCalls = 0;

    for (const a of assets || []) {
        if (!opts?.force && !needsHistorySync(a, now())) {
            if (a.symbol) skipped.push({ symbol: a.symbol, reason: 'fresh' });
            continue;
        }
        // En force, l'ÉLIGIBILITÉ de base reste requise (symbole présent, détenu ou déjà acheté).
        if (opts?.force && (!a.symbol || ((a.quantity || 0) === 0 && getEffectivePurchases(a).length === 0))) {
            continue;
        }
        if (deps.hasProvider && !deps.hasProvider(a.symbol)) {
            skipped.push({ symbol: a.symbol, reason: 'no-provider' });
            continue;
        }
        // Garde de DEVISE crypto (même classe que priceRefresh « currency-mismatch ») : CoinGecko
        // déduit la devise des clôtures du SUFFIXE du symbole (« BTC » nu → USD, « BTC-CAD » → CAD).
        // Si elle diverge de la devise déclarée de l'actif, les closes seraient valorisés au MAUVAIS
        // facteur FX (mesuré −27,5 % sur BTC+CAD, panel 2026-07-22) → on SAUTE (courbe absente
        // honnête) plutôt que de stocker des valeurs fausses.
        const cgCurrency = coinGeckoQuoteCurrencyFor(a.symbol);
        if (cgCurrency && cgCurrency !== (a.currency || 'CAD').toUpperCase()) {
            skipped.push({ symbol: a.symbol, reason: 'currency-mismatch' });
            logError({
                source: 'network', severity: 'warning',
                message: `Historique ${a.symbol} ignoré : le provider renvoie des prix en ${cgCurrency} mais l'actif est déclaré en ${a.currency || 'CAD'}. Renomme le symbole (ex. ${a.symbol}-${(a.currency || 'CAD').toUpperCase()}) ou corrige la devise de l'actif.`,
            });
            continue;
        }
        const first = firstPurchaseDate(a);
        if (!first) {
            // Sans la moindre date d'achat, « depuis que je les ai » est indéfini → 1 an d'historique
            // (fenêtre honnête par défaut, pas d'invention de date).
        }
        const from = first
            ? new Date(`${first}T00:00:00Z`)
            : new Date(now() - 365 * 86_400_000);
        try {
            // Pacing AVANT chaque appel réseau potentiel sauf le premier (le cache 24h peut répondre
            // instantanément, mais on ne peut pas le savoir d'ici → prudence : provider le plus strict).
            if (networkCalls > 0) await sleep(delayMs);
            networkCalls++;
            // Filtre AVANT le check vide : une réponse non-vide mais 100 % invalide est un VIDE
            // (skip), jamais un patch `[]` qui écraserait un historique existant valide.
            const toFresh = (hist: HistoryPoint[]): Array<{ date: string; price: number }> => hist
                .filter((h) => h.date && Number.isFinite(h.close) && h.close > 0)
                .map((h) => ({ date: h.date, price: h.close }));
            // [HIST-COVERAGE-TOTAL] Une variante déjà RÉSOLUE (`historySymbol`) frappe directement
            // le bon symbole ; sinon symbole saisi, puis variantes de suffixe.
            const primarySymbol = a.historySymbol || a.symbol;
            const hist = await deps.getHistory(primarySymbol, from, new Date(now()));
            let fresh = hist === null ? null : toFresh(hist);
            let resolvedSymbol: string | undefined;
            const variantNetFailures: string[] = [];
            const triedSymbols: string[] = [primarySymbol];
            const rejectedVariants: Array<{ alt: string; lastClose: number }> = [];
            // ⚠️ Variantes SEULEMENT sur un vide CONFIRMÉ (`[]`), JAMAIS sur `null` (panne
            // réseau/provider) — finding code-reviewer #493, prouvé par sonde : une panne
            // transitoire sur le VRAI symbole partait à la pêche et pouvait PERSISTER
            // (`historySymbol`) un AUTRE titre dont le prix coïncidait dans la bande ×2.
            // Une panne → skip 'error' + retry du MÊME symbole au prochain cycle, point.
            if (fresh !== null && fresh.length === 0) {
                // Candidats de secours : le symbole SAISI d'abord si le primaire était une variante
                // résolue devenue muette (self-heal d'un `historySymbol` mort — finding
                // silent-failure #493 : sans ça, un symbole résolu délisté gelait l'actif à VIE),
                // puis les variantes de suffixe restantes.
                const fallbacks = [
                    ...(a.historySymbol && a.historySymbol !== a.symbol ? [a.symbol] : []),
                    ...historySymbolVariants(a.symbol, a.currency).filter((v) => v !== primarySymbol),
                ];
                for (const alt of fallbacks) {
                    await sleep(delayMs);
                    networkCalls++;
                    triedSymbols.push(alt);
                    const altHist = await deps.getHistory(alt, from, new Date(now()));
                    if (altHist === null) {
                        // Échec RÉSEAU d'une variante ≠ « ce symbole n'existe pas » — collecté pour
                        // que le verdict final ne mente pas (finding silent-failure #493 : avalé
                        // en « empty » silencieux avant).
                        variantNetFailures.push(alt);
                        continue;
                    }
                    const altFresh = toFresh(altHist);
                    if (altFresh.length === 0) continue;
                    // Garde de plausibilité pour un suffixe DEVINÉ seulement — le symbole SAISI
                    // par l'utilisateur n'a pas à la passer (c'est sa donnée, pas une devinette).
                    if (alt !== a.symbol) {
                        const lastClose = altFresh.reduce((best, p) => (p.date > best.date ? p : best), altFresh[0]).price;
                        if (!variantClosePlausible(lastClose, a.currentPrice)) {
                            // Collision de ticker probable (ou pas de prix de référence) → REFUS
                            // plutôt que d'afficher la courbe d'un autre titre (no-fake-data).
                            rejectedVariants.push({ alt, lastClose });
                            logError({
                                source: 'network', severity: 'warning',
                                message: `Historique ${a.symbol} : la variante ${alt} répond mais son cours est incompatible avec le prix courant de l'actif — ignorée (risque de mauvais titre). Précise le symbole avec son suffixe (ex. ${a.symbol}.PA).`,
                            });
                            continue;
                        }
                    }
                    fresh = altFresh;
                    resolvedSymbol = alt;
                    break;
                }
            }
            if (fresh === null) {
                // Contrat façade : null = ÉCHEC de toute la chaîne (≠ vide légitime) → tracé,
                // pas de patch (l'historique existant SURVIT), retry au prochain boot.
                skipped.push({
                    symbol: a.symbol, reason: 'error', triedSymbols,
                    detail: `Panne du fournisseur de cours sur ${primarySymbol} — nouvel essai automatique au prochain chargement.`,
                    detailPrivacySafe: `Panne du fournisseur de cours sur ${primarySymbol} — nouvel essai automatique au prochain chargement.`,
                });
                logError({
                    source: 'network', severity: 'warning',
                    message: `Historique ${a.symbol} : tous les providers ont échoué (graphe partiel, nouvel essai au prochain démarrage).`,
                });
                continue;
            }
            if (fresh.length === 0) {
                if (variantNetFailures.length > 0) {
                    // Indéterminé (le principal a répondu vide mais des variantes ont ÉCHOUÉ en
                    // réseau) → 'error' (retry au prochain cycle), pas un « vide légitime » menteur.
                    skipped.push({
                        symbol: a.symbol, reason: 'error', triedSymbols,
                        detail: `Aucun historique sur ${primarySymbol} et panne réseau sur ${variantNetFailures.join(', ')} — nouvel essai automatique au prochain chargement.`,
                        detailPrivacySafe: `Aucun historique sur ${primarySymbol} et panne réseau sur ${variantNetFailures.join(', ')} — nouvel essai automatique au prochain chargement.`,
                    });
                    logError({
                        source: 'network', severity: 'warning',
                        message: `Historique ${a.symbol} : aucun historique sur le symbole principal et échec réseau des variantes ${variantNetFailures.join(', ')} — indéterminé, nouvel essai au prochain démarrage.`,
                    });
                } else {
                    // [HIST-MULTI-PROVIDER] Diagnostic ACTIONNABLE par titre : dire ce qui a été
                    // essayé et quoi faire — un « sans courbe » muet laissait Marc sans recours.
                    const rejected = rejectedVariants[0];
                    skipped.push({
                        symbol: a.symbol, reason: 'empty', triedSymbols,
                        detail: rejected
                            ? `${rejected.alt} répond (cours ${rejected.lastClose}) mais ce cours est incompatible avec le prix actuel de l'actif (${a.currentPrice || 'inconnu'}) — probable confusion de ticker ou prix de l'actif périmé. Corrige le prix de l'actif ou fixe le symbole de cotation ci-dessous.`
                            : `Introuvable chez les fournisseurs (essayé : ${triedSymbols.join(', ')}). Fixe le symbole de cotation exact ci-dessous (ex. ticker Yahoo « ${a.symbol}.PA »).`,
                        // Version SANS montant (mode discret) — la variante à cours interpolé est la
                        // seule branche qui porte des $ ; la branche « introuvable » n'en a pas.
                        detailPrivacySafe: rejected
                            ? `${rejected.alt} répond mais son cours est incompatible avec le prix actuel de l'actif (montants masqués) — probable confusion de ticker ou prix de l'actif périmé. Corrige le prix de l'actif ou fixe le symbole de cotation ci-dessous.`
                            : `Introuvable chez les fournisseurs (essayé : ${triedSymbols.join(', ')}). Fixe le symbole de cotation exact ci-dessous (ex. ticker Yahoo « ${a.symbol}.PA »).`,
                    });
                }
                continue;
            }
            patches.set(a.symbol, {
                // [HIST-STORE-SIZE] fusion (aucune perte de fenêtre provider) PUIS downsample du
                // stocké (> 365 j → hebdomadaire) — l'ordre compte : on ne downsample jamais AVANT
                // d'avoir réinjecté les points anciens que le provider ne re-fournit pas.
                priceHistory: downsamplePriceHistory(mergePriceHistories(a.priceHistory, fresh), now()),
                lastHistorySync: now(),
                ...(resolvedSymbol ? { historySymbol: resolvedSymbol } : {}),
            });
        } catch (e) {
            skipped.push({ symbol: a.symbol, reason: 'error' });
            logError({
                source: 'network', severity: 'warning',
                message: `Hydratation de l'historique de ${a.symbol} échouée (graphe partiel).`,
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
    }

    return { patches, skipped };
}

/** Applique les patches par SYMBOLE sur une liste FRAÎCHE d'actifs (anti-course, pur). */
export function applyHistoryPatches(
    freshAssets: Asset[],
    patches: HydrateHistoryResult['patches'],
): Asset[] {
    if (patches.size === 0) return freshAssets;
    return freshAssets.map((a) =>
        patches.has(a.symbol)
            ? { ...a, ...patches.get(a.symbol)! }
            : a,
    );
}
