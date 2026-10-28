// tests/services/aiChatFutureViewContext.test.ts
//
// [REFONTE-NAV-L6a] Contexte d'écran « Futur » de l'assistant : le builder LIT la projection du
// moteur (source unique) sans rien recalculer, omet tout champ non fini (AI-PROMPT-FAKE-ZERO),
// ignore le passé reconstruit (monthIndex < 0), et la ligne de prompt avoue HONNÊTEMENT l'absence
// de projection (zéro chiffre). Chips : ancrées sur la courbe, AUCUNE sans projection.

import { formatCAD } from '../../utils/format';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildFutureViewDetail, buildFutureChips } from '../../services/aiChat/futureViewContext';
import {
    publishViewContext, describeViewContextForPrompt, viewContextMatchesTab, getViewContext,
    _resetViewContextForTests, type FutureViewDetail,
} from '../../services/aiChat/viewContext';
import type { ProjectionChartPoint } from '../../services/projection/types';
import { FIRE_LIFE_EVENT } from '../../services/projection/fireMilestone';
import { Tab } from '../../types';

const pt = (monthIndex: number, NetWorth: number, year: number, over: Partial<ProjectionChartPoint> = {}): ProjectionChartPoint =>
    ({ monthIndex, NetWorth, year, ...over } as ProjectionChartPoint);

/** Ligne de prompt effectivement envoyée au modèle pour un détail Futur donné. */
const describeFutureLine = (d: FutureViewDetail): string => {
    publishViewContext('future', d);
    return describeViewContextForPrompt(Tab.FUTURE);
};

/** Courbe type : départ 100 k$ (2026), pic 500 k$ (2040, FIRE), retraite 2043 avec baisse à 420 k$,
 *  horizon 450 k$ (2065, 74 ans). Préfixe PASSÉ (monthIndex < 0) présent pour prouver l'exclusion.
 *  `FireTarget` = cible du mois émise par le moteur : c'est ELLE (croisée par NetWorth) qui porte le
 *  jalon FIRE, pas le libellé `lifeEvents` (gardé ici tel que le moteur l'émet, pour prouver qu'il
 *  n'est PLUS ce qui déclenche l'année). */
const results = () => ({
    strategyName: 'Équilibrée',
    fireNumber: 480_000,
    chartData: [
        pt(-12, 50_000, 2025, { FireTarget: 480_000 }),
        pt(0, 100_000, 2026, { age: 35, FireTarget: 480_000 }),
        pt(12, 200_000, 2027, { age: 36, FireTarget: 480_000 }),
        pt(168, 500_000, 2040, { age: 49, FireTarget: 480_000, lifeEvents: [FIRE_LIFE_EVENT] }),
        pt(204, 420_000, 2043, { age: 52, FireTarget: 480_000, isRetired: true }),
        pt(468, 450_000, 2065, { age: 74, FireTarget: 480_000, isRetired: true }),
    ],
});

beforeEach(() => _resetViewContextForTests());

