// tests/mcp/dataAwareTools.test.ts
//
// Lot 1 — tools MCP « data-aware » sur un AppState fixture : sorties sensées.
// On exerce les VRAIS handlers via les fonctions register*, en capturant
// (nom, schéma, handler) avec un faux serveur minimal, puis on appelle le
// handler avec des arguments valides. Cela teste le câblage réel (StateProvider,
// adaptateur Lot 0, moteur pur, fiscalité) sans dépendre du transport MCP.

import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TEST_PERSONAS } from '../../services/testPersonas';
import {
    normalizeAppState,
    loadAppStateFromSource,
    validateAppStateShape,
    buildDefaultAppState,
    type StateSource,
} from '../../mcp/state/loadAppState';
import { makeStateProvider } from '../../mcp/state/stateProvider';
import type { StateProvider } from '../../mcp/tools/_dataAware';
import { registerGetFinancialOverview } from '../../mcp/tools/getFinancialOverview.tool';
import { registerGetProjection } from '../../mcp/tools/getProjection.tool';
import { registerGetTaxSituation } from '../../mcp/tools/getTaxSituation.tool';
import { applyDocument } from '../../mcp/ingest/applyDocument';
import { registerGetRetirementOutlook } from '../../mcp/tools/getRetirementOutlook.tool';
import { registerGetNextBestActions } from '../../mcp/tools/getNextBestActions.tool';
import { registerSearchTransactions } from '../../mcp/tools/searchTransactions.tool';
import { searchTransactions } from '../../services/transactionsSearch';
import type { AppState } from '../../types';

// ── Faux serveur : capture les handlers enregistrés ─────────────────────────
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

// État fixture : Karim (salarié aisé, célibataire, immigré) — impôt > 0, actifs.
function karimState(): AppState {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());
}
// Couple DINK (2 salaires, retraite autofinancée par le portefeuille) — cas des fixes 2026-07-14.
function dinkState(): AppState {
    return normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'jeune-couple-dink')!.build());
}
function providerFor(state: AppState): StateProvider {
    const src: StateSource = { description: 'fixture', loadRaw: async () => JSON.stringify(state) };
    return makeStateProvider(src, { ttlMs: 0 });
}

describe('Lot 1 — get_financial_overview', () => {
    it("renvoie un patrimoine net cohérent et la ventilation par compte", async () => {
        const h = captureTool(registerGetFinancialOverview, providerFor(karimState()));
        const out = await callJson(h);
        expect(out.currency).toBe('CAD');
        expect(out.netWorth).toBeGreaterThan(0);
        // Karim : CELI ~20k, REER ~15k (cf personaAudit).
        expect((out.accounts as Record<string, number>).celi).toBeGreaterThan(15000);
        expect((out.accounts as Record<string, number>).reer).toBeGreaterThan(12000);
        expect(out.totalDebt).toBe(0);
        expect(out.coupleMode).toBe(false);
    });
});

describe('Lot 1 — get_projection', () => {
    // PV-1 (2026-06-10) : horizon 10 ans (accumulation, marge robuste) au lieu de 20. À 20 ans,
    // Karim (retraite à 50 avec actifs insuffisants) est honnêtement RUINÉ depuis que les soldes
    // d'impôt d'avril en retraite sont réellement payés (cascade de vente) au lieu d'être effacés
    // par le clamp — l'ancien « realNW > 0 à 20 ans » reposait sur ~32 k$ d'impôts avalés. Le but
    // de ce test est le CÂBLAGE (handler MCP → adaptateur → moteur), pas la solvabilité du persona.
    it('patrimoine final fini et > 0 sur 10 ans (BASE)', async () => {
        const h = captureTool(registerGetProjection, providerFor(karimState()));
        const out = await callJson(h, { years: 10, scenario: 'BASE', monteCarlo: false });
        expect(out.horizonYears).toBe(10);
        expect(Number.isFinite(out.finalNetWorthNominal as number)).toBe(true);
        expect(out.finalNetWorthNominal as number).toBeGreaterThan(0);
        expect(out.finalNetWorthReal as number).toBeGreaterThan(0);
        // Réel ≤ nominal (déflaté par l'inflation).
        expect(out.finalNetWorthReal as number).toBeLessThanOrEqual(out.finalNetWorthNominal as number);
        expect(Array.isArray(out.byScenario)).toBe(true);
        // [PROJ-TAXPAID-LABEL] : plus JAMAIS de champ « totalTaxesPaid » (compteur de régularisations
        // d'avril, négatif pour un gros cotisant REER, présenté à tort comme l'impôt total payé) —
        // renommé netTaxSettlements + note explicative.
        expect(out).not.toHaveProperty('totalTaxesPaid');
        expect(Number.isFinite(out.netTaxSettlements as number)).toBe(true);
        expect(String(out.netTaxSettlementsNote)).toMatch(/N'EST PAS l'impôt total/);
    });

    it('Monte Carlo renvoie la SURVIE BRUTE (0-100), distincte du FVI composite', async () => {
        const h = captureTool(registerGetProjection, providerFor(karimState()));
        const out = await callJson(h, { years: 15, scenario: 'BASE', monteCarlo: true });
        const mc = out.monteCarlo as Record<string, number | null> | null;
        expect(mc).not.toBeNull();
        // [MCP-RETIREMENT-VERDICT] successProbabilityPct = survivalRatePct moteur (% de runs avec
        // patrimoine final > 0), PAS result.successRate (écrasé par le FVI quand MC tourne).
        expect(typeof mc!.successProbabilityPct).toBe('number');
        expect(mc!.successProbabilityPct as number).toBeGreaterThanOrEqual(0);
        expect(mc!.successProbabilityPct as number).toBeLessThanOrEqual(100);
        expect(typeof mc!.financialVitalityIndex).toBe('number'); // le FVI reste exposé À CÔTÉ
    });
});

