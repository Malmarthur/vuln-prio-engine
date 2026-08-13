import { NamedScoringProfile, ScoringPreset, ScoringScope } from '../../api/client';

const STAGE_LABELS = { vulnerability: 'Vuln', asset: 'Asset', finding: 'Finding' } as const;

function profileWeights(profile?: NamedScoringProfile): number[] {
  if (!profile) return [];
  if (profile.stage === 'vulnerability' && 'columns' in profile.config) {
    return Object.values(profile.config.columns).filter((item) => item.enabled).map((item) => item.weight);
  }
  if ('weights' in profile.config) return Object.values(profile.config.weights);
  return [];
}

export default function ScenarioSignature({
  scope,
  preset,
  profile,
  profiles,
}: {
  scope: ScoringScope;
  preset?: ScoringPreset;
  profile?: NamedScoringProfile;
  profiles: NamedScoringProfile[];
}) {
  const rows = scope === 'preset' && preset
    ? (['vulnerability', 'asset', 'finding'] as const).map((stage) => {
        const id = preset[`${stage}_profile_id`];
        return { stage, profile: profiles.find((item) => item.id === id) };
      })
    : profile ? [{ stage: profile.stage, profile }] : [];

  return (
    <div className="space-y-2" aria-label="Scoring weight signature">
      {rows.map(({ stage, profile: item }) => {
        const weights = profileWeights(item);
        const total = weights.reduce((sum, value) => sum + value, 0) || 1;
        return (
          <div key={stage} className="grid grid-cols-[82px_1fr] items-center gap-2">
            <span className="truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {STAGE_LABELS[stage]}
            </span>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
              {weights.map((weight, index) => (
                <span
                  key={`${stage}-${index}`}
                  className={['bg-indigo-600', 'bg-violet-400', 'bg-sky-400', 'bg-cyan-400'][index % 4]}
                  style={{ width: `${(weight / total) * 100}%` }}
                  title={`${weight}%`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
