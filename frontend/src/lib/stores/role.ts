import { derived, writable } from 'svelte/store';
import { getOrCreateMyProfile } from '$lib/pocketbase';
import type { Profile } from '$lib/types';

export const profile = writable<Profile | null>(null);
export const rolesLoaded = writable(false);

export const loadUserRoles = async () => {
  rolesLoaded.set(false);
  const record = await getOrCreateMyProfile();
  profile.set(record);
  rolesLoaded.set(true);
  return record;
};

export const clearUserRoles = () => {
  profile.set(null);
  rolesLoaded.set(false);
};

export const isAdmin = derived(profile, ($profile) => $profile?.role === 'admin');
export const isCoach = derived(profile, ($profile) => $profile?.role === 'coach');
export const isAthlete = derived(profile, ($profile) => $profile?.role === 'athlete');
export const isCoachOrAdmin = derived(profile, ($profile) => $profile?.role === 'coach' || $profile?.role === 'admin');
