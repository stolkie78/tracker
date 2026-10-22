import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createRequire } from 'node:module';

const server = await createServer({
  configFile: false,
  resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false },
  appType: 'custom'
});
after(() => server.close());
const { blockTime, buildCycleSchedule, cycleDate, emptyCycleSlot, groupByDayPart, localDate, normalizeCycleSlots, replanCycle } =
  await server.ssrLoadModule('/src/lib/programs.ts');
const templates = new Map([
  ['strength', { id: 'strength', title: 'Strength', type: 'strength' }],
  ['mobility', { id: 'mobility', title: 'Mobility', type: 'recovery' }]
]);
const { buildCalendar } = createRequire(import.meta.url)('../../pb_hooks/calendar_lib.js');
const slotsFor = (weeks) => Array.from({ length: weeks * 7 }, emptyCycleSlot);
const record = (id, template, dayPart, performedAt, status = 'planned') => ({
  id, template, day_part: dayPart, performed_at: performedAt, status
});

test('one, two and three week cycles start on the chosen day and repeat without truncating calendar weeks', () => {
  for (const weeks of [1, 2, 3]) {
    const slots = slotsFor(weeks);
    slots[0].periods.morning = ['strength'];
    slots[weeks * 7 - 1].periods.evening = ['mobility'];
    const entries = buildCycleSchedule('2026-10-21', weeks, 2, slots, templates);
    assert.equal(entries.length, 4);
    assert.equal(localDate(entries[0].date), '2026-10-21');
    assert.equal(localDate(entries[1].date), localDate(cycleDate('2026-10-21', weeks * 7 - 1)));
    assert.equal(localDate(entries[2].date), localDate(cycleDate('2026-10-21', weeks * 7)));
    assert.equal(localDate(entries[3].date), localDate(cycleDate('2026-10-21', weeks * 14 - 1)));
    assert.deepEqual(entries.map((entry) => entry.cycle), [1, 1, 2, 2]);
  }
});

test('each week has an independent pattern with ordered combinations in all dayparts', () => {
  const slots = slotsFor(3);
  slots[0].periods.morning = ['strength', 'mobility', 'strength'];
  slots[0].periods.afternoon = ['mobility'];
  slots[0].periods.evening = ['strength', 'mobility'];
  slots[7].periods.evening = ['mobility'];
  slots[14].periods.afternoon = ['strength'];
  const entries = buildCycleSchedule('2026-10-21', 3, 2, slots, templates);
  assert.equal(entries.length, 16);
  assert.deepEqual(entries.slice(0, 6).map((entry) => [entry.template.id, entry.part, entry.order]), [
    ['strength', 'morning', 0], ['mobility', 'morning', 1], ['strength', 'morning', 2],
    ['mobility', 'afternoon', 0], ['strength', 'evening', 0], ['mobility', 'evening', 1]
  ]);
  assert.equal(localDate(entries[6].date), '2026-10-28');
  assert.equal(localDate(entries[7].date), '2026-11-04');
  assert.equal(localDate(entries[8].date), '2026-11-11');
  const times = entries.slice(0, 6).map(blockTime);
  assert.deepEqual(times.map((time) => time.getHours()), [9, 9, 9, 14, 19, 19]);
  assert.ok(times.every((time, index) => !index || time > times[index - 1]));
  assert.deepEqual(slots[1], emptyCycleSlot(), 'No shared arrays between days');
});

