import type { Workout } from './types';

export type DateRangeFilter = 'today' | 'week' | 'month' | 'planned' | 'past';

export const workoutsInRange = (records: Workout[], filter: DateRangeFilter, now = new Date()) => {
  if (filter === 'planned') return records.filter((workout) => workout.status === 'planned');
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (filter === 'past') {
    return records.filter((workout) => new Date(workout.performed_at) < start);
  }
  if (filter === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (filter === 'month') {
    start.setDate(1);
  }
  const end = new Date(start);
  if (filter === 'today') end.setDate(end.getDate() + 1);
  else if (filter === 'week') end.setDate(end.getDate() + 7);
  else end.setMonth(end.getMonth() + 1);
  return records.filter((workout) => {
    const date = new Date(workout.performed_at);
    return date >= start && date < end;
  });
};

export const requiresDistanceAndTime = (workout: Pick<Workout, 'type' | 'cardio_mode'>) =>
  (workout.type === 'cardio' || workout.type === 'interval') &&
  (workout.cardio_mode === 'running' || workout.cardio_mode === 'walking' || workout.cardio_mode === 'cycling');

export const distanceCompletionData = (distance: number | undefined, time: string) => {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) {
    throw new Error('Vul een afstand groter dan 0 km in.');
  }
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(time.trim());
  if (!match) throw new Error('Vul de tijd in als uu:mm:ss, bijvoorbeeld 00:32:15.');
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error('Vul een tijd groter dan 0 seconden in.');
  }
  return { distance_km: distance, duration_minutes: seconds / 60 };
};

export const formatWorkoutTime = (minutes: number) => {
  const seconds = Math.round(minutes * 60);
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60
  ].map((value) => String(value).padStart(2, '0')).join(':');
};
