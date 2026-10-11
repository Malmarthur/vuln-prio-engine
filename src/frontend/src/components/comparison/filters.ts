import { ComparisonFilters, ComparisonQuery, FollowedEntityType, ScoringScope } from '../../api/client';

// Three layers, from widest to narrowest:
// - population: saved with a run; ranks are computed inside it;
// - attribute filters: slice the population; charts and table are recomputed;
// - chart selections: filter the table only and are highlighted in the charts.

export type Movement = 'promoted' | 'demoted' | 'unchanged' | '';
export type TopChange = 'entered' | 'left' | 'stayed' | '';
export type ItemSort = 'abs_rank_delta' | 'abs_score_delta' | 'label' | 'baseline_rank' | 'candidate_rank';

export interface AttributeFilters {
  q: string;
  kev: '' | 'true' | 'false';
  minEpss: string;
  severities: string[];
  criticalities: string[];
  exposures: string[];
  vendor: string;
  product: string;
  followedOnly: boolean;
}

export interface ChartSelection {
  from: string;
  to: string;
  movement: Movement;
  topChange: TopChange;
}

export interface ComparisonView {
  attributes: AttributeFilters;
  selection: ChartSelection;
  topN: number;
  sort: ItemSort;
}

export interface Population {
  mode: 'all' | 'subset';
  attributes: AttributeFilters;
  /** Explicit items frozen into an earlier run (e.g. its followed items). */
  entityIds: string[];
}

export const TOP_N_SIZES = [10, 50, 100, 500];
export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const CRITICALITIES = ['critical', 'high', 'medium', 'low', 'unknown'];
export const EXPOSURES = ['internet', 'internal', 'isolated', 'unknown'];

export const EMPTY_ATTRIBUTES: AttributeFilters = {
  q: '', kev: '', minEpss: '', severities: [], criticalities: [], exposures: [], vendor: '', product: '', followedOnly: false,
};
export const EMPTY_SELECTION: ChartSelection = { from: '', to: '', movement: '', topChange: '' };
export const DEFAULT_VIEW: ComparisonView = { attributes: EMPTY_ATTRIBUTES, selection: EMPTY_SELECTION, topN: 100, sort: 'abs_rank_delta' };
export const EMPTY_POPULATION: Population = { mode: 'all', attributes: EMPTY_ATTRIBUTES, entityIds: [] };

export function entityTypeOf(scope: ScoringScope): FollowedEntityType {
  return scope === 'vulnerability' || scope === 'asset' ? scope : 'finding';
}

export function entityNoun(scope: ScoringScope, count = 2): string {
  const noun = scope === 'vulnerability' ? 'vulnerabilit' : scope === 'asset' ? 'asset' : 'finding';
  if (scope === 'vulnerability') return `${noun}${count === 1 ? 'y' : 'ies'}`;
  return `${noun}${count === 1 ? '' : 's'}`;
}

/** Which attribute filters make sense for the entities a scope ranks. */
export function scopeFields(scope: ScoringScope) {
  const kind = entityTypeOf(scope);
  return { vulnerability: kind !== 'asset', asset: kind !== 'vulnerability' };
}

export function hasAttributes(value: AttributeFilters): boolean {
  return Boolean(
    value.q.trim() || value.kev || value.minEpss || value.severities.length || value.criticalities.length
    || value.exposures.length || value.vendor.trim() || value.product.trim() || value.followedOnly,
  );
}

export function hasSelection(value: ChartSelection): boolean {
  return Boolean(value.from || value.to || value.movement || value.topChange);
}

export function attributeQuery(value: AttributeFilters): ComparisonQuery {
  const epss = Number.parseFloat(value.minEpss);
  return {
    q: value.q.trim() || undefined,
    kev: value.kev ? value.kev === 'true' : undefined,
    min_epss: Number.isFinite(epss) ? epss : undefined,
    severity: value.severities,
    criticality: value.criticalities,
    exposure: value.exposures,
    vendor: value.vendor.trim() || undefined,
    product: value.product.trim() || undefined,
    followed_only: value.followedOnly || undefined,
  };
}

export function viewQuery(view: ComparisonView): ComparisonQuery {
  const { selection } = view;
  return {
    ...attributeQuery(view.attributes),
    from_priority: selection.from || undefined,
    to_priority: selection.to || undefined,
    movement: selection.movement || undefined,
    top_n: selection.topChange ? view.topN : undefined,
    top_change: selection.topChange || undefined,
  };
}

