// mcp/tools/_dataAware.ts
//
// Lot 1 — utilitaires partagés par les tools « data-aware » (qui lisent l'état
// réel de l'utilisateur). Centralise : le type du fournisseur d'état, l'enrobage
// de réponse JSON, et la gestion d'erreur (état non configuré / invalide →
// message clair pour Claude au lieu d'un crash du serveur).

import type { AppState } from '../../types';
import { freshnessNotice } from '../state/freshness';
import { sanitizePromptText } from '../../utils/promptSafety';
import { logError, onLogEntry, __resetErrorThrottle } from '../../services/errorLogger';

// [MCP-PROMPT-SCRUB] Longueur max d'un champ TEXTE LIBRE utilisateur exposé à Claude via un tool
// data-aware. Assez large pour un nom d'actif / payee / nom de projet normal (banques : < 60), mais
// borne le flood de contexte par un champ malveillant. Le vrai rempart est le strip des caractères
// d'injection/markup (cf sanitizePromptText) ; la borne n'est qu'une ceinture anti-flood.
const MCP_TEXT_MAX = 200;

// [MCP-PROMPT-SCRUB] Clés dont la VALEUR est du TEXTE LIBRE saisi/importé par l'utilisateur (nom
// d'actif auto-rempli Finnhub, payee/catégorie extraits d'un relevé/PDF de courtage, nom de projet/
// dette/utilisateur, employeur) → vecteur d'injection de prompt indirecte à neutraliser. ⚠️ On ne
// scrube QUE ces clés, PAS toute string : les notes/verdicts/explications RÉDIGÉS PAR LE CODE
// (`notes`, `verdict`, `netTaxSettlementsNote`, `dollarsBasis`…) sont des garde-fous money-critical
// (mise en garde « agrégat ménage », « net≠impôt total ») — les scruber/tronquer les DÉTRUIRAIT
// (double finding panel 2026-07-16). `symbol` est EXCLU exprès (identifiant court, `^GSPC` perdrait
// son `^` ; risque d'injection négligeable sur un ticker). Étendre cette liste si un futur tool
// expose un nouveau champ texte libre utilisateur (cf test de garde `scrubMcpDeep`).
// [MCP-USERTEXT-LANDMINE, audit 2026-07-16] insurer/beneficiary/destination ajoutés PRÉVENTIVEMENT
// (aucun tool ne les expose encore) — un futur tool « assurances/documents/voyages » hériterait sinon
// du trou. ⚠️ `notes` est RÉSERVÉ au texte code-auteur (getTaxSituation.notes…) : un futur champ de
// notes UTILISATEUR doit s'appeler `userNotes` (déjà couvert ici), JAMAIS `notes`.
const USER_TEXT_KEYS = new Set([
    'name', 'payee', 'category', 'label', 'employer', 'description',
    'insurer', 'beneficiary', 'destination', 'userNotes',
    // [NAV-REMOVE-OBJECTIFS-TAB] `icon` justifiait `SavingsGoal.icon`, feature retirée. La clé RESTE,
    // mais à titre PRÉVENTIF (même patron que insurer/beneficiary/destination ci-dessus) : vérifié le
    // 2026-08-27, AUCUN tool data-aware n'expose de champ `icon` aujourd'hui. Candidat le plus proche
    // si ça change : `LifeEvent.icon` (texte libre, pas garanti emoji), construit par `mcp/whatIf.ts`
    // mais jamais sérialisé brut. Ne pas réécrire ce commentaire en affirmant un consommateur vivant.
    'icon',
]);

/**
 * [MCP-PROMPT-SCRUB] Neutralise les champs TEXTE LIBRE utilisateur d'un payload de tool data-aware
 * avant de le renvoyer à Claude (anti-injection de prompt indirecte). Walk récursif : une valeur
 * string n'est scrubée QUE si sa CLÉ est dans `USER_TEXT_KEYS` — `sanitizePromptText` retire
 * caractères de contrôle + markup/injection + borne la longueur. Tout le reste (nombres, booléens,
 * null, dates ISO, notes/verdicts code-auteur, symboles) passe INTACT. Centralisé ici → couvre TOUS
 * les tools data-aware, présents ET futurs, pour les clés connues.
 */
