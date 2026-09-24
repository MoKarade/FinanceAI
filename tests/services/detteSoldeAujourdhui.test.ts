// tests/services/detteSoldeAujourdhui.test.ts
//
// [DETTE-SOLDE-INSTANTANE-FIGE] — gardes du solde de dette RAMENÉ à aujourd'hui.
//
// Marc, 2026-09-17 : « j'ai mis la dette à hebdomadaire mais ça devrait enlever de la dette le
// montant que je paye quand je le paye et ce n'est pas le cas ». Mesuré sur un bail type : le solde
// stocké valait après SEPT prélèvements alors qu'il en avait fait HUIT — un versement de
// trop, et l'écart grandissait d'un versement par SEMAINE, parce que `Debt.balance` est un
// instantané que rien n'avance.
//
// ⚠️ La FIXTURE est choisie pour que `solde ÷ versement` tombe sur un entier de versements restants
// exactement, versements déjà faits compris. Une fixture ronde aurait laissé passer une
// erreur de division ; celle-ci ne le peut pas.

import { describe, it, expect } from 'vitest';
import type { Debt } from '../../types';
import { soldeDetteAujourdhui, dettesAuSoldeDuJour, amortirDettePassee, prepareSupplementAmortiParJour } from '../../services/projection/debtAmortization';
import { computeTotalDebt } from '../../services/portfolio';
import { CHAMPS_TEXTE } from '../../services/verifierTypesRestaures';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { todayIsoLocal } from '../../services/projection/dailyRefine';
import type { AppState } from '../../types';

/** Un bail type, tel qu'il est saisi. Solde = somme des versements RESTANTS, taux 0. */
const BAIL: Debt = {
    id: 'bail', name: 'Bail auto', category: 'Car', kind: 'auto-lease',
    balance: 30_150.00, interestRate: 0, minimumPayment: 650.00,
    startDate: '2026-07-06', termEndDate: '2030-07-06', paymentFrequency: 'weekly',
} as Debt;

const AUJ = '2026-09-17';
/** 650 × 12 / 52 — le prélèvement hebdomadaire de la fixture. */
const VERSEMENT = 150.00;

describe('[DETTE-SOLDE-INSTANTANE-FIGE] le solde stocké est un INSTANTANÉ, pas une mesure du jour', () => {
    it('le cas type : instantané du 9 sept. → un prélèvement déduit au 17 sept.', () => {
        const date = { ...BAIL, balanceAsOf: '2026-09-09' };
        const solde = soldeDetteAujourdhui(date, AUJ, []);
        // 30 150,00 − 150,00 = 30 000,00 — les 200 versements qui restent.
        expect(solde).toBeCloseTo(30_000.00, 2);
        // ⚠️ ANTI-VACUITÉ : la correction doit VALOIR quelque chose. Sans elle, cette assertion
        // passerait pour un helper qui rendrait toujours `balance`.
        expect(BAIL.balance - solde).toBeCloseTo(VERSEMENT, 2);
    });

    it('CONTRÔLE NÉGATIF — sans date de saisie, rien ne bouge (comportement d’avant, bit-à-bit)', () => {
        // La MÊME dette, au même jour : seul `balanceAsOf` change. Une date de saisie inconnue ne se
        // devine pas — la supposer égale à aujourd'hui serait affirmer que Marc vient de relire son
        // relevé, et la supposer ancienne inventerait des versements.
        expect(soldeDetteAujourdhui(BAIL, AUJ, [])).toBe(BAIL.balance);
    });

    it('CONTRÔLE NÉGATIF — jour inconnu (`null`) : aucune correction, jamais une lecture d’horloge', () => {
        expect(soldeDetteAujourdhui({ ...BAIL, balanceAsOf: '2026-09-09' }, null, [])).toBe(BAIL.balance);
    });

    it('la correction ne FUITE pas vers les autres dettes : carte de crédit et hypothèque intactes', () => {
        // Un solde de carte ou d'hypothèque ne se déduit PAS d'une date : il dépend de l'usage et de
        // l'intérêt. Les dater ne doit RIEN changer — sinon le lot fabriquerait des chiffres.
        for (const kind of ['credit-card', 'mortgage', 'personal', 'heloc'] as const) {
            const d = { ...BAIL, kind, balanceAsOf: '2026-09-09' } as Debt;
            expect(soldeDetteAujourdhui(d, AUJ, []), `kind=${kind}`).toBe(BAIL.balance);
        }
    });

    it('un TAUX non nul refuse la correction : on ignore ce que le solde contient', () => {
        // Même refus que `amortirVersementsFixes` : sur un solde tout-compris, appliquer un taux
        // compterait l'intérêt deux fois (`UN-TAUX-SAISI-SUR-UN-SOLDE-QUI-CONTIENT-DEJA-L-INTERET`).
        const d = { ...BAIL, interestRate: 6.5, balanceAsOf: '2026-09-09' };
        expect(soldeDetteAujourdhui(d, AUJ, [])).toBe(BAIL.balance);
    });

    it('une cadence MENSUELLE (ou absente) n’a pas de grille en jours : solde inchangé', () => {
        expect(soldeDetteAujourdhui({ ...BAIL, paymentFrequency: 'monthly', balanceAsOf: '2026-09-09' }, AUJ, [])).toBe(BAIL.balance);
        const { paymentFrequency: _ignore, ...sansCadence } = BAIL;
        expect(soldeDetteAujourdhui({ ...sansCadence, balanceAsOf: '2026-09-09' } as Debt, AUJ, [])).toBe(BAIL.balance);
    });

    it('un instantané POSTÉRIEUR à aujourd’hui ne remonte pas le solde', () => {
        // Sens unique : on déduit ce qui a été payé DEPUIS, jamais on ne « rembobine ».
        expect(soldeDetteAujourdhui({ ...BAIL, balanceAsOf: '2026-12-01' }, AUJ, [])).toBe(BAIL.balance);
    });
});

