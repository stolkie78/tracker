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
const { isRun, runCompletionData, formatRunTime } = await server.ssrLoadModule('/src/lib/workouts.ts');
const { WORKOUT_STATUS_CARD_STYLES, formatPace } = await server.ssrLoadModule('/src/lib/types/index.ts');

test('completed cards are green and skipped cards grey in both themes', () => {
  assert.match(WORKOUT_STATUS_CARD_STYLES.completed, /\bbg-emerald-50\b/);
  assert.match(WORKOUT_STATUS_CARD_STYLES.completed, /\bdark:bg-emerald-950\b/);
  assert.match(WORKOUT_STATUS_CARD_STYLES.skipped, /\bbg-gray-100\b/);
  assert.match(WORKOUT_STATUS_CARD_STYLES.skipped, /\bdark:bg-gray-800\b/);
  assert.equal(WORKOUT_STATUS_CARD_STYLES.planned, '');
  assert.equal(WORKOUT_STATUS_CARD_STYLES.in_progress, '');
});

test('only cardio and interval runs require running results', () => {
  assert.equal(isRun({ type: 'cardio', cardio_mode: 'running' }), true);
  assert.equal(isRun({ type: 'interval', cardio_mode: 'running' }), true);
  for (const type of ['cardio', 'interval', 'strength', 'recovery', 'sport']) {
    assert.equal(isRun({ type, cardio_mode: 'cycling' }), false);
    assert.equal(isRun({ type }), false);
  }
  assert.equal(isRun({ type: 'recovery', cardio_mode: 'running' }), false);
});

test('actual distance and time preserve seconds and calculate pace', () => {
  const results = runCompletionData(5.123, '00:32:15');
  assert.deepEqual(results, { distance_km: 5.123, duration_minutes: 32.25 });
  assert.equal(formatRunTime(results.duration_minutes), '00:32:15');
  assert.equal(formatPace(5, results.duration_minutes), '6:27 /km');
  assert.equal(formatRunTime(runCompletionData(21.0975, '01:45:01').duration_minutes), '01:45:01');
  assert.equal(formatRunTime(runCompletionData(0.001, '00:00:01').duration_minutes), '00:00:01');
});

test('missing, zero, negative and non-finite distances are rejected', () => {
  for (const distance of [undefined, null, '', '5', 0, -1, NaN, Infinity]) {
    assert.throws(() => runCompletionData(distance, '00:30:00'), /afstand/);
  }
});

test('time requires hours, minutes and seconds with a positive duration', () => {
  for (const time of ['', '30', '30:00', '-1:00:00', '00:60:00', '00:00:60', '00:1:00', 'abc', 'Infinity:00:00']) {
    assert.throws(() => runCompletionData(5, time), /tijd/);
  }
  assert.throws(() => runCompletionData(5, '00:00:00'), /groter dan 0/);
  assert.throws(() => runCompletionData(5, '9999999999999999:00:00'), /groter dan 0/);
});

test('every second round-trips through the existing duration field', () => {
  for (let seconds = 1; seconds <= 86400; seconds += 1) {
    const time = formatRunTime(seconds / 60);
    const result = runCompletionData(5, time);
    assert.equal(Math.round(result.duration_minutes * 60), seconds);
    assert.equal(formatRunTime(result.duration_minutes), time);
  }
});
