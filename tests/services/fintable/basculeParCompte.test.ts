// [FINTABLE-BASCULE-GLOBALE-JETTE-LE-COMPTE-LENT] La bascule anti-doublon est-elle à la bonne
// GRANULARITÉ ?
//
// Le défaut : `deriveCutoverDate` rend UNE date « tous comptes confondus ». Le compte chèque poste
// le jour même et l'avance chaque jour ; la carte de crédit poste quelques jours plus tard et arrive
// donc TOUJOURS derrière une borne que le chèque vient de déplacer — `tx.date <= bascule` la jette,
// chaque jour, indéfiniment. Marc, 2026-09-14 : « je reçois pas les transactions de carte de crédit »
// alors que son dry-run prouve que Fintable en LIVRE 293.
//
// ⚠️ Ce fichier porte la MESURE, pas seulement l'assertion : la simulation de 12 passes quotidiennes
// est l'arbitre, et son CONTRÔLE NÉGATIF (décalage de postage ramené à 0) est ce qui prouve que
// c'est bien le décalage qu'on mesure et non la fixture.

import { describe, it, expect, vi } from 'vitest';
import { deriveCutoverDatesByAccount } from '../../../services/fintable/deriveCutoverDate';
import { decideCutoverDate, requestDateFrom } from '../../../services/fintable/syncCore';
import { mapFintableSnapshot, type FintableAccountRole } from '../../../services/fintable/mapSnapshot';
import { runFintableBrowserSync } from '../../../services/fintable/browserSync';
import type { FintableClient } from '../../../services/fintable/client';
import type { FintableSnapshot } from '../../../services/fintable/types';
import { runFintableSync } from '../../../mcp/runFintableSync';
import type { StateStore } from '../../../mcp/state/stateStore';
import type { AppState, Transaction } from '../../../types';

const CHEQUE = { id: 'acc_cheque', label: 'Chèque' };
const CARTE = { id: 'acc_carte', label: 'Carte' };
const ROLES: Record<string, FintableAccountRole> = {
    [CHEQUE.id]: { kind: 'cash' },
    [CARTE.id]: { kind: 'debt', debtName: '' },
};

function jour(i: number): string {
    return new Date(Date.UTC(2026, 8, 1) + i * 86_400_000).toISOString().slice(0, 10);
}

function tx(date: string, accountName?: string): Transaction {
    return {
        id: Math.random(), date, payee: 'x', amount: -1, category: 'x', status: 'processed',
        ...(accountName !== undefined ? { accountName } : {}),
    } as Transaction;
}

// ── 1. La dérivation par compte ─────────────────────────────────────────────────────────────────

describe('deriveCutoverDatesByAccount', () => {
    it('rend le max PAR COMPTE, pas le max global', () => {
        const m = deriveCutoverDatesByAccount([
            tx('2026-09-01', 'Chèque'), tx('2026-09-15', 'Chèque'),
            tx('2026-09-10', 'Carte'),
        ]);
        expect(m.get('Chèque')).toBe('2026-09-15');
        // LE point du lot : la carte garde SA date, elle n'hérite pas de celle du chèque.
        expect(m.get('Carte')).toBe('2026-09-10');
    });

    it('ignore une transaction SANS nom de compte plutôt que de lui en inventer un', () => {
        // Le mapper Fintable n'écrit `accountName` que depuis le 2026-09-05, et un import CSV sans
        // colonne de compte n'en a pas : ces lignes comptent dans la bascule GLOBALE, jamais ici.
        const m = deriveCutoverDatesByAccount([tx('2026-09-20'), tx('2026-09-02', '  '), tx('2026-09-10', 'Carte')]);
        expect([...m.keys()]).toEqual(['Carte']);
    });

    it('ignore les dates illisibles, comme la dérivation globale', () => {
        const m = deriveCutoverDatesByAccount([tx('pas-une-date', 'Carte'), tx('2026-09-10', 'Carte')]);
        expect(m.get('Carte')).toBe('2026-09-10');
    });
});

// ── 2. La décision : plafonnement, et la borne de requête ────────────────────────────────────────

