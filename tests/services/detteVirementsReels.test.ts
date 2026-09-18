// tests/services/detteVirementsReels.test.ts
//
// [DETTE-VIREMENTS-REELS] — la dette suit les VRAIS virements, plus une grille modélisée.
//
// Marc, 2026-09-18 : « ca marfhe pas pour la dette je vais faire simple pour toi je veux que chaque
// fois que je paie toyota ca enleve ca de la dette, faut que ma dette soit lié a chaque fois que je
// fais un virement du bon montant a toyota ». Puis, devant la question du virement MANQUANT :
// « suivre les vrais virements, point » — aucun chiffre inventé, jamais.
//
// ⚠️ LA FIXTURE EST SA SITUATION RÉELLE, et c'est elle qui porte le CONTRÔLE NÉGATIF : huit
// `Toyota Financial` à −234,67 $ (le financement du bail) ET deux `Ste Foy Toyota Quebec` à
// −500,00 $ et −779,79 $ (le CONCESSIONNAIRE, en juillet). Un appariement lâche — « le libellé
// contient toyota » — retirerait 1 279,79 $ de sa dette pour des achats qui n'en remboursent rien.
// C'est exactement le genre d'erreur qu'aucun cas nominal ne révèle : les deux lignes sont du même
// marchand aux yeux d'un humain pressé.
//
// ⚠️ MESURES DE RÉFÉRENCE (2026-09-18, sur cette fixture). Elles disent ce que le lot CHANGE :
//   · série au mois, LIÉE aux virements : 48 811,36 | 48 576,69 | 47 403,34 (juillet → septembre)
//   · série au mois, GRILLE modélisée   : 49 046,02 | 48 576,68 | 47 403,34
//   L'écart de JUILLET (234,66 $) est le cœur du lot : la grille inventait un versement de plus que
//   ce que les transactions connaissent. Les mois suivants coïncident au cent près — le modèle
//   n'était pas faux, il était SUPPOSÉ ; la différence se voit là où la supposition dépasse la mesure.

import { describe, it, expect } from 'vitest';
import {
    amortirDettePassee,
    soldeDetteAujourdhui,
    statutSoldeDette,
    dettesAuSoldeDuJour,
    prepareSupplementAmortiParJour,
    prepareSupplementAmortiAbsolu,
    paiementsReelsDette,
    marchandsCandidats,
    clePayee,
    type MouvementDette,
    type EntreeAmortissement,
} from '../../services/projection/debtAmortization';

const AUJ = '2026-09-18';
const MOIS = 2026 * 12 + 8;   // septembre 2026, en mois absolu
const MONTANT = 234.67;
const VERSEMENTS = ['2026-07-28', '2026-08-05', '2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01', '2026-09-09', '2026-09-15'];

const TX: MouvementDette[] = [
    ...VERSEMENTS.map(date => ({ date, payee: 'Toyota Financial', amount: -MONTANT })),
    // CONTRÔLE NÉGATIF, dans les données : le concessionnaire, pas le financement.
    { date: '2026-07-14', payee: 'Ste Foy Toyota Quebec', amount: -500.00 },
    { date: '2026-07-20', payee: 'Ste Foy Toyota Quebec', amount: -779.79 },
];

/** Le bail de Marc, sans lien : il descend par la GRILLE modélisée (comportement d'avant ce lot). */
const GRILLE: EntreeAmortissement = {
    kind: 'auto-lease', balance: 46_934, interestRate: 0, minimumPayment: 1_016.90,
    startDate: '2026-07-14', termEndDate: '2030-07-14', paymentFrequency: 'weekly', balanceAsOf: AUJ,
};
/** Le même bail, LIÉ à ses virements réels. */
const LIE: EntreeAmortissement = { ...GRILLE, paymentPayee: 'Toyota Financial' };

const soldesDe = (d: EntreeAmortissement, tx = TX): number[] => {
    const r = amortirDettePassee(d, MOIS, AUJ, tx);
    expect(r.forme).toBe('ok');
    return r.forme === 'ok' ? r.soldes : [];
};

