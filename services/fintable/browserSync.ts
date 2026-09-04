// services/fintable/browserSync.ts
//
// [FINTABLE-7] Passe de synchronisation Fintable exécutée DANS LE NAVIGATEUR.
//
// Pourquoi ce chemin existe (décision 2026-07-30, demande Marc « je veux que tu fasses tout toi,
// sans que j'aie besoin de t'aider ») : le chemin serveur (`mcp/runFintableSync.ts`, Cloud Run +
// cron GitHub) exige IRRÉDUCTIBLEMENT des identifiants que seul Marc détient — 3 secrets Secret
// Manager, un redéploiement `gcloud`, un secret GitHub Actions. Mesuré : `gcloud` est absent de
// l'environnement d'exécution, il n'y a aucun identifiant GCP, et `fintable.io` y est bloqué (403
// au tunnel CONNECT). Ce chemin-ci ne demande qu'UNE chose : coller le jeton dans Réglages.
//
// Ce module ne DUPLIQUE aucune logique métier : lecteur (`readFintableSnapshot`), mapper pur
// (`mapFintableSnapshot`), persistance des soldes (`toPersistableBrokerBalances`) ET orchestration
// money-critical (`syncCore` : plafonnement de bascule + application isolée par payload) sont
// PARTAGÉS avec le cron serveur. Seuls changent le TRANSPORT (proxy same-origin) et le porteur de
// l'état (rendu à l'appelant, pas écrit au Drive via OCC).
// ⚠️ Le premier jet de ce module COPIAIT le plafonnement et la boucle d'isolation — deux correctifs
// de panel (PR #531) — et l'affirmait pourtant « aucune logique dupliquée » (finding code-reviewer,
// PR #535). Une affirmation de commentaire se vérifie : elle fabriquait le prochain faux négatif.
//
// ⚠️ TRANSPORT : `/api/fintable/*` est un rewrite same-origin (`vercel.json` en prod, `server.proxy`
// en dev) vers `https://fintable.io/api/v2/*`. C'est le patron déjà éprouvé pour Yahoo : la CSP
// (`connect-src 'self'`) couvre sans ajouter de domaine, et il n'y a pas de préflight CORS.
// ⚠️ DIFFÉRENCE avec le proxy Yahoo, à ne pas sous-estimer (finding security-privacy, PR #535) :
// celui-ci relaie un en-tête `Authorization` (Bearer), là où Yahoo ne sert que de la donnée publique
// non authentifiée. L'hôte et le schéma sont FIXES côté rewrite (donc pas de SSRF : un `../` dans le
// chemin ne peut qu'atterrir ailleurs sur fintable.io, joignable directement de toute façon), et
// aucun jeton n'est intégré côté serveur — le relais ne peut donc pas fuiter CELUI de Marc. Reste
// qu'il est ouvert et sans limite de débit : un tiers peut s'en servir pour masquer l'origine de son
// trafic vers fintable.io et consommer de la bande passante. Compromis ACCEPTÉ pour une app solo
// sans backend (ADR-002), consigné ici plutôt que découvert plus tard.
//
// ⚠️ COMPROMIS ASSUMÉ vs le cron serveur, à ne pas masquer : (a) le jeton vit dans le navigateur
// (chiffré comme les autres clés) et transite par l'edge Vercel, au lieu de rester dans Secret
// Manager — le scope LECTURE SEULE du jeton borne le risque ; (b) ça ne tourne pas application
// fermée. Le cron serveur reste en place et prioritaire si Marc monte un jour la config.

import type { AppState, FintableSyncReport, FintableAccountRoleConfig } from '../../types';
import { FintableClient } from './client';
import { readFintableSnapshot } from './readSnapshot';
import { comptesSansPositionsDuSnapshot } from './comptesSansPositions';
import type { FintableSnapshot } from './types';
import { mapFintableSnapshot, FINTABLE_TAX_REGIMES, type FintableAccountRole, type FintableTaxRegime } from './mapSnapshot';
import { decideCutoverDate, applyPayloadsIsolated } from './syncCore';
import { classerRattrapage, type ClassementRattrapage, type PaireIncertaine } from './backfillDedup';
import { referenceDeltaPatch } from './applyStatePatch';
import { toPersistableBrokerBalances } from './brokerBalances';
import { lastProductiveAtSuivant } from './syncHealth';
import { FintableError } from './types';
import { logError } from '../errorLogger';

