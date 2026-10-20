import assert from 'node:assert/strict';
import test from 'node:test';

// Run only against a disposable instance after setup-collections.sh.
const base = process.env.PB_TEST_URL;
const identity = process.env.PB_TEST_SUPERUSER_EMAIL;
const password = process.env.PB_TEST_SUPERUSER_PASSWORD;

test('personal records, relationships and protected photos stay with their owner', {
  skip: !base || !identity || !password
}, async () => {
  const records = [];
  let adminToken = '';
  const request = async (path, token = '', method = 'GET', body) => {
    const response = await fetch(`${base}/api/${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: token } : {}),
        ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {})
      },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  };
  const ok = async (...args) => {
    const result = await request(...args);
    assert.ok(result.status >= 200 && result.status < 300, `${args[0]}: ${JSON.stringify(result)}`);
    return result.data;
  };
  const denied = async (...args) => {
    const result = await request(...args);
    assert.ok([400, 401, 403, 404].includes(result.status), `${args[0]} unexpectedly allowed: ${JSON.stringify(result)}`);
  };
  const path = (collection, id = '') => `collections/${collection}/records${id ? `/${id}` : ''}`;
  const create = async (collection, token, data) => {
    const record = await ok(path(collection), token, 'POST', data);
    records.push([collection, record.id]);
    return record;
  };

  try {
    adminToken = (await ok('collections/_superusers/auth-with-password', '', 'POST', { identity, password })).token;
    const users = [];
    for (const role of ['athlete', 'coach', 'admin']) {
      const email = `isolation-${crypto.randomUUID()}@example.com`;
      const userPassword = crypto.randomUUID();
      const user = await create('users', '', { email, password: userPassword, passwordConfirm: userPassword });
      const { token } = await ok('collections/users/auth-with-password', '', 'POST', { identity: email, password: userPassword });
      const profile = await create('profiles', token, { user: user.id, display_name: role, role: 'athlete' });
      if (role !== 'athlete') await ok(path('profiles', profile.id), adminToken, 'PATCH', { role });
      users.push({ ...user, token, profile });
    }
    const [alice, bob, carol] = users;
    const date = '2026-01-01 12:00:00.000Z';
    const exercise = await create('exercises', alice.token, { owner: alice.id, name: 'Private movement', category: 'other', active: true });
    const plan = await create('training_plans', alice.token, { owner: alice.id, title: 'Private plan', goal: 'Fitness', start_date: date, end_date: date, weeks: 1 });
    const template = await create('workout_templates', alice.token, { owner: alice.id, title: 'Private template', type: 'strength' });
    const prescription = { exercise: exercise.id, set_order: 1, target_sets: 3, reps_min: 6, reps_max: 10, weight_increment: 1 };
    const templateExercise = await create('template_exercises', alice.token, { ...prescription, owner: alice.id, template: template.id });
    const workout = await create('workouts', alice.token, { owner: alice.id, plan: plan.id, template: template.id, title: 'Private workout', type: 'strength', status: 'planned', performed_at: date });
    const workoutExercise = await create('workout_exercises', alice.token, { ...prescription, owner: alice.id, workout: workout.id });
    const set = await create('workout_sets', alice.token, { owner: alice.id, workout_exercise: workoutExercise.id, set_order: 1, weight: 40 });
    const health = await create('health_programs', alice.token, { owner: alice.id, kind: '16_8', title: 'Private health', start_date: '2026-01-01' });
    const checkin = await create('health_checkins', alice.token, { owner: alice.id, program: health.id, date: '2026-01-01' });
    const ai = await create('ai_settings', alice.token, { owner: alice.id, endpoint: 'https://example.com', model: 'test', api_key: 'test-only' });
    const measurementData = { measured_at: date, weight_kg: 80, height_cm: 180, waist_cm: 85 };
    const measurement = await create('body_measurements', alice.token, { ...measurementData, owner: alice.id });
    const personal = [
      ['exercises', exercise], ['training_plans', plan], ['workout_templates', template],
      ['template_exercises', templateExercise], ['workouts', workout], ['workout_exercises', workoutExercise],
      ['workout_sets', set], ['health_programs', health], ['health_checkins', checkin],
      ['ai_settings', ai], ['body_measurements', measurement], ['profiles', alice.profile], ['users', alice]
    ];
    for (const [collection, record] of personal) {
      await ok(path(collection, record.id), alice.token);
      for (const stranger of [bob, carol, { token: '' }]) {
        const list = await ok(`${path(collection)}?filter=${encodeURIComponent(`id="${record.id}"`)}`, stranger.token);
        assert.equal(list.items.length, 0, `${collection} leaked in list`);
        await denied(path(collection, record.id), stranger.token);
        await denied(path(collection, record.id), stranger.token, 'PATCH', {});
        await denied(path(collection, record.id), stranger.token, 'DELETE');
      }
      if (record.owner) {
        await denied(path(collection, record.id), alice.token, 'PATCH', { owner: bob.id });
      }
    }
    await denied(path('body_measurements'), bob.token, 'POST', { ...measurementData, owner: alice.id });
    await denied(path('profiles'), alice.token, 'POST', { user: alice.id, display_name: 'Duplicate', role: 'athlete' });
    await denied(path('profiles'), bob.token, 'POST', { user: alice.id, display_name: 'Spoof', role: 'athlete' });
    await denied(path('profiles', alice.profile.id), alice.token, 'PATCH', { user: bob.id });
    await denied(path('profiles', alice.profile.id), alice.token, 'PATCH', { role: 'admin' });
    await denied(path('profiles', alice.profile.id), alice.token, 'DELETE');
    await ok(path('profiles', alice.profile.id), alice.token, 'PATCH', { display_name: 'Updated', height_cm: 180, phone: '123', bio: 'My goals', birth_date: '1990-01-01 12:00:00Z' });
    await denied(path('profiles', alice.profile.id), alice.token, 'PATCH', { birth_date: '2099-01-01 12:00:00Z' });
    await denied(path('profiles', alice.profile.id), alice.token, 'PATCH', { height_cm: 10 });
    await denied(path('body_measurements'), alice.token, 'POST', { ...measurementData, owner: alice.id, weight_kg: -1 });
    await denied(path('body_measurements'), alice.token, 'POST', { ...measurementData, owner: alice.id, height_cm: 0 });
    await denied(path('body_measurements'), alice.token, 'POST', { ...measurementData, owner: alice.id, measured_at: '2099-01-01 12:00:00Z' });
    await denied(path('body_measurements', measurement.id), alice.token, 'PATCH', { measured_at: '2099-01-01 12:00:00Z' });
    const sorted = await ok(`${path('body_measurements')}?sort=-measured_at,-created`, alice.token);
    assert.equal(sorted.items[0].id, measurement.id);
    assert.equal((await ok(path('ai_settings', ai.id), alice.token)).api_key, undefined);
    await ok(path('workouts', workout.id), alice.token, 'PATCH', { owner: alice.id, plan: plan.id, template: template.id, status: 'completed' });
    await ok(path('workout_exercises', workoutExercise.id), alice.token, 'PATCH', { workout: workout.id, exercise: exercise.id, starting_weight: 42 });
    await ok(path('workout_sets', set.id), alice.token, 'PATCH', { workout_exercise: workoutExercise.id, weight: 42, reps: 8, completed: true });

    // All parent links must belong to the creator; even knowing an ID is insufficient.
    for (const [collection, data] of [
      ['workouts', { title: 'Bad', type: 'strength', status: 'planned', performed_at: date, plan: plan.id }],
      ['workouts', { title: 'Bad', type: 'strength', status: 'planned', performed_at: date, template: template.id }],
      ['template_exercises', { ...prescription, template: template.id }],
      ['workout_exercises', { ...prescription, workout: workout.id }],
      ['workout_sets', { workout_exercise: workoutExercise.id, set_order: 1 }],
      ['health_checkins', { program: health.id, date: '2026-01-01' }]
    ]) {
      await denied(path(collection), bob.token, 'POST', { ...data, owner: bob.id });
    }
    const bobWorkout = await create('workouts', bob.token, { owner: bob.id, title: 'Own workout', type: 'strength', status: 'planned', performed_at: date });
    await denied(path('workout_exercises'), bob.token, 'POST', { ...prescription, owner: bob.id, workout: bobWorkout.id });
    await denied(path('workouts', bobWorkout.id), bob.token, 'PATCH', { plan: plan.id });
    const shared = (await ok(`${path('exercises')}?filter=${encodeURIComponent('owner=""')}`, bob.token)).items[0];
    assert.ok(shared, 'Seeded catalog should remain readable');
    await denied(path('exercises', shared.id), bob.token, 'PATCH', { name: 'Not allowed' });
    await ok(path('exercises', shared.id), carol.token, 'PATCH', { name: shared.name });
    await denied(path('exercises'), bob.token, 'POST', { name: 'Shared spoof', category: 'other', active: true });

    // Template edits are atomic and never change instantiated workout data.
    const templateRoute = 'top-trainer/templates';
    const templateData = { title: 'Edited strength', type: 'strength', duration_minutes: 45, notes: 'New notes', level: 'advanced', goal: 'Strength', tags: 'test' };
    const exerciseData = { exercise: shared.id, equipment: shared.equipment_options[0], target_sets: 4, reps_min: 5, reps_max: 8, starting_weight: 50, weight_increment: 2.5, rest_seconds: 120, tempo: '4-0-1-0' };
    const templateEntries = () => ok(`${path('template_exercises')}?filter=${encodeURIComponent(`template="${template.id}"`)}&sort=set_order`, alice.token);
    await ok(templateRoute, alice.token, 'POST', { id: template.id, template: templateData, exercises: [exerciseData, { ...exerciseData, starting_weight: 60 }] });
    const edited = await ok(path('workout_templates', template.id), alice.token);
    assert.equal(edited.title, templateData.title);
    assert.equal(edited.owner, alice.id);
    assert.equal(edited.goal, templateData.goal);
    const changedEntries = (await templateEntries()).items;
    for (const child of changedEntries) records.push(['template_exercises', child.id]);
    assert.equal(changedEntries.length, 2);
    assert.deepEqual(changedEntries.map((entry) => entry.set_order), [1, 2]);
    assert.equal(changedEntries[0].tempo, exerciseData.tempo);
    assert.equal(changedEntries[0].rest_seconds, exerciseData.rest_seconds);
    assert.equal(changedEntries[0].weight_increment, exerciseData.weight_increment);
    assert.equal((await ok(path('workouts', workout.id), alice.token)).title, workout.title);
    assert.equal((await ok(path('workout_sets', set.id), alice.token)).weight, 42);
    for (const stranger of [bob, carol, { token: '' }]) {
      await denied(templateRoute, stranger.token, 'POST', { id: template.id, template: templateData, exercises: [exerciseData] });
    }
    await denied(templateRoute, alice.token, 'POST', { id: template.id, template: { ...templateData, title: 'Should roll back' }, exercises: [exerciseData, { ...exerciseData, reps_max: 1 }] });
    assert.equal((await ok(path('workout_templates', template.id), alice.token)).title, templateData.title);
    assert.deepEqual((await templateEntries()).items, changedEntries);
    await denied(templateRoute, bob.token, 'POST', { template: templateData, exercises: [{ ...exerciseData, exercise: exercise.id }] });
    const bobTemplates = await ok(`${path('workout_templates')}?filter=${encodeURIComponent(`owner="${bob.id}"`)}`, bob.token);
    assert.equal(bobTemplates.items.length, 0, 'A failed creation must not leave an orphan template');
    await denied(templateRoute, alice.token, 'POST', { id: template.id, template: templateData, exercises: [{ ...exerciseData, equipment: 'invalid' }] });
    await denied(templateRoute, alice.token, 'POST', { id: template.id, template: templateData, exercises: [] });
    const createdTemplate = await ok(templateRoute, alice.token, 'POST', { template: { ...templateData, owner: bob.id }, exercises: [exerciseData] });
    records.push(['workout_templates', createdTemplate.id]);
    const createdChildren = await ok(`${path('template_exercises')}?filter=${encodeURIComponent(`template="${createdTemplate.id}"`)}`, alice.token);
    for (const child of createdChildren.items) records.push(['template_exercises', child.id]);
    assert.equal((await ok(path('workout_templates', createdTemplate.id), alice.token)).owner, alice.id);
    await ok(templateRoute, alice.token, 'POST', { id: template.id, template: { ...templateData, type: 'cardio', cardio_mode: 'running', distance_km: 5 }, exercises: [] });
    assert.equal((await templateEntries()).items.length, 0);
    await ok(templateRoute, alice.token, 'POST', { id: template.id, template: { ...templateData, type: 'recovery', recovery_activity: 'yoga' }, exercises: [] });
    const recovery = await ok(path('workout_templates', template.id), alice.token);
    assert.equal(recovery.cardio_mode, '');
    assert.equal(recovery.distance_km, 0);
    assert.equal(recovery.recovery_activity, 'yoga');
    await ok(templateRoute, alice.token, 'POST', { id: template.id, template: { ...templateData, type: 'interval', cardio_mode: 'running', interval_work_seconds: 45, interval_rest_seconds: 30, interval_rounds: 6 }, exercises: [] });
    const interval = await ok(path('workout_templates', template.id), alice.token);
    assert.equal(interval.interval_work_seconds, 45);
    assert.equal(interval.interval_rest_seconds, 30);
    assert.equal(interval.interval_rounds, 6);
    assert.equal(interval.recovery_activity, '');
    await ok(templateRoute, alice.token, 'POST', { id: template.id, template: { ...templateData, type: 'sport', sport_activity: 'tennis' }, exercises: [] });
    const sport = await ok(path('workout_templates', template.id), alice.token);
    assert.equal(sport.sport_activity, 'tennis');
    assert.equal(sport.interval_rounds, 0);
    await denied(templateRoute, alice.token, 'POST', { id: template.id, template: { ...templateData, duration_minutes: 0 }, exercises: [exerciseData] });
    // The original child was replaced by the transaction.
    records.splice(records.findIndex(([collection, id]) => collection === 'template_exercises' && id === templateExercise.id), 1);

    // Photo URLs require a file token AND the owner's view rule.
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
    const upload = new FormData();
    upload.set('photo', new Blob([image], { type: 'image/png' }), 'photo.png');
    const withPhoto = await ok(path('profiles', alice.profile.id), alice.token, 'PATCH', upload);
    assert.ok(withPhoto.photo);
    const filePath = `${base}/api/files/${withPhoto.collectionId}/${withPhoto.id}/${withPhoto.photo}`;
    const aliceFileToken = (await ok('files/token', alice.token, 'POST')).token;
    const bobFileToken = (await ok('files/token', bob.token, 'POST')).token;
    const carolFileToken = (await ok('files/token', carol.token, 'POST')).token;
    assert.equal((await fetch(`${filePath}?token=${aliceFileToken}`)).status, 200);
    assert.ok([403, 404].includes((await fetch(filePath)).status));
    assert.ok([403, 404].includes((await fetch(`${filePath}?token=${bobFileToken}`)).status));
    assert.ok([403, 404].includes((await fetch(`${filePath}?token=${carolFileToken}`)).status));
    const invalidUpload = new FormData();
    invalidUpload.set('photo', new Blob(['not an image'], { type: 'text/plain' }), 'photo.txt');
    await denied(path('profiles', alice.profile.id), alice.token, 'PATCH', invalidUpload);
    const tooLarge = new FormData();
    tooLarge.set('photo', new Blob([image, new Uint8Array(5 * 1024 * 1024)], { type: 'image/png' }), 'large.png');
    await denied(path('profiles', alice.profile.id), alice.token, 'PATCH', tooLarge);
    assert.equal((await ok(path('profiles', alice.profile.id), alice.token, 'PATCH', { photo: '' })).photo, '');
    await ok(path('body_measurements', measurement.id), alice.token, 'DELETE');
    records.splice(records.findIndex(([collection, id]) => collection === 'body_measurements' && id === measurement.id), 1);
  } finally {
    for (const [collection, id] of records.reverse()) {
      const response = await request(path(collection, id), adminToken, 'DELETE');
      if (collection === 'template_exercises' && response.status === 404) continue;
      assert.equal(response.status, 204, `Failed to clean up ${collection}/${id}`);
    }
  }
});
