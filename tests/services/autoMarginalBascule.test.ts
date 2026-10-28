// tests/services/autoMarginalBascule.test.ts
//
// [AUTOMARGINAL-BASCULE-SILENCIEUSE] La stratégie par défaut (`AUTO_MARGINAL`) choisit SEULE où
// cotiser — CELI d'abord sous 40 % de taux marginal, REER d'abord à partir de 40 %
// (`cashflowAllocation.ts` : `strategy === 'AUTO_MARGINAL' && marginal >= 0.40`).
//
// ⚠️ LE TICKET SE TROMPAIT SUR DEUX POINTS, et c'est ce qui a orienté ce lot.
//
//  1. Il annonçait une bascule « pour TOUTE la projection », déclenchée par le revenu de DÉPART.
//     Faux : `marginal` est recalculé à CHAQUE mois sur le brut indexé par la croissance salariale.
//     MESURÉ (célibataire, 7 000 $/mois brut, croissance 3 %) : le taux marginal passe de 0,361 à
//     0,411 entre l'année 8 et l'année 9, et l'ordre bascule LÀ. À croissance nulle, il ne bascule
//     JAMAIS. Ce n'est pas un état de départ, c'est une FRONTIÈRE MOBILE.
//  2. Il proposait de « nommer la bascule dans l'explication de la stratégie ». Or la seule
//     explication candidate (`ProjectionExplains`, « Dans quel ordre l'app pige dans mes comptes ? »)
//     parle des RETRAITS, et `stratDescription` est rendu en `truncate` — une phrase ajoutée là
//     serait invisible (`UX-UNREACHABLE-FEATURE`). Le correctif livré est une entrée de FAQ dédiée
//     à la COTISATION, rendue en entier.
//
// ⚠️⚠️ POURQUOI DES DÉPENSES AUSSI HAUTES DANS LA FIXTURE (4 400 $/mois) — NE PAS « SIMPLIFIER ».
// L'ordre de cotisation ne décide de RIEN quand le surplus mensuel dépasse le plafond CELI : les
// deux comptes se remplissent de toute façon, et seul le reliquat change de destination. Mon premier
// jet utilisait 3 200 $/mois de dépenses ; MESURÉ, la sortie d'`AUTO_MARGINAL` y était à 1 000 $ près
// identique à celle de `CELI_FIRST` sur les 25 années — j'en ai conclu, à tort, que la bascule
// n'existait pas. Elle existait : c'est la MESURE qui était aveugle, saturée par un surplus de
// ~29 k$/an contre un plafond CELI de ~8,5 k$.
// À 4 400 $/mois de dépenses, le surplus passe SOUS le plafond CELI et l'ordre devient entièrement
// observable — MESURÉ : `AUTO` suit `CELI_FIRST` les années 0-8, puis `REER_FIRST` à partir de
// l'année 9, tandis que `CELI_FIRST` ne cotise JAMAIS au REER sur 20 ans.
//
// Ce fichier garde le MÉCANISME (la bascule existe, elle dépend du revenu, le levier explicite la
// supprime) et le fait que le texte utilisateur le dise. Sans le premier, le texte serait une
// affirmation invérifiée ; sans le second, le mécanisme resterait silencieux.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { User, ProjectionConfig } from '../../types';

const user = (brutMensuel: number): User => ({
    name: 'Marc', grossSalary: brutMensuel, netSalary: brutMensuel * 0.68, color: '#10b981',
    age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false,
} as unknown as User);

function params(brutMensuel: number, croissance: number, projOver: Partial<ProjectionConfig> = {}): SimulationParams {
    return {
        projection: {
            years: 25, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
            usePortfolioRate: false, returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: croissance, propertyGrowthRate: 3, ...projOver,
        },
        calculatedStartingCash: 40_000,
        liveCSVBalances: { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 },
        realEstateGoals: [], debts: [], childGoals: [], travelGoals: [], lifeEvents: [],
        retirementGoal: { targetAge: 65, targetMonthlyIncome: 4000, governmentPension: 1500 },
        config: { users: [user(brutMensuel)], splitMode: '50/50' },
        baseGrossAnnual: brutMensuel * 12, baseNetAnnual: brutMensuel * 0.68 * 12,
        // ⚠️ 4 400 $ : voir l'en-tête. Un surplus plus large SATURE le plafond CELI et rend l'ordre
        // de cotisation inobservable — la mesure devient vacueuse sans qu'aucune assertion ne rougisse.
        currentRentExpense: 1_500, baseMonthlyExpenses: 4_400, startYear: 2026, startMonth: 0,
    } as unknown as SimulationParams;
}

type Ordre = 'CELI' | 'REER' | 'aucune cotisation';

/** L'ordre de cotisation OBSERVÉ année par année, lu sur les flux publiés — jamais recalculé ici
 *  (un test qui refait le calcul teste sa propre copie, cf. `le test écrit pour fermer un trou`). */
function ordreParAnnee(brutMensuel: number, croissance: number, projOver: Partial<ProjectionConfig> = {}): Ordre[] {
    const r = calculateFutureProjection(params(brutMensuel, croissance, projOver)) as unknown as {
        chartData: Record<string, number | undefined>[];
    };
    const cd = r.chartData ?? [];
    expect(cd.length, 'chartData vide : rien à observer').toBeGreaterThan(20 * 12);

    const out: Ordre[] = [];
    for (let an = 0; an < 20; an++) {
        let reer = 0, celi = 0;
        for (let m = an * 12; m < (an + 1) * 12 && m < cd.length; m++) {
            reer += cd[m]?.ContribREER ?? 0;
            celi += cd[m]?.ContribCELI ?? 0;
        }
        out.push(reer > celi ? 'REER' : celi > reer ? 'CELI' : 'aucune cotisation');
    }
    return out;
}

