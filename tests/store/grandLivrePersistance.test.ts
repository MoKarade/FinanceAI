// tests/store/grandLivrePersistance.test.ts
//
// [PTF-L1A] Le grand livre courtier (`brokerLedger`) et le référentiel d'instruments (`instruments`)
// sont DÉCLARÉS dans l'état persisté, SANS rien y écrire. Ce lot existe pour qu'aucun appareil —
// téléphone, PC, serveur MCP — ne redémarre VIDE le jour où un grand livre réel sera importé
// (incident 2026-09-01 : une seule clé textuelle inconnue de la garde de réhydratation vidait l'app).
//
// Ce que ces tests tiennent, et pourquoi chacun :
//   1. TRI-ÉTAT : `undefined` = jamais importé, `[]` = importé et vide. Aucun défaut ne pose `[]`
//      (ni store, ni MCP, ni restauration) — sinon « jamais importé » deviendrait « vide ».
//   2. La clé est PRÉSENTE à `undefined` dans les défauts (purge persona : un spread sans la clé ne
//      la remettrait pas à zéro), mais ABSENTE du blob sérialisé (JSON l'omet).
//   3. Un blob portant un grand livre complet (les onze sortes d'événements) se RÉHYDRATE, et une
//      chaîne dans un champ numérique est REFUSÉE (jamais convertie).
//   4. Démo persona : le vrai grand livre ne la traverse pas, et revient à la sortie.
//   5. Un appareil qui ne porte QUE le grand livre n'est pas « vide » (sinon Drive l'écraserait).
//   6. Sauvegarde JSON : le livre fait l'aller-retour, et un backup SANS livre restaure « jamais importé ».
// ⚠️ Toutes les données sont SYNTHÉTIQUES (ISIN au préfixe non attribué `ZZ`, symboles génériques).
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../services/errorLogger', async (orig) => ({
    ...(await orig() as object),
    logError: vi.fn(),
}));

import type { BrokerAccountRegime, BrokerInstrument, BrokerLedgerEvent } from '../../types';
import { useFinanceStore, getHydrationStatus, personaResetBase } from '../../store/useFinanceStore';
import { initialState, getInitialStateWithMigration } from '../../store/etatParDefaut';
import { extrairePersistable } from '../../store/optionsPersistance';
import { verifierTypesRestaures } from '../../services/verifierTypesRestaures';
import { hasMeaningfulData } from '../../utils/onboarding';
import { buildDefaultAppState, normalizeAppState } from '../../mcp/state/appStateDefaults';
import { sanitizePersonaArtifacts } from '../../services/personaSanitizer';
import { BackupSchema } from '../../components/settings/BackupPanel';

const STORE_KEY = 'financeai-storage';
const source = { kind: 'releve-courtier', date: '2026-01-31' } as const;

/** Les quinze sortes d'événements, une fois chacune — synthétiques. Les quatre dernières (2026-09-24)
 *  portent les trois clés textuelles neuves `cancelsId`, `toIsin`, `toAccountId` : sans elles dans
 *  `CHAMPS_TEXTE`, la réhydratation ci-dessous REFUSERAIT l'état et viderait l'app. */
