import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TransitionHeatmap from './TransitionHeatmap';

describe('TransitionHeatmap', () => {
  it('renders deterministic source-to-candidate transitions', () => {
    render(<TransitionHeatmap matrix={{ P0: { P0: 8, P1: 2 }, P1: { P0: 4, P1: 12 } }} />);
    expect(screen.getByTitle('P1 → P0: 4')).toHaveTextContent('4');
    expect(screen.getByTitle('P0 → P1: 2')).toHaveTextContent('2');
  });

  it('selects a transition, an origin or a destination when clickable', () => {
    const onSelect = vi.fn();
    const { rerender } = render(<TransitionHeatmap matrix={{ P0: { P1: 2 }, P1: { P0: 4 } }} selection={{ from: '', to: '' }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'P1 → P0: 4' }));
    expect(onSelect).toHaveBeenLastCalledWith({ from: 'P1', to: 'P0' });
    fireEvent.click(screen.getByRole('button', { name: 'To P1' }));
    expect(onSelect).toHaveBeenLastCalledWith({ from: '', to: 'P1' });
    rerender(<TransitionHeatmap matrix={{ P0: { P1: 2 }, P1: { P0: 4 } }} selection={{ from: 'P1', to: 'P0' }} onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: 'P1 → P0: 4' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'P1 → P0: 4' }));
    expect(onSelect).toHaveBeenLastCalledWith({ from: '', to: '' });
  });
});