describe('decideCutoverDate — la carte par compte', () => {
    it('plafonne CHAQUE borne de compte à aujourd\'hui, comme la globale', () => {
        // Une transaction mal datée sur la carte GÈLERAIT la carte seule — plus discret que le gel
        // global, puisque les autres comptes continuent d'arriver.
        const d = decideCutoverDate([tx('2099-01-01', 'Carte'), tx('2026-09-10', 'Chèque')], '2026-09-16');
        expect(d.cutoverByAccount.Carte).toBe('2026-09-16');
        expect(d.cutoverByAccount['Chèque']).toBe('2026-09-10');
    });
});

describe('requestDateFrom — la moitié sans laquelle le reste est INERTE', () => {
    it('rend la plus ANCIENNE des bornes, pas la globale', () => {
        const d = decideCutoverDate([tx('2026-09-15', 'Chèque'), tx('2026-09-10', 'Carte')], '2026-09-16');
        expect(d.cutoverDateUsed).toBe('2026-09-15'); // la globale, inchangée
        expect(requestDateFrom(d)).toBe('2026-09-10'); // la requête recule jusqu'à la carte
    });

    it('un compte JAMAIS vu n\'élargit PAS la fenêtre (il retombe sur la globale)', () => {
        const d = decideCutoverDate([tx('2026-09-15', 'Chèque')], '2026-09-16');
        expect(requestDateFrom(d)).toBe('2026-09-15');
    });

    it('état vierge → null (aucune borne), inchangé', () => {
        expect(requestDateFrom(decideCutoverDate([], '2026-09-16'))).toBeNull();
    });
});

// ── 3. Le mapper : le filtre par compte, et ce qu'il DIT ─────────────────────────────────────────

function snapshot(transactions: { id: string; accountId: string; date: string }[]): FintableSnapshot {
    return {
        readAt: 0,
        accounts: [CHEQUE, CARTE].map((a) => ({
            id: a.id, connectionId: 'c', label: a.label, rawType: 'x', currency: 'CAD',
            balance: 100, balanceAvailable: null, lastTxDate: null, enabled: true,
        })),
        holdings: [], holdingsSkipped: [], unknownTransactionKeys: [],
        transactions: transactions.map((t) => ({
            id: t.id, accountId: t.accountId, date: t.date, amount: -10, currency: 'CAD',
            description: t.id, merchant: null, categoryName: null, updatedAt: null,
        })),
    };
}

const LOT = [
    { id: 'chq_recent', accountId: CHEQUE.id, date: '2026-09-15' },
    { id: 'crt_retard', accountId: CARTE.id, date: '2026-09-13' },
];

function payeesRetenues(r: ReturnType<typeof mapFintableSnapshot>): string[] {
    const bank = r.payloads.find((p) => p.kind === 'bank_statement');
    return bank && 'transactions' in bank ? bank.transactions.map((t) => t.payee) : [];
}

describe('mapFintableSnapshot — le compte lent n\'est plus jeté par la borne du compte rapide', () => {
    it('AVANT (borne globale seule) : la transaction de carte du 13 est jetée par la bascule du 15', () => {
        // C'est le comportement d'aujourd'hui, gardé comme TÉMOIN : sans lui, le test d'après ne
        // prouverait pas que le correctif change quoi que ce soit.
        const r = mapFintableSnapshot(snapshot(LOT), { roles: ROLES, transactionsAfter: '2026-09-15' });
        expect(payeesRetenues(r)).toEqual([]);
        expect(r.report.transactions.skippedBeforeCutover).toBe(2);
    });

    it('APRÈS : avec sa propre borne, la carte passe — et le chèque reste borné par la sienne', () => {
        const r = mapFintableSnapshot(snapshot(LOT), {
            roles: ROLES,
            transactionsAfter: '2026-09-15',
            transactionsAfterByAccount: { 'Chèque': '2026-09-15', Carte: '2026-09-12' },
        });
        expect(payeesRetenues(r)).toEqual(['crt_retard']);
        expect(r.report.transactions.skippedBeforeCutover).toBe(1); // le chèque, à juste titre
    });

    it('un compte ABSENT de la carte retombe sur la borne globale — et le rapport le NOMME', () => {
        // Repli SÛR (pas de rapatriement d'historique sans dédoublonnage) mais qui ne répare rien
        // pour ce compte : tant qu'il est muet, le défaut reste ouvert. D'où l'avertissement.
        const r = mapFintableSnapshot(snapshot(LOT), {
            roles: ROLES,
            transactionsAfter: '2026-09-15',
            transactionsAfterByAccount: { 'Chèque': '2026-09-15' },
        });
        expect(payeesRetenues(r)).toEqual([]);
        const w = r.report.warnings.find((x: string) => x.includes('retard de postage'));
        expect(w).toBeDefined();
        expect(w).toContain('Carte');
        expect(w).not.toContain('Chèque'); // il ne perd rien : il n'a rien à signaler
    });

    it('se TAIT quand aucun compte ne perd rien (un avertissement permanent est un avertissement mort)', () => {
        const r = mapFintableSnapshot(snapshot(LOT), {
            roles: ROLES,
            transactionsAfter: '2026-09-01',
            transactionsAfterByAccount: { 'Chèque': '2026-09-01', Carte: '2026-09-01' },
        });
        expect(payeesRetenues(r)).toHaveLength(2);
        expect(r.report.warnings.some((x: string) => x.includes('retard de postage'))).toBe(false);
    });
});

