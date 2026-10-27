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
const { computeStats } = await server.ssrLoadModule('/src/lib/stats.ts');
const { LIFE_ACTIVITY_OPTIONS, CARDIO_MODE_OPTIONS, RECOVERY_ACTIVITY_OPTIONS, templateLabel } = await server.ssrLoadModule('/src/lib/types/index.ts');
const workout = (id, type, cardio_mode, extra = {}) => ({
  id, type, cardio_mode, status: 'completed', performed_at: new Date().toISOString(),
  distance_km: 5, duration_minutes: 60, ...extra
});

test('Life offers walking and hiking while cycling stays under Cardio', () => {
  assert.deepEqual(LIFE_ACTIVITY_OPTIONS.map(({ value }) => value), ['walking', 'hiking']);
  assert.ok(CARDIO_MODE_OPTIONS.some(({ value }) => value === 'cycling'));
  for (const options of [CARDIO_MODE_OPTIONS, RECOVERY_ACTIVITY_OPTIONS]) {
    assert.ok(!options.some(({ value }) => value === 'walking' || value === 'hiking'));
  }
  assert.equal(templateLabel({ title: 'Weekend', type: 'life', cardio_mode: 'hiking' }), 'Hiking · Weekend');
});

test('walking, hiking and biking have independent insights and Life is not counted as cardio distance', () => {
  const records = [
    workout('walk', 'life', 'walking', { elevation_gain_m: 10 }),
    workout('hike', 'life', 'hiking', { distance_km: 8, duration_minutes: 120, elevation_gain_m: 300 }),
    workout('bike', 'cardio', 'cycling', { distance_km: 30, duration_minutes: 90 }),
    workout('bike-interval', 'interval', 'cycling', { distance_km: 10, duration_minutes: 30 }),
    workout('run', 'cardio', 'running', { distance_km: 10, duration_minutes: 50 }),
    workout('planned', 'life', 'walking', { status: 'planned' }),
    workout('skipped', 'life', 'hiking', { status: 'skipped' })
  ];
  const snapshot = structuredClone(records);
  const stats = computeStats(records, 'all');
  assert.equal(stats.total, 5);
  assert.equal(stats.byType.life, 2);
  assert.equal(stats.totalMinutes, 350);
  assert.equal(stats.cardioKmTotal, 50);
  assert.equal(stats.runningKm, 10);
  assert.equal(stats.run.runs, 1);
  assert.equal(stats.run.paceMinPerKm, 5);
  assert.equal(stats.activities.walking.sessions, 1);
  assert.equal(stats.activities.walking.km, 5);
  assert.equal(stats.activities.walking.paceMinPerKm, 12);
  assert.equal(stats.activities.walking.elevation, 10);
  assert.equal(stats.activities.hiking.km, 8);
  assert.equal(stats.activities.hiking.minutes, 120);
  assert.equal(stats.activities.hiking.elevation, 300);
  assert.equal(stats.activities.cycling.sessions, 2);
  assert.equal(stats.activities.cycling.km, 40);
  assert.equal(stats.activities.cycling.minutes, 120);
  assert.equal(stats.activities.cycling.longestKm, 30);
  assert.equal(60 / stats.activities.cycling.paceMinPerKm, 20);
  assert.deepEqual(records, snapshot);
});

test('period filtering applies to Life and biking; recent sessions are newest first and limited to five', () => {
  const old = workout('old', 'life', 'hiking', { performed_at: '2000-01-01T12:00:00Z' });
  const walks = Array.from({ length: 7 }, (_, index) => workout(`walk-${index}`, 'life', 'walking', {
    performed_at: new Date(Date.now() - index * 86_400_000).toISOString()
  }));
  const stats = computeStats([...walks].reverse().concat(old, workout('old-bike', 'cardio', 'cycling', { performed_at: old.performed_at })), '4w');
  assert.equal(stats.activities.walking.sessions, 7);
  assert.equal(stats.activities.hiking.sessions, 0);
  assert.equal(stats.activities.cycling.sessions, 0);
  assert.deepEqual(stats.activities.walking.recent.map(({ id }) => id), ['walk-0', 'walk-1', 'walk-2', 'walk-3', 'walk-4']);
  assert.equal(computeStats([old], 'all').activities.hiking.sessions, 1);
});

test('legacy recovery/cardio walks remain visible and missing measurements do not corrupt pace', () => {
  const stats = computeStats([
    workout('legacy', 'recovery', undefined, { recovery_activity: 'walking' }),
    workout('cardio', 'cardio', 'walking'),
    workout('no-distance', 'life', 'walking', { distance_km: 0, duration_minutes: 30 }),
    workout('no-time', 'life', 'walking', { duration_minutes: 0 })
  ], 'all');
  assert.equal(stats.activities.walking.sessions, 4);
  assert.equal(stats.activities.walking.km, 15);
  assert.equal(stats.activities.walking.minutes, 150);
  assert.equal(stats.activities.walking.paceMinPerKm, 12);
  assert.equal(stats.activities.walking.fastestPaceMinPerKm, 12);
  const empty = computeStats([], 'all');
  for (const activity of Object.values(empty.activities)) {
    assert.equal(activity.sessions, 0);
    assert.equal(activity.paceMinPerKm, 0);
    assert.equal(activity.longestKm, 0);
    assert.deepEqual(activity.recent, []);
  }
});
