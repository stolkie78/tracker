import { writable } from 'svelte/store';
import { pb } from '$lib/pocketbase';

export const currentUser = writable(pb.authStore.model);
export const isAuthenticated = writable(pb.authStore.isValid);

pb.authStore.onChange(() => {
  currentUser.set(pb.authStore.model);
  isAuthenticated.set(pb.authStore.isValid);
}, true);
