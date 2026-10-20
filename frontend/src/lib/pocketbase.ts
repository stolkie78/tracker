import PocketBase from 'pocketbase';
import {
  DEFAULT_STRENGTH_REST_SECONDS,
  DEFAULT_STRENGTH_TEMPO,
  nextSuggestedWeight,
  type AISettings,
  type Exercise,
  type GeneratedPlan,
  type HealthCheckin,
  type HealthProgram,
  type ID,
  type Profile,
  type StravaStatus,
  type StravaSyncCounts,
  type TemplateExercise,
  type TrainingPlan,
  type Workout,
  type WorkoutTemplate,
  type WorkoutExercise,
  type WorkoutSet
} from '$lib/types';

const baseUrl =
  import.meta.env.VITE_POCKETBASE_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8090');

export const pb = new PocketBase(baseUrl);
pb.autoCancellation(false);

export const currentUserId = () => pb.authStore.model?.id ?? '';
const ownerFilter = () => `owner = "${currentUserId()}"`;

export const loginWithPassword = (email: string, password: string) =>
  pb.collection('users').authWithPassword(email, password);

export const loginWithGoogle = () =>
  pb.collection('users').authWithOAuth2({ provider: 'google' });

export const registerWithPassword = async (email: string, password: string, displayName: string) => {
  await pb.collection('users').create({
    email,
    password,
    passwordConfirm: password,
    name: displayName
  });
  await loginWithPassword(email, password);
  await getOrCreateMyProfile(displayName);
};

export const logout = () => pb.authStore.clear();

export const getOrCreateMyProfile = async (displayName?: string) => {
  const userId = currentUserId();
  if (!userId) throw new Error('Er is geen ingelogde gebruiker.');
  const records = await pb.collection('profiles').getFullList<Profile>({
    filter: `user = "${userId}"`,
    requestKey: null
  });
  if (records[0]) return records[0];
  const name = displayName || String(pb.authStore.model?.name ?? pb.authStore.model?.email ?? 'Atleet');
  return pb.collection('profiles').create<Profile>({
    user: userId,
    display_name: name,
    role: 'athlete'
  });
};

export const getMyProfile = async () => {
  const records = await pb.collection('profiles').getFullList<Profile>({
    filter: `user = "${currentUserId()}"`,
    requestKey: null
  });
  return records[0] ?? null;
};

export const getAISettings = () =>
  pb.send<Pick<AISettings, 'endpoint' | 'model' | 'api_key_set'> | null>('/api/top-trainer/ai-settings', {
    method: 'GET',
    requestKey: null
  });

export const saveAISettings = (settings: Pick<AISettings, 'endpoint' | 'model'> & { api_key?: string }) =>
  pb.send<Pick<AISettings, 'endpoint' | 'model' | 'api_key_set'>>('/api/top-trainer/ai-settings', {
    method: 'POST',
    body: settings,
    requestKey: null
  });

export const getStravaStatus = () =>
  pb.send<StravaStatus>('/api/top-trainer/strava', { method: 'GET', requestKey: null });

export const connectStrava = (code: string) =>
  pb.send<{ connected: boolean; athlete_name: string; counts: StravaSyncCounts }>('/api/top-trainer/strava/connect', {
    method: 'POST',
    body: { code },
    requestKey: null
  });

export const syncStrava = () =>
  pb.send<{ counts: StravaSyncCounts }>('/api/top-trainer/strava/sync', { method: 'POST', requestKey: null });

export const disconnectStrava = () =>
  pb.send<{ connected: boolean }>('/api/top-trainer/strava', { method: 'DELETE', requestKey: null });

export const generateTrainingPlan = (input: {
  start_date: string;
  end_date: string;
  weeks: number;
  goal: string;
  experience: string;
  available_days: string[];
  equipment: string;
  preferences: {
    strength_sessions: number;
    cardio_sessions: number;
    interval_sessions: number;
    recovery_sessions: number;
  };
}) => pb.send<GeneratedPlan>('/api/top-trainer/generate-plan', { method: 'POST', body: input, requestKey: null });

