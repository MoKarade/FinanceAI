// services/projection/milestoneIcons.ts
// [FUTUR-ICONS-RICH] Couche « jalons » : dérive des icônes d'événements des CHAMPS numériques déjà émis par
// le moteur dans `chartData` (RRQ, PSV, retraits REER/CELI, revenu locatif, règlement d'impôt). PRÉSENTATION
// PURE — AUCUN nouveau calcul $ : uniquement des détections de PREMIÈRE OCCURRENCE / seuil sur des valeurs
// déjà validées par le moteur (règle « Future = source unique », leçon R2-FIRE « ne pas recomputer »).
//
// ⚠️ Ne dérive JAMAIS « retraite » ni « FIRE » : le moteur les émet DÉJÀ en `lifeEvents` (`📍 Début Retraite`,
// `Objectif FIRE Atteint 🔥`) → les dériver ici doublonnerait. Anti-doublon STRUCTUREL (pas de string-matching) :
// ces concepts ne sont simplement pas dans la liste de détections ci-dessous.
//
// `val` = coordonnée Y de la pastille = `NetWorth` du mois → les jalons se posent SUR la courbe (visibles),
// comme les événements de vie du moteur. Le clic ouvre le point `chartData` complet (via `monthIndex`).

import type { ProjectionChartPoint } from './types';

export interface DerivedMilestone {
    monthIndex: number;
    year: number | undefined;
    age: number | undefined;
    dateLabel: string | undefined;
    val: number | undefined;
    netWorth: number | undefined;
    label: string;
    kind: 'life' | 'flow';
    color?: string;
}

// Seuil « affichable » du règlement d'impôt — même magnitude que le seuil du tooltip (`ExpertTooltip`),
// évite une pastille sur un arrondi de fin de calcul (fluxImpots est réglé 1×/an en avril, pas mensuel).
const TAX_EPS = 0.5;

/**
 * Dérive les icônes-jalons à partir des champs de `chartData`. Détections one-time (1re occurrence) pour
 * RRQ/PSV/retraits/locatif ; récurrente (~1×/an) pour le règlement d'impôt. Le passé reconstruit
 * (`monthIndex < 0`) est ignoré (pas de jalon sur l'historique).
 */
export function deriveMilestoneIcons(
    chartData: ReadonlyArray<ProjectionChartPoint>,
): { lifeMilestones: DerivedMilestone[]; flowMilestones: DerivedMilestone[] } {
    const lifeMilestones: DerivedMilestone[] = [];
    const flowMilestones: DerivedMilestone[] = [];
    if (!chartData || chartData.length === 0) return { lifeMilestones, flowMilestones };

    // Un locatif DÉJÀ actif au départ (mois 0) n'est pas un « début » → pas de jalon (finding architect MOYEN).
    const firstFuture = chartData.find((d) => d.monthIndex >= 0);
    const rentalActiveAtStart = (firstFuture?.RentalIncome ?? 0) > 0;

    let rrqDone = false, psvDone = false, reerDone = false, celiDone = false, rentalDone = false;
    for (const d of chartData) {
        if (d.monthIndex < 0) continue; // pas de jalon sur le passé reconstruit
        const meta = { monthIndex: d.monthIndex, year: d.year, age: d.age, dateLabel: d.dateLabel, val: d.NetWorth, netWorth: d.NetWorth };
        if (!rrqDone && (d.pensionRRQ ?? 0) > 0) { rrqDone = true; lifeMilestones.push({ ...meta, label: '🏛️ Début RRQ', kind: 'life' }); }
        if (!psvDone && (d.pensionPSV ?? 0) > 0) { psvDone = true; lifeMilestones.push({ ...meta, label: '🏛️ Début PSV', kind: 'life' }); }
        if (!reerDone && (d.RetraitREER ?? 0) > 0) { reerDone = true; lifeMilestones.push({ ...meta, label: '📤 1er retrait REER', kind: 'life' }); }
        if (!celiDone && (d.RetraitCELI ?? 0) > 0) { celiDone = true; lifeMilestones.push({ ...meta, label: '📤 1er retrait CELI', kind: 'life' }); }
        if (!rentalDone && !rentalActiveAtStart && (d.RentalIncome ?? 0) > 0) { rentalDone = true; lifeMilestones.push({ ...meta, label: '🏠 Début revenu locatif', kind: 'life' }); }
        if (Math.abs(d.FluxImpots ?? 0) > TAX_EPS) { flowMilestones.push({ ...meta, label: '💸 Règlement d\'impôt', kind: 'flow' }); }
    }
    return { lifeMilestones, flowMilestones };
}
