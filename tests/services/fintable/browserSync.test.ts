/**
 * [FINTABLE-7] Sync Fintable exécutée dans le NAVIGATEUR.
 *
 * Ce chemin écrit de l'argent réel sans supervision de la même façon que le cron serveur — les
 * tests verrouillent donc les mêmes garanties : rapport TOUJOURS rendu, isolation par payload,
 * bascule plafonnée, et surtout « aucun état écrit à moitié » quand la passe échoue.
 */
import { describe, it, expect, vi } from 'vitest';
import { runFintableBrowserSync, listFintableAccountsForSetup } from '../../../services/fintable/browserSync';
import { FintableClient } from '../../../services/fintable/client';
import { FintableError } from '../../../services/fintable/types';
import { buildDefaultAppState } from '../../../mcp/state/appStateDefaults';
import type { AppState, FintableAccountRoleConfig } from '../../../types';
import type { FintableAccountRole } from '../../../services/fintable/mapSnapshot';

vi.mock('../../../services/errorLogger', () => ({ logError: vi.fn() }));

const NOW = Date.parse('2026-07-30T12:00:00Z');
const now = () => NOW;

function stateWith(over: Partial<AppState> = {}): AppState {
    return { ...buildDefaultAppState(), transactions: [], ...over } as AppState;
}

/** Faux client : rend des comptes/transactions au FORMAT BRUT de l'API (décodeur strict en aval). */
function fakeClient(accounts: unknown[], transactions: unknown[] = []): FintableClient {
    return {
        get: vi.fn(async (path: string) => {
            if (path.startsWith('/accounts')) return { data: accounts };
            return { data: [] };
        }),
        getAllPages: vi.fn(async () => transactions),
    } as unknown as FintableClient;
}

const account = (o: Record<string, unknown> = {}) => ({
    id: 'acc_1', connection_id: 'conn_1', name: 'Compte chèque', type: 'depository',
    currency: 'CAD', balance: '1500.00', cash_balance: null, debt: null, ...o,
});

