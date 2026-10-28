// tests/mcp/simulateWhatIf.test.ts
//
// [MCP-WHATIF] — le tool `simulate_what_if` sur un AppState fixture réel.
// Discriminant ÉCONOMIQUE (leçon FISC-RE-SALE-RESIDUAL : asserter la MAGNITUDE
// attendue, pas seulement la cohérence interne) : un achat de 30 k$ doit creuser
// le patrimoine d'≈ 30 k$ à l'an 1 (ni 0, ni 2×), une dépense récurrente doit
// coûter ≈ montant × mois écoulés, une hausse de salaire doit AUGMENTER le NW.
// Même harnais que dataAwareTools.test.ts (vrais handlers, faux serveur).

import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateProvider } from '../../mcp/state/stateProvider';
import type { StateProvider } from '../../mcp/tools/_dataAware';
import { registerSimulateWhatIf } from '../../mcp/tools/simulateWhatIf.tool';
import { registerGetProjection } from '../../mcp/tools/getProjection.tool';
import {
    applyWhatIfChanges,
    compareAtHorizons,
    extractYearlySeries,
    isoMonthFrom,
} from '../../mcp/whatIf';
import type { ProjectionChartPoint } from '../../services/projection/types';
import type { AppState } from '../../types';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function captureTool(register: (s: McpServer, getState: StateProvider) => void, getState: StateProvider): Handler {
    let captured: Handler | null = null;
    const fake = {
        tool: (_name: string, _desc: string, _schema: unknown, cb: Handler) => {
            captured = cb;
        },
    } as unknown as McpServer;
    register(fake, getState);
    if (!captured) throw new Error('aucun handler capturé');
    return captured;
}

async function callJson(handler: Handler, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await handler(args);
    expect(res.isError).toBeFalsy();
    expect(res.content[0]?.type).toBe('text');
    return JSON.parse(res.content[0].text);
}

function karimState(): AppState {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
}
function providerFor(state: AppState): StateProvider {
    const src: StateSource = { description: 'fixture', loadRaw: async () => JSON.stringify(state) };
    return makeStateProvider(src, { ttlMs: 0 });
}

const ENGINE_TIMEOUT = 60_000; // 2 runs moteur par appel → marge large (défaut vitest 5 s trop court)

describe('simulate_what_if — achat ponctuel (voiture comptant)', () => {
    it('creuse le patrimoine d’≈ le coût à l’an 1 (discriminant de magnitude)', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{ kind: 'achat_ponctuel', label: 'Voiture', amount: 30000 }],
            years: 10,
            includeSeries: true,
        });
        expect(out.currency).toBe('CAD');
        const deltas = out.deltasByHorizon as Array<{ afterYears: number; netWorthDelta: number }>;
        const year1 = deltas.find((d) => d.afterYears === 1)!;
        // Magnitude économique : −30 k$ dépensés au mois 1 → écart à l'an 1 dans
        // [−40k, −25k] (le coût ± croissance perdue sur ~11 mois). Ni 0, ni 2×.
        expect(year1.netWorthDelta).toBeLessThan(-25000);
        expect(year1.netWorthDelta).toBeGreaterThan(-40000);
        // Le coût COMPOSE : l'écart final (10 ans) est au moins aussi grand qu'à l'an 1.
        const final = deltas[deltas.length - 1];
        expect(final.netWorthDelta).toBeLessThanOrEqual(year1.netWorthDelta);
        // Impact global cohérent avec le résumé base/whatIf.
        const base = out.base as { finalNetWorthNominal: number };
        const whatIf = out.whatIf as { finalNetWorthNominal: number };
        const impact = out.impact as { finalNetWorthDelta: number };
        expect(impact.finalNetWorthDelta).toBe(whatIf.finalNetWorthNominal - base.finalNetWorthNominal);
        expect(impact.finalNetWorthDelta).toBeLessThan(0);
    }, ENGINE_TIMEOUT);

    it('série annuelle : présente, finie, cohérente avec le résumé', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{ kind: 'achat_ponctuel', label: 'Voiture', amount: 30000 }],
            years: 10,
            includeSeries: true,
        });
        const series = out.series as { base: Array<Record<string, number | null>>; whatIf: Array<Record<string, number | null>> };
        expect(series.base.length).toBeGreaterThanOrEqual(10);
        expect(series.whatIf.length).toBe(series.base.length);
        for (const p of series.base) {
            expect(Number.isFinite(p.netWorth)).toBe(true);
        }
        // Dernier point de série ≡ patrimoine final du résumé (même moteur, même run).
        const base = out.base as { finalNetWorthNominal: number };
        expect(series.base[series.base.length - 1].netWorth).toBe(base.finalNetWorthNominal);
    }, ENGINE_TIMEOUT);
});

