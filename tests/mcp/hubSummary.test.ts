// tests/mcp/hubSummary.test.ts
//
// [HUB-01] GET /hub/summary — le contrat hub de bout en bout : vrai serveur
// node:http sur port éphémère, auth x-hub-token (401 sinon), Cache-Control:
// no-store, et payload validé par le VRAI schéma de @mokarade/hub-contract.
// L'état est une fixture persona (aucune dépendance Drive/fichier).

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { CONTRACT_VERSION, HUB_TOKEN_HEADER, validateSummary } from '@mokarade/hub-contract';
import { startHttpServer, type RunningHttpServer } from '../../mcp/http';
import type { ResolvedState } from '../../mcp/bootstrap';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateStore } from '../../mcp/state/stateStore';
import { setStateFreshness, STALE_THRESHOLD_MS } from '../../mcp/state/freshness';
import {
    AGE_MAX_ATTENDU_SEC,
    buildHubSummary,
    errorHubSummary,
    HUB_APP,
    recommandation,
} from '../../mcp/hubSummary';
import { computeFinancialSignals } from '../../mcp/financialSignals';
import { MAX_STALE_DAYS } from '../../services/history/portfolioSessionMetrics';
import { TEST_PERSONAS } from '../../services/testPersonas';

const HUB_TOKEN = 'jeton-de-test-hub-0123456789';

function personaState() {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
}

function fixtureState(): ResolvedState {
    const state = personaState();
    const source: StateSource = { description: 'fixture hub', loadRaw: async () => JSON.stringify(state) };
    const store = makeStateStore(source);
    return { source, store, isDrive: false, driveEmail: null, describe: () => 'fixture hub' };
}

/** Fixture dont la lecture d'état ÉCHOUE (source cassée) — cas « error » honnête. */
function brokenState(): ResolvedState {
    const source: StateSource = {
        description: 'fixture cassée',
        loadRaw: async () => { throw new Error('source injoignable (test)'); },
    };
    const store = makeStateStore(source);
    return { source, store, isDrive: false, driveEmail: null, describe: () => 'fixture cassée' };
}

// Le registre de fraîcheur est module-level : on le remet à zéro après chaque test.
afterEach(() => setStateFreshness({ updatedAt: null, source: null }));

describe('buildHubSummary (unitaire)', () => {
    it('produit un summary conforme au contrat avec les vraies données de la fixture', () => {
        const summary = buildHubSummary(personaState());
        expect(() => validateSummary(summary)).not.toThrow();
        expect(summary.contractVersion).toBe(CONTRACT_VERSION);
        expect(summary.app).toEqual(HUB_APP);
        expect(summary.status).toBe('ok');
        expect(summary.metrics.length).toBeGreaterThan(0);
        expect(summary.metrics.length).toBeLessThanOrEqual(6);
        expect(summary.metrics.map((m) => m.label)).toContain('Valeur nette');
        expect(summary.actions).toHaveLength(1);
        expect(summary.actions[0]?.kind).toBe('link');
    });

    it('publie usage.cost (coût cumulé du chat IA, USD) depuis l’AppState', () => {
        const summary = buildHubSummary({ ...personaState(), aiChatCostUsdTotal: 1.234 });
        expect(summary.usage?.cost).toEqual({ amount: 1.23, currency: 'USD', period: 'total' });
    });

    it('coût absent/0 → usage.cost à 0 (l’app suit vraiment, jamais un chiffre inventé)', () => {
        const summary = buildHubSummary({ ...personaState(), aiChatCostUsdTotal: undefined });
        expect(summary.usage?.cost?.amount).toBe(0);
    });

    it('passe en degraded avec dataAsOf et une alerte quand l’état date de plus de 6 h', () => {
        const now = Date.now();
        setStateFreshness({ updatedAt: now - STALE_THRESHOLD_MS - 60_000, source: 'test' });
        const summary = buildHubSummary(personaState(), now);
        expect(() => validateSummary(summary)).not.toThrow();
        expect(summary.status).toBe('degraded');
        expect(summary.dataAsOf).toBeDefined();
        expect(summary.alerts[0]?.severity).toBe('warn');
        expect(summary.alerts[0]?.label).toContain('périmées');
    });

    it('reste ok avec dataAsOf quand l’état est frais', () => {
        const now = Date.now();
        setStateFreshness({ updatedAt: now - 60_000, source: 'test' });
        const summary = buildHubSummary(personaState(), now);
        expect(summary.status).toBe('ok');
        expect(summary.dataAsOf).toBe(new Date(now - 60_000).toISOString());
    });

    it('errorHubSummary est conforme au contrat et honnête (metrics vides, alerte)', () => {
        const summary = errorHubSummary('panne de test');
        expect(() => validateSummary(summary)).not.toThrow();
        expect(summary.status).toBe('error');
        expect(summary.metrics).toEqual([]);
        expect(summary.alerts[0]?.severity).toBe('alert');
        expect(summary.alerts[0]?.label).toContain('panne de test');
    });
});

