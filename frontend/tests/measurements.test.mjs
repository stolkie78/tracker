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
const { calculateBMI, measurementChart, measurementDateLabel, measurementStats } = await server.ssrLoadModule('/src/lib/measurements.ts');

test('measurement labels preserve the calendar day in extreme timezones', () => {
  const timezone = process.env.TZ;
  try {
    for (const zone of ['Pacific/Kiritimati', 'Pacific/Honolulu', 'Europe/Amsterdam']) {
      process.env.TZ = zone;
      assert.equal(measurementDateLabel('2026-01-01 12:00:00.000Z'), '1-1-2026');
    }
  } finally {
    if (timezone === undefined) delete process.env.TZ;
    else process.env.TZ = timezone;
  }
});

test('BMI uses kilograms and centimetres, rounds once, and rejects missing or invalid values', () => {
  assert.equal(calculateBMI(80, 180), 24.7);
  assert.equal(calculateBMI(100, 200), 25);
  for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(calculateBMI(invalid, 180), null);
    assert.equal(calculateBMI(80, invalid), null);
  }
});

const measurement = (daysAgo, weight, height = 180, created = '') => ({
  id: String(daysAgo), owner: 'test-user', weight_kg: weight, height_cm: height, created,
  measured_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString()
});

test('measurement history is chronological and respects every statistics period', () => {
  const records = [measurement(1, 80), measurement(400, 90), measurement(50, 85), measurement(200, 87)];
  for (const [period, count, change] of [['4w', 1, null], ['12w', 2, -5], ['1y', 3, -7], ['all', 4, -10]]) {
    const stats = measurementStats(records, period);
    assert.equal(stats.entries.length, count);
    assert.equal(stats.latest.weight_kg, 80);
    assert.equal(stats.weightChange, change);
    assert.equal(stats.bmi, 24.7);
  }
  assert.equal(records[0].weight_kg, 80, 'Do not mutate the input order');
});

test('empty periods have no fabricated weight, BMI or change', () => {
  const stats = measurementStats([measurement(100, 80)], '4w');
  assert.deepEqual(stats.entries, []);
  assert.equal(stats.latest, undefined);
  assert.equal(stats.bmi, null);
  assert.equal(stats.weightChange, null);
});

test('historical BMI uses each recorded height and same-day measurements use creation order', () => {
  const first = measurement(1, 80, 200, '2026-01-01 08:00:00Z');
  const latest = { ...first, id: 'latest', height_cm: 180, weight_kg: 81, created: '2026-01-01 09:00:00Z' };
  const stats = measurementStats([latest, first], 'all');
  assert.equal(stats.latest.id, 'latest');
  assert.equal(calculateBMI(stats.entries[0].weight_kg, stats.entries[0].height_cm), 20);
  assert.equal(stats.bmi, 25);
  assert.equal(stats.weightChange, 1);
});

test('measurement chart uses actual dates and values, sorted without mutating the input', () => {
  const entries = [
    { ...measurement(0, 80), measured_at: '2026-10-20 12:00:00Z' },
    { ...measurement(0, 90), measured_at: '2026-10-10 12:00:00Z' },
    { ...measurement(0, 85), measured_at: '2026-10-12 12:00:00Z' }
  ];
  const chart = measurementChart(entries, 'weight');
  assert.equal(chart.min, 80);
  assert.equal(chart.max, 90);
  assert.deepEqual(chart.points.map(({ x, y }) => ({ x, y })), [
    { x: 55, y: 30 }, { x: 139, y: 85 }, { x: 475, y: 140 }
  ]);
  assert.equal(entries[0].weight_kg, 80);
});

test('chart handles empty, single and constant values without invalid coordinates', () => {
  assert.deepEqual(measurementChart([], 'weight'), { min: 0, max: 0, points: [] });
  const single = measurementChart([measurement(1, 80)], 'weight');
  assert.equal(single.points[0].x, 265);
  assert.equal(single.points[0].y, 85);
  const flat = measurementChart([measurement(1, 80), measurement(2, 80)], 'weight');
  assert.ok(flat.points.every((point) => point.y === 85 && Number.isFinite(point.x)));
});

test('chart uses historic BMI and omits absent waist values instead of plotting zero', () => {
  const entries = [
    { ...measurement(2, 80, 200), waist_cm: 90 },
    { ...measurement(1, 81, 180), waist_cm: 0 }
  ];
  assert.deepEqual(measurementChart(entries, 'bmi').points.map((point) => point.value), [20, 25]);
  assert.deepEqual(measurementChart(entries, 'waist').points.map((point) => point.value), [90]);
});
