/**
 * [PASSE-REEL-RACCORD-CHUTE] D'où vient la marche à la frontière passé/aujourd'hui.
 *
 * Marc : « je vois une chute de 10k aujourd'hui, jsp pourquoi ». Ses données sont locales, donc
 * irreproductibles ici. Ce fichier MESURE donc le MÉCANISME sur des données construites, pour
 * établir la cause au lieu de la supposer.
 *
 * MÉCANIQUE. `reconstructCashHistoryDaily` remonte le temps À PARTIR du solde d'AUJOURD'HUI, en
 * DÉFAISANT les flux jour par jour. La série s'arrête à la VEILLE (aujourd'hui n'est pas
 * reconstruit : le présent vient de l'ancre du moteur). Il en découle, mécaniquement :
 *
 *     veille = solde_aujourd'hui − flux_du_jour
 *
 * Le dernier point du passé ANNULE donc les mouvements de la journée en cours, et la marche
 * veille→aujourd'hui vaut EXACTEMENT le flux net du jour.
 *
 * ⚠️ Ce n'est PAS un bug de calcul : l'argent est réellement sorti, les deux points sont justes.
 * C'est un défaut d'EXPLICATION — rien ne dit que la veille est un solde RECONSTRUIT qui a
 * volontairement défait la journée en cours. Une grosse dépense datée d'aujourd'hui (hypothèque,
 * transfert, facture) produit une chute de son montant exact, et revient à chaque échéance.
 */
import { describe, it, expect } from 'vitest';
import { reconstructCashHistoryDaily } from '../../services/history/reconstructCashHistory';
import type { MinimalPastTransaction } from '../../services/history/dailyPastLedger';

const AUJOURDHUI = '2026-08-17';
const VEILLE = '2026-08-16';

const txn = (o: Partial<MinimalPastTransaction>): MinimalPastTransaction =>
    ({ date: '2026-08-01', amount: 0, ...o }) as MinimalPastTransaction;

const veilleDe = (points: ReadonlyArray<{ date: string; cash: number }>): number => {
    const p = points.find((x) => x.date === VEILLE);
    if (!p) throw new Error('point de la veille absent');
    return p.cash;
};

describe('[PASSE-REEL-RACCORD-CHUTE] la marche vaut le flux du JOUR', () => {
    it('une grosse dépense datée AUJOURD’HUI crée une chute de son montant exact', () => {
        const soldeAujourdhui = 50_000;
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-10', amount: -100 }), txn({ date: AUJOURDHUI, amount: -10_000 })],
            soldeAujourdhui,
            AUJOURDHUI,
        );
        // La veille a été reconstruite en DÉFAISANT la sortie du jour : elle est donc PLUS HAUTE.
        expect(veilleDe(res.points)).toBe(soldeAujourdhui + 10_000);
        // La marche veille → aujourd'hui = −10 000 $. C'est LA chute que Marc voit.
        expect(soldeAujourdhui - veilleDe(res.points)).toBe(-10_000);
    });

    it('sans mouvement aujourd’hui, il n’y a AUCUNE marche', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-10', amount: -100 })],
            50_000,
            AUJOURDHUI,
        );
        // Garde DISCRIMINANTE : sans elle, le test précédent resterait compatible avec « la veille
        // est toujours décalée », ce qui accuserait la reconstruction au lieu du flux du jour.
        expect(50_000 - veilleDe(res.points)).toBe(0);
    });

    it('une ENTRÉE du jour produit la marche INVERSE (donc pas un biais à la baisse)', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-01', amount: -1 }), txn({ date: AUJOURDHUI, amount: +10_000 })],
            50_000,
            AUJOURDHUI,
        );
        expect(50_000 - veilleDe(res.points)).toBe(+10_000);
    });

    it('un VIREMENT interne daté aujourd’hui ne crée AUCUNE marche (exclu comme dans l’ancre)', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-01', amount: -1 }), txn({ date: AUJOURDHUI, amount: -10_000, isTransfer: true })],
            50_000,
            AUJOURDHUI,
        );
        expect(50_000 - veilleDe(res.points)).toBe(0);
    });
});

