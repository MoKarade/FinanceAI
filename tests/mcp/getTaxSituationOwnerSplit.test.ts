// tests/mcp/getTaxSituationOwnerSplit.test.ts
//
// [FISC-SOLO-INVEST-SPLIT] get_tax_situation impose le revenu de placement chez son DÉTENTEUR
// (`Asset.owner`), plus « ÷ nombre de conjoints ». Le cas qui mordait : un couple MONO-salarié —
// l'ancien split donnait la moitié du placement au conjoint sans brut, qui est exclu de `perUser`
// (brut inconnu) → cette moitié n'était imposée nulle part, sans trace (2 342 $/an mesurés).
// Discriminant : sur l'ancien code, attribuer l'actif à user1 ne changeait RIEN au totalTax.

import { describe, it, expect } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TEST_PERSONAS } from '../../services/testPersonas';
import { normalizeAppState, type StateSource } from '../../mcp/state/loadAppState';
import { makeStateProvider } from '../../mcp/state/stateProvider';
import type { StateProvider } from '../../mcp/tools/_dataAware';
import { registerGetTaxSituation } from '../../mcp/tools/getTaxSituation.tool';
import type { AppState, Asset, AssetOwner } from '../../types';

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

function captureTool(register: (s: McpServer, getState: StateProvider) => void, getState: StateProvider): Handler {
    let captured: Handler | null = null;
    const fake = { tool: (_n: string, _d: string, _s: unknown, cb: Handler) => { captured = cb; } } as unknown as McpServer;
    register(fake, getState);
    if (!captured) throw new Error('aucun handler capturé');
    return captured;
}
async function callJson(handler: Handler, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await handler(args);
    expect(res.isError).toBeFalsy();
    return JSON.parse(res.content[0].text);
}
function providerFor(state: AppState): StateProvider {
    const src: StateSource = { description: 'fixture', loadRaw: async () => JSON.stringify(state) };
    return makeStateProvider(src, { ttlMs: 0 });
}
const karim = (): AppState => normalizeAppState(TEST_PERSONAS.find((p) => p.id === 'karim-immigre')!.build());

const NON_REG_200K = (owner?: AssetOwner): Asset => ({
    symbol: 'ZZZ', name: 'NonReg', quantity: 1, currentPrice: 200_000, currency: 'CAD', performance: 0,
    dateBought: '2025-01-01', accountType: 'NON-ENREG', ...(owner ? { owner } : {}),
} as Asset);

/** Couple MONO-salarié : A gagne 60 k$/an brut, B est nommée mais sans aucun salaire. */
function coupleMonoSalarie(owner?: AssetOwner, avecB = true): AppState {
    const base = karim();
    const a = { ...base.config.users[0], name: 'A', grossSalary: 5000, netSalary: 3800, rrspContributed: 0, fhsaBalance: 0 };
    const b = { ...(base.config.users[1] ?? base.config.users[0]), name: 'B', grossSalary: 0, netSalary: 0, rrspContributed: 0, fhsaBalance: 0 };
    base.config.users = (avecB ? [a, b] : [a]) as typeof base.config.users;
    return { ...base, fxRates: { ...base.fxRates, CAD: 1 }, assets: [NON_REG_200K(owner)] };
}
const run = (s: AppState) => callJson(captureTool(registerGetTaxSituation, providerFor(s)), { year: 2026 });

describe('[FISC-SOLO-INVEST-SPLIT] get_tax_situation — le placement est imposé chez son détenteur', () => {
    it('actif attribué à A (user1) : imposé EN ENTIER chez A — même impôt que si A vivait seul avec cet actif', async () => {
        const couple = await run(coupleMonoSalarie('user1'));
        const solo = await run(coupleMonoSalarie(undefined, false));
        expect(couple.totalTax as number).toBeGreaterThan(0);
        expect(couple.totalTax).toBe(solo.totalTax);
        expect(couple.taxableInvestmentIncome).toBe(solo.taxableInvestmentIncome);
        // B n'est pas dans perUser (aucun brut) et n'a AUCUNE part à taire : pas d'entrée d'omission.
        const perUser = couple.perUser as Array<{ name: string }>;
        expect(perUser.map((u) => u.name)).toEqual(['A']);
        expect(couple.perUserOmitted).toEqual([]);
    });

    it('DISCRIMINANT : attribuer l\'actif à A coûte PLUS d\'impôt que le laisser commun (l\'ancien code rendait les deux identiques)', async () => {
        const attribue = await run(coupleMonoSalarie('user1'));
        const commun = await run(coupleMonoSalarie(undefined));
        // Commun = moitié chez B, qui n'a pas de brut → sa moitié n'est pas dans le payload.
        expect((attribue.totalTax as number) - (commun.totalTax as number)).toBeGreaterThan(1_000);
        expect(attribue.taxableInvestmentIncome as number).toBeGreaterThan(commun.taxableInvestmentIncome as number);
    });

    it('actif COMMUN et conjoint sans brut : sa part est NOMMÉE dans perUserOmitted avec son montant (jamais tue)', async () => {
        const commun = await run(coupleMonoSalarie(undefined));
        const omitted = commun.perUserOmitted as Array<{ name: string; reason: string }>;
        expect(omitted).toHaveLength(1);
        expect(omitted[0].name).toBe('B');
        expect(omitted[0].reason).toContain('aucun salaire saisi');
        expect(omitted[0].reason).toMatch(/part de revenu de placement estimé \(\d+ \$, détention réelle\) n'est PAS imposée/);
        // Le montant nommé est la moitié de ce qu'A déclare (commun = moitié-moitié).
        const montant = Number(/\((\d+) \$/.exec(omitted[0].reason)?.[1]);
        expect(montant).toBeGreaterThan(0);
        expect(Math.abs(montant - (commun.taxableInvestmentIncome as number))).toBeLessThanOrEqual(1);
    });

    it('couple à DEUX salaires, actif commun : chacun sa moitié — rien ne change par rapport à avant (contrôle)', async () => {
        const s = coupleMonoSalarie(undefined);
        s.config.users = [s.config.users[0], { ...s.config.users[1], grossSalary: 5000, netSalary: 3800 }] as typeof s.config.users;
        const out = await run(s);
        const perUser = out.perUser as Array<{ name: string; totalTax: number }>;
        expect(perUser).toHaveLength(2);
        expect(perUser[0].totalTax).toBe(perUser[1].totalTax); // symétrie : même salaire, même moitié
        expect(out.perUserOmitted).toEqual([]);
    });
});