/** Base same-origin. Le proxy réécrit vers `https://fintable.io/api/v2`. */
export const FINTABLE_BROWSER_BASE = '/api/fintable';

/** Fenêtre de lecture. 90 jours demandés, ~30 rendus en pratique — la borne réelle est la bascule. */
const LOOKBACK_DAYS = 90;

export interface BrowserSyncResult {
    /** Rapport identique à celui du cron serveur (même type, même carte de diagnostic). */
    report: FintableSyncReport;
    /**
     * Patch MINIMAL à écrire — déjà réduit aux clés réellement touchées, et calculé contre la base
     * sur laquelle les payloads ont été appliqués. `null` si la passe a échoué (rien ne doit être
     * écrit à moitié).
     *
     * ⚠️ [FINTABLE-SYNC-STALE-BASE] Ce champ a REMPLACÉ un `nextState: AppState | null` que
     * l'appelant devait lui-même diffuser via `referenceDeltaPatch(base, nextState)`. Le diff n'a de
     * sens que contre la base EXACTE de l'application ; l'exposer laissait à l'appelant le choix de
     * la base — et les deux appelants prenaient celle capturée AVANT le réseau. Le patch est donc
     * calculé ICI, où la base est connue sans ambiguïté : la faute n'est plus exprimable.
     */
    statePatch: Partial<AppState> | null;
    /**
     * [FINTABLE-RATTRAPAGE] Paires DOUTEUSES à faire trancher par Marc — vide hors rattrapage.
     *
     * ⚠️ Rendu à l'appelant plutôt que persisté : c'est une liste de TRAVAIL, pas de la donnée. La
     * persister créerait un second état à réconcilier (que faire d'une paire dont une des deux
     * transactions a été supprimée depuis ?) pour un gain nul — l'arbitrage se fait dans la foulée
     * de la passe, et les entrantes sont déjà neutralisées si Marc ne fait rien.
     */
    incertaines: PaireIncertaine[];
}

export interface BrowserSyncOptions {
    /** Injectable pour les tests (défaut : client réel sur le proxy same-origin). */
    client?: FintableClient;
    /** Injectable pour les tests (défaut : `Date.now()`). */
    now?: () => number;
    /**
     * [FINTABLE-SYNC-STALE-BASE] Relit l'état JUSTE AVANT d'appliquer les payloads.
     *
     * ⚠️ Le `state` reçu en argument est capturé AVANT le fetch réseau (plusieurs secondes). Une
     * saisie manuelle pendant cette fenêtre — une transaction ajoutée à la main, un solde corrigé —
     * atterrit dans le store mais PAS dans ce snapshot : les payloads bâtissaient alors leurs
     * tableaux à partir d'une base amputée, et le patch (qui touche justement `transactions` /
     * `initialBalances`) écrasait la saisie. Le verrou de sync (`acquireFintableSyncLock`) ne
     * protège QUE contre une autre passe, jamais contre l'utilisateur.
     *
     * Appliquer sur l'état FRAIS suffit à tout réconcilier : `applyDocument` déduplique les
     * transactions par clé CONTRE `state.transactions` au moment de l'application, et
     * `applyCashBalance` recalcule sa cible via `computeStartingCash(state)` — les deux voient donc
     * la saisie manuelle. La bascule anti-doublon (`cutoverDateUsed`), elle, reste dérivée de l'état
     * PRÉ-fetch à dessein : elle a déjà servi à borner la requête, et la déduplication à
     * l'application est la vraie protection (la re-dériver ne ferait que FILTRER des transactions
     * légitimes en plus, sans rien gagner).
     *
     * Défaut : `() => state` (comportement d'avant, pour les tests et tout appelant sans store).
     */
    getFreshState?: () => AppState;
    /**
     * [FINTABLE-RATTRAPAGE] Passe de RATTRAPAGE : rapatrie TOUT l'historique exposé par Fintable.
     *
     * ⚠️ Cette option RENONCE délibérément à la garantie centrale de la sync ordinaire — « pas de
     * recouvrement, donc pas de dépendance à la dédup ». Elle ne borne plus la requête à la bascule
     * et laisse le mapper accepter les dates antérieures (`transactionsAfter: null`). Le
     * recouvrement devient CERTAIN, et c'est `classerRattrapage` qui le traite : doublons évidents
     * neutralisés seuls, cas douteux listés pour arbitrage.
     *
     * Demande de Marc (2026-08-18) : « 0 transactions en plus » après avoir élargi son historique
     * chez Fintable — la sync en avant ne pouvait rien rapatrier, par construction.
     * ⚠️ Défaut `false` ⇒ la sync quotidienne est INCHANGÉE, bit pour bit.
     */
    backfill?: boolean;
}

