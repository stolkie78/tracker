import type { Workout } from './types';

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
