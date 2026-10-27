import { browser } from '$app/environment';
import { writable } from 'svelte/store';
import { currentUserId, pb } from '$lib/pocketbase';
import type { WorkoutType } from '$lib/types';

const storageKey = () => `top-trainer-timeline-type:${currentUserId()}`;
const initialValue = (): WorkoutType | '' => {
  if (!browser) return '';
  const saved = currentUserId() ? localStorage.getItem(storageKey()) : '';
  return saved === 'strength' || saved === 'cardio' || saved === 'interval' || saved === 'recovery' || saved === 'sport' || saved === 'life' ? saved : '';
};

export const activeWorkoutType = writable<WorkoutType | ''>(initialValue());

if (browser) {
  let user = currentUserId();
  pb.authStore.onChange(() => {
    if (user !== currentUserId()) {
      user = currentUserId();
      activeWorkoutType.set(initialValue());
    }
  });
  activeWorkoutType.subscribe((type) => {
    if (!currentUserId()) return;
    if (type) localStorage.setItem(storageKey(), type);
    else localStorage.removeItem(storageKey());
  });
}

export const contextFilter = (type: WorkoutType | '') => (type ? `type = "${type}"` : '');