const LIVRE: BrokerLedgerEvent[] = [
    { id: 'e1', date: '2026-01-10', accountId: 'courtier-cad', kind: 'acquisition', source, isin: 'ZZ0000000001', quantity: 10 },
    { id: 'e2', date: '2026-01-11', accountId: 'courtier-usd', kind: 'transfert-entrant', source, isin: 'ZZ0000000002', quantity: 5, price: { value: 12.5, currency: 'USD' } },
    { id: 'e3', date: '2026-01-12', accountId: 'hors-courtier', kind: 'transfert-sortant', source, isin: 'ZZ0000000002', quantity: 1 },
    { id: 'e4', date: '2026-01-13', accountId: 'courtier-usd', kind: 'achat', source, isin: 'ZZ0000000003', quantity: 2, price: { value: 40, currency: 'USD' }, amount: { value: 89.95, currency: 'USD' } },
    { id: 'e5', date: '2026-01-14', accountId: 'courtier-usd', kind: 'vente', source, isin: 'ZZ0000000003', quantity: 1, price: { value: 41, currency: 'USD' }, amount: { value: 31.05, currency: 'USD' } },
    { id: 'e6', date: '2026-01-15', accountId: 'courtier-cad', kind: 'fractionnement', source, isin: 'ZZ0000000001', splitFrom: 1, splitTo: 10 },
    { id: 'e7', date: '2026-01-16', accountId: 'courtier-usd', kind: 'dividende', source, isin: 'ZZ0000000003', amount: { value: 1.2, currency: 'USD' } },
    { id: 'e8', date: '2026-01-16', accountId: 'courtier-usd', kind: 'retenue-etrangere', source, isin: 'ZZ0000000003', amount: { value: 0.18, currency: 'USD' } },
    { id: 'e9', date: '2026-01-17', accountId: 'courtier-cad', kind: 'depot-especes', source, amount: { value: 250, currency: 'CAD' } },
    { id: 'e10', date: '2026-01-18', accountId: 'courtier-cad', kind: 'retrait-especes', source, amount: { value: 50, currency: 'CAD' } },
    { id: 'e11', date: '2026-01-19', accountId: 'courtier-cad', kind: 'frais', source: { kind: 'saisie-manuelle', date: '2026-01-19' }, amount: { value: 3.5, currency: 'CAD' } },
    { id: 'e12', date: '2026-01-20', accountId: 'courtier-cad', kind: 'annulation', source, cancelsId: 'e11' },
    { id: 'e13', date: '2026-01-21', accountId: 'courtier-cad', kind: 'echange', source, isin: 'ZZ0000000001', toIsin: 'ZZ0000000004', splitFrom: 2, splitTo: 1 },
    { id: 'e14', date: '2026-01-22', accountId: 'courtier-usd', kind: 'conversion', source, toAccountId: 'courtier-cad', amount: { value: 10, currency: 'USD' }, toAmount: { value: 13.72, currency: 'CAD' }, rate: 1.372 },
    { id: 'e15', date: '2026-01-23', accountId: 'courtier-cad', kind: 'virement-interne', source, toAccountId: 'hors-courtier', amount: { value: 5, currency: 'CAD' } },
    { id: 'e16', date: '2026-01-24', accountId: 'courtier-usd', kind: 'transfert-entrant', source, isin: 'ZZ0000000003', quantity: 2, cost: { value: 81.4, currency: 'USD' } },
];
const INSTRUMENTS: BrokerInstrument[] = [
    { isin: 'ZZ0000000001', symbol: 'AAA.TO', exchange: 'XTSE', currency: 'CAD', name: 'Titre A' },
    { isin: 'ZZ0000000003', symbol: 'CCC', exchange: 'XNAS', currency: 'USD', controlSymbol: 'CCC.MX', name: 'Titre C' },
];

afterEach(() => {
    localStorage.removeItem(STORE_KEY);
    if (useFinanceStore.getState().isTestMode) useFinanceStore.getState().disableTestMode();
    useFinanceStore.setState({ brokerLedger: undefined, instruments: undefined });
});

