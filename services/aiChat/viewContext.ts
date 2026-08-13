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

/** [REFONTE-NAV-L6a] Détail publié par l'onglet Futur : résumé RÉEL de la courbe AFFICHÉE,
 *  dérivé de la source unique `lastProjection.chartData` (jamais recalculé côté UI — le builder
 *  `services/aiChat/futureViewContext.ts` ne fait que LIRE les champs émis par le moteur).
 *  ⚠️ No-fake-data : chaque champ numérique est OMIS s'il n'est pas fini (le prompt le DIT au
 *  lieu d'inventer) ; `hasProjection: false` = aucune courbe affichée → aveu honnête, zéro chiffre. */
export interface FutureViewDetail {
    kind: 'future';
    /** false = aucune projection calculée/affichée (le prompt le dit, AUCUN chiffre). */
    hasProjection: boolean;
    /** Nom de la stratégie affichée (code-auteur, émis par le moteur — assaini par ceinture). */
    strategyName?: string;
    /** Patrimoine net au 1er point PROJETÉ (monthIndex ≥ 0), $ CAD. Omis si non fini. */
    currentNetWorth?: number;
    /** Patrimoine net au dernier point de l'horizon. Omis si non fini. */
    horizonNetWorth?: number;
    horizonYear?: number;
    horizonAge?: number;
    /** Marqueur retraite = 1er point `isRetired` émis par le moteur (jamais déduit côté UI). */
    retirementYear?: number;
    retirementAge?: number;
    /** Objectif FIRE ($) émis par le moteur (`fireNumber`) + année du jalon FIRE STRUCTUREL
     *  (`FireTarget` atteint par `NetWorth` — jamais une regex sur un libellé, cf fireMilestone.ts). */
    fireNumber?: number;
    fireYear?: number;
    /** Plus forte baisse pic→creux détectée sur NetWorth : année du PIC (début de baisse) + ampleur %. */
    dipYear?: number;
    dipDropPct?: number;
    /** Dernier point sélectionné par l'utilisateur (modal détail / infobulle figée). */
    selectedLabel?: string;
    selectedNetWorth?: number;
}

/** Union à étendre page par page (vague 2+). */
export type ViewContextDetail = BudgetViewDetail | FutureViewDetail;

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
    // [REFONTE-NAV-L6a] Publié par FutureProjection — couvre l'onglet Futur ET le panneau de chat
    // ouvert PAR-DESSUS Futur (activeTab reste FUTURE dans les deux cas).
    future: Tab.FUTURE,
};

/** L'entrée du registre correspond-elle à l'onglet ACTIF ? (mismatch = absence honnête). */
export function viewContextMatchesTab(entry: ViewContextEntry | null, activeTab: Tab): entry is ViewContextEntry {
    if (!entry) return false;
    return SCOPE_TO_TAB[entry.scope] === activeTab;
}

/** Montant pour le prompt : arrondi au dollar, JAMAIS un défaut plausible sur non-fini
 *  (classe AI-PROMPT-FAKE-ZERO — un « 0 $ » crédible est pire qu'une omission honnête). */
function promptAmount(v: number | undefined): string | null {
    return v !== undefined && Number.isFinite(v) ? `${Math.round(v)} $` : null;
}

/** [REFONTE-NAV-L6a] Ligne de contexte de l'onglet Futur. Les chiffres viennent TOUS du moteur
 *  (source unique) ; un champ absent/non fini est OMIS et NOMMÉ comme indisponible — jamais
 *  remplacé par un défaut plausible (no-fake-data, y compris dans un prompt IA). */
