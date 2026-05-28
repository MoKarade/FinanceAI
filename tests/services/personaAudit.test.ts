// tests/services/personaAudit.test.ts
//
// Audit « à fond » de chaque persona du mode test : reproduit FIDÈLEMENT le
// pipeline de FutureProjection.tsx (liveCSVBalances persona-aware via le
// marketData, calculatedStartingCash, dépenses = net − épargne) puis passe une
// batterie de contrôles de cohérence sur les DONNÉES et les RÉSULTATS du moteur.
// Imprime aussi un rapport lisible par persona.

import { describe, it, expect } from 'vitest';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { generateTestMarketData } from '../../services/testMarketData';
import { calculateFutureProjection, type SimulationParams } from '../../services/projection';
import type { ProjectionResult, ProjectionChartPoint } from '../../services/projection/types';
import { reconstructPortfolioHistory } from '../../services/history/reconstructPortfolioHistory';
import type { AppState, BudgetConfig, BudgetCategory, Asset, Debt, User } from '../../types';

// ── Réplication du pipeline FutureProjection.tsx ────────────────────────────

function calcMonthlySavings(items: BudgetCategory[]): number {
    return items
        .filter((b) => /épargne|epargne/i.test(String((b as { nature?: string }).nature ?? '')))
        .reduce((s, b) => {
            let t = Number(b.target) || 0;
            if (b.frequency === 'Yearly') t /= 12;
            else if (b.frequency === 'Weekly') t *= 4.33;
            else if (b.frequency === 'Quarterly') t /= 3;
            return s + t;
        }, 0);
}

function calcStartingCash(balances: Record<string, number>, transactions: AppState['transactions'] | undefined): number {
    let cash = Object.values(balances).reduce((s, v) => s + (Number(v) || 0), 0);
    for (const t of transactions ?? []) {
        const tx = t as { amount?: number; isDuplicate?: boolean; isTransfer?: boolean };
        if (!tx.isDuplicate && !tx.isTransfer) cash += Number(tx.amount) || 0;
    }
    return cash;
}

interface LiveBalances { CELI: number; CELIAPP: number; REER: number; NON_ENREG: number; CRYPTO: number; REEE: number }

// Réplique exactement la dérivation liveCSVBalances de FutureProjection.tsx:149-183.
function buildLiveCSVBalances(assets: Asset[], balances: Record<string, number>): LiveBalances {
    const history = generateTestMarketData(assets, balances);
    const out: LiveBalances = { CELI: 0, CELIAPP: 0, REER: 0, NON_ENREG: 0, CRYPTO: 0, REEE: 0 };
    if (!history.length) return out;
    const lastRow = history[history.length - 1] as Record<string, unknown>;
    for (const key of Object.keys(lastRow)) {
        if (key === 'date' || key === 'Date' || key.startsWith('Taux')) continue;
        const val = Number(lastRow[key]) || 0;
        if (key.includes('TOTAL')) continue; // agrégats — non bucketés (cf FutureProjection)
        const mapped = assets.find((a) => key.includes(a.symbol));
        const type = mapped?.accountType ?? 'NON-ENREG';
        if (type === 'CELI') out.CELI += val;
        else if (type === 'REER') out.REER += val;
        else if (type === 'CRYPTO') out.CRYPTO += val;
        else if (key.includes('REEE')) out.REEE += val;
        else out.NON_ENREG += val;
    }
    return out;
}

function currentRent(items: BudgetCategory[]): number {
    const rent = items.find((b) => /loyer|rent|hypoth/i.test(b.name));
    if (!rent) return 1600;
    let v = Number(rent.target) || 0;
    if (rent.frequency === 'Yearly') v /= 12;
    else if (rent.frequency === 'Weekly') v *= 4.33;
    return v;
}

