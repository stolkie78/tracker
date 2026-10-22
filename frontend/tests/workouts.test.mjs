import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { requiresDistanceAndTime, distanceCompletionData, formatWorkoutTime } = await server.ssrLoadModule('/src/lib/workouts.ts');
const { WORKOUT_STATUS_CARD_STYLES, formatPace } = await server.ssrLoadModule('/src/lib/types/index.ts');

test('completed cards are green and skipped cards grey in both themes', () => {
  assert.match(WORKOUT_STATUS_CARD_STYLES.completed, /\bbg-emerald-50\b/);
  assert.match(WORKOUT_STATUS_CARD_STYLES.completed, /\bdark:bg-emerald-950\b/);
  assert.match(WORKOUT_STATUS_CARD_STYLES.skipped, /\bbg-gray-100\b/);
  assert.match(WORKOUT_STATUS_CARD_STYLES.skipped, /\bdark:bg-gray-800\b/);
  assert.equal(WORKOUT_STATUS_CARD_STYLES.planned, '');
  assert.equal(WORKOUT_STATUS_CARD_STYLES.in_progress, '');
});

test('running, walking and cycling require distance and time for cardio and intervals', () => {
  for (const type of ['cardio', 'interval']) {
    for (const cardio_mode of ['running', 'walking', 'cycling']) {
      assert.equal(requiresDistanceAndTime({ type, cardio_mode }), true);
    }
    for (const cardio_mode of ['rowing', 'swimming', 'other', undefined]) {
      assert.equal(requiresDistanceAndTime({ type, cardio_mode }), false);
    }
  }
});

test('other workout types do not require distance and time', () => {
  for (const type of ['cardio', 'interval', 'strength', 'recovery', 'sport']) {
    assert.equal(requiresDistanceAndTime({ type }), false);
  }
  for (const type of ['strength', 'recovery', 'sport']) {
    for (const cardio_mode of ['running', 'walking', 'cycling']) {
      assert.equal(requiresDistanceAndTime({ type, cardio_mode }), false);
    }
  }
});

test('actual distance and time preserve seconds and calculate pace', () => {
  const results = distanceCompletionData(5.123, '00:32:15');
  assert.deepEqual(results, { distance_km: 5.123, duration_minutes: 32.25 });
  assert.equal(formatWorkoutTime(results.duration_minutes), '00:32:15');
  assert.equal(formatPace(5, results.duration_minutes), '6:27 /km');
  assert.equal(formatWorkoutTime(distanceCompletionData(21.0975, '01:45:01').duration_minutes), '01:45:01');
  assert.equal(formatWorkoutTime(distanceCompletionData(0.001, '00:00:01').duration_minutes), '00:00:01');
});

test('missing, zero, negative and non-finite distances are rejected', () => {
  for (const distance of [undefined, null, '', '5', 0, -1, NaN, Infinity]) {
    assert.throws(() => distanceCompletionData(distance, '00:30:00'), /afstand/);
  }
});

test('time requires hours, minutes and seconds with a positive duration', () => {
  for (const time of ['', '30', '30:00', '-1:00:00', '00:60:00', '00:00:60', '00:1:00', 'abc', 'Infinity:00:00']) {
    assert.throws(() => distanceCompletionData(5, time), /tijd/);
  }
  assert.throws(() => distanceCompletionData(5, '00:00:00'), /groter dan 0/);
  assert.throws(() => distanceCompletionData(5, '9999999999999999:00:00'), /groter dan 0/);
});

test('every second round-trips through the existing duration field', () => {
  for (let seconds = 1; seconds <= 86400; seconds += 1) {
    const time = formatWorkoutTime(seconds / 60);
    const result = distanceCompletionData(5, time);
    assert.equal(Math.round(result.duration_minutes * 60), seconds);
    assert.equal(formatWorkoutTime(result.duration_minutes), time);
  }
});