function describeError(err: unknown): string {
    if (err instanceof FintableError) return `[${err.code}] ${err.message}`;
    return err instanceof Error ? err.message : String(err);
}

/**
 * Les rôles persistés (`FintableAccountRoleConfig`, forme UI) sont structurellement identiques à
 * ceux du mapper. La conversion est une identité — mais explicite, pour que le typecheck casse si
 * les deux formes divergent un jour au lieu de laisser passer un rôle mal formé jusqu'au mapper.
 */
function toMapperRoles(
    roles: Readonly<Record<string, FintableAccountRoleConfig>> | undefined,
): Record<string, FintableAccountRole> {
    const out: Record<string, FintableAccountRole> = {};
    for (const [id, role] of Object.entries(roles ?? {})) {
        if (role?.kind === 'debt') {
            // Une dette sans nom ne peut viser aucune dette existante → ignorée plutôt que de faire
            // échouer toute la passe (l'UI l'empêche, mais un état ancien peut la porter).
            if (typeof role.debtName === 'string' && role.debtName.trim() !== '') {
                out[id] = { kind: 'debt', debtName: role.debtName };
            }
        } else if (role?.kind === 'cash' || role?.kind === 'ignore') {
            out[id] = { kind: role.kind };
        } else if (role?.kind === 'investment') {
            // ⚠️ Régime VALIDÉ contre la source unique, pas recopié (finding code-reviewer, PR #535) :
            // le parseur du chemin serveur (`rolesConfig`) rejette déjà une valeur invalide, mais ici
            // l'état vient du Drive et n'est validé par aucun schéma. Une valeur invalide non-undefined
            // passerait entre les mailles — le mapper ne teste que `=== undefined` pour signaler
            // « régime non déclaré » → ni ventilation, ni avertissement : le pire des deux mondes.
            const regime = (FINTABLE_TAX_REGIMES as readonly string[]).includes(role.taxRegime as string)
                ? (role.taxRegime as FintableTaxRegime)
                : undefined;
            out[id] = regime === undefined ? { kind: 'investment' } : { kind: 'investment', taxRegime: regime };
        }
    }
    return out;
}

/**
 * [FINTABLE-7] Liste les comptes pour l'ÉCRAN DE CONFIGURATION (« Tester la connexion »).
 *
 * Volontairement plus léger que `readFintableSnapshot` : celui-ci enchaîne aussi les positions de
 * CHAQUE compte et les transactions — inutile (et lent, et coûteux en quota) quand on veut juste
 * afficher la liste à Marc pour qu'il assigne les rôles. `skipHoldings` évite N appels superflus.
 *
 * Ne lève pas : rend un message d'erreur exploitable à l'écran. Un jeton refusé (401) doit dire
 * « jeton refusé », pas « quelque chose a échoué ».
 */
export async function listFintableAccountsForSetup(
    token: string,
    opts: { client?: FintableClient } = {},
): Promise<{ accounts: FintableSnapshot['accounts']; error: string | null }> {
    if (typeof token !== 'string' || token.trim() === '') {
        return { accounts: [], error: 'Jeton Fintable absent.' };
    }
    try {
        const client = opts.client ?? new FintableClient({ token, baseUrl: FINTABLE_BROWSER_BASE });
        const snapshot = await readFintableSnapshot(client, { skipHoldings: true, skipTransactions: true });
        return { accounts: snapshot.accounts, error: null };
    } catch (err) {
        return { accounts: [], error: describeError(err) };
    }
}

/**
 * Exécute une passe complète depuis le navigateur. Ne LÈVE jamais : toute panne devient un rapport
 * d'échec exploitable (`report.error`), pour que l'UI ait toujours quelque chose d'honnête à
 * afficher — même garantie « rapport toujours écrit » que le cron serveur.
 */
