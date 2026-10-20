import { writable } from 'svelte/store';
import { pb } from '$lib/pocketbase';

export const currentUser = writable(pb.authStore.model);
export const isAuthenticated = writable(pb.authStore.isValid);

pb.authStore.onChange(() => {
  currentUser.set(pb.authStore.model);
  isAuthenticated.set(pb.authStore.isValid);
}, true);

// Een sessie uit een eerdere database (bijv. na een reset) is lokaal nog 'geldig'; server-side controleren.
if (typeof window !== 'undefined' && pb.authStore.isValid) {
  pb.collection('users').authRefresh().catch(() => pb.authStore.clear());
}
