import { derived, writable } from 'svelte/store';
import { currentUserId, getOrCreateMyProfile, pb } from '$lib/pocketbase';
import type { Profile } from '$lib/types';

export const profile = writable<Profile | null>(null);
export const rolesLoaded = writable(false);
let pending: { user: string; promise: Promise<Profile> } | null = null;

export const loadUserRoles = (): Promise<Profile> => {
  const user = currentUserId();
  if (pending?.user === user) return pending.promise;
  rolesLoaded.set(false);
  const promise = getOrCreateMyProfile().then((record) => {
    if (currentUserId() === user) {
      profile.set(record);
      rolesLoaded.set(true);
    }
    return record;
  }).finally(() => {
    if (pending?.promise === promise) pending = null;
  });
  pending = { user, promise };
  return promise;
};

let profileUser = currentUserId();
pb.authStore.onChange(() => {
  const user = currentUserId();
  if (user !== profileUser) {
    profileUser = user;
    clearUserRoles();
  }
});

export const clearUserRoles = () => {
  profile.set(null);
  rolesLoaded.set(false);
};

export const isAdmin = derived(profile, ($profile) => $profile?.role === 'admin');
export const isCoach = derived(profile, ($profile) => $profile?.role === 'coach');
export const isAthlete = derived(profile, ($profile) => $profile?.role === 'athlete');
export const isCoachOrAdmin = derived(profile, ($profile) => $profile?.role === 'coach' || $profile?.role === 'admin');