export function toSubset(population: Population): ComparisonFilters | null {
  if (population.mode !== 'subset') return null;
  const value = population.attributes;
  const epss = Number.parseFloat(value.minEpss);
  const subset: ComparisonFilters = {
    ...(value.q.trim() ? { q: value.q.trim() } : {}),
    ...(value.kev ? { kev: value.kev === 'true' } : {}),
    ...(Number.isFinite(epss) ? { min_epss: epss } : {}),
    ...(value.severities.length ? { severities: value.severities } : {}),
    ...(value.criticalities.length ? { criticalities: value.criticalities } : {}),
    ...(value.exposures.length ? { exposures: value.exposures } : {}),
    ...(value.vendor.trim() ? { vendor: value.vendor.trim() } : {}),
    ...(value.product.trim() ? { product: value.product.trim() } : {}),
    ...(value.followedOnly ? { followed_only: true } : {}),
    ...(population.entityIds.length ? { entity_ids: population.entityIds } : {}),
  };
  return Object.keys(subset).length ? subset : null;
}

export function fromSubset(subset: ComparisonFilters | null | undefined): Population {
  if (!subset) return EMPTY_POPULATION;
  return {
    mode: 'subset',
    entityIds: subset.entity_ids ?? [],
    attributes: {
      q: subset.q ?? '',
      kev: subset.kev == null ? '' : subset.kev ? 'true' : 'false',
      minEpss: subset.min_epss == null ? '' : String(subset.min_epss),
      severities: subset.severities ?? [],
      criticalities: subset.criticalities ?? [],
      exposures: subset.exposures ?? [],
      vendor: subset.vendor ?? '',
      product: subset.product ?? '',
      followedOnly: subset.followed_only ?? false,
    },
  };
}

export interface FilterChip {
  id: string;
  label: string;
  clear: (view: ComparisonView) => ComparisonView;
}

const withAttributes = (patch: Partial<AttributeFilters>) => (view: ComparisonView): ComparisonView => ({ ...view, attributes: { ...view.attributes, ...patch } });
const withSelection = (patch: Partial<ChartSelection>) => (view: ComparisonView): ComparisonView => ({ ...view, selection: { ...view.selection, ...patch } });

/** Readable descriptions of a set of attribute filters (also used for populations). */
export function describeAttributes(value: AttributeFilters): Array<{ id: keyof AttributeFilters; label: string }> {
  const items: Array<{ id: keyof AttributeFilters; label: string }> = [];
  if (value.q.trim()) items.push({ id: 'q', label: `“${value.q.trim()}”` });
  if (value.kev) items.push({ id: 'kev', label: value.kev === 'true' ? 'KEV only' : 'Not in KEV' });
  if (value.minEpss) items.push({ id: 'minEpss', label: `EPSS ≥ ${value.minEpss}` });
  if (value.severities.length) items.push({ id: 'severities', label: `Severity ${value.severities.join(', ')}` });
  if (value.criticalities.length) items.push({ id: 'criticalities', label: `Criticality ${value.criticalities.join(', ')}` });
  if (value.exposures.length) items.push({ id: 'exposures', label: `Exposure ${value.exposures.join(', ')}` });
  if (value.vendor.trim()) items.push({ id: 'vendor', label: `Vendor “${value.vendor.trim()}”` });
  if (value.product.trim()) items.push({ id: 'product', label: `Product “${value.product.trim()}”` });
  if (value.followedOnly) items.push({ id: 'followedOnly', label: 'Followed only' });
  return items;
}

export function viewChips(view: ComparisonView): FilterChip[] {
  const chips: FilterChip[] = describeAttributes(view.attributes).map((item) => ({
    id: item.id,
    label: item.label,
    clear: withAttributes({ [item.id]: EMPTY_ATTRIBUTES[item.id] } as Partial<AttributeFilters>),
  }));
  const { selection } = view;
  if (selection.from) chips.push({ id: 'from', label: `From ${selection.from}`, clear: withSelection({ from: '' }) });
  if (selection.to) chips.push({ id: 'to', label: `To ${selection.to}`, clear: withSelection({ to: '' }) });
  if (selection.movement) chips.push({ id: 'movement', label: selection.movement[0].toUpperCase() + selection.movement.slice(1), clear: withSelection({ movement: '' }) });
  if (selection.topChange) chips.push({ id: 'topChange', label: `${selection.topChange === 'entered' ? 'Entered' : selection.topChange === 'left' ? 'Left' : 'Stayed in'} top ${view.topN}`, clear: withSelection({ topChange: '' }) });
  return chips;
}

export function toggle<T>(current: T, value: T, empty: T): T {
  return current === value ? empty : value;
}
