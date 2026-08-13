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

  return <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Profile library</h3><p className="text-sm text-gray-500">Mix stage profiles and save the combination as a reusable preset.</p></div><button onClick={savePreset} disabled={stages.some((stage) => !selected[stage.id])} className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-50"><Save className="h-4 w-4" />Save preset</button></div>
    {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
    <div className="grid gap-3 lg:grid-cols-3">{stages.map((stage) => {
      const values = profiles.filter((profile) => profile.stage === stage.id);
      const current = values.find((profile) => profile.id === selected[stage.id]);
      return <div key={stage.id} className="rounded-md border border-gray-200 p-3"><label className="text-xs font-semibold uppercase text-gray-500">{stage.label}<select value={selected[stage.id]} onChange={(event) => setSelected((value) => ({ ...value, [stage.id]: event.target.value }))} className="mt-2 block w-full rounded-md border-gray-300 text-sm">{values.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.is_builtin ? ' · locked' : ` · r${profile.revision}`}</option>)}</select></label>{current && <div className="mt-2 flex justify-end gap-2"><button onClick={() => clone(current)} className="rounded p-1.5 text-gray-500 hover:bg-gray-100" title="Clone"><Copy className="h-4 w-4" /></button>{!current.is_builtin && <button onClick={() => remove(current)} className="rounded p-1.5 text-red-500 hover:bg-red-50" title="Delete"><Trash2 className="h-4 w-4" /></button>}</div>}</div>;
    })}</div>
  </section>;
}