describe('Lot 1 — get_tax_situation', () => {
    it("impôt > 0 pour un salarié, et room REER/CELI ≥ 0", async () => {
        const h = captureTool(registerGetTaxSituation, providerFor(karimState()));
        const out = await callJson(h, { year: 2026 });
        expect(out.grossAnnualIncome as number).toBeGreaterThan(0);
        expect(out.totalTax as number).toBeGreaterThan(0);
        expect(out.taxFederal as number).toBeGreaterThan(0);
        expect(out.taxQuebec as number).toBeGreaterThan(0);
        expect(out.marginalRatePct as number).toBeGreaterThan(0);
        expect(out.celiRoomRemaining as number).toBeGreaterThanOrEqual(0);
        expect(out.reerRoomRemaining as number).toBeGreaterThanOrEqual(0);
    });

    it('[MCP-TAX-COUPLE] couple 60k/60k imposé PAR CONJOINT, jamais fusionné en un contribuable à 120k (discriminant)', async () => {
        // Fiscalité canadienne = individuelle. Mesuré (utils/tax réel, 2026) : 2×60k = 22 126 $
        // (marginal 36,1 %/conjoint) vs fusionné 120k = 33 435 $ (45,7 %) → l'ancien code
        // (computeBaseGrossAnnual → UN calculateFiscalReport) sur-estimait de ~11 300 $/an.
        // Ce test ÉCHOUE sur l'ancien code (totalTax ~33 435, marginal 45,7).
        const state = karimState();
        state.config.users = [
            { ...state.config.users[0], name: 'A', grossSalary: 5000, netSalary: 3800, rrspContributed: 0, fhsaBalance: 0 },
            { ...(state.config.users[1] ?? state.config.users[0]), name: 'B', grossSalary: 5000, netSalary: 3800, rrspContributed: 0, fhsaBalance: 0 },
        ] as typeof state.config.users;
        const h = captureTool(registerGetTaxSituation, providerFor(state));
        const out = await callJson(h, { year: 2026 });

        expect(out.grossAnnualIncome).toBe(120000);
        // Impôt du couple ≈ 2× impôt individuel 60k (22 126 $), PAS l'impôt d'un solo 120k (33 435 $).
        expect(out.totalTax as number).toBeGreaterThan(20000);
        expect(out.totalTax as number).toBeLessThan(25000);
        // Marginal = celui d'un conjoint à 60k (36,1 %), jamais celui du total ménage (45,7 %).
        expect(out.marginalRatePct as number).toBeLessThan(40);
        // Détail par contribuable exposé (2 entrées symétriques).
        const perUser = out.perUser as Array<Record<string, number>>;
        expect(perUser).toHaveLength(2);
        expect(perUser[0].totalTax).toBe(perUser[1].totalTax); // symétrie 60k/60k
        expect(perUser[0].grossAnnual).toBe(60000);
    });

    it('[TAX-DETAIL] retenues détaillées + net mensuel + provenance + réel des transactions exposés', async () => {
        const state = karimState();
        // Karim est SOLO : muter l'index 0 EN PLACE (reconstruire le tuple créerait users[1] =
        // undefined → null au JSON → schéma AppState rejeté).
        state.config.users[0] = { ...state.config.users[0], salarySource: { kind: 'mcp', label: 'ROBOVIC', appliedAt: 1752585600000 } };
        const h = captureTool(registerGetTaxSituation, providerFor(state));
        const out = await callJson(h, { year: 2026 });
        const pu = (out.perUser as Array<Record<string, unknown>>)[0];
        const w = pu.withholdings as Record<string, number>;
        // Retenues détaillées cohérentes : fed+qc == totalTax du contribuable (arrondis ±2 $)
        expect(w.federal + w.quebec).toBeCloseTo(pu.totalTax as number, -1);
        for (const k of ['federal', 'quebec', 'rrq', 'rqap', 'ae']) {
            expect(w[k]).toBeGreaterThanOrEqual(0);
        }
        expect(pu.netMonthly as number).toBeCloseTo((pu.netIncome as number) / 12, -1);
        // Provenance de la paie (source unique) transmise telle quelle
        expect((pu.salarySource as Record<string, unknown>).kind).toBe('mcp');
        expect((pu.salarySource as Record<string, unknown>).label).toBe('ROBOVIC');
        // Réel des transactions (mois pleins) : net = income − expenses
        const real = out.realMonthlyAverages as Record<string, number>;
        expect(real.net).toBe(real.income - real.expenses);
        expect(real.fullMonths).toBeGreaterThanOrEqual(0);
    });

    it('[INCOME-PROVENANCE] apply_payslip estampille la source (montant changé, 1er apply idempotent, changement d\'employeur) ; retry identique = inerte', async () => {
        const s = karimState();
        const first = applyDocument(s, { kind: 'payslip', userIndex: 0, grossAnnual: 90_000, employer: 'ROBOVIC INC.' });
        const u1 = first.nextState.config.users[0];
        expect(u1.salarySource?.kind).toBe('mcp');
        expect(u1.salarySource?.label).toBe('ROBOVIC INC.');
        expect(typeof u1.salarySource?.appliedAt).toBe('number');

        // Retry STRICTEMENT identique (même employeur, mêmes montants) → 0 changement, inerte.
        const retry = applyDocument(first.nextState, { kind: 'payslip', userIndex: 0, grossAnnual: 90_000, employer: 'ROBOVIC INC.' });
        expect(retry.changes).toHaveLength(0);
        expect(retry.nextState.config.users[0].salarySource?.appliedAt).toBe(u1.salarySource?.appliedAt);

        // CHANGEMENT D'EMPLOYEUR à salaire identique → provenance rafraîchie (1 change dédié,
        // sinon le tool retournerait applied:false sans sauvegarder — finding panel).
        const newJob = applyDocument(first.nextState, { kind: 'payslip', userIndex: 0, grossAnnual: 90_000, employer: 'NOUVEL EMPLOYEUR' });
        expect(newJob.changes).toHaveLength(1);
        expect(newJob.changes[0].field).toContain('salarySource');
        expect(newJob.nextState.config.users[0].salarySource?.label).toBe('NOUVEL EMPLOYEUR');

        // 1er apply IDEMPOTENT (montants déjà à jour via saisie manuelle) → estampille quand même
        // (une vraie paie vient d'être appliquée : le bandeau ne doit pas dire « saisie manuelle »).
        const manualState = karimState();
        const monthlyGross = manualState.config.users[0].grossSalary;
        const firstIdempotent = applyDocument(manualState, { kind: 'payslip', userIndex: 0, grossAnnual: monthlyGross * 12 });
        expect(firstIdempotent.nextState.config.users[0].salarySource?.kind).toBe('mcp');
    });

    it('[MCP-TAX-COUPLE] solo : totaux INCHANGÉS par le refactor per-conjoint (non-régression)', async () => {
        // Un seul salarié → per-conjoint ≡ calcul unique : mêmes totaux qu'avant le fix.
        const h = captureTool(registerGetTaxSituation, providerFor(karimState()));
        const out = await callJson(h, { year: 2026 });
        const perUser = out.perUser as Array<Record<string, number>>;
        expect(perUser).toHaveLength(1);
        expect(perUser[0].totalTax).toBe(out.totalTax);
        expect(perUser[0].marginalRatePct).toBe(out.marginalRatePct);
    });
});

