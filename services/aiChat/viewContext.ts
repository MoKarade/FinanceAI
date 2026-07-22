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
        try { cb(); } catch { /* un subscriber cassé ne bloque pas les autres */ }
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
    const entry = _current;
    if (!entry) {
        return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} ». Tu ne vois PAS le détail de cette page — si on te demande d'expliquer « ce qui est affiché », dis-le honnêtement et consulte tes outils pour répondre sur les données (sans prétendre voir l'écran).`;
    }
    const d = entry.detail;
    const parts: string[] = [];
    const spent = promptAmount(d.totalSpent);
    const target = promptAmount(d.totalBudgetTarget);
    const income = promptAmount(d.totalRealIncome);
    if (spent) parts.push(`dépenses réelles ${spent}`);
    if (target) parts.push(`cible du budget ${target}`);
    if (income) parts.push(`revenus réels de la période ${income}`);
    const top = d.topCategories
        .slice(0, 3)
        .map((c) => {
            const amt = promptAmount(c.spent);
            return amt ? `${sanitizePromptText(c.name)} ${amt}` : null;
        })
        .filter((x): x is string => x !== null);
    const filterNote = d.personFilterLabel
        ? ` Filtre actif : dépenses de ${sanitizePromptText(d.personFilterLabel)} seulement.`
        : '';
    return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} » — période affichée : ${d.periodLabel} (vue ${d.timeViewLabel}).${filterNote} Chiffres AFFICHÉS À L'ÉCRAN (cite CEUX-CI pour toute question sur « ce qui est affiché » — pour un chiffre absent d'ici, consulte tes outils en le disant) : ${parts.join(', ')}.${top.length > 0 ? ` Top catégories dépensées : ${top.join(', ')}.` : ''}`;
}