describe('runFintableBrowserSync — garanties de la passe', () => {
    it('jeton absent → rapport d\'échec explicite, AUCUN état rendu', async () => {
        const r = await runFintableBrowserSync(stateWith(), '  ', { now });
        expect(r.statePatch).toBeNull();
        expect(r.report.error).toMatch(/[Jj]eton Fintable absent/);
        // Compteurs à 0 : sur un échec on ne fabrique aucune donnée (no-fake-data).
        expect(r.report.transactionsAdded).toBe(0);
        expect(r.report.accountsSeen).toBe(0);
    });

    it('panne réseau → rapport d\'échec, jamais de throw ni d\'état à moitié appliqué', async () => {
        const client = {
            get: vi.fn(async () => { throw new FintableError('panne réseau', 'NETWORK'); }),
            getAllPages: vi.fn(async () => []),
        } as unknown as FintableClient;

        const r = await runFintableBrowserSync(stateWith(), 'jeton', { client, now });
        expect(r.statePatch).toBeNull(); // ← rien à écrire : l'appelant ne peut pas corrompre l'état
        expect(r.report.error).toContain('NETWORK');
        expect(r.report.error).toContain('panne réseau');
    });

    it('compte de liquidités avec rôle → cash mis à jour et soldes courtier persistés', async () => {
        const roles: Record<string, FintableAccountRoleConfig> = {
            acc_1: { kind: 'cash' },
            acc_2: { kind: 'investment', taxRegime: 'NON-ENREG' },
        };
        const client = fakeClient([
            account(),
            account({ id: 'acc_2', name: 'Disnat', type: 'brokerage', balance: '136863.18' }),
        ]);

        const r = await runFintableBrowserSync(stateWith({ fintableRoles: roles }), 'jeton', { client, now });

        expect(r.report.error).toBeNull();
        expect(r.statePatch).not.toBeNull();
        expect(r.report.accountsSeen).toBe(2);
        expect(r.report.accountsWithoutRole).toBe(0);
        expect(r.statePatch?.fintableBrokerBalances).toEqual([
            { accountId: 'acc_2', label: 'Disnat', balanceCad: 136863.18, taxRegime: 'NON-ENREG', at: NOW },
        ]);
        // Le rapport voyage dans l'état → la carte de diagnostic affiche la même chose que le cron.
        expect(r.statePatch?.fintableSyncReport?.at).toBe(NOW);
    });

    it('compte SANS rôle → compté et signalé, jamais deviné', async () => {
        const client = fakeClient([account({ id: 'acc_inconnu', name: 'Compte mystère' })]);
        const r = await runFintableBrowserSync(stateWith({ fintableRoles: {} }), 'jeton', { client, now });

        expect(r.report.error).toBeNull();
        expect(r.report.accountsWithoutRole).toBe(1);
        expect(r.report.warnings.some((w) => w.includes('sans rôle'))).toBe(true);
        // Rien n'a été rangé d'office : aucun solde courtier, aucune dette.
        expect(r.statePatch?.fintableBrokerBalances).toEqual([]);
        expect(r.report.debtsUpdated).toEqual([]);
    });

    it('transaction datée dans le FUTUR → bascule plafonnée à aujourd\'hui, avec avertissement', async () => {
        const state = stateWith({
            transactions: [
                { id: 1, date: '2099-01-01', payee: 'Typo', amount: -10, category: 'Autre', status: 'processed' },
            ] as AppState['transactions'],
        });
        const r = await runFintableBrowserSync(state, 'jeton', { client: fakeClient([]), now });

        expect(r.report.cutoverDateUsed).toBe('2026-07-30');
        expect(r.report.warnings.some((w) => w.includes('FUTUR'))).toBe(true);
    });

    /**
     * ⚠️ [FINTABLE-SYNC-STALE-BASE] Le résiduel ASSUMÉ de la PR #545, celui-ci fermé.
     *
     * La passe recevait son état AVANT le fetch réseau (plusieurs secondes) et bâtissait son patch
     * dessus. Une saisie manuelle faite pendant cette fenêtre atterrissait dans le store mais pas
     * dans le snapshot : le patch, qui touche justement `transactions`, réécrivait le tableau
     * reconstruit à partir de la base amputée — la saisie DISPARAISSAIT. Le verrou de sync ne
     * protège que contre une autre passe, jamais contre l'utilisateur.
     *
     * DISCRIMINANT : `getAllPages` (le fetch) mute l'état « vivant » pendant son await, exactement
     * comme Marc qui tape une transaction pendant que ça tourne. Sur le code d'AVANT, `written` ne
     * contient que la transaction Fintable ; ici on exige les DEUX.
     */
    it('[FINTABLE-SYNC-STALE-BASE] une saisie manuelle PENDANT le fetch survit à la passe', async () => {
        const base = stateWith({ fintableRoles: { acc_1: { kind: 'cash' } } });
        const manual = {
            id: 999, date: '2026-07-29', payee: 'Saisie manuelle de Marc',
            amount: -42, category: 'Autre', status: 'processed',
        } as unknown as NonNullable<AppState['transactions']>[number];

        // L'état « vivant » du store — ce que `getFreshState` relira au moment d'appliquer.
        let live: AppState = base;

        const client = {
            get: vi.fn(async (path: string) => {
                if (path.startsWith('/accounts')) return { data: [account()] };
                return { data: [] };
            }),
            getAllPages: vi.fn(async () => {
                // PENDANT le réseau : Marc ajoute une transaction à la main dans un autre onglet UI.
                live = { ...live, transactions: [...(live.transactions ?? []), manual] } as AppState;
                return [{
                    id: 'ft_1', account_id: 'acc_1', date: '2026-07-30', amount: '-19.99',
                    currency: 'CAD', description: 'ABONNEMENT FINTABLE', merchant: null, category: null,
                }];
            }),
        } as unknown as FintableClient;

        const r = await runFintableBrowserSync(base, 'jeton', { client, now, getFreshState: () => live });

        expect(r.report.error).toBeNull();
        expect(r.report.transactionsAdded).toBe(1);   // la passe a bien fait son travail…
        const written = r.statePatch?.transactions;
        expect(written, 'la passe doit réécrire `transactions` — sinon le test ne discrimine rien').toBeDefined();
        // …ET la saisie manuelle est toujours là (elle était PERDUE sur le code d'avant).
        expect(written?.some((t) => t.id === 999)).toBe(true);
        expect(written?.some((t) => t.payee?.includes('ABONNEMENT FINTABLE'))).toBe(true);
    });

    /**
     * [finding silent-failure-hunter, PR #566] `getFreshState` est fourni par l'appelant : rien ne
     * garantit qu'il ne lève pas (store démonté, hydratation en cours). L'appel vit à l'INTÉRIEUR du
     * grand `try`, donc une exception devient un rapport d'échec honnête plutôt qu'une rejection
     * non gérée — mais aucun test ne le PROUVAIT, et un futur refactor pouvait le sortir du `try`
     * sans que rien ne s'allume. Ce test verrouille la position de l'appel, pas seulement son effet.
     */
    it('`getFreshState` qui LÈVE → rapport d\'échec, jamais d\'état à moitié écrit', async () => {
        const r = await runFintableBrowserSync(stateWith(), 'jeton', {
            client: fakeClient([account()]), now,
            getFreshState: () => { throw new Error('store indisponible'); },
        });

        expect(r.statePatch).toBeNull();               // ← l'appelant ne peut rien corrompre
        expect(r.report.error).toContain('store indisponible');
    });

    it('une dette au rôle sans nom est ignorée sans faire échouer la passe', async () => {
        const roles = { acc_1: { kind: 'debt', debtName: '   ' } } as unknown as Record<string, FintableAccountRoleConfig>;
        const r = await runFintableBrowserSync(stateWith({ fintableRoles: roles }), 'jeton', {
            client: fakeClient([account()]), now,
        });
        expect(r.report.error).toBeNull();          // la passe survit
        expect(r.report.accountsWithoutRole).toBe(1); // et le compte est signalé, pas avalé
    });
});