describe('Lot 1 — get_retirement_outlook', () => {
    it('renvoie âge cible, statut FIRE et un verdict', async () => {
        const h = captureTool(registerGetRetirementOutlook, providerFor(karimState()));
        const out = await callJson(h, { monteCarlo: false });
        expect(out.targetRetirementAge).toBe(50); // persona Karim
        expect(typeof out.fireReached).toBe('boolean');
        expect(typeof out.verdict).toBe('string');
        expect(Number.isFinite(out.estateNetWorth as number)).toBe(true);
    });

    it("exprime le revenu en $ d'aujourd'hui (déflaté ≤ nominal) et compare la cible apples-to-apples", async () => {
        const h = captureTool(registerGetRetirementOutlook, providerFor(karimState()));
        const out = await callJson(h, { monteCarlo: false });
        const real = out.projectedRetirementIncomeMonthly as number;
        const nominal = out.projectedRetirementIncomeMonthlyNominal as number;
        expect(Number.isFinite(real)).toBe(true);
        expect(Number.isFinite(nominal)).toBe(true);
        // Le moteur produit du NOMINAL (futur) ; le tool déflate en $ d'aujourd'hui.
        expect(real).toBeLessThanOrEqual(nominal);
        // Retraite dans le futur + inflation > 0 ⇒ déflation stricte quand il y a un revenu.
        if (nominal > 0) expect(real).toBeLessThan(nominal);
        const src = out.incomeSources as Record<string, number>;
        expect(src.governmentPensionsNominal).toBeGreaterThanOrEqual(src.governmentPensions);
        expect(src.privatePensionsNominal).toBeGreaterThanOrEqual(src.privatePensions);
        // [MCP-RETIREMENT-VERDICT] : le verdict est basé sur la SOUTENABILITÉ du plan (patrimoine
        // jamais épuisé PENDANT LA RETRAITE, sans MC), plus jamais sur « rentes seules ≥ cible »
        // (qui ignorait le décaissement) ni sur le min de TOUT l'horizon (faux négatif si creux
        // transitoire en accumulation — finding panel).
        const target = out.targetMonthlyIncome as number;
        expect(out.meetsIncomeTarget).toBe(target > 0 && (out.minRetirementNetWorth as number) > 0);
    });

    it('[MCP-RETIREMENT-VERDICT] DINK autofinancé : décaissement VISIBLE + verdict positif (discriminant)', async () => {
        // Persona jeune-couple-dink : rentes publiques ~903 $/mois réels << cible 5 500 $, mais le
        // portefeuille (~1,5 M$ à la retraite) finance le reste — plan soutenable (MC ~98 %).
        // ANCIEN code : meetsIncomeTarget=false (« sous la cible ») car rentes seules comparées à la
        // cible → recommandation à l'envers (sur-épargner). NOUVEAU : décaissement exposé + verdict
        // sur la soutenabilité (minNetWorth > 0) → true. Ce test ÉCHOUE sur l'ancien code.
        const h = captureTool(registerGetRetirementOutlook, providerFor(dinkState()));
        const out = await callJson(h, { monteCarlo: false });
        const src = out.incomeSources as Record<string, number>;
        // Le décaissement du portefeuille est désormais VISIBLE (mesuré ~3 020 $/mois réels).
        expect(src.portfolioWithdrawals).toBeGreaterThan(1000);
        // Le revenu total identifiable dépasse largement les rentes seules (mesuré 3 923 vs 903).
        const real = out.projectedRetirementIncomeMonthly as number;
        expect(real).toBeGreaterThan((src.governmentPensions + src.privatePensions) * 2);
        // Verdict : le plan FINANCE la cible (patrimoine jamais épuisé EN RETRAITE) malgré rentes < cible.
        expect(out.minRetirementNetWorth as number).toBeGreaterThan(0);
        expect(out.meetsIncomeTarget).toBe(true);
        expect(String(out.verdict)).toMatch(/FINANCE le train de vie/);
    });
});