export function scrubMcpDeep(value: unknown, key?: string): unknown {
    if (typeof value === 'string') {
        return key !== undefined && USER_TEXT_KEYS.has(key) ? sanitizePromptText(value, MCP_TEXT_MAX) : value;
    }
    if (Array.isArray(value)) return value.map((el) => scrubMcpDeep(el)); // éléments sans clé → leurs champs keyed sont scrubés en récursion
    if (value && typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubMcpDeep(v, k);
        return out;
    }
    return value; // number | boolean | null | undefined — inchangés
}

/** Réponse MCP standard (un bloc texte). */
export interface ToolTextResult {
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
    [key: string]: unknown;
}

/**
 * Fournit l'AppState courant. Implémenté côté serveur (fichier local en stdio ;
 * Drive en Lot 3). Peut lever : la fabrique d'erreur ci-dessous la présente
 * proprement à Claude.
 */
export type StateProvider = () => Promise<AppState>;

// [MCP-ENGINE-WARNINGS] ALS Node-only, chargé paresseusement (import dynamique : ce module est
// AUSSI importé côté navigateur via les specs — un import statique de node:async_hooks casserait
// le bundle). null = indisponible (navigateur) → collecte non scopée, sûre car séquentielle.
type RequestAls = { run<T>(store: object, fn: () => T): T; getStore(): object | undefined };
let _requestAls: RequestAls | null | undefined;
async function getRequestAls(): Promise<RequestAls | null> {
    if (_requestAls !== undefined) return _requestAls;
    if (typeof window !== 'undefined') { _requestAls = null; return null; }
    try {
        const { AsyncLocalStorage } = await import('node:async_hooks');
        _requestAls = new AsyncLocalStorage<object>() as unknown as RequestAls;
    } catch {
        _requestAls = null; // runtime sans async_hooks → repli non scopé (comportement séquentiel sûr)
    }
    return _requestAls;
}

/** Emballe un objet sérialisable en réponse MCP texte (JSON indenté).
 *  [MCP-PROMPT-SCRUB] Les champs texte libres sont neutralisés en profondeur (anti-injection). */
export function jsonContent(payload: unknown): ToolTextResult {
    return { content: [{ type: 'text', text: JSON.stringify(scrubMcpDeep(payload), null, 2) }] };
}

/** Réponse d'erreur exploitable (texte + isError) — jamais de throw vers le transport. */
export function errorContent(message: string): ToolTextResult {
    return { content: [{ type: 'text', text: `⚠️ ${message}` }], isError: true };
}

/**
 * Charge l'état via `getState`, applique `fn`, et renvoie le résultat. Toute
 * erreur (source absente, JSON/forme invalide, calcul) est convertie en réponse
 * d'erreur claire — le serveur MCP ne plante pas et Claude reçoit un message
 * actionnable.
 */
