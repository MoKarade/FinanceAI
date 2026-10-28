import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionHeader } from '../../../components/ui/SectionHeader';

describe('SectionHeader', () => {
    it('renders the title as a heading', () => {
        render(<SectionHeader title="My Section" />);
        expect(screen.getByRole('heading', { name: 'My Section' })).toBeInTheDocument();
    });

    it('renders the subtitle when provided', () => {
        render(<SectionHeader title="T" subtitle="more context" />);
        expect(screen.getByText('more context')).toBeInTheDocument();
    });

    it('renders the action area when provided', () => {
        render(<SectionHeader title="T" action={<button>Go</button>} />);
        expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    });

    it('applies the display level class', () => {
        render(<SectionHeader title="Page" level="display" />);
        const heading = screen.getByRole('heading', { name: 'Page' });
        expect(heading.className).toMatch(/text-display/);
    });
});
