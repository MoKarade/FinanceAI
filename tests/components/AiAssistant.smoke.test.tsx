// CA-04 — smoke test : AiAssistant (aucun test direct jusqu'ici). chatStream (réseau) mocké.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { AiAssistant } from '../../components/AiAssistant';
import type { ProjectionConfig, BudgetConfig, User } from '../../types';

vi.mock('../../services/claude', () => ({
    chatStream: vi.fn(),
    getRebalanceJustifications: vi.fn(),
}));

const proj = {
    years: 30, returnRate: 6, inflationRate: 2, savingsMode: 'manual', manualContribution: 0,
    usePortfolioRate: false, returnRates: { celi: 7, reer: 6.5, nonReg: 6.5, crypto: 10, cash: 3 },
    emergencyFundMonths: 6, salaryGrowth: 2, propertyGrowthRate: 3,
} as unknown as ProjectionConfig;
const config: BudgetConfig = {
    users: [
        { name: 'Marc', grossSalary: 7000, netSalary: 5000, color: '#10b981', age: 35, birthYear: 1991, canadaArrivalYear: 1991, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
        { name: 'Anna', grossSalary: 5500, netSalary: 4000, color: '#3b82f6', age: 33, birthYear: 1993, canadaArrivalYear: 1993, hasOwnedPropertyLast4Years: false, celiContributed: 0, rrspContributed: 0 } as unknown as User,
    ],
    splitMode: '50/50',
};

describe('AiAssistant — smoke (CA-04)', () => {
    it('rend sans crash (conversation vide)', () => {
        const { container } = render(
            <AiAssistant apiKey="" transactions={[]} budgetItems={[]} assets={[]}
                projection={proj} config={config} initialBalances={{}} />,
        );
        expect(container).toBeTruthy();
    });
});
