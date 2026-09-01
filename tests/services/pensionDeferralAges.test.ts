// [ENG-LIBELLE-RRQ-70-VS-72] Les âges de report des rentes ont UNE source, et tout le monde la lit.
//
// ⚠️ LE DÉFAUT. Le même fait — « sous report optimal, la RRQ démarre à 72 et la PSV à 70 » —
// s'écrivait à TROIS endroits : le calcul (`retirementIncome.ts`, juste), le repli du libellé
// « rentes reportées (RRQ N ans) » de `services/projection.ts` (qui disait **70**) et un commentaire
// du même fichier (qui disait **70** pour les deux). Deux des trois étaient fausses.
//
// ⚠️ POURQUOI PERSONNE NE L'AVAIT VU. Le repli du libellé est aujourd'hui INATTEIGNABLE :
// `delayPensions` vaut `false` dans les onze définitions de `services/projection/scenarios.ts`, donc
// la branche « rentes reportées » exige `rrqStart` défini et le `?? 70` n'est jamais évalué. Un
// chemin mort ne se trahit pas — mais sa valeur fausse est une bombe le jour où il se rouvre. C'est
// pour ça que le correctif est de DÉRIVER, pas de corriger `70` en `72` à deux endroits : trois
// écritures d'un même fait divergent, quel que soit le soin qu'on y met.
//
// ⚠️ La première assertion est COMPORTEMENTALE, pas un scan : elle fait tourner le moteur et lit
// l'âge auquel la rente COMMENCE réellement. Un scan de source prouve la présence d'un jeton, jamais
// l'acheminement d'une valeur.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    computeRetirementIncome, RRQ_DEFERRED_START_AGE, PSV_DEFERRED_START_AGE,
} from '../../services/projection/retirementIncome';
import type { RetirementIncomeCtx } from '../../services/projection/retirementIncome';
import type { RetirementGoal, User } from '../../types';
import { stripComments } from '../../utils/stripComments';

const goal: RetirementGoal = {
    targetAge: 65,
    targetMonthlyIncome: 5000,
    governmentPension: 2000,
    rrqEstimateMonthly: 800,
    psvEstimateMonthly: 700,
    dbPensionMonthly: 0,
    dbPensionStartAge: 65,
    dbPensionIndexationPct: 100,
};

const user: User = {
    name: 'Test', salary: 60000, netSalary: 45000, birthYear: 1961, canadaArrivalYear: 1990,
} as unknown as User;

const ctxAt = (age: number): RetirementIncomeCtx => ({
    m: 0, age, simInflation: 2, activeUsersCount: 1, baseGrossAnnual: 60000,
    delayPensions: true, survivorMode: false, monthlyOasReduction: 0,
    dbSurvivorPct: 0.6, rrqSurvivorPct: 0.6, psvResidencyYears: [35], startYear: 2026,
});

const lireCode = (rel: string): string =>
    stripComments(readFileSync(resolve(process.cwd(), rel), 'utf8'));

describe('[ENG-LIBELLE-RRQ-70-VS-72] âges de report — une source unique', () => {
    it('les constantes portent les bornes LÉGALES (FISCAL_REFERENCE : RRQ 72, PSV 70)', () => {
        expect(RRQ_DEFERRED_START_AGE).toBe(72);
        expect(PSV_DEFERRED_START_AGE).toBe(70);
    });

    it('COMPORTEMENTAL : sous report, chaque rente commence à SON âge — et pas au même', () => {
        // ⚠️ Les deux âges DIFFÈRENT, et c'est tout l'objet du défaut : un test qui les vérifierait
        // à un seul âge ne distinguerait pas « 72 et 70 » de « 70 et 70 ».
        expect(RRQ_DEFERRED_START_AGE).not.toBe(PSV_DEFERRED_START_AGE);

        const justeAvantRrq = computeRetirementIncome(ctxAt(RRQ_DEFERRED_START_AGE - 1), goal, [user]);
        const aLAgeRrq = computeRetirementIncome(ctxAt(RRQ_DEFERRED_START_AGE), goal, [user]);
        expect(justeAvantRrq.rrq, 'aucune RRQ avant l’âge de report').toBe(0);
        expect(aLAgeRrq.rrq, 'la RRQ commence À l’âge de report').toBeGreaterThan(0);

        const justeAvantPsv = computeRetirementIncome(ctxAt(PSV_DEFERRED_START_AGE - 1), goal, [user]);
        const aLAgePsv = computeRetirementIncome(ctxAt(PSV_DEFERRED_START_AGE), goal, [user]);
        expect(justeAvantPsv.psv, 'aucune PSV avant l’âge de report').toBe(0);
        expect(aLAgePsv.psv, 'la PSV commence À l’âge de report').toBeGreaterThan(0);

        // Et le point qui prouve que les deux âges sont bien DISTINCTS dans le moteur : entre les
        // deux, la PSV coule déjà et la RRQ pas encore.
        const entreLesDeux = computeRetirementIncome(ctxAt(PSV_DEFERRED_START_AGE), goal, [user]);
        expect(entreLesDeux.psv).toBeGreaterThan(0);
        expect(entreLesDeux.rrq, 'la RRQ ne doit PAS avoir commencé à l’âge de report PSV').toBe(0);
    });

    it('le libellé du moteur DÉRIVE de la constante — aucun âge en dur', () => {
        const code = lireCode('services/projection.ts');
        expect(code, 'le repli du libellé lit la source unique')
            .toMatch(/rrqStart \?\? RRQ_DEFERRED_START_AGE/);
        // ⚠️ Assertion d'ABSENCE sur la source DÉCOMMENTÉE : le commentaire juste au-dessus RACONTE
        // le défaut et cite « 70 », comme il se doit (`SCAN-QUI-MATCHE-LA-PROSE`).
        expect(code, 'aucun âge de report recopié dans le libellé')
            .not.toMatch(/rrqStart \?\? \d+/);
    });

    it('le calcul aussi — les deux âges ne sont plus écrits en dur dans le bloc de report', () => {
        const code = lireCode('services/projection/retirementIncome.ts');
        expect(code).toMatch(/rrqStartAge = RRQ_DEFERRED_START_AGE;/);
        expect(code).toMatch(/psvStartAge = PSV_DEFERRED_START_AGE;/);
        expect(code, 'plus aucune affectation d’âge en dur sous delayPensions')
            .not.toMatch(/(rrq|psv)StartAge = \d+;/);
    });
});
