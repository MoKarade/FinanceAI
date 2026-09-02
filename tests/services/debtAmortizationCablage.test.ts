// tests/services/debtAmortizationCablage.test.ts
//
// [DEBT-AMORTIZATION-CABLAGE] lot 2/2 — la courbe du PASSÉ montre enfin la dette telle qu'elle était.
// Marc : « chaque semaine je dois un peu moins ». Jusqu'ici le passé soustrayait la dette à son
// niveau ACTUEL depuis toujours (Option A, approximation assumée de 2026-07-24) ; elle décroît
// maintenant, pour les dettes qui s'amortissent VRAIMENT.
//
// Ce que ces gardes défendent, du plus important au moins :
//   1. le RACCORD au présent reste exact — un supplément nul aujourd'hui, sinon la courbe SAUTE ;
//   2. les deux corrections de dette (pas-encore-commencée / supplément amorti) sont DISJOINTES ;
//   3. le passé doit PLUS, jamais moins, et la correction décroît en approchant d'aujourd'hui ;
//   4. une dette qui ne s'amortit pas (le bail de Marc) reste PLATE — non-régression stricte.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { supplementAmortiAuMoisAbsolu, supplementAmortiAuMois, prepareSupplementAmortiAbsolu, amortirDettePassee, type DebtAmortissable } from '../../services/projection/debtAmortization';
import { sumNotYetStartedDebtsAtMonth } from '../../services/projection/debtSchedule';
import { buildPastPrefix } from '../../services/history/buildPastPrefix';
import { buildDailyPastLedger } from '../../services/history/dailyPastLedger';
import { mentionDettesPasse } from '../../services/history/pastDebtNotice';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';
import type { PortfolioHistoryPoint, MinimalAsset } from '../../services/history/reconstructPortfolioHistory';

const mois = (annee: number, moisIndex: number): number => annee * 12 + moisIndex;
const AUJOURDHUI = mois(2026, 0); // janvier 2026 = mois 0 de la projection

/** Prêt auto : 30 k$ empruntés en janvier 2024, il en reste 18 k$. */
const pretAuto: DebtAmortissable = {
    balance: 18000, originalBalance: 30000, kind: 'auto',
    startDate: '2024-01-15', interestRate: 5, minimumPayment: 560,
};
/** Le cas RÉEL de Marc : un bail. Aucune courbe d'amortissement ne le décrit. */
const bail: DebtAmortissable = {
    balance: 18000, originalBalance: 30000, kind: 'auto-lease',
    startDate: '2024-01-15', interestRate: 5, minimumPayment: 560,
};

const invPoint = (date: string, o: Partial<PortfolioHistoryPoint> = {}): PortfolioHistoryPoint =>
    ({ date, monthIndex: 0, CELI: 0, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, InvestedValue: 0, ...o });

const basePrefix = {
    startYear: 2026, startMonth: 0, realEstateGoals: [],
    transactions: [{ date: '2024-01-15', amount: -500 }],
    calculatedStartingCash: 3000,
    pastHistoryPoints: [invPoint('2024-01-31', { CELI: 50000 }), invPoint('2025-12-31', { CELI: 50000 })],
    currentDebtNonImmo: 18000,
};

