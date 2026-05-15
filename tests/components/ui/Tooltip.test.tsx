import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tooltip } from '../../../components/ui/Tooltip';

describe('Tooltip', () => {
    it('does not render the tooltip content initially', () => {
        render(<Tooltip content="Help!"><button>Trigger</button></Tooltip>);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('shows tooltip after delay on mouse enter', async () => {
        render(<Tooltip content="Help!" delay={0}><button>Trigger</button></Tooltip>);
        const trigger = screen.getByRole('button');
        fireEvent.mouseEnter(trigger.parentElement!);
        // delay=0 → résolu après le prochain tick
        await new Promise(r => setTimeout(r, 5));
        expect(screen.getByRole('tooltip')).toHaveTextContent('Help!');
    });

    it('hides tooltip on mouse leave', async () => {
        render(<Tooltip content="Help!" delay={0}><button>Trigger</button></Tooltip>);
        const wrapper = screen.getByRole('button').parentElement!;
        fireEvent.mouseEnter(wrapper);
        await new Promise(r => setTimeout(r, 5));
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
        fireEvent.mouseLeave(wrapper);
        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    });

    it('shows tooltip on keyboard focus', async () => {
        render(<Tooltip content="Help!" delay={0}><button>Trigger</button></Tooltip>);
        const wrapper = screen.getByRole('button').parentElement!;
        fireEvent.focus(wrapper);
        await new Promise(r => setTimeout(r, 5));
        expect(screen.getByRole('tooltip')).toBeInTheDocument();
    });
});
