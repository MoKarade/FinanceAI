import { describe, it, expect, beforeEach } from 'vitest';
import { computeCashLedger, computeCashLedgerDetailed } from '../../services/startingCash';
import { computeCurrentLiquidity } from '../../services/portfolio';
import { computeStartingCash } from '../../services/projection/buildSimulationParams';
import { getErrors, clearErrors, __resetErrorThrottle } from '../../services/errorLogger';
import type { Transaction } from '../../types';

/**
 * [CASH-NAN-SILENT] — audit de santé 2026-08-19, vague 1a.
 *
 * Le cash n'est pas stocké : il est DÉRIVÉ (Σ soldes initiaux + Σ transactions hors
 * doublons/transferts). Cette formule vivait en TROIS copies qui faisaient toutes
 * `Number(v) || 0` **sans aucune trace**, alors que le patron `HARDEN-*-NAN` — né de l'incident
 * réel « −193 k$ » du 2026-06-16 — est appliqué à `assetValueCad` (65 lignes plus haut dans le
 * MÊME fichier) et à `computeRawNetWorth`.
 *
 * ⚠️ Ce qui change ici n'est PAS le nombre : un terme non fini valait 0 avant, il vaut 0 après.
 * C'est la TRACE. Les tests visent donc le JOURNAL, pas seulement la somme — un `0 $` crédible
 * sans trace est pire qu'une erreur bruyante, et c'est exactement ce que la garde doit empêcher.
 *
 * PORTÉE DE LA PREUVE DE DISCRIMINATION, mesurée (branchements retirés, module conservé) :
 * **un seul cas** échoue sur le code d'avant — « les deux TRACENT désormais une corruption »
 * (`expected [] to have a length of 1`). C'est le SEUL qui vise les consommateurs réels ; les
 * neuf autres testent un module NEUF, ils n'ont donc pas de « code d'avant » à faire échouer.
 * Ne pas les lire comme des gardes du correctif : ce sont des gardes du CONTRAT (anti-bruit sur
 * le chemin sain, throttle par signature, exclusion doublons/transferts) qui protègent contre une
 * régression future. La vraie garde du fix, c'est le dernier `describe`.
 */

const tx = (over: Partial<Transaction> = {}): Transaction => ({
    id: 1, date: '2026-01-15', payee: 'Marché', amount: -50,
    category: 'Épicerie', account: 'CHQ',
    ...over,
} as Transaction);

beforeEach(() => {
    clearErrors();
    __resetErrorThrottle();
});