describe('Lot 1 — get_next_best_actions', () => {
    it('renvoie des signaux chiffrés (room/dette/cashflow)', async () => {
        const h = captureTool(registerGetNextBestActions, providerFor(karimState()));
        const out = await callJson(h);
        const snap = out.snapshot as Record<string, number>;
        expect(snap.netWorth).toBeGreaterThan(0);
        expect(snap.celiRoomRemaining).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(out.signals)).toBe(true);
    });
});

describe('Lot 1 — search_transactions', () => {
    it("filtre par requête texte et agrège les montants", async () => {
        const state = karimState();
        const h = captureTool(registerSearchTransactions, providerFor(state));
        const out = await callJson(h, { query: 'metro', includeTransfers: false, limit: 50 });
        expect(out.count as number).toBeGreaterThan(0);
        // Toutes les transactions renvoyées contiennent « metro » (payee/catégorie).
        for (const t of out.transactions as Array<{ payee: string; category: string }>) {
            const hay = `${t.payee} ${t.category}`.toLowerCase();
            expect(hay.includes('metro')).toBe(true);
        }
        // Épicerie = dépenses → total dépensé > 0.
        expect(out.totalSpent as number).toBeGreaterThan(0);
    });

    it('une requête sans correspondance renvoie 0 (et n\'inclut pas les transferts par défaut)', async () => {
        const state = karimState();
        const h = captureTool(registerSearchTransactions, providerFor(state));
        const out = await callJson(h, { query: 'zzz-introuvable-zzz' });
        expect(out.count).toBe(0);
        expect((out.transactions as unknown[]).length).toBe(0);
    });
});

