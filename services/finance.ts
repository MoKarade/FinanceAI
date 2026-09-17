// --- TAUX DE CHANGE BANQUE DU CANADA (seul fetch externe restant) ---
// P1 — Suppression totale du Google Sheet legacy (sur demande utilisateur).
// L'app ne fait plus aucun fetch vers docs.google.com pour les données
// boursières. La source de vérité unique est désormais Finnhub via
// services/marketData/.

import { logError } from './errorLogger';
import { estFxCause } from './fx/provenance';
import type { FxSource, FxCause } from './fx/provenance';
import { lireSerieBdc } from './fx/observationsBdc';
import type { LectureSerie } from './fx/observationsBdc';

export interface MarketDataPoint {
    date: string;
    [key: string]: string | number;
}

// Timeout pour les fetches (utilisé par fetchFxRates Banque du Canada uniquement)
const FETCH_TIMEOUT_MS = 12000; // 12 secondes max

// Taux de change mis en cache localement
let cachedFxRates: ResultatTauxFx | null = null;

// --- Wrapper localStorage tolerant aux environnements sans Web Storage ---
// Le module est importe par App (browser) et potentiellement par le MCP server (Node).
// En Node, ServiceWorker ou mode prive Safari, localStorage peut etre absent
// ou jeter SecurityError ; on no-op silencieusement dans ces cas.
const hasLocalStorage = (): boolean => {
    try {
        return typeof localStorage !== 'undefined' && localStorage !== null;
    } catch {
        return false;
    }
};

