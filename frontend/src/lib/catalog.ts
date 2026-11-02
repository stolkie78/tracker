import {
  CARDIO_MODE_LABELS, CARDIO_MODE_OPTIONS, LIFE_ACTIVITY_OPTIONS,
  RECOVERY_ACTIVITY_LABELS, RECOVERY_ACTIVITY_OPTIONS, SPORT_ACTIVITY_LABELS, SPORT_ACTIVITY_OPTIONS,
  EXERCISE_EQUIPMENT_LABELS, EXERCISE_EQUIPMENT_OPTIONS, type WorkoutType
} from './types';

export type CatalogKind = 'movement' | 'recovery' | 'sport' | 'equipment';
export interface CatalogEntry {
  id: string;
  key: string;
  kind: CatalogKind;
  label: string;
  categories: WorkoutType[];
  active: boolean;
}

export const CATALOG_KIND_LABELS: Record<CatalogKind, string> = {
  movement: 'Movement activity', recovery: 'Recovery activity', sport: 'Sport', equipment: 'Material or machine'
};
export const CATALOG_CATEGORIES: Record<CatalogKind, WorkoutType[]> = {
  movement: ['cardio', 'interval', 'life'], recovery: ['recovery'], sport: ['sport'], equipment: ['strength']
};
let entries: CatalogEntry[] = [];

export function applyCatalog(records: CatalogEntry[]) {
  entries = records;
  for (const entry of records) {
    const labels = entry.kind === 'movement' ? CARDIO_MODE_LABELS : entry.kind === 'recovery' ? RECOVERY_ACTIVITY_LABELS
      : entry.kind === 'sport' ? SPORT_ACTIVITY_LABELS : EXERCISE_EQUIPMENT_LABELS;
    labels[entry.key] = entry.label;
  }
  const replace = (target: { value: string; label: string }[], kind: CatalogKind, category: WorkoutType) => {
    target.splice(0, target.length, ...records.filter((entry) => entry.kind === kind && entry.active && entry.categories.includes(category))
      .map((entry) => ({ value: entry.key, label: entry.label })));
  };
  replace(CARDIO_MODE_OPTIONS, 'movement', 'cardio');
  replace(LIFE_ACTIVITY_OPTIONS, 'movement', 'life');
  replace(RECOVERY_ACTIVITY_OPTIONS, 'recovery', 'recovery');
  replace(SPORT_ACTIVITY_OPTIONS, 'sport', 'sport');
  replace(EXERCISE_EQUIPMENT_OPTIONS, 'equipment', 'strength');
}

export const activityOptions = (category: WorkoutType, current = '') => {
  const kind = category === 'sport' ? 'sport' : category === 'recovery' ? 'recovery' : 'movement';
  const options = entries.filter((entry) => entry.kind === kind && (
    entry.active && entry.categories.includes(category) || entry.key === current
  )).map((entry) => ({ value: entry.key, label: entry.label + (!entry.active || !entry.categories.includes(category) ? ' (inactive)' : '') }));
  if (current && !options.some((option) => option.value === current)) {
    const labels = kind === 'movement' ? CARDIO_MODE_LABELS : kind === 'recovery' ? RECOVERY_ACTIVITY_LABELS : SPORT_ACTIVITY_LABELS;
    options.push({ value: current, label: `${labels[current] ?? current} (inactive)` });
  }
  return options;
};

export const equipmentAvailable = (key: string) =>
  entries.some((entry) => entry.kind === 'equipment' && entry.key === key && entry.active);

export const equipmentOptions = (keys: string[], current = '') =>
  [...new Set(current && !keys.includes(current) ? [...keys, current] : keys)].filter((key) => key === current || equipmentAvailable(key));
