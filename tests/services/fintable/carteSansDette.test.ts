// tests/services/fintable/carteSansDette.test.ts
//
// [FINTABLE-CARTE-SANS-DETTE] Une carte de crédit SANS dette associée importe quand même ses
// transactions.
//
// Demande Marc, 2026-09-14 : « j'ai toujours pas mes transactions des derniers jours avec ma carte
// de crédit, et ça me demande encore de mettre la dette de carte de crédit dans dette mais je veux
// pas ». Les deux moitiés de sa phrase étaient LE MÊME défaut : un rôle « Dette » posé sans nom
// était omis de la table remise au mapper, donc le compte était classé « SANS RÔLE » et 100 % de
// ses transactions étaient jetées — pendant que l'écran de configuration affichait « Dette
// (carte) », c'est-à-dire un rôle en apparence posé.
//
// MESURÉ avant le correctif, sur le vrai mapper : rôle Dette AVEC nom → 5/5 transactions
// importées ; rôle Dette SANS nom → **0/5**, exactement comme « aucun rôle du tout ».
//
// Ces cas traversent la VRAIE chaîne (`toMapperRoles` du navigateur → `mapFintableSnapshot`),
// parce que le défaut vivait précisément dans le CHAÎNON : chaque moitié, testée chez elle, était
// correcte (`UN-TROU-ENTRE-DEUX-MOITIES-TESTEES-N-APPARTIENT-A-PERSONNE`).
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn(), logErrorThrottled: vi.fn() }));
import { runFintableBrowserSync } from '../../../services/fintable/browserSync';
import { parseRolesJson } from '../../../services/fintable/rolesConfig';
import type { AppState, FintableAccountRoleConfig } from '../../../types';
import { buildDefaultAppState } from '../../../mcp/state/appStateDefaults';
import type { FintableClient } from '../../../services/fintable/client';

const ACC_MC = 'acc_mc';
const LIBELLE_MC = 'Desjardins Cash Back Mastercard';

/** Cinq achats de carte, tous APRÈS la bascule dérivée de l'état (2026-09-01). */
const TRANSACTIONS = Array.from({ length: 5 }, (_, i) => ({
    id: `tx${i}`,
    account_id: ACC_MC,
    date: `2026-09-1${i}`,
    amount: `-${25 + i}.00`,
    currency: 'CAD',
    description: `Achat ${i}`,
    merchant: `Marchand ${i}`,
    pending: false,
}));

/**
 * Client Fintable simulé au niveau du TRANSPORT, au FORMAT BRUT de l'API — forme reprise telle
 * quelle de `browserSync.test.ts`, dont le décodeur strict est déjà prouvé par la CI. Mon premier
 * jet inventait sa propre forme (`name` absent, `balance` numérique) : la passe entière échouait,
 * et les QUATRE cas rougissaient — le CONTRÔLE compris, ce qui désignait la fixture, pas le code.
 */
function clientFake(): FintableClient {
    return {
        get: async (chemin: string) => {
            if (chemin.startsWith('/accounts')) {
                return {
                    data: [{
                        id: ACC_MC, connection_id: 'conn_1', name: LIBELLE_MC, type: 'credit',
                        currency: 'CAD', balance: '842.11', cash_balance: null, debt: null,
                    }],
                };
            }
            return { data: [] };
        },
        getAllPages: async () => TRANSACTIONS,
    } as unknown as FintableClient;
}

function etatAvecUneTransaction(roles: Record<string, FintableAccountRoleConfig>): AppState {
    return {
        ...buildDefaultAppState(),
        // Une transaction du 1er septembre : elle fixe la bascule anti-doublon, donc les cinq
        // achats de carte (du 10 au 14) sont tous STRICTEMENT après et éligibles.
        transactions: [{ id: 'old', date: '2026-09-01', payee: 'Ancienne', amount: -10, category: 'Autre' }],
        fintableRoles: roles,
        debts: [],
    } as unknown as AppState;
}

async function transactionsImportees(roles: Record<string, FintableAccountRoleConfig>): Promise<{
    ajoutees: number; sansRole: number; avertissements: string[]; dettesMAJ: string[];
}> {
    const state = etatAvecUneTransaction(roles);
    const { report } = await runFintableBrowserSync(state, 'jeton_factice', {
        client: clientFake(),
        now: () => Date.parse('2026-09-15T12:00:00Z'),
    });
    return {
        ajoutees: report.transactionsAdded,
        sansRole: report.accountsWithoutRole,
        avertissements: report.warnings,
        dettesMAJ: report.debtsUpdated,
    };
}