describe('listFintableAccountsForSetup — écran de configuration', () => {
    it('liste les comptes SANS pager les transactions ni les positions (quota + latence)', async () => {
        const getAllPages = vi.fn(async () => []);
        const get = vi.fn(async (path: string) => {
            if (path.startsWith('/accounts')) return { data: [account(), account({ id: 'acc_2', name: 'Disnat' })] };
            return { data: [] };
        });
        const client = { get, getAllPages } as unknown as FintableClient;

        const r = await listFintableAccountsForSetup('jeton', { client });

        expect(r.error).toBeNull();
        expect(r.accounts.map((a) => a.id)).toEqual(['acc_1', 'acc_2']);
        // Le discriminant : aucun appel de pagination (transactions) ni de positions par compte.
        expect(getAllPages).not.toHaveBeenCalled();
        expect(get.mock.calls.every(([p]) => String(p).startsWith('/accounts'))).toBe(true);
    });

    it('jeton refusé → message EXPLOITABLE (« pourquoi »), pas un échec générique', async () => {
        const client = {
            get: vi.fn(async () => { throw new FintableError('jeton invalide', 'AUTH'); }),
            getAllPages: vi.fn(async () => []),
        } as unknown as FintableClient;

        const r = await listFintableAccountsForSetup('mauvais-jeton', { client });
        expect(r.accounts).toEqual([]);
        expect(r.error).toContain('AUTH');
        expect(r.error).toContain('jeton invalide');
    });

    it('jeton vide → refus immédiat, aucun appel réseau', async () => {
        const get = vi.fn();
        const r = await listFintableAccountsForSetup('   ', { client: { get } as unknown as FintableClient });
        expect(r.error).toMatch(/[Jj]eton Fintable absent/);
        expect(get).not.toHaveBeenCalled();
    });
});

describe('garde de parité : rôle PERSISTÉ ≡ rôle du MAPPER', () => {
    it('les deux formes sont mutuellement assignables (verrou au COMPILE)', () => {
        // `FintableAccountRoleConfig` (types.ts, sans dépendance) et `FintableAccountRole`
        // (mapper pur) sont volontairement déclarés séparément. Si l'un dérive — un `kind` ajouté
        // d'un seul côté, une graphie de régime divergente — ces affectations cassent le typecheck
        // au lieu de laisser un rôle mal formé filer jusqu'au mapper à l'exécution.
        const persisted: FintableAccountRoleConfig[] = [
            { kind: 'cash' },
            { kind: 'debt', debtName: 'Visa' },
            { kind: 'investment' },
            { kind: 'investment', taxRegime: 'NON-ENREG' },
            { kind: 'ignore' },
        ];
        const asMapper: FintableAccountRole[] = persisted;
        const backAgain: FintableAccountRoleConfig[] = asMapper;
        expect(backAgain).toHaveLength(5);
    });
});