test('calendar date arithmetic remains correct across daylight saving and year boundaries', () => {
  const previous = process.env.TZ;
  try {
    for (const zone of ['Europe/Amsterdam', 'Pacific/Kiritimati', 'America/New_York']) {
      process.env.TZ = zone;
      const slots = slotsFor(2);
      slots[0].periods.morning = ['strength'];
      const entries = buildCycleSchedule('2026-10-21', 2, 2, slots, templates);
      assert.equal(localDate(entries[1].date), '2026-11-04');
      assert.equal(blockTime(entries[1]).getHours(), 9);
      assert.equal(localDate(cycleDate('2026-12-25', 20)), '2027-01-14');
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('invalid dates, lengths, repeat counts and unavailable blocks produce explicit errors', () => {
  for (const date of ['', '2026-02-30', 'not-a-date']) {
    assert.throws(() => buildCycleSchedule(date, 1, 1, slotsFor(1), templates), /start date/);
  }
  for (const weeks of [0, 4, 1.5, NaN]) {
    assert.throws(() => buildCycleSchedule('2026-10-21', weeks, 1, slotsFor(1), templates), /weeks/);
  }
  for (const repeats of [0, 53, 1.5, undefined]) {
    assert.throws(() => buildCycleSchedule('2026-10-21', 1, repeats, slotsFor(1), templates), /repetitions/);
  }
  assert.throws(() => buildCycleSchedule('2026-10-21', 2, 1, slotsFor(1), templates), /daily schedule/);
  const slots = slotsFor(1);
  slots[0].periods.morning = ['missing'];
  assert.throws(() => buildCycleSchedule('2026-10-21', 1, 1, slots, templates), /available workout/);
});

test('saved patterns round-trip and legacy fixed weekday blocks are preserved in the morning', () => {
  const slots = slotsFor(3);
  slots[10].periods.evening = ['strength', 'mobility'];
  const restored = normalizeCycleSlots(JSON.parse(JSON.stringify(slots)), 21);
  assert.deepEqual(restored, slots);
  restored[10].periods.evening.push('strength');
  assert.equal(slots[10].periods.evening.length, 2);
  const legacy = normalizeCycleSlots([{ templates: ['strength', 'mobility'] }, { template: 'strength' }], 7);
  assert.deepEqual(legacy[0].periods, { morning: ['strength', 'mobility'], afternoon: [], evening: [] });
  assert.deepEqual(legacy[1].periods.morning, ['strength']);
  for (const invalid of [{}, [null], [{ periods: [] }], [{ periods: { morning: 'strength' } }]]) {
    assert.throws(() => normalizeCycleSlots(invalid, 7), /invalid/);
  }
});

test('timeline orders dayparts and keeps multiple blocks without inventing a daypart for old sessions', () => {
  const workouts = [
    record('evening', 'strength', 'evening', '2026-10-21T19:00:00'),
    record('mobility', 'mobility', 'morning', '2026-10-21T09:00:01'),
    record('old', 'strength', '', '2026-10-21T08:00:00'),
    record('strength', 'strength', 'morning', '2026-10-21T09:00:00'),
    record('afternoon', 'mobility', 'afternoon', '2026-10-21T14:00:00')
  ];
  const groups = groupByDayPart(workouts);
  assert.deepEqual(groups.map((group) => group.label), ['Morning', 'Afternoon', 'Evening', 'No day part']);
  assert.deepEqual(groups[0].workouts.map((entry) => entry.id), ['strength', 'mobility']);
  assert.equal(workouts[0].id, 'evening');
  assert.deepEqual(groupByDayPart([]), []);
});

test('replanning keeps past and started workouts without duplicating completed blocks today', () => {
  const slots = slotsFor(1);
  slots[0].periods.morning = ['strength', 'mobility', 'strength'];
  slots[0].periods.evening = ['strength'];
  slots[1].periods.morning = ['mobility'];
  const entries = buildCycleSchedule('2026-10-21', 1, 1, slots, templates);
  const existing = [
    record('past', 'strength', 'morning', '2026-10-20T09:00:00'),
    record('done', 'strength', 'morning', '2026-10-21T10:00:00', 'completed'),
    record('active', 'mobility', 'morning', '2026-10-21T10:30:00', 'in_progress'),
    record('today', 'strength', 'evening', '2026-10-21T19:00:00'),
    record('future', 'mobility', 'morning', '2026-10-22T09:00:00')
  ];
  const result = replanCycle(entries, existing, new Date('2026-10-21T12:00:00'));
  assert.deepEqual(result.removable.map((entry) => entry.id), ['today', 'future']);
  assert.deepEqual(result.retained.map((entry) => entry.id), ['past', 'done', 'active']);
  assert.deepEqual(result.pending.map((entry) => [entry.template.id, entry.part]), [
    ['strength', 'morning'], ['strength', 'evening'], ['mobility', 'morning']
  ]);
});

test('calendar export keeps all combined blocks and identifies their dayparts', () => {
  const entries = [
    { id: 'strength', title: 'Strength', type: 'strength', day_part: 'morning', performed_at: '2026-10-21 07:00:00.000Z' },
    { id: 'mobility', title: 'Mobility', type: 'recovery', day_part: 'morning', performed_at: '2026-10-21 07:00:01.000Z' },
    { id: 'evening', title: 'Recovery', type: 'recovery', day_part: 'evening', performed_at: '2026-10-21 17:00:00.000Z' }
  ].map((data) => ({
    id: data.id,
    getString: (name) => data[name] ?? (name === 'status' ? 'planned' : ''),
    getInt: (name) => name === 'duration_minutes' ? 30 : 0,
    getFloat: () => 0
  }));
  const calendar = buildCalendar({ findRecordsByFilter: () => entries }, 'https://example.com', 'owner');
  assert.equal((calendar.match(/BEGIN:VEVENT/g) ?? []).length, 3);
  assert.equal((calendar.match(/Day part: Morning/g) ?? []).length, 2);
  assert.equal((calendar.match(/Day part: Evening/g) ?? []).length, 1);
  assert.ok(calendar.includes('DTSTART:20261021T070000Z'));
  assert.ok(calendar.includes('DTSTART:20261021T070001Z'));
  assert.ok(calendar.includes('UID:evening@top-trainer'));
});
