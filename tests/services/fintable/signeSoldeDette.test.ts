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
import { MAX_CLES_CITEES } from '../../../services/fintable/decode';
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
        holdings: [], holdingsSkipped: [], unknownTransactionKeys: [], unknownTransactionSamples: [], transactions: [],
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
//
// ⚠️ INVERSÉ le 2026-09-16, pas supprimé. L'avertissement « Mesure en cours — signe du solde » est
// MORT : sa mesure est faite (rapport « → positif », Marc : « c'est en ma faveur »). Mais la règle
// qu'il portait — **un avertissement de ce bloc ne publie JAMAIS un montant** — est plus forte que
// lui : le rapport est rendu dans `SystemView` sans gate de mode discret ET `cat`é en clair dans les
// journaux GitHub Actions d'un dépôt PUBLIC. Elle s'applique donc aux avertissements qui REMPLACENT
// celui-là (« en ta faveur », « carte soldée »).
// `UN-INVENTAIRE-QUI-ATTEINT-ZERO-S-INVERSE-EN-REGLE` : ce qui meurt est l'INVENTAIRE, ce qui reste
// est la RÈGLE.

describe('aucun avertissement du bloc « dette » ne publie un MONTANT', () => {
    const chiffres = (w: string) => w.replace(/ | /g, ' ');

    for (const [nom, solde, extrait] of [
        ['en crédit (en ta faveur)', -MONTANT_TEMOIN, 'EN TA FAVEUR'],
        ['dû (cas nominal)', MONTANT_TEMOIN, ''],
    ] as const) {
        it(`solde ${nom} : ni la valeur brute, ni sa forme formatée n'apparaissent`, () => {
            const w = mappe(solde, 'Mastercard').warnings;
            const texte = chiffres(w.join(' | '));
            // ⚠️ L'attendu NÉGATIF se compose comme le positif : `formatCAD` sépare par une
            // INSÉCABLE, donc « 8 642 » écrit avec une espace ordinaire ne matcherait RIEN et la
            // garde serait vacueuse (`UN-INVENTAIRE-QUI-ATTEINT-ZERO-S-INVERSE-EN-REGLE`).
            expect(texte).not.toContain('8642');
            expect(texte).not.toContain('8 642');
            expect(texte).not.toContain('642,17');
            expect(texte).not.toContain('642.17');
            // ANTI-VACUITÉ : sans elle, un bloc qui n'émettrait PLUS RIEN passerait aussi.
            if (extrait) expect(texte).toContain(extrait);
            else expect(w.length + mappe(solde, 'Mastercard').debts.length).toBeGreaterThan(0);
        });
    }

    it('plus aucun avertissement ne publie une LISTE de libellés en bloc', () => {
        // ⚠️ INVERSION de la garde « la liste est BORNÉE ». Le message agrégé a disparu ; ce qui le
        // remplace est émis DANS la boucle, donc il ne nomme qu'un compte à la fois et ne peut plus
        // produire de liste. La garde vérifie que ce fait TIENT — un futur message agrégé devrait
        // re-passer par `MAX_CLES_CITEES`, et ce rouge est là pour le rappeler.
        const N = MAX_CLES_CITEES + 3;
        const comptes = Array.from({ length: N }, (_, i) => ({
            id: `acc_${i}`, connectionId: 'c', label: `Carte ${i}`, rawType: 'credit',
            currency: 'CAD', balance: 100, balanceAvailable: null, lastTxDate: null, enabled: true,
        }));
        const roles: Record<string, FintableAccountRole> = {};
        for (const c of comptes) roles[c.id] = { kind: 'debt', debtName: `Dette ${c.id}` };

        const r = mapFintableSnapshot({ ...snapshot(100), accounts: comptes }, {
            roles, transactionsAfter: null,
        }).report;

        // Le champ STRUCTURÉ garde tout le monde : la mesure n'est pas bornée, l'AFFICHAGE l'était.
        expect(r.soldesDetteSignes).toHaveLength(N);
        // Aucun avertissement ne cite plus de 1 compte : le plus long n'en nomme qu'un.
        // ⚠️ Le compte se fait par le libellé DÉLIMITÉ (« … »), pas par sa sous-chaîne nue : mon
        // premier jet cherchait `Dette acc_1`, qui est un PRÉFIXE de `Dette acc_10` — un message
        // ne nommant qu'un seul compte en comptait donc deux, et la garde rougissait sur du code
        // sain (`UN-RECENSEUR-SE-VERIFIE-AUTANT-QUE-LE-CODE-QU-IL-RECENSE`). Les guillemets sont
        // ceux que le message écrit lui-même, donc la délimitation n'est pas inventée.
        for (const w of r.warnings) {
            const cites = comptes.filter((c) => w.includes(`« Dette ${c.id} »`)).length;
            expect(cites).toBeLessThanOrEqual(1);
        }
        // ANTI-VACUITÉ : au moins un compte EST nommé, sinon « aucun n'en cite deux » serait
        // satisfait par un bloc devenu muet.
        expect(r.warnings.some((w) => comptes.some((c) => w.includes(`« Dette ${c.id} »`)))).toBe(true);
    });
});

