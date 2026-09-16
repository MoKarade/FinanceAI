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
import {
    decideCutoverDate, requestDateFrom, bornesEffectivesParCompte, libellesRoutes,
    plancherNonAttribuable, applyPayloadsIsolated,
} from '../../../services/fintable/syncCore';
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

function snapshot(
    transactions: { id: string; accountId: string; date: string }[],
    labelCarte: string = CARTE.label,
): FintableSnapshot {
    return {
        readAt: 0,
        accounts: [{ ...CHEQUE }, { ...CARTE, label: labelCarte }].map((a) => ({
            id: a.id, connectionId: 'c', label: a.label, rawType: 'x', currency: 'CAD',
            balance: 100, balanceAvailable: null, lastTxDate: null, enabled: true,
        })),
        holdings: [], holdingsSkipped: [], unknownTransactionKeys: [], unknownTransactionSamples: [],
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

function simuler(opts: { lagCarte: number; parCompte: boolean; carteDejaVue: boolean; labelCarte?: string }) {
    const labelCarte = opts.labelCarte ?? CARTE.label;
    const N_JOURS = 12;
    const postes: Poste[] = [];
    for (let i = 0; i < N_JOURS; i++) {
        postes.push({ id: `chq_${i}`, accountId: CHEQUE.id, date: jour(i), disponibleLe: jour(i) });
        postes.push({ id: `crt_${i}`, accountId: CARTE.id, date: jour(i), disponibleLe: jour(i + opts.lagCarte) });
    }

    let etat: Transaction[] = opts.carteDejaVue
        ? [tx(jour(-1), CHEQUE.label), tx(jour(-1 - opts.lagCarte), labelCarte)]
        : [];
    const dejaLa = etat.length;

    for (let i = 0; i < N_JOURS; i++) {
        const aujourd = jour(i);
        const decision = decideCutoverDate(etat, aujourd);
        // La REQUÊTE : le filtre grossier côté API, tel que les orchestrateurs le posent.
        const dateFrom = opts.parCompte ? requestDateFrom(decision) : decision.cutoverDateUsed;
        const dispo = postes.filter((p) => p.disponibleLe <= aujourd && (dateFrom === null || p.date >= dateFrom));
        const { payloads } = mapFintableSnapshot(snapshot(dispo, labelCarte), {
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
        carte: ecrites.filter((t) => t.accountName === labelCarte).length,
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


// ── 7. Ce que la revue du panel a trouvé, et que j'avais introduit ──────────────────────────────

describe('la clé d\'indexation est la MÊME des deux côtés', () => {
    it('un libellé qui porte une espace de bord est quand même reconnu', () => {
        // ⚠️ Mon premier jet trimmait à l'ÉCRITURE de la carte et pas à sa LECTURE. Rien ne trimme
        // `label` au décodage, donc un compte nommé « Carte » avec une espace avait DEUX clés :
        // sa borne restait introuvable, à chaque passe.
        const r = mapFintableSnapshot(snapshot(LOT, ' Carte'), {
            roles: ROLES,
            transactionsAfter: '2026-09-15',
            transactionsAfterByAccount: { 'Chèque': '2026-09-15', Carte: '2026-09-12' },
        });
        expect(payeesRetenues(r)).toEqual(['crt_retard']);
        expect(r.report.warnings.some((x: string) => x.includes('retard de postage'))).toBe(false);
    });

    it('⚠️ MESURE : avec un libellé espacé, l\'interblocage ne se refermait JAMAIS', () => {
        // C'est LA garde de ce correctif : avant, `carteDejaVue: true` rendait 0/9 avec un libellé
        // espacé (contre 9/9 avec un libellé propre) — donc le « Rattraper l'historique » que
        // l'avertissement prescrit n'aurait rien réparé, jamais. Un remède PONCTUEL contre un
        // défaut PERMANENT enseigne à être ignoré.
        const r = simuler({ lagCarte: 3, parCompte: true, carteDejaVue: true, labelCarte: ' Carte' });
        expect(r.cheque).toBe(12);
        expect(r.carte).toBe(9);
    });

    it('⚠️ le trim NE fusionne PAS deux comptes réellement distincts (casse et accents intacts)', () => {
        // Contrôle inverse : rabattre la casse ou les accents échangerait une borne introuvable
        // contre une borne PARTAGÉE — c'est-à-dire le défaut d'origine, un cran plus bas.
        const m = deriveCutoverDatesByAccount([
            tx('2026-09-10', 'Carte'), tx('2026-09-15', 'carte'), tx('2026-09-14', 'Cârte'),
        ]);
        expect([...m.keys()].sort()).toEqual(['Carte', 'Cârte', 'carte']);
    });
});

describe('un compte que l\'API ne LISTE plus n\'est pas avalé par le total', () => {
    it('est compté et NOMMÉ comme tel, pas confondu avec un compte sans historique', () => {
        // Un compte désactivé chez Fintable sort de `/accounts` mais ses transactions peuvent encore
        // arriver : il n'a alors aucun libellé ici, donc il est condamné à la bascule globale POUR
        // TOUJOURS (`accountName` ne lui sera jamais attaché non plus). Sans ce message, il
        // disparaissait dans le compteur agrégé.
        const snap = snapshot(LOT);
        snap.accounts = snap.accounts.filter((a) => a.id !== CARTE.id); // l'API ne le liste plus
        const r = mapFintableSnapshot(snap, {
            roles: ROLES,
            transactionsAfter: '2026-09-15',
            transactionsAfterByAccount: { 'Chèque': '2026-09-15' },
        });
        const w = r.report.warnings.find((x: string) => x.includes('ne liste'));
        expect(w).toBeDefined();
        expect(w).toContain('1 transaction(s)');
        // Et il n'est PAS annoncé comme « sans historique connu » : la cause serait fausse, donc
        // le remède prescrit aussi.
        expect(r.report.warnings.some((x: string) => x.includes('retard de postage'))).toBe(false);
    });
});

describe('HYPOTHÈSE FIGÉE : un libellé = un compte', () => {
    it('deux comptes au MÊME libellé partagent une borne — jamais un doublon, mais aucun gain', () => {
        // `FintableAccount.label` (`display_name ?? name`) n'est garanti unique par RIEN. Deux
        // comptes homonymes partagent donc leur borne, qui vaut le MAX des deux. Conséquence
        // mesurée ici : elle ne peut pas être TROP BASSE (donc pas de doublon, pas de
        // double-comptage budgétaire), mais elle reste trop HAUTE pour le plus lent des deux —
        // le bénéfice du lot est NUL pour ce cas. Écrit plutôt que laissé implicite.
        const m = deriveCutoverDatesByAccount([
            tx('2026-09-15', 'Mastercard'), // compte A, rapide
            tx('2026-09-10', 'Mastercard'), // compte B, lent — même libellé
        ]);
        expect(m.get('Mastercard')).toBe('2026-09-15');
        expect(m.size).toBe(1);
    });
});

// ── 8. ⚠️⚠️ Le PLANCHER : la garantie que la bascule par compte détruisait en silence ────────────

describe('plancherNonAttribuable — une borne par compte ne peut pas payer son gain en DOUBLONS', () => {
    // La borne d'un compte ne voit QUE les lignes portant exactement son libellé. Les mêmes
    // dépenses entrées par un AUTRE canal (CSV → `'Importé'` ; `apply_bank_statement` sans
    // `accountName` ; toute sync d'avant le 2026-09-05) avançaient la bascule GLOBALE, donc elles
    // protégeaient. Reculer la borne sous leur date rouvre la fenêtre — et la dédup ne rattrape
    // rien, sa clé étant `date|montant|payee`, or c'est le PAYEE qui diffère entre une saisie à la
    // main et ce que Fintable livre.

    /** L'état de Marc en miniature : la carte a 3 dépenses réécrites à la main, SANS compte. */
    function etatAvecSaisieManuelle(): Transaction[] {
        return [
            tx('2026-09-15', CHEQUE.label),
            tx('2026-09-05', CARTE.label),
            // Réécrites à la main (montants corrigés, libellé différent) — aucun `accountName`.
            { id: 91, date: '2026-09-08', payee: 'SAISIE MAIN A', amount: -12.5, category: 'x', status: 'processed' } as Transaction,
            { id: 92, date: '2026-09-10', payee: 'SAISIE MAIN B', amount: -30.2, category: 'x', status: 'processed' } as Transaction,
            { id: 93, date: '2026-09-12', payee: 'SAISIE MAIN C', amount: -7.9, category: 'x', status: 'processed' } as Transaction,
        ];
    }

    /** Ce que Fintable re-livre pour la carte : MÊMES dépenses, libellé de l'API. */
    const RELIVRE = [
        { id: 'f1', accountId: CARTE.id, date: '2026-09-08' },
        { id: 'f2', accountId: CARTE.id, date: '2026-09-10' },
        { id: 'f3', accountId: CARTE.id, date: '2026-09-12' },
    ];

    function ecrites(bornes: Record<string, string>): number {
        const etat = etatAvecSaisieManuelle();
        const { payloads } = mapFintableSnapshot(snapshot(RELIVRE), {
            roles: ROLES,
            transactionsAfter: decideCutoverDate(etat, '2026-09-16').cutoverDateUsed,
            transactionsAfterByAccount: bornes,
        });
        const base = { transactions: etat, initialBalances: {}, debts: [] } as unknown as AppState;
        const { transactionsAdded } = applyPayloadsIsolated(base, payloads);
        return transactionsAdded;
    }

    it('⚠️ SANS plancher, la borne par compte fait ÉCRIRE des doublons que la bascule globale bloquait', () => {
        // Témoin du défaut. La borne de la carte (2026-09-05) est ANTÉRIEURE aux trois saisies
        // manuelles : les trois repassent, avec un libellé différent, donc la dédup ne les voit pas.
        const brutes = decideCutoverDate(etatAvecSaisieManuelle(), '2026-09-16').cutoverByAccount;
        expect(brutes[CARTE.label]).toBe('2026-09-05');
        expect(ecrites(brutes)).toBe(3);
    });

    it('AVEC le plancher, plus aucun doublon — la garantie d\'avant est rendue', () => {
        const etat = etatAvecSaisieManuelle();
        const plancher = plancherNonAttribuable(etat, libellesRoutes([CHEQUE.label, CARTE.label]));
        expect(plancher).toBe('2026-09-12'); // la plus récente saisie non attribuable
        const effectives = bornesEffectivesParCompte(
            decideCutoverDate(etat, '2026-09-16').cutoverByAccount, plancher,
        );
        expect(effectives[CARTE.label]).toBe('2026-09-12'); // relevée au plancher
        expect(ecrites(effectives)).toBe(0);
    });

    it('CONTRÔLE NÉGATIF : historique entièrement étiqueté → plancher null, bénéfice INTACT', () => {
        // Sans quoi le plancher aurait pu annuler tout le lot sans qu'on le voie.
        const etat = [tx('2026-09-15', CHEQUE.label), tx('2026-09-05', CARTE.label)];
        const plancher = plancherNonAttribuable(etat, libellesRoutes([CHEQUE.label, CARTE.label]));
        expect(plancher).toBeNull();
        const brutes = decideCutoverDate(etat, '2026-09-16').cutoverByAccount;
        expect(bornesEffectivesParCompte(brutes, plancher)).toEqual(brutes);
    });

    it('une ligne étiquetée d\'un AUTRE compte ROUTÉ n\'entre pas dans le plancher', () => {
        // Elle appartient à ce compte-là : la compter ici relèverait la borne de tous les autres
        // pour rien, et le lot n'aurait plus aucun effet dès qu'un compte rapide existe.
        const etat = [tx('2026-09-15', CHEQUE.label), tx('2026-09-05', CARTE.label)];
        expect(plancherNonAttribuable(etat, libellesRoutes([CHEQUE.label, CARTE.label]))).toBeNull();
        // …mais si ce libellé n'est PLUS routé, elle redevient non attribuable.
        expect(plancherNonAttribuable(etat, libellesRoutes([CARTE.label]))).toBe('2026-09-15');
    });

    it('un libellé FANTÔME (« Importé » du parseur CSV) compte comme non attribuable', () => {
        // `parseBankCsv` écrit `accountName = colonne || 'Importé'` : ce n'est le libellé d'aucun
        // compte Fintable, donc ces lignes peuvent appartenir à n'importe lequel.
        const etat = [
            tx('2026-09-05', CARTE.label),
            { id: 94, date: '2026-09-11', payee: 'csv', amount: -5, category: 'x', status: 'processed', accountName: 'Importé' } as Transaction,
        ];
        expect(plancherNonAttribuable(etat, libellesRoutes([CHEQUE.label, CARTE.label]))).toBe('2026-09-11');
    });
});

// ── 9. Le plancher est-il CÂBLÉ ? (sinon il est juste une fonction pure sans effet) ──────────────

describe('browserSync applique le plancher, il ne se contente pas de l\'exporter', () => {
    it('ne réimporte PAS une dépense déjà saisie à la main sous un autre libellé', async () => {
        // ⚠️ Garde de CHAÎNE : les fonctions pures ci-dessus peuvent être justes et n'être appelées
        // nulle part — c'est exactement le trou que ce lot a déjà payé une fois sur `dateFrom`.
        const client = {
            get: vi.fn(async (path: string) => {
                if (path === '/accounts') {
                    return {
                        data: [{
                            id: CARTE.id, connection_id: 'c', name: CARTE.label, display_name: null,
                            type: 'credit / credit card', currency: 'CAD', balance: '100.00',
                            balance_available: null, sync_start_date: null, last_tx_date: null, enabled: true,
                        }],
                        nextCursor: null, snapshotDate: null,
                    };
                }
                return { data: [], nextCursor: null, snapshotDate: null };
            }),
            getAllPages: vi.fn(async (path: string) => (path === '/transactions'
                ? [{
                    id: 'f1', account_id: CARTE.id, date: '2026-09-12', amount: '-7.90',
                    currency: 'CAD', description: 'METRO PLUS', merchant: 'Metro', pending: false,
                    category: null, updated_at: null,
                }]
                : [])),
        } as unknown as FintableClient;

        const state = {
            transactions: [
                tx('2026-09-05', CARTE.label),
                // Saisie manuelle du MÊME achat, libellé et montant corrigés → clé de dédup autre.
                { id: 93, date: '2026-09-12', payee: 'SAISIE MAIN C', amount: -2.2, category: 'x', status: 'processed' } as Transaction,
            ],
            fintableRoles: { [CARTE.id]: { kind: 'debt', debtName: '' } },
            initialBalances: {}, debts: [],
        } as unknown as AppState;

        const { report } = await runFintableBrowserSync(state, 'jeton-de-test', {
            client, now: () => Date.parse('2026-09-16T12:00:00Z'),
        });

        // Sans le plancher, la borne de la carte vaudrait 2026-09-05 et cette ligne serait écrite.
        expect(report.transactionsAdded).toBe(0);
    });
});