export const createTrainingPlan = (data: Omit<TrainingPlan, 'id' | 'created' | 'updated' | 'owner'>) =>
  pb.collection('training_plans').create<TrainingPlan>({ ...data, owner: currentUserId() });

export const getTrainingPlans = () =>
  pb.collection('training_plans').getFullList<TrainingPlan>({
    filter: ownerFilter(),
    sort: '-start_date',
    requestKey: null
  });

export const getExercises = () =>
  pb.collection('exercises').getFullList<Exercise>({
    filter: 'active = true',
    sort: 'name',
    requestKey: null
  });

export const createExercise = (data: Pick<Exercise, 'name' | 'category' | 'muscle_group' | 'equipment_options'>) =>
  pb.collection('exercises').create<Exercise>({ ...data, active: true });

export const getWorkouts = (filter = '') =>
  pb.collection('workouts').getFullList<Workout>({
    filter: [ownerFilter(), filter].filter(Boolean).join(' && '),
    sort: '-performed_at',
    expand: 'workout_exercises_via_workout,workout_exercises_via_workout.exercise,workout_exercises_via_workout.workout_sets_via_workout_exercise',
    requestKey: null
  });

export const getWorkout = (id: ID) =>
  pb.collection('workouts').getOne<Workout>(id, {
    expand: 'workout_exercises_via_workout,workout_exercises_via_workout.exercise,workout_exercises_via_workout.workout_sets_via_workout_exercise'
  });

export const createWorkout = (data: Omit<Workout, 'id' | 'created' | 'updated' | 'owner' | 'expand'>) =>
  pb.collection('workouts').create<Workout>({ ...data, owner: currentUserId() });

export const updateWorkout = (id: ID, data: Partial<Workout>) =>
  pb.collection('workouts').update<Workout>(id, data);

export const deleteWorkout = async (id: ID) => {
  const exercises = await getWorkoutExercises(id);
  for (const exercise of exercises) {
    const sets = await getSetsForWorkoutExercise(exercise.id);
    await Promise.all(sets.map((set) => pb.collection('workout_sets').delete(set.id)));
    await pb.collection('workout_exercises').delete(exercise.id);
  }
  await pb.collection('workouts').delete(id);
};

export const getSeriesWorkouts = (seriesId: ID) =>
  pb.collection('workouts').getFullList<Workout>({
    filter: `${ownerFilter()} && series_id = "${seriesId}"`,
    sort: 'performed_at',
    requestKey: null
  });

export const deleteFutureSeries = async (seriesId: ID) => {
  const planned = (await getSeriesWorkouts(seriesId)).filter((workout) => workout.status === 'planned');
  for (const workout of planned) await deleteWorkout(workout.id);
  return planned.length;
};

export const updateNextSeriesExerciseWeight = async (
  workout: Pick<Workout, 'series_id' | 'performed_at'>,
  exercise: WorkoutExercise,
  weight: number
) => {
  if (!workout.series_id) return;
  const performedAt = new Date(workout.performed_at).getTime();
  const nextWorkout = (await getSeriesWorkouts(workout.series_id)).find(
    (entry) => entry.status === 'planned' && new Date(entry.performed_at).getTime() > performedAt
  );
  if (!nextWorkout) return;

  const nextExercise = (await getWorkoutExercises(nextWorkout.id)).find(
    (entry) =>
      entry.exercise === exercise.exercise &&
      entry.set_order === exercise.set_order &&
      entry.equipment === exercise.equipment
  );
  if (!nextExercise) return;

  const sets = await getSetsForWorkoutExercise(nextExercise.id);
  await Promise.all([
    updateWorkoutExercise(nextExercise.id, { starting_weight: weight }),
    ...sets.map((set) => updateWorkoutSet(set.id, { weight }))
  ]);
};

