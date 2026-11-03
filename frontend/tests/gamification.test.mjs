import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { activityProgress, goalForWeek, setWeeklyGoal, weekKey } = await server.ssrLoadModule('/src/lib/gamification.ts');
const now = new Date('2026-11-04T12:00:00');
const session = (id, date = '2026-11-03T12:00:00', extra = {}) => ({
  id, owner: 'athlete', type: 'strength', status: 'completed', performed_at: date, ...extra
});
const weekSessions = (date, count = 3) => Array.from({ length: count }, (_, i) => session(`${date}-${i}`, `${date}T12:00:00`));

test('empty history has a realistic default goal and no invented achievements', () => {
  const result = activityProgress([], [], now);
  assert.equal(result.target, 3);
  assert.equal(result.streak, 0);
  assert.equal(result.bestStreak, 0);
  assert.equal(result.completed, 0);
  assert.equal(result.badges.filter((badge) => badge.earned).length, 0);
  assert.equal(result.recentWeeks.length, 8);
});

test('only completed non-dietary sessions up to now count; duplicate ids and imports count once', () => {
  const result = activityProgress([
    session('one'), session('one'), session('two', undefined, { type: 'recovery' }),
    session('future', '2026-11-05T12:00:00'), session('invalid', 'bad-date'),
    session('planned', undefined, { status: 'planned' }), session('skipped', undefined, { status: 'skipped' }),
    session('active', undefined, { status: 'in_progress' }),
    ...['fasting', 'diet', 'omad'].map((wellness_activity) => session(wellness_activity, undefined, { type: 'wellness', wellness_activity })),
    session('breathing', undefined, { type: 'wellness', wellness_activity: 'breathing' }),
    session('import-one', undefined, { strava_id: '123' }), session('import-two', undefined, { strava_id: '123' })
  ], [], now);
  assert.equal(result.completed, 4);
  assert.equal(result.streak, 1);
});

test('weekly streak waits for the current week, breaks at a missed finished week, and tracks best streak', () => {
  const history = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'].flatMap((date) => weekSessions(date));
  assert.equal(activityProgress(history, [], now).streak, 4);
  assert.equal(activityProgress(history, [], now).bestStreak, 4);
  assert.equal(activityProgress(history, [], now).badges.find((badge) => badge.id === 'consistency').earned, true);
  assert.equal(activityProgress(history, [], new Date('2026-11-09T12:00:00')).streak, 0);
  assert.equal(activityProgress([...history, ...weekSessions('2026-11-02')], [], now).streak, 5);
  assert.equal(activityProgress(history.filter((workout) => !workout.id.startsWith('2026-10-19')), [], now).streak, 1);
});

test('goal changes are validated, persist by week, and leave historical targets unchanged', () => {
  const goals = setWeeklyGoal([], 2, now);
  assert.equal(goalForWeek(goals, '2026-10-26'), 3);
  assert.equal(goalForWeek(goals, '2026-11-02'), 2);
  assert.equal(goalForWeek(goals, '2026-11-09'), 2);
  const changed = setWeeklyGoal(goals, 1, now);
  assert.equal(changed.length, 1);
  const next = setWeeklyGoal(changed, 4, new Date('2026-11-09T12:00:00'));
  assert.equal(goalForWeek(next, '2026-11-02'), 1);
  assert.equal(goalForWeek(next, '2026-11-09'), 4);
  assert.equal(activityProgress(weekSessions('2026-11-02', 2), goals, now).streak, 1);
  assert.equal(goals[0].target, 2, 'No mutation');
  for (const invalid of [0, 8, 1.5, NaN, Infinity, '3']) assert.throws(() => setWeeklyGoal([], invalid, now));
});

test('milestones use exact thresholds and recalculate after edits without duplicate awards', () => {
  const workouts = [
    ...Array.from({ length: 10 }, (_, i) => session(`strength-${i}`)),
    ...Array.from({ length: 5 }, (_, i) => session(`recovery-${i}`, undefined, { type: 'recovery' })),
    session('walk', undefined, { type: 'life', cardio_mode: 'walking', distance_km: 60 }),
    session('hike', undefined, { type: 'life', cardio_mode: 'hiking', distance_km: 40 }),
    session('cycle', undefined, { type: 'life', cardio_mode: 'cycling', distance_km: 500 })
  ];
  const badges = activityProgress(workouts, [], now).badges;
  for (const id of ['first', 'ten', 'strength', 'recovery', 'walking']) assert.equal(badges.find((badge) => badge.id === id).earned, true);
  const corrected = workouts.map((workout) => workout.id === 'hike' ? { ...workout, distance_km: 39.9 } : workout);
  assert.equal(activityProgress(corrected, [], now).badges.find((badge) => badge.id === 'walking').earned, false);
  const almost = workouts.map((workout) => workout.id === 'hike' ? { ...workout, distance_km: 39.99 } : workout);
  assert.equal(activityProgress(almost, [], now).badges.find((badge) => badge.id === 'walking').earned, false);
  assert.deepEqual(activityProgress([...workouts, ...workouts], [], now).badges, badges);
  const undone = workouts.map((workout) => ({ ...workout, status: 'planned' }));
  assert.equal(activityProgress(undone, [], now).badges.some((badge) => badge.earned), false);
});

test('calendar weeks start on local Monday across DST and year boundaries', () => {
  const timezone = process.env.TZ;
  try {
    for (const zone of ['Europe/Amsterdam', 'America/New_York', 'Pacific/Kiritimati', 'Pacific/Honolulu']) {
      process.env.TZ = zone;
      assert.equal(weekKey(new Date(2026, 10, 1, 23, 59)), '2026-10-26');
      assert.equal(weekKey(new Date(2026, 10, 2, 0, 0)), '2026-11-02');
      assert.equal(weekKey(new Date(2027, 0, 1, 12)), '2026-12-28');
      const history = ['2026-10-19', '2026-10-26', '2026-11-02'].flatMap((date) => weekSessions(date));
      assert.equal(activityProgress(history, [], new Date(2026, 10, 4, 12)).streak, 3);
    }
  } finally {
    if (timezone === undefined) delete process.env.TZ;
    else process.env.TZ = timezone;
  }
});

test('profile hook rejects malformed goals and allows existing profiles without goals', () => {
  let validate;
  vm.runInNewContext(readFileSync(new URL('../../pb_hooks/profile.pb.js', import.meta.url), 'utf8'), {
    onRecordValidate(fn, collection) { if (collection === 'profiles') validate = fn; },
    BadRequestError: Error
  });
  const check = (goals) => {
    let continued = false;
    validate({
      record: { getString: (key) => key === 'weekly_goals' ? goals : '', getFloat: () => 0 },
      next() { continued = true; }
    });
    assert.equal(continued, true);
  };
  for (const value of ['', 'null', '[]', '[{"week":"2026-11-02","target":3}]']) check(value);
  for (const value of [
    '{}', 'invalid', '[null]', '[{"week":"2026-11-02","target":0}]',
    '[{"week":"2026-11-03","target":3}]', '[{"week":"2026-02-30","target":3}]',
    '[{"week":"2026-11-02","target":3},{"week":"2026-11-02","target":2}]',
    '[{"week":"2026-11-02","target":"3"}]'
  ]) assert.throws(() => check(value));
});