describe('simulate_what_if — dépense récurrente', () => {
    it('+500 $/mois coûte ≈ 500 × mois écoulés (± croissance perdue)', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{ kind: 'depense_recurrente', label: 'Frais voiture', monthlyAmount: 500 }],
            years: 5,
            includeSeries: false,
        });
        const deltas = out.deltasByHorizon as Array<{ afterYears: number; netWorthDelta: number }>;
        const year5 = deltas.find((d) => d.afterYears === 5)!;
        // 500 × 60 mois = 30 k$ dépensés ; l'écart doit être au moins ~80 % de ça
        // (jamais 0 — le clamp d'épargne ne doit PAS avaler la dépense) et borné
        // par ~2× (croissance perdue incluse, jamais un emballement).
        expect(year5.netWorthDelta).toBeLessThan(-24000);
        expect(year5.netWorthDelta).toBeGreaterThan(-60000);
        expect(out.series).toBeNull();
    }, ENGINE_TIMEOUT);
});

describe('simulate_what_if — salaire', () => {
    it('une hausse de 10 % AUGMENTE le patrimoine final (direction)', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{ kind: 'salaire', changePct: 10 }],
            years: 10,
            includeSeries: false,
        });
        const impact = out.impact as { finalNetWorthDelta: number };
        expect(impact.finalNetWorthDelta).toBeGreaterThan(0);
        // L'hypothèse « net proportionnel » doit être REMONTÉE (transparence).
        const assumptions = out.assumptions as string[];
        expect(assumptions.some((a) => a.includes('proportionnellement'))).toBe(true);
    }, ENGINE_TIMEOUT);

    it('cibler un 2ᵉ conjoint inexistant → erreur claire, pas de crash', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const res = await h({
            changes: [{ kind: 'salaire', userIndex: 1, changePct: 10 }],
            years: 5,
        });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('conjoint');
    }, ENGINE_TIMEOUT);
});

describe('simulate_what_if — achat financé', () => {
    it('voiture financée : patrimoine creusé, hypothèses de financement remontées', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{
                kind: 'achat_ponctuel', label: 'Voiture', amount: 30000,
                financing: { downPayment: 5000, ratePct: 7, termYears: 5 },
            }],
            years: 10,
            includeSeries: false,
        });
        const impact = out.impact as { finalNetWorthDelta: number };
        // Financée à 7 % : le coût total (30 k$ + intérêts) dépasse le comptant.
        expect(impact.finalNetWorthDelta).toBeLessThan(-30000);
        const assumptions = out.assumptions as string[];
        expect(assumptions.some((a) => a.includes('amortissement standard'))).toBe(true);
        const applied = out.changesApplied as string[];
        expect(applied.some((a) => a.includes('financé'))).toBe(true);
    }, ENGINE_TIMEOUT);
});