describe('GET /hub/summary (HTTP, jeton configuré)', () => {
    let running: RunningHttpServer;
    let base: string;

    beforeAll(async () => {
        running = await startHttpServer({ port: 0, host: '127.0.0.1', state: fixtureState(), hubToken: HUB_TOKEN });
        base = `http://127.0.0.1:${running.port}`;
    });
    afterAll(async () => {
        await running.close();
    });

    it('401 sans header x-hub-token', async () => {
        const res = await fetch(`${base}/hub/summary`);
        expect(res.status).toBe(401);
    });

    it('401 avec un jeton invalide', async () => {
        const res = await fetch(`${base}/hub/summary`, { headers: { [HUB_TOKEN_HEADER]: 'mauvais-jeton' } });
        expect(res.status).toBe(401);
    });

    it('405 sur POST même avec le bon jeton', async () => {
        const res = await fetch(`${base}/hub/summary`, {
            method: 'POST',
            headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN },
        });
        expect(res.status).toBe(405);
    });

    it('200 + summary valide + Cache-Control: no-store avec le bon jeton', async () => {
        const res = await fetch(`${base}/hub/summary`, { headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN } });
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toBe('no-store');
        const summary = validateSummary(await res.json());
        expect(summary.status).toBe('ok');
        expect(summary.app.id).toBe('financeai');
    });

    it('la route est listée dans le 404 des endpoints connus', async () => {
        const res = await fetch(`${base}/nexiste-pas`);
        expect(res.status).toBe(404);
        const body = await res.json() as { endpoints: string[] };
        expect(body.endpoints).toContain('/hub/summary');
    });
});

describe('GET /hub/summary (HTTP, cas limites)', () => {
    it('404 quand aucun jeton hub n’est configuré (route désactivée)', async () => {
        const running = await startHttpServer({ port: 0, host: '127.0.0.1', state: fixtureState() });
        try {
            const res = await fetch(`http://127.0.0.1:${running.port}/hub/summary`, {
                headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN },
            });
            expect(res.status).toBe(404);
        } finally {
            await running.close();
        }
    });

    it('état illisible → 200 avec summary status "error" (jamais un 500 muet)', async () => {
        const running = await startHttpServer({ port: 0, host: '127.0.0.1', state: brokenState(), hubToken: HUB_TOKEN });
        try {
            const res = await fetch(`http://127.0.0.1:${running.port}/hub/summary`, {
                headers: { [HUB_TOKEN_HEADER]: HUB_TOKEN },
            });
            expect(res.status).toBe(200);
            const summary = validateSummary(await res.json());
            expect(summary.status).toBe('error');
            expect(summary.metrics).toEqual([]);
        } finally {
            await running.close();
        }
    });
});

