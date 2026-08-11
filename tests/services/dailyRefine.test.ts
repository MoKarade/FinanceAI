/**
 * [FUTUR-DAILY] Le raffinement quotidien d'une fenêtre de la courbe.
 *
 * Le test central n'est pas « ça produit 30 points » — c'est l'INVARIANT DE RACCORD : la série
 * quotidienne doit passer EXACTEMENT par les points mensuels du moteur. Sans lui, l'app afficherait
 * deux vérités pour le même mois selon le niveau de zoom.
 */
import { describe, it, expect } from 'vitest';
import {
    axisXAtDay,
    refineMonthToDaily,
    refineWindowToDaily,
    finiteAnchorRun,
    daysInMonth,
    daySpan,
    calendarFromMonthIndex,
    isoDate,
    todayIsoLocal,
    type MonthlyAnchor,
} from '../../services/projection/dailyRefine';

describe('[FUTUR-DAILY] daysInMonth', () => {
    it('connaît les mois courts et les années bissextiles', () => {
        expect(daysInMonth(2026, 0)).toBe(31);  // janvier
        expect(daysInMonth(2026, 3)).toBe(30);  // avril
        expect(daysInMonth(2026, 1)).toBe(28);  // février 2026
        expect(daysInMonth(2028, 1)).toBe(29);  // février 2028, bissextile
    });
});

describe('[FUTUR-DAILY] refineMonthToDaily — l’INVARIANT de raccord', () => {
    it('le dernier jour vaut EXACTEMENT la valeur mensuelle du moteur', () => {
        // C'est LA garantie : zoomer ne doit jamais changer le chiffre de fin de mois.
        const pts = refineMonthToDaily(10_000, 10_500, 2026, 0, 0);
        expect(pts).toHaveLength(31);
        expect(pts[30].value).toBe(10_500);
    });

    it('tient l’invariant MÊME avec des mouvements datés qui dépassent la croissance', () => {
        // Résidu NÉGATIF (les dépenses datées excèdent l'écart mensuel) : le raccord doit tenir
        // quand même, sinon un mois déficitaire ferait diverger la courbe zoomée.
        const pts = refineMonthToDaily(10_000, 9_000, 2026, 3, 5, [
            { day: 1, amount: -1_600, label: 'Loyer' },
            { day: 15, amount: 2_400, label: 'Paie' },
        ]);
        expect(pts[pts.length - 1].value).toBe(9_000);
    });

    it('un mouvement daté produit une MARCHE au bon jour', () => {
        // Sans mouvement daté, la progression serait strictement uniforme. Le loyer doit creuser un
        // décrochage visible ce jour-là — c'est toute la valeur du zoom.
        //
        // ⚠️ La marche N'EST PAS de −500 $ : le jour porte AUSSI sa part de résidu (ici +500/31,
        // puisque le mois finit à son niveau de départ malgré le loyer). Mon premier jet l'avait
        // oublié et attendait −500 — l'assertion honnête compare un jour DATÉ à un jour ORDINAIRE,
        // et l'écart entre les deux vaut exactement le mouvement daté.
        const pts = refineMonthToDaily(10_000, 10_000, 2026, 0, 0, [{ day: 10, amount: -500, label: 'Loyer' }]);
        const deltaOrdinaire = pts[8].value - pts[7].value;   // jour 9 vs jour 8 : que du résidu
        const deltaJourJ = pts[9].value - pts[8].value;       // jour 10 : résidu + loyer
        expect(deltaJourJ - deltaOrdinaire).toBeCloseTo(-500, 6);
        expect(pts[9].isDated).toBe(true);
        expect(pts[9].labels).toEqual(['Loyer']);
        expect(pts[8].isDated).toBe(false);
    });

    it('distingue MESURÉ et INTERPOLÉ — un jour sans date ne se fait pas passer pour une mesure', () => {
        const pts = refineMonthToDaily(0, 300, 2026, 0, 0, [{ day: 5, amount: 100, label: 'Paie' }]);
        expect(pts.filter((p) => p.isDated).map((p) => p.dayOfMonth)).toEqual([5]);
        expect(pts.every((p) => p.isDated)).toBe(false);
    });

    it('CLAMPE un jour hors du mois au lieu de le faire disparaître', () => {
        // Un abonnement au « 31 » est bien débité en avril, le 30. L'ignorer perdrait une dépense
        // RÉELLE — direction de risque inacceptable pour un solde.
        const pts = refineMonthToDaily(1_000, 1_000, 2026, 3, 0, [{ day: 31, amount: -50, label: 'Abo' }]);
        expect(pts).toHaveLength(30);
        expect(pts[29].isDated).toBe(true);
        expect(pts[29].labels).toEqual(['Abo']);
    });

    it('cumule plusieurs mouvements tombant le MÊME jour', () => {
        const pts = refineMonthToDaily(0, 0, 2026, 0, 0, [
            { day: 1, amount: -1_600, label: 'Loyer' },
            { day: 1, amount: -20, label: 'Netflix' },
        ]);
        expect(pts[0].labels).toEqual(['Loyer', 'Netflix']);
    });

    it('une valeur NON FINIE rend [] — jamais une série de zéros crédibles', () => {
        expect(refineMonthToDaily(Number.NaN, 1_000, 2026, 0, 0)).toEqual([]);
        expect(refineMonthToDaily(1_000, Number.POSITIVE_INFINITY, 2026, 0, 0)).toEqual([]);
    });

    it('IGNORE un mouvement au montant non fini sans corrompre le reste du mois', () => {
        const pts = refineMonthToDaily(0, 100, 2026, 0, 0, [{ day: 5, amount: Number.NaN }]);
        expect(pts[30].value).toBe(100);
        expect(pts.every((p) => Number.isFinite(p.value))).toBe(true);
    });

    it('la date est une VRAIE date ISO, et monthIndex reste un ENTIER', () => {
        // `monthIndex` est la clé d'axe du graphe, du tableau et des icônes-jalons : y glisser des
        // décimales désalignerait les jalons en silence. La granularité vit dans `date`, pas là.
        const pts = refineMonthToDaily(0, 0, 2026, 6, 12);
        expect(pts[0].date).toBe('2026-07-01');
        expect(pts[30].date).toBe('2026-07-31');
        expect(pts.every((p) => Number.isInteger(p.monthIndex))).toBe(true);
    });
});