/**
 * ⚠️ [FINTABLE-BROWSER-RELATIVE-BASE] Marc, après avoir collé son jeton : « ça me dit url invalide
 * mais c'est un jeton pas une url ». Il avait raison — le message venait de `new URL()`, pas de lui.
 *
 * Cause : TOUS les tests ci-dessus injectent un `client` factice, donc la ligne qui construit le
 * VRAI client (`new FintableClient({ baseUrl: '/api/fintable' })`) n'était exécutée par AUCUN test.
 * Or `new URL('/api/fintable/accounts')` à un seul argument LÈVE `TypeError: Invalid URL` : une base
 * relative n'est pas une URL absolue. Même classe que le test de câblage de la carte — le chemin par
 * DÉFAUT (celui qu'emprunte la production) n'était couvert nulle part.
 *
 * Ces tests-ci n'injectent donc AUCUN client : ils exercent le vrai transport via un faux `fetch`.
 */
describe('transport RÉEL depuis le navigateur (aucun client injecté)', () => {
    it('résout la base relative contre l\'origine — pas de « Invalid URL »', async () => {
        const calls: string[] = [];
        const fetchMock = vi.fn(async (url: string | URL) => {
            calls.push(String(url));
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);

        const r = await listFintableAccountsForSetup('jeton');

        expect(r.error).toBeNull();           // ← « Invalid URL » sur l'ancien code
        expect(calls.length).toBeGreaterThan(0);
        // L'appel part bien vers le proxy same-origin, sur l'origine courante.
        expect(calls[0]).toContain('/api/fintable/accounts');
        expect(calls[0].startsWith(window.location.origin)).toBe(true);
        vi.unstubAllGlobals();
    });

    it('le jeton voyage en en-tête Authorization, JAMAIS dans l\'URL', async () => {
        let seenUrl = '';
        let seenAuth: string | null = null;
        vi.stubGlobal('fetch', vi.fn(async (url: string | URL, init?: RequestInit) => {
            seenUrl = String(url);
            const h = init?.headers as Record<string, string> | undefined;
            seenAuth = h?.Authorization ?? null;
            return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }));

        await listFintableAccountsForSetup('jeton-ultra-secret');

        expect(seenAuth).toBe('Bearer jeton-ultra-secret');
        expect(seenUrl).not.toContain('jeton-ultra-secret');
        vi.unstubAllGlobals();
    });

    it('un 401 devient un message qui parle du JETON, pas une erreur générique', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: { type: 'unauthorized', message: 'Invalid token' } }),
            { status: 401 },
        )));

        const r = await listFintableAccountsForSetup('mauvais-jeton');

        expect(r.accounts).toEqual([]);
        expect(r.error).toContain('AUTH');
        expect(r.error).toMatch(/jeton/i);   // « jeton absent, expiré ou révoqué »
        vi.unstubAllGlobals();
    });
});

/**
 * [FINTABLE-RATTRAPAGE] Le mode RATTRAPAGE — demande de Marc (2026-08-18).
 *
 * ⚠️ CE QUE CES TESTS VERROUILLENT, et ce n'est pas évident : il y a DEUX bornes, pas une. La
 * requête est bornée (`date_from = bascule`) ET le mapper filtre (`tx.date <= transactionsAfter`,
 * strict). N'en lever qu'une donne un rattrapage qui télécharge tout l'historique et n'en garde
 * RIEN — panne parfaitement silencieuse, et exactement le symptôme que Marc a signalé. Les deux
 * assertions ci-dessous sont donc indissociables.
 */
