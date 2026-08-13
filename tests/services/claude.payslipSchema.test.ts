// tests/services/claude.payslipSchema.test.ts
// [AI-PAYSLIP-SCHEMA-UNBOUNDED] — `PayslipSchema` acceptait `z.number()` NU : Infinity et les
// négatifs hallucinés par la Vision passaient Zod, puis étaient MULTIPLIÉS par la fréquence
// (×12 à ×52) avant d'atterrir dans le profil salarial (fiscalité + projection). Le reste du dépôt
// impose « .finite() OBLIGATOIRE sur tout montant » (cf. mcp/tools/applyPayslip.spec.ts).
//
// Bout-en-bout avec le SDK Anthropic MOCKÉ : c'est la SEULE façon d'exercer le schéma réel
// (il n'est pas exporté) — un test sur une copie du schéma ne prouverait rien.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    nextResponseText: '{}',
}));

vi.mock('@anthropic-ai/sdk', () => ({
    default: class {
        messages = {
            create: vi.fn(async () => ({
                content: [{ type: 'text', text: mocks.nextResponseText }],
            })),
        };
    },
}));

import { analyzePayslip } from '../../services/claude';

const file = () => new File(['fiche'], 'paie.png', { type: 'image/png' });

const respond = (payload: Record<string, unknown>) => {
    mocks.nextResponseText = JSON.stringify(payload);
};

const BASE = { grossPeriod: 3000, netPeriod: 2100, taxPeriod: 700, rrspPeriod: 200, frequency: 'Bi-Weekly' };

describe('[AI-PAYSLIP-SCHEMA-UNBOUNDED] bornes du schéma de fiche de paie', () => {
    beforeEach(() => { mocks.nextResponseText = '{}'; });

    it('une paie normale passe (non-régression)', async () => {
        respond(BASE);
        await expect(analyzePayslip(file(), 'sk-test')).resolves.toMatchObject({ grossPeriod: 3000, netPeriod: 2100 });
    });

    it('impôt et REER à 0 restent VALIDES (paie sans retenue / sans REER collectif)', async () => {
        // Choix `.nonnegative()` et non `.positive()` sur ces deux champs : 0 est un cas RÉEL.
        // Les exiger positifs rejetterait des talons parfaitement valides.
        respond({ ...BASE, taxPeriod: 0, rrspPeriod: 0 });
        await expect(analyzePayslip(file(), 'sk-test')).resolves.toMatchObject({ taxPeriod: 0, rrspPeriod: 0 });
    });

    it('Infinity sur le brut est REJETÉ (avant : ×26 = Infinity dans le profil salarial)', async () => {
        // JSON.stringify(Infinity) → "null" : on injecte le littéral à la main pour reproduire ce
        // qu'un modèle peut réellement écrire.
        mocks.nextResponseText = '{"grossPeriod": 1e999, "netPeriod": 2100, "taxPeriod": 700, "rrspPeriod": 200, "frequency": "Bi-Weekly"}';
        await expect(analyzePayslip(file(), 'sk-test')).rejects.toThrow(/JSON invalide/i);
    });

    it('brut NÉGATIF rejeté, brut ZÉRO rejeté', async () => {
        respond({ ...BASE, grossPeriod: -3000 });
        await expect(analyzePayslip(file(), 'sk-test')).rejects.toThrow(/JSON invalide/i);
        respond({ ...BASE, grossPeriod: 0 });
        await expect(analyzePayslip(file(), 'sk-test')).rejects.toThrow(/JSON invalide/i);
    });

    it('net NÉGATIF rejeté (un net < 0 inverserait le signe du salaire stocké)', async () => {
        respond({ ...BASE, netPeriod: -2100 });
        await expect(analyzePayslip(file(), 'sk-test')).rejects.toThrow(/JSON invalide/i);
    });

    it('impôt/REER NÉGATIFS rejetés (une retenue négative CRÉE de l\'argent)', async () => {
        respond({ ...BASE, taxPeriod: -700 });
        await expect(analyzePayslip(file(), 'sk-test')).rejects.toThrow(/JSON invalide/i);
        respond({ ...BASE, rrspPeriod: -200 });
        await expect(analyzePayslip(file(), 'sk-test')).rejects.toThrow(/JSON invalide/i);
    });
});
