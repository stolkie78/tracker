import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { get } from 'svelte/store';

const server = await createServer({
  configFile: false,
  plugins: [{
    name: 'mock-ai-settings',
    enforce: 'pre',
    resolveId(id) {
      const apiPath = fileURLToPath(new URL('../src/lib/pocketbase', import.meta.url));
      if (id === '$lib/pocketbase' || id === apiPath || id === `${apiPath}.ts`) return '\0ai-settings-test';
    },
    load(id) {
      if (id !== '\0ai-settings-test') return;
      return `
        let user = 'alice';
        let settings = null;
        const listeners = [];
        export const currentUserId = () => user;
        export const getAISettings = () => settings;
        export const setSettings = (value) => { settings = value; };
        export const switchUser = (value) => { user = value; listeners.forEach((listener) => listener()); };
        export const pb = { authStore: { onChange: (listener) => listeners.push(listener) } };
      `;
    }
  }],
  resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
});
after(() => server.close());
const mock = await server.ssrLoadModule('\0ai-settings-test');
const { aiAvailability, loadAIAvailability, setAIAvailability } = await server.ssrLoadModule('/src/lib/stores/ai.ts');

test('AI planner is hidden without a saved key and available with a saved key', async () => {
  mock.setSettings(null);
  await loadAIAvailability();
  assert.equal(get(aiAvailability).enabled, false);
  mock.setSettings({ api_key_set: false });
  await loadAIAvailability();
  assert.equal(get(aiAvailability).enabled, false);
  mock.setSettings({ api_key_set: true });
  await loadAIAvailability();
  assert.equal(get(aiAvailability).enabled, true);
});

test('account switches discard old availability and in-flight results', async () => {
  let resolve;
  mock.setSettings(new Promise((done) => { resolve = done; }));
  const request = loadAIAvailability();
  mock.switchUser('bob');
  assert.equal(get(aiAvailability).enabled, false);
  resolve({ api_key_set: true });
  await request;
  assert.equal(get(aiAvailability).enabled, false);
  setAIAvailability(true, 'alice');
  assert.equal(get(aiAvailability).enabled, false);
});

test('saving settings updates availability immediately and wins over an older load', async () => {
  let resolve;
  mock.setSettings(new Promise((done) => { resolve = done; }));
  const request = loadAIAvailability();
  setAIAvailability(true, 'bob');
  resolve(null);
  await request;
  assert.equal(get(aiAvailability).enabled, true);
});

test('failed checks show an explicit error and can be retried', async () => {
  mock.setSettings(Promise.reject(new Error('Settings unavailable')));
  await loadAIAvailability();
  assert.equal(get(aiAvailability).enabled, false);
  assert.equal(get(aiAvailability).error, 'Settings unavailable');
  mock.setSettings({ api_key_set: true });
  await loadAIAvailability();
  assert.equal(get(aiAvailability).error, '');
  assert.equal(get(aiAvailability).enabled, true);
});