describe('[DETTE-VIREMENTS-REELS] l’appariement du marchand', () => {
    it('n’apparie QUE le marchand exact — le concessionnaire n’est pas un versement du bail', () => {
        const p = paiementsReelsDette(LIE, TX, Date.parse(`${AUJ}T00:00:00Z`));
        expect(p).not.toBeNull();
        expect(p!.length).toBe(VERSEMENTS.length);
        // ⚠️ L'assertion qui compte : la SOMME. Un appariement lâche passerait le compte à 10 et la
        // somme à 3 157,15 $ — 1 279,79 $ retirés d'une dette pour des achats chez le concessionnaire.
        expect(p!.reduce((s, x) => s + x.montant, 0)).toBeCloseTo(MONTANT * 8, 2);
        expect(p!.map(x => new Date(x.ms).toISOString().slice(0, 10))).toEqual(VERSEMENTS);
    });

    it('un DOUBLON marqué ne retire pas deux fois le même versement', () => {
        const avecDoublon = [...TX, { date: '2026-09-15', payee: 'Toyota Financial', amount: -MONTANT, isDuplicate: true }];
        const p = paiementsReelsDette(LIE, avecDoublon, Date.parse(`${AUJ}T00:00:00Z`));
        expect(p!.length).toBe(VERSEMENTS.length);
    });

    it('un virement marqué VIREMENT INTERNE ne compte PAS — sinon on fabrique du patrimoine', () => {
        // ⚠️⚠️ **CE TEST AFFIRMAIT L'INVERSE, et la mesure l'a réfuté.** Il portait « un
        // remboursement EN est un » et gardait les lignes marquées `isTransfer`, au motif que le
        // cash et la dette répondent à deux questions distinctes. Faux pour le PATRIMOINE NET : le
        // registre du cash EXCLUT `isTransfer` partout, donc une dette qui l'inclut descend sans
        // que l'actif descende. Mesuré sur ces huit virements — **−25 291,31 $ au lieu de
        // −27 168,67 $, soit 1 877,36 $ CRÉÉS**, et 234,67 $ de plus par semaine. Le test est
        // INVERSÉ au même endroit avec son histoire, jamais supprimé : c'est cette trace qui
        // empêche de re-tenter l'inclusion « pour que la dette continue de descendre ».
        const classes = TX.map(t => ({ ...t, isTransfer: true }));
        const p = paiementsReelsDette(LIE, classes, Date.parse(`${AUJ}T00:00:00Z`));
        expect(p!.length).toBe(0);
        // …et le marchand n'est même plus OFFERT : ce qui est proposé doit être appariable.
        expect(marchandsCandidats(classes).some(m => m.payee === 'Toyota Financial')).toBe(false);
    });

    it('CONSERVATION — marquer ses virements ne CRÉE pas de patrimoine', () => {
        // L'invariant qui a tranché, écrit ici pour qu'il tranche encore : le patrimoine net doit
        // être le MÊME que la ligne soit marquée ou non, parce que les deux registres l'écartent
        // ensemble. `isDuplicate` est le contrôle — il conservait déjà.
        const nw = (tx: MouvementDette[]): number =>
            20_000 - tx.filter(t => !t.isDuplicate && !t.isTransfer).reduce((s2, t) => s2 + Math.abs(t.amount), 0)
            - soldeDetteAujourdhui({ ...LIE, balanceAsOf: '2026-07-24' }, AUJ, tx);
        // ⚠️ SEULES les lignes du financement sont marquées : marquer AUSSI les deux achats chez le
        // concessionnaire les retirerait du cash sans rien changer à la dette (ils n'y entrent
        // jamais), et le test mesurerait ce déplacement-là — 1 279,79 $, mesuré, pour rien.
        const marque = (f: Partial<MouvementDette>) =>
            TX.map(t => (t.payee === 'Toyota Financial' ? { ...t, ...f } : t));
        const normal = nw(TX);
        expect(nw(marque({ isTransfer: true }))).toBeCloseTo(normal, 2);
        expect(nw(marque({ isDuplicate: true }))).toBeCloseTo(normal, 2);
        // ⚠️ Anti-vacuité : la fixture doit VRAIMENT faire descendre la dette, sinon les trois
        // mondes sont égaux parce que rien ne se passe.
        expect(soldeDetteAujourdhui({ ...LIE, balanceAsOf: '2026-07-24' }, AUJ, TX)).toBeLessThan(46_934);
    });

    it('un encaissement (montant POSITIF) et un virement POST-DATÉ ne comptent pas', () => {
        const sales: MouvementDette[] = [
            ...TX,
            { date: '2026-09-10', payee: 'Toyota Financial', amount: +MONTANT },   // remboursement reçu
            { date: '2026-09-25', payee: 'Toyota Financial', amount: -MONTANT },   // pas encore prélevé
        ];
        const p = paiementsReelsDette(LIE, sales, Date.parse(`${AUJ}T00:00:00Z`));
        expect(p!.length).toBe(VERSEMENTS.length);
    });

    it('une dette SANS lien rend `null` : il n’y a rien à chercher', () => {
        expect(paiementsReelsDette(GRILLE, TX, Date.parse(`${AUJ}T00:00:00Z`))).toBeNull();
    });

    it('la clé se normalise aux DEUX bouts — un libellé espacé apparie encore', () => {
        // ⚠️ Anti-vacuité du NORMALISATEUR lui-même : sans elle, une clé qui n'appariait plus rien
        // laisserait ce test vert par le bas (`UNE-GARDE-ECRITE-CONTRE-UN-PIEGE-CONNU-LE-RECOMMET`).
        expect(clePayee('  Toyota Financial  ')).toBe('Toyota Financial');
        expect(clePayee(undefined)).toBe('');
        const espaces = TX.map(t => ({ ...t, payee: `  ${t.payee}  ` }));
        const p = paiementsReelsDette({ ...LIE, paymentPayee: ' Toyota Financial ' }, espaces, Date.parse(`${AUJ}T00:00:00Z`));
        expect(p!.length).toBe(VERSEMENTS.length);
        // …et le trim ne FUSIONNE pas deux marchands distincts : la casse reste discriminante.
        expect(paiementsReelsDette({ ...LIE, paymentPayee: 'toyota financial' }, TX, Date.parse(`${AUJ}T00:00:00Z`))!.length).toBe(0);
    });
});

