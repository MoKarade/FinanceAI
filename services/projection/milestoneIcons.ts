// services/projection/milestoneIcons.ts
// [FUTUR-ICONS-RICH] Couche « jalons » : dérive des icônes d'événements des CHAMPS numériques déjà émis par
// le moteur dans `chartData` (début RRQ, PSV, 1er retrait REER/CELI, début revenu locatif). PRÉSENTATION
// PURE — AUCUN nouveau calcul $ : uniquement des détections de PREMIÈRE OCCURRENCE (règle « Future = source
// unique », leçon R2-FIRE « ne pas recomputer »).
//
// ⚠️ Ne dérive JAMAIS un concept que le moteur ÉMET DÉJÀ en `lifeEvents`/`flowEvents` (anti-doublon STRUCTUREL,
// pas de string-matching) :
//   • retraite (`📍 Début Retraite`) et FIRE (`Objectif FIRE Atteint 🔥`) → lifeEvents moteur ;
//   • règlement d'IMPÔT → le moteur émet DÉJÀ `💸 Remboursement d'impôt: +X$` / `🏛️ Fisc: Régularisation…`
//     en avril (taxApril.ts) — visibles depuis le retrait du gate flowEvents → un jalon impôt ici DOUBLONNERAIT
//     (finding silent-failure : 17/17 mois d'impôt ont déjà un flowEvent moteur au même mois). NE PAS l'ajouter.
//
// `val` = coordonnée Y de la pastille = `NetWorth` du mois → les jalons se posent SUR la courbe (visibles),
// comme les événements de vie du moteur. Le clic ouvre le point `chartData` complet (via `monthIndex`).

import type { ProjectionChartPoint } from './types';

interface DerivedMilestone {
    monthIndex: number;
    year: number | undefined;
    age: number | undefined;
    dateLabel: string | undefined;
    val: number | undefined;
    netWorth: number | undefined;
    label: string;
    kind: 'life';
}

const positive = (v: number | undefined): boolean => (v ?? 0) > 0;

/**
 * Jalons dérivés (1re occurrence) des champs de `chartData`. ⚠️ Un flux DÉJÀ actif au mois 0 (`…ActiveAtStart`)
 * n'émet PAS de jalon « début/1er » (sinon un déjà-retraité verrait « 1er retrait REER » au mois 0 — finding
 * silent-failure, symétrique du garde locatif). Le passé reconstruit (`monthIndex < 0`) est ignoré.
 */
export function deriveMilestoneIcons(chartData: ReadonlyArray<ProjectionChartPoint>): DerivedMilestone[] {
    const out: DerivedMilestone[] = [];
    if (!chartData || chartData.length === 0) return out;

    const firstFuture = chartData.find((d) => d.monthIndex >= 0);
    // Un flux déjà actif au départ n'est pas un « début » → on initialise le flag à `done` (jamais émis).
    let rrqDone = positive(firstFuture?.pensionRRQ);
    let psvDone = positive(firstFuture?.pensionPSV);
    let reerDone = positive(firstFuture?.RetraitREER);
    let celiDone = positive(firstFuture?.RetraitCELI);
    let rentalDone = positive(firstFuture?.RentalIncome);

    for (const d of chartData) {
        if (d.monthIndex < 0) continue; // pas de jalon sur le passé reconstruit
        const meta = { monthIndex: d.monthIndex, year: d.year, age: d.age, dateLabel: d.dateLabel, val: d.NetWorth, netWorth: d.NetWorth, kind: 'life' as const };
        if (!rrqDone && positive(d.pensionRRQ)) { rrqDone = true; out.push({ ...meta, label: '🏛️ Début RRQ' }); }
        if (!psvDone && positive(d.pensionPSV)) { psvDone = true; out.push({ ...meta, label: '🏛️ Début PSV' }); }
        if (!reerDone && positive(d.RetraitREER)) { reerDone = true; out.push({ ...meta, label: '📤 1er retrait REER' }); }
        if (!celiDone && positive(d.RetraitCELI)) { celiDone = true; out.push({ ...meta, label: '📤 1er retrait CELI' }); }
        if (!rentalDone && positive(d.RentalIncome)) { rentalDone = true; out.push({ ...meta, label: '🏠 Début revenu locatif' }); }
    }
    return out;
}