describe('[DETTE-SOLDE-INSTANTANE-FIGE] une seule ancre pour le chiffre ET pour la courbe', () => {
    it('la série du passé est ANCRÉE sur le solde d’aujourd’hui, et le registre au JOUR y raccorde', () => {
        // C'est l'invariant qui interdit au « Total dû » et au graphe Futur de décrire deux dettes —
        // la classe de défaut que ce chantier répare (`CE-QUI-SE-PARTAGE-EST-LA-DECISION…`).
        const d = { ...BAIL, balanceAsOf: '2026-09-09' };
        const r = amortirDettePassee(d, 2026 * 12 + 8, AUJ, []);
        expect(r.forme).toBe('ok');
        if (r.forme !== 'ok') return;
        expect(r.soldeAujourdhui).toBeCloseTo(soldeDetteAujourdhui(d, AUJ, []), 6);

        // ⚠️ Le DERNIER point MENSUEL n'est PAS le solde d'aujourd'hui : par conception, le point du
        // mois `m` vaut le solde au PREMIER JOUR de ce mois. Mon premier jet l'a affirmé et cette
        // garde l'a réfuté (le solde du 1er du mois contre celui du jour — deux prélèvements du mois en cours).
        // Le raccord se lit donc au JOUR, où il est exact : à AUJOURD'HUI, supplément NUL.
        const auJour = prepareSupplementAmortiParJour([d], 2026 * 12 + 8, AUJ, []);
        expect(auJour(AUJ)).toBeCloseTo(0, 6);
        // Et la veille du prélèvement du 14 : on devait EXACTEMENT un versement de plus.
        expect(auJour('2026-09-09')).toBeCloseTo(VERSEMENT, 2);
        // ⚠️ Anti-vacuité : la série doit VRAIMENT descendre, sinon tout ce qui précède est
        // satisfait par une courbe plate.
        expect(r.soldes[0]).toBeGreaterThan(r.soldeAujourdhui + VERSEMENT);
    });

    it('`computeTotalDebt` publie le solde du JOUR, pas l’instantané', () => {
        const dettes = [{ ...BAIL, balanceAsOf: '2026-09-09' }];
        expect(computeTotalDebt(dettes, AUJ, [])).toBeCloseTo(30_000.00, 2);
        // Le même appel sans jour connu rend l'instantané — la porte est explicite, pas silencieuse.
        expect(computeTotalDebt(dettes, null, [])).toBeCloseTo(BAIL.balance, 2);
    });
});

describe('[DETTE-SOLDE-INSTANTANE-FIGE] la porte du moteur est IDEMPOTENTE', () => {
    it('appliquer deux fois `dettesAuSoldeDuJour` donne le même solde qu’une fois', () => {
        // ⚠️ Sans cette garantie, un lot futur qui rappellerait la porte — ou passerait la liste
        // corrigée à `amortirDettePassee` — déduirait les versements DEUX fois, et la dette serait
        // fausse dans l'autre sens sans que rien ne rougisse.
        const une = dettesAuSoldeDuJour([{ ...BAIL, balanceAsOf: '2026-09-09' }], AUJ, []);
        const deux = dettesAuSoldeDuJour(une, AUJ, []);
        expect(une[0].balance).toBeCloseTo(30_000.00, 2);
        expect(deux[0].balance).toBeCloseTo(une[0].balance, 6);
        // La dette corrigée porte la date du jour : c'est CE champ qui rend la seconde passe inerte.
        expect(une[0].balanceAsOf).toBe(AUJ);
    });

    it('l’IDENTITÉ des dettes non corrigées est préservée (pas de copie ⇒ pas de re-rendu)', () => {
        // Cette liste traverse des `useMemo` et des sélecteurs Zustand : recopier chaque dette
        // ferait re-rendre tout ce qui en dépend à chaque appel.
        const intacte = { ...BAIL };
        const rendu = dettesAuSoldeDuJour([intacte], AUJ, []);
        expect(rendu[0]).toBe(intacte);
    });
});

