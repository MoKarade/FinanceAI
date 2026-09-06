// services/aiChat/futureViewContext.ts
//
// [REFONTE-NAV-L6a] Builder PUR du contexte d'écran « Futur » pour l'assistant : il LIT la
// projection émise par le moteur (source unique `lastProjection.chartData` — ou son gel
// PROJECTION-PERSIST, ce que la courbe AFFICHE) et n'effectue AUCUN recalcul financier.
// Ne dérive que de la présentation : premier/dernier point, marqueurs déjà émis par le moteur
// (isRetired, fireNumber, jalon FIRE structurel `FireTarget`/`NetWorth`) et détection d'un creux
// (comparaisons, pas de $ inventé).
//
// ⚠️ No-fake-data : chaque champ numérique n'est posé QUE s'il est fini — jamais un défaut
// plausible (classe AI-PROMPT-FAKE-ZERO). Aucune projection → `hasProjection: false` (aveu
// honnête rendu par describeFutureDetail, zéro chiffre).

import type { ProjectionChartPoint, ProjectionResult } from '../projection/types';
import { findFireReachedPoint } from '../projection/fireMilestone';
import type { FutureViewDetail } from './viewContext';

/** Seuil de « creux détectable » : baisse pic→creux d'au moins 5 % du pic. En dessous, le bruit
 *  d'une courbe normale déclencherait la mention (et la chip « Pourquoi ça baisse ? ») à tort. */
const DIP_MIN_DROP = 0.05;

function finite(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Résumé de la courbe affichée. `results = null` (pas de projection calculée, courbe non révélée)
 * → détail « sans projection » ; le prompt l'avoue et n'émet AUCUN chiffre.
 * `selectedPoint` = dernier point sélectionné par l'utilisateur (modal détail ou infobulle figée).
 */
export function buildFutureViewDetail(
    results: Pick<ProjectionResult, 'chartData' | 'fireNumber' | 'strategyName'> | null | undefined,
    selectedPoint?: ProjectionChartPoint | null,
): FutureViewDetail {
    // monthIndex < 0 = passé RECONSTRUIT (préfixe A1/A3) — jamais dans le résumé « projeté ».
    const future = (results?.chartData ?? []).filter((p) => p.monthIndex >= 0);
    if (future.length === 0) return { kind: 'future', hasProjection: false };

    const d: FutureViewDetail = { kind: 'future', hasProjection: true };
    if (typeof results?.strategyName === 'string' && results.strategyName) d.strategyName = results.strategyName;

    const first = future[0];
    const last = future[future.length - 1];
    if (finite(first.NetWorth)) d.currentNetWorth = first.NetWorth;
    if (finite(last.NetWorth)) d.horizonNetWorth = last.NetWorth;
    if (finite(last.year)) d.horizonYear = last.year;
    if (finite(last.age)) d.horizonAge = last.age;

    // Marqueur retraite : PREMIER point isRetired (émis par le moteur — même règle que les
    // annotations PH4-FUT de la courbe).
    const ret = future.find((p) => p.isRetired);
    if (ret) {
        if (finite(ret.year)) d.retirementYear = ret.year;
        if (finite(ret.age)) d.retirementAge = ret.age;
    }

    // Objectif FIRE : fireNumber émis par le moteur (0 = non configuré → omis, pas un faux « 0 $ »).
    if (finite(results?.fireNumber) && results!.fireNumber! > 0) d.fireNumber = results!.fireNumber;
    // Année FIRE : jalon STRUCTUREL (`FireTarget` vs `NetWorth`, champs numériques du moteur —
    // cf services/projection/fireMilestone.ts), JAMAIS une regex sur `lifeEvents`. Ces libellés
    // mêlent messages moteur et TEXTE UTILISATEUR interpolé (nom d'enfant, nom d'immeuble) : un
    // immeuble « Fire pit reno » faisait affirmer au prompt « objectif FIRE atteint vers <année
    // fausse> » avec l'autorité d'un chiffre du moteur. La pastille de la courbe
    // (components/FutureProjection.tsx ~l.440) garde pour l'instant sa regex souple (visible à
    // l'œil, démentable) → ticket [FUTUR-FIRE-REGEX-SHARED] pour l'unifier.
    const firePoint = findFireReachedPoint(future);
    if (firePoint && finite(firePoint.year)) d.fireYear = firePoint.year;

    // Creux : plus grand drawdown pic→creux sur les NetWorth FINIS. dipYear = année du PIC (début
    // de la baisse — c'est là que l'utilisateur voit la courbe « commencer à descendre »).
    let peak = -Infinity;
    let peakYear: number | undefined;
    let bestDrop = 0;
    let bestPeakYear: number | undefined;
    for (const p of future) {
        const v = p.NetWorth;
        if (!finite(v)) continue;
        if (v >= peak) {
            peak = v;
            peakYear = finite(p.year) ? p.year : undefined;
        } else if (peak > 0) {
            const drop = (peak - v) / peak;
            if (drop > bestDrop) {
                bestDrop = drop;
                bestPeakYear = peakYear;
            }
        }
    }
    if (bestDrop >= DIP_MIN_DROP && bestPeakYear !== undefined) {
        d.dipYear = bestPeakYear;
        d.dipDropPct = Math.round(bestDrop * 100);
    }

    if (selectedPoint) {
        const label = selectedPoint.dateLabel
            ?? (finite(selectedPoint.year) ? String(selectedPoint.year) : null);
        if (label) {
            d.selectedLabel = label;
            if (finite(selectedPoint.NetWorth)) d.selectedNetWorth = selectedPoint.NetWorth;
        }
    }
    return d;
}

interface FutureChip {
    label: string;
    prompt: string;
}

/**
 * Chips de suggestion « ancrées sur la courbe » (2-4) — PRÉ-REMPLISSENT la saisie du chat (l'envoi
 * reste un geste de l'utilisateur). Aucune projection → AUCUNE chip (une suggestion sur une courbe
 * inexistante serait un faux affordance). Aucun montant $ dans les libellés (seulement des années).
 */
export function buildFutureChips(d: FutureViewDetail | null | undefined): FutureChip[] {
    if (!d || !d.hasProjection) return [];
    const chips: FutureChip[] = [{
        label: 'Explique ma courbe',
        prompt: "Explique mon patrimoine projeté : d'où part la courbe, où elle arrive à l'horizon, et quels flux la font monter ou descendre.",
    }];
    if (d.dipYear !== undefined) {
        chips.push({
            label: `Pourquoi ça baisse en ${d.dipYear} ?`,
            prompt: `Pourquoi ma courbe baisse à partir de ${d.dipYear} ? Détaille les retraits, dépenses et impôts qui expliquent cette baisse.`,
        });
    }
    if (d.retirementYear !== undefined) {
        chips.push({
            label: `Ma retraite (${d.retirementYear})`,
            prompt: `Que change ma retraite en ${d.retirementYear} sur ma courbe : revenus qui s'arrêtent, rentes, retraits des comptes ?`,
        });
    }
    chips.push(d.selectedLabel
        ? {
            label: 'Détaille ce point',
            prompt: `Détaille les calculs du point que j'ai sélectionné sur la courbe (${d.selectedLabel}) : revenus, dépenses, épargne et impôts à ce moment de la projection.`,
        }
        : {
            label: 'Calculs de ce mois',
            prompt: 'Détaille les calculs de ce mois dans ma projection : revenus, dépenses, épargne et impôts du mois courant.',
        });
    return chips.slice(0, 4);
}
