// services/aiChat/viewContext.ts
//
// [CHAT-PAGE-CONTEXT] Registre PUR du « contexte d'écran » du chat (demande Marc 2026-07-22 :
// « le chat peut réagir à tout sur la page »). Un état mutable = un module propriétaire (patron
// ARCH-SYNC-SPLIT) — léger, boot-safe, JAMAIS persisté/synchronisé (ADR-4 par analogie : le
// contexte d'écran est éphémère, capturé au moment de l'envoi d'un message).
//
// Deux niveaux :
//  - Tier 1 (toujours, gratuit) : l'onglet ACTIF (store) — décrit même sans page instrumentée.
//  - Tier 2 (pages instrumentées) : détail publié par la page via useViewContextPublisher, qui
//    RÉUTILISE les valeurs déjà calculées pour le rendu (« jamais un 3e chiffre », classes
//    PH4D-BUDGET-RATIOS / BUDGET-INCOME-REAL) et gate le mode discret À LA SOURCE.
//
// ⚠️ Le contexte est INJECTÉ dans le `system` prompt (figé par envoi — ADR : pas de tool
// get_current_view, un tool serait relu à chaque tour de boucle = contexte qui dérive mi-envoi,
// et le registre de tools est partagé app↔MCP par construction).

import { TAB_LABELS } from '../../constants';
import { Tab } from '../../types';
import { sanitizePromptText } from '../../utils/promptSafety';
import { logError } from '../errorLogger';

/** Détail publié par l'onglet Budget (vague 1) — les montants sont CEUX affichés à l'écran. */
export interface BudgetViewDetail {
    kind: 'budget';
    /** « mois » / « trimestre » / « année » / « plage personnalisée ». */
    timeViewLabel: string;
    /** Période affichée, humanisée (« juillet 2026 », « T3 2026 », « du 2026-07-01 au 2026-07-22 »). */
    periodLabel: string;
    /** Dépenses réelles de la période TELLES QU'AFFICHÉES (totalSpentDisplay). */
    totalSpent: number;
    /** Cible totale du budget affichée (totalBudgetDisplay). */
    totalBudgetTarget: number;
    /** Revenus réels de la période affichés (incomeBreakdown.total). */
    totalRealIncome: number;
    /** Top catégories dépensées affichées (bornées à 3 — coût tokens). ⚠️ name = TEXTE UTILISATEUR. */
    topCategories: Array<{ name: string; spent: number }>;
    /** Libellé du filtre personne actif (mode couple) — TEXTE UTILISATEUR. Absent = tout combiné. */
    personFilterLabel?: string;
    /** [Vague 1.5 — demande Marc « qu'il comprenne TOUTE la page + les calculs derrière »] Autres
     *  cartes affichées : `value` = la valeur TELLE QU'AFFICHÉE (formatCAD de la page — réutilisée,
     *  jamais recalculée), `note` = PROVENANCE du chiffre (quel calcul/source derrière — le chat
     *  peut alors l'EXPLIQUER). ⚠️ Tout champ peut porter du texte utilisateur (ex. noms de postes
     *  dans une alerte) : le prompt builder assainit CHAQUE champ (belt). Borné à ~8 cartes. */
    cards?: Array<{ label: string; value: string; note?: string }>;
}

/** Union à étendre page par page (vague 2+). */
export type ViewContextDetail = BudgetViewDetail;

export interface ViewContextEntry {
    scope: string;
    detail: ViewContextDetail;
    publishedAt: number;
}

let _current: ViewContextEntry | null = null;
const _subscribers = new Set<() => void>();

function notify(): void {
    for (const cb of _subscribers) {
        try {
            cb();
        } catch (e) {
            // Isolé (un subscriber cassé ne bloque pas les autres) mais JAMAIS muet (finding panel
            // #490 : un badge qui cesse de se mettre à jour serait indétectable sans trace).
            logError({
                source: 'ui', severity: 'warning',
                message: 'viewContext : un subscriber a levé une exception — ignoré (les autres continuent).',
                error: e instanceof Error ? e : new Error(String(e)),
            });
        }
    }
}

export function publishViewContext(scope: string, detail: ViewContextDetail): void {
    _current = { scope, detail, publishedAt: Date.now() };
    notify();
}

/** GUARDÉ par scope : le cleanup d'une page démontée n'efface JAMAIS le contexte publié par une
 *  autre page entre-temps (course mount/unmount, StrictMode). */
export function clearViewContext(scope: string): void {
    if (_current?.scope !== scope) return;
    _current = null;
    notify();
}

/** Lecture IMPÉRATIVE — à appeler AU MOMENT de l'envoi (jamais mise en cache inter-messages). */
export function getViewContext(): ViewContextEntry | null {
    return _current;
}

/** Pour useSyncExternalStore (badge UI réactif). */
export function subscribeViewContext(cb: () => void): () => void {
    _subscribers.add(cb);
    return () => _subscribers.delete(cb);
}

/** Reset test-only. */
export function _resetViewContextForTests(): void {
    _current = null;
    _subscribers.clear();
}