describe('runFintableBrowserSync — rattrapage d\'historique', () => {
    const txBrut = (o: Record<string, unknown> = {}) => ({
        id: 'tx_1', account_id: 'acc_1', date: '2025-09-15', amount: '-42.00',
        currency: 'CAD', description: 'Metro', pending: false, ...o,
    });
    const roles = { acc_1: { kind: 'cash' } as FintableAccountRoleConfig };

    it('lève la borne de REQUÊTE : aucune `date_from` envoyée à l\'API', async () => {
        const client = fakeClient([account()], [txBrut()]);
        await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2026-07-01', payee: 'X', amount: -5 }] as never }),
            'jeton', { client, now, backfill: true },
        );
        const query = (client.getAllPages as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(query.date_from, 'une borne ici = rien d\'ancien n\'est même téléchargé').toBeUndefined();
    });

    it('sync ORDINAIRE : la borne reste (rétrocompat bit-identique)', async () => {
        const client = fakeClient([account()], [txBrut()]);
        await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2026-07-01', payee: 'X', amount: -5 }] as never }),
            'jeton', { client, now },
        );
        const query = (client.getAllPages as ReturnType<typeof vi.fn>).mock.calls[0][1];
        expect(query.date_from).toBe('2026-07-01');
    });

    it('lève AUSSI la borne du MAPPER : l\'historique ancien est réellement gardé', async () => {
        const client = fakeClient([account()], [txBrut({ date: '2025-09-15' })]);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2026-07-01', payee: 'X', amount: -5 }] as never }),
            'jeton', { client, now, backfill: true },
        );
        // Sans `transactionsAfter: null`, cette transaction de 2025 serait comptée « écartée ».
        expect(r.report.skippedBeforeCutover).toBe(0);
        expect(r.report.transactionsAdded).toBeGreaterThan(0);
        expect(r.report.wasBackfill).toBe(true);
    });

    /**
     * ⚠️ LA FIN DU « 0 EN PLUS » TROMPEUR. Le compteur existait dans le rapport du mapper depuis
     * toujours, mais ne sortait que dans le script de dry-run — Marc voyait « 0 transactions en
     * plus » sans savoir que la passe venait d'en ignorer des centaines, et en a conclu à une panne.
     */
    it('sync ordinaire : les écartées sont COMPTÉES et rendues', async () => {
        const client = fakeClient([account()], [txBrut({ date: '2025-09-15' }), txBrut({ id: 'tx_2', date: '2025-10-01' })]);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2026-07-01', payee: 'X', amount: -5 }] as never }),
            'jeton', { client, now },
        );
        expect(r.report.skippedBeforeCutover, 'sans ce chiffre, « 0 en plus » se lit comme une panne').toBe(2);
        expect(r.report.wasBackfill).toBe(false);
    });

    /**
     * ⚠️ CE TEST A ÉTÉ RÉÉCRIT, et c'est la faute la plus instructive du lot. Sa 1re version
     * n'assérait que `r.incertaines` — la sortie du PRODUCTEUR. Or `applyBankStatement` reconstruit
     * chaque transaction CHAMP PAR CHAMP : `isDuplicate` n'était pas déclaré dans `BankTransaction`
     * et se faisait jeter en silence. Tout le classement était donc un NO-OP, et les doublons à
     * libellé différent étaient écrits comme de vraies dépenses — double comptage dans le budget.
     * Le test restait vert : il regardait le bon module et la mauvaise extrémité de la chaîne.
     * C'est `GARDE-AU-PRODUCTEUR-NE-PROUVE-PAS-LA-CHAINE`, leçon écrite le MATIN MÊME et répétée
     * le jour même. La garde vise désormais `statePatch.transactions` : ce qui atteint le store.
     */
    it('un doublon ÉVIDENT est écrit MARQUÉ dans le store — pas seulement classé', async () => {
        const client = fakeClient([account()], [txBrut({ date: '2025-09-15', description: 'Metro', amount: '-42.00' })]);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2025-09-15', payee: 'METRO #12', amount: -42 }] as never }),
            'jeton', { client, now, backfill: true },
        );
        expect(r.incertaines, 'un doublon évident ne doit PAS déranger Marc').toHaveLength(0);
        const ecrites = (r.statePatch?.transactions ?? []) as Array<{ payee: string; isDuplicate?: boolean }>;
        const metro = ecrites.find((t) => t.payee === 'Metro');
        expect(metro, 'la transaction rapatriée doit exister dans le store').toBeTruthy();
        expect(metro?.isDuplicate, 'sans ce drapeau EN BASE, le doublon compte dans le budget').toBe(true);
    });

    /**
     * ⚠️ L'invariant d'APPARIEMENT UNIQUE, vérifié sur l'état ÉCRIT et non sur le classement.
     * Deux dédups se contredisaient : la clé `txnKey` d'`applyBankStatement` écartait les entrantes
     * surnuméraires à clé identique — donc les VRAIES dépenses que le classement avait justement
     * protégées. Mesuré avant correctif : 3 cafés → 1 seul écrit.
     */
    it('trois dépenses identiques face à UNE existante : deux sont de vraies dépenses', async () => {
        const cafes = [1, 2, 3].map((i) => txBrut({ id: `tx_${i}`, date: '2025-09-15', description: 'Café', amount: '-4.25' }));
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2025-09-15', payee: 'Café', amount: -4.25 }] as never }),
            'jeton', { client: fakeClient([account()], cafes), now, backfill: true },
        );
        const ecrites = (r.statePatch?.transactions ?? []) as Array<{ payee: string; isDuplicate?: boolean }>;
        const tousCafes = ecrites.filter((t) => t.payee === 'Café');
        expect(tousCafes, 'l\'existante + les 3 rapatriées').toHaveLength(4);
        // Une seule neutralisée : celle qui double l'existante. Les deux autres sont réelles.
        expect(tousCafes.filter((t) => t.isDuplicate === true)).toHaveLength(1);
    });

    it('un cas DOUTEUX est remonté à Marc, jamais tranché seul', async () => {
        const client = fakeClient([account()], [txBrut({ date: '2025-09-16', description: 'Hydro-Québec', amount: '-180.00' })]);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, transactions: [{ id: 1, date: '2025-09-15', payee: 'PAIEMENT CAISSE', amount: -180 }] as never }),
            'jeton', { client, now, backfill: true },
        );
        expect(r.incertaines).toHaveLength(1);
        expect(r.incertaines[0].existante.payee).toBe('PAIEMENT CAISSE');
    });
});