describe('[HUB-PLACEMENTS-SEANCE] variation des placements sur la carte', () => {
    // Demande Marc 2026-08-19 : rendement du jour, variation $ du jour, variation de la semaine.
    // Ce qui se joue ici n'est pas le calcul (couvert par `portfolioSessionMetrics.test.ts`) mais
    // la CARTE : ordre des métriques, plafond de 6, libellés, et surtout ce qui se passe quand la
    // donnée refuse — le hub n'affiche QUE ce qu'il reçoit, donc omettre EST la métrique.

    const MAINTENANT = Date.parse('2026-08-19T18:00:00Z');

    /** Titre CAD à 1 unité : la valeur du portefeuille vaut le prix — les montants se lisent à l'œil. */
    const titre = (jours: number, dernierJour: number) => ({
        symbol: 'XEQT.TO', quantity: 1, currency: 'CAD' as const, currentPrice: 100 + jours - 1,
        name: 'XEQT', performance: 0, dateBought: '2026-08-01',
        purchases: [{ date: '2026-08-01', quantity: 1, price: 100 }],
        priceHistory: Array.from({ length: jours }, (_, i) => ({
            date: `2026-08-${String(dernierJour - jours + 1 + i).padStart(2, '0')}`,
            price: 100 + i,
        })),
        accountType: 'NON-ENREG' as const,
    });

    const avecPlacements = (jours: number, dernierJour: number) => ({
        ...personaState(),
        assets: [titre(jours, dernierJour)],
        fxRates: { USD: 1.35, EUR: 1.45 },
    });

    // ⚠️⚠️ TEST DE LIMITE INVERSÉ le 2026-09-17 (`[HUB-METRIQUE-LIBELLE-EST-UNE-CLE]` +
    // `[HUB-SPARKLINE-VARIATION-DE-VARIATION]`), pas supprimé — son histoire est ce qui empêche de
    // re-faire le chemin inverse « pour que la carte en montre plus ».
    // Il affirmait « publie 6 métriques » dont `Placements (séance du 18 août)`, `Variation de la
    // séance` et `Variation 7 jours`, et son commentaire disait « le libellé porte la DATE » comme
    // une qualité. Mesuré en LISANT le hub (dépôt Hubperso) : le libellé est la CLÉ de l'historique
    // (`serieMetrique(historique, metrique.label)`), et le hub dérive l'évolution 7 j de la VALEUR
    // de chaque métrique. Donc un libellé daté remet la série à zéro chaque séance (« pas encore
    // d'historique » à perpétuité), et une métrique qui EST une variation se fait re-dériver
    // (« −430,6 % sur 7 j » chez Marc). Les deux faits sont morts, la limite reste écrite ici.
    it('publie 4 métriques à libellé STABLE — les variations ont quitté la carte', () => {
        const s = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        expect(s.metrics).toHaveLength(4);

        // L'ordre est un arbitrage : le hub rend la PREMIÈRE en gros (à défaut de `primary`).
        expect(s.metrics.map((m) => m.label)).toEqual([
            'Valeur nette',
            'Cashflow mensuel',
            'Liquidités',
            'Placements',
        ]);

        // Les trois sortantes du lot [HUB-PLACEMENTS-SEANCE] ne REVIENNENT pas : deux places se
        // sont libérées, ce n'est pas une invitation à recomposer la carte.
        for (const parti of ['Investissements', 'Dette totale', 'Espace CELI dispo']) {
            expect(s.metrics.some((m) => m.label === parti), `${parti} aurait dû sortir`).toBe(false);
        }

        // Montants et tendances : 113 au dernier close, +1 $ sur la séance.
        const parLabel = Object.fromEntries(s.metrics.map((m) => [m.label, m]));
        expect(parLabel['Placements'].value).toBe(113);
        expect(parLabel['Valeur nette'].trend).toBeCloseTo((1 / 112) * 100, 2);
        expect(parLabel['Placements'].trend).toBeCloseTo((1 / 112) * 100, 2);

        // Tout doit rester conforme au contrat — c'est le hub qui valide, on ne triche pas.
        expect(() => validateSummary(s as never)).not.toThrow();
    });

    it('[HUB-METRIQUE-LIBELLE-EST-UNE-CLE] deux séances DIFFÉRENTES, les mêmes libellés', () => {
        // LA garde du lot, et elle porte le FAIT (« un libellé de métrique ne dépend pas de la
        // donnée »), pas la forme du libellé : sa perturbation est exactement de remettre la date
        // dedans. Deux états qui ne diffèrent QUE par la date de clôture.
        const a = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        const b = buildHubSummary(avecPlacements(14, 17) as never, MAINTENANT);

        // Anti-vacuité : les deux builds publient bien des placements, et à des DATES distinctes —
        // sinon « mêmes libellés » serait vrai de deux cartes vides.
        expect(a.metrics.some((m) => m.label === 'Placements')).toBe(true);
        expect(b.metrics.some((m) => m.label === 'Placements')).toBe(true);
        const dateDe = (s: ReturnType<typeof buildHubSummary>) =>
            s.details?.find((d) => d.title === 'Fraîcheur des deux sources')
                ?.items.find((i) => i.label === 'Clôture de référence')?.value;
        expect(dateDe(a)).toBe('séance du 18 août');
        expect(dateDe(b)).toBe('séance du 17 août');
        expect(dateDe(a)).not.toBe(dateDe(b));

        expect(a.metrics.map((m) => m.label)).toEqual(b.metrics.map((m) => m.label));
    });

    it('[HUB-SPARKLINE-VARIATION-DE-VARIATION] les variations vivent dans `details`, jamais en métrique', () => {
        const s = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);

        // Le hub ne dérive AUCUNE évolution d'une ligne de `details` : c'est ce qui rend l'endroit
        // sûr pour une grandeur qui est déjà une variation.
        expect(s.metrics.some((m) => /^Variation/.test(m.label))).toBe(false);

        const section = s.details?.find((d) => d.title === 'Variation des placements');
        expect(section, 'la section de variation doit exister quand la séance est publiable').toBeTruthy();
        const parLabel = Object.fromEntries((section?.items ?? []).map((i) => [i.label, i]));
        expect(parLabel['Variation de la séance'].value).toBe(1);
        expect(parLabel['Variation de la séance'].trend).toBeCloseTo((1 / 112) * 100, 2);
        expect(parLabel['Variation 7 jours'].value).toBe(7);
        // La DATE de la séance n'est pas perdue en quittant le libellé de la métrique : elle
        // qualifie la ligne par son `hint`, le champ prévu pour ça.
        expect(parLabel['Variation de la séance'].hint).toContain('séance du 18 août');

        expect(() => validateSummary(s as never)).not.toThrow();
    });

    it('donnée PÉRIMÉE : la carte publie MOINS, pas autre chose', () => {
        // Dernier close le 8 août, soit 11 jours avant : aucune des trois métriques n'est publiable.
        const s = buildHubSummary(avecPlacements(5, 8) as never, MAINTENANT);
        expect(s.metrics.map((m) => m.label)).toEqual(['Valeur nette', 'Cashflow mensuel', 'Liquidités']);

        // ⚠️ Le point le plus important du lot : AUCUN zéro n'est fabriqué. Un « 0 $ / 0 % » se
        // lirait « journée stable » alors qu'on ne sait simplement pas.
        expect(s.metrics.some((m) => /placement|variation/i.test(m.label))).toBe(false);
        expect(s.metrics[0].trend).toBeUndefined();
        // Et la section de détail des variations n'apparaît pas non plus — le silence est le même
        // des deux côtés, sinon la carte dirait « rien » pendant que le détail dirait « 0 $ ».
        expect(s.details?.some((d) => d.title === 'Variation des placements') ?? false).toBe(false);

        // Et les trois sortantes ne REVIENNENT pas : une carte dont la composition change selon la
        // fraîcheur des cours serait illisible.
        expect(s.metrics.some((m) => m.label === 'Dette totale')).toBe(false);
        expect(() => validateSummary(s as never)).not.toThrow();
    });

    it('semaine incalculable : la séance seule est publiée (refus indépendants)', () => {
        const s = buildHubSummary(avecPlacements(2, 18) as never, MAINTENANT);
        expect(s.metrics.map((m) => m.label)).toEqual([
            'Valeur nette', 'Cashflow mensuel', 'Liquidités', 'Placements',
        ]);
        // Les deux refus restent INDÉPENDANTS — ça se lit maintenant dans `details` : la séance y
        // figure, la semaine non.
        const section = s.details?.find((d) => d.title === 'Variation des placements');
        expect(section?.items.map((i) => i.label)).toEqual(['Variation de la séance']);
    });

    it('dataAsOf reflète la donnée la plus ANCIENNE, pas l\'instant du build', () => {
        // Le push Drive est TRÈS récent, la clôture date du 18. Servir l'horodatage du push
        // surestimerait la fraîcheur de ce qui est à l'écran.
        setStateFreshness({ updatedAt: MAINTENANT - 60_000, source: 'test' });
        const s = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        expect(s.dataAsOf).toBe(new Date(Date.parse('2026-08-18T23:59:59Z')).toISOString());

        // Symétrique : quand c'est le PUSH qui est le plus vieux, c'est lui qui gouverne.
        setStateFreshness({ updatedAt: Date.parse('2026-08-17T09:00:00Z'), source: 'test' });
        const s2 = buildHubSummary(avecPlacements(14, 18) as never, MAINTENANT);
        expect(s2.dataAsOf).toBe(new Date(Date.parse('2026-08-17T09:00:00Z')).toISOString());
    });
});

