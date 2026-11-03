import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  resolve: { alias: { $lib: fileURLToPath(new URL('../src/lib', import.meta.url)) } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, ws: false }, appType: 'custom'
});
after(() => server.close());
const { applyCatalog, activityOptions, equipmentOptions, effectiveCatalog, effectiveExercises } = await server.ssrLoadModule('/src/lib/catalog.ts');
const types = await server.ssrLoadModule('/src/lib/types/index.ts');
const entry = (key, kind, categories, active = true) => ({ id: key, key, kind, categories, active, label: key.toUpperCase() });

test('catalog choices follow categories, preserve archived labels and exclude archived choices from new input', () => {
  const records = [
    entry('running', 'movement', ['cardio', 'interval']),
    entry('cycling', 'movement', ['life', 'cardio', 'interval']),
    entry('custom_paddling', 'movement', ['life']),
    entry('old_walk', 'movement', ['life'], false),
    entry('yoga', 'recovery', ['recovery']),
    entry('tennis', 'sport', ['sport']),
    entry('custom_machine', 'equipment', ['strength']),
    entry('old_machine', 'equipment', ['strength'], false)
  ];
  applyCatalog(records);
  assert.deepEqual(activityOptions('life').map((option) => option.value), ['cycling', 'custom_paddling']);
  assert.deepEqual(activityOptions('interval').map((option) => option.value), ['running', 'cycling']);
  assert.equal(activityOptions('life', 'old_walk').at(-1).label, 'OLD_WALK (inactive)');
  assert.equal(activityOptions('life', 'running')[0].label, 'RUNNING (inactive)', 'Existing selections survive category changes');
  assert.deepEqual(equipmentOptions(['custom_machine', 'old_machine']), ['custom_machine']);
  assert.deepEqual(equipmentOptions(['custom_machine', 'old_machine'], 'old_machine'), ['custom_machine', 'old_machine']);
  assert.deepEqual(equipmentOptions(['custom_machine'], 'old_machine'), ['custom_machine', 'old_machine'], 'Preserve an existing prescription even if equipment is removed from the exercise');
  assert.deepEqual(types.LIFE_ACTIVITY_OPTIONS.map((option) => option.value), ['cycling', 'custom_paddling']);
  assert.deepEqual(types.EXERCISE_EQUIPMENT_OPTIONS.map((option) => option.value), ['custom_machine']);
  assert.equal(types.exerciseLabel('Squat', 'custom_machine'), 'Squat · CUSTOM_MACHINE');
  assert.equal(types.templateLabel({ title: 'River trip', type: 'life', cardio_mode: 'custom_paddling' }), 'CUSTOM_PADDLING · River trip');
  applyCatalog(records.map((record) => ({ ...record, label: 'Renamed', active: record.key !== 'custom_paddling' })));
  assert.equal(types.CARDIO_MODE_LABELS.custom_paddling, 'Renamed');
  assert.ok(!activityOptions('life').some((option) => option.value === 'custom_paddling'));
  assert.equal(activityOptions('life', 'custom_paddling').find((option) => option.value === 'custom_paddling').label, 'Renamed (inactive)');
  applyCatalog([
    entry('cycling', 'movement', ['life']),
    entry('breathing', 'wellness', ['wellness']),
    entry('diet', 'wellness', ['wellness']),
    entry('omad', 'wellness', ['wellness']),
    entry('fasting', 'wellness', ['wellness'])
  ]);
  assert.equal(types.CARDIO_MODE_LABELS.custom_paddling, undefined, 'Labels from a previous account are removed');
  assert.equal(types.EXERCISE_EQUIPMENT_LABELS.custom_machine, undefined);
  assert.deepEqual(activityOptions('life').map((option) => option.value), ['cycling']);
  assert.deepEqual(activityOptions('wellness').map((option) => option.value), ['breathing', 'diet', 'omad', 'fasting']);
  assert.equal(types.templateLabel({ title: 'Daily fast', type: 'wellness', wellness_activity: 'fasting' }), 'FASTING · Daily fast');
  assert.equal(types.isDietaryActivity('wellness', 'omad'), true);
  assert.equal(types.isDietaryActivity('wellness', 'breathing'), false);
  assert.equal(activityOptions('life', 'legacy_choice').find((option) => option.value === 'legacy_choice').label, 'legacy_choice (inactive)');
});

test('personal versions replace standard choices, including inactive versions, without changing original records', () => {
  const standard = { ...entry('rowing', 'movement', ['cardio']), owner: '' };
  const personal = { ...standard, id: 'my-rowing', owner: 'me', label: 'My rowing', categories: ['life'], active: false };
  assert.deepEqual(effectiveCatalog([personal, standard]), [personal]);
  assert.deepEqual(effectiveCatalog([standard, personal]), [personal]);
  applyCatalog([standard, personal]);
  assert.deepEqual(activityOptions('cardio'), []);
  assert.deepEqual(activityOptions('life'), []);
  assert.equal(activityOptions('cardio', 'rowing')[0].label, 'My rowing (inactive)');
  assert.equal(types.CARDIO_MODE_LABELS.rowing, 'My rowing');
  applyCatalog([standard]);
  assert.equal(types.CARDIO_MODE_LABELS.rowing, 'ROWING', 'Another account still uses the shared label');
  assert.equal(standard.active, true);

  const exercise = { id: 'squat', owner: '', name: 'Squat', active: true };
  const custom = { ...exercise, id: 'my-squat', owner: 'me', source_id: 'squat', active: false };
  assert.deepEqual(effectiveExercises([exercise, custom]), [custom]);
  assert.deepEqual(effectiveExercises([exercise]), [exercise]);
});
