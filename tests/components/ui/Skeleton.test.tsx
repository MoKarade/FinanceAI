import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton, SkeletonList } from '../../../components/ui/Skeleton';

describe('Skeleton', () => {
    it('rend avec role="status" et aria-busy pour a11y', () => {
        render(<Skeleton variant="rect" />);
        const el = screen.getByRole('status');
        expect(el).toHaveAttribute('aria-busy', 'true');
        expect(el).toHaveAttribute('aria-label', 'Chargement…');
    });

    it('applique la classe skeleton-box (shimmer)', () => {
        render(<Skeleton variant="chart" />);
        const el = screen.getByRole('status');
        expect(el.className).toMatch(/skeleton-box/);
    });

    it('variant chart applique h-[380px]', () => {
        render(<Skeleton variant="chart" />);
        const el = screen.getByRole('status');
        expect(el.className).toMatch(/h-\[380px\]/);
    });

    it('width/height custom override les variants', () => {
        render(<Skeleton variant="rect" width="200px" height="50px" />);
        const el = screen.getByRole('status');
        expect(el.style.width).toBe('200px');
        expect(el.style.height).toBe('50px');
    });
});

describe('SkeletonList', () => {
    it('rend N skeletons', () => {
        render(<SkeletonList count={5} />);
        const skeletons = screen.getAllByRole('status');
        expect(skeletons).toHaveLength(5);
    });

    it('count par défaut = 3', () => {
        render(<SkeletonList />);
        expect(screen.getAllByRole('status')).toHaveLength(3);
    });
});