export const getWorkoutExercise = (id: ID) =>
  pb.collection('workout_exercises').getOne<WorkoutExercise>(id, { expand: 'exercise' });

export const getWorkoutExercises = (workoutId: ID) =>
  pb.collection('workout_exercises').getFullList<WorkoutExercise>({
    filter: `${ownerFilter()} && workout = "${workoutId}"`,
    sort: 'set_order',
    expand: 'exercise,workout_sets_via_workout_exercise',
    requestKey: null
  });

export const getStrengthSuggestion = async (exerciseId: ID, equipment?: string) => {
  const workouts = await pb.collection('workouts').getFullList<Workout>({
    filter: `${ownerFilter()} && type = "strength" && status = "completed"`,
    sort: '-performed_at',
    expand: 'workout_exercises_via_workout,workout_exercises_via_workout.exercise,workout_exercises_via_workout.workout_sets_via_workout_exercise',
    requestKey: null
  });

  for (const workout of workouts) {
    const previous = workout.expand?.workout_exercises_via_workout?.find((entry) => entry.exercise === exerciseId && (!equipment || !entry.equipment || entry.equipment === equipment));
    if (!previous) continue;
    const sets = previous.expand?.workout_sets_via_workout_exercise ?? [];
    const lastWeight = sets.length > 0
      ? Math.min(...sets.map((set) => Number(set.weight) || 0))
      : previous.starting_weight;

    return {
      sets: previous.target_sets,
      repsMin: previous.reps_min,
      repsMax: previous.reps_max,
      increment: previous.weight_increment,
      weight: nextSuggestedWeight(previous.reps_max, sets, lastWeight, previous.weight_increment),
      restSeconds: previous.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS,
      tempo: previous.tempo ?? DEFAULT_STRENGTH_TEMPO
    };
  }

  return null;
};

export const createWorkoutExercise = (data: Omit<WorkoutExercise, 'id' | 'created' | 'updated'>) =>
  pb.collection('workout_exercises').create<WorkoutExercise>(data);

export const updateWorkoutExercise = (id: ID, data: Partial<WorkoutExercise>) =>
  pb.collection('workout_exercises').update<WorkoutExercise>(id, data);

export const createWorkoutSet = (data: Omit<WorkoutSet, 'id' | 'created' | 'updated'>) =>
  pb.collection('workout_sets').create<WorkoutSet>(data);

export const deleteWorkoutSet = (id: ID) => pb.collection('workout_sets').delete(id);

export const updateWorkoutSet = (id: ID, data: Partial<WorkoutSet>) =>
  pb.collection('workout_sets').update<WorkoutSet>(id, data);

export const deleteWorkoutExercise = (id: ID) => pb.collection('workout_exercises').delete(id);

export const getSetsForWorkoutExercise = (workoutExerciseId: ID) =>
  pb.collection('workout_sets').getFullList<WorkoutSet>({
    filter: `${ownerFilter()} && workout_exercise = "${workoutExerciseId}"`,
    sort: 'set_order',
    requestKey: null
  });

export const getHealthPrograms = () =>
  pb.collection('health_programs').getFullList<HealthProgram>({ filter: ownerFilter(), requestKey: null });

export const createHealthProgram = (data: Omit<HealthProgram, 'id' | 'created' | 'updated' | 'owner'>) =>
  pb.collection('health_programs').create<HealthProgram>({ ...data, owner: currentUserId() });

export const updateHealthProgram = (id: ID, data: Partial<HealthProgram>) =>
  pb.collection('health_programs').update<HealthProgram>(id, data);

export const getHealthCheckins = (programId: ID) =>
  pb.collection('health_checkins').getFullList<HealthCheckin>({
    filter: `${ownerFilter()} && program = "${programId}"`,
    sort: '-date',
    requestKey: null
  });

export const saveHealthCheckin = async (programId: ID, date: string, data: { fasted: boolean; note?: string }, existing?: HealthCheckin) =>
  existing
    ? pb.collection('health_checkins').update<HealthCheckin>(existing.id, data)
    : pb.collection('health_checkins').create<HealthCheckin>({ ...data, program: programId, date, owner: currentUserId() });

