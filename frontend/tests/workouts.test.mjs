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
const { requiresDistanceAndTime, distanceCompletionData, formatWorkoutTime, workoutsInRange } = await server.ssrLoadModule('/src/lib/workouts.ts');
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
    assert.throws(() => distanceCompletionData(distance, '00:30:00'), /distance/);
  }
});

test('time requires hours, minutes and seconds with a positive duration', () => {
  for (const time of ['', '30', '30:00', '-1:00:00', '00:60:00', '00:00:60', '00:1:00', 'abc', 'Infinity:00:00']) {
    assert.throws(() => distanceCompletionData(5, time), /time/);
  }
  assert.throws(() => distanceCompletionData(5, '00:00:00'), /greater than 0/);
  assert.throws(() => distanceCompletionData(5, '9999999999999999:00:00'), /greater than 0/);
});

test('every second round-trips through the existing duration field', () => {
  for (let seconds = 1; seconds <= 86400; seconds += 1) {
    const time = formatWorkoutTime(seconds / 60);
    const result = distanceCompletionData(5, time);
    assert.equal(Math.round(result.duration_minutes * 60), seconds);
    assert.equal(formatWorkoutTime(result.duration_minutes), time);
  }
});

const workoutAt = (id, date, status = 'completed') => ({ id, performed_at: date.toISOString(), status });
const idsInRange = (records, filter, now) => workoutsInRange(records, filter, now).map((workout) => workout.id);

test('past includes all historical statuses, but excludes today and the future', () => {
  const now = new Date(2026, 9, 22, 21, 36);
  const records = [
    workoutAt('old', new Date(2025, 0, 1)),
    workoutAt('yesterday-completed', new Date(2026, 9, 21, 23, 59, 59, 999)),
    workoutAt('yesterday-skipped', new Date(2026, 9, 21, 18), 'skipped'),
    workoutAt('yesterday-planned', new Date(2026, 9, 21, 12), 'planned'),
    workoutAt('yesterday-active', new Date(2026, 9, 21, 9), 'in_progress'),
    workoutAt('today-midnight', new Date(2026, 9, 22)),
    workoutAt('today', new Date(2026, 9, 22, 12)),
    workoutAt('tomorrow', new Date(2026, 9, 23), 'planned')
  ];
  const originalOrder = records.map((record) => record.id);
  assert.deepEqual(idsInRange(records, 'past', now), originalOrder.slice(0, 5));
  assert.deepEqual(records.map((record) => record.id), originalOrder);
  assert.deepEqual(workoutsInRange([], 'past', now), []);
});

test('today, week, month and planned retain their existing boundaries', () => {
  const now = new Date(2026, 9, 22, 21, 36);
  const records = [
    workoutAt('previous-month', new Date(2026, 8, 30, 23, 59)),
    workoutAt('month-start', new Date(2026, 9, 1)),
    workoutAt('previous-week', new Date(2026, 9, 18, 23, 59)),
    workoutAt('monday', new Date(2026, 9, 19)),
    workoutAt('today-start', new Date(2026, 9, 22)),
    workoutAt('today-end', new Date(2026, 9, 22, 23, 59, 59, 999)),
    workoutAt('tomorrow', new Date(2026, 9, 23), 'planned'),
    workoutAt('next-week', new Date(2026, 9, 26), 'planned'),
    workoutAt('next-month', new Date(2026, 10, 1), 'planned')
  ];
  assert.deepEqual(idsInRange(records, 'today', now), ['today-start', 'today-end']);
  assert.deepEqual(idsInRange(records, 'week', now), ['monday', 'today-start', 'today-end', 'tomorrow']);
  assert.deepEqual(idsInRange(records, 'month', now), ['month-start', 'previous-week', 'monday', 'today-start', 'today-end', 'tomorrow', 'next-week']);
  assert.deepEqual(idsInRange(records, 'planned', now), ['tomorrow', 'next-week', 'next-month']);
});

test('past uses local midnight across daylight saving and year boundaries', () => {
  for (const now of [new Date(2026, 2, 29, 12), new Date(2026, 9, 25, 12), new Date(2027, 0, 1, 12)]) {
    const yesterday = new Date(now);
    yesterday.setHours(0, 0, 0, -1);
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    assert.deepEqual(idsInRange([
      workoutAt('yesterday', yesterday),
      workoutAt('today', midnight)
    ], 'past', now), ['yesterday']);
  }
});