describe('buildFutureViewDetail', () => {
    it('sans projection (null / chartData vide) → hasProjection false, AUCUN champ numérique', () => {
        for (const d of [buildFutureViewDetail(null), buildFutureViewDetail({ chartData: [] })]) {
            expect(d).toEqual({ kind: 'future', hasProjection: false });
        }
    });

    it('résumé = LECTURE du moteur : départ/horizon, marqueur retraite (isRetired), FIRE (fireNumber + lifeEvent)', () => {
        const d = buildFutureViewDetail(results());
        expect(d.hasProjection).toBe(true);
        expect(d.currentNetWorth).toBe(100_000); // 1er point PROJETÉ — pas le préfixe passé (50 k$)
        expect(d.horizonNetWorth).toBe(450_000);
        expect(d.horizonYear).toBe(2065);
        expect(d.horizonAge).toBe(74);
        expect(d.retirementYear).toBe(2043); // PREMIER point isRetired, émis par le moteur
        expect(d.retirementAge).toBe(52);
        expect(d.fireNumber).toBe(480_000);
        expect(d.fireYear).toBe(2040); // 1er mois où NetWorth croise FireTarget (champs du moteur)
        expect(d.strategyName).toBe('Équilibrée');
    });

    it('creux DÉTECTABLE : plus grand drawdown pic→creux → année du PIC + ampleur arrondie', () => {
        const d = buildFutureViewDetail(results());
        expect(d.dipYear).toBe(2040); // la courbe « commence à descendre » au pic
        expect(d.dipDropPct).toBe(16); // (500k − 420k) / 500k
    });

    it('courbe monotone croissante → PAS de creux fabriqué (dipYear absent)', () => {
        const d = buildFutureViewDetail({ chartData: [pt(0, 100, 2026), pt(12, 200, 2027), pt(24, 300, 2028)] });
        expect(d.dipYear).toBeUndefined();
        expect(d.dipDropPct).toBeUndefined();
    });

    it('NetWorth NON FINI → champ OMIS, jamais un défaut plausible (no-fake-data)', () => {
        const r = results();
        r.chartData[1] = pt(0, NaN, 2026, { age: 35 }); // départ non fini
        const d = buildFutureViewDetail(r);
        expect(d.currentNetWorth).toBeUndefined();
        expect(d.horizonNetWorth).toBe(450_000); // les champs valides restent
    });

    // [FUTUR-FIRE-STRUCT] Le jalon FIRE vient de champs NUMÉRIQUES (FireTarget/NetWorth), jamais
    // d'une regex sur `lifeEvents` : ces libellés contiennent du TEXTE UTILISATEUR interpolé (nom
    // d'immeuble via realEstateMonth.ts, nom d'enfant via childrenReee.ts). Avant le fix, /\bfire\b/i
    // matchait « Fire pit reno » et le prompt affirmait « objectif FIRE atteint vers 2027 ».
    it('lifeEvent portant un NOM D\'UTILISATEUR contenant « fire » → AUCUNE année FIRE fabriquée', () => {
        const r = results();
        r.chartData = [
            pt(0, 100_000, 2026, { age: 35, FireTarget: 480_000 }),
            pt(12, 200_000, 2027, { age: 36, FireTarget: 480_000, lifeEvents: ['🏠 Achat immobilier : Fire pit reno'] }),
            pt(24, 300_000, 2028, { age: 37, FireTarget: 480_000 }),
        ];
        const d = buildFutureViewDetail(r);
        expect(d.fireYear).toBeUndefined(); // la cible n'est JAMAIS croisée sur cette courbe
        expect(describeFutureLine(d)).not.toContain('atteint vers');
    });

    it('libellé FIRE du moteur SANS croisement de la cible → pas d\'année (le fait vient des chiffres)', () => {
        const r = results();
        r.chartData = [
            pt(0, 100_000, 2026, { age: 35, FireTarget: 480_000 }),
            pt(12, 200_000, 2027, { age: 36, FireTarget: 480_000, lifeEvents: [FIRE_LIFE_EVENT] }),
        ];
        expect(buildFutureViewDetail(r).fireYear).toBeUndefined();
    });

    it('cible FIRE croisée SANS lifeEvent (blob figé, libellés absents) → année quand même émise', () => {
        const r = results();
        r.chartData = [
            pt(0, 100_000, 2026, { age: 35, FireTarget: 480_000 }),
            pt(12, 500_000, 2031, { age: 40, FireTarget: 480_000 }),
        ];
        expect(buildFutureViewDetail(r).fireYear).toBe(2031);
    });

    it('cible FIRE à 0 (objectif non configuré) → aucun jalon, même si NetWorth ≥ 0', () => {
        const r = results();
        r.chartData = [pt(0, 100_000, 2026, { age: 35, FireTarget: 0 }), pt(12, 200_000, 2027, { age: 36, FireTarget: 0 })];
        expect(buildFutureViewDetail(r).fireYear).toBeUndefined();
    });

    it('fireNumber 0 (non configuré) → omis (pas un faux « objectif 0 $ »)', () => {
        const d = buildFutureViewDetail({ ...results(), fireNumber: 0 });
        expect(d.fireNumber).toBeUndefined();
    });

    it('point sélectionné → libellé + patrimoine net ; NetWorth non fini → montant OMIS mais libellé gardé', () => {
        const sel = pt(168, 500_000, 2040, { dateLabel: 'mars 2040' });
        const d = buildFutureViewDetail(results(), sel);
        expect(d.selectedLabel).toBe('mars 2040');
        expect(d.selectedNetWorth).toBe(500_000);
        const dBad = buildFutureViewDetail(results(), pt(168, NaN, 2040, { dateLabel: 'mars 2040' }));
        expect(dBad.selectedLabel).toBe('mars 2040');
        expect(dBad.selectedNetWorth).toBeUndefined();
    });
});