describe('simulate_what_if — fixes du panel 2026-07-13 (discriminants)', () => {
    it('label contenant « vente » : l’achat est quand même DÉBITÉ (mot réservé du moteur assaini)', async () => {
        // Pré-fix : `applyLifeEvents` routait ce label vers la branche VENTE IMMOBILIÈRE
        // (impactAmount ignoré) → delta = 0 silencieux. Ce test ÉCHOUE sur le code d'avant.
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{ kind: 'achat_ponctuel', label: 'Nouvelle voiture (vente de l’ancienne)', amount: 30000 }],
            years: 10,
            includeSeries: false,
        });
        const deltas = out.deltasByHorizon as Array<{ afterYears: number; netWorthDelta: number }>;
        const year1 = deltas.find((d) => d.afterYears === 1)!;
        expect(year1.netWorthDelta).toBeLessThan(-25000);
        const assumptions = out.assumptions as string[];
        expect(assumptions.some((a) => a.includes('mot réservé'))).toBe(true);
    }, ENGINE_TIMEOUT);

    it('montant Infinity → erreur claire (pas d’impact fabriqué)', async () => {
        // Le harnais appelle le handler SANS la validation Zod du SDK → prouve la garde
        // de whatIf.ts elle-même (ceinture ; le `.finite()` du schéma est la bretelle).
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        for (const changes of [
            [{ kind: 'achat_ponctuel', label: 'Achat infini', amount: Infinity }],
            [{ kind: 'achat_immobilier', price: Infinity, downPaymentPct: 20, ratePct: 5 }],
            [{ kind: 'nouvelle_dette', label: 'Dette infinie', amount: Infinity, ratePct: 5 }],
        ]) {
            const res = await h({ changes, years: 5 });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain('non fini');
        }
    }, ENGINE_TIMEOUT);

    it('changement daté APRÈS l’horizon → erreur claire (pas de « succès » à effet nul)', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const res = await h({
            changes: [{ kind: 'achat_ponctuel', label: 'Voiture tardive', amount: 30000, monthsFromNow: 40 }],
            years: 2,
        });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('horizon');
    }, ENGINE_TIMEOUT);

    it('achat FINANCÉ différé → rejeté (les dettes du moteur démarrent au mois 0)', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const res = await h({
            changes: [{
                kind: 'achat_ponctuel', label: 'Voiture', amount: 30000, monthsFromNow: 24,
                financing: { downPayment: 5000, ratePct: 7, termYears: 5 },
            }],
            years: 10,
        });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain('financement différé');
    }, ENGINE_TIMEOUT);

    it('mise de fonds immo > prix → rejetée', () => {
        expect(() => applyWhatIfChanges(karimState(), [
            { kind: 'achat_immobilier', price: 450000, downPayment: 500000, ratePct: 5 },
        ], new Date(2026, 6, 15))).toThrow(/supérieure au prix/);
    });
});

describe('simulate_what_if — nouvelle dette (magnitude e2e)', () => {
    it('emprunt 10 k$ à 8 % : patrimoine creusé d’≈ le solde + intérêts à l’an 1', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{ kind: 'nouvelle_dette', label: 'Prêt perso', amount: 10000, ratePct: 8 }],
            years: 10,
            includeSeries: false,
        });
        const deltas = out.deltasByHorizon as Array<{ afterYears: number; netWorthDelta: number }>;
        const year1 = deltas.find((d) => d.afterYears === 1)!;
        // MESURÉ (sonde 2026-07-13) : le moteur rembourse en AVALANCHE (dette éteinte au
        // mois ~3 en déplaçant le surplus qui allait aux placements) → écart an 1 = principal
        // (10 k$) + intérêts + contributions CELI/REER déplacées et leur croissance perdue
        // (−14 404 $ sur karim). Borne : au moins le principal, au plus ~1,8× (second ordre).
        expect(year1.netWorthDelta).toBeLessThan(-10000);
        expect(year1.netWorthDelta).toBeGreaterThan(-18000);
    }, ENGINE_TIMEOUT);
});

describe('simulate_what_if — achat immobilier (flux EXERCÉ, leçon FUZZ-ONETIME-FLOWS)', () => {
    it('l’achat a bien lieu dans la fenêtre simulée (Immobilier > 0 dans la série what-if)', async () => {
        const h = captureTool(registerSimulateWhatIf, providerFor(karimState()));
        const out = await callJson(h, {
            changes: [{
                kind: 'achat_immobilier', price: 200000, downPaymentPct: 20, ratePct: 5,
                amortYears: 25, monthsFromNow: 3, municipality: 'reste_qc',
            }],
            years: 15,
            includeSeries: true,
        });
        const series = out.series as { base: Array<{ immobilier: number | null }>; whatIf: Array<{ immobilier: number | null }> };
        // Générer le flux ≠ l'exercer : on PROUVE que l'achat s'est produit (équité > 0),
        // sinon un report silencieux (cash insuffisant) rendrait le test vacant.
        const exercised = series.whatIf.some((p) => (p.immobilier ?? 0) > 0);
        expect(exercised).toBe(true);
        const baseHasProperty = series.base.some((p) => (p.immobilier ?? 0) > 0);
        expect(baseHasProperty).toBe(false);
        // Et l'achat a un impact non nul sur la trajectoire.
        const impact = out.impact as { finalNetWorthDelta: number };
        expect(impact.finalNetWorthDelta).not.toBe(0);
    }, ENGINE_TIMEOUT);
});