// ── 3 bis. LE CORRECTIF DU SIGNE — la convention MESURÉE, et ce qu'elle change ──────────────────
//
// ⚠️ Convention établie le 2026-09-16 : `négatif = tu DOIS`, `positif = c'est en ta faveur`.
// Ces gardes sont DISCRIMINANTES contre le code d'avant (`const owed = Math.abs(account.balance)`) :
// sous `Math.abs`, un solde `+200` produisait une dette de 200 $ — la dette FANTÔME que tout ce
// ticket existe pour empêcher.

describe('[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE] le solde signé va dans le bon registre', () => {
    it('solde NÉGATIF = tu dois → la dette est mise à jour, en positif', () => {
        const r = mappe(-500, 'Mastercard');
        expect(r.debts).toEqual([{ name: 'Mastercard', balanceCad: 500 }]);
        // Le cas nominal ne déclenche AUCUN des deux messages d'abstention : sans ce contrôle,
        // un bloc qui n'émettrait plus jamais de dette passerait les deux tests suivants.
        expect(r.warnings.filter((w) => w.includes('EN TA FAVEUR') || w.includes('carte soldée'))).toHaveLength(0);
    });

    it('solde POSITIF = en ta faveur → AUCUNE dette (sous Math.abs : dette fantôme de 200 $)', () => {
        const r = mappe(200, 'Mastercard');
        // ⚠️ LA garde du lot. Sur le code d'avant, `debts` valait `[{ name, balanceCad: 200 }]`.
        expect(r.debts).toEqual([]);
        const w = r.warnings.filter((x) => x.includes('EN TA FAVEUR'));
        expect(w).toHaveLength(1);
        // Le message DIT que la dette garde sa valeur précédente : s'abstenir en silence serait
        // indiscernable d'une mise à jour réussie.
        expect(w[0]).toContain('valeur précédente');
        expect(w[0]).toContain('Mastercard');
    });

    it('solde ZÉRO = carte soldée → aucune dette, et le message NOMME la limite de l\'app', () => {
        // [FINTABLE-CARTE-SOLDEE-GARDE-LA-DETTE-D-HIER] `applyDebt` refuse tout solde `<= 0`, donc
        // émettre le payload produirait un « Payload non appliqué » cryptique sur un état NORMAL.
        const r = mappe(0, 'Mastercard');
        expect(r.debts).toEqual([]);
        const w = r.warnings.filter((x) => x.includes('carte soldée'));
        expect(w).toHaveLength(1);
        expect(w[0]).toContain('valeur précédente');
        // Les deux messages sont MUTUELLEMENT EXCLUSIFS : zéro n'est pas « en ta faveur ».
        expect(r.warnings.filter((x) => x.includes('EN TA FAVEUR'))).toHaveLength(0);
    });

    it('le choix du registre ne dépend PAS du nom de dette : un nom vide n\'émet toujours rien', () => {
        // Contrôle négatif du contrôle négatif : `[FINTABLE-CARTE-SANS-DETTE]` sort du bloc AVANT
        // le calcul, donc aucun des messages du signe ne doit apparaître — le choix de Marc
        // (« importe les transactions, ne touche à aucun solde ») reste respecté dans les 3 cas.
        for (const solde of [-500, 200, 0]) {
            const r = mappe(solde, '');
            expect(r.debts).toEqual([]);
            expect(r.warnings.filter((x) => x.includes('EN TA FAVEUR') || x.includes('carte soldée'))).toHaveLength(0);
        }
    });
});