describe('[PTF-L1A] tri-état : `undefined` = jamais importé, jamais `[]` par défaut', () => {
    it('défauts du store : clé PRÉSENTE (purge persona) et valeur `undefined`', () => {
        for (const cle of ['brokerLedger', 'instruments'] as const) {
            expect(Object.hasOwn(initialState, cle), `${cle} doit être une clé du littéral (PERSONA-PURGE)`).toBe(true);
            expect(initialState[cle]).toBeUndefined();
            expect(Object.hasOwn(personaResetBase(), cle)).toBe(true);
            expect(personaResetBase()[cle]).toBeUndefined();
        }
    });

    it('défauts du MCP : même contrat, et rien ne se MATÉRIALISE au JSON', () => {
        const defauts = buildDefaultAppState();
        expect(Object.hasOwn(defauts, 'brokerLedger')).toBe(true);
        expect(defauts.brokerLedger).toBeUndefined();
        expect(defauts.instruments).toBeUndefined();
        const ecrit = JSON.parse(JSON.stringify(normalizeAppState({})));
        expect(Object.hasOwn(ecrit, 'brokerLedger'), 'un `[]` ici serait écrit dans Drive au premier outil').toBe(false);
        expect(Object.hasOwn(ecrit, 'instruments')).toBe(false);
        // Contrôle positif : un état qui PORTE le livre le garde tel quel.
        expect(JSON.parse(JSON.stringify(normalizeAppState({ brokerLedger: LIVRE }))).brokerLedger).toEqual(LIVRE);
    });

    it('blob sérialisé : clé ABSENTE quand jamais importé, PRÉSENTE (et `[]` distinct) sinon', () => {
        const vide = JSON.parse(JSON.stringify(extrairePersistable(useFinanceStore.getState())));
        expect(Object.hasOwn(vide, 'brokerLedger')).toBe(false);
        useFinanceStore.setState({ brokerLedger: [], instruments: INSTRUMENTS });
        const importe = JSON.parse(JSON.stringify(extrairePersistable(useFinanceStore.getState())));
        expect(importe.brokerLedger, '« importé et vide » doit survivre à la sérialisation').toEqual([]);
        expect(importe.instruments).toEqual(INSTRUMENTS);
    });
});

describe('[PTF-L1A] réhydratation : un grand livre réel ne vide pas l\'app', () => {
    it('la garde de types accepte les quinze sortes d\'événements (et le coût total) et un référentiel complet', () => {
        expect(verifierTypesRestaures({ brokerLedger: LIVRE, instruments: INSTRUMENTS })).toEqual([]);
    });

    it('bout en bout : un blob v7 portant le livre se réhydrate, contenu intact', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { brokerLedger: LIVRE, instruments: INSTRUMENTS }, version: 7 }));
        await useFinanceStore.persist.rehydrate();
        expect(getHydrationStatus().failed).toBe(false);
        expect(useFinanceStore.getState().brokerLedger).toEqual(LIVRE);
        expect(useFinanceStore.getState().instruments).toEqual(INSTRUMENTS);
    });

    // [PTF-L1A-RESTAURATION-TRI-ETAT] zustand fusionne le blob avec l'état VIVANT : « Restaurer depuis
    // Drive » avec un blob sans la clé gardait le livre local en silence (mesuré par la revue du lot).
    it('restauration d\'un blob SANS livre sur un appareil qui en a un → « jamais importé », pas l\'ancien', async () => {
        useFinanceStore.setState({ brokerLedger: LIVRE, instruments: INSTRUMENTS });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { assets: [] }, version: 7 }));
        await useFinanceStore.persist.rehydrate();
        expect(getHydrationStatus().failed).toBe(false);
        expect(useFinanceStore.getState().brokerLedger).toBeUndefined();
        expect(useFinanceStore.getState().instruments).toBeUndefined();
    });

    it('restauration d\'un blob au livre VIDE (`[]`) → `[]`, pas l\'ancien ni `undefined`', async () => {
        useFinanceStore.setState({ brokerLedger: LIVRE, instruments: INSTRUMENTS });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { brokerLedger: [], instruments: [] }, version: 7 }));
        await useFinanceStore.persist.rehydrate();
        expect(useFinanceStore.getState().brokerLedger).toEqual([]);
        expect(useFinanceStore.getState().instruments).toEqual([]);
    });

    it.each([
        ['une quantité en texte', { brokerLedger: [{ ...LIVRE[0], quantity: '12.5' }] }],
        ['un ratio de fractionnement en texte', { brokerLedger: [{ ...LIVRE[5], splitTo: '10' }] }],
        ['un montant en texte', { brokerLedger: [{ ...LIVRE[8], amount: { value: '250', currency: 'CAD' } }] }],
    ])('REFUSE %s (jamais converti)', (_nom, etat) => {
        expect(verifierTypesRestaures(etat).length).toBeGreaterThan(0);
    });
});

