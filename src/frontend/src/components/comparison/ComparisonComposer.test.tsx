import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NamedScoringProfile, ScoringPreset } from '../../api/client';
import ComparisonComposer from './ComparisonComposer';
import { EMPTY_POPULATION } from './filters';

const mocks = vi.hoisted(() => ({ previewComparisonSubset: vi.fn() }));
vi.mock('../../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  ...mocks,
}));

const extra = { population: EMPTY_POPULATION, onPopulationChange: vi.fn(), followedCount: 0, changed: new Map<string, string[]>() };

const profile = (id: string, stage: NamedScoringProfile['stage']): NamedScoringProfile => ({
  id, stage, name: `${stage} profile`, description: '', revision: 1, is_builtin: true,
  created_at: '', updated_at: '',
  config: stage === 'finding'
    ? { thresholds: { P0: 76, P1: 51, P2: 26, P3: 0 }, weights: { vulnerability_priority: 50, asset_priority: 50 } }
    : stage === 'asset'
      ? { thresholds: { A0: 76, A1: 51, A2: 26, A3: 0 }, weights: { internet_exposure: 40, business_criticality: 40, patch_complexity: 20 }, values: { internet_exposure: { internet: 100, internal: 45, isolated: 10, unknown: 65 }, business_criticality: { critical: 100, high: 75, medium: 45, low: 15, unknown: 65 }, patch_complexity: { high: 100, medium: 55, low: 20, unknown: 65 } } }
      : { thresholds: { V0: 76, V1: 51, V2: 26, V3: 0 }, columns: {} },
});
const profiles = [profile('v', 'vulnerability'), profile('a', 'asset'), profile('f', 'finding')];
const presets: ScoringPreset[] = [
  { id: 'base', name: 'Balanced', description: 'Reference', context_id: 'c1', vulnerability_profile_id: 'v', asset_profile_id: 'a', finding_profile_id: 'f', is_builtin: true, is_active: true, created_at: '', updated_at: '' },
  { id: 'candidate', name: 'Active Exploitation', description: 'Candidate', context_id: 'c2', vulnerability_profile_id: 'v', asset_profile_id: 'a', finding_profile_id: 'f', is_builtin: true, is_active: false, created_at: '', updated_at: '' },
];

describe('ComparisonComposer', () => {
  it('removes a candidate without changing the reference', () => {
    const onCandidatesChange = vi.fn();
    const onBaselineChange = vi.fn();
    render(<ComparisonComposer scope="preset" onScopeChange={vi.fn()} options={presets} baselineId="base" onBaselineChange={onBaselineChange} candidateIds={['candidate']} onCandidatesChange={onCandidatesChange} profiles={profiles} running={false} onRun={vi.fn()} {...extra} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Active Exploitation' }));
    expect(onCandidatesChange).toHaveBeenCalledWith([]);
    expect(onBaselineChange).not.toHaveBeenCalled();
  });

  it('keeps advanced scopes available but secondary', () => {
    const onScopeChange = vi.fn();
    render(<ComparisonComposer scope="preset" onScopeChange={onScopeChange} options={presets} baselineId="base" onBaselineChange={vi.fn()} candidateIds={['candidate']} onCandidatesChange={vi.fn()} profiles={profiles} running={false} onRun={vi.fn()} {...extra} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assets' }));
    expect(onScopeChange).toHaveBeenCalledWith('asset');
  });

  it('flags scenarios changed since the loaded run', () => {
    render(<ComparisonComposer scope="preset" onScopeChange={vi.fn()} options={presets} baselineId="base" onBaselineChange={vi.fn()} candidateIds={['candidate']} onCandidatesChange={vi.fn()} profiles={profiles} running={false} onRun={vi.fn()} {...extra} changed={new Map([['candidate', ['Asset profile revised (r1 → r2)']]])} />);
    expect(screen.getByText('Changed since last run')).toHaveAttribute('title', 'Asset profile revised (r1 → r2)');
  });

  it('defines a subset population and previews its size', async () => {
    mocks.previewComparisonSubset.mockResolvedValue({ count: 12, total: 40 });
    const onPopulationChange = vi.fn();
    const subset = { mode: 'subset' as const, attributes: { ...EMPTY_POPULATION.attributes, kev: 'true' as const }, entityIds: [] };
    render(<ComparisonComposer scope="preset" onScopeChange={vi.fn()} options={presets} baselineId="base" onBaselineChange={vi.fn()} candidateIds={['candidate']} onCandidatesChange={vi.fn()} profiles={profiles} running={false} onRun={vi.fn()} {...extra} population={subset} onPopulationChange={onPopulationChange} />);
    expect(await screen.findByText('12 of 40 findings')).toBeInTheDocument();
    expect(mocks.previewComparisonSubset).toHaveBeenCalledWith('preset', { kev: true }, expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'All findings' }));
    await waitFor(() => expect(onPopulationChange).toHaveBeenCalledWith(expect.objectContaining({ mode: 'all' })));
  });
});
