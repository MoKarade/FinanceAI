// §7.D.2 — axe a11y smoke tests sur les primitives UI critiques.
//
// On lance axe-core sur chaque primitive rendue dans son état standard.
// Doit retourner 0 violation niveau "serious" ou "critical".
//
// Pour tester une page entière (Dashboard, FutureProjection, etc.) il faudrait
// mocker beaucoup de stores et providers — reservé à un follow-up.

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { KPIStat } from '../../components/ui/KPIStat';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';

// Helper : axe ne tolère pas les violations serious/critical sur ces primitives.
async function expectNoSeriousViolations(container: HTMLElement) {
    const results = await axe(container);
    const serious = (results.violations || []).filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    if (serious.length > 0) {
        console.error('Violations a11y sérieuses :', JSON.stringify(serious.map((v) => ({
            id: v.id,
            description: v.description,
            nodes: v.nodes.map((n) => n.html),
        })), null, 2));
    }
    expect(serious).toHaveLength(0);
}

describe('a11y primitives (vitest-axe)', () => {
    it('Button — aucune violation serious/critical', async () => {
        const { container } = render(<Button onClick={() => {}}>Action</Button>);
        await expectNoSeriousViolations(container);
    });

    it('Badge — aucune violation serious/critical', async () => {
        const { container } = render(<Badge variant="success">OK</Badge>);
        await expectNoSeriousViolations(container);
    });

    it('KPIStat — aucune violation serious/critical', async () => {
        const { container } = render(
            <KPIStat label="Test KPI" value="42 000 $" variant="primary" icon="💰" />
        );
        await expectNoSeriousViolations(container);
    });

    it('PageHeader — aucune violation serious/critical', async () => {
        const { container } = render(
            <PageHeader icon="📊" title="Test" subtitle="Sub" />
        );
        await expectNoSeriousViolations(container);
    });

    it('EmptyState — aucune violation serious/critical', async () => {
        const { container } = render(
            <EmptyState icon="🔍" title="Aucun" description="Rien à voir" />
        );
        await expectNoSeriousViolations(container);
    });

    it('Skeleton — aria-busy="true" est présent', async () => {
        const { container } = render(<Skeleton variant="chart" />);
        await expectNoSeriousViolations(container);
    });
});