function buildFaithfulParams(state: Partial<AppState>): SimulationParams {
    const config = state.config as BudgetConfig;
    const users = (config?.users ?? []).filter(Boolean) as User[];
    const grossMonthly = users.reduce((s, u) => s + (Number(u?.grossSalary) || 0), 0);
    const netMonthly = users.reduce((s, u) => s + (Number(u?.netSalary) || 0), 0);
    const items = (state.budgetItems ?? []) as BudgetCategory[];
    const balances = (state.initialBalances ?? {}) as unknown as Record<string, number>;
    const assets = (state.assets ?? []) as Asset[];
    const savings = calcMonthlySavings(items);

    return {
        projection: {
            years: 35, returnRate: 6, inflationRate: 2, savingsMode: 'budget',
            manualContribution: 0, usePortfolioRate: false,
            returnRates: { celi: 6, reer: 6, nonReg: 6, crypto: 8, cash: 2 },
            emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
        },
        calculatedStartingCash: calcStartingCash(balances, state.transactions),
        liveCSVBalances: buildLiveCSVBalances(assets, balances),
        realEstateGoals: state.realEstateGoals ?? [],
        debts: state.debts ?? [],
        childGoals: state.childGoals ?? [],
        travelGoals: state.travelGoals ?? [],
        lifeEvents: state.lifeEvents ?? [],
        retirementGoal: state.retirementGoal!,
        config,
        baseGrossAnnual: grossMonthly * 12,
        baseNetAnnual: netMonthly * 12,
        currentRentExpense: currentRent(items),
        baseMonthlyExpenses: Math.max(0, netMonthly - savings),
        startYear: 2026,
        startMonth: 0,
    } as SimulationParams;
}

// ── Audit ───────────────────────────────────────────────────────────────────