const safeGetItem = (key: string): string | null => {
    if (!hasLocalStorage()) return null;
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeSetItem = (key: string, value: string): void => {
    if (!hasLocalStorage()) return;
    try {
        localStorage.setItem(key, value);
    } catch {
        /* QuotaExceededError, SecurityError, etc. */
    }
};

/**
 * Fetch avec timeout integre et support d'abort
 */
const fetchWithTimeout = async (url: string, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        clearTimeout(timeoutId);
        return response;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
};


/**
 * Recupere les taux de change depuis la Banque du Canada (API officielle, gratuite).
 * Cache 24h pour eviter trop de requetes.
 * Fallback sur les valeurs stockees en cas d'echec.
 */
export interface ResultatTauxFx {
    USD: number;
    EUR: number;
    CAD: number;
    /** Epoch ms du dernier SUCCÈS (0 = jamais). Ne date PAS les échecs — d'où `attemptAt` ci-dessous. */
    lastFetched: number;
    /** Conservé pour les états et consommateurs antérieurs ; `source` est la lecture qui décide. */
    estimated: boolean;
    /** [FX-TAUX-JAMAIS-ARRIVES] D'où vient CE taux (`services/fx/provenance.ts`). */
    source: FxSource;
    /** Ce que cette tentative a donné. */
    cause: FxCause;
    /** Epoch ms de CETTE tentative, réussie ou non. */
    attemptAt: number;
    /** [FX-OBSERVATION-COHORTE] Date (`YYYY-MM-DD`) de l'observation d'où vient le taux — la plus
     *  ANCIENNE des deux séries réellement lues. ABSENTE quand rien n'a pu être lu : sans elle, une
     *  observation de 2019 est indiscernable de celle du jour, et c'est exactement ce qui a permis
     *  de servir le littéral du dépôt pendant des mois. */
    observationDate?: string;
}

/**
 * Recupere les taux de change depuis la Banque du Canada (API officielle, gratuite).
 * Cache 24h pour eviter trop de requetes.
 * Fallback sur les valeurs stockees en cas d'echec.
 *
 * ⚠️ [FX-TAUX-JAMAIS-ARRIVES] `force: true` COURT-CIRCUITE les deux caches. Sans ça, le bouton
 * « Réessayer maintenant » serait un no-op déguisé pendant 24 h : il rendrait le cache et Marc
 * verrait le même « taux estimés » sans le moindre signe que rien n'a été tenté. Un recours qui
 * ne peut pas s'exercer n'est pas un recours.
 */
export const fetchFxRates = async (options?: { force?: boolean }): Promise<ResultatTauxFx> => {
    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 heures
    const now = Date.now();
    const force = options?.force === true;

    // Verifier le cache en memoire (toujours dispo, browser + Node)
    if (!force && cachedFxRates && (now - cachedFxRates.lastFetched) < CACHE_DURATION_MS) {
        return cachedFxRates;
    }

    // Verifier le cache persistant si localStorage existe (browser uniquement)
    if (!force) {
        const stored = safeGetItem('fx_rates_cache');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (parsed && (now - (parsed.lastFetched || 0)) < CACHE_DURATION_MS) {
                    const hydrate = normaliserCache(parsed);
                    if (hydrate) {
                        cachedFxRates = hydrate;
                        return hydrate;
                    }
                }
            } catch { /* JSON corrompu : on continue le fetch */ }
        }
    }

    // Fetch depuis la Banque du Canada
    // API: /valet/observations/GROUPE/json?recent=1
    // Series: FXUSDCAD (USD/CAD) et FXEURCAD (EUR/CAD)
    let cause: FxCause = 'reseau';
    try {
        const BDC_URL = "https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=1";
        const response = await fetchWithTimeout(BDC_URL, 8000);

        if (!response.ok) {
            // ⚠️ Avant ce lot, un 4xx/5xx tombait dans le MÊME silence qu'une coupure réseau : le
            // `if (response.ok)` sans `else` laissait sortir la fonction par le repli du bas, sans
            // rien écrire. Deux pannes qui ne se corrigent pas pareil rendaient le même « estimé ».
            cause = 'http';
            logError({ source: 'network', severity: 'warning', message: `Taux FX — la Banque du Canada a répondu ${response.status}`, context: { status: String(response.status) } });
        } else {
            const data = await response.json();
            const observations = (data as { observations?: unknown } | null)?.observations;

            if (!Array.isArray(observations) || observations.length === 0) {
                // ⚠️ Symétrique de la branche `!response.ok` trois lignes plus haut, qui loggue :
                // une réponse 200 au format cassé est une anomalie de MÊME gravité. Sans trace, elle
                // n'existe que si Marc ouvre la carte FX au bon moment — au démarrage, rien n'en
                // reste (finding silent-failure-hunter, panel #978).
                cause = 'reponse-illisible';
                logError({ source: 'network', severity: 'warning', message: 'Taux FX — réponse de la Banque du Canada sans observation exploitable' });
            } else {
                // ⚠️⚠️ [FX-OBSERVATION-COHORTE] ON NE LIT PLUS `observations[0]`. Sur un GROUPE,
                // `recent=1` rend la dernière observation de CHAQUE série, groupée par COHORTE : la
                // réponse réelle du 2026-09-16 commence par `{ d: "2019-12-31", FXVNDCAD: … }` — le
                // dong vietnamien, série abandonnée. Les deux séries qui nous intéressent vivaient
                // dans l'entrée SUIVANTE, donc les deux replis tiraient ensemble et l'app servait
                // 1,4000 / 1,4700, le littéral du dépôt (mesuré : EUR faux de +9,34 %).
                // Détail, mesures et seuil : `services/fx/observationsBdc.ts`.
                const usd = lireSerieBdc(observations, 'FXUSDCAD', now);
                const eur = lireSerieBdc(observations, 'FXEURCAD', now);

                // Distingue un taux ABSENT (repli silencieux normal) d'un taux PRÉSENT mais
                // CORROMPU ou FIGÉ → ces deux-là sont loggués au lieu d'être masqués par le repli.
                const resoudre = (lecture: LectureSerie, repli: number, label: string): number => {
                    if (lecture.statut === 'ok') return lecture.valeur;
                    if (lecture.statut === 'illisible') {
                        logError({ source: 'network', severity: 'warning', message: `Taux de change ${label} corrompu ou illisible — repli sur ${repli}`, context: { brut: lecture.brut } });
                    } else if (lecture.statut === 'perimee') {
                        logError({ source: 'network', severity: 'warning', message: `Taux de change ${label} figé depuis ${lecture.ageJours} jours — repli sur ${repli}`, context: { derniereObservation: lecture.date } });
                    }
                    return repli;
                };
                const usdCad = resoudre(usd, 1.40, 'USD/CAD');
                const eurCad = resoudre(eur, 1.47, 'EUR/CAD');

                // [FX-FALLBACK-SILENCIEUX] Un succès GLOBAL du fetch peut cacher un repli PAR SÉRIE
                // — `estimated` le fait remonter, ce que `lastFetched > 0` seul ne voyait pas.
                const anyFallback = usd.statut !== 'ok' || eur.statut !== 'ok';
                // ⚠️ `'perimee'` PRIME sur `'partiel'` quand les deux coexistent : c'est le
                // diagnostic le plus SPÉCIFIQUE, et celui qui a manqué le 2026-09-16 — « au moins
                // une série absente » a envoyé chercher la panne du côté de la Banque du Canada.
                cause = !anyFallback ? 'ok'
                    : (usd.statut === 'perimee' || eur.statut === 'perimee') ? 'perimee'
                    : 'partiel';

                // ⚠️ UNE SEULE RÈGLE, ICI ET DANS LE STORE : la date n'est publiée que si les DEUX
                // séries ont été lues. Elle décrit la PAIRE affichée — sur un repli partiel, un des
                // deux chiffres est le littéral du dépôt, et une date unique le ferait passer pour
                // une valeur publiée ce jour-là (§1 no-fake-data). Et surtout jamais `now` : ce
                // serait dater le repli de l'instant où on a renoncé à le remplacer.
                // Quand les deux sont lues à des jours DIFFÉRENTS (une série sans valeur publiée ce
                // jour-là), on garde la plus ANCIENNE : un couple de taux n'est pas plus frais que
                // son maillon le plus vieux.
                const observationDate = usd.statut === 'ok' && eur.statut === 'ok'
                    ? [usd.date, eur.date].sort()[0]
                    : undefined;

                const rates: ResultatTauxFx = {
                    USD: usdCad, EUR: eurCad, CAD: 1.00,
                    lastFetched: now,
                    estimated: anyFallback,
                    // ⚠️ Un succès PARTIEL n'est pas une lecture de marché : au moins un des deux
                    // chiffres est le littéral du dépôt. Le classer `'api'` rendrait au taux inventé
                    // l'autorité d'écrire un total de compte — exactement ce que ce lot corrige.
                    source: anyFallback ? 'repli' : 'api',
                    cause,
                    attemptAt: now,
                    ...(observationDate === undefined ? {} : { observationDate }),
                };
                cachedFxRates = rates;

                // Persistance dans localStorage si disponible (no-op en Node)
                safeSetItem('fx_rates_cache', JSON.stringify(rates));

                // Confirmation de mise à jour des taux : log informatif, pas une erreur.
                // eslint-disable-next-line no-console
                console.log(`Taux FX mis a jour (Banque du Canada): USD=${usdCad.toFixed(4)}, EUR=${eurCad.toFixed(4)}, observation=${observationDate ?? 'aucune'}`);
                return rates;
            }
        }
    } catch (e) {
        cause = 'reseau';
        logError({ source: 'network', severity: 'warning', message: 'Taux FX (Banque du Canada) indisponibles — fallback cache/défaut', error: e });
    }

    // Fallback (audit Tier 🟡) — préférer le DERNIER taux réel connu, même périmé (>24h),
    // à un taux inventé : un taux d'hier est plus honnête qu'une approximation hardcodée.
    // (Le check de fraîcheur 24h plus haut a échoué OU le réseau est tombé ; ici on
    // accepte volontairement un cache vieux comme repli réaliste.)
    const lastKnown = safeGetItem('fx_rates_cache');
    if (lastKnown) {
        try {
            const parsed = JSON.parse(lastKnown);
            const hydrate = normaliserCache(parsed);
            // ⚠️ Un cache PRÉSENT mais illisible n'est pas la même chose qu'un cache ABSENT : c'est
            // une corruption, et c'est précisément la question qu'un diagnostic futur posera
            // (« pourquoi le taux est-il resté en repli ? »). Sans cette trace, « jamais
            // synchronisé » et « cache corrompu » sont indiscernables — le dernier recours avant le
            // littéral en dur, c'est-à-dire le mécanisme même que ce lot corrige.
            if (hydrate === null) {
                logError({ source: 'storage', severity: 'warning', message: 'Cache des taux FX corrompu — repli sur les valeurs par défaut' });
            }
            // ⚠️ La PROVENANCE reste celle du cache (un taux d'hier lu chez la BdC reste un taux de
            // la BdC), mais la CAUSE est celle de la tentative qui vient d'échouer : sinon le
            // diagnostic affirmerait « tout va bien » pendant que plus rien ne passe.
            if (hydrate) return { ...hydrate, cause, attemptAt: now };
        } catch { /* cache corrompu : on tombe sur les défauts */ }
    }

    // Dernier recours : défauts approximatifs. `lastFetched: 0` = signal « jamais récupéré »
    // (contrat que le badge UI « taux estimé » détecte).
    return {
        USD: 1.40, EUR: 1.47, CAD: 1.00,
        lastFetched: 0, estimated: true, source: 'repli', cause, attemptAt: now,
    };
};

