// tests/services/fintable/signeSoldeDette.test.ts
//
// [FINTABLE-SOLDE-CARTE-SIGNE-INVERSE] Étape 1 du plan : MESURER le signe d'un solde de carte,
// sans déplacer un dollar.
//
// Le mapper porte `const owed = Math.abs(account.balance)` avec, juste au-dessus, « un solde
// NÉGATIF signifie un crédit en ta faveur ». Marc, interrogé le 2026-09-14, décrit l'INVERSE :
// sur Fintable, devoir 500 $ s'affiche `-500`. Sous sa convention, `Math.abs` sauve le cas
// nominal PAR ACCIDENT pendant que l'avertissement « crédit en ta faveur » parle à chaque passe,
// et le cas rare (solde en sa faveur) devient une dette FANTÔME du même montant, sans un mot.
// `UNE-VALEUR-ABSOLUE-SUR-UNE-CONVENTION-DE-SIGNE-NON-MESUREE-REND-L-HYPOTHESE-INFALSIFIABLE`.
//
// ⚠️ Le ticket déclarait la mesure « inatteignable pour Marc : aucune de ses cartes n'a de
// `debtName` ». RE-MESURÉ sur le code réel (`le périmètre d'un ticket se RECENSE, il ne se cite
// pas`) : c'est FAUX depuis [FINTABLE-CARTE-SANS-DETTE] (PR #956) — son compte atteint bien
// `case 'debt'`, il en sort trois lignes plus bas sur le nom vide. D'où la seule contrainte de
// conception de ce lot : publier le signe AVANT toutes les sorties du bloc. Le cas `nomVide` en
// est la garde.
//
// ⚠️ Et le rapport part en clair dans les journaux GitHub Actions : le MONTANT ne s'écrit jamais.
// C'est ce qu'assertent les gardes de non-fuite, avec leur perturbation.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn() }));
import { readFileSync } from 'node:fs';
import { mapFintableSnapshot, signeSolde, type FintableAccountRole } from '../../../services/fintable/mapSnapshot';
import { runFintableBrowserSync } from '../../../services/fintable/browserSync';
import { runFintableSync } from '../../../mcp/runFintableSync';
import type { StateStore } from '../../../mcp/state/stateStore';
import type { FintableClient } from '../../../services/fintable/client';
import type { FintableSnapshot } from '../../../services/fintable/types';
import type { AppState } from '../../../types';

const CARTE = { id: 'acc_carte', label: 'Desjardins Cash Back Mastercard' };

/** Montant DISTINCTIF : aucun autre nombre du rapport ne peut le produire par hasard. */
const MONTANT_TEMOIN = -8642.17;

function snapshot(balance: number | null, currency = 'CAD'): FintableSnapshot {
    return {
        readAt: 0,
        accounts: [{
            id: CARTE.id, connectionId: 'c', label: CARTE.label, rawType: 'credit',
            currency, balance, balanceAvailable: null, lastTxDate: null, enabled: true,
        }],
        holdings: [], holdingsSkipped: [], unknownTransactionKeys: [], transactions: [],
    };
}

function mappe(balance: number | null, debtName: string, currency = 'CAD') {
    const roles: Record<string, FintableAccountRole> = { [CARTE.id]: { kind: 'debt', debtName } };
    return mapFintableSnapshot(snapshot(balance, currency), { roles, transactionsAfter: null }).report;
}

// ── 1. La fonction pure ─────────────────────────────────────────────────────────────────────────

describe('signeSolde', () => {
    it('distingue les quatre états, et ne rabat jamais un trou sur zéro', () => {
        expect(signeSolde(-500)).toBe('négatif');
        expect(signeSolde(200)).toBe('positif');
        expect(signeSolde(0)).toBe('zéro');
        expect(signeSolde(null)).toBe('absent');
        // ⚠️ §1 no-fake-data : un `NaN` n'est pas un zéro. `zéro` affirmerait « carte soldée »,
        // c'est-à-dire une mesure qu'on n'a pas — et c'est justement la valeur la plus crédible.
        expect(signeSolde(Number.NaN)).toBe('absent');
        expect(signeSolde(Number.POSITIVE_INFINITY)).toBe('absent');
        expect(signeSolde(undefined)).toBe('absent');
    });

    it('le zéro NÉGATIF reste « zéro » et non « négatif »', () => {
        // `-0 < 0` est faux en JS, donc le code est déjà juste — mais rien ne l'affirmait, et
        // réécrire le prédicat avec `Object.is` le retournerait sans qu'aucun test ne bronche.
        expect(signeSolde(-0)).toBe('zéro');
    });
});