/** [Finding panel #490 — ÉLEVÉ] Corrélation scope ↔ onglet, vérifiée AU POINT DE CONSOMMATION
 *  (prompt ET badge) : le cleanup du publisher est un useEffect DIFFÉRÉ après paint, alors que
 *  `activeTab` change en synchrone → fenêtre où le registre porte encore le détail de Budget
 *  pendant que l'utilisateur est déjà ailleurs. Sans ce check, le prompt dirait « tu es sur
 *  Accueil » avec les chiffres de Budget (contexte croisé — la garantie même de la feature).
 *  Toute page instrumentée (vague 2+) DOIT s'enregistrer ici. */
const SCOPE_TO_TAB: Record<string, Tab> = {
    budget: Tab.BUDGET,
};

/** L'entrée du registre correspond-elle à l'onglet ACTIF ? (mismatch = absence honnête). */
export function viewContextMatchesTab(entry: ViewContextEntry | null, activeTab: Tab): entry is ViewContextEntry {
    if (!entry) return false;
    return SCOPE_TO_TAB[entry.scope] === activeTab;
}

/** Montant pour le prompt : arrondi au dollar, JAMAIS un défaut plausible sur non-fini
 *  (classe AI-PROMPT-FAKE-ZERO — un « 0 $ » crédible est pire qu'une omission honnête). */
function promptAmount(v: number): string | null {
    return Number.isFinite(v) ? `${Math.round(v)} $` : null;
}

/**
 * Ligne « CONTEXTE ÉCRAN » injectée dans le system prompt de CHAQUE envoi (Tier 1 toujours +
 * Tier 2 si publié). Les textes UTILISATEUR (noms de catégories, filtre personne) passent par
 * sanitizePromptText ICI — au point de renvoi au modèle (classe USER_TEXT_KEYS) ; les libellés
 * code-auteur (onglets, phrases) restent intacts.
 */
export function describeViewContextForPrompt(activeTab: Tab): string {
    const tabLabel = TAB_LABELS[activeTab] ?? String(activeTab);
    const entry = viewContextMatchesTab(_current, activeTab) ? _current : null;
    if (!entry) {
        return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} ». Tu ne vois PAS le détail de cette page — si on te demande d'expliquer « ce qui est affiché », dis-le honnêtement et consulte tes outils pour répondre sur les données (sans prétendre voir l'écran). Ne mentionne JAMAIS spontanément que tu ne vois pas la page dans une réponse qui ne porte pas sur l'écran.`;
    }
    const d = entry.detail;
    const parts: string[] = [];
    const spent = promptAmount(d.totalSpent);
    const target = promptAmount(d.totalBudgetTarget);
    const income = promptAmount(d.totalRealIncome);
    if (spent) parts.push(`dépenses réelles ${spent}`);
    if (target) parts.push(`cible du budget ${target}`);
    if (income) parts.push(`revenus réels de la période ${income}`);
    // [Finding sécurité #490 — MOYEN] Les segments TEXTE UTILISATEUR (noms de catégories, filtre
    // personne) sont assainis PUIS encadrés <DONNEES> (balises code-auteur — l'utilisateur ne peut
    // pas les fermer, sanitizePromptText retire < et >) : cohérent avec la règle d'isolement
    // anti-injection du QUEBEC_FISCAL_CONTEXT, au lieu d'un texte libre « de confiance » en system.
    const top = d.topCategories
        .slice(0, 3)
        .map((c) => {
            const amt = promptAmount(c.spent);
            return amt ? `${sanitizePromptText(c.name)} ${amt}` : null;
        })
        .filter((x): x is string => x !== null);
    const filterNote = d.personFilterLabel
        ? ` Filtre actif : dépenses de <DONNEES>${sanitizePromptText(d.personFilterLabel)}</DONNEES> seulement.`
        : '';
    // Cartes additionnelles : chaque champ assaini (belt — une carte peut interpoler du texte
    // utilisateur), maxLen généreux pour ne pas tronquer les notes de provenance code-auteur.
    const cards = (d.cards ?? [])
        .slice(0, 8)
        .map((c) => `${sanitizePromptText(c.label, 120)} : ${sanitizePromptText(c.value, 120)}${c.note ? ` (${sanitizePromptText(c.note, 300)})` : ''}`);
    const cardsNote = cards.length > 0
        ? ` Autres cartes affichées sur la page — avec la PROVENANCE de chaque chiffre entre parenthèses (sers-t'en pour EXPLIQUER un chiffre demandé) : ${cards.join(' ; ')}.`
        : '';
    return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} » — période affichée : ${d.periodLabel} (vue ${d.timeViewLabel}).${filterNote} Chiffres AFFICHÉS À L'ÉCRAN (cite CEUX-CI pour toute question sur « ce qui est affiché » — pour un chiffre absent d'ici, consulte tes outils en le disant) : ${parts.join(', ')}.${top.length > 0 ? ` Top catégories dépensées : <DONNEES>${top.join(', ')}</DONNEES>.` : ''}${cardsNote} Si un outil rend un montant DIFFÉRENT pour un concept proche, ce ne sont PAS des contradictions : des PÉRIMÈTRES différents (période affichée vs agrégat mensuel standard) — cite le chiffre ÉCRAN pour « ce qui est affiché » et explique la différence de base si l'outil est aussi pertinent.`;
}
