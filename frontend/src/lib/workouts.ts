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

export const openPastWorkouts = (records: Workout[], now = new Date()) =>
  workoutsInRange(records, 'past', now).filter((workout) => workout.status === 'planned' || workout.status === 'in_progress');

export const requiresDistanceAndTime = (workout: Pick<Workout, 'type' | 'cardio_mode' | 'recovery_activity'>) =>
  ((workout.type === 'cardio' || workout.type === 'interval') &&
    (workout.cardio_mode === 'running' || workout.cardio_mode === 'walking' || workout.cardio_mode === 'cycling')) ||
  (workout.type === 'life' && (workout.cardio_mode === 'walking' || workout.cardio_mode === 'hiking')) ||
  (workout.type === 'recovery' && workout.recovery_activity === 'walking');

export const distanceCompletionData = (distance: number | undefined, time: string) => {
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance <= 0) {
    throw new Error('Enter a distance greater than 0 km.');
  }
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(time.trim());
  if (!match) throw new Error('Enter the time as hh:mm:ss, for example 00:32:15.');
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error('Enter a time greater than 0 seconds.');
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