describe('[PASSE-REEL-RACCORD-CHUTE] la SECONDE cause, DISTINCTE : ce que l’ancre compte sans pouvoir le placer', () => {
    // Celle-ci décale TOUT le niveau passé au lieu de créer une marche d'un jour. Déjà exposée
    // (`undatedTotal`, `flowsAfterNowDate`) et affichée dans le bandeau « Courbe au jour ».
    it('une transaction datée au MOIS seul est comptée à part, jamais placée dans un jour', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-08', amount: -2_000 }), txn({ date: '2026-08-10', amount: -100 })],
            50_000,
            AUJOURDHUI,
        );
        expect(res.undatedTotal).toBe(-2_000);
        expect(veilleDe(res.points)).toBe(50_000);
    });

    it('une transaction datée APRÈS aujourd’hui est signalée, et ne bouge pas le passé', () => {
        const res = reconstructCashHistoryDaily(
            [txn({ date: '2026-09-01', amount: -3_000 }), txn({ date: '2026-08-10', amount: -100 })],
            50_000,
            AUJOURDHUI,
        );
        expect(res.flowsAfterNowDate).toBe(-3_000);
        expect(veilleDe(res.points)).toBe(50_000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// [PASSE-REEL-RACCORD-CHUTE] LE CORRECTIF : la marche est désormais DITE.
//
// Ce qui précède établit la CAUSE ; ce qui suit garde le remède. Rappel de l'arbitrage : on ne
// LISSE pas la marche — ce serait fabriquer un solde que Marc n'a jamais eu. Le correctif est une
// PHRASE, et le fait qu'elle énonce vient du module qui PRODUIT la marche, jamais d'une seconde
// lecture des transactions.
import { readFileSync } from 'node:fs';
import { buildDailyPastLedger } from '../../services/history/dailyPastLedger';
import { mentionRaccord } from '../../services/history/raccordNotice';
import { stripCommentsJsx, partDeCodeRestante } from '../../utils/stripComments';
import type { MinimalAsset } from '../../services/history/reconstructPortfolioHistory';

describe('[PASSE-REEL-RACCORD-CHUTE] le flux annulé est PUBLIÉ, et il vaut la marche', () => {
    it('le champ publié égale la MARCHE réellement visible, pas une re-somme des transactions', () => {
        // ⚠️ Assertion NON CIRCULAIRE : on compare le champ à l'écart mesuré entre le dernier point
        // du passé et le solde d'aujourd'hui. Le comparer à une somme des transactions re-écrite ici
        // ne prouverait que « deux additions identiques donnent le même résultat ».
        const soldeAujourdhui = 50_000;
        const r = reconstructCashHistoryDaily(
            [txn({ date: '2026-08-01', amount: 1_000 }), txn({ date: AUJOURDHUI, amount: -10_000 })],
            soldeAujourdhui, AUJOURDHUI,
        );
        const marche = soldeAujourdhui - veilleDe(r.points);
        expect(marche).toBe(-10_000);              // la chute que Marc a vue
        expect(r.fluxPeriodeAnnulee).toBe(marche); // et le champ la NOMME
    });

    it('aucun mouvement aujourd\'hui ⇒ champ nul ⇒ AUCUNE phrase', () => {
        // Anti-bruit : un avertissement permanent est un avertissement mort.
        const r = reconstructCashHistoryDaily([txn({ date: '2026-08-01', amount: 1_000 })], 50_000, AUJOURDHUI);
        expect(r.fluxPeriodeAnnulee).toBe(0);
        expect(veilleDe(r.points)).toBe(50_000);   // pas de marche non plus
        expect(mentionRaccord(r.fluxPeriodeAnnulee)).toBe('');
    });

    it('MÊME base d\'exclusion que la courbe : un doublon ou un virement interne ne compte pas', () => {
        // Sinon la phrase annoncerait une marche que la courbe ne montre pas — pire que le silence.
        const r = reconstructCashHistoryDaily([
            txn({ date: '2026-08-01', amount: 1_000 }),
            txn({ date: AUJOURDHUI, amount: -10_000, isTransfer: true }),
            txn({ date: AUJOURDHUI, amount: -7_000, isDuplicate: true }),
        ], 50_000, AUJOURDHUI);
        expect(r.fluxPeriodeAnnulee).toBe(0);
        expect(50_000 - veilleDe(r.points)).toBe(0);
    });

    it('le SENS est dit : une entrée fait monter, une sortie fait descendre', () => {
        // Annoncer « chute » sur une entrée enverrait chercher un problème inexistant.
        expect(mentionRaccord(-10_000)).toMatch(/vers le bas/);
        expect(mentionRaccord(10_000)).toMatch(/vers le haut/);
        expect(mentionRaccord(0)).toBe('');
        expect(mentionRaccord(Number.NaN)).toBe('');
    });

    it('la phrase ne porte AUCUN montant — elle survit au mode discret', () => {
        // Un montant interpolé dans une chaîne n'est plus un nœud, donc plus masquable. Le FAIT
        // suffit : le montant est déjà lisible sur la courbe.
        for (const v of [-10_000, 10_000, -0.5, 12_345.67]) {
            expect(mentionRaccord(v)).not.toMatch(/\d/);
        }
    });
});

describe('[PASSE-REEL-RACCORD-CHUTE] le fait traverse jusqu\'à l\'écran', () => {
    const actif: MinimalAsset = {
        symbol: 'AAA', quantity: 10, currency: 'CAD', currentPrice: 100, accountType: 'CELI',
        purchases: [{ date: '2026-08-02', quantity: 10, price: 90 }],
        priceHistory: [
            { date: '2026-08-01', price: 88 }, { date: '2026-08-02', price: 90 },
            { date: '2026-08-16', price: 95 }, { date: AUJOURDHUI, price: 97 },
        ],
    };

    it('`buildDailyPastLedger` REMONTE le champ, il ne le recalcule pas', () => {
        // Le registre au jour est la seule surface qui parle à l'écran : si le champ s'arrête ici,
        // le correctif est inerte en prod même avec toutes les gardes ci-dessus vertes
        // (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
        const res = buildDailyPastLedger({
            from: '2026-08-01', to: AUJOURDHUI, today: AUJOURDHUI,
            transactions: [
                { date: '2026-08-01', amount: 2_000, payee: 'Paie' },
                { date: AUJOURDHUI, amount: -10_000, payee: 'Hypothèque' },
            ],
            currentCash: 50_000, assets: [actif], fx: {},
            equityByYear: new Map([[2026, 0]]), currentDebtNonImmo: 0, debts: [],
        });
        expect(res.rows.length, 'anti-vacuité : le registre doit produire des jours').toBeGreaterThan(1);
        expect(res.fluxPeriodeAnnulee).toBe(-10_000);
        expect(mentionRaccord(res.fluxPeriodeAnnulee)).toMatch(/vers le bas/);
    });

    it('l\'écran CONSOMME la source unique, il ne réécrit pas la phrase', () => {
        // Garde JUMELLE : la précédente prouve ce que le module rend, celle-ci interdit de refaire
        // le travail dans le JSX — où il divergerait sans que rien ne rougisse.
        const brut = readFileSync('components/FutureProjection.tsx', 'utf8');
        const code = stripCommentsJsx(brut);
        // Seuil re-mesuré à la portée de CE fichier (majoritairement de la prose par conception).
        expect(partDeCodeRestante(brut, code)).toBeGreaterThan(0.4);
        expect(code).toContain('export const FutureProjection'); // témoin de code indépendant
        // ⚠️ Ancré sur l'APPEL avec son ARGUMENT, jamais sur le nom seul : mesuré, débrancher le
        // `useMemo` laissait `toContain('mentionRaccord')` vert (l'IMPORT porte le même nom) et
        // `toContain('fluxPeriodeAnnulee')` vert aussi (la construction du memo le nomme). Un scan
        // qui matche la DÉCLARATION au lieu de l'USAGE est vacueux.
        expect(code).toContain('mentionRaccord(dailyPast.fluxPeriodeAnnulee)');
        // ... et le résultat doit être RENDU, pas seulement calculé.
        expect(code).toContain('{mentionRaccordJour');
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// [PASSE-REEL-RACCORD-CHUTE-MENSUEL] La MÊME marche, en plus gros, sur la vue par DÉFAUT.
//
// Le lot 96 avait livré l'explication côté vue au JOUR et ROUTÉ celle-ci : la version mensuelle a le
// même mécanisme, mais son dernier point passé annule **tout le mois courant** au lieu d'une journée.
// La marche est donc structurellement plus grosse — et c'est la vue que Marc voit par défaut.
import { reconstructCashHistory } from '../../services/history/reconstructCashHistory';
import { buildPastPrefix } from '../../services/history/buildPastPrefix';
import type { PortfolioHistoryPoint } from '../../services/history/reconstructPortfolioHistory';

const MOIS_COURANT = '2026-08';
const MOIS_PRECEDENT = '2026-07';

const moisPrecedentDe = (points: ReadonlyArray<{ month: string; cash: number }>): number => {
    const p = points.find((x) => x.month === MOIS_PRECEDENT);
    if (!p) throw new Error('point du mois précédent absent');
    return p.cash;
};

describe('[PASSE-REEL-RACCORD-CHUTE-MENSUEL] la marche vaut TOUT le mois courant', () => {
    it('le champ publié égale la MARCHE réellement visible', () => {
        // Non circulaire, comme au jour : on compare le champ à l'écart mesuré entre le dernier point
        // du passé et le solde d'aujourd'hui — pas à une somme des transactions réécrite ici.
        const soldeAujourdhui = 50_000;
        const r = reconstructCashHistory([
            { date: '2026-06-15', amount: 1_000 },
            { date: '2026-08-01', amount: -10_000 },  // hypothèque
            { date: '2026-08-14', amount: -900 },     // épicerie du mois
        ], soldeAujourdhui, MOIS_COURANT);
        const marche = soldeAujourdhui - moisPrecedentDe(r.points);
        expect(marche).toBe(-10_900);              // TOUT le mois, pas une journée
        expect(r.fluxPeriodeAnnulee).toBe(marche);
    });

    it('la marche MENSUELLE est plus GROSSE que la marche du JOUR sur les mêmes données', () => {
        // C'est la raison d'être du ticket : le lot 96 a expliqué la petite, la grosse restait muette
        // sur la vue par DÉFAUT. Le test le mesure au lieu de l'affirmer.
        const txns = [
            { date: '2026-06-15', amount: 1_000 },
            { date: '2026-08-01', amount: -10_000 },
            { date: '2026-08-14', amount: -900 },
        ];
        const mois = reconstructCashHistory(txns, 50_000, MOIS_COURANT).fluxPeriodeAnnulee;
        const jour = reconstructCashHistoryDaily(txns, 50_000, '2026-08-14').fluxPeriodeAnnulee;
        expect(jour).toBe(-900);
        expect(Math.abs(mois)).toBeGreaterThan(Math.abs(jour));
    });

    it('aucun mouvement ce mois-ci ⇒ champ nul ⇒ AUCUNE phrase', () => {
        const r = reconstructCashHistory([{ date: '2026-06-15', amount: 1_000 }], 50_000, MOIS_COURANT);
        expect(r.fluxPeriodeAnnulee).toBe(0);
        expect(mentionRaccord(r.fluxPeriodeAnnulee)).toBe('');
    });

    it('MÊME base d\'exclusion que la courbe : doublon et virement interne ne comptent pas', () => {
        const r = reconstructCashHistory([
            { date: '2026-06-15', amount: 1_000 },
            { date: '2026-08-02', amount: -10_000, isTransfer: true },
            { date: '2026-08-03', amount: -7_000, isDuplicate: true },
        ], 50_000, MOIS_COURANT);
        expect(r.fluxPeriodeAnnulee).toBe(0);
        expect(50_000 - moisPrecedentDe(r.points)).toBe(0);
    });
});

describe('[PASSE-REEL-RACCORD-CHUTE-MENSUEL] le fait traverse `buildPastPrefix`', () => {
    const invPoint = (date: string): PortfolioHistoryPoint =>
        ({ date, monthIndex: 0, CELI: 50_000, CELIAPP: 0, REER: 0, REEE: 0, NonReg: 0, Crypto: 0, InvestedValue: 50_000 });

    it('le préfixe passé REMONTE le champ, il ne le recalcule pas', () => {
        // `buildPastPrefix` rendait un tableau NU : c'est ce fil manquant qui avait fait router le
        // ticket au lot 96. Sans cette assertion, le correctif serait vert en test et INERTE en prod.
        const res = buildPastPrefix({
            pastHistoryPoints: [invPoint('2026-06-30'), invPoint('2026-07-31')],
            transactions: [
                { date: '2026-06-15', amount: 1_000 },
                { date: '2026-08-01', amount: -10_000 },
            ],
            calculatedStartingCash: 3_000,
            realEstateGoals: [],
            startYear: 2026, startMonth: 7, // août = mois 0 de la projection
            currentDebtNonImmo: 0,
            debts: [],
        });
        expect(res.points.length, 'anti-vacuité : le préfixe doit produire des mois').toBeGreaterThan(0);
        expect(res.fluxPeriodeAnnulee).toBe(-10_000);
        expect(mentionRaccord(res.fluxPeriodeAnnulee)).toMatch(/vers le bas/);
    });

    it('l\'écran consomme la source MENSUELLE et la gate sur la vue au jour', () => {
        // Garde jumelle, ancrée sur l'APPEL avec son argument (leçon du lot 96 : chercher le nom seul
        // est vacueux, l'import et la construction le portent aussi).
        const brut = readFileSync('components/FutureProjection.tsx', 'utf8');
        const code = stripCommentsJsx(brut);
        expect(partDeCodeRestante(brut, code)).toBeGreaterThan(0.4);
        expect(code).toContain('export const FutureProjection');
        expect(code).toContain('mentionRaccord(pastPrefix.fluxPeriodeAnnulee)');
        expect(code).toContain('{mentionRaccordMois');
        // ⚠️ Le GATE fait partie du fait défendu : sans lui, la vue au jour afficherait DEUX phrases,
        // dont une qui décrit un raccord absent de l'écran.
        expect(code).toContain("dailyPast !== null ? '' : mentionRaccord(pastPrefix.fluxPeriodeAnnulee)");
    });
});