// ── 2. Publié AVANT chaque sortie du bloc `debt` — c'est tout l'enjeu ───────────────────────────

describe('le signe est publié pour TOUT compte au rôle « dette »', () => {
    it('nom de dette VIDE — la configuration réelle de Marc, que le ticket disait inatteignable', () => {
        // GARDE PRINCIPALE. Ce compte n'émet aucun payload de dette (sortie sur le nom vide) :
        // si la mesure vivait après cette sortie, Marc ne verrait JAMAIS le signe, et l'étape 2
        // du plan resterait bloquée sur une donnée qu'il est le seul à pouvoir lire.
        expect(mappe(MONTANT_TEMOIN, '').soldesDetteSignes)
            .toEqual([{ label: CARTE.label, signe: 'négatif' }]);
    });

    it('solde ABSENT — publié comme « absent », pas omis', () => {
        // Omettre l'entrée rendrait « pas encore regardé » indiscernable de « Fintable ne le donne
        // pas » : deux causes opposées, un seul silence.
        expect(mappe(null, 'Mastercard').soldesDetteSignes)
            .toEqual([{ label: CARTE.label, signe: 'absent' }]);
    });

    it('devise étrangère — le signe est lisible même quand le montant est inutilisable', () => {
        // La conversion n'est pas implémentée, donc le solde est rejeté ; le SIGNE, lui, ne dépend
        // d'aucune conversion.
        expect(mappe(MONTANT_TEMOIN, 'Mastercard', 'USD').soldesDetteSignes)
            .toEqual([{ label: CARTE.label, signe: 'négatif' }]);
    });

    it('cas nominal — un compte qui aboutit bien à un payload de dette', () => {
        const r = mappe(MONTANT_TEMOIN, 'Mastercard');
        expect(r.soldesDetteSignes).toEqual([{ label: CARTE.label, signe: 'négatif' }]);
        // ⚠️ CONTRÔLE : ce lot ne déplace AUCUN dollar. `Math.abs` reste en place, la dette vaut
        // toujours la valeur absolue. L'étape 2 du plan est ce qui la changera — pas celui-ci.
        expect(r.debts).toEqual([{ name: 'Mastercard', balanceCad: Math.abs(MONTANT_TEMOIN) }]);
    });

    it('aucun compte « dette » → aucune entrée et aucun avertissement', () => {
        // Contrôle négatif : sans lui, une implémentation qui publierait une entrée par compte
        // (chèque compris) passerait toutes les gardes ci-dessus.
        const r = mapFintableSnapshot(snapshot(100), {
            roles: { [CARTE.id]: { kind: 'cash' } }, transactionsAfter: null,
        }).report;
        expect(r.soldesDetteSignes).toEqual([]);
        expect(r.warnings.some((w) => w.includes('signe du solde'))).toBe(false);
    });
});

// ── 3. La non-fuite du MONTANT, dans les deux formes qu'il pourrait prendre ─────────────────────

describe('le rapport publie le SIGNE, jamais le MONTANT', () => {
    const chiffres = (w: string) => w.replace(/ | /g, ' ');

    for (const [nom, solde] of [['négatif', MONTANT_TEMOIN], ['positif', -MONTANT_TEMOIN]] as const) {
        it(`solde ${nom} : ni la valeur brute, ni sa forme formatée n'apparaissent`, () => {
            const w = mappe(solde, '').warnings.filter((x) => x.includes('signe du solde'));
            expect(w).toHaveLength(1);
            const texte = chiffres(w[0]);
            // ⚠️ L'attendu NÉGATIF se compose comme le positif : `formatCAD` sépare par une
            // INSÉCABLE, donc « 8 642 » écrit avec une espace ordinaire ne matcherait RIEN et la
            // garde serait vacueuse (`UN-INVENTAIRE-QUI-ATTEINT-ZERO-S-INVERSE-EN-REGLE`).
            // D'où la normalisation ci-dessus, et les deux graphies testées.
            expect(texte).not.toContain('8642');
            expect(texte).not.toContain('8 642');
            expect(texte).not.toContain('642,17');
            expect(texte).not.toContain('642.17');
            // ANTI-VACUITÉ : la garde lit bien la bonne chaîne, et elle dit le signe.
            expect(texte).toContain(nom);
            expect(texte).toContain(CARTE.label);
        });
    }

    it('le compte est nommé une seule fois, et la question est posée une seule fois', () => {
        // Un avertissement répété par compte devient du décor qu'on cesse de lire — et il y a
        // plusieurs cartes chez Marc. Un seul message, la liste dedans.
        const deux: FintableSnapshot = {
            ...snapshot(MONTANT_TEMOIN),
            accounts: [
                ...snapshot(MONTANT_TEMOIN).accounts,
                {
                    id: 'acc_visa', connectionId: 'c', label: 'Visa', rawType: 'credit',
                    currency: 'CAD', balance: 12, balanceAvailable: null, lastTxDate: null, enabled: true,
                },
            ],
        };
        const r = mapFintableSnapshot(deux, {
            roles: {
                [CARTE.id]: { kind: 'debt', debtName: '' },
                acc_visa: { kind: 'debt', debtName: '' },
            },
            transactionsAfter: null,
        }).report;
        expect(r.soldesDetteSignes).toEqual([
            { label: CARTE.label, signe: 'négatif' },
            { label: 'Visa', signe: 'positif' },
        ]);
        expect(r.warnings.filter((w) => w.includes('signe du solde'))).toHaveLength(1);
        expect(r.warnings.find((w) => w.includes('signe du solde'))).toContain('« Visa » → positif');
    });
});