// ── 4. Le CÂBLAGE : le message arrive-t-il jusqu'au rapport que Marc LIT ? ──────────────────────
//
// ⚠️ Une garde au producteur ne prouve rien sur la chaîne : ce qui est décidé dans le MAPPER ne
// sert à rien s'il n'atteint pas `report.warnings`, la seule surface transportée jusqu'à
// `SystemView` et jusqu'au journal du cron. Les DEUX orchestrateurs, parce que chacun compose ses
// avertissements à la main (c'est l'histoire de `syncCore` lui-même).

function clientFake(): FintableClient {
    return {
        get: async (chemin: string) => {
            if (chemin.startsWith('/accounts')) {
                return {
                    data: [{
                        id: CARTE.id, connection_id: 'conn_1', name: CARTE.label, type: 'credit',
                        currency: 'CAD', balance: String(-MONTANT_TEMOIN), cash_balance: null, debt: null,
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
    fintableRoles: { [CARTE.id]: { kind: 'debt', debtName: 'Mastercard' } },
} as unknown as AppState;

describe('le message atteint le rapport LU par Marc', () => {
    it('navigateur : le crédit est dans `report.warnings`, sans montant', async () => {
        const { report } = await runFintableBrowserSync(ETAT, 'jeton_factice', {
            client: clientFake(), now: () => Date.parse('2026-09-16T12:00:00Z'),
        });
        const w = report.warnings.find((x) => x.includes('EN TA FAVEUR'));
        expect(w).toBeDefined();
        expect(w).not.toContain('8642');
    });

    it('cron : le crédit est dans `report.warnings`, sans montant', async () => {
        const store: StateStore = {
            get: async () => ETAT,
            getWithVersion: async () => ({ state: ETAT, version: 1 }),
            save: async () => ({ backupPath: '/backup' }),
            canWrite: true,
        };
        // ⚠️ Contrat DIFFÉRENT du navigateur : le cron rend le rapport NU, pas `{ report }`.
        const report = await runFintableSync(store, {
            token: 't', roles: { [CARTE.id]: { kind: 'debt', debtName: 'Mastercard' } }, client: clientFake(),
        });
        const w = report.warnings.find((x) => x.includes('EN TA FAVEUR'));
        expect(w).toBeDefined();
        expect(w).not.toContain('8642');
    });
});

// ── 5. L'inventaire qui sait MOURIR ────────────────────────────────────────────────────────────

describe('[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE] — l\'avertissement de mesure est MORT', () => {
    it('INVERSÉ le 2026-09-16 : la mesure est faite, le message ne doit pas revenir', () => {
        // ⚠️ `UN-INVENTAIRE-DE-DETTE-DOIT-SAVOIR-MOURIR` : cette assertion affirmait l'inverse
        // (« l'avertissement EXISTE, il meurt à l'étape 2 »). L'étape est arrivée le jour même, et
        // elle s'INVERSE au même endroit plutôt que d'être supprimée — sinon rien ne dirait que
        // cette question a été posée, mesurée, et tranchée. Le ressusciter serait un avertissement
        // PERMANENT, donc mort (`UN-AVERTISSEMENT-PERMANENT-EST-UN-AVERTISSEMENT-MORT`).
        const src = readFileSync('services/fintable/mapSnapshot.ts', 'utf8');
        expect(src).not.toContain('Mesure en cours — signe du solde');
        // Le jeton du ticket RESTE : c'est lui qui relie le code à l'histoire de la mesure.
        expect(src).toContain('[FINTABLE-SOLDE-CARTE-SIGNE-INVERSE]');
        // Et la MESURE structurée survit au message : c'est elle qui permettra de re-vérifier la
        // convention si Fintable change d'avis. La supprimer serait perdre le seul capteur.
        expect(src).toContain('soldesDetteSignes.push');
    });
});