describe('get_projection — includeSeries', () => {
    it('renvoie la série annuelle sur demande, null sinon', async () => {
        const h = captureTool(registerGetProjection, providerFor(karimState()));
        const withSeries = await callJson(h, { years: 10, scenario: 'BASE', monteCarlo: false, includeSeries: true });
        const series = withSeries.series as Array<{ netWorth: number; age: number | null }>;
        expect(Array.isArray(series)).toBe(true);
        expect(series.length).toBeGreaterThanOrEqual(10);
        expect(Number.isFinite(series[0].netWorth)).toBe(true);
        const without = await callJson(h, { years: 10, scenario: 'BASE', monteCarlo: false, includeSeries: false });
        expect(without.series).toBeNull();
    }, ENGINE_TIMEOUT);
});

describe('whatIf — unités pures', () => {
    it('applyWhatIfChanges ne mute JAMAIS l’état de base', () => {
        const base = karimState();
        const snapshot = JSON.stringify(base);
        applyWhatIfChanges(base, [
            { kind: 'achat_ponctuel', label: 'Voiture', amount: 30000 },
            { kind: 'salaire', changePct: 10 },
            { kind: 'nouvelle_dette', label: 'Prêt perso', amount: 10000, ratePct: 8 },
        ], new Date(2026, 6, 15));
        expect(JSON.stringify(base)).toBe(snapshot);
    });

    it('achat immobilier : totalClosingCosts SANS taxe de bienvenue (le moteur l’ajoute lui-même)', () => {
        const app = applyWhatIfChanges(karimState(), [
            { kind: 'achat_immobilier', price: 450000, downPaymentPct: 20, ratePct: 5, municipality: 'reste_qc' },
        ], new Date(2026, 6, 15));
        const goal = app.state.realEstateGoals[app.state.realEstateGoals.length - 1];
        // Notaire 1500 + inspection 800 = 2300 — la taxe de bienvenue n'y est PAS
        // (realEstateMonth.ts ajoute `welcomeFees` au mois d'achat : l'inclure ici = double-comptage).
        expect(goal.totalClosingCosts).toBe(2300);
        expect(goal.downPayment).toBe(90000);
        expect(goal.monthlyPayment).toBeGreaterThan(0);
        expect(goal.isActive).toBe(true);
    });

    it('liste de changements vide → erreur claire', () => {
        expect(() => applyWhatIfChanges(karimState(), [], new Date())).toThrow(/Aucun changement/);
    });

    it('isoMonthFrom : mois suivant + passage d’année', () => {
        expect(isoMonthFrom(new Date(2026, 6, 15), 1)).toBe('2026-08');
        expect(isoMonthFrom(new Date(2026, 11, 3), 2)).toBe('2027-02');
        expect(isoMonthFrom(new Date(2026, 0, 1), 0)).toBe('2026-01');
    });

    it('extractYearlySeries : décembre de chaque année + dernier point, arrondis', () => {
        const chart: ProjectionChartPoint[] = Array.from({ length: 30 }, (_, i) => ({
            monthIndex: i,
            NetWorth: 1000.4 + i,
            year: 2026 + Math.floor(i / 12),
            age: 30 + Math.floor(i / 12),
        }));
        const series = extractYearlySeries(chart);
        // mois 11, 23 (fins d'année) + dernier point (29).
        expect(series.map((p) => p.netWorth)).toEqual([Math.round(1011.4), Math.round(1023.4), Math.round(1029.4)]);
        expect(series[0].year).toBe(2026);
    });

    it('compareAtHorizons : deltas aux bons jalons, horizon respecté', () => {
        const mk = (nw: (i: number) => number): ProjectionChartPoint[] =>
            Array.from({ length: 120 }, (_, i) => ({ monthIndex: i, NetWorth: nw(i) }));
        const base = mk((i) => 1000 * i);
        const whatIf = mk((i) => 1000 * i - 5000);
        const deltas = compareAtHorizons(base, whatIf, 10);
        expect(deltas.map((d) => d.afterYears)).toEqual([1, 2, 5, 10]);
        for (const d of deltas) expect(d.netWorthDelta).toBe(-5000);
    });
});