describe('[DEBT-AMORTIZATION-CABLAGE] le raccord au présent', () => {
    it('AUJOURD\'HUI le supplément est EXACTEMENT nul — sinon la courbe saute au raccord', () => {
        // C'est l'invariant numéro un de tout le passé reconstruit : le bug « MONEY-PHANTOM » que
        // `pastNetWorthAt` existe pour empêcher. Le recalage du service garantit que la courbe
        // atterrit sur le solde réel ; ce test le vérifie DU CÔTÉ DU REGISTRE.
        expect(supplementAmortiAuMoisAbsolu([pretAuto], AUJOURDHUI, AUJOURDHUI)).toBe(0);
        expect(supplementAmortiAuMois([pretAuto], 2026, 0, 0)).toBe(0);
    });

    it('le supplément DÉCROÎT en approchant d\'aujourd\'hui, et reste positif', () => {
        // Une dette s'amortit : plus on remonte, plus on devait. L'inverse serait un remboursement
        // qui remonte — c'est-à-dire un emprunt.
        let precedent = Number.POSITIVE_INFINITY;
        for (let m = mois(2024, 0); m <= AUJOURDHUI; m++) {
            const s = supplementAmortiAuMoisAbsolu([pretAuto], m, AUJOURDHUI);
            expect(s, `mois ${m}`).toBeGreaterThanOrEqual(0);
            expect(s, `mois ${m}`).toBeLessThan(precedent);
            precedent = s;
        }
        // Anti-vacuité : au tout début, le supplément doit être SUBSTANTIEL (sinon la boucle
        // ci-dessus serait satisfaite par une suite de zéros décroissants... qui n'existe pas,
        // mais le lecteur ne devrait pas avoir à le déduire).
        expect(supplementAmortiAuMoisAbsolu([pretAuto], mois(2024, 0), AUJOURDHUI)).toBeGreaterThan(5000);
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] les deux corrections de dette sont DISJOINTES', () => {
    it('avant le début du prêt : l\'autre delta agit, le supplément est nul — jamais les deux', () => {
        // Double compter reviendrait à soustraire la dette ET à lui ajouter un supplément pour un
        // mois où elle n'existait pas. Le service refuse avant `startDate` (cause
        // `donnees-manquantes`), donc le supplément vaut 0 — et c'est ce qui rend l'addition sûre.
        const avantDebut = -25; // décembre 2023, le prêt commence en janvier 2024
        expect(supplementAmortiAuMois([pretAuto], 2026, 0, avantDebut)).toBe(0);
        expect(sumNotYetStartedDebtsAtMonth([pretAuto], 2026, 0, avantDebut)).toBe(18000);
    });

    it('après le début : le supplément agit, l\'autre delta est nul', () => {
        const apresDebut = -12; // janvier 2025
        expect(supplementAmortiAuMois([pretAuto], 2026, 0, apresDebut)).toBeGreaterThan(0);
        expect(sumNotYetStartedDebtsAtMonth([pretAuto], 2026, 0, apresDebut)).toBe(0);
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] la courbe MENSUELLE du passé', () => {
    it('le patrimoine passé BAISSE : on devait plus, donc on valait moins', () => {
        const sans = buildPastPrefix({ ...basePrefix, debts: [{ ...pretAuto, originalBalance: undefined }] });
        const avec = buildPastPrefix({ ...basePrefix, debts: [pretAuto] });
        expect(avec.length).toBe(sans.length);
        // Mesuré : −12 000 $ au point le plus ancien (janvier 2024), −524 $ au dernier mois passé.
        expect((avec[0].NetWorth ?? 0)).toBeLessThan(sans[0].NetWorth ?? 0);
        expect((sans[0].NetWorth ?? 0) - (avec[0].NetWorth ?? 0)).toBeGreaterThan(5000);
        // ... et l'écart se RESSERRE vers aujourd'hui : c'est la courbe que Marc a demandée.
        const ecart = (i: number): number => (sans[i].NetWorth ?? 0) - (avec[i].NetWorth ?? 0);
        expect(ecart(avec.length - 1)).toBeLessThan(ecart(0));
        expect(ecart(avec.length - 1)).toBeGreaterThan(0);
    });

    it('SANS `originalBalance`, la courbe est INCHANGÉE — non-régression stricte', () => {
        // C'est le cas de tout utilisateur qui n'a pas saisi le montant emprunté : rien ne bouge.
        const avant = buildPastPrefix({ ...basePrefix, debts: [{ balance: 18000, kind: 'auto', startDate: '2024-01-15', interestRate: 5, minimumPayment: 560 }] });
        for (const p of avant) expect(p.NetWorth).toBe(35000);
    });

    it('un BAIL reste PLAT — le cas réel de Marc, et ce n\'est pas un oubli', () => {
        const avecBail = buildPastPrefix({ ...basePrefix, debts: [bail] });
        for (const p of avecBail) expect(p.NetWorth).toBe(35000);
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] la courbe QUOTIDIENNE porte la même correction', () => {
    // Fixture calquée sur `dailyPastLedger.test.ts` : le registre au jour n'émet une ligne que si
    // les DEUX sources (cash ET placements) ont de la matière ce jour-là — d'où un titre avec des
    // prix quotidiens et des transactions réelles. Un fixture vide rendrait zéro ligne, et le test
    // serait vert sans rien mesurer (c'est l'anti-vacuité ci-dessous qui l'a attrapé).
    const actif: MinimalAsset = {
        symbol: 'AAA', quantity: 10, currency: 'CAD', currentPrice: 100, accountType: 'CELI',
        purchases: [{ date: '2025-11-02', quantity: 10, price: 90 }],
        priceHistory: [
            { date: '2025-11-01', price: 88 }, { date: '2025-11-02', price: 90 },
            { date: '2025-11-03', price: 95 }, { date: '2025-11-04', price: 97 },
            { date: '2025-11-05', price: 97 },
        ],
    };
    const baseDaily = {
        // ⚠️ `today` est en DÉCEMBRE, un mois APRÈS la fenêtre observée : dans le mois d'aujourd'hui
        // le supplément vaut EXACTEMENT 0 (c'est l'ancre du recalage, cf. le raccord plus haut), donc
        // une fenêtre calée sur `today` mesurerait zéro et le test serait vacueux.
        from: '2025-11-01', to: '2025-11-05', today: '2025-12-15',
        transactions: [
            { date: '2025-11-01', amount: 2000, payee: 'Paie' },
            { date: '2025-11-03', amount: -150, payee: 'Épicerie' },
        ],
        currentCash: 5000, assets: [actif], fx: {},
        equityByYear: new Map([[2025, 0]]), currentDebtNonImmo: 18000,
    };

    it('le registre au JOUR baisse aussi, au même palier MENSUEL', () => {
        const sans = buildDailyPastLedger({ ...baseDaily, debts: [{ ...pretAuto, originalBalance: undefined }] });
        const avec = buildDailyPastLedger({ ...baseDaily, debts: [pretAuto] });
        expect(avec.rows.length, 'anti-vacuité : le registre doit produire des jours').toBeGreaterThan(2);
        expect(avec.rows.length).toBe(sans.rows.length);
        expect(avec.rows[0].NetWorth).toBeLessThan(sans.rows[0].NetWorth);

        // Palier MENSUEL assumé : tous les jours du même mois portent la MÊME correction. Interpoler
        // au jour fabriquerait une précision que la donnée n'a pas — un prêt ne bouge qu'aux dates
        // de paiement.
        const corrections = avec.rows.map(r =>
            (sans.rows.find(s => s.date === r.date)?.NetWorth ?? 0) - (r.NetWorth ?? 0));
        expect(new Set(corrections).size, 'une seule correction pour tout le mois').toBe(1);
        expect(corrections[0]).toBeGreaterThan(0);
    });

    it('un BAIL ne bouge pas non plus au jour — même refus, même raison', () => {
        const sans = buildDailyPastLedger({ ...baseDaily, debts: [{ ...bail, originalBalance: undefined }] });
        const avec = buildDailyPastLedger({ ...baseDaily, debts: [bail] });
        expect(avec.rows.length).toBeGreaterThan(2);
        for (let i = 0; i < avec.rows.length; i++) {
            expect(avec.rows[i].NetWorth).toBe(sans.rows[i].NetWorth);
        }
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] le bandeau dit ce que la courbe montre', () => {
    // Le bandeau du graphe Futur affirmait « dettes au niveau actuel » dès qu'une dette existait.
    // C'était exact tant que le passé les figeait ; c'est FAUX depuis ce lot. Un texte affiché est
    // une affirmation — il se dérive du verdict du SERVICE, jamais d'une relecture des champs.
    const AUJ = 2026 * 12 + 0;

    it('aucune dette publiée : rien à dire', () => {
        expect(mentionDettesPasse([pretAuto], AUJ, 0)).toBe('');
    });

    it('que des dettes qui n\'amortissent pas : la phrase d\'avant, inchangée', () => {
        expect(mentionDettesPasse([bail], AUJ, 18000)).toBe('dettes au niveau actuel');
        // Même verdict SANS le montant emprunté : c'est le cas de tout utilisateur qui ne l'a pas.
        expect(mentionDettesPasse([{ ...pretAuto, originalBalance: undefined }], AUJ, 18000))
            .toBe('dettes au niveau actuel');
    });

    it('que des dettes amorties : la phrase le dit', () => {
        expect(mentionDettesPasse([pretAuto], AUJ, 18000)).toBe('dettes amorties depuis leur date de début');
    });

    it('un modèle CONSTRUCTIBLE mais PLAT ne compte pas comme amorti', () => {
        // Prêt commencé le mois même : la série est plate sur le solde réel, le supplément vaut 0
        // partout. `forme === 'ok'` est vrai, et pourtant la courbe ne bouge pas — annoncer
        // « dettes amorties » serait faux. Le compteur porte la condition qui rend le supplément
        // non nul, pas le simple fait que le modèle se construise.
        const toutNeuf: DebtAmortissable = { ...pretAuto, startDate: '2026-01-10', originalBalance: 18000, balance: 18000 };
        expect(supplementAmortiAuMois([toutNeuf], 2026, 0, 0)).toBe(0);
        expect(mentionDettesPasse([toutNeuf], AUJ, 18000)).toBe('dettes au niveau actuel');
    });

    it('MIXTE — le cas réel de Marc (un bail À CÔTÉ d\'un prêt) se nomme', () => {
        // « dettes amorties » serait faux pour la moitié de la somme affichée, et « niveau actuel »
        // pour l'autre. Les deux formulations simples mentent ; c'est pour ça que le cas existe.
        expect(mentionDettesPasse([bail, pretAuto], AUJ, 36000)).toBe('dettes partiellement amorties');
    });

    it('le composant CONSOMME cette source, il ne réécrit pas la phrase', () => {
        // Garde JUMELLE : la précédente prouve ce que la fonction rend, celle-ci interdit de faire
        // le travail autrement. Sans elle, un ternaire recopié dans le JSX redonnerait la phrase
        // périmée sans qu'aucun test ne rougisse.
        const brut = readFileSync('components/FutureProjection.tsx', 'utf8');
        const code = stripCommentsJsx(brut);
        // Anti-vacuité du décommentage. ⚠️ Le seuil 0,5 canonique des scans de DÉPÔT (agrégé sur des
        // centaines de fichiers) déclarerait ce fichier VIDE : mesuré 0,485 — `FutureProjection.tsx`
        // est majoritairement de la prose par conception. Le seuil appartient à la portée qu'il
        // mesure, et la mesure s'écrit à côté de lui.
        expect(partDeCodeRestante(brut, code)).toBeGreaterThan(0.4);
        // Témoin de code indépendant de l'assertion : sans lui, un décommenteur qui aurait tout
        // mangé rendrait le `not.toContain` ci-dessous trivialement vert.
        expect(code).toContain('export const FutureProjection');
        expect(code).toContain('mentionDettesPasse');
        // La phrase ne doit exister QUE dans le module qui la produit.
        expect(code).not.toContain('dettes au niveau actuel');
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] la série est payée UNE fois, pas à chaque point', () => {
    it('préparer puis interroger 500 mois ne reconstruit la série qu\'une seule fois PAR DETTE', () => {
        // Garde de PERF par ESPION, jamais par chronomètre : binaire, stable en CI, et elle vérifie
        // les deux sens. `amortirDettePassee` reconstruit la série ENTIÈRE et ne dépend pas du mois
        // interrogé — l'appeler dans la boucle des jours (plafonnée à 4 000) coûtait O(jours × mois
        // de prêt) par dette. L'observation passe par un getter sur le champ que la fonction
        // déstructure : on compte les vraies entrées dans le calcul, pas un mock qui le reproduit.
        let lectures = 0;
        const espionne: DebtAmortissable = {
            balance: 18000, kind: 'auto', startDate: '2024-01-15', interestRate: 5, minimumPayment: 560,
            get originalBalance() { lectures++; return 30000; },
        };
        const au = prepareSupplementAmortiAbsolu([espionne], AUJOURDHUI);
        const apresPreparation = lectures;
        for (let m = mois(2024, 0); m <= AUJOURDHUI; m++) au(m);

        expect(apresPreparation, 'la préparation lit la dette une seule fois').toBe(1);
        expect(lectures, '25 interrogations ne doivent RIEN recalculer').toBe(apresPreparation);
        // Anti-vacuité : sans cette assertion, un `au()` qui rendrait 0 sans jamais rien lire
        // satisferait la précédente. La valeur doit rester celle du chemin non préparé.
        expect(au(mois(2024, 0))).toBe(supplementAmortiAuMoisAbsolu([{ ...espionne, originalBalance: 30000 }], mois(2024, 0), AUJOURDHUI));
        expect(au(mois(2024, 0))).toBeGreaterThan(5000);
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] absence et corruption ne se confondent pas', () => {
    // `REPLI-SILENCIEUX-LEGITIME-VS-CORRUPTION` : un champ jamais saisi est le cas NOMINAL et se
    // tait ; un champ PRÉSENT mais non fini ou négatif est une corruption et se NOMME. Le module
    // voisin (`sumNotYetStartedDebtsAtAbsoluteMonth`, appelé sur la même ligne chez les deux
    // appelants) journalisait déjà ce cas — ne pas le faire ici serait le patron appliqué à côté.
    const cause = (d: DebtAmortissable): string => {
        const r = amortirDettePassee(d, AUJOURDHUI);
        return r.forme === 'ok' ? 'ok' : r.cause;
    };

    it('champ ABSENT : « donnees-manquantes », le cas nominal d\'aujourd\'hui', () => {
        expect(cause({ ...pretAuto, originalBalance: undefined })).toBe('donnees-manquantes');
        expect(cause({ ...pretAuto, interestRate: undefined })).toBe('donnees-manquantes');
        expect(cause({ ...pretAuto, minimumPayment: undefined })).toBe('donnees-manquantes');
    });

    it('champ PRÉSENT mais corrompu : « donnees-invalides », une cause DISTINCTE', () => {
        expect(cause({ ...pretAuto, originalBalance: Number.NaN })).toBe('donnees-invalides');
        expect(cause({ ...pretAuto, interestRate: Number.POSITIVE_INFINITY })).toBe('donnees-invalides');
        expect(cause({ ...pretAuto, minimumPayment: 0 })).toBe('donnees-invalides');
        expect(cause({ ...pretAuto, balance: -1 })).toBe('donnees-invalides');
    });

    it('saisie INVERSÉE : « origine-incoherente », et pas fondue dans les précédentes', () => {
        expect(cause({ ...pretAuto, originalBalance: 5000 })).toBe('origine-incoherente');
    });
});

describe('[DEBT-AMORTIZATION-CABLAGE] les frontières du repère de mois', () => {
    it('une projection qui NE démarre PAS en janvier place le passé au bon mois', () => {
        // `CABLER-UNE-ANNEE-C-EST-CABLER-UNE-PAIRE` : tous les autres cas du fichier utilisent
        // `startMonth: 0`, la seule valeur où un « + startMonth » oublié serait invisible.
        // Projection démarrant en SEPTEMBRE 2026 : le mois de simulation −20 est janvier 2025.
        const attendu = supplementAmortiAuMoisAbsolu([pretAuto], mois(2025, 0), mois(2026, 8));
        expect(supplementAmortiAuMois([pretAuto], 2026, 8, -20)).toBe(attendu);
        expect(attendu).toBeGreaterThan(0);
        // Et le raccord vaut toujours EXACTEMENT zéro, quel que soit le mois de départ.
        expect(supplementAmortiAuMois([pretAuto], 2026, 8, 0)).toBe(0);
    });

    it('AU MOIS DE BASCULE (le `startDate` lui-même), une seule des deux corrections agit', () => {
        // Les cas voisins encadrent la bascule (−25 avant, −12 après) sans jamais tomber dessus :
        // c'est pourtant le seul mois où un double comptage pourrait exister.
        const bascule = -24; // janvier 2024 = le mois du `startDate` du prêt
        expect(sumNotYetStartedDebtsAtMonth([pretAuto], 2026, 0, bascule)).toBe(0);
        expect(supplementAmortiAuMois([pretAuto], 2026, 0, bascule)).toBeGreaterThan(0);
        // Le mois JUSTE avant : l'exact miroir, jamais les deux ensemble.
        expect(sumNotYetStartedDebtsAtMonth([pretAuto], 2026, 0, bascule - 1)).toBe(18000);
        expect(supplementAmortiAuMois([pretAuto], 2026, 0, bascule - 1)).toBe(0);
    });
});