describe('[FINTABLE-CARTE-SANS-DETTE] une carte sans dette importe quand même ses transactions', () => {
    it('DISCRIMINANT : rôle « Dette » SANS nom ⇒ les 5 transactions entrent (le défaut en jetait 0/5)', async () => {
        const r = await transactionsImportees({ [ACC_MC]: { kind: 'debt', debtName: '' } });
        expect(r.ajoutees, 'les transactions de la carte doivent entrer sans dette associée').toBe(5);
        // Et le compte n'est PLUS compté « sans rôle » : c'est exactement ce qui le débranchait.
        expect(r.sansRole, 'le compte est ROUTÉ, plus classé « sans rôle »').toBe(0);
    });

    it('CONTRÔLE : le même rôle AVEC un nom de dette importe le même nombre de transactions', async () => {
        // Prouve que le correctif n'a pas déplacé le comportement existant — les deux chemins
        // importent identiquement, seul le SOLDE les distingue (cas suivant).
        const r = await transactionsImportees({ [ACC_MC]: { kind: 'debt', debtName: 'Mastercard' } });
        expect(r.ajoutees).toBe(5);
        expect(r.sansRole).toBe(0);
    });

    it('sans nom, AUCUNE dette n\'est mise à jour — et l\'écran le DIT au lieu de se taire', async () => {
        const r = await transactionsImportees({ [ACC_MC]: { kind: 'debt', debtName: '' } });
        expect(r.dettesMAJ, 'aucun solde de dette ne doit être touché').toEqual([]);
        // ⚠️ La conséquence (patrimoine net qui ignore le solde dû) est ANNONCÉE : c'est un
        // compromis assumé par l'utilisateur, pas un silence. `no-fake-data` appliqué au dire.
        const dit = r.avertissements.join(' | ');
        expect(dit).toMatch(/importées comme dépenses/i);
        expect(dit).toMatch(/patrimoine net/i);
        // Et surtout PAS l'ancien message « compte sans rôle », qui envoyait chercher ailleurs.
        expect(dit).not.toMatch(/sans rôle assigné/i);
    });

    it('un compte VRAIMENT sans rôle reste ignoré et signalé — la distinction ne disparaît pas', async () => {
        // Anti-vacuité : si le correctif avait routé TOUS les comptes, ce cas rendrait 5 aussi.
        const r = await transactionsImportees({});
        expect(r.ajoutees).toBe(0);
        expect(r.sansRole).toBe(1);
        expect(r.avertissements.join(' | ')).toMatch(/sans rôle assigné/i);
    });
});

describe('[FINTABLE-CARTE-SANS-DETTE] le chemin SERVEUR accepte la même chose que le navigateur', () => {
    // ⚠️ Les deux orchestrateurs doivent traiter un rôle identiquement — c'est la raison d'être de
    // `syncCore`. Un parseur serveur qui REFUSE ce que le navigateur accepte ferait échouer le cron
    // au démarrage (`process.exit(1)`) sur une configuration que l'app juge valide.
    it('« debt » sans debtName est accepté (absent comme vide), et normalisé à la chaîne vide', () => {
        expect(parseRolesJson(JSON.stringify({ [ACC_MC]: { kind: 'debt' } })))
            .toEqual({ [ACC_MC]: { kind: 'debt', debtName: '' } });
        expect(parseRolesJson(JSON.stringify({ [ACC_MC]: { kind: 'debt', debtName: '   ' } })))
            .toEqual({ [ACC_MC]: { kind: 'debt', debtName: '' } });
    });

    it('un debtName du mauvais TYPE reste une erreur — c\'est une faute de config, pas un choix', () => {
        expect(() => parseRolesJson(JSON.stringify({ [ACC_MC]: { kind: 'debt', debtName: 42 } })))
            .toThrowError(/debtName/);
    });

    it('un nom réel traverse intact (espaces en trop retirés, casse et accents préservés)', () => {
        expect(parseRolesJson(JSON.stringify({ [ACC_MC]: { kind: 'debt', debtName: '  Hypothèque Condo  ' } })))
            .toEqual({ [ACC_MC]: { kind: 'debt', debtName: 'Hypothèque Condo' } });
    });
});