export async function withState(
    getState: StateProvider,
    // [AITOOLS-ENGINE-WORKER] fn peut être ASYNC : les tools moteur awaitent runProjectionAsync
    // (Web Worker côté navigateur, repli synchrone côté Node/MCP). Un fn sync reste supporté tel quel.
    fn: (state: AppState) => ToolTextResult | Promise<ToolTextResult>,
): Promise<ToolTextResult> {
    let state: AppState;
    try {
        state = await getState();
    } catch (err) {
        // [MCP-TOOLS-SILENT-CATCH] La réponse d'erreur part à Claude, mais SANS logError le bug
        // était introuvable côté serveur (Cloud Run route console.* vers ses logs via errorLogger).
        logError({
            source: 'storage', severity: 'error',
            message: 'MCP withState : chargement de l\'état ÉCHOUÉ (réponse d\'erreur renvoyée à Claude).',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        return errorContent(
            `Impossible de charger ton état FinanceAI. ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    // [MCP-ENGINE-WARNINGS] Collecte les logs MOTEUR (source 'projection', warning+) émis PENDANT le
    // calcul : sous Node, le sink localStorage est un no-op → « montant non fini → dépense ignorée »
    // et consorts étaient INVISIBLES pour Claude (le calcul répondait avec assurance). Les messages
    // sont déjà scrubés par logError (montants/PII masqués). Bloc texte ADDITIF, JSON intact.
    // ⚠️ Concurrence (finding code-reviewer #520) : le Set d'écouteurs est PARTAGÉ par le process —
    // deux withState EN VOL (Cloud Run HTTP) capteraient les logs l'un de l'autre. Sous Node, on
    // scope donc la collecte au contexte async de CETTE requête (AsyncLocalStorage) ; en navigateur
    // (pas d'ALS), la boucle de dispatch in-app est séquentielle ET le moteur tourne dans un Web
    // Worker (module errorLogger séparé) → le cross-talk n'y est pas atteignable.
    const engineWarnings: string[] = [];
    const als = await getRequestAls();
    const token = {};
    // [F2 projection-validator] logErrorThrottled garde ses signatures À VIE du process → sur un
    // Cloud Run long-vécu, un même avertissement moteur ne tirait qu'UNE fois (2ᵉ requête muette,
    // mesuré). Purge au DÉBUT de chaque collecte : le throttle intra-run (hot-path MC) reste actif.
    __resetErrorThrottle();
    const unsubscribe = onLogEntry((e) => {
        if (als && als.getStore() !== token) return; // log d'une AUTRE requête en vol → ignoré
        if (e.source === 'projection' && (e.severity === 'warning' || e.severity === 'error' || e.severity === 'critical')) {
            // [F1 projection-validator — ÉLEVÉ, mesuré] e.message peut interpoler un nom d'événement
            // SAISI PAR L'UTILISATEUR (monthlyEvents interpole e.name) : ce bloc texte contourne le
            // chokepoint jsonContent/scrubMcpDeep → scrub anti-injection ICI, au point de collecte.
            const safe = sanitizePromptText(e.message, 300);
            if (engineWarnings.length < 5 && !engineWarnings.includes(safe)) engineWarnings.push(safe);
        }
    });
    try {
        const res = als ? await als.run(token, () => fn(state)) : await fn(state);
        // [MCP-STALE-FRESHNESS] — appose l'âge des données à CHAQUE réponse (bloc texte ADDITIF,
        // le JSON du 1er bloc reste intact). Si la source n'a pas d'horodatage (fixture, fichier
        // local), pas de note. Claude voit ainsi quand la copie Drive est périmée au lieu de
        // présenter des chiffres morts comme actuels (incident 2026-07-14).
        const notice = freshnessNotice();
        if (notice) res.content.push({ type: 'text', text: notice });
        if (engineWarnings.length > 0) {
            res.content.push({
                type: 'text',
                text: `⚠️ Avertissements du moteur pendant ce calcul (à relayer si pertinent) :\n- ${engineWarnings.join('\n- ')}`,
            });
        }
        return res;
    } catch (err) {
        // [MCP-TOOLS-SILENT-CATCH] Un bug de CALCUL dans un tool (NaN, forme d'état inattendue)
        // doit laisser une trace serveur, pas seulement un message à Claude.
        logError({
            source: 'unknown', severity: 'error',
            message: 'MCP withState : calcul d\'un tool data-aware ÉCHOUÉ (réponse d\'erreur renvoyée à Claude).',
            error: err instanceof Error ? err : new Error(String(err)),
        });
        // [F4 projection-validator] Un calcul qui ÉCHOUE garde ses indices : les avertissements
        // moteur collectés avant le crash expliquent souvent l'échec.
        const hint = engineWarnings.length > 0 ? ` Avertissements moteur : ${engineWarnings.join(' · ')}` : '';
        return errorContent(
            `Calcul impossible sur ton état. ${err instanceof Error ? err.message : String(err)}${hint}`,
        );
    } finally {
        unsubscribe(); // jamais d'écouteur qui fuit d'une requête à l'autre
    }
}
