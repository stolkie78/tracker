import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { healthInsights } = await server.ssrLoadModule('/src/lib/health.ts');
const entry = (date, fasted, program = 'a') => ({ id: `${program}-${date}`, owner: 'user', program, date, fasted });

test('Health insights combine programs without counting the same day twice', () => {
  const result = healthInsights([
    entry('2026-10-18', true),
    entry('2026-10-18', true, 'b'),
    entry('2026-10-19', true),
    entry('2026-10-19', false, 'b'),
    entry('2026-10-20', false)
  ], null, '2026-10-20');
  assert.deepEqual(result, { loggedDays: 3, fastedDays: 2, completion: 67, longestStreak: 2 });
});

test('period filtering also limits streaks and excludes future check-ins', () => {
  const result = healthInsights([
    entry('2026-10-17', true), entry('2026-10-18', true), entry('2026-10-19', true),
    entry('2026-10-20', false), entry('2026-10-21', true)
  ], new Date('2026-10-19T12:00:00'), '2026-10-20');
  assert.deepEqual(result, { loggedDays: 2, fastedDays: 1, completion: 50, longestStreak: 1 });
});

test('empty health data does not imply a zero-percent success rate', () => {
  assert.deepEqual(healthInsights([], null, '2026-10-20'), {
    loggedDays: 0, fastedDays: 0, completion: null, longestStreak: 0
  });
});
