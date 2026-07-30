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
import { mapFintableSnapshot, FINTABLE_TAX_REGIMES, type FintableAccountRole, type FintableTaxRegime } from './mapSnapshot';
import { decideCutoverDate, applyPayloadsIsolated } from './syncCore';
import { toPersistableBrokerBalances } from './brokerBalances';
import { FintableError } from './types';
import { logError } from '../errorLogger';

/** Base same-origin. Le proxy réécrit vers `https://fintable.io/api/v2`. */
export const FINTABLE_BROWSER_BASE = '/api/fintable';

/** Fenêtre de lecture. 90 jours demandés, ~30 rendus en pratique — la borne réelle est la bascule. */
const LOOKBACK_DAYS = 90;

export interface BrowserSyncResult {
    /** Rapport identique à celui du cron serveur (même type, même carte de diagnostic). */
    report: FintableSyncReport;
    /** État à persister. `null` si la passe a échoué (rien ne doit être écrit à moitié). */
    nextState: AppState | null;
}

export interface BrowserSyncOptions {
    /** Injectable pour les tests (défaut : client réel sur le proxy same-origin). */
    client?: FintableClient;
    /** Injectable pour les tests (défaut : `Date.now()`). */
    now?: () => number;
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
    });

    if (typeof token !== 'string' || token.trim() === '') {
        return { report: emptyReport(null, 'Jeton Fintable absent — ajoute-le dans Réglages.'), nextState: null };
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
        const dateFrom = cutoverDateUsed
            ?? new Date(now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
        const snapshot = await readFintableSnapshot(client, { dateFrom, dateTo: todayStr });

        const { payloads, report: mapReport } = mapFintableSnapshot(snapshot, {
            roles: toMapperRoles(state.fintableRoles),
            transactionsAfter: cutoverDateUsed,
        });

        // Isolation PAR PAYLOAD : PARTAGÉE avec le cron (`syncCore`), voir son en-tête.
        const applied = applyPayloadsIsolated(state, payloads);
        const { nextState, transactionsAdded, cashUpdated, debtsUpdated, warnings: applyWarnings } = applied;

        const report: FintableSyncReport = {
            at: now(),
            cutoverDateUsed,
            accountsSeen: snapshot.accounts.length,
            accountsWithoutRole: mapReport.accountsWithoutRole.length,
            transactionsAdded,
            transfersDetected: mapReport.transferPairs.length,
            cashUpdated,
            debtsUpdated,
            investmentReferenceCount: mapReport.investmentBalances.length,
            warnings: [...preflightWarnings, ...mapReport.warnings, ...applyWarnings],
            error: null,
        };

        return {
            report,
            nextState: {
                ...nextState,
                fintableSyncReport: report,
                fintableBrokerBalances: toPersistableBrokerBalances(mapReport.investmentBalances, report.at),
            },
        };
    } catch (err) {
        logError({
            source: 'storage', severity: 'error',
            message: '[FINTABLE-7] Passe de sync (navigateur) ÉCHOUÉE.',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        // Rapport d'échec RENDU (pas persisté ici) : c'est l'appelant qui décide d'écrire, pour ne
        // jamais laisser un état à moitié appliqué. `nextState: null` = « n'écris rien du contenu ».
        return { report: emptyReport(cutoverDateUsed, describeError(err)), nextState: null };
    }
}
