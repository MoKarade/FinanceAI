/**
 * @vitest-environment jsdom
 *
 * [FINTABLE-SYNC-XTAB-MUTEX] Le verrou CROSS-ONGLET de la sync Fintable auto.
 *
 * Ce que ce fichier verrouille, et pourquoi chaque cas existe :
 *
 *  (a) **Verrou obtenu** → la passe tourne normalement. Sans ce cas, un verrou qui refuserait
 *      TOUJOURS passerait les deux autres tests : « ça ne tourne pas » est trivialement vrai.
 *      C'est aussi lui qui prouve que l'écriture du cooldown est OBSERVABLE (voir `clesTentative`),
 *      sans quoi le `toHaveLength(0)` du cas (b) mesurerait un sélecteur mort.
 *
 *  (b) **Verrou déjà tenu par un autre onglet** → `{ ran: false, reason: 'in-flight' }`, ET
 *      AUCUNE garde interne n'a tourné : ni écriture du cooldown, ni appel réseau. C'est le cœur du
 *      ticket — la course visée n'est PAS le réseau mais l'intervalle entre la LECTURE et
 *      l'ÉCRITURE du cooldown `localStorage`, qui n'a pas de compare-and-swap. Un verrou posé
 *      seulement autour du fetch laisserait la course exactement là où elle est.
 *
 *  (c) **API absente** (jsdom, navigateur ancien, contexte non sécurisé) → repli EXPLICITE : la
 *      passe tourne comme avant. Un verrou qui bloquerait tout là où l'API manque serait pire que
 *      le défaut qu'il corrige. jsdom n'implémente pas Web Locks — le test l'ASSERTE plutôt que de
 *      le supposer, sinon il ne mesurerait que l'environnement du jour.
 *
 * ⚠️ [FINTABLE-SYNC-XTAB-MANUEL, 2026-08-26] **Correction d'un contrat FAUX, vérifié contre la
 * spec.** Ce fichier affirmait ici que « verrou pris → `null` rendu SANS appeler le rappel ». C'est
 * l'inverse de la spec Web Locks : sous `ifAvailable: true`, le rappel est TOUJOURS invoqué —
 * avec `lock === null` quand le verrou est déjà pris ailleurs, jamais sauté. Le faux `LockManager`
 * ci-dessous appelait donc `cb` uniquement quand `libre`, ce qui ne pouvait PAS révéler un
 * `withCrossTabLock` qui aurait ignoré son paramètre `lock` (exactement le bug généricisé qui a
 * motivé cette correction : `run()` s'exécutait alors même quand le verrou était pris ailleurs,
 * dans TOUT navigateur réel — la mutex ne mutex-ait rien). Le faux reproduit maintenant le VRAI
 * contrat : le rappel est appelé dans les deux cas, avec `{}` (verrou obtenu) ou `null` (occupé).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { maybeRunDailyFintableSync, _resetAutoSyncForTests } from '../../../services/fintable/autoSync';
import { useFinanceStore } from '../../../store/useFinanceStore';
import type { FintableSyncReport } from '../../../types';

const runMock = vi.fn();
vi.mock('../../../services/fintable/browserSync', () => ({
    runFintableBrowserSync: (...a: unknown[]) => runMock(...a),
}));

const mkReport = (over: Partial<FintableSyncReport> = {}): FintableSyncReport => ({
    at: Date.now(), cutoverDateUsed: null, accountsSeen: 1, accountsWithoutRole: 0,
    transactionsAdded: 0, transfersDetected: 0, cashUpdated: false, debtsUpdated: [],
    investmentReferenceCount: 0, warnings: [], error: null,
    ...over,
});

/**
 * Les clés de cooldown présentes dans `localStorage`, repérées par ce qu'elles SIGNIFIENT et non
 * par une copie du littéral du module : recopier la clé ferait passer le test en silence le jour
 * où elle change de nom. Le cas (a) prouve que ce sélecteur trouve bien quelque chose.
 */
function clesTentative(): string[] {
    return Object.keys(localStorage).filter((k) => /lastAutoAttempt/.test(k));
}

