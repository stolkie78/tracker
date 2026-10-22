import { writable } from 'svelte/store';
import { pb } from '$lib/pocketbase';

export const currentUser = writable(pb.authStore.model);
export const isAuthenticated = writable(pb.authStore.isValid);

pb.authStore.onChange(() => {
  currentUser.set(pb.authStore.model);
  isAuthenticated.set(pb.authStore.isValid);
}, true);

// A session from an earlier database (for example, after a reset) may still appear valid locally; verify it server-side.
if (typeof window !== 'undefined' && pb.authStore.isValid) {
  pb.collection('users').authRefresh().catch(() => pb.authStore.clear());
}
