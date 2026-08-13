import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ComparisonSummary, NamedScoringProfile, ScoringPreset } from '../../api/client';
import ComparisonWorkspace from './ComparisonWorkspace';

const mocks = vi.hoisted(() => ({
  fetchScoringPresets: vi.fn(),
  fetchNamedProfiles: vi.fn(),
  fetchComparisonHistory: vi.fn(),
  fetchScoringJob: vi.fn(),
  fetchComparisonSummary: vi.fn(),
  startScoringComparison: vi.fn(),
  cancelScoringJob: vi.fn(),
}));

vi.mock('../../api/client', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/client')>(),
  ...mocks,
}));

const profiles: NamedScoringProfile[] = [
  { id: 'v', stage: 'vulnerability', name: 'Balanced', description: '', config: { thresholds: { V0: 76, V1: 51, V2: 26, V3: 0 }, columns: {} }, revision: 1, is_builtin: true, created_at: '', updated_at: '' },
  { id: 'a', stage: 'asset', name: 'Balanced', description: '', config: { thresholds: { A0: 76, A1: 51, A2: 26, A3: 0 }, weights: { internet_exposure: 40, business_criticality: 40, patch_complexity: 20 }, values: { internet_exposure: { internet: 100, internal: 45, isolated: 10, unknown: 65 }, business_criticality: { critical: 100, high: 75, medium: 45, low: 15, unknown: 65 }, patch_complexity: { high: 100, medium: 55, low: 20, unknown: 65 } } }, revision: 1, is_builtin: true, created_at: '', updated_at: '' },
  { id: 'f', stage: 'finding', name: 'Balanced', description: '', config: { thresholds: { P0: 76, P1: 51, P2: 26, P3: 0 }, weights: { vulnerability_priority: 50, asset_priority: 50 } }, revision: 1, is_builtin: true, created_at: '', updated_at: '' },
];
const presets: ScoringPreset[] = [
  { id: 'active', name: 'Current configuration', description: 'Reference', context_id: 'c1', vulnerability_profile_id: 'v', asset_profile_id: 'a', finding_profile_id: 'f', is_builtin: false, is_active: true, created_at: '', updated_at: '' },
  { id: 'candidate', name: 'Balanced', description: 'Candidate', context_id: 'c2', vulnerability_profile_id: 'v', asset_profile_id: 'a', finding_profile_id: 'f', is_builtin: true, is_active: false, created_at: '', updated_at: '' },
];
const summary: ComparisonSummary = {
  job_id: 'job-1', scope: 'preset', status: 'completed', progress: 100, progress_detail: { phase: 'completed' },
  baseline: { id: 'active', name: 'Current configuration', description: '', revision: null, profile_revisions: {}, distribution: { P1: 10 } },
  candidates: [{ id: 'candidate', name: 'Balanced', description: '', revision: null, profile_revisions: {}, distribution: { P0: 2, P1: 8 }, transition_matrix: { P1: { P0: 2, P1: 8 } }, promoted: 2, demoted: 0, unchanged: 8, mean_score_delta: 2, median_score_delta: 1, spearman_rank_correlation: 0.9 }],
  dataset_watermark: {}, is_stale: true, is_inconsistent: false, details_available: false,
  created_at: '2026-08-13T12:00:00Z', started_at: '2026-08-13T12:00:00Z', finished_at: '2026-08-13T12:01:00Z', error: null,
};

describe('ComparisonWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/?tab=compare');
    mocks.fetchScoringPresets.mockResolvedValue(presets);
    mocks.fetchNamedProfiles.mockResolvedValue(profiles);
    mocks.fetchComparisonHistory.mockResolvedValue([]);
  });

  it('preselects the active reference and built-in candidates for a two-action first run', async () => {
    mocks.startScoringComparison.mockResolvedValue({ id: 'job-new', kind: 'comparison', scope: 'preset', status: 'pending', progress: 0, progress_detail: { phase: 'queued' }, request: {}, error: null, cancel_requested: false, created_at: '', started_at: null, finished_at: null });
    render(<ComparisonWorkspace onManageProfiles={vi.fn()} />);
    const run = await screen.findByRole('button', { name: 'Run comparison' });
    expect(screen.getByText('Current configuration', { selector: '.text-base' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Balanced', level: 3 })).toBeInTheDocument();
    fireEvent.click(run);
    await waitFor(() => expect(mocks.startScoringComparison).toHaveBeenCalledWith('preset', 'active', ['candidate']));
  });

  it('restores a completed job from the URL and exposes stale-state recovery', async () => {
    window.history.replaceState({}, '', '/?tab=compare&job=job-1');
    mocks.fetchScoringJob.mockResolvedValue({ id: 'job-1', kind: 'comparison', scope: 'preset', status: 'completed', progress: 100, progress_detail: { phase: 'completed' }, request: {}, error: null, cancel_requested: false, created_at: '', started_at: '', finished_at: '' });
    mocks.fetchComparisonSummary.mockResolvedValue(summary);
    render(<ComparisonWorkspace onManageProfiles={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: 'Where priorities move' })).toBeInTheDocument();
    expect(screen.getByText('This comparison uses older source data')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-run with current data' })).toBeInTheDocument();
  });
});
