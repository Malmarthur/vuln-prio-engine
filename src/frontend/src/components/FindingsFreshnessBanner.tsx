import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FindingFreshness, FindingFreshnessReason, fetchFindingFreshness } from '../api/client';
import { affectsScores, progressText, useActiveTask, useActivity, useActivityFinished } from '../lib/activity';

const REASON_TEXT: Record<FindingFreshnessReason, string> = {
  never_matched: 'Assets and vulnerabilities have never been matched.',
  vulnerabilities_updated: 'NVD data changed since the last matching run.',
  assets_updated: 'Assets changed since the last matching run.',
  findings_unscored: 'Some findings have no priority score.',
};

const POLL_MS = 30_000;

/**
 * Warns when findings lag behind their inputs and offers the missing steps
 * (matching, then scoring) as one background job. Matching stays an explicit
 * action because it can invalidate the detail rows of earlier comparisons.
 */
export default function FindingsFreshnessBanner({ onOpenFindings }: { onOpenFindings?: () => void }) {
  const [freshness, setFreshness] = useState<FindingFreshness | null>(null);
  const { startMatching, startScoring } = useActivity();
  const running = useActiveTask((task) => task.kind === 'matching' || (task.kind === 'run' && task.scope === 'preset'));

  const refresh = useCallback(() => {
    fetchFindingFreshness().then(setFreshness).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useActivityFinished(affectsScores, refresh);

  if (!freshness || (!freshness.matching_stale && !freshness.scoring_stale && !running)) return null;

  const reasons = freshness.reasons.map((reason) => reason === 'findings_unscored' && freshness.unscored_findings
    ? `${freshness.unscored_findings.toLocaleString()} findings have no priority score.`
    : REASON_TEXT[reason]);
  const label = freshness.matching_stale ? 'Match & score findings' : 'Score findings';

  return (
    <div className="notice-warning mb-4 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="status">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          {running ? (
            <>
              <div className="font-semibold">{running.title} in progress</div>
              <div className="mt-1 flex items-center gap-3 text-xs">
                <div className="h-1.5 w-full max-w-sm overflow-hidden bg-amber-100">
                  <div className="h-full bg-amber-600 transition-[width] duration-700" style={{ width: `${Math.max(running.progress ?? 0, 2)}%` }} />
                </div>
                <span className="shrink-0 font-mono">{progressText(running)}</span>
                <span className="truncate text-amber-800">{running.label}</span>
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold">{freshness.matching_stale ? 'Findings are out of date' : 'Finding scores are incomplete'}</div>
              <div className="text-xs">{reasons.join(' ')} {freshness.last_matched_at && <span className="text-amber-800">Last matching: {new Date(freshness.last_matched_at).toLocaleString()}.</span>}</div>
            </>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onOpenFindings && <button onClick={onOpenFindings} className="btn-ghost btn-sm">Open findings</button>}
        {!running && (
          <button onClick={() => (freshness.matching_stale ? startMatching(true) : startScoring('preset'))} className="btn-secondary btn-sm">
            <RefreshCw className="h-3.5 w-3.5" />
            {label}
          </button>
        )}
      </div>
    </div>
  );
}
