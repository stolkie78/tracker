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
const { cycleChoice } = await server.ssrLoadModule('/src/lib/choices.ts');

test('fixed choices advance once and wrap back to the first value', () => {
  const options = [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' }
  ];
  assert.equal(cycleChoice(options, 'morning')?.value, 'afternoon');
  assert.equal(cycleChoice(options, 'afternoon')?.value, 'evening');
  assert.equal(cycleChoice(options, 'evening')?.value, 'morning');
  assert.equal(options[0].value, 'morning', 'Do not mutate option order');
});

test('numeric choices retain numbers, including wraparound', () => {
  const options = [1, 2, 3].map((value) => ({ value, label: `${value} weeks` }));
  assert.equal(cycleChoice(options, 1)?.value, 2);
  assert.equal(cycleChoice(options, 3)?.value, 1);
});

test('empty, single, missing and blank values are handled without fabricating options', () => {
  assert.equal(cycleChoice([], 'missing'), undefined);
  assert.equal(cycleChoice([{ value: 'machine', label: 'Machine' }], '')?.value, 'machine');
  const options = [{ value: '', label: 'All' }, { value: 'strength', label: 'Strength' }];
  assert.equal(cycleChoice(options, '')?.value, 'strength');
  assert.equal(cycleChoice(options, 'strength')?.value, '');
  assert.equal(cycleChoice(options, 'deleted')?.value, '');
});