/**
 * Relit une entrée de cache en lui redonnant sa provenance.
 *
 * ⚠️ Les entrées écrites AVANT ce lot ne portent ni `source` ni `cause` — les lire comme
 * `undefined` ferait retomber tout le diagnostic sur « jamais tenté » alors qu'un vrai taux de
 * marché est là. On DÉRIVE donc de `estimated`, exactement comme le fait `fxSourceEffective` pour
 * l'état persisté : une même règle de rétrocompatibilité, écrite une fois, appliquée aux deux
 * surfaces qui la subissent.
 */
function normaliserCache(parsed: unknown): ResultatTauxFx | null {
    const p = parsed as Partial<ResultatTauxFx> | null;
    if (!p || typeof p.USD !== 'number' || typeof p.EUR !== 'number' || typeof p.CAD !== 'number') return null;
    if (!Number.isFinite(p.USD) || !Number.isFinite(p.EUR) || p.USD <= 0 || p.EUR <= 0) return null;
    const estimated = p.estimated === true;
    const source: FxSource = p.source === 'api' || p.source === 'manuel' || p.source === 'repli'
        ? p.source
        : (estimated ? 'repli' : 'api');
    // ⚠️ La cause est VALIDÉE comme la source : un cast laissait entrer n'importe quelle chaîne,
    // et une cause inconnue fait écrire l'état à CHAQUE démarrage (elle ne correspond jamais à
    // l'existante). Symétrie exigée par `AUDITER-LE-FILTRE-AUTANT-QUE-LA-LISTE`.
    // ⚠️ Le prédicat vient de `provenance.ts` et n'est PLUS recopié ici : la copie locale a failli
    // survivre à l'ajout de `'perimee'`, et une cause légitime rejetée fait réécrire l'état à
    // CHAQUE démarrage (elle ne correspond jamais à l'existante).
    const causeBrute = p.cause;
    const cause: FxCause = estFxCause(causeBrute) ? causeBrute : (estimated ? 'partiel' : 'ok');
    const lastFetched = Number.isFinite(Number(p.lastFetched)) ? Number(p.lastFetched) : 0;
    return {
        USD: p.USD, EUR: p.EUR, CAD: p.CAD,
        lastFetched, estimated, source, cause,
        attemptAt: Number.isFinite(Number(p.attemptAt)) ? Number(p.attemptAt) : lastFetched,
        // Champ ADDITIF : une entrée de cache d'avant ce lot ne le porte pas, et il doit rester
        // ABSENT plutôt que de recevoir une date inventée.
        ...(typeof p.observationDate === 'string' && p.observationDate !== ''
            ? { observationDate: p.observationDate }
            : {}),
    };
}

// [PORTFOLIO-HISTORY 2026-07-22] Les STUBS `fetchPortfolioHistory`/`fetchAssetHistory` (Google Sheet
// legacy supprimé → toujours []) sont RETIRÉS : ils rendaient tous les graphes de cours VIDES en
// données réelles (bug Marc « je vois pas le cours »). Remplaçants :
//  - hydratation : services/history/hydrateAssetHistories (marketData.getHistory : Finnhub → repli
//    Yahoo proxy → CoinGecko crypto), écrit Asset.priceHistory depuis le 1er achat ;
//  - lignes de graphe : services/history/buildMarketData (pur, dérivé du store) via usePortfolioHistory.
// Le type MarketDataPoint reste ici (importé par les composants de graphe).