describe('[FUTUR-DAILY] refineWindowToDaily', () => {
    const anchor = (monthIndex: number, year: number, month: number, value: number): MonthlyAnchor =>
        ({ monthIndex, year, month, value });

    it('chaque fin de mois retombe sur SON point moteur — sur toute la fenêtre', () => {
        // L'invariant doit tenir mois après mois, pas seulement sur le premier : une dérive
        // cumulative ne se verrait qu'au bout de plusieurs mois de zoom.
        const anchors = [
            anchor(0, 2026, 0, 10_000),
            anchor(1, 2026, 1, 10_400),
            anchor(2, 2026, 2, 11_100),
            anchor(3, 2026, 3, 10_900),
        ];
        const pts = refineWindowToDaily(anchors);
        expect(pts).toHaveLength(28 + 31 + 30);

        for (const a of anchors.slice(1)) {
            const last = pts.filter((p) => p.monthIndex === a.monthIndex).at(-1);
            expect(last?.value, `fin du mois ${a.monthIndex}`).toBe(a.value);
        }
    });

    it('le premier ancrage sert d’ENTRÉE et n’est pas rendu — on n’invente pas le mois d’avant', () => {
        const pts = refineWindowToDaily([anchor(5, 2026, 5, 100), anchor(6, 2026, 6, 200)]);
        expect(pts.every((p) => p.monthIndex === 6)).toBe(true);
    });

    it('moins de 2 ancrages → [] (rien à raffiner, pas une série vide déguisée)', () => {
        expect(refineWindowToDaily([])).toEqual([]);
        expect(refineWindowToDaily([anchor(0, 2026, 0, 1)])).toEqual([]);
    });

    it('les mouvements datés sont fournis PAR L’APPELANT — le module reste pur', () => {
        const pts = refineWindowToDaily(
            [anchor(0, 2026, 0, 0), anchor(1, 2026, 1, 0)],
            (a) => (a.monthIndex === 1 ? [{ day: 3, amount: -100, label: 'Loyer' }] : []),
        );
        expect(pts.filter((p) => p.isDated).map((p) => p.date)).toEqual(['2026-02-03']);
    });
});