// ── Filtre pur (services/transactionsSearch) ────────────────────────────────
describe('Lot 1 — searchTransactions (filtre pur)', () => {
    const txns = [
        { id: 1, date: '2026-01-10', payee: 'Metro Plus', amount: -85.5, category: 'Alimentation', status: 'processed' as const },
        { id: 2, date: '2026-02-01', payee: 'Dépôt paie', amount: 3200, category: 'Revenu', status: 'processed' as const },
        { id: 3, date: '2026-01-20', payee: 'Virement CELI', amount: -1000, category: 'Transfert', status: 'processed' as const, isTransfer: true },
        { id: 4, date: '2026-03-05', payee: 'Metro Jean-Talon', amount: -42, category: 'Alimentation', status: 'processed' as const },
    ];

    it('exclut les transferts par défaut, filtre par texte, agrège', () => {
        const r = searchTransactions(txns, { query: 'metro' });
        expect(r.count).toBe(2);
        expect(Math.round(r.totalSpent)).toBe(128); // 85.5 + 42 ≈ 127.5 → 128
        expect(r.totalReceived).toBe(0);
        // Tri récent d'abord.
        expect(r.matches[0].date >= r.matches[1].date).toBe(true);
    });

    it('filtre par plage de montants et de dates', () => {
        const r = searchTransactions(txns, { minAmount: 0, fromDate: '2026-02-01', toDate: '2026-02-28' });
        expect(r.count).toBe(1);
        expect(r.matches[0].id).toBe(2);
        expect(r.totalReceived).toBe(3200);
    });

    it('includeTransfers=true réintègre les virements', () => {
        const r = searchTransactions(txns, { category: 'Transfert', includeTransfers: true });
        expect(r.count).toBe(1);
        expect(r.matches[0].id).toBe(3);
    });
});

// ── Loader / validation d'état ───────────────────────────────────────────────
describe('Lot 1 — loader & validation AppState', () => {
    it('charge un état valide depuis une StateSource (JSON nu)', async () => {
        const state = karimState();
        const src: StateSource = { description: 'mem', loadRaw: async () => JSON.stringify(state) };
        const loaded = await loadAppStateFromSource(src);
        expect(loaded.config.users.length).toBe(1);
        expect(loaded.fxRates.CAD).toBe(1);
    });

    it("accepte une enveloppe { payload: AppState }", async () => {
        const state = karimState();
        const src: StateSource = { description: 'mem', loadRaw: async () => JSON.stringify({ payload: state, updatedAt: 1 }) };
        const loaded = await loadAppStateFromSource(src);
        expect((loaded.config.users[0]?.name ?? '')).toContain('Karim');
    });

    it('rejette un JSON illisible avec une erreur claire', async () => {
        const src: StateSource = { description: 'mem', loadRaw: async () => '{ pas du json' };
        await expect(loadAppStateFromSource(src)).rejects.toThrow(/JSON invalide/);
    });

    it('rejette une forme invalide (config.users non tableau)', () => {
        expect(() => validateAppStateShape({ config: { users: 'oops' } })).toThrow(/AppState invalide/);
    });

    it('normalizeAppState remplit les défauts manquants', () => {
        const norm = normalizeAppState({ transactions: [] });
        const def = buildDefaultAppState();
        expect(norm.fxRates.CAD).toBe(def.fxRates.CAD);
        expect(Array.isArray(norm.budgetItems)).toBe(true);
        expect(norm.config.users.length).toBe(def.config.users.length);
    });

    it("makeStateProvider sans source lève une erreur explicite", async () => {
        const provider = makeStateProvider(null);
        await expect(provider()).rejects.toThrow(/source d'état/i);
    });
});