describe('[PTF-L1A] démo persona : le vrai grand livre ne la traverse pas', () => {
    it('entrée en mode test → livre et référentiel à `undefined` ; sortie → restaurés', () => {
        useFinanceStore.setState({ brokerLedger: LIVRE, instruments: INSTRUMENTS });
        useFinanceStore.getState().enableTestMode({}, 'persona-test');
        expect(useFinanceStore.getState().brokerLedger).toBeUndefined();
        expect(useFinanceStore.getState().instruments).toBeUndefined();
        useFinanceStore.getState().disableTestMode();
        expect(useFinanceStore.getState().brokerLedger).toEqual(LIVRE);
        expect(useFinanceStore.getState().instruments).toEqual(INSTRUMENTS);
    });

    it('le nettoyeur d\'artefacts retire un événement à id de persona, garde le réel, ne crée pas la clé', () => {
        // `persona-tx-…` est un préfixe du registre des artefacts (`services/testPersonas/artifactIds.ts`).
        const { state } = sanitizePersonaArtifacts({ brokerLedger: [LIVRE[0], { ...LIVRE[1], id: 'persona-tx-1' }] });
        expect(state.brokerLedger?.map((e) => e.id)).toEqual(['e1']);
        expect(Object.hasOwn(sanitizePersonaArtifacts({ assets: [] }).state, 'brokerLedger')).toBe(false);
    });
});

describe('[PTF-L1A] « données significatives » : le livre seul suffit à ne pas être vide', () => {
    it('livre seul → non vide ; absent → vide ; `[]` → vide ; référentiel seul → non vide', () => {
        expect(hasMeaningfulData({ brokerLedger: LIVRE })).toBe(true);
        expect(hasMeaningfulData({})).toBe(false);
        expect(hasMeaningfulData({ brokerLedger: [] })).toBe(false);
        expect(hasMeaningfulData({ instruments: INSTRUMENTS })).toBe(true);
    });
});

