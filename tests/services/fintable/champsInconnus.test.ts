// [FINTABLE-CHAMPS-INCONNUS] Ce que l'API Fintable envoie et que le décodeur JETTE.
//
// Pourquoi ce fichier existe : `decodeTransaction` reconstruit la transaction CHAMP PAR CHAMP à
// partir d'un contrat (`FtRawTransaction`) écrit d'après la DOC, jamais d'après un payload observé.
// Tout ce que l'API envoie en plus disparaît sans trace — et c'est par là qu'est passé
// `[FINTABLE-MONTANT-EN-DEVISE-ORIGINALE]` : le montant arrive dans la devise d'ORIGINE (mesuré :
// 3 875,43 $ importés contre 1 338,12 $ facturés sur 44 transactions), `currency` porte la devise
// du COMPTE, et personne ne pouvait dire si de quoi corriger existait ailleurs dans le même objet.
//
// Les gardes vont par PAIRES : ce qu'on trouve, et ce qu'on ne doit PAS trouver (un détecteur qui
// ne sait que crier est un détecteur qu'on désactive).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    CLES_TRANSACTION_DECLAREES,
    MAX_CLES_CITEES,
    clesInconnues,
} from '../../../services/fintable/decode';
import { readFintableSnapshot } from '../../../services/fintable/readSnapshot';
import { mapFintableSnapshot } from '../../../services/fintable/mapSnapshot';
import type { FintableClient } from '../../../services/fintable/client';
import type { FintableSnapshot } from '../../../services/fintable/types';
import { stripComments, partDeCodeRestante } from '../../../utils/stripComments';

const SRC_TYPES = resolve(__dirname, '../../../services/fintable/types.ts');

/**
 * Champs déclarés au niveau 1 de l'interface `FtRawTransaction`, lus dans le SOURCE DÉCOMMENTÉ.
 *
 * ⚠️ Lecture décommentée obligatoire (`SCAN-QUI-MATCHE-LA-PROSE`) : le fichier EXPLIQUE en prose
 * les conventions de l'API et cite des noms de champs dans ses commentaires — les compter ferait
 * diverger la liste d'une réalité qu'aucun code ne porte.
 * ⚠️ La PROFONDEUR compte : `category?: { id: string; name: string; header: string } | null` porte
 * trois noms au niveau 2 qui ne sont PAS des champs de la transaction (`GARDE-BORNEE-PAR-CLASSE-NEGATIVE`).
 */
function champsDuContrat(): string[] {
    const brut = readFileSync(SRC_TYPES, 'utf8');
    const code = stripComments(brut);
    expect(partDeCodeRestante(brut, code)).toBeGreaterThan(0.3); // mesuré 2026-09-15 : 0,50
    expect(code).toContain('export interface FtRawTransaction {'); // le décommentage n'a pas mangé le sujet

    const debut = code.indexOf('export interface FtRawTransaction {');
    const corps = code.slice(debut + 'export interface FtRawTransaction {'.length);
    const champs: string[] = [];
    let profondeur = 0;
    for (const ligne of corps.split('\n')) {
        if (profondeur === 0) {
            const m = /^\s*([a-z_][a-z0-9_]*)\??\s*:/i.exec(ligne);
            if (m) champs.push(m[1]);
        }
        for (const c of ligne) {
            if (c === '{') profondeur++;
            else if (c === '}') {
                if (profondeur === 0) return champs; // accolade fermante de l'interface
                profondeur--;
            }
        }
    }
    throw new Error('interface FtRawTransaction : accolade fermante introuvable');
}

describe('CLES_TRANSACTION_DECLAREES suit le contrat, sinon elle ment', () => {
    it('couvre EXACTEMENT les champs de FtRawTransaction', () => {
        const duType = champsDuContrat();
        // Anti-vacuité : un extracteur qui ne trouve rien rendrait cette égalité triviale.
        expect(duType.length).toBeGreaterThanOrEqual(10);
        // Témoin de PROFONDEUR : `id`/`name`/`header` vivent dans `category`, pas au niveau 1.
        expect(duType).not.toContain('header');
        expect(duType).toContain('category');

        expect([...duType].sort()).toEqual([...CLES_TRANSACTION_DECLAREES].sort());
    });

    it('un champ ajouté au contrat et oublié dans la liste fait rougir cette garde', () => {
        // Perturbation SIMULÉE (on ne réécrit pas le source) : la garde compare deux ensembles, donc
        // la seule façon qu'elle a de passer est qu'ils coïncident.
        const avecNouveau = [...champsDuContrat(), 'iso_currency_code'];
        expect([...avecNouveau].sort()).not.toEqual([...CLES_TRANSACTION_DECLAREES].sort());
    });
});