// ── 4. Le CÂBLAGE : la mesure arrive-t-elle jusqu'au rapport que Marc LIT ? ─────────────────────
//
// ⚠️ Une garde au producteur ne prouve rien sur la chaîne : le signe publié dans le rapport du
// MAPPER ne sert à rien s'il n'atteint pas `report.warnings`, la seule surface transportée
// jusqu'à `SystemView` et jusqu'au journal du cron. Les DEUX orchestrateurs, parce que chacun
// compose ses avertissements à la main (c'est l'histoire de `syncCore` lui-même).

function clientFake(): FintableClient {
    return {
        get: async (chemin: string) => {
            if (chemin.startsWith('/accounts')) {
                return {
                    data: [{
                        id: CARTE.id, connection_id: 'conn_1', name: CARTE.label, type: 'credit',
                        currency: 'CAD', balance: String(MONTANT_TEMOIN), cash_balance: null, debt: null,
                    }],
                };
            }
            return { data: [] };
        },
        getAllPages: async () => [],
    } as unknown as FintableClient;
}

const ETAT = {
    transactions: [], debts: [], assets: [],
    fintableRoles: { [CARTE.id]: { kind: 'debt', debtName: '' } },
} as unknown as AppState;

describe('la mesure atteint le rapport LU par Marc', () => {
    it('navigateur : le signe est dans `report.warnings`', async () => {
        const { report } = await runFintableBrowserSync(ETAT, 'jeton_factice', {
            client: clientFake(), now: () => Date.parse('2026-09-16T12:00:00Z'),
        });
        const w = report.warnings.find((x) => x.includes('signe du solde'));
        expect(w).toBeDefined();
        expect(w).toContain('négatif');
        expect(w).not.toContain('8642');
    });

    it('cron : le signe est dans `report.warnings`', async () => {
        const store: StateStore = {
            get: async () => ETAT,
            getWithVersion: async () => ({ state: ETAT, version: 1 }),
            save: async () => ({ backupPath: '/backup' }),
            canWrite: true,
        };
        // ⚠️ Contrat DIFFÉRENT du navigateur : le cron rend le rapport NU, pas `{ report }`.
        const report = await runFintableSync(store, {
            token: 't', roles: { [CARTE.id]: { kind: 'debt', debtName: '' } }, client: clientFake(),
        });
        const w = report.warnings.find((x) => x.includes('signe du solde'));
        expect(w).toBeDefined();
        expect(w).toContain('négatif');
        expect(w).not.toContain('8642');
    });
});

// ── 5. L'inventaire qui sait MOURIR ────────────────────────────────────────────────────────────

describe('[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE] — durée de vie bornée', () => {
    it('l\'avertissement de mesure est TEMPORAIRE : il meurt avec l\'étape 2', () => {
        // ⚠️ `UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR` : un avertissement de mesure qui survit à
        // sa mesure devient un avertissement PERMANENT, donc mort — exactement le défaut que ce
        // ticket reproche au message « crédit en ta faveur ».
        //
        // Quand la convention de signe sera fixée (étape 2 de `docs/A_FAIRE_MOI.md`) :
        //   1. retirer l'avertissement `Mesure en cours — signe du solde…` du mapper ;
        //   2. GARDER `soldesDetteSignes` (structuré, muet) si l'étape 2 s'en sert ;
        //   3. et INVERSER ce test plutôt que le supprimer, pour que la trace reste.
        const src = readFileSync('services/fintable/mapSnapshot.ts', 'utf8');
        expect(src).toContain('Mesure en cours — signe du solde');
        // Le jeton du ticket est présent : sans lui, personne ne retrouve ce qui doit mourir.
        expect(src).toContain('[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]');
    });
});
