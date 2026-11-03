import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { buildFreePeriod, countPeriodTargets, cycleDate, localDate, normalizePeriodTargets, replanFreePeriod, groupFreePeriods, groupPeriodWorkouts } =
  await server.ssrLoadModule('/src/lib/programs.ts');
const { workoutsInRange, openPastWorkouts } = await server.ssrLoadModule('/src/lib/workouts.ts');
const { buildCalendar } = createRequire(import.meta.url)('../../pb_hooks/calendar_lib.js');
const templates = new Map([
  ['run', { id: 'run', title: 'Run', type: 'cardio', cardio_mode: 'running' }],
  ['walk', { id: 'walk', title: 'Walk', type: 'life', cardio_mode: 'walking' }],
  ['bike', { id: 'bike', title: 'Bike', type: 'cardio', cardio_mode: 'cycling' }],
  ['strength', { id: 'strength', title: 'Strength', type: 'strength' }]
]);
const targets = [{ template: 'run', count: 2 }, { template: 'walk', count: 3 }, { template: 'bike', count: 1 }, { template: 'strength', count: 2 }];
const plan = { id: 'period', title: 'My period', schedule_mode: 'free_period', start_date: '2026-10-21', end_date: '2026-10-27' };
const records = buildFreePeriod('2026-10-21', 1, targets, templates).map((template, index) => ({
  ...template, template: template.id, id: `workout-${index}`, plan: plan.id, free_period: true, status: 'planned', performed_at: ''
}));

