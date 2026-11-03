import { DAY_PARTS, DAY_PART_HOURS, DAY_PART_LABELS, CARDIO_MODE_LABELS, RECOVERY_ACTIVITY_LABELS, SPORT_ACTIVITY_LABELS, WELLNESS_ACTIVITY_LABELS, WORKOUT_TYPE_LABELS, isDietaryActivity, type TrainingPlan, type CycleSlot, type DayPart, type Workout, type WorkoutTemplate } from '$lib/types';

export const emptyCycleSlot = (): CycleSlot => ({ periods: { all_day: [], morning: [], afternoon: [], evening: [] } });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function cycleDate(start: string, offset: number) {
  const date = new Date(`${start}T12:00:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(date.getTime()) || localDate(date) !== start) {
    throw new Error('Choose a valid start date.');
  }
  date.setDate(date.getDate() + offset);
  return date;
}

export function normalizeCycleSlots(raw: unknown, days: number): CycleSlot[] {
  if (!Array.isArray(raw)) throw new Error('The saved cycle schedule is invalid.');
  return Array.from({ length: days }, (_, index) => {
    const value: unknown = raw[index];
    const slot = emptyCycleSlot();
    if (value === undefined) return slot;
    if (!isRecord(value)) throw new Error('The saved daily schedule is invalid.');
    if ('periods' in value) {
      const periods = value.periods;
      if (!isRecord(periods)) throw new Error('The saved day parts are invalid.');
      for (const part of DAY_PARTS) {
        const ids: unknown = part in periods ? periods[part] : [];
        if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
          throw new Error('The saved workouts are invalid.');
        }
        slot.periods[part] = [...ids];
      }
    } else {
      const ids: unknown = 'templates' in value ? value.templates : 'template' in value ? [value.template] : [];
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
        throw new Error('The saved workouts are invalid.');
      }
      slot.periods.morning = [...ids];
    }
    return slot;
  });
}

export function applyActivityToCycle(
  start: string, slots: CycleSlot[], template: string, part: DayPart, weeks: number[], weekdays: number[]
): CycleSlot[] {
  cycleDate(start, 0);
  if (![7, 14, 21].includes(slots.length)) throw new Error('Choose a cycle of one to three weeks.');
  if (!template || !DAY_PARTS.includes(part)) throw new Error('Choose an activity and day part.');
  if (!weeks.length || weeks.some((week) => !Number.isInteger(week) || week < 0 || week >= slots.length / 7)) {
    throw new Error('Choose at least one valid cycle week.');
  }
  if (!weekdays.length || weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error('Choose at least one valid weekday.');
  }
  const result = normalizeCycleSlots(slots, slots.length);
  result.forEach((slot, day) => {
    if (weeks.includes(Math.floor(day / 7)) && weekdays.includes(cycleDate(start, day).getDay())
      && !slot.periods[part].includes(template)) {
      slot.periods[part].push(template);
    }
  });
  return result;
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
    throw new Error('A cycle must last one, two, or three weeks.');
  }
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 52) {
    throw new Error('Choose between 1 and 52 repetitions.');
  }
  cycleDate(start, 0);
  const days = cycleWeeks * 7;
  if (slots.length !== days) throw new Error('The daily schedule does not match the cycle length.');
  const result: ScheduledBlock[] = [];
  for (let cycle = 0; cycle < repetitions; cycle += 1) {
    slots.forEach((slot, day) => {
      for (const part of DAY_PARTS) {
        slot.periods[part].forEach((id, order) => {
          const template = lookup.get(id);
          if (!template) throw new Error(`Choose an available workout for day ${day + 1}, ${DAY_PART_LABELS[part].toLowerCase()}.`);
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

// Older standalone workouts have no day part; do not invent one.
export function groupByDayPart(records: Workout[]) {
  return [...DAY_PARTS, '' as const].map((part) => ({
    part,
    label: part ? DAY_PART_LABELS[part] : 'No day part',
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

export interface PeriodTarget {
  template: string;
  count: number;
}

export function countPeriodTargets(targets: PeriodTarget[], lookup: Map<string, WorkoutTemplate>) {
  return targets.reduce((counts, target) => {
    const template = lookup.get(target.template);
    if (!template) return counts;
    if (isDietaryActivity(template.type, template.wellness_activity)) counts.days += target.count;
    else counts.sessions += target.count;
    return counts;
  }, { days: 0, sessions: 0 });
}

export function buildFreePeriod(start: string, weeks: number, targets: PeriodTarget[], lookup: Map<string, WorkoutTemplate>) {
  cycleDate(start, 0);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 4) throw new Error('Choose a period of one to four weeks.');
  const entries: WorkoutTemplate[] = [];
  for (const target of targets) {
    const template = lookup.get(target.template);
    if (!template) throw new Error('Choose an available workout.');
    if (!Number.isInteger(target.count) || target.count < 1 || target.count > 200) {
      throw new Error('Choose a whole number of workouts between 1 and 200.');
    }
    if (entries.length + target.count > 200) throw new Error('A period can contain at most 200 workouts.');
    entries.push(...Array.from({ length: target.count }, () => template));
  }
  return entries;
}

export function normalizePeriodTargets(raw: unknown): PeriodTarget[] {
  if (!Array.isArray(raw)) throw new Error('The saved period targets are invalid.');
  return raw.map((item: unknown) => {
    if (!isRecord(item) || typeof item.template !== 'string' || typeof item.count !== 'number' || !Number.isInteger(item.count) || item.count < 1 || item.count > 200) {
      throw new Error('The saved period targets are invalid.');
    }
    return { template: item.template, count: item.count };
  });
}

export function replanFreePeriod(entries: WorkoutTemplate[], existing: Workout[]) {
  const removable = existing.filter((workout) => workout.status === 'planned');
  const retained = existing.filter((workout) => workout.status !== 'planned');
  const counts = new Map<string, number>();
  for (const workout of retained) {
    counts.set(workout.template ?? '', (counts.get(workout.template ?? '') ?? 0) + 1);
  }
  const pending = entries.filter((template) => {
    const count = counts.get(template.id) ?? 0;
    if (!count) return true;
    counts.set(template.id, count - 1);
    return false;
  });
  return { removable, retained, pending };
}

export function groupFreePeriods(plans: TrainingPlan[], workouts: Workout[], today = new Date(), includeEnded = false) {
  const day = localDate(today);
  return plans.filter((plan) => plan.schedule_mode === 'free_period').map((plan) => {
    const records = workouts.filter((workout) => workout.free_period && workout.plan === plan.id);
    const groups = new Map<string, { label: string; workouts: Workout[]; completed: number; unit: 'day' | 'session' }>();
    for (const workout of records) {
      const activity = (workout.type === 'cardio' || workout.type === 'interval' || workout.type === 'life') ? workout.cardio_mode
        : workout.type === 'recovery' ? workout.recovery_activity : workout.type === 'sport' ? workout.sport_activity
        : workout.type === 'wellness' ? workout.wellness_activity : '';
      const key = `${workout.type}:${activity || ''}`;
      const label = (workout.type === 'cardio' || workout.type === 'interval' || workout.type === 'life') && workout.cardio_mode ? CARDIO_MODE_LABELS[workout.cardio_mode]
        : workout.type === 'recovery' && workout.recovery_activity ? RECOVERY_ACTIVITY_LABELS[workout.recovery_activity]
        : workout.type === 'sport' && workout.sport_activity ? SPORT_ACTIVITY_LABELS[workout.sport_activity]
        : workout.type === 'wellness' && workout.wellness_activity ? WELLNESS_ACTIVITY_LABELS[workout.wellness_activity] : WORKOUT_TYPE_LABELS[workout.type];
      const group = groups.get(key) ?? {
        label: activity ? `${WORKOUT_TYPE_LABELS[workout.type]} · ${label}` : label,
        workouts: [], completed: 0, unit: isDietaryActivity(workout.type, workout.wellness_activity) ? 'day' : 'session'
      };
      group.workouts.push(workout);
      if (workout.status === 'completed') group.completed += 1;
      groups.set(key, group);
    }

    return { plan, groups: [...groups.values()], total: records.length, completed: records.filter((workout) => workout.status === 'completed').length };
  }).filter(({ plan, total, groups }) => total > 0 && (
    includeEnded || plan.end_date.slice(0, 10) >= day || groups.some((group) => group.workouts.some((workout) => workout.status === 'planned' || workout.status === 'in_progress'))
  ));
}

export function groupPeriodCategories(groups: ReturnType<typeof groupFreePeriods>[number]['groups']) {
  const categories = new Map<string, {
    label: string;
    type: Workout['type'];
    groups: typeof groups;
    completed: number;
    total: number;
  }>();
  const categoryFor = (type: Workout['type']) =>
    type === 'interval' ? 'cardio' : type;
  const order = ['strength', 'cardio', 'sport', 'life', 'recovery', 'wellness'];

  for (const group of groups) {
    const type = group.workouts[0].type;
    const category = categoryFor(type);
    const current = categories.get(category) ?? {
      label: category === 'sport' ? 'Sports' : WORKOUT_TYPE_LABELS[category],
      type,
      groups: [],
      completed: 0,
      total: 0
    };
    current.groups.push(group);
    current.completed += group.completed;
    current.total += group.workouts.length;
    categories.set(category, current);
  }
  return [...categories.values()].sort((a, b) => order.indexOf(categoryFor(a.type)) - order.indexOf(categoryFor(b.type)));
}

export function groupPeriodWorkouts(workouts: Workout[]) {
  const groups = new Map<string, Workout[]>();
  for (const workout of workouts) {
    const key = `${workout.template || workout.title}:${workout.title}`;
    const records = groups.get(key) ?? [];
    records.push(workout);
    groups.set(key, records);
  }
  return [...groups.values()].map((records) => ({
    title: records[0].title,
    workouts: records,
    unit: isDietaryActivity(records[0].type, records[0].wellness_activity) ? 'day' as const : 'session' as const,
    completed: records.filter((workout) => workout.status === 'completed').length,
    remaining: records.filter((workout) => workout.status === 'planned' || workout.status === 'in_progress').length,
    next: records.find((workout) => workout.status === 'in_progress') ?? records.find((workout) => workout.status === 'planned')
  }));
}