describe('[DETTE-VIREMENTS-REELS] la série du passé suit les virements, pas un rythme supposé', () => {
    it('TRAVERSÉE — juillet diverge de la grille d’exactement un versement, août et septembre coïncident', () => {
        const lie = soldesDe(LIE);
        const grille = soldesDe(GRILLE);
        expect(lie.length).toBe(3);
        expect(lie).toEqual(grille.map((_, i) => lie[i]));   // même longueur, même indexation
        // Mesuré le 2026-09-18 — les trois points, au cent près.
        expect(lie[0]).toBeCloseTo(48_811.36, 2);
        expect(lie[1]).toBeCloseTo(48_576.69, 2);
        expect(lie[2]).toBeCloseTo(47_403.34, 2);
        // ⚠️ C'EST L'ÉCART DE JUILLET QUI EST LE LOT : la grille modélisée y plaçait un versement
        // que les transactions ne connaissent pas. Une garde sur la seule VALEUR de `lie[0]` ne
        // dirait pas ça — c'est la DIFFÉRENCE qui est le fait.
        expect(grille[0] - lie[0]).toBeCloseTo(MONTANT, 0);
        expect(grille[1] - lie[1]).toBeCloseTo(0, 1);
        expect(grille[2] - lie[2]).toBeCloseTo(0, 1);
    });

    it('CONTRÔLE NÉGATIF — sans aucune transaction, la dette liée reste PLATE (rien d’inventé)', () => {
        const plate = soldesDe(LIE, []);
        expect(new Set(plate.map(v => v.toFixed(2))).size).toBe(1);
        expect(plate[0]).toBeCloseTo(46_934, 2);
        // …alors que la GRILLE, elle, continue de descendre sans la moindre transaction.
        const grille = soldesDe(GRILLE, []);
        expect(grille[0]).toBeGreaterThan(grille[2] + 500);
    });

    it('une dette LIÉE ne retombe JAMAIS sur la grille, même quand le jour est inconnu', () => {
        // ⚠️ La perturbation de cette garde est de retirer le repli `lieeAUnPayee` : la descente
        // modélisée reviendrait alors par le bas, sans rien de visible
        // (`CORRECTIF-VERT-EN-TEST-INERTE-EN-PROD`).
        const r = amortirDettePassee(LIE, MOIS, null, TX);
        expect(r.forme).toBe('ok');
        if (r.forme === 'ok') {
            expect(new Set(r.soldes.map(v => v.toFixed(2))).size).toBe(1);
            expect(r.soldeAujourdhui).toBeCloseTo(46_934, 2);
        }
    });

    it('un TAUX non nul refuse la déduction par virements — un versement y paie aussi de l’intérêt', () => {
        const r = amortirDettePassee({ ...LIE, interestRate: 6.59 }, MOIS, AUJ, TX);
        expect(r.forme).toBe('inapplicable');
        if (r.forme === 'inapplicable') expect(r.cause).toBe('taux-sur-solde-tout-compris');
    });
});

