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
    dailyWindowRange,
    finiteAnchorRun,
    daysInMonth,
    calendarFromMonthIndex,
    isoDate,
    todayIsoLocal,
} from '../../services/projection/dailyRefine';

describe('[FUTUR-DAILY] daysInMonth', () => {
    it('connaît les mois courts et les années bissextiles', () => {
        expect(daysInMonth(2026, 0)).toBe(31);  // janvier
        expect(daysInMonth(2026, 3)).toBe(30);  // avril
        expect(daysInMonth(2026, 1)).toBe(28);  // février 2026
        expect(daysInMonth(2028, 1)).toBe(29);  // février 2028, bissextile
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

    it('rend une plage trop courte pour ventiler plutôt que d’inventer une entrée', () => {
        // Un seul point fini : le consommateur (`buildDailyLedger`, qui exige 2 mois) rendra `[]` —
        // pas de mois d'entrée connu, donc pas de jours fabriqués.
        expect(finiteAnchorRun([pt(0), pt(1, 100)], 2026, 0)).toHaveLength(1);
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

describe('dailyWindowRange — la vue au jour doit être ATTEIGNABLE en un clic', () => {
    // Le contrat testé ici n'est pas cosmétique : la vue au jour ne s'active que sous un plafond de
    // points mensuels visibles, et le seul chemin y menait par 23-31 crans de molette (aucun au
    // doigt, le hook de zoom n'écoutant que `wheel`). Cette fonction est ce chemin direct.

    it('rend une fenêtre de la LONGUEUR demandée (c’est elle qui déclenche la vue au jour)', () => {
        const r = dailyWindowRange(400, 20, 6);
        expect(r).not.toBeNull();
        expect(r![1] - r![0] + 1).toBe(6);
    });

    it('recule d’un mois sur l’ancre, pour que le premier mois RENDU soit celui d’aujourd’hui', () => {
        // `refineWindowToDaily` CONSOMME la première ancre comme valeur d'entrée sans la rendre :
        // viser `todayIndex` pile afficherait les jours à partir du mois SUIVANT.
        // ⚠️ CENTRÉE sur aujourd'hui, pas ancrée dessus (`[FUTUR-DAILY-PAST-REACH]`, retour de Marc
        // « je vois toujours pas au jour pour le passé »). L'ancien `[19, 24]` faisait du mois 19
        // l'ancre d'ENTRÉE, non rendue : le 1er jour affiché était le 1er du mois COURANT, donc
        // ZÉRO jour passé. Ici la fenêtre part de 20−1−2 = 17 → mois RENDUS 18, 19, 20, 21, 22,
        // soit 2 mois avant aujourd'hui, le mois courant, et 2 après.
        expect(dailyWindowRange(400, 20, 6)).toEqual([17, 22]);
    });

    it('la MOITIÉ des mois rendus tombe AVANT aujourd’hui — sinon le passé au jour est invisible', () => {
        // Garde de la classe de bug : la reconstruction du passé au jour peut être parfaite et
        // rester inatteignable si la fenêtre ne descend jamais sous aujourd'hui.
        for (const today of [10, 50, 200]) {
            const [lo] = dailyWindowRange(400, today, 6)!;
            const premierMoisRendu = lo + 1; // la 1re ancre sert de valeur d'entrée, non rendue
            expect(premierMoisRendu, `today=${today}`).toBeLessThan(today);
        }
    });

    it('ne sort pas du tableau par la gauche quand aucun mois ne précède aujourd’hui', () => {
        expect(dailyWindowRange(400, 0, 6)).toEqual([0, 5]);
        expect(dailyWindowRange(400, 2, 6)).toEqual([0, 5]);
    });

    it('ne sort pas du tableau par la droite quand aujourd’hui est en fin de série', () => {
        const r = dailyWindowRange(400, 399, 6);
        expect(r).toEqual([394, 399]);
        expect(r![1]).toBeLessThan(400);
    });

    it('refuse une fenêtre qui couvrirait TOUT le jeu — le hook repasserait en vue complète', () => {
        // Cas piégeux : `showRange(0, len-1)` est normalisé en `null` par `useTimeChartZoom`, donc
        // `isZoomed` reste faux et la vue au jour ne s'active JAMAIS. Un bouton qui ne fait rien est
        // pire que pas de bouton : on rend `null` et l'appelant le masque.
        expect(dailyWindowRange(6, 3, 6)).toBeNull();
        expect(dailyWindowRange(4, 2, 6)).toBeNull();
        expect(dailyWindowRange(7, 3, 6)).not.toBeNull();
    });

    it('refuse les entrées non finies plutôt que de rendre une plage NaN', () => {
        expect(dailyWindowRange(NaN, 10, 6)).toBeNull();
        expect(dailyWindowRange(400, NaN, 6)).toBeNull();
        expect(dailyWindowRange(400, 10, NaN)).toBeNull();
        expect(dailyWindowRange(400, 10, 1)).toBeNull();
    });
});