describe('[FUTUR-DAILY] calendarFromMonthIndex', () => {
    it('avance correctement dans le futur', () => {
        expect(calendarFromMonthIndex(2026, 0, 0)).toEqual({ year: 2026, month: 0 });
        expect(calendarFromMonthIndex(2026, 6, 6)).toEqual({ year: 2027, month: 0 });
    });

    it('DISCRIMINANT — recule correctement dans le PASSÉ (monthIndex négatif)', () => {
        // Le `%` de JS garde le signe du dividende : un modulo NU rendrait un mois négatif, en
        // silence. C'est le double modulo qui corrige — et c'est exactement le genre d'erreur qu'un
        // graphe n'affiche pas, il déplace juste les points.
        expect(calendarFromMonthIndex(2026, 2, -5)).toEqual({ year: 2025, month: 9 });   // mars −5 → octobre 2025
        expect(calendarFromMonthIndex(2026, 11, -11)).toEqual({ year: 2026, month: 0 }); // déc. −11 → janvier MÊME année
        expect(calendarFromMonthIndex(2026, 0, -1)).toEqual({ year: 2025, month: 11 });  // janvier −1 → décembre 2025
    });

    it('tout mois rendu est dans [0, 11] — jamais un mois négatif', () => {
        for (let mi = -40; mi <= 40; mi++) {
            const { month } = calendarFromMonthIndex(2026, 5, mi);
            expect(month, `monthIndex ${mi}`).toBeGreaterThanOrEqual(0);
            expect(month, `monthIndex ${mi}`).toBeLessThanOrEqual(11);
        }
    });
});