describe('[PTF-L1A] sauvegarde JSON : aller-retour du schéma', () => {
    it('le schéma de restauration GARDE le livre et le référentiel', () => {
        const r = BackupSchema.safeParse({ version: '3.2', brokerLedger: LIVRE, instruments: INSTRUMENTS });
        expect(r.success).toBe(true);
        if (r.success) {
            expect(r.data.brokerLedger).toEqual(LIVRE);
            expect(r.data.instruments).toEqual(INSTRUMENTS);
        }
    });

    it('un backup SANS livre ne l\'invente pas (`undefined`, jamais `[]`)', () => {
        const r = BackupSchema.safeParse({ version: '3.2' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.brokerLedger).toBeUndefined();
    });
});

describe('[PTF-L1A] restauration d\'un backup JSON : relecture des clés héritées', () => {
    afterEach(() => { localStorage.removeItem('app_broker_ledger'); localStorage.removeItem('app_instruments'); });

    it('les clés écrites par la restauration sont relues ; absentes → `undefined`, jamais `[]`', () => {
        localStorage.removeItem(STORE_KEY);
        localStorage.setItem('app_broker_ledger', JSON.stringify(LIVRE));
        expect(localStorage.getItem(STORE_KEY), 'le chemin hérité n\'est lu que sans blob persist').toBeNull();
        const avec = getInitialStateWithMigration();
        expect(avec.brokerLedger).toEqual(LIVRE);
        expect(avec.instruments, 'aucun référentiel restauré → jamais importé').toBeUndefined();
    });

    it('JSON illisible → absent (journalisé), pas un tableau vide ni une exception', () => {
        localStorage.removeItem(STORE_KEY);
        localStorage.setItem('app_broker_ledger', '{pas-du-json');
        expect(getInitialStateWithMigration().brokerLedger).toBeUndefined();
    });
});

// [PTF-L1E-PASSERELLE] Le régime fiscal de chaque compte du livre (`brokerAccountRegimes`) suit le MÊME
// contrat que le livre : il décide quels placements saisis sortent des calculs, donc un régime hérité
// d'un autre état (appareil, persona, restauration) retirerait des placements sans rien pour les
// remplacer. `regime` est une feuille textuelle neuve : absente de CHAMPS_TEXTE, elle viderait l'app.
describe('[PTF-L1E] régimes des comptes du livre : même contrat tri-état que le livre', () => {
    const REGIMES: BrokerAccountRegime[] = [
        { accountId: 'courtier-cad', regime: 'CELI' },
        { accountId: 'courtier-usd', regime: 'NON-ENREG' },
    ];
    afterEach(() => {
        useFinanceStore.setState({ brokerAccountRegimes: undefined });
        localStorage.removeItem('app_broker_account_regimes');
    });

    it('défauts store, persona et MCP : clé PRÉSENTE à `undefined`, jamais matérialisée au JSON', () => {
        expect(Object.hasOwn(initialState, 'brokerAccountRegimes')).toBe(true);
        expect(initialState.brokerAccountRegimes).toBeUndefined();
        expect(Object.hasOwn(personaResetBase(), 'brokerAccountRegimes')).toBe(true);
        expect(Object.hasOwn(buildDefaultAppState(), 'brokerAccountRegimes')).toBe(true);
        expect(Object.hasOwn(JSON.parse(JSON.stringify(normalizeAppState({}))), 'brokerAccountRegimes')).toBe(false);
    });

    it('la garde de types accepte des régimes réels (la feuille `regime` est déclarée textuelle)', () => {
        expect(verifierTypesRestaures({ brokerLedger: LIVRE, brokerAccountRegimes: REGIMES })).toEqual([]);
    });

    it('bout en bout : un blob portant les régimes se réhydrate intact', async () => {
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { brokerLedger: LIVRE, brokerAccountRegimes: REGIMES }, version: 7 }));
        await useFinanceStore.persist.rehydrate();
        expect(getHydrationStatus().failed).toBe(false);
        expect(useFinanceStore.getState().brokerAccountRegimes).toEqual(REGIMES);
    });

    it('restauration d\'un blob SANS régimes → `undefined`, jamais ceux de l\'état vivant', async () => {
        useFinanceStore.setState({ brokerAccountRegimes: REGIMES });
        localStorage.setItem(STORE_KEY, JSON.stringify({ state: { assets: [] }, version: 7 }));
        await useFinanceStore.persist.rehydrate();
        expect(useFinanceStore.getState().brokerAccountRegimes).toBeUndefined();
    });

    it('démo persona : les régimes réels ne la traversent pas, et reviennent à la sortie', () => {
        useFinanceStore.setState({ brokerAccountRegimes: REGIMES });
        useFinanceStore.getState().enableTestMode({}, 'persona-test');
        expect(useFinanceStore.getState().brokerAccountRegimes).toBeUndefined();
        useFinanceStore.getState().disableTestMode();
        expect(useFinanceStore.getState().brokerAccountRegimes).toEqual(REGIMES);
    });

    it('sauvegarde JSON : le schéma les garde, un backup sans eux ne les invente pas, la relecture les retrouve', () => {
        const r = BackupSchema.safeParse({ version: '3.2', brokerAccountRegimes: REGIMES });
        expect(r.success && r.data.brokerAccountRegimes).toEqual(REGIMES);
        const sans = BackupSchema.safeParse({ version: '3.2' });
        expect(sans.success && sans.data.brokerAccountRegimes).toBeUndefined();
        localStorage.removeItem(STORE_KEY);
        localStorage.setItem('app_broker_account_regimes', JSON.stringify(REGIMES));
        expect(getInitialStateWithMigration().brokerAccountRegimes).toEqual(REGIMES);
    });
});
