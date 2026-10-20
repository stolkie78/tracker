import { DAY_PARTS, DAY_PART_HOURS, DAY_PART_LABELS, type CycleSlot, type DayPart, type Workout, type WorkoutTemplate } from '$lib/types';

export const emptyCycleSlot = (): CycleSlot => ({ periods: { morning: [], afternoon: [], evening: [] } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function cycleDate(start: string, offset: number) {
  const date = new Date(`${start}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(date.getTime()) || localDate(date) !== start) {
    throw new Error('Kies een geldige startdatum.');
  }
  date.setDate(date.getDate() + offset);
  return date;
}

export function normalizeCycleSlots(raw: unknown, days: number): CycleSlot[] {
  if (!Array.isArray(raw)) throw new Error('Het opgeslagen cyclusschema is ongeldig.');
  return Array.from({ length: days }, (_, index) => {
    const value: unknown = raw[index];
    const slot = emptyCycleSlot();
    if (value === undefined) return slot;
    if (!isRecord(value)) throw new Error('Het opgeslagen dagschema is ongeldig.');
    if ('periods' in value) {
      const periods = value.periods;
      if (!isRecord(periods)) throw new Error('De opgeslagen dagdelen zijn ongeldig.');
      for (const part of DAY_PARTS) {
        const ids: unknown = part in periods ? periods[part] : [];
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
          throw new Error('De opgeslagen workouts zijn ongeldig.');
        }
        slot.periods[part] = [...ids];
      }
    } else {
      const ids: unknown = 'templates' in value ? value.templates : 'template' in value ? [value.template] : [];
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
        throw new Error('De opgeslagen workouts zijn ongeldig.');
      }
      slot.periods.morning = [...ids];
    }
    return slot;
  });
}

export interface ScheduledBlock {
  date: Date;
  template: WorkoutTemplate;
  cycle: number;
  day: number;
  part: DayPart;
  order: number;
}

export function buildCycleSchedule(
  start: string, cycleWeeks: number, repetitions: number, slots: CycleSlot[], lookup: Map<string, WorkoutTemplate>
): ScheduledBlock[] {
  if (!Number.isInteger(cycleWeeks) || cycleWeeks < 1 || cycleWeeks > 3) {
    throw new Error('Een cyclus duurt één, twee of drie weken.');
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 52) {
    throw new Error('Kies één tot en met 52 herhalingen.');
  }
  cycleDate(start, 0);
  const days = cycleWeeks * 7;
  if (slots.length !== days) throw new Error('Het dagschema past niet bij de cyclusduur.');
  const result: ScheduledBlock[] = [];
  for (let cycle = 0; cycle < repetitions; cycle += 1) {
    slots.forEach((slot, day) => {
      for (const part of DAY_PARTS) {
        slot.periods[part].forEach((id, order) => {
          const template = lookup.get(id);
          if (!template) throw new Error(`Kies een beschikbare workout voor dag ${day + 1}, ${DAY_PART_LABELS[part].toLowerCase()}.`);
          result.push({ date: cycleDate(start, cycle * days + day), template, cycle: cycle + 1, day, part, order });
        });
      }
    });
  }
  return result;
}

export function blockTime(entry: ScheduledBlock) {
  const date = new Date(entry.date);
  date.setHours(DAY_PART_HOURS[entry.part], 0, entry.order, 0);
  return date;
}

// Oudere losse trainingen hebben geen dagdeel; verzin daar geen indeling voor.
export function groupByDayPart(records: Workout[]) {
  return [...DAY_PARTS, '' as const].map((part) => ({
    part,
    label: part ? DAY_PART_LABELS[part] : 'Zonder dagdeel',
    workouts: records.filter((workout) => (workout.day_part || '') === part)
      .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())
  })).filter((group) => group.workouts.length > 0);
}

export function replanCycle(entries: ScheduledBlock[], existing: Workout[], today = new Date()) {
  const firstDay = localDate(today);
  const removable = existing.filter((workout) => workout.status === 'planned' && localDate(new Date(workout.performed_at)) >= firstDay);
  const retained = existing.filter((workout) => !removable.includes(workout));
  const retainedCounts = new Map<string, number>();
  const key = (date: Date, template: string, part: string) => `${localDate(date)}:${template}:${part}`;
  for (const workout of retained) {
    const id = key(new Date(workout.performed_at), workout.template ?? '', workout.day_part || 'morning');
    retainedCounts.set(id, (retainedCounts.get(id) ?? 0) + 1);
  }
  const pending = entries.filter((entry) => {
    if (localDate(entry.date) < firstDay) return false;
    const id = key(entry.date, entry.template.id, entry.part);
    const count = retainedCounts.get(id) ?? 0;
    if (!count) return true;
    retainedCounts.set(id, count - 1);
    return false;
  });
  return { removable, retained, pending };
}