describe('[AUTOMARGINAL-BASCULE-SILENCIEUSE] l’ordre de cotisation bascule EN COURS de projection', () => {
    it('un salaire qui croît fait passer les cotisations de CELI d’abord à REER d’abord', () => {
        // ⚠️ RE-DÉRIVÉ le 2026-09-04 ([FISC-MARGINAL-SPACE], lot 136) : le marginal suit désormais
        // les paliers INDEXÉS de l'année courante (+2 %/an). À 3 % de croissance salariale, le
        // différentiel réel n'est plus que ~1 %/an et la frontière des 40 % n'est plus atteinte en
        // 20 ans — l'ancienne bascule « année 9 » était un ARTEFACT des paliers figés 2026 (le vrai
        // marginal de ce revenu restait sous 40 %). Le mécanisme, lui, est inchangé : il faut une
        // croissance qui DÉPASSE l'indexation des paliers. 5 % → bascule mesurée à l'année 9.
        const ordres = ordreParAnnee(7_000, 5);

        // Anti-vacuité : il faut de VRAIES cotisations, sinon « CELI » et « REER » sont deux zéros.
        expect(ordres.filter(o => o !== 'aucune cotisation').length,
            'aucune année ne cotise : le scénario ne teste rien').toBeGreaterThan(12);

        const premiereReer = ordres.indexOf('REER');
        expect(premiereReer, 'aucune bascule vers REER : le mécanisme AUTO_MARGINAL ne s’exerce pas')
            .toBeGreaterThan(0);
        expect(ordres[premiereReer - 1],
            'la projection doit être sous le seuil JUSTE avant la bascule, sinon il n’y a rien à voir')
            .toBe('CELI');

        // Et elle ne revient pas en arrière : au-dessus du seuil, le revenu ne fait que monter.
        expect(ordres.slice(premiereReer).every(o => o === 'REER'),
            `l’ordre oscille après la bascule : ${ordres.join(' ')}`).toBe(true);
    });

    it('à croissance salariale NULLE, la bascule n’arrive jamais — c’est bien le REVENU qui décide', () => {
        // Contre-épreuve indispensable : sans elle, le test précédent serait compatible avec une
        // bascule pilotée par le TEMPS (un simple « après N années »), ce qui n’est pas le mécanisme.
        const ordres = ordreParAnnee(7_000, 0);
        expect(ordres.includes('REER'),
            `bascule observée sans aucune croissance de revenu : ${ordres.join(' ')}`).toBe(false);
    });

    it('un revenu plus élevé bascule PLUS TÔT — la date suit le revenu', () => {
        // Troisième point, qui ferme le débat sur la cause : ce n'est ni le temps, ni le hasard.
        // (croissance 5 % : même raison que ci-dessus — au-dessus de l'indexation des paliers.)
        const bas = ordreParAnnee(7_000, 5).indexOf('REER');
        const haut = ordreParAnnee(9_000, 5).indexOf('REER');
        expect(haut, 'le scénario haut doit basculer aussi').toBeGreaterThan(-1);
        expect(haut, `bascule à ${haut} (9 000 $) contre ${bas} (7 000 $) : le revenu ne décale rien`)
            .toBeLessThan(bas);
    });

    it('le levier explicite « Ordre de cotisation » SUPPRIME la bascule automatique', () => {
        // C’est la dernière phrase de la réponse FAQ : elle doit être vraie.
        // (croissance 5 % : SANS le levier, cette fixture bascule à l'année 9 — c'est ce qui rend
        // le test discriminant depuis le lot 136 ; à 3 %, il ne basculerait plus de toute façon.)
        // ⚠️ La fenêtre s'arrête à l'année 11 : au-delà, le SURPLUS (qui croît à 5 %) dépasse le
        // plafond CELI et le TROP-PLEIN déborde légitimement vers le REER même sous CELI_FIRST —
        // c'est du VOLUME, pas de l'ordre (mesuré : « REER » d'étiquette dès l'année 12 parce que
        // le débordement annuel excède le plafond CELI, alors que le CELI est bien servi d'abord).
        const ordres = ordreParAnnee(7_000, 5, { appliedContributionOrder: 'CELI_FIRST' } as Partial<ProjectionConfig>);
        expect(ordres.slice(0, 12).includes('REER'),
            `le levier CELI_FIRST n’a pas tenu sur les années de la bascule auto : ${ordres.join(' ')}`).toBe(false);
    });
});

describe('[AUTOMARGINAL-BASCULE-SILENCIEUSE] et l’utilisateur en est INFORMÉ', () => {
    it('la FAQ des projections explique l’ordre de COTISATION, son seuil et sa mobilité', () => {
        const src = readFileSync(
            resolve(__dirname, '../../components/projection/ProjectionExplains.tsx'), 'utf8');
        // Une entrée DISTINCTE de celle des retraits : la réponse sur les retraits existait déjà et
        // reste correcte — y greffer un fait de cotisation l’aurait rendue fausse.
        expect(src).toMatch(/l'app COTISE/);
        expect(src).toMatch(/40 %/);
        // Le point que le ticket avait manqué, et le seul qui compte vraiment pour l'utilisateur :
        // l'ordre peut changer SANS qu'il touche à quoi que ce soit.
        expect(src).toMatch(/BASCULER en cours de projection/);
        expect(src).toMatch(/Ordre de cotisation/);
    });
});