describe('[DETTE-VIREMENTS-REELS] le JOUR et le MOIS décrivent la MÊME dette', () => {
    const auJour = prepareSupplementAmortiParJour([LIE as never], MOIS, AUJ, TX);

    it('le supplément descend le JOUR du virement, pas le 1er du mois', () => {
        // Mesuré : la marche tombe entre le 8 et le 9 septembre (virement du 09-09), puis entre le
        // 14 et le 15 (virement du 09-15). Les paliers de part et d'autre sont PLATS.
        expect(auJour('2026-09-08')).toBeCloseTo(MONTANT * 2, 2);
        expect(auJour('2026-09-09')).toBeCloseTo(MONTANT, 2);
        expect(auJour('2026-09-14')).toBeCloseTo(MONTANT, 2);
        expect(auJour('2026-09-15')).toBeCloseTo(0, 2);
        // ⚠️ Anti-vacuité : sans marche, les quatre valeurs ci-dessus seraient égales.
        expect(auJour('2026-09-08')).not.toBeCloseTo(auJour('2026-09-09'), 2);
    });

    it('avant le PREMIER virement connu, le supplément ne bouge plus — l’app ne sait rien d’avant', () => {
        expect(auJour('2026-07-27')).toBeCloseTo(MONTANT * 8, 2);
        expect(auJour('2026-07-01')).toBeCloseTo(MONTANT * 8, 2);
        expect(auJour('2026-07-28')).toBeCloseTo(MONTANT * 7, 2);
    });

    it('la série MENSUELLE est DÉRIVÉE de la même source : les deux registres se recomposent', () => {
        // ⚠️ Deux calculs indépendants du même solde divergent d'un mois de versements sans que rien
        // ne rougisse, aucun des deux n'étant faux tout seul. Le raccord se vérifie au 1er du mois.
        const auMois = prepareSupplementAmortiAbsolu([LIE as never], MOIS, AUJ, TX);
        for (const [m, jour] of [[MOIS - 2, '2026-07-01'], [MOIS - 1, '2026-08-01'], [MOIS, '2026-09-01']] as const) {
            expect(auMois(m)).toBeCloseTo(auJour(jour), 6);
        }
    });
});

describe('[DETTE-VIREMENTS-REELS] le solde du jour et la porte du moteur', () => {
    it('une estampille ANTÉRIEURE déduit les virements survenus depuis, et eux seuls', () => {
        // Estampille au 2026-09-02 : restent les virements du 09-09 et du 09-15.
        const dette = { ...LIE, balanceAsOf: '2026-09-02' };
        expect(soldeDetteAujourdhui(dette, AUJ, TX)).toBeCloseTo(46_934 - MONTANT * 2, 2);
        // CONTRÔLE : estampillée AUJOURD'HUI, plus rien à déduire.
        expect(soldeDetteAujourdhui(LIE, AUJ, TX)).toBeCloseTo(46_934, 2);
    });

    it('la porte du moteur rend le solde déduit ET reste IDEMPOTENTE', () => {
        const dette = { ...LIE, balanceAsOf: '2026-09-02' };
        const [un] = dettesAuSoldeDuJour([dette], AUJ, TX);
        expect(un.balance).toBeCloseTo(46_934 - MONTANT * 2, 2);
        expect(un.balanceAsOf).toBe(AUJ);
        // ⚠️ Une seconde application ne déduit RIEN de plus : sans ça, un lot futur qui rappellerait
        // la porte retirerait les virements deux fois, faux dans l'autre sens et sans rien de rouge.
        const [deux] = dettesAuSoldeDuJour([un], AUJ, TX);
        expect(deux.balance).toBeCloseTo(un.balance, 6);
    });
});