const TEMPLATE_EXPAND = 'template_exercises_via_template,template_exercises_via_template.exercise';

export const getTemplates = () =>
  pb.collection('workout_templates').getFullList<WorkoutTemplate>({
    filter: ownerFilter(),
    sort: 'type,title',
    expand: TEMPLATE_EXPAND,
    requestKey: null
  });

export const createTemplate = (data: Omit<WorkoutTemplate, 'id' | 'created' | 'updated' | 'owner' | 'expand'>) =>
  pb.collection('workout_templates').create<WorkoutTemplate>({ ...data, owner: currentUserId() });

export const createTemplateExercise = (data: Omit<TemplateExercise, 'id' | 'created' | 'updated' | 'owner' | 'expand'>) =>
  pb.collection('template_exercises').create<TemplateExercise>({ ...data, owner: currentUserId() });

export const deleteTemplate = async (id: ID) => {
  const entries = await pb.collection('template_exercises').getFullList<TemplateExercise>({
    filter: `${ownerFilter()} && template = "${id}"`,
    requestKey: null
  });
  await Promise.all(entries.map((entry) => pb.collection('template_exercises').delete(entry.id)));
  await pb.collection('workout_templates').delete(id);
};

// Maakt een uitvoerbare training (incl. oefeningen en sets) op basis van een bouwblok.
export const instantiateTemplate = async (
  template: WorkoutTemplate,
  performedAt: Date,
  options: { status?: Workout['status']; plan?: ID; notes?: string; dueDate?: string } = {}
) => {
  const created = await createWorkout({
    template: template.id,
    ...(options.plan ? { plan: options.plan } : {}),
    ...(options.dueDate ? { due_date: options.dueDate } : {}),
    title: template.title,
    type: template.type,
    status: options.status ?? 'planned',
    performed_at: performedAt.toISOString(),
    duration_minutes: template.duration_minutes,
    notes: options.notes ?? template.notes ?? '',
    ...(template.cardio_mode ? { cardio_mode: template.cardio_mode } : {}),
    ...(template.distance_km ? { distance_km: template.distance_km } : {}),
    ...(template.interval_work_seconds ? { interval_work_seconds: template.interval_work_seconds } : {}),
    ...(template.interval_rest_seconds ? { interval_rest_seconds: template.interval_rest_seconds } : {}),
    ...(template.interval_rounds ? { interval_rounds: template.interval_rounds } : {}),
    ...(template.recovery_activity ? { recovery_activity: template.recovery_activity } : {})
  });

  const entries = [...(template.expand?.template_exercises_via_template ?? [])].sort((a, b) => a.set_order - b.set_order);
  for (const entry of entries) {
    const workoutExercise = await createWorkoutExercise({
      owner: created.owner,
      workout: created.id,
      exercise: entry.exercise,
      ...(entry.equipment ? { equipment: entry.equipment } : {}),
      set_order: entry.set_order,
      target_sets: entry.target_sets,
      reps_min: entry.reps_min,
      reps_max: entry.reps_max,
      starting_weight: entry.starting_weight,
      weight_increment: entry.weight_increment,
      rest_seconds: entry.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS,
      tempo: entry.tempo ?? DEFAULT_STRENGTH_TEMPO
    });
    for (let index = 0; index < entry.target_sets; index += 1) {
      await createWorkoutSet({
        owner: created.owner,
        workout_exercise: workoutExercise.id,
        set_order: index + 1,
        reps: 0,
        weight: entry.starting_weight,
        completed: false
      });
    }
  }
  return created;
};

export const getPlanWorkouts = (planId: ID) =>
  pb.collection('workouts').getFullList<Workout>({
    filter: `${ownerFilter()} && plan = "${planId}"`,
    sort: 'performed_at',
    requestKey: null
  });
