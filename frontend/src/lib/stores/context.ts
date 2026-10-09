import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import type { WorkoutType } from '$lib/types';

const storageKey = 'top-trainer-timeline-type';
const initialValue = (): WorkoutType | '' => {
  if (!browser) return '';
  const saved = localStorage.getItem(storageKey);
  return saved === 'strength' || saved === 'cardio' || saved === 'interval' || saved === 'recovery' ? saved : '';
};

export const activeWorkoutType = writable<WorkoutType | ''>(initialValue());

if (browser) {
  activeWorkoutType.subscribe((type) => {
    if (type) localStorage.setItem(storageKey, type);
    else localStorage.removeItem(storageKey);
  });
}

export const contextFilter = (type: WorkoutType | '') => (type ? `type = "${type}"` : '');