describe('[DETTE-VIREMENTS-REELS] ce que l’écran a le droit d’affirmer', () => {
    it('lié avec des virements depuis l’estampille → `suit-les-virements`, avec le compte et le DERNIER jour', () => {
        const s = statutSoldeDette({ ...LIE, balanceAsOf: '2026-09-02' }, AUJ, TX);
        expect(s.forme).toBe('suit-les-virements');
        if (s.forme === 'suit-les-virements') {
            expect(s.payee).toBe('Toyota Financial');
            expect(s.nbDeduits).toBe(2);
            expect(s.dernierIso).toBe('2026-09-15');
        }
    });

    it('lié SANS aucun virement de ce marchand → `lie-sans-virement` : le seul état qui appelle un geste', () => {
        const s = statutSoldeDette({ ...LIE, paymentPayee: 'Marchand Inexistant' }, AUJ, TX);
        expect(s.forme).toBe('lie-sans-virement');
        if (s.forme === 'lie-sans-virement') expect(s.payee).toBe('Marchand Inexistant');
    });

    it('lié mais rien depuis l’estampille → `nbDeduits: 0`, PAS un état d’alerte', () => {
        const s = statutSoldeDette(LIE, AUJ, TX);
        expect(s.forme).toBe('suit-les-virements');
        if (s.forme === 'suit-les-virements') {
            expect(s.nbDeduits).toBe(0);
            expect(s.dernierIso).toBeNull();
        }
    });

    it('NON-RÉGRESSION — sans lien, la grille modélisée rend toujours `suit-les-versements`', () => {
        expect(statutSoldeDette(GRILLE, AUJ, TX).forme).toBe('suit-les-versements');
    });
});