type RappelVerrou = (lock: unknown) => Promise<unknown>;

/** Pose un faux `navigator.locks`. `libre: false` = un autre onglet tient déjà le verrou. */
function poserVerrou(libre: boolean) {
    const demandes: Array<{ name: string; options: { ifAvailable?: boolean } }> = [];
    const request = vi.fn(async (name: string, options: { ifAvailable?: boolean }, cb: RappelVerrou) => {
        demandes.push({ name, options });
        // Contrat RÉEL `ifAvailable` (spec Web Locks) : le rappel est TOUJOURS invoqué, avec
        // `null` au lieu d'un `Lock` quand le verrou est déjà pris ailleurs — jamais sauté.
        return cb(libre ? {} : null);
    });
    Object.defineProperty(globalThis.navigator, 'locks', {
        value: { request }, configurable: true, writable: true,
    });
    return { demandes, request };
}

function retirerVerrou() {
    Reflect.deleteProperty(globalThis.navigator as unknown as object, 'locks');
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    _resetAutoSyncForTests();
    useFinanceStore.getState().resetState();
    useFinanceStore.setState({
        apiKeys: { anthropic: '', finnhub: '', fintable: 'ft_test' },
        isTestMode: false,
        fintableSyncReport: undefined,
    });
});

afterEach(() => { retirerVerrou(); });

describe('[FINTABLE-SYNC-XTAB-MUTEX] verrou cross-onglet', () => {
    it('(a) verrou OBTENU : la passe tourne, et le cooldown est bien écrit (le sélecteur voit)', async () => {
        const report = mkReport();
        runMock.mockResolvedValue({ report, statePatch: { fintableSyncReport: report } });
        const { demandes } = poserVerrou(true);

        const out = await maybeRunDailyFintableSync();

        expect(out).toEqual({ ran: true, report });
        expect(runMock).toHaveBeenCalledTimes(1);
        // Anti-vacuité du cas (b) : ici la clé de cooldown EXISTE, donc son absence là-bas est une
        // mesure, pas un sélecteur qui ne matche rien.
        expect(clesTentative()).toHaveLength(1);
        // Le verrou est NOMMÉ (deux apps sur le même origine ne doivent pas se bloquer) et pris
        // SANS attente : un verrou bloquant ferait patienter l'onglet au lieu de renoncer.
        expect(demandes).toHaveLength(1);
        expect(demandes[0]?.name).toBe('financeai:fintable-sync');
        expect(demandes[0]?.options.ifAvailable).toBe(true);
    });

    it('(b) verrou TENU AILLEURS : rend « in-flight » et AUCUNE garde interne ne tourne', async () => {
        runMock.mockResolvedValue({ report: mkReport(), statePatch: {} });
        poserVerrou(false);

        const out = await maybeRunDailyFintableSync();

        expect(out).toEqual({ ran: false, reason: 'in-flight' });
        expect(runMock).not.toHaveBeenCalled();
        // ⚠️ L'assertion qui porte le ticket : le cooldown n'est NI lu NI écrit pendant qu'un autre
        // onglet tient le verrou. C'est cette écriture-là qui était la course.
        expect(clesTentative()).toHaveLength(0);
        // Et rien n'a été écrit dans le store non plus (pas même un rapport d'échec).
        expect(useFinanceStore.getState().fintableSyncReport).toBeUndefined();
    });

    it('(c) API ABSENTE : repli explicite, la passe tourne comme avant', async () => {
        // Le repli n'est un repli que si l'API manque VRAIMENT — jsdom ne l'implémente pas, mais on
        // le mesure plutôt que de le supposer.
        expect((globalThis.navigator as { locks?: unknown }).locks).toBeUndefined();

        const report = mkReport();
        runMock.mockResolvedValue({ report, statePatch: { fintableSyncReport: report } });

        const out = await maybeRunDailyFintableSync();

        expect(out).toEqual({ ran: true, report });
        expect(runMock).toHaveBeenCalledTimes(1);
    });
});