// ── 4. LA MESURE : 12 passes quotidiennes, et son contrôle négatif ───────────────────────────────

interface Poste { id: string; accountId: string; date: string; disponibleLe: string }

function simuler(opts: { lagCarte: number; parCompte: boolean; carteDejaVue: boolean }) {
    const N_JOURS = 12;
    const postes: Poste[] = [];
    for (let i = 0; i < N_JOURS; i++) {
        postes.push({ id: `chq_${i}`, accountId: CHEQUE.id, date: jour(i), disponibleLe: jour(i) });
        postes.push({ id: `crt_${i}`, accountId: CARTE.id, date: jour(i), disponibleLe: jour(i + opts.lagCarte) });
    }

    let etat: Transaction[] = opts.carteDejaVue
        ? [tx(jour(-1), CHEQUE.label), tx(jour(-1 - opts.lagCarte), CARTE.label)]
        : [];
    const dejaLa = etat.length;

    for (let i = 0; i < N_JOURS; i++) {
        const aujourd = jour(i);
        const decision = decideCutoverDate(etat, aujourd);
        // La REQUÊTE : le filtre grossier côté API, tel que les orchestrateurs le posent.
        const dateFrom = opts.parCompte ? requestDateFrom(decision) : decision.cutoverDateUsed;
        const dispo = postes.filter((p) => p.disponibleLe <= aujourd && (dateFrom === null || p.date >= dateFrom));
        const { payloads } = mapFintableSnapshot(snapshot(dispo), {
            roles: ROLES,
            transactionsAfter: decision.cutoverDateUsed,
            ...(opts.parCompte ? { transactionsAfterByAccount: decision.cutoverByAccount } : {}),
        });
        for (const p of payloads) {
            if (p.kind !== 'bank_statement') continue;
            for (const t of p.transactions) {
                etat = [...etat, tx(t.date, t.accountName)];
            }
        }
    }

    const ecrites = etat.slice(dejaLa);
    return {
        cheque: ecrites.filter((t) => t.accountName === CHEQUE.label).length,
        carte: ecrites.filter((t) => t.accountName === CARTE.label).length,
        attenduCarte: N_JOURS - opts.lagCarte,
    };
}

