import { NamedScoringProfile, ScoringPreset, ScoringScope } from '../../api/client';

// Successive weights use graduated neutral-blue shades; they are not priorities.
const WEIGHT_SHADES = ['bg-accent-800', 'bg-accent-600', 'bg-accent-400', 'bg-accent-200', 'bg-gray-400'];
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
    <div className="space-y-1.5" aria-label="Scoring weight signature">
      {rows.map(({ stage, profile: item }) => {
        const weights = profileWeights(item);
        const total = weights.reduce((sum, value) => sum + value, 0) || 1;
        return (
          <div key={stage} className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {STAGE_LABELS[stage]}
            </span>
            <div className="flex h-2 gap-px overflow-hidden bg-gray-100">
              {weights.map((weight, index) => (
                <span
                  key={`${stage}-${index}`}
                  className={WEIGHT_SHADES[index % WEIGHT_SHADES.length]}
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