/* ---------- Contrat v1.3 : `primary`, `recommendation`, `details`, et le filet de fond ---------- */

describe('contrat v1.3 — le chiffre de la carte et la recommandation', () => {
    it('`primary` désigne la valeur nette, et une seule métrique le porte', () => {
        // Le contrat refuse deux titres de carte. Jusqu'ici le hub déduisait le gros chiffre de la
        // position 0 — ce qui marchait tant que personne ne réordonnait la liste, alors que cet
        // ordre est un arbitrage qui a DÉJÀ changé une fois (les placements ont pris trois places).
        const s = buildHubSummary(personaState());
        const titres = s.metrics.filter((m) => m.primary);
        expect(titres.map((m) => m.label)).toEqual(['Valeur nette']);
        expect(() => validateSummary(s)).not.toThrow();
    });

    it('`recommendation` vient du signal le plus prioritaire, et dit une ACTION', () => {
        const { signals } = computeFinancialSignals(personaState());
        const s = buildHubSummary(personaState());
        if (signals.length === 0) {
            expect(s.recommendation).toBeUndefined();
            return;
        }
        expect(s.recommendation).toBeDefined();
        // Le `label` porte l'action, le `why` le constat : ce ne sont pas la même phrase. Recopier
        // l'observation dans `label` produirait une « recommandation » qui ne recommande rien.
        expect(s.recommendation!.label).not.toBe(signals[0]!.observation);
        expect(s.recommendation!.why).toBe(
            signals[0]!.observation.length <= 140
                ? signals[0]!.observation
                : s.recommendation!.why,
        );
        expect(s.recommendation!.label.length).toBeLessThanOrEqual(80);
        expect(s.recommendation!.why!.length).toBeLessThanOrEqual(140);
    });

    it('aucun signal → aucune recommandation (jamais un conseil inventé)', () => {
        expect(recommandation([])).toBeUndefined();
    });

    it("une observation trop longue est tronquée, jamais rejetée par le contrat", () => {
        const reco = recommandation([
            { id: 'inconnu_du_repli', priority: 'high', observation: 'O'.repeat(400) },
        ]);
        // Identifiant hors table : le repli publie l'observation tronquée plutôt que RIEN — c'est
        // le test suivant qui empêche ce repli d'être le chemin normal.
        expect(reco!.label.length).toBe(80);
        expect(reco!.why!.length).toBe(140);
        expect(reco!.label.endsWith('…')).toBe(true);
    });

    it('🔴 CHAQUE signal RÉEL du moteur a son action — un signal neuf ne tombe pas dans le repli', async () => {
        // Deux sources, un test pour les tenir ensemble : on ANALYSE le fichier source des signaux
        // plutôt que de faire confiance à la vigilance. Un `signals.push({ id: 'x' })` ajouté sans
        // action publierait une observation comme « recommandation » — un constat déguisé en conseil.
        // `import.meta.url` n'est pas un `file:` sous ce runner (Vitest sert les modules par
        // HTTP) : on résout depuis la racine du projet, que Vitest fixe comme cwd.
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const src = readFileSync(resolve(process.cwd(), 'mcp/financialSignals.ts'), 'utf8');
        const ids = [...src.matchAll(/signals\.push\(\{\s*[\s\S]{0,80}?id:\s*'([a-z0-9_]+)'/g)].map((m) => m[1]!);
        // Un test d'exhaustivité qui ne trouve rien n'affirme rien : la borne basse garde le motif.
        expect(ids.length).toBeGreaterThanOrEqual(5);
        for (const id of ids) {
            expect(recommandation([{ id, priority: 'high', observation: 'constat' }])!.label)
                .not.toBe('constat');
        }
    });
});

describe('contrat v1.3 — le filet de fond, et pourquoi il est LÂCHE', () => {
    it('`expectedMaxAgeSec` est DÉRIVÉ de MAX_STALE_DAYS, jamais choisi', () => {
        setStateFreshness({ updatedAt: Date.now(), source: 'test' });
        const s = buildHubSummary(personaState());
        expect(s.expectedMaxAgeSec).toBe(AGE_MAX_ATTENDU_SEC);
        expect(AGE_MAX_ATTENDU_SEC).toBe((MAX_STALE_DAYS + 1) * 86_400);
    });

    it("un seuil de 6 h aurait crié « figée » chaque fin de semaine — celui-ci ne le fait pas", () => {
        // ⚠️ LE CŒUR DE LA DÉCISION. `dataAsOf` est le plus ANCIEN du push Drive et de la CLÔTURE
        // de marché. Un seuil calé sur `STALE_THRESHOLD_MS` (6 h, le vrai contrôle quotidien)
        // serait donc FAUX : le lundi matin, la dernière clôture a deux jours et demi et la bourse
        // était simplement fermée. Le filet doit couvrir ce trou NORMAL.
        const troisJoursEtDemi = 3.5 * 86_400;
        expect(AGE_MAX_ATTENDU_SEC).toBeGreaterThan(troisJoursEtDemi);
        expect(AGE_MAX_ATTENDU_SEC).toBeGreaterThan(STALE_THRESHOLD_MS / 1000);
    });

    it('aucun dataAsOf → aucun expectedMaxAgeSec (le contrat rejette un âge orphelin)', () => {
        setStateFreshness({ updatedAt: null, source: null });
        const s = buildHubSummary(normalizeAppState({ ...personaState(), assets: [] }));
        if (s.dataAsOf === undefined) expect(s.expectedMaxAgeSec).toBeUndefined();
        expect(() => validateSummary(s)).not.toThrow();
    });
});

describe('contrat v1.3 — les sections de détail', () => {
    it('la fraîcheur est DÉCOMPOSÉE : le push Drive et la clôture, séparément', () => {
        // Un seul horodatage ne peut pas dire LAQUELLE des deux horloges est en retard, et c'est
        // pourtant la première question quand un chiffre surprend.
        setStateFreshness({ updatedAt: Date.now() - 90 * 60_000, source: 'Drive' });
        const s = buildHubSummary(personaState());
        const section = s.details?.find((d) => d.title === 'Fraîcheur des deux sources');
        const synchro = section?.items.find((i) => i.label === 'Dernière synchro');
        expect(synchro?.value).toBe('il y a 2 h');
        expect(synchro?.severity).toBeUndefined();
    });

    it('au-delà du seuil de l\'app, la ligne de synchro passe en warn — le MÊME jugement', () => {
        // DISCRIMINANT : la gravité suit `stale`, qui met aussi le summary en `degraded`. Un second
        // seuil écrit ici pourrait dire « tout va bien » pendant que le statut dit l'inverse.
        setStateFreshness({ updatedAt: Date.now() - STALE_THRESHOLD_MS - 60_000, source: 'Drive' });
        const s = buildHubSummary(personaState());
        expect(s.status).toBe('degraded');
        const synchro = s.details?.[0]?.items.find((i) => i.label === 'Dernière synchro');
        expect(synchro?.severity).toBe('warn');
    });

    it('les placements sont ventilés par compte, et les postes VIDES sont omis', () => {
        // « REEE : 0 $ » affirmerait un compte vide là où il n'y a pas de compte — et le hub trie
        // ses lignes, donc cinq zéros pousseraient dehors ce qui a de la valeur.
        const s = buildHubSummary(personaState());
        const section = s.details?.find((d) => d.title === 'Placements par compte');
        if (section) {
            for (const item of section.items) {
                expect(item.value).not.toBe(0);
                expect(item.format).toBe('currency');
            }
            expect(section.items.length).toBeGreaterThan(0);
        }
    });

    it('aucun placement → aucune section de ventilation, jamais un encadré vide', () => {
        const s = buildHubSummary(normalizeAppState({ ...personaState(), assets: [] }));
        // `details` peut être ABSENT en entier (aucune section à publier) : « aucune section de
        // ventilation » et « aucune section du tout » sont tous deux corrects ici.
        expect(s.details?.some((d) => d.title === 'Placements par compte') ?? false).toBe(false);
        expect(() => validateSummary(s)).not.toThrow();
    });

    it('les bornes du contrat tiennent sur toutes les sections', () => {
        setStateFreshness({ updatedAt: Date.now(), source: 'Drive' });
        const s = buildHubSummary(personaState());
        expect((s.details ?? []).length).toBeLessThanOrEqual(6);
        for (const section of s.details ?? []) {
            expect(section.title.length).toBeLessThanOrEqual(40);
            expect(section.items.length).toBeGreaterThan(0);
            expect(section.items.length).toBeLessThanOrEqual(8);
            const labels = section.items.map((i) => i.label);
            expect(new Set(labels).size).toBe(labels.length);
            for (const item of section.items) {
                expect(item.label.length).toBeLessThanOrEqual(40);
                if (item.hint !== undefined) expect(item.hint.length).toBeLessThanOrEqual(80);
            }
        }
    });
});

describe('[HUB-REFUS-4-SANS-DIAGNOSTIC] la carte dit POURQUOI elle perd ses placements', () => {
    const MAINTENANT_R = Date.parse('2026-08-19T18:00:00Z');

    const titreR = (jours: number, dernierJour: number, over: Record<string, unknown> = {}) => ({
        symbol: 'XEQT.TO', quantity: 1, currency: 'CAD' as const, currentPrice: 100 + jours - 1,
        name: 'XEQT', performance: 0, dateBought: '2026-08-01',
        purchases: [{ date: '2026-08-01', quantity: 1, price: 100 }],
        priceHistory: Array.from({ length: jours }, (_, i) => ({
            date: `2026-08-${String(dernierJour - jours + 1 + i).padStart(2, '0')}`,
            price: 100 + i,
        })),
        accountType: 'NON-ENREG' as const,
        ...over,
    });

    /** Compagnon détenu dont l'historique s'arrête tôt : absent du TOTAL de la séance. */
    const compagnonR = {
        symbol: 'GBS.PA', quantity: 1, currency: 'CAD' as const, currentPrice: 500,
        name: 'Compagnon', performance: 0, dateBought: '2026-08-05',
        purchases: [{ date: '2026-08-05', quantity: 1, price: 500 }],
        priceHistory: [{ date: '2026-08-05', price: 500 }, { date: '2026-08-06', price: 500 }],
        accountType: 'NON-ENREG' as const,
    };

    it('total amputé : la section existe, NOMME le titre, et aucune ligne de placements ne sort', () => {
        // C'est la situation réelle de Marc : le hub publiait 217 767 $ au lieu de 245 687 $. Depuis
        // le refus du total amputé, la carte se TAIT — et sans cette section, ce silence serait
        // indiscernable d'une panne.
        const s = buildHubSummary({
            ...personaState(),
            assets: [titreR(14, 18), compagnonR],
            fxRates: { USD: 1.35, EUR: 1.45 },
        } as never, MAINTENANT_R);

        expect(s.metrics.some((m) => m.label.startsWith('Placements'))).toBe(false);
        const section = (s.details ?? []).find((d) => d.title === 'Pourquoi les placements manquent');
        expect(section).toBeTruthy();
        expect(String(section?.items[0]?.value)).toContain('GBS.PA');
        expect(section?.items[0]?.severity).toBe('warn');
    });

    it("CONTRÔLE NÉGATIF : quand les placements sortent, la section n'existe PAS", () => {
        // Sans ce cas, une section publiée EN PERMANENCE passerait le test ci-dessus — et le hub
        // expliquerait une absence qui n'existe pas.
        const s = buildHubSummary({
            ...personaState(),
            assets: [titreR(14, 18)],
            fxRates: { USD: 1.35, EUR: 1.45 },
        } as never, MAINTENANT_R);

        expect(s.metrics.some((m) => m.label.startsWith('Placements'))).toBe(true);
        expect((s.details ?? []).some((d) => d.title === 'Pourquoi les placements manquent')).toBe(false);
    });
});