describe('[FUTUR-DAILY] todayIsoLocal — le bug de FUSEAU qui a échappé à la CI', () => {
    it('DISCRIMINANT — rend le jour LOCAL, pas le jour UTC', () => {
        // ⚠️ Le premier jet combinait une année et un mois LOCAUX avec `getUTCDate()`. À Toronto le
        // 31 août à 22h30, il est déjà le 1er septembre en UTC : le code construisait donc
        // `2026-08-01` au lieu de `2026-08-31` — 30 jours d'écart, tous les soirs entre ~20h et
        // minuit. Conséquence : des jours RÉELS affichés comme « projeté » avec une valeur interpolée.
        //
        // ⚠️ Et ce test n'aurait RIEN prouvé en CI : le conteneur tourne en TZ=UTC, où
        // `getDate() === getUTCDate()` toujours. D'où l'injection d'une date construite à la main
        // plutôt qu'une dépendance à l'horloge de la machine.
        const soir = new Date(2026, 7, 31, 22, 30); // 31 août 2026, 22h30 LOCAL (mois 7 = août)
        expect(todayIsoLocal(soir)).toBe('2026-08-31');
    });

    it('reste cohérent en début de journée et sur un changement d’année', () => {
        expect(todayIsoLocal(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
        expect(todayIsoLocal(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    });

    it('isoDate pade correctement mois et jour', () => {
        expect(isoDate(2026, 0, 5)).toBe('2026-01-05');
        expect(isoDate(2026, 11, 31)).toBe('2026-12-31');
    });
});

describe('[FUTUR-DAILY] daySpan', () => {
    it('compte les jours bornes INCLUSES', () => {
        expect(daySpan('2026-01-01', '2026-01-31')).toBe(31);
        expect(daySpan('2026-01-01', '2026-01-01')).toBe(1);
    });

    it('traverse les mois et les années', () => {
        expect(daySpan('2026-12-30', '2027-01-02')).toBe(4);
    });

    it('une date illisible rend 0 plutôt qu’un NaN qui se propagerait dans un seuil de zoom', () => {
        expect(daySpan('pas-une-date', '2026-01-01')).toBe(0);
    });
});

// [FUTUR-DAILY] `finiteAnchorRun` — le filtre qui empêche un `NetWorth` LÉGITIMEMENT absent de
// devenir un patrimoine de 0 $.
//
// Pourquoi ce test existe : `buildPastPrefix` pose `NetWorth: undefined` avant la première
// transaction connue (« no-fake : pas de fausse ligne à 0 »). Les deux appelants du raffinement
// écrivaient `Number(p.NetWorth) || 0`, ce qui rendait la valeur finie AVANT le garde-fou de
// `refineMonthToDaily` — le garde ne se déclenchait donc jamais.
describe('finiteAnchorRun — une absence ne devient jamais 0 $', () => {
    const pt = (monthIndex: number, NetWorth?: number) => ({ monthIndex, NetWorth });

    it('traduit les points finis en ancres calendaires', () => {
        const run = finiteAnchorRun([pt(0, 100), pt(1, 110)], 2026, 0);
        expect(run).toEqual([
            { monthIndex: 0, year: 2026, month: 0, value: 100 },
            { monthIndex: 1, year: 2026, month: 1, value: 110 },
        ]);
    });

    it('ÉCARTE les points sans patrimoine connu au lieu de les ancrer sur 0', () => {
        const run = finiteAnchorRun([pt(-2), pt(-1), pt(0, 100), pt(1, 110)], 2026, 0);
        expect(run.map((a) => a.monthIndex)).toEqual([0, 1]);
        // Le point clé : AUCUNE ancre à 0 $ — c'est exactement ce que `Number(x) || 0` produisait.
        expect(run.some((a) => a.value === 0)).toBe(false);
    });

    it('garde la plus longue plage CONTIGUË, jamais un filtre à trous', () => {
        // Un trou au MILIEU : filtrer sans exiger la contiguïté appairerait deux mois NON voisins
        // et étalerait un écart de deux mois sur un seul — une distorsion silencieuse.
        const run = finiteAnchorRun([pt(0, 10), pt(1), pt(2, 30), pt(3, 40), pt(4, 50)], 2026, 0);
        expect(run.map((a) => a.monthIndex)).toEqual([2, 3, 4]);
    });

    it('rend une plage trop courte pour raffiner plutôt que d’inventer une entrée', () => {
        // Un seul point fini => `refineWindowToDaily` rendra `[]` : pas de mois d’entrée connu.
        expect(finiteAnchorRun([pt(0), pt(1, 100)], 2026, 0)).toHaveLength(1);
        expect(refineWindowToDaily(finiteAnchorRun([pt(0), pt(1, 100)], 2026, 0))).toEqual([]);
    });

    it('un NaN ou un Infinity est traité comme une absence, pas comme une valeur', () => {
        const run = finiteAnchorRun([pt(0, NaN), pt(1, Infinity), pt(2, 300), pt(3, 400)], 2026, 0);
        expect(run.map((a) => a.monthIndex)).toEqual([2, 3]);
    });
});

// [FUTUR-DAILY lot B étape 2] Abscisse d'un point quotidien sur l'axe numérique.
describe('axisXAtDay — le jour 1 vaut EXACTEMENT l’entier du mois', () => {
    it('aligne le 1er du mois sur l’ancrage entier (sinon les jalons glissent)', () => {
        // C'est L'invariant qui rend la migration sûre : « Aujourd'hui », la frontière passé/futur
        // et les icônes-jalons sont posés sur des ENTIERS.
        expect(axisXAtDay(7, 1, 2026, 0)).toBe(7);
        expect(axisXAtDay(-3, 1, 2026, 5)).toBe(-3);
    });

    it('répartit les jours DANS le mois, sans jamais atteindre le mois suivant', () => {
        expect(axisXAtDay(0, 16, 2026, 0)).toBeCloseTo(15 / 31, 12); // janvier, 31 jours
        expect(axisXAtDay(0, 31, 2026, 0)).toBeCloseTo(30 / 31, 12);
        expect(axisXAtDay(0, 31, 2026, 0)).toBeLessThan(1);
    });

    it('tient compte de la LONGUEUR réelle du mois (février ≠ mars)', () => {
        // Le même quantième n'est pas à la même fraction : c'est précisément ce qui rend
        // l'espacement non uniforme, et donc la résolution par rang fausse.
        expect(axisXAtDay(0, 15, 2026, 1)).toBeCloseTo(14 / 28, 12); // février 2026, 28 jours
        expect(axisXAtDay(0, 15, 2026, 2)).toBeCloseTo(14 / 31, 12); // mars, 31 jours
        expect(axisXAtDay(0, 15, 2026, 1)).not.toBeCloseTo(axisXAtDay(0, 15, 2026, 2), 6);
    });

    it('gère l’année bissextile', () => {
        expect(axisXAtDay(0, 29, 2028, 1)).toBeCloseTo(28 / 29, 12); // février 2028, 29 jours
    });

    it('un monthIndex non fini ressort tel quel plutôt qu’en NaN silencieux', () => {
        expect(axisXAtDay(NaN, 5, 2026, 0)).toBeNaN();
    });
});