describe('clesInconnues — ce qui est jeté est NOMMÉ', () => {
    const CONFORME = {
        id: 'tx_1', account_id: 'acc_1', date: '2026-07-24', amount: '-4.50', currency: 'CAD',
        description: 'BLUE BOTTLE COFFEE', merchant: 'Blue Bottle Coffee', pending: false,
        category: { id: 'dining_x', name: 'Dining Out', header: 'Expenses' },
        updated_at: '2026-07-25T06:14:09Z',
    };

    it('rend [] sur un payload strictement conforme (contrôle NÉGATIF)', () => {
        expect(clesInconnues([CONFORME, { ...CONFORME, id: 'tx_2' }])).toEqual([]);
    });

    it('nomme les champs hors contrat, dédoublonnés et triés', () => {
        const trouve = clesInconnues([
            { ...CONFORME, iso_currency_code: 'BRL' },
            { ...CONFORME, id: 'tx_2', iso_currency_code: 'USD', account_owner: 'MARC' },
        ]);
        expect(trouve).toEqual(['account_owner', 'iso_currency_code']);
    });

    it('ignore une entrée non-objet plutôt que de lever', () => {
        // Le décodeur, lui, la refusera avec un message qui nomme son index : cet inventaire n'est
        // pas une validation et ne doit jamais être la raison d'un échec d'import.
        expect(clesInconnues([null, 42, 'x', { ...CONFORME, foo: 1 }])).toEqual(['foo']);
    });

    it('la liste de référence est un ARGUMENT — la garde ne peut pas être satisfaite par elle-même', () => {
        expect(clesInconnues([{ amount: '1' }], [])).toEqual(['amount']);
    });
});

// ── La CHAÎNE : lecture → snapshot → avertissement ──────────────────────────────────────────────

const ACCOUNT = {
    id: 'acc_1', connection_id: 'c', name: 'Mastercard', display_name: null,
    type: 'credit / credit card', currency: 'CAD', balance: '380.00', balance_available: null,
    sync_start_date: null, last_tx_date: '2026-07-25', enabled: true,
};
const TX_BRUT = {
    id: 'tx_1', account_id: 'acc_1', date: '2026-07-24', amount: '-4.50', currency: 'CAD',
    description: 'PADARIA', merchant: 'Padaria', pending: false, category: null,
    updated_at: '2026-07-25T06:14:09Z',
};

function client(transactions: unknown[]): FintableClient {
    return {
        get: vi.fn(async (path: string) => {
            if (path === '/accounts') return { data: [ACCOUNT], nextCursor: null, snapshotDate: null };
            return { data: [], nextCursor: null, snapshotDate: null };
        }),
        getAllPages: vi.fn(async () => transactions),
    } as unknown as FintableClient;
}

describe('la lecture PUBLIE ce qu elle jette', () => {
    it('remonte les champs hors contrat jusqu au snapshot', async () => {
        const snap = await readFintableSnapshot(
            client([{ ...TX_BRUT, iso_currency_code: 'BRL', original_amount: '-25.00' }]),
            { dateFrom: '2026-01-01', skipHoldings: true },
        );
        expect(snap.unknownTransactionKeys).toEqual(['iso_currency_code', 'original_amount']);
        // La transaction, elle, est décodée normalement : un champ inconnu ne bloque RIEN.
        expect(snap.transactions).toHaveLength(1);
        expect(snap.transactions[0].amount).toBe(-4.5);
    });

    it('rend [] quand l API respecte le contrat (contrôle NÉGATIF)', async () => {
        const snap = await readFintableSnapshot(
            client([TX_BRUT]),
            { dateFrom: '2026-01-01', skipHoldings: true },
        );
        expect(snap.unknownTransactionKeys).toEqual([]);
    });
});

describe('le rapport de synchronisation le DIT', () => {
    function snap(unknownTransactionKeys: string[]): FintableSnapshot {
        return {
            readAt: 0, accounts: [], holdings: [], transactions: [], holdingsSkipped: [],
            unknownTransactionKeys,
        };
    }
    const CONFIG = { roles: {}, transactionsAfter: null };

    it('avertit, en nommant les champs', () => {
        const r = mapFintableSnapshot(snap(['iso_currency_code']), CONFIG);
        const w = r.report.warnings.find((x: string) => x.includes('iso_currency_code'));
        expect(w).toBeDefined();
        // Le message porte la QUESTION qui a coûté 2 537,31 $, pas seulement le constat.
        expect(w).toMatch(/devise/i);
    });

    it('se TAIT quand il n y a rien à dire (un avertissement permanent est un avertissement mort)', () => {
        const r = mapFintableSnapshot(snap([]), CONFIG);
        expect(r.report.warnings.some((x: string) => x.includes('hors de notre contrat'))).toBe(false);
    });

    it('borne les noms cités SANS fausser le compte', () => {
        const beaucoup = Array.from({ length: MAX_CLES_CITEES + 3 }, (_, i) => `champ_${String(i).padStart(2, '0')}`);
        const w = mapFintableSnapshot(snap(beaucoup), CONFIG).report.warnings
            .find((x: string) => x.includes('hors de notre contrat'));
        expect(w).toContain(`${beaucoup.length} champ(s)`);
        expect(w).toContain('+3 autre(s)');
        expect(w).toContain(beaucoup[0]);
        expect(w).not.toContain(beaucoup[beaucoup.length - 1]);
    });
});