describe('describeViewContextForPrompt — scope future', () => {
    it('détail publié + onglet FUTUR → chiffres du moteur dans la ligne, consigne « ne recalcule jamais »', () => {
        publishViewContext('future', buildFutureViewDetail(results(), pt(168, 500_000, 2040, { dateLabel: 'mars 2040' })));
        const line = describeViewContextForPrompt(Tab.FUTURE);
        expect(line).toContain('« Futur »');
        expect(line).toContain(`patrimoine net actuel (départ de la courbe) ${formatCAD(100000)}`);
        expect(line).toContain(`patrimoine net à l'horizon (2065, 74 ans) ${formatCAD(450000)}`);
        expect(line).toContain('retraite marquée sur la courbe en 2043 à 52 ans');
        expect(line).toContain(`objectif FIRE ${formatCAD(480000)} (atteint vers 2040)`);
        expect(line).toContain('BAISSE d\'environ 16 % à partir de 2040');
        expect(line).toContain(`point SÉLECTIONNÉ par l'utilisateur : mars 2040 (patrimoine net ${formatCAD(500000)})`);
        expect(line).toContain('stratégie « Équilibrée »');
        expect(line).toContain('ne recalcule JAMAIS'); // source unique : l'assistant CONSOMME le moteur
    });

    it('SANS projection → aveu honnête, AUCUN chiffre dans la ligne (pas même un zéro)', () => {
        publishViewContext('future', buildFutureViewDetail(null));
        const line = describeViewContextForPrompt(Tab.FUTURE);
        expect(line).toContain('« Futur »');
        expect(line).toContain('AUCUNE courbe de projection');
        expect(line).not.toMatch(/\d/); // garde AI-PROMPT-FAKE-ZERO : zéro chiffre fabriqué
    });

    it('champ non fini → composante ABSENTE et NOMMÉE indisponible (jamais devinée)', () => {
        const r = results();
        r.chartData[1] = pt(0, NaN, 2026, { age: 35 });
        publishViewContext('future', buildFutureViewDetail(r));
        const line = describeViewContextForPrompt(Tab.FUTURE);
        expect(line).not.toContain('départ de la courbe) NaN');
        expect(line).toContain('Valeurs INDISPONIBLES');
        expect(line).toContain('ne les invente JAMAIS');
        expect(line).toContain(`patrimoine net à l'horizon (2065, 74 ans) ${formatCAD(450000)}`); // le valide reste
    });

    it('AUCUN champ fini (courbe présente mais valeurs non calculées) → repli NOMMÉ, pas une énumération vide', () => {
        // Avant le fix, la phrase se terminait par « … source unique) : . » — un blanc que le modèle
        // est tenté de combler. Le repli le DIT, et la note « valeurs indisponibles » reste.
        const line = describeFutureLine(buildFutureViewDetail({ chartData: [pt(0, NaN, NaN)] }));
        expect(line).toContain('aucun chiffre disponible');
        expect(line).not.toContain('source unique) : .');
        expect(line).toContain('Valeurs INDISPONIBLES');
    });

    it('[Finding #490 par analogie] scope future ≠ onglet actif → détail IGNORÉ (repli honnête)', () => {
        publishViewContext('future', buildFutureViewDetail(results()));
        const line = describeViewContextForPrompt(Tab.BUDGET);
        expect(line).toContain('« Budget »');
        expect(line).not.toContain('patrimoine net');
        expect(viewContextMatchesTab(getViewContext(), Tab.FUTURE)).toBe(true);
        expect(viewContextMatchesTab(getViewContext(), Tab.BUDGET)).toBe(false);
    });
});

describe('buildFutureChips', () => {
    it('sans projection → AUCUNE chip (pas de fausse affordance)', () => {
        expect(buildFutureChips(buildFutureViewDetail(null))).toEqual([]);
        expect(buildFutureChips(null)).toEqual([]);
    });

    it('projection complète → 4 chips max : explication, creux à [année], retraite, détail du point sélectionné', () => {
        const chips = buildFutureChips(buildFutureViewDetail(results(), pt(168, 500_000, 2040, { dateLabel: 'mars 2040' })));
        expect(chips).toHaveLength(4);
        expect(chips[0].label).toBe('Explique ma courbe');
        expect(chips[1].label).toBe('Pourquoi ça baisse en 2040 ?');
        expect(chips[1].prompt).toContain('baisse à partir de 2040');
        expect(chips[2].label).toBe('Ma retraite (2043)');
        expect(chips[3].label).toBe('Détaille ce point');
        expect(chips[3].prompt).toContain('mars 2040');
    });

    it('sans creux ni retraite ni sélection → chips génériques seulement (2), dont « calculs de ce mois »', () => {
        const chips = buildFutureChips(buildFutureViewDetail({ chartData: [pt(0, 100, 2026), pt(12, 200, 2027)] }));
        expect(chips.map((c) => c.label)).toEqual(['Explique ma courbe', 'Calculs de ce mois']);
        expect(chips[1].prompt).toContain('Détaille les calculs de ce mois');
    });

    it('les libellés de chips ne portent JAMAIS de montant $ (sobriété — seulement des années)', () => {
        const chips = buildFutureChips(buildFutureViewDetail(results(), pt(168, 500_000, 2040, { dateLabel: 'mars 2040' })));
        for (const c of chips) expect(c.label).not.toMatch(/\$/);
    });
});