describe('12 passes quotidiennes — la mesure qui a motivé le lot', () => {
    it('AVANT : 12/12 chèque reçues, 0/9 carte (le décalage de postage la condamne)', () => {
        const r = simuler({ lagCarte: 3, parCompte: false, carteDejaVue: false });
        expect(r.cheque).toBe(12);
        expect(r.carte).toBe(0);
        expect(r.attenduCarte).toBe(9);
    });

    it('APRÈS, carte DÉJÀ connue : 12/12 chèque, 9/9 carte', () => {
        const r = simuler({ lagCarte: 3, parCompte: true, carteDejaVue: true });
        expect(r.cheque).toBe(12);
        expect(r.carte).toBe(9);
    });

    it('⚠️ APRÈS, carte JAMAIS vue : encore 0/9 — le repli global ne répare rien, il le DIT', () => {
        // MESURÉ, et c'est ce qui a fait diverger le lot de son ticket : le repli prescrit
        // (« un compte jamais vu retombe sur la bascule globale ») est un INTERBLOCAGE — la carte
        // ne peut jamais poser sa première transaction, donc sa borne reste absente pour toujours.
        // Le correctif ne l'ouvre pas en silence (ça rapatrierait son historique sans
        // dédoublonnage) : il le NOMME dans le rapport et renvoie au rattrapage, qui a son propre
        // classement des doublons. Une passe de rattrapage suffit — le cas d'au-dessus le mesure.
        const r = simuler({ lagCarte: 3, parCompte: true, carteDejaVue: false });
        expect(r.carte).toBe(0);
    });

    it('CONTRÔLE NÉGATIF : à décalage de postage NUL, les trois variantes reçoivent 12/12', () => {
        // Sans lui, « 0/9 » pourrait venir de la fixture et non du décalage.
        expect(simuler({ lagCarte: 0, parCompte: false, carteDejaVue: false }).carte).toBe(12);
        expect(simuler({ lagCarte: 0, parCompte: true, carteDejaVue: false }).carte).toBe(12);
        expect(simuler({ lagCarte: 0, parCompte: true, carteDejaVue: true }).carte).toBe(12);
    });
});

// ── 5. Le CÂBLAGE : l'orchestrateur navigateur demande-t-il vraiment la bonne fenêtre ? ──────────

describe('browserSync — la borne de la REQUÊTE recule jusqu\'au compte le plus lent', () => {
    it('passe `date_from` = la borne du compte lent, jamais la bascule globale', async () => {
        // ⚠️ Garde de CÂBLAGE : le filtre par compte du mapper est INERTE si l'API ne rend pas les
        // lignes concernées. On OBSERVE l'argument remis au client, on ne le reconstruit pas.
        const vuQuery: Record<string, unknown>[] = [];
        const client = {
            get: vi.fn(async () => ({ data: [], nextCursor: null, snapshotDate: null })),
            getAllPages: vi.fn(async (path: string, query: Record<string, unknown>) => {
                if (path === '/transactions') vuQuery.push(query);
                return [];
            }),
        } as unknown as FintableClient;

        const state = {
            transactions: [tx('2026-09-15', 'Chèque'), tx('2026-09-10', 'Carte')],
            fintableRoles: {},
        } as unknown as AppState;

        await runFintableBrowserSync(state, 'jeton-de-test', {
            client,
            now: () => Date.parse('2026-09-16T12:00:00Z'),
        });

        const q = vuQuery.find((x) => 'date_from' in x);
        expect(q?.date_from).toBe('2026-09-10');
    });
});

// ── 6. Le CÂBLAGE côté CRON — même correctif des deux côtés, prouvé des deux côtés ──────────────

describe('runFintableSync (cron) — la borne de la REQUÊTE recule aussi', () => {
    it('passe `date_from` = la borne du compte lent, jamais la bascule globale', async () => {
        // ⚠️ Le chemin serveur et le chemin navigateur partagent `syncCore` PAR CONSTRUCTION, mais
        // chacun pose sa propre `dateFrom` : un correctif appliqué à un seul côté laisserait
        // l'autre bogué sans que rien ne le signale (c'est l'histoire de `syncCore` lui-même).
        const vuQuery: Record<string, unknown>[] = [];
        const client = {
            get: vi.fn(async (path: string) => {
                if (path === '/accounts') return { data: [], nextCursor: null, snapshotDate: null };
                throw new Error(`route inattendue : ${path}`);
            }),
            getAllPages: vi.fn(async (path: string, query: Record<string, unknown>) => {
                if (path === '/transactions') vuQuery.push(query);
                return [];
            }),
        } as unknown as FintableClient;

        const state = {
            transactions: [tx('2026-09-15', 'Chèque'), tx('2026-09-10', 'Carte')],
        } as unknown as AppState;
        const store: StateStore = {
            get: async () => state,
            getWithVersion: async () => ({ state, version: 1 }),
            save: async () => ({ backupPath: '/backup' }),
            canWrite: true,
        };

        await runFintableSync(store, { token: 't', roles: ROLES, client });

        const q = vuQuery.find((x) => 'date_from' in x);
        expect(q?.date_from).toBe('2026-09-10');
    });
});