function describeFutureDetail(d: FutureViewDetail, tabLabel: string): string {
    if (!d.hasProjection) {
        return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} », mais AUCUNE courbe de projection n'est affichée (projection pas encore calculée ou pas révélée). Si on t'interroge sur la courbe ou le patrimoine projeté, dis-le honnêtement : ne cite AUCUN chiffre de projection, n'en invente jamais, et invite à lancer le calcul depuis l'onglet Futur. Ne mentionne JAMAIS spontanément cette absence dans une réponse qui ne porte pas sur la projection.`;
    }
    const parts: string[] = [];
    const missing: string[] = [];
    const cur = promptAmount(d.currentNetWorth);
    if (cur) parts.push(`patrimoine net actuel (départ de la courbe) ${cur}`);
    else missing.push('patrimoine net actuel');
    const hor = promptAmount(d.horizonNetWorth);
    const horWhen = [
        d.horizonYear !== undefined ? String(d.horizonYear) : null,
        d.horizonAge !== undefined ? `${d.horizonAge} ans` : null,
    ].filter((x): x is string => x !== null).join(', ');
    if (hor) parts.push(`patrimoine net à l'horizon${horWhen ? ` (${horWhen})` : ''} ${hor}`);
    else missing.push(`patrimoine net à l'horizon${horWhen ? ` (${horWhen})` : ''}`);
    if (d.retirementYear !== undefined || d.retirementAge !== undefined) {
        const when = [
            d.retirementYear !== undefined ? `en ${d.retirementYear}` : null,
            d.retirementAge !== undefined ? `à ${d.retirementAge} ans` : null,
        ].filter((x): x is string => x !== null).join(' ');
        parts.push(`retraite marquée sur la courbe ${when}`);
    }
    const fire = promptAmount(d.fireNumber);
    if (fire) parts.push(`objectif FIRE ${fire}${d.fireYear !== undefined ? ` (atteint vers ${d.fireYear})` : ''}`);
    if (d.dipYear !== undefined) {
        parts.push(`la courbe marque une BAISSE${d.dipDropPct !== undefined ? ` d'environ ${d.dipDropPct} %` : ''} à partir de ${d.dipYear}`);
    }
    if (d.selectedLabel) {
        const selNw = promptAmount(d.selectedNetWorth);
        parts.push(`point SÉLECTIONNÉ par l'utilisateur : ${sanitizePromptText(d.selectedLabel)}${selNw ? ` (patrimoine net ${selNw})` : ' (patrimoine net indisponible — ne pas l\'inventer)'}`);
    }
    // [Finding panel #491 par analogie] Une valeur manquante est DITE, jamais devinée : le modèle
    // saurait sinon qu'il « devrait » y avoir un chiffre et serait tenté d'en fabriquer un.
    const missingNote = missing.length > 0
        ? ` Valeurs INDISPONIBLES (non calculées/non finies) — dis-le si on te les demande, ne les invente JAMAIS : ${missing.join(', ')}.`
        : '';
    const strat = d.strategyName ? ` (stratégie « ${sanitizePromptText(d.strategyName)} »)` : '';
    // Énumération VIDE possible (tous les champs non finis) : sans repli, la phrase se terminait par
    // « … est affichée : . » — une invitation à combler le blanc. Repli NOMMÉ (no-fake-data).
    const chiffres = parts.length > 0 ? parts.join(' ; ') : 'aucun chiffre disponible';
    return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} » — la courbe de projection du patrimoine est affichée${strat}. Chiffres AFFICHÉS, émis par le moteur de projection (source unique) : ${chiffres}.${missingNote} Cite CES chiffres pour toute question sur la courbe affichée ; ne recalcule JAMAIS une projection toi-même — pour le détail d'un calcul (flux d'un mois, impôts, retraits), consulte tes outils en le disant.`;
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
    // [REFONTE-NAV-L6a] Discrimination par `kind` — le bloc Budget ci-dessous reste inchangé.
    if (d.kind === 'future') return describeFutureDetail(d, tabLabel);
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
    // [Finding panel #491 — ÉLEVÉ] Troncature JAMAIS muette : sanitizePromptText coupe sans marqueur
    // (une valeur agrégée — ex. 3 postes en dépassement — pouvait être coupée EN PLEIN MONTANT et lue
    // par le modèle comme un chiffre complet). Marqueur honnête « (tronqué) » quand le cap est atteint.
    const sane = (text: string, max: number): string =>
        sanitizePromptText(text, max) + (text.length > max ? '… (tronqué)' : '');
    // Valeurs de cartes encadrées <DONNEES> au PROMPT-BUILD (finding ai-reviewer #491 : une carte
    // peut interpoler du texte utilisateur — noms de postes — et un framing posé dans la carte
    // serait détruit par le belt qui retire < et >). Labels/notes = code-auteur, non encadrés.
    const cards = (d.cards ?? [])
        .slice(0, 8)
        .map((c) => `${sane(c.label, 120)} : <DONNEES>${sane(c.value, 300)}</DONNEES>${c.note ? ` (${sane(c.note, 300)})` : ''}`);
    const cardsNote = cards.length > 0
        ? ` Autres cartes affichées sur la page — avec la PROVENANCE de chaque chiffre entre parenthèses (sers-t'en pour EXPLIQUER un chiffre demandé ; n'invente JAMAIS un détail de calcul au-delà de la note — si on te demande la formule exacte, dis que tu n'as que la provenance résumée, pas le détail du moteur) : ${cards.join(' ; ')}.`
        : '';
    return `CONTEXTE ÉCRAN : l'utilisateur est sur l'onglet « ${tabLabel} » — période affichée : ${d.periodLabel} (vue ${d.timeViewLabel}).${filterNote} Chiffres AFFICHÉS À L'ÉCRAN (cite CEUX-CI pour toute question sur « ce qui est affiché » — pour un chiffre absent d'ici, consulte tes outils en le disant) : ${parts.join(', ')}.${top.length > 0 ? ` Top catégories dépensées : <DONNEES>${top.join(', ')}</DONNEES>.` : ''}${cardsNote} Si un outil rend un montant DIFFÉRENT pour un concept proche, ce ne sont PAS des contradictions : des PÉRIMÈTRES différents (période affichée vs agrégat mensuel standard) — cite le chiffre ÉCRAN pour « ce qui est affiché » et explique la différence de base si l'outil est aussi pertinent.`;
}
