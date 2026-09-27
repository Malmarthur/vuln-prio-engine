import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  FindingFreshness,
  FindingFreshnessReason,
  fetchFindingFreshness,
  runFindingMatching,
  runFindingScoring,
} from '../api/client';
import { getErrorMessage } from '../lib/utils';

const REASON_TEXT: Record<FindingFreshnessReason, string> = {
  never_matched: 'Assets and vulnerabilities have never been matched.',
  vulnerabilities_updated: 'NVD data changed since the last matching run.',
  assets_updated: 'Assets changed since the last matching run.',
  findings_unscored: 'Some findings have no priority score.',
};

const POLL_MS = 30_000;

/**
 * Warns when findings lag behind their inputs and offers the missing steps
 * (matching, then scoring). Matching stays an explicit action because it can
 * invalidate the detail rows of earlier comparisons.
 */
export default function FindingsFreshnessBanner({ onUpdated, onOpenFindings }: { onUpdated: () => void; onOpenFindings?: () => void }) {
  const [freshness, setFreshness] = useState<FindingFreshness | null>(null);
  const [running, setRunning] = useState<'matching' | 'scoring' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchFindingFreshness().then(setFreshness).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!freshness || (!freshness.matching_stale && !freshness.scoring_stale)) return null;

  const run = async () => {
    setError(null);
    try {
      if (freshness.matching_stale) {
        setRunning('matching');
        await runFindingMatching();
      }
      setRunning('scoring');
      await runFindingScoring();
      onUpdated();
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setRunning(null);
      refresh();
    }
  };

  const reasons = freshness.reasons.map((reason) => reason === 'findings_unscored' && freshness.unscored_findings
    ? `${freshness.unscored_findings.toLocaleString()} findings have no priority score.`
    : REASON_TEXT[reason]);
  const label = freshness.matching_stale ? 'Match & score findings' : 'Score findings';

  return (
    <div className="notice-warning mb-4 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="status">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div>
          <div className="font-semibold">{freshness.matching_stale ? 'Findings are out of date' : 'Finding scores are incomplete'}</div>
          <div className="text-xs">{reasons.join(' ')} {freshness.last_matched_at && <span className="text-amber-800">Last matching: {new Date(freshness.last_matched_at).toLocaleString()}.</span>}</div>
          {error && <div className="mt-1 text-xs text-red-700">{error}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onOpenFindings && <button onClick={onOpenFindings} className="btn-ghost btn-sm">Open findings</button>}
        <button onClick={run} disabled={running !== null} className="btn-secondary btn-sm">
          <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
          {running === 'matching' ? 'Matching…' : running === 'scoring' ? 'Scoring…' : label}
        </button>
      </div>
    </div>
  );
}
