import { useEffect, useState } from 'react';
import { Copy, Save, Trash2 } from 'lucide-react';
import {
  NamedScoringProfile,
  ScoringPreset,
  ScoringStage,
  cloneNamedProfile,
  createScoringPreset,
  deleteNamedProfile,
  fetchNamedProfiles,
} from '../api/client';
import { getErrorMessage } from '../lib/utils';

const stages: Array<{ id: ScoringStage; label: string }> = [
  { id: 'vulnerability', label: 'Vulnerability profile' },
  { id: 'asset', label: 'Asset profile' },
  { id: 'finding', label: 'Finding profile' },
];

export default function ProfileManager({ activePreset, onChanged }: { activePreset?: ScoringPreset; onChanged: () => Promise<void> }) {
  const [profiles, setProfiles] = useState<NamedScoringProfile[]>([]);
  const [selected, setSelected] = useState<Record<ScoringStage, string>>({ vulnerability: '', asset: '', finding: '' });
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const values = await fetchNamedProfiles();
    setProfiles(values);
    if (activePreset) setSelected({
      vulnerability: activePreset.vulnerability_profile_id,
      asset: activePreset.asset_profile_id,
      finding: activePreset.finding_profile_id,
    });
  };
  useEffect(() => { load().catch((e) => setError(getErrorMessage(e))); }, [activePreset?.id]);

  const savePreset = async () => {
    const name = window.prompt('Preset name', 'Custom scenario');
    if (!name) return;
    try {
      await createScoringPreset({ name, description: 'Custom scoring scenario', vulnerability_profile_id: selected.vulnerability, asset_profile_id: selected.asset, finding_profile_id: selected.finding });
      await onChanged();
    } catch (e) { setError(getErrorMessage(e)); }
  };

  const clone = async (profile: NamedScoringProfile) => {
    const name = window.prompt('Profile name', `${profile.name} copy`);
    if (!name) return;
    try { await cloneNamedProfile(profile.id, name); await load(); }
    catch (e) { setError(getErrorMessage(e)); }
  };

  const remove = async (profile: NamedScoringProfile) => {
    if (profile.is_builtin || !window.confirm(`Delete ${profile.name}?`)) return;
    try { await deleteNamedProfile(profile.id); await load(); }
    catch (e) { setError(getErrorMessage(e)); }
  };

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label-caps">Profile library</span>
        <span className="text-xs text-gray-500">Combine stage profiles and save them as a reusable preset.</span>
      </div>
      {error && <div className="notice-error mt-2">{error}</div>}
      <div className="mt-1.5 grid gap-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto] lg:items-end">
        {stages.map((stage) => {
          const values = profiles.filter((profile) => profile.stage === stage.id);
          const current = values.find((profile) => profile.id === selected[stage.id]);
          return (
            <div key={stage.id} className="min-w-0">
              <label className="block text-[11px] font-medium text-gray-600" htmlFor={`profile-${stage.id}`}>{stage.label}</label>
              <div className="mt-1 flex">
                <select
                  id={`profile-${stage.id}`}
                  value={selected[stage.id]}
                  onChange={(event) => setSelected((value) => ({ ...value, [stage.id]: event.target.value }))}
                  className="field min-w-0 flex-1 rounded-r-none"
                >
                  {values.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.is_builtin ? ' · locked' : ` · r${profile.revision}`}</option>)}
                </select>
                <button onClick={() => current && clone(current)} disabled={!current} className="-ml-px border border-gray-300 bg-white px-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40" title="Clone profile" aria-label={`Clone ${stage.label.toLowerCase()}`}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => current && remove(current)} disabled={!current || current.is_builtin} className="-ml-px rounded-r-sm border border-gray-300 bg-white px-2 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40" title={current?.is_builtin ? 'Built-in profiles cannot be deleted' : 'Delete profile'} aria-label={`Delete ${stage.label.toLowerCase()}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        <button onClick={savePreset} disabled={stages.some((stage) => !selected[stage.id])} className="btn-secondary">
          <Save className="h-3.5 w-3.5" />Save as preset
        </button>
      </div>
    </div>
  );
}
