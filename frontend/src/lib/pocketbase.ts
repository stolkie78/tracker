import PocketBase from 'pocketbase';
import {
  DEFAULT_STRENGTH_REST_SECONDS,
  DEFAULT_STRENGTH_TEMPO,
  nextSuggestedWeight,
  type AISettings,
  type Exercise,
  type GeneratedPlan,
  type ID,
  type Profile,
  type TrainingPlan,
  type Workout,
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