describe('[CASH-NAN-SILENT] le cash dérivé trace ce qu’il écarte', () => {
    it('cas SAIN : somme exacte, et ZÉRO bruit dans le journal', () => {
        const cash = computeCashLedger({ CHQ: 1000, EPARGNE: 2500 }, [
            tx({ id: 11, amount: -200 }),
            tx({ id: 12, amount: 3000 }),
        ]);
        expect(cash).toBe(6300);
        // Anti-bruit : une garde qui journalise sur le chemin sain noie le journal et se rend inutile.
        expect(getErrors()).toHaveLength(0);
    });

    it('un montant de transaction non fini est écarté ET JOURNALISÉ', () => {
        const cash = computeCashLedger({ CHQ: 1000 }, [
            tx({ id: 21, amount: -200 }),
            tx({ id: 42, amount: Number.NaN }),
        ]);

        // Le nombre est INCHANGÉ par rapport à l'ancien `|| 0` : c'est voulu.
        expect(cash).toBe(800);

        // Discriminant : AVANT, cet appel ne produisait STRICTEMENT RIEN. Le montant corrompu
        // devenait un 0 crédible à la racine de la projection, sans la moindre trace.
        const erreurs = getErrors();
        expect(erreurs).toHaveLength(1);
        expect(erreurs[0].source).toBe('projection');
        expect(erreurs[0].severity).toBe('warning');
        expect(erreurs[0].message).toContain('non fini');
        // La trace doit permettre de RETROUVER la donnée fautive, pas seulement signaler l'existence.
        expect(JSON.stringify(erreurs[0].context)).toContain('42'); // l'id de la transaction fautive
    });

    it('un solde initial non fini est écarté ET JOURNALISÉ, avec sa clé de compte', () => {
        const cash = computeCashLedger(
            { CHQ: 1000, EPARGNE: Number.POSITIVE_INFINITY } as Record<string, number>,
            [],
        );
        expect(cash).toBe(1000);
        const erreurs = getErrors();
        expect(erreurs).toHaveLength(1);
        expect(JSON.stringify(erreurs[0].context)).toContain('EPARGNE');
        // Infinity est falsy-résistant : `Number(v) || 0` le laissait passer et empoisonnait la somme.
        // Le vieux code rendait donc `Infinity`, pas 0 — pire encore que le NaN.
        expect(Number.isFinite(cash)).toBe(true);
    });

    it('journalise UNE fois par signature, pas à chaque appel (anti-flood)', () => {
        const balances = { CHQ: 1000 };
        const txs = [tx({ id: 42, amount: Number.NaN })];
        for (let i = 0; i < 25; i++) computeCashLedger(balances, txs);
        // Le calcul est appelé à chaque rendu de plusieurs surfaces ET à chaque construction de
        // paramètres de simulation : sans throttle, un état durablement corrompu noierait le
        // journal — et un journal noyé ne sert plus à rien (patron de `computeRawNetWorth`).
        expect(getErrors()).toHaveLength(1);
    });

    it('deux motifs de corruption DIFFÉRENTS remontent tous les deux', () => {
        computeCashLedger({ CHQ: 1000 }, [tx({ id: 31, amount: Number.NaN })]);
        computeCashLedger({ CHQ: 1000 }, [tx({ id: 32, amount: Number.NaN })]);
        // Le throttle porte sur la SIGNATURE, pas sur « une erreur et puis plus rien » : sinon la
        // première corruption masquerait toutes les suivantes.
        expect(getErrors()).toHaveLength(2);
    });

    it('doublons et transferts restent exclus (même base que la reconstruction du passé)', () => {
        const cash = computeCashLedger({ CHQ: 1000 }, [
            tx({ id: 51, amount: -500, isDuplicate: true }),
            tx({ id: 52, amount: -300, isTransfer: true }),
            tx({ id: 53, amount: -100 }),
        ]);
        // Diverger ici ferait diverger les deux bouts de la courbe (classe PH4D) : l'ancre du
        // présent et le walk-back du passé DOIVENT partager la base d'exclusion.
        expect(cash).toBe(900);
    });

    it('entrées absentes ou nulles ⇒ 0, sans erreur (ce n’est pas une corruption)', () => {
        expect(computeCashLedger(null, null)).toBe(0);
        expect(computeCashLedger(undefined, undefined)).toBe(0);
        expect(getErrors()).toHaveLength(0);
    });

    it('la version détaillée rend l’inventaire sans rien journaliser', () => {
        const r = computeCashLedgerDetailed({ CHQ: Number.NaN } as Record<string, number>, [
            tx({ id: 61, amount: Number.NaN }),
        ]);
        expect(r.cash).toBe(0);
        expect(r.termesFautifs).toHaveLength(2);
        expect(r.termesFautifs.map((t) => t.origine).sort()).toEqual(['initialBalances', 'transaction']);
        // Elle existe pour qu'une surface puisse AFFICHER la dégradation sans re-parcourir les
        // données — donc elle ne doit pas journaliser (ce serait un doublon d'entrée).
        expect(getErrors()).toHaveLength(0);
    });
});

describe('[CASH-NAN-SILENT] les trois copies sont bien devenues UNE', () => {
    const balances = { CHQ: 1000, EPARGNE: 2000 };
    const txs = [tx({ id: 11, amount: -250 }), tx({ id: 51, amount: 999, isDuplicate: true })];

    it('computeCurrentLiquidity et computeStartingCash donnent le MÊME nombre que la source', () => {
        const attendu = computeCashLedger(balances, txs);
        expect(computeCurrentLiquidity(balances, txs)).toBe(attendu);
        expect(computeStartingCash(balances, txs)).toBe(attendu);
        expect(attendu).toBe(2750);
    });

    it('et surtout : les deux TRACENT désormais une corruption', () => {
        const corrompu = [tx({ id: 99, amount: Number.NaN })];

        computeCurrentLiquidity(balances, corrompu);
        expect(getErrors()).toHaveLength(1);

        clearErrors();
        __resetErrorThrottle();
        computeStartingCash(balances, corrompu);
        // Discriminant : les deux étaient MUETTES avant. `computeStartingCash` est l'ancre de toute
        // la reconstruction du passé et le cash de départ du moteur ; `computeCurrentLiquidity`
        // alimente le Dashboard et le snapshot envoyé à l'IA.
        expect(getErrors()).toHaveLength(1);
    });
});