/**
 * [FINTABLE-SOURCE-TAG] Le CHAÎNON entre la règle (`lastProductiveAtSuivant`, testée chez
 * syncHealth) et les rapports RÉELS : un trou entre deux moitiés testées n'appartient à personne
 * (leçon lot 92) — ici on vérifie que le constructeur de rapport du navigateur consomme bien la
 * règle, dans les trois issues d'une passe (productive, à vide, en échec).
 */
describe('runFintableBrowserSync — lastProductiveAt (fraîcheur du connecteur)', () => {
    const PREV = Date.parse('2026-07-20T12:00:00Z');
    const prevReport = (): NonNullable<AppState['fintableSyncReport']> => ({
        at: PREV, cutoverDateUsed: null, accountsSeen: 1, accountsWithoutRole: 0,
        transactionsAdded: 2, transfersDetected: 0, cashUpdated: true, debtsUpdated: [],
        investmentReferenceCount: 0, warnings: [], error: null, lastProductiveAt: PREV,
    });
    const roles = { acc_1: { kind: 'cash' } as FintableAccountRoleConfig };

    it('passe PRODUCTIVE → horodatée maintenant (le connecteur vient de prouver qu\'il produit)', async () => {
        const client = fakeClient([account()], [{
            id: 'ft_1', account_id: 'acc_1', date: '2026-07-30', amount: '-19.99',
            currency: 'CAD', description: 'ABONNEMENT FINTABLE', merchant: null, category: null,
        }]);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, fintableSyncReport: prevReport() }), 'jeton', { client, now });
        expect(r.report.error).toBeNull();
        expect(r.report.transactionsAdded).toBe(1);   // non-vacuité : la passe a bien écrit
        expect(r.report.lastProductiveAt).toBe(NOW);
    });

    it('passe à VIDE (0 ajout) → l\'horodatage PRÉCÉDENT est reporté, jamais rajeuni ni perdu', async () => {
        const client = fakeClient([account()], []);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles, fintableSyncReport: prevReport() }), 'jeton', { client, now });
        expect(r.report.error).toBeNull();
        expect(r.report.transactionsAdded).toBe(0);
        expect(r.report.lastProductiveAt).toBe(PREV); // rajeuni = le gel redeviendrait invisible
    });

    it('passe en ÉCHEC (jeton absent) → reporté aussi : un échec ne « dé-produit » pas', async () => {
        const r = await runFintableBrowserSync(
            stateWith({ fintableSyncReport: prevReport() }), '  ', { now });
        expect(r.report.error).toMatch(/[Jj]eton/);
        expect(r.report.lastProductiveAt).toBe(PREV);
    });

    it('aucun rapport précédent + passe à vide → champ ABSENT (jamais un horodatage inventé)', async () => {
        const client = fakeClient([account()], []);
        const r = await runFintableBrowserSync(
            stateWith({ fintableRoles: roles }), 'jeton', { client, now });
        expect(r.report.error).toBeNull();
        expect(r.report.lastProductiveAt).toBeUndefined();
    });
});
