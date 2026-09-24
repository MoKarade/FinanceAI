// tests/types/grandLivreImpossibles.test.ts
//
// [PTF-L1A] Le type du grand livre rend IMPOSSIBLES, à la compilation, les erreurs comptables connues
// du portefeuille : un fractionnement saisi comme un achat (quantité, prix), un achat sans prix ou sans
// montant réglé, un montant sans devise, un dividende avec une quantité, une sorte d'événement hors
// liste. Chaque `@ts-expect-error` ci-dessous FAIT ÉCHOUER `npm run typecheck` le jour où le type
// cesserait d'interdire le cas — c'est `tsc` qui garde, vitest ne fait que charger le fichier.
import { describe, it, expect } from 'vitest';
import type { BrokerLedgerEvent, BrokerLedgerMoney } from '../../types';

const source = { kind: 'releve-courtier', date: '2026-01-31' } as const;
const base = { id: 'x', date: '2026-01-10', accountId: 'courtier-usd', source } as const;

describe('[PTF-L1A] formes impossibles du grand livre', () => {
    it('les formes justes compilent (contrôle positif)', () => {
        const justes: BrokerLedgerEvent[] = [
            { ...base, kind: 'fractionnement', isin: 'ZZ0000000001', splitFrom: 1, splitTo: 10 },
            { ...base, kind: 'achat', isin: 'ZZ0000000001', quantity: 1, price: { value: 1, currency: 'USD' }, amount: { value: 1, currency: 'USD' } },
            { ...base, kind: 'dividende', isin: 'ZZ0000000001', amount: { value: 1, currency: 'USD' } },
        ];
        expect(justes).toHaveLength(3);
    });

    it('les formes fausses ne compilent pas', () => {
        const fausses: unknown[] = [
            // @ts-expect-error un fractionnement n'a pas de quantité (ce n'est pas un achat à prix nul)
            { ...base, kind: 'fractionnement', isin: 'ZZ0000000001', splitFrom: 1, splitTo: 10, quantity: 10 } satisfies BrokerLedgerEvent,
            // @ts-expect-error un achat sans montant réglé
            { ...base, kind: 'achat', isin: 'ZZ0000000001', quantity: 1, price: { value: 1, currency: 'USD' } } satisfies BrokerLedgerEvent,
            // @ts-expect-error un achat sans prix
            { ...base, kind: 'achat', isin: 'ZZ0000000001', quantity: 1, amount: { value: 1, currency: 'USD' } } satisfies BrokerLedgerEvent,
            // @ts-expect-error un dividende n'a pas de quantité
            { ...base, kind: 'dividende', isin: 'ZZ0000000001', quantity: 3, amount: { value: 1, currency: 'USD' } } satisfies BrokerLedgerEvent,
            // @ts-expect-error une sorte d'événement hors liste
            { ...base, kind: 'conversion', amount: { value: 1, currency: 'USD' } } satisfies BrokerLedgerEvent,
            // @ts-expect-error un montant sans devise
            { value: 12 } satisfies BrokerLedgerMoney,
            // @ts-expect-error un ratio de fractionnement en texte
            { ...base, kind: 'fractionnement', isin: 'ZZ0000000001', splitFrom: 1, splitTo: '10' } satisfies BrokerLedgerEvent,
        ];
        expect(fausses).toHaveLength(7);
    });
});
