import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TransitionHeatmap from './TransitionHeatmap';

describe('TransitionHeatmap', () => {
  it('renders deterministic source-to-candidate transitions', () => {
    render(<TransitionHeatmap matrix={{ P0: { P0: 8, P1: 2 }, P1: { P0: 4, P1: 12 } }} />);
    expect(screen.getByTitle('P1 → P0: 4')).toHaveTextContent('4');
    expect(screen.getByTitle('P0 → P1: 2')).toHaveTextContent('2');
  });
});