describe('[DETTE-VIREMENTS-REELS] la liste offerte au lien vient de la MÊME clé que l’appariement', () => {
    it('compte les sorties par marchand, du plus fréquent au moins fréquent', () => {
        expect(marchandsCandidats(TX)).toEqual([
            { payee: 'Toyota Financial', nb: 8 },
            { payee: 'Ste Foy Toyota Quebec', nb: 2 },
        ]);
    });

    it('écarte les doublons, les encaissements et les libellés vides', () => {
        const sales: MouvementDette[] = [
            ...TX,
            { date: '2026-09-15', payee: 'Toyota Financial', amount: -MONTANT, isDuplicate: true },
            { date: '2026-09-16', payee: 'Toyota Financial', amount: +MONTANT },
            { date: '2026-09-16', payee: '   ', amount: -10 },
        ];
        expect(marchandsCandidats(sales).find(m => m.payee === 'Toyota Financial')!.nb).toBe(8);
        expect(marchandsCandidats(sales).some(m => m.payee === '')).toBe(false);
    });

    it('tout marchand offert est appariable — la liste et le matcher partagent `clePayee`', () => {
        // ⚠️ Le vrai risque n'est pas qu'un nom manque : c'est qu'on OFFRE un libellé que
        // l'appariement ne retrouvera jamais. Mesuré sur des libellés espacés, la forme qui casse.
        // ⚠️ REDONDANCE MESURÉE, et écrite plutôt que masquée : perturber le seul `marchandsCandidats`
        // (lui retirer `clePayee`) laisse ce cas VERT, parce que le matcher normalise DÉJÀ ses deux
        // côtés. Ce qui le fait rougir, c'est de dénormaliser le matcher côté DETTE — mesuré. Le
        // test garde donc le FAIT (« ce qui est offert est appariable ») et non le mécanisme
        // (`UNE-PERTURBATION-MUETTE-SUR-SON-PROPRE-AJOUT-MESURE-SA-REDONDANCE`).
        const espaces = TX.map(t => ({ ...t, payee: ` ${t.payee} ` }));
        for (const m of marchandsCandidats(espaces)) {
            const p = paiementsReelsDette({ ...GRILLE, paymentPayee: m.payee }, espaces, Date.parse(`${AUJ}T00:00:00Z`));
            expect(p!.length).toBe(m.nb);
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Gardes nées du PANEL, APRÈS un gate vert et une CI verte sur le premier jet. Chacune porte sa
// MESURE : le panel a trouvé ce qu'aucune de mes 22 gardes ne pouvait voir, parce que ma fixture
// décrivait un bail EN COURS, correctement daté, lié au bon marchand — le cas nominal.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('[DETTE-VIREMENTS-REELS] les BORNES que la grille avait et que les virements n’avaient pas', () => {
    /** Un bail ÉTEINT le 2026-06-30 dont il reste 5 000 $, et dont le prêteur prélève TOUJOURS
     *  234,67 $/semaine — le cas réel d'un bail REMPLACÉ chez le même prêteur : même libellé de
     *  marchand, autre dette. */
    const TERMINE: EntreeAmortissement = {
        kind: 'auto-lease', balance: 5_000, interestRate: 0, minimumPayment: 1_016.90,
        startDate: '2022-07-01', termEndDate: '2026-06-30', paymentFrequency: 'weekly', balanceAsOf: '2026-06-30',
    };
    const APRES: MouvementDette[] = ['2026-07-07', '2026-07-14', '2026-07-21', '2026-07-28', '2026-08-04',
        '2026-08-11', '2026-08-18', '2026-08-25', '2026-09-01', '2026-09-08', '2026-09-15']
        .map(date => ({ date, payee: 'Toyota Financial', amount: -MONTANT }));

    it('après la FIN DU TERME, aucun virement ne descend plus la dette — comme la grille', () => {
        // ⚠️ Mesuré AVANT la borne : solde du jour **2 418,63 $** au lieu de 5 000 $, soit
        // −2 581,37 $ de dette effacée, croissant de 234,67 $/semaine — pendant que la GRILLE, elle,
        // restait plate à 5 000 $. C'est l'asymétrie entre les deux sources qui a démasqué le trou
        // (`EFFACER-SUR-UNE-DATE-FABRIQUE-DU-PATRIMOINE`).
        const lie = { ...TERMINE, paymentPayee: 'Toyota Financial' };
        expect(soldeDetteAujourdhui(lie, AUJ, APRES)).toBeCloseTo(5_000, 2);
        const r = amortirDettePassee(lie, MOIS, AUJ, APRES);
        expect(r.forme).toBe('ok');
        if (r.forme === 'ok') expect(new Set(r.soldes.slice(-3).map(v => v.toFixed(2))).size).toBe(1);
        // CONTRÔLE : la grille modélisée rendait déjà ce résultat — les deux sources s'accordent.
        expect(soldeDetteAujourdhui(TERMINE, AUJ, APRES)).toBeCloseTo(5_000, 2);
    });

    it('une dette PAS ENCORE COMMENCÉE n’est pas descendue non plus', () => {
        // Elle ne contribue pas à `currentDebtNonImmo` (cf. `sumNotYetStartedDebts…`) : la corriger
        // ferait diverger deux registres du même solde.
        const futur = { ...LIE, startDate: '2027-01-01', termEndDate: '2031-01-01', balanceAsOf: '2026-09-01' };
        expect(soldeDetteAujourdhui(futur, AUJ, TX)).toBeCloseTo(46_934, 2);
        // CONTRÔLE : la même dette, commencée, EST corrigée.
        expect(soldeDetteAujourdhui({ ...LIE, balanceAsOf: '2026-09-01' }, AUJ, TX)).toBeLessThan(46_934);
    });

    it('des virements qui DÉPASSENT le solde enregistré sont REFUSÉS, jamais rabattus à zéro', () => {
        // ⚠️ Mesuré AVANT le refus, sur un lien vers une épicerie à 400 sorties : `Math.max(0, …)`
        // rendait **0,00 $** — 47 168,67 $ effacés sous une phrase rassurante et SANS alerte. Le
        // piège était dans le tri de la liste offerte : `marchandsCandidats` classe par fréquence
        // DÉCROISSANTE, donc l'option la plus dangereuse est la PREMIÈRE.
        const beaucoup: MouvementDette[] = Array.from({ length: 400 }, (_, i) => ({
            date: `2026-0${1 + Math.floor(i / 60) % 9}-${String(1 + i % 28).padStart(2, '0')}`,
            payee: 'Épicerie', amount: -120,
        }));
        const malLie = { ...LIE, paymentPayee: 'Épicerie', balanceAsOf: '2025-09-20' };
        expect(soldeDetteAujourdhui(malLie, AUJ, beaucoup)).toBeCloseTo(46_934, 2);
        const s = statutSoldeDette(malLie, AUJ, beaucoup);
        expect(s.forme).toBe('virements-incoherents');
        if (s.forme === 'virements-incoherents') {
            expect(s.payee).toBe('Épicerie');
            expect(s.nbDeduits).toBeGreaterThan(0);
        }
        // CONTRÔLE NÉGATIF : le vrai lien, lui, n'est pas refusé.
        expect(statutSoldeDette({ ...LIE, balanceAsOf: '2026-09-02' }, AUJ, TX).forme).toBe('suit-les-virements');
    });
});

describe('[DETTE-VIREMENTS-REELS] une dette LIÉE n’a pas besoin du paiement mensuel', () => {
    it('sans `minimumPayment`, le solde du jour ET la série disent la MÊME chose', () => {
        // ⚠️ Mesuré : la série REFUSAIT tout (`donnees-manquantes`) pendant que `soldeDetteAujourdhui`
        // déduisait les virements — donc le formulaire annonçait « déjà déduit » et le bandeau du
        // Futur « dettes au niveau actuel », pour la MÊME dette. Le cas est atteignable : le bouton
        // « Ajouter » ne vérifie que `balance > 0`, et `apply_debt` ne borne pas ce champ.
        const sansPaiement = { ...LIE, minimumPayment: undefined, balanceAsOf: '2026-09-02' } as EntreeAmortissement;
        const attendu = 46_934 - MONTANT * 2;
        expect(soldeDetteAujourdhui(sansPaiement, AUJ, TX)).toBeCloseTo(attendu, 2);
        const r = amortirDettePassee(sansPaiement, MOIS, AUJ, TX);
        expect(r.forme).toBe('ok');
        if (r.forme === 'ok') expect(r.soldeAujourdhui).toBeCloseTo(attendu, 2);
        // CONTRÔLE : sans lien, `minimumPayment` reste indispensable — la grille en a besoin.
        const grilleSansPaiement = { ...GRILLE, minimumPayment: undefined } as EntreeAmortissement;
        expect(amortirDettePassee(grilleSansPaiement, MOIS, AUJ, TX).forme).toBe('inapplicable');
    });
});

describe('[DETTE-VIREMENTS-REELS] sans date de DÉBUT, la série part du premier virement CONNU', () => {
    it('le solde du jour et la série du passé décrivent la MÊME dette', () => {
        // ⚠️ Mesuré AVANT : `soldeDetteAujourdhui` déduisait (il ne lit pas `startDate`) pendant que
        // la série refusait `donnees-manquantes` — le passé restait PLAT pendant que le cash
        // descendait, donc la valeur nette passée était **1 878 $ trop haute** puis chutait vers
        // aujourd'hui sans cause. `startDate` est un champ de formulaire OPTIONNEL : un clic suffit.
        const sansDebut = { ...LIE, startDate: undefined, balanceAsOf: '2026-07-24' } as EntreeAmortissement;
        const attendu = 46_934 - MONTANT * VERSEMENTS.length;
        expect(soldeDetteAujourdhui(sansDebut, AUJ, TX)).toBeCloseTo(attendu, 2);
        const r = amortirDettePassee(sansDebut, MOIS, AUJ, TX);
        expect(r.forme).toBe('ok');
        if (r.forme === 'ok') {
            expect(r.soldeAujourdhui).toBeCloseTo(attendu, 2);
            // La série commence au mois du PREMIER virement (juillet), pas à un mois inventé.
            expect(r.premierMoisAbsolu).toBe(2026 * 12 + 6);
        }
        // CONTRÔLE : sans lien ET sans date de début, la grille refuse toujours — elle en a besoin.
        expect(amortirDettePassee({ ...GRILLE, startDate: undefined } as EntreeAmortissement, MOIS, AUJ, TX).forme)
            .toBe('inapplicable');
    });
});