export async function runFintableBrowserSync(
    state: AppState,
    token: string,
    opts: BrowserSyncOptions = {},
): Promise<BrowserSyncResult> {
    const now = opts.now ?? (() => Date.now());
    const emptyReport = (cutoverDateUsed: string | null, error: string | null): FintableSyncReport => ({
        at: now(), cutoverDateUsed, accountsSeen: 0, accountsWithoutRole: 0,
        transactionsAdded: 0, transfersDetected: 0, cashUpdated: false, debtsUpdated: [],
        investmentReferenceCount: 0, warnings: [], error,
        // [FINTABLE-SOURCE-TAG] Un échec ne « dé-produit » pas : l'horodatage précédent est reporté.
        lastProductiveAt: lastProductiveAtSuivant(state.fintableSyncReport, 0, now()),
    });

    if (typeof token !== 'string' || token.trim() === '') {
        return { report: emptyReport(null, 'Jeton Fintable absent — ajoute-le dans Réglages.'), statePatch: null, incertaines: [] };
    }

    let cutoverDateUsed: string | null = null;
    const preflightWarnings: string[] = [];

    try {
        const todayStr = new Date(now()).toISOString().slice(0, 10);
        // Plafonnement PARTAGÉ avec le cron (`syncCore`) — même correctif des deux côtés, par
        // construction plutôt que par vigilance.
        const cutover = decideCutoverDate(state.transactions, todayStr);
        cutoverDateUsed = cutover.cutoverDateUsed;
        preflightWarnings.push(...cutover.warnings);

        const client = opts.client ?? new FintableClient({ token, baseUrl: FINTABLE_BROWSER_BASE });
        // ⚠️ ÉCART ASSUMÉ avec le cron, qui laisse `dateFrom: undefined` (illimité) sur état vierge :
        // ici on borne à 90 jours. Ce n'est PAS une protection anti-doublon — celle-ci est la bascule
        // (`transactionsAfter`, appliquée strictement par le mapper) et elle vaut `null` seulement si
        // `state.transactions` est réellement vide, donc il n'y a rien à recouvrir. La borne sert à ne
        // pas rapatrier des mois de données dans un onglet au premier lancement (le cron, lui, tourne
        // sans utilisateur qui attend). Divergence documentée pour ne pas passer pour un oubli.
        // ⚠️ [FINTABLE-RATTRAPAGE] En rattrapage, `dateFrom` est VOLONTAIREMENT absent : Marc a
        // demandé « tout ce que Fintable a ». C'est cette borne qui l'empêchait de récupérer son
        // historique — la lever EST la demande, pas un effet de bord.
        const dateFrom = opts.backfill
            ? undefined
            : (cutoverDateUsed ?? new Date(now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10));
        const snapshot = await readFintableSnapshot(client, { dateFrom, dateTo: todayStr });

        // ⚠️ [finding code-reviewer, PR #566] Les RÔLES viennent de `state` (pré-fetch), pas de
        // l'état frais — écart ASSUMÉ et borné, nommé plutôt que laissé en résiduel silencieux :
        // réassigner un rôle de compte pendant les quelques secondes de réseau ferait classer ce
        // compte selon l'ANCIENNE config pour cette passe seulement, et la suivante le corrige.
        // Rien n'est écrasé (c'est une lecture de CONFIG, pas la base d'application), donc ça ne
        // relève pas de [FINTABLE-SYNC-STALE-BASE], qui visait la base d'ÉCRITURE.
        const { payloads, report: mapReport } = mapFintableSnapshot(snapshot, {
            roles: toMapperRoles(state.fintableRoles),
            // ⚠️ `null` en rattrapage : sans ça le mapper jetterait tout l'historique qu'on vient
            // justement d'aller chercher (`tx.date <= transactionsAfter`, filtre STRICT). Les deux
            // bornes — requête ET mapper — doivent tomber ENSEMBLE ; n'en lever qu'une donnerait un
            // rattrapage qui télécharge tout et n'en garde rien, en silence.
            transactionsAfter: opts.backfill ? null : cutoverDateUsed,
        });

        // [FINTABLE-SYNC-STALE-BASE] Base RELUE ici, après le réseau — voir `getFreshState`.
        const baseState = opts.getFreshState?.() ?? state;

        // ⚠️ [FINTABLE-RATTRAPAGE] Le classement se fait ICI : après la relecture de la base (donc
        // contre les VRAIES transactions existantes, saisies manuelles comprises) et AVANT
        // l'application. Le faire plus tôt le baserait sur un état pré-réseau — exactement le défaut
        // corrigé par [FINTABLE-SYNC-STALE-BASE] ; plus tard, les doublons seraient déjà écrits.
        let rattrapage: ClassementRattrapage<{ date: string; payee: string; amount: number; isDuplicate?: boolean }> | null = null;
        if (opts.backfill) {
            for (const p of payloads) {
                if (p.kind !== 'bank_statement') continue;
                rattrapage = classerRattrapage(baseState.transactions ?? [], p.transactions);
                // Les incertaines sont neutralisées AUSSI : mieux vaut un doublon caché (récupérable
                // depuis la liste) qu'un doublon qui fausse le budget en silence.
                // L'appelant fait autorité : voir `callerClassified` (deux dédups qui se
                // contredisaient et supprimaient de vraies dépenses).
                p.callerClassified = true;
                p.transactions = [
                    ...rattrapage.nouvelles,
                    ...rattrapage.certaines,
                    ...rattrapage.incertaines.map((i) => i.entrante),
                ] as typeof p.transactions;
            }
        }
        // Isolation PAR PAYLOAD : PARTAGÉE avec le cron (`syncCore`), voir son en-tête.
        const applied = applyPayloadsIsolated(baseState, payloads);
        const { nextState, transactionsAdded, cashUpdated, cashAnchorDelta, debtsUpdated, warnings: applyWarnings } = applied;

        const report: FintableSyncReport = {
            at: now(),
            cutoverDateUsed,
            // ⚠️ La fin du « 0 transactions en plus » trompeur : le compteur existait dans le
            // rapport du mapper depuis toujours, mais ne sortait que dans le script de dry-run.
            skippedBeforeCutover: mapReport.transactions.skippedBeforeCutover,
            wasBackfill: opts.backfill === true,
            accountsSeen: snapshot.accounts.length,
            accountsWithoutRole: mapReport.accountsWithoutRole.length,
            transactionsAdded,
            // [FINTABLE-SOURCE-TAG] Fraîcheur du connecteur : horodatée si la passe a ÉCRIT,
            // reportée du rapport précédent sinon (source unique de la règle : syncHealth.ts).
            lastProductiveAt: lastProductiveAtSuivant(baseState.fintableSyncReport, transactionsAdded, now()),
            transfersDetected: mapReport.transferPairs.length,
            cashUpdated,
            cashAnchorDelta,
            debtsUpdated,
            investmentReferenceCount: mapReport.investmentBalances.length,
            // [FINTABLE-INVESTMENTS-MUET] La cause d'un écran de placements VIDE, jusqu'ici
            // mesurée puis jetée. Source unique partagée avec l'autre chemin de sync.
            comptesSansPositions: comptesSansPositionsDuSnapshot(snapshot),
            warnings: [...preflightWarnings, ...mapReport.warnings, ...applyWarnings],
            error: null,
        };

        // Delta par IDENTITÉ DE RÉFÉRENCE contre `baseState` — la base RÉELLE de l'application.
        // Le helper porte le pourquoi du delta (`applyStatePatch.ts`) ; ce qui se joue ici est le
        // choix de la BASE, et c'est précisément ce que [FINTABLE-SYNC-STALE-BASE] corrige.
        return {
            report,
            incertaines: rattrapage?.incertaines ?? [],
            statePatch: referenceDeltaPatch(baseState, {
                ...nextState,
                fintableSyncReport: report,
                fintableBrokerBalances: toPersistableBrokerBalances(mapReport.investmentBalances, report.at),
            }),
        };
    } catch (err) {
        logError({
            source: 'storage', severity: 'error',
            message: '[FINTABLE-7] Passe de sync (navigateur) ÉCHOUÉE.',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        // Rapport d'échec RENDU (pas persisté ici) : c'est l'appelant qui décide d'écrire, pour ne
        // jamais laisser un état à moitié appliqué. `statePatch: null` = « n'écris rien du contenu ».
        return { report: emptyReport(cutoverDateUsed, describeError(err)), statePatch: null, incertaines: [] };
    }
}