test('the requested mix is eight undated sessions for the entire period, for every supported duration', () => {
  for (const weeks of [1, 2, 3, 4]) {
    const entries = buildFreePeriod('2026-10-21', weeks, targets, templates);
    assert.equal(entries.length, 8);
    assert.deepEqual(entries.map((entry) => entry.id), ['run', 'run', 'walk', 'walk', 'walk', 'bike', 'strength', 'strength']);
    assert.ok(entries.every((entry) => !('performed_at' in entry) && !('date' in entry)));
    assert.equal(localDate(cycleDate('2026-10-21', weeks * 7 - 1)), ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17'][weeks - 1]);
  }
});

test('invalid dates, durations, counts, missing templates and totals over 200 are rejected', () => {
  for (const weeks of [0, 5, 1.5, NaN]) assert.throws(() => buildFreePeriod('2026-10-21', weeks, targets, templates), /weeks/);
  for (const date of ['', '2026-02-30', 'invalid']) assert.throws(() => buildFreePeriod(date, 1, targets, templates), /date/);
  for (const count of [0, -1, 1.5, NaN, 201, undefined]) assert.throws(() => buildFreePeriod('2026-10-21', 1, [{ template: 'run', count }], templates), /number/);
  assert.throws(() => buildFreePeriod('2026-10-21', 1, [{ template: 'missing', count: 1 }], templates), /available/);
  assert.throws(() => buildFreePeriod('2026-10-21', 1, [{ template: 'run', count: 200 }, { template: 'walk', count: 1 }], templates), /at most 200/);
  assert.equal(buildFreePeriod('2026-10-21', 1, [{ template: 'run', count: 200 }], templates).length, 200);
  assert.deepEqual(normalizePeriodTargets(targets), targets);
  assert.notEqual(normalizePeriodTargets(targets)[0], targets[0]);
  for (const raw of [null, {}, [null], [{ template: 1, count: 2 }], [{ template: 'run', count: '2' }], [{ template: 'run', count: 201 }]]) {
    assert.throws(() => normalizePeriodTargets(raw), /invalid/);
  }
});

test('progress is grouped by period and activity, including more than one template per activity', () => {
  const completed = { ...records[0], status: 'completed', performed_at: '2026-10-23T10:00:00Z' };
  const extraRun = { ...records[1], id: 'other-run', template: 'long-run', title: 'Long run' };
  const result = groupFreePeriods([plan], [completed, ...records.slice(1), extraRun], new Date(2026, 9, 24));
  assert.equal(result.length, 1);
  assert.equal(result[0].total, 9);
  assert.equal(result[0].completed, 1);
  assert.deepEqual(result[0].groups.map((group) => [group.label, group.workouts.length, group.completed]), [
    ['Cardio · Running', 3, 1], ['Life · Walking', 3, 0], ['Cardio · Cycling', 1, 0], ['Strength', 2, 0]
  ]);
  const second = { ...plan, id: 'second-period' };
  assert.equal(groupFreePeriods([plan, second], records, new Date(2026, 9, 24)).length, 1);
  const filtered = groupFreePeriods([plan], records.filter((record) => record.type === 'life'), new Date(2026, 9, 24));
  assert.equal(filtered[0].total, 3);
  assert.equal(filtered[0].groups.length, 1);
});

test('overdue open sessions stay available; finished periods can be reopened explicitly', () => {
  const later = new Date(2026, 10, 10);
  assert.equal(groupFreePeriods([plan], records, later).length, 1);
  assert.equal(groupFreePeriods([plan], [{ ...records[0], status: 'in_progress' }], later).length, 1);
  const done = records.map((record) => ({ ...record, status: 'completed' }));
  assert.equal(groupFreePeriods([plan], done, later).length, 0);
  assert.equal(groupFreePeriods([plan], done, later, true).length, 1);
  assert.equal(groupFreePeriods([{ ...plan, start_date: '2027-01-01', end_date: '2027-01-28' }], records, later).length, 1);
});

test('compact workout rows count repeated sessions and prioritize a started session', () => {
  const sessions = [
    { ...records[0], status: 'completed' },
    records[1],
    { ...records[1], id: 'started', status: 'in_progress' },
    { ...records[1], id: 'skipped', status: 'skipped' },
    { ...records[1], id: 'long-run', template: 'long-run', title: 'Long run' }
  ];
  const groups = groupPeriodWorkouts(sessions);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Run');
  assert.equal(groups[0].workouts.length, 4);
  assert.equal(groups[0].completed, 1);
  assert.equal(groups[0].remaining, 2);
  assert.equal(groups[0].next.id, 'started');
  assert.equal(groups[1].next.id, 'long-run');
  assert.deepEqual(groupPeriodWorkouts([]), []);
  const finished = groupPeriodWorkouts([{ ...records[0], status: 'completed' }, { ...records[1], status: 'skipped' }]);
  assert.equal(finished[0].next, undefined);
  assert.equal(finished[0].remaining, 0);
  assert.equal(finished[0].workouts.length, 2, 'History and skipped sessions stay accessible');
  assert.equal(groupPeriodWorkouts([records[0], records[1]])[0].next.id, records[0].id);
  assert.equal(sessions[2].status, 'in_progress', 'Grouping never changes the input');
});

test('nutrition activities count program targets in days while breathing remains a session', () => {
  const wellnessTemplates = new Map([
    ['omad', { id: 'omad', title: 'OMAD', type: 'wellness', wellness_activity: 'omad' }],
    ['breathing', { id: 'breathing', title: 'Breathing', type: 'wellness', wellness_activity: 'breathing' }]
  ]);
  assert.deepEqual(countPeriodTargets([
    { template: 'omad', count: 5 }, { template: 'breathing', count: 3 }, { template: 'missing', count: 2 }
  ], wellnessTemplates), { days: 5, sessions: 3 });
  const omadWorkouts = buildFreePeriod('2026-10-21', 1, [{ template: 'omad', count: 2 }], wellnessTemplates)
    .map((template, index) => ({ ...template, id: `omad-${index}`, template: template.id, plan: plan.id, free_period: true, status: index ? 'planned' : 'completed' }));
  const grouped = groupFreePeriods([plan], omadWorkouts, new Date(2026, 9, 24));
  assert.equal(grouped[0].groups[0].label, 'Wellness · OMAD');
  assert.equal(grouped[0].groups[0].unit, 'day');
  assert.equal(groupPeriodWorkouts(omadWorkouts)[0].unit, 'day');
});

test('editing subtracts completed, active and skipped sessions by template without using their execution date', () => {
  const existing = [
    { ...records[0], status: 'completed', performed_at: '2026-11-20T10:00:00Z' },
    { ...records[2], status: 'in_progress', performed_at: '2026-11-21T10:00:00Z' },
    { ...records[5], status: 'skipped' },
    records[1], records[3], records[4], records[6], records[7]
  ];
  const result = replanFreePeriod(buildFreePeriod('2026-10-21', 1, targets, templates), existing);
  assert.equal(result.removable.length, 5);
  assert.equal(result.retained.length, 3);
  assert.deepEqual(result.pending.map((template) => template.id), ['run', 'walk', 'walk', 'strength', 'strength']);
  const reduced = replanFreePeriod([templates.get('run')], existing);
  assert.equal(reduced.retained.length, 3, 'Lower targets never remove executed or active sessions');
  assert.equal(reduced.pending.length, 0);
});

test('open free workouts never enter date filters or the overdue dated-workout count', () => {
  const now = new Date(2026, 9, 24, 12);
  const today = new Date(2026, 9, 24, 10).toISOString();
  const yesterday = new Date(2026, 9, 23, 10).toISOString();
  const free = [
    records[0],
    { ...records[1], status: 'in_progress', performed_at: yesterday },
    { ...records[2], status: 'skipped', performed_at: yesterday }
  ];
  const completed = { ...records[3], status: 'completed', performed_at: today };
  for (const filter of ['today', 'week', 'month', 'past', 'planned']) {
    assert.deepEqual(workoutsInRange(free, filter, now), []);
  }
  assert.deepEqual(openPastWorkouts(free, now), []);
  assert.deepEqual(workoutsInRange([...free, completed], 'today', now), [completed]);
  assert.deepEqual(workoutsInRange([...free, { ...completed, performed_at: yesterday }], 'past', now).map((record) => record.id), [completed.id]);
});

test('calendar emits completed free sessions at the execution time and preserves scheduled sessions', () => {
  const data = [
    { ...records[0] },
    { ...records[1], status: 'in_progress', performed_at: '2026-10-24T10:00:00Z' },
    { ...records[2], status: 'completed', performed_at: '2026-10-25T11:00:00Z' },
    { ...records[5], id: 'fixed', free_period: false, performed_at: '2026-10-26T09:00:00Z' }
  ];
  const app = { findRecordsByFilter: (collection, filter) => {
    assert.match(filter, /free_period = false \|\| status = 'completed'/);
    return data.map((record) => ({
      id: record.id,
      getString: (name) => record[name] ?? '',
      getBool: (name) => Boolean(record[name]),
      getInt: (name) => name === 'duration_minutes' ? 30 : 0,
      getFloat: () => 0
    }));
  } };
  const calendar = buildCalendar(app, 'https://example.com', 'owner');
  assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.match(calendar, /DTSTART:20261025T110000Z/);
  assert.match(calendar, /UID:fixed@top-trainer/);
  assert.ok(!calendar.includes(`UID:${records[0].id}@top-trainer`));
  assert.ok(!calendar.includes(`UID:${records[1].id}@top-trainer`));
});
