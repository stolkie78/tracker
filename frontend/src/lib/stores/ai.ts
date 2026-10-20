import { writable } from 'svelte/store';
import { currentUserId, getAISettings, pb } from '$lib/pocketbase';

export const aiAvailability = writable({ user: '', loading: false, enabled: false, error: '' });
let revision = 0;

export const setAIAvailability = (enabled: boolean, user: string) => {
  if (user !== currentUserId()) return;
  revision += 1;
  aiAvailability.set({ user, loading: false, enabled, error: '' });
};

export const loadAIAvailability = async () => {
  const user = currentUserId();
  const request = ++revision;
  aiAvailability.set({ user, loading: true, enabled: false, error: '' });
  try {
    const settings = await getAISettings();
    if (request === revision && user === currentUserId()) {
      aiAvailability.set({ user, loading: false, enabled: settings?.api_key_set === true, error: '' });
    }
  } catch (error) {
    if (request === revision && user === currentUserId()) {
      aiAvailability.set({
        user, loading: false, enabled: false,
        error: error instanceof Error ? error.message : 'AI-instellingen konden niet worden geladen.'
      });
    }
  }
};

let user = currentUserId();
pb.authStore.onChange(() => {
  if (user !== currentUserId()) {
    user = currentUserId();
    revision += 1;
    aiAvailability.set({ user: '', loading: false, enabled: false, error: '' });
  }
});
