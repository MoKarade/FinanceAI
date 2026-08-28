// tests/services/testTransactionsDeterministe.test.ts
//
// [TEST-PERSONA-NON-DETERMINISTE] `generateTestTransactions` tirait 5 valeurs à `Math.random()`
// NU, et c'est le générateur du persona PAR DÉFAUT `couple-confort` — celui qu'un audit prend
// spontanément. Deux exécutions du MÊME code donnaient deux jeux de montants différents, donc
// aucune comparaison avant/après possible sans injecter une graine à la main (ce que le panel de la
// PR #755 a dû faire).
//
// ⚠️ Le « 3 088,55 $ » du ticket n'est pas retrouvable sur `calculatedStartingCash`, borné par
// construction à 2 480 $. Re-mesuré : 1 168,66 $ sur 50 000 graines (finding financial-integrity).
//
// Ce test verrouille la reproductibilité SANS la rendre vacueuse : une graine différente doit
// produire des montants différents, sinon l'égalité serait satisfaite par un générateur constant.

import { describe, it, expect } from 'vitest';
import { generateTestTransactions } from '../../services/testTransactions';
import { buildCoupleConfort } from '../../services/testPersonas/coupleConfort';
import type { Transaction } from '../../types';

/** Somme des montants NON-transfert / NON-doublon — la grandeur qui variait (cash de départ). */
const cashSum = (txs: Transaction[]): number =>
    txs.reduce((s, t) => {
        const tx = t as { amount?: number; isDuplicate?: boolean; isTransfer?: boolean };
        return (!tx.isDuplicate && !tx.isTransfer) ? s + (Number(tx.amount) || 0) : s;
    }, 0);

describe('[TEST-PERSONA-NON-DETERMINISTE] le générateur legacy est reproductible', () => {
    it('deux appels sans argument rendent des montants IDENTIQUES', () => {
        const a = generateTestTransactions();
        const b = generateTestTransactions();
        expect(a.map((t) => t.amount)).toEqual(b.map((t) => t.amount));
        expect(cashSum(a)).toBe(cashSum(b));
    });

    it('ANTI-VACUITÉ : deux graines DIFFÉRENTES rendent des montants différents', () => {
        // Sans ce cas, un générateur qui rendrait toujours la même constante passerait le test
        // ci-dessus. On exige aussi un écart NON NÉGLIGEABLE : la variance doit rester réelle.
        const a = generateTestTransactions(1);
        const b = generateTestTransactions(2);
        expect(a.length).toBe(b.length);
        expect(a.map((t) => t.amount)).not.toEqual(b.map((t) => t.amount));
        expect(Math.abs(cashSum(a) - cashSum(b))).toBeGreaterThan(1); // > 1 $ d'écart entre graines
    });

    it('la variance existe DANS un même tirage (le générateur n\'est pas dégénéré)', () => {
        // Une graine figée ne doit pas avoir aplati les montants : les 15 épiceries tirent
        // `-(45 + rand()*120)` — elles doivent rester distinctes.
        const epiceries = generateTestTransactions().filter((t) => t.category === 'Épicerie');
        expect(epiceries.length).toBe(15);
        expect(new Set(epiceries.map((t) => t.amount)).size).toBeGreaterThan(10);
    });

    it('le persona PAR DÉFAUT « couple-confort » est reproductible d\'un build à l\'autre', () => {
        // La cible réelle du ticket : c'est via ce persona que la non-reproductibilité empêchait
        // toute mesure avant/après.
        const a = buildCoupleConfort().transactions as Transaction[];
        const b = buildCoupleConfort().transactions as Transaction[];
        expect(cashSum(a)).toBe(cashSum(b));
        expect(a.map((t) => `${t.payee}|${t.amount}`)).toEqual(b.map((t) => `${t.payee}|${t.amount}`));
    });
});