describe('[DETTE-VIREMENTS-REELS] le lien vers un marchand survit aux écritures automatiques', () => {
    it('une mise à jour MCP du solde PRÉSERVE `paymentPayee` — sinon le cron l’effacerait en silence', () => {
        // ⚠️ Le chemin de MISE À JOUR patche champ par champ sur un `{ ...d }` ; le chemin de
        // CRÉATION, lui, reconstruit l'objet. Un lot futur qui déplacerait l'un vers l'autre
        // effacerait le lien de Marc à la première passe du cron Fintable, sans rien de rouge et
        // sans rien à l'écran : la dette cesserait simplement de descendre
        // (`UN-DECODEUR-QUI-RECONSTRUIT-CHAMP-PAR-CHAMP-JETTE-EN-SILENCE-CE-QU-IL-NE-CONNAIT-PAS`).
        const lie = { ...BAIL, paymentPayee: 'Credit Auto Inc' };
        const etat = { debts: [lie] } as unknown as AppState;
        const res = applyDocument(etat, { kind: 'debt', name: 'Bail auto', balance: 29_800 });
        const d = (res.nextState.debts ?? [])[0];
        // Anti-vacuité : la passe doit VRAIMENT avoir écrit le solde, sinon « le lien survit »
        // serait satisfait par un chemin qui n'a rien fait.
        expect(d.balance).toBe(29_800);
        expect(d.paymentPayee).toBe('Credit Auto Inc');
    });

    it('`paymentPayee` figure dans `CHAMPS_TEXTE` — sans quoi l’app se réhydrate VIDE', () => {
        expect(CHAMPS_TEXTE.has('paymentPayee')).toBe(true);
    });
});

describe('[DETTE-SOLDE-INSTANTANE-FIGE] le champ est TEXTUEL — un oubli VIDE l’app', () => {
    it('`balanceAsOf` figure dans `CHAMPS_TEXTE`', () => {
        // Troisième vague payée le jour même sur `paymentFrequency`, la ligne voisine : un champ
        // textuel neuf qu'aucun état du dépôt ne porte encore est structurellement le premier à
        // faire lever `merge`, donc à vider l'écran. La garde de dérivation est le FILET ; cette
        // assertion-ci dit que le lot qui INTRODUIT le champ ne compte pas dessus.
        expect(CHAMPS_TEXTE.has('balanceAsOf')).toBe(true);
    });
});

describe('[DETTE-SOLDE-INSTANTANE-FIGE] la DATE se pose sur une OBSERVATION, pas sur une réécriture', () => {
    it('un solde qui CHANGE est daté du jour', () => {
        const etat = { debts: [{ ...BAIL, balanceAsOf: '2026-09-09' }] } as unknown as AppState;
        const res = applyDocument(etat, { kind: 'debt', name: 'Bail auto', balance: 29_800 });
        const d = (res.nextState.debts ?? [])[0];
        expect(d.balance).toBe(29_800);
        expect(d.balanceAsOf).toBe(todayIsoLocal());
    });

    it('un solde RÉÉCRIT À L’IDENTIQUE ne se re-date pas, et ne compte pas comme une mise à jour', () => {
        // ⚠️ C'est le cas NOMINAL du cron Fintable : il rappelle ce chemin chaque jour avec ce que
        // porte le snapshot. Re-dater affirmerait qu'un instantané ancien vient d'être relu — et
        // ferait lister la dette dans `debtsUpdated` (affiché dans SystemView) à CHAQUE passe, la
        // faute exacte que `[FINTABLE-TXADDED-MENT]` a corrigée ailleurs.
        const etat = { debts: [{ ...BAIL, balanceAsOf: '2026-09-09' }] } as unknown as AppState;
        const res = applyDocument(etat, { kind: 'debt', name: 'Bail auto', balance: BAIL.balance });
        expect((res.nextState.debts ?? [])[0].balanceAsOf).toBe('2026-09-09');
        expect(res.changes).toEqual([]);
    });

    it('une mise à jour qui ne TOUCHE PAS au solde ne le re-date pas non plus', () => {
        // Un renommage, une date de terme : la dette change, l'observation du solde non.
        const etat = { debts: [{ ...BAIL, balanceAsOf: '2026-09-09' }] } as unknown as AppState;
        const res = applyDocument(etat, { kind: 'debt', name: 'Bail auto', minimumPayment: 660 });
        const d = (res.nextState.debts ?? [])[0];
        expect(d.minimumPayment).toBe(660);
        expect(d.balanceAsOf).toBe('2026-09-09');
        // ⚠️ Anti-vacuité : la passe doit VRAIMENT écrire, sinon « la date n'a pas bougé » serait
        // satisfait par un chemin qui n'écrit jamais rien.
        expect(res.changes.length).toBe(1);
    });

    it('une dette AJOUTÉE porte la date du jour (son solde est neuf par construction)', () => {
        const res = applyDocument({ debts: [] } as unknown as AppState, {
            kind: 'debt', name: 'Prêt perso', balance: 5_000, interestRate: 8, minimumPayment: 200,
        });
        expect((res.nextState.debts ?? [])[0].balanceAsOf).toBe(todayIsoLocal());
    });
});