describe('Audit personas — données + calculs', () => {
    for (const persona of TEST_PERSONAS) {
        describe(`${persona.emoji} ${persona.label}`, () => {
            const state = persona.build();
            const config = state.config as BudgetConfig;
            const users = (config?.users ?? []).filter(Boolean) as User[];
            const assets = (state.assets ?? []) as Asset[];
            const debts = (state.debts ?? []) as Debt[];
            const live = buildLiveCSVBalances(assets, (state.initialBalances ?? {}) as unknown as Record<string, number>);
            const result = calculateFutureProjection(buildFaithfulParams(state));
            const base = (result.allResults as ProjectionResult[]).find((r) => r.stratType === 'BASE')!;
            const finalNW = base.estateNetWorth ?? base.finalNetWorth ?? 0;
            const maxCeliapp = Math.max(0, ...base.chartData.map((d: ProjectionChartPoint) => d.CELIAPP ?? 0));

            // Rapport lisible
            it('rapport', () => {
                const invested = live.CELI + live.REER + live.NON_ENREG + live.CRYPTO;
                // eslint-disable-next-line no-console
                console.log(
                    `\n[${persona.label}] users=${users.length} ` +
                    `| brut/mo=${Math.round(users.reduce((s, u) => s + (u.grossSalary || 0), 0))} ` +
                    `net/mo=${Math.round(users.reduce((s, u) => s + (u.netSalary || 0), 0))} ` +
                    `| investi(seed)=${Math.round(invested)} (CELI ${Math.round(live.CELI)}, REER ${Math.round(live.REER)}, NonReg ${Math.round(live.NON_ENREG)}, Crypto ${Math.round(live.CRYPTO)}) ` +
                    `| dettes=${debts.reduce((s, d) => s + d.balance, 0)} ` +
                    `| NW final=${Math.round(finalNW).toLocaleString('fr-CA')} ` +
                    `| minNW=${Math.round(base.minNetWorth ?? 0).toLocaleString('fr-CA')} ` +
                    `| shortfall=${((base.shortfallRate ?? 0) * 100).toFixed(0)}% ` +
                    `| CELIAPP max=${Math.round(maxCeliapp)}`,
                );
                expect(true).toBe(true);
            });

            it('DONNÉES — chaque utilisateur a net ∈ ]0, brut]', () => {
                for (const u of users) {
                    expect(Number(u.netSalary)).toBeGreaterThan(0);
                    expect(Number(u.netSalary)).toBeLessThanOrEqual(Number(u.grossSalary));
                }
            });

            it('DONNÉES — chaque dette s\'éteint (paiement min. > intérêts mensuels)', () => {
                for (const d of debts) {
                    const monthlyInterest = (d.balance * (d.interestRate / 100)) / 12;
                    expect(d.minimumPayment, `${d.name}: min ${d.minimumPayment} doit couvrir intérêts ${monthlyInterest.toFixed(0)}`).toBeGreaterThan(monthlyInterest);
                }
            });

            it('CALCUL — patrimoine successoral fini et non-NaN', () => {
                expect(Number.isFinite(finalNW)).toBe(true);
                for (const d of base.chartData) expect(Number.isFinite(d.NetWorth)).toBe(true);
            });

            it('CALCUL — shortfallRate ∈ [0, 1]', () => {
                expect(base.shortfallRate ?? 0).toBeGreaterThanOrEqual(0);
                expect(base.shortfallRate ?? 0).toBeLessThanOrEqual(1);
            });

            it('CALCUL — solde investi de départ reflète le persona (pas le portfolio par défaut)', () => {
                const investedTotal = live.CELI + live.REER + live.NON_ENREG + live.CRYPTO;
                if (assets.length === 0) {
                    // Persona sans placements : aucun solde investi (régression du bug
                    // « tout le monde hérite du portfolio du couple par défaut »).
                    expect(investedTotal).toBeLessThan(1000);
                } else {
                    expect(investedTotal).toBeGreaterThan(1000);
                }
            });
        });
    }

    // ── CONTINUITÉ PASSÉ ↔ FUTUR ───────────────────────────────────────────
    // Garde-fou contre la « falaise » : le patrimoine reconstruit juste AVANT
    // aujourd'hui (passé réel) doit ≈ le patrimoine de DÉPART de la projection.
    // Le bug (generateTestMarketData non persona-aware) faisait démarrer le futur
    // sur le portfolio du couple par défaut (~52k) pendant que le passé montrait
    // les vrais actifs du persona (ex: Diane ~890k) → discontinuité énorme.
    for (const persona of TEST_PERSONAS) {
        it(`${persona.emoji} ${persona.label} — pas de falaise entre passé et futur`, () => {
            const state = persona.build();
            const assets = (state.assets ?? []) as Asset[];
            const balances = (state.initialBalances ?? {}) as unknown as Record<string, number>;

            // Patrimoine de DÉPART du futur = chartData[0].NetWorth.
            const result = calculateFutureProjection(buildFaithfulParams(state));
            const base = (result.allResults as ProjectionResult[]).find((r) => r.stratType === 'BASE')!;
            const futureStart = base.chartData[0]?.NetWorth ?? 0;

            // Patrimoine reconstruit en fin de passé = placements (dernier point)
            // + cash actuel (identique au liquide de départ du futur).
            const minimal = assets.map((a) => ({
                symbol: a.symbol, quantity: a.quantity || 0, currency: a.currency || 'CAD',
                currentPrice: a.currentPrice || 0, accountType: a.accountType,
                dateBought: a.dateBought, purchases: a.purchases,
                priceHistory: (a.priceHistory || []).map((p) => ({ date: p.date, price: p.price })),
            }));
            const past = reconstructPortfolioHistory(minimal, {});
            const investedPast = past.points.length ? past.points[past.points.length - 1].NetWorth : 0;
            const cashNow = calcStartingCash(balances, state.transactions);
            const pastEnd = investedPast + cashNow;

            const denom = Math.max(pastEnd, futureStart, 1);
            const gap = Math.abs(pastEnd - futureStart) / denom;
            expect(
                gap,
                `${persona.label}: passé ${Math.round(pastEnd).toLocaleString('fr-CA')}$ vs futur ${Math.round(futureStart).toLocaleString('fr-CA')}$ (écart ${(gap * 100).toFixed(0)}%)`,
            ).toBeLessThan(0.2);
        });
    }

    // Contrôles ciblés par persona (valeurs métier attendues).
    it('Karim (immigré) — CELI ~20k, REER ~15k, Crypto ~8k au départ', () => {
        const k = TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build();
        const live = buildLiveCSVBalances((k.assets ?? []) as Asset[], (k.initialBalances ?? {}) as unknown as Record<string, number>);
        expect(live.CELI).toBeGreaterThan(15000);
        expect(live.REER).toBeGreaterThan(12000);
        expect(live.CRYPTO).toBeGreaterThan(6000);
    });

    it('Diane & Robert (riches) — REER de départ > 500k (décaissement)', () => {
        const d = TEST_PERSONAS.find((p) => p.id === 'pre-retraite-riche')!.build();
        const live = buildLiveCSVBalances((d.assets ?? []) as Asset[], (d.initialBalances ?? {}) as unknown as Record<string, number>);
        expect(live.REER).toBeGreaterThan(500000);
    });

    it('Maya & Liam (achat futur) — le CELIAPP s\'accumule (FHSA visible)', () => {
        const m = TEST_PERSONAS.find((p) => p.id === 'jeune-couple-dink')!.build();
        const res = calculateFutureProjection(buildFaithfulParams(m));
        const base = (res.allResults as ProjectionResult[]).find((r) => r.stratType === 'BASE')!;
        const maxCeliapp = Math.max(0, ...base.chartData.map((d: ProjectionChartPoint) => d.CELIAPP ?? 0));
        expect(maxCeliapp).toBeGreaterThan(8000);
    });
});
