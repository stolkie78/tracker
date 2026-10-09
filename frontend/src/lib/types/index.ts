export type ID = string;

export type WorkoutType = 'strength' | 'cardio' | 'interval' | 'recovery';
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';
export type CardioMode = 'running' | 'cycling' | 'rowing' | 'swimming' | 'walking' | 'other';
export type RecoveryActivity = 'rest' | 'mobility' | 'yoga' | 'walking' | 'stretching' | 'other';
export type UserRole = 'admin' | 'coach' | 'athlete';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type ExerciseEquipment = 'cable' | 'dumbbell' | 'kettlebell' | 'barbell' | 'machine' | 'bodyweight' | 'band' | 'other';

export const DEFAULT_STRENGTH_REST_SECONDS = 90;
export const DEFAULT_STRENGTH_TEMPO = '3-1-1-0';

export interface TopProtocol {
  index: number;
  name: string;
  reps_min: number;
  reps_max: number;
  rest_min_seconds: number;
  rest_max_seconds: number;
  recovery: string;
}

export const TOP_PROTOCOLS: TopProtocol[] = [
  { index: 1, name: 'Coordination', reps_min: 5, reps_max: 12, rest_min_seconds: 60, rest_max_seconds: 60, recovery: '3-4 uur' },
  { index: 2, name: 'Strength endurance', reps_min: 30, reps_max: 60, rest_min_seconds: 30, rest_max_seconds: 60, recovery: '12 uur' },
  { index: 3, name: 'Endurance / hypertrophy', reps_min: 20, reps_max: 30, rest_min_seconds: 60, rest_max_seconds: 90, recovery: '12 uur' },
  { index: 4, name: 'Hypertrophy / endurance', reps_min: 15, reps_max: 20, rest_min_seconds: 60, rest_max_seconds: 120, recovery: '24 uur' },
  { index: 5, name: 'Hypertrophy', reps_min: 8, reps_max: 15, rest_min_seconds: 60, rest_max_seconds: 120, recovery: '48 uur' },
  { index: 6, name: 'Hypertrophy / strength', reps_min: 6, reps_max: 10, rest_min_seconds: 120, rest_max_seconds: 180, recovery: '48 uur' },
  { index: 7, name: 'Strength / hypertrophy', reps_min: 5, reps_max: 8, rest_min_seconds: 180, rest_max_seconds: 240, recovery: '72 uur' },
  { index: 8, name: 'Strength', reps_min: 2, reps_max: 5, rest_min_seconds: 240, rest_max_seconds: 300, recovery: '72 uur' },
  { index: 9, name: 'Maximum strength', reps_min: 1, reps_max: 3, rest_min_seconds: 240, rest_max_seconds: 300, recovery: '72 uur' },
  { index: 10, name: 'Retro gravity', reps_min: 1, reps_max: 3, rest_min_seconds: 180, rest_max_seconds: 300, recovery: '72 uur' }
];

export const getTopProtocol = (repsMin: number, repsMax: number, restSeconds: number) => {
  const targetReps = (repsMin + repsMax) / 2;
  const distanceToRange = (value: number, min: number, max: number) =>
    value < min ? min - value : value > max ? value - max : 0;

  return TOP_PROTOCOLS.reduce((best, protocol) => {
    const repsDistance = distanceToRange(targetReps, protocol.reps_min, protocol.reps_max);
    const bestRepsDistance = distanceToRange(targetReps, best.reps_min, best.reps_max);
    const restDistance = distanceToRange(restSeconds, protocol.rest_min_seconds, protocol.rest_max_seconds);
    const bestRestDistance = distanceToRange(restSeconds, best.rest_min_seconds, best.rest_max_seconds);
    return repsDistance < bestRepsDistance || (repsDistance === bestRepsDistance && restDistance < bestRestDistance)
      ? protocol
      : best;
  });
};

export interface BaseRecord {
  id: ID;
  created?: string;
  updated?: string;
}

export interface Profile extends BaseRecord {
  user: ID;
  display_name: string;
  role: UserRole;
}

export interface Exercise extends BaseRecord {
  name: string;
  category: string;
  muscle_group?: MuscleGroup;
  equipment_options: ExerciseEquipment[];
  active: boolean;
}

export interface Workout extends BaseRecord {
  owner: ID;
  plan?: ID;
  title: string;
  type: WorkoutType;
  status: WorkoutStatus;
  performed_at: string;
  duration_minutes: number;
  notes: string;
  cardio_mode?: CardioMode;
  distance_km?: number;
  average_heart_rate?: number;
  interval_work_seconds?: number;
  interval_rest_seconds?: number;
  interval_rounds?: number;
  recovery_activity?: RecoveryActivity;
  perceived_effort?: number;
  series_id?: string;
  expand?: {
    workout_exercises_via_workout?: WorkoutExercise[];
  };
}

export interface TrainingPlan extends BaseRecord {
  owner: ID;
  title: string;
  goal: string;
  start_date: string;
  end_date: string;
  weeks: number;
  summary: string;
}

export interface AISettings extends BaseRecord {
  owner: ID;
  endpoint: string;
  model: string;
  api_key?: string;
  api_key_set: boolean;
}

export interface PlannedStrengthExercise {
  exercise_id: ID;
  equipment?: ExerciseEquipment;
  rest_seconds?: number;
  tempo?: string;
  sets: number;
  reps_min: number;
  reps_max: number;
  starting_weight: number;
  weight_increment: number;
}

export interface GeneratedWorkout {
  date: string;
  type: WorkoutType;
  title: string;
  duration_minutes: number;
  notes: string;
  strength_exercises?: PlannedStrengthExercise[];
  cardio_mode?: CardioMode;
  distance_km?: number;
  interval_work_seconds?: number;
  interval_rest_seconds?: number;
  interval_rounds?: number;
  recovery_activity?: RecoveryActivity;
}

export interface GeneratedPlan {
  title: string;
  summary: string;
  workouts: GeneratedWorkout[];
}

export interface WorkoutExercise extends BaseRecord {
  owner: ID;
  workout: ID;
  exercise: ID;
  equipment?: ExerciseEquipment;
  rest_seconds?: number;
  tempo?: string;
  set_order: number;
  target_sets: number;
  reps_min: number;
  reps_max: number;
  starting_weight: number;
  weight_increment: number;
  expand?: {
    exercise?: Exercise;
    workout_sets_via_workout_exercise?: WorkoutSet[];
  };
}

export interface WorkoutSet extends BaseRecord {
  owner: ID;
  workout_exercise: ID;
  set_order: number;
  reps: number;
  weight: number;
  completed: boolean;
}

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> = {
  strength: 'Kracht',
  cardio: 'Cardio',
  interval: 'Interval',
  recovery: 'Herstel'
};

export const WORKOUT_STATUS_LABELS: Record<WorkoutStatus, string> = {
  planned: 'Gepland',
  in_progress: 'Bezig',
  completed: 'Voltooid',
  skipped: 'Overgeslagen'
};

export const CARDIO_MODE_LABELS: Record<CardioMode, string> = {
  running: 'Hardlopen',
  cycling: 'Fietsen',
  rowing: 'Roeien',
  swimming: 'Zwemmen',
  walking: 'Wandelen',
  other: 'Anders'
};

export const RECOVERY_ACTIVITY_LABELS: Record<RecoveryActivity, string> = {
  rest: 'Rust',
  mobility: 'Mobiliteit',
  yoga: 'Yoga',
  walking: 'Wandelen',
  stretching: 'Rekken',
  other: 'Anders'
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Beheerder',
  coach: 'Coach',
  athlete: 'Atleet'
};

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'core' | 'full_body';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Borst',
  back: 'Rug',
  shoulders: 'Schouders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Benen',
  glutes: 'Billen',
  core: 'Core',
  full_body: 'Full body'
};

export const MUSCLE_GROUP_OPTIONS = (Object.keys(MUSCLE_GROUP_LABELS) as MuscleGroup[]).map((value) => ({
  value,
  label: MUSCLE_GROUP_LABELS[value]
}));

export const EXERCISE_EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  cable: 'Cable',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  barbell: 'Barbell',
  machine: 'Machine',
  bodyweight: 'Lichaamsgewicht',
  band: 'Weerstandsband',
  other: 'Overig'
};

export const EXERCISE_EQUIPMENT_OPTIONS = (
  ['cable', 'dumbbell', 'kettlebell', 'barbell', 'machine'] as const
).map((value) => ({
  value,
  label: EXERCISE_EQUIPMENT_LABELS[value]
}));

export const WORKOUT_TYPE_OPTIONS = Object.entries(WORKOUT_TYPE_LABELS).map(([value, label]) => ({
  value: value as WorkoutType,
  label
}));

export const CARDIO_MODE_OPTIONS = Object.entries(CARDIO_MODE_LABELS).map(([value, label]) => ({
  value: value as CardioMode,
  label
}));

export const RECOVERY_ACTIVITY_OPTIONS = Object.entries(RECOVERY_ACTIVITY_LABELS).map(([value, label]) => ({
  value: value as RecoveryActivity,
  label
}));

export const WORKOUT_STATUS_OPTIONS = Object.entries(WORKOUT_STATUS_LABELS).map(([value, label]) => ({
  value: value as WorkoutStatus,
  label
}));

export const nextSuggestedWeight = (
  prescribedMaxReps: number,
  sets: Pick<WorkoutSet, 'reps' | 'completed'>[],
  currentWeight: number,
  increment: number
) => {
  if (sets.length === 0 || !sets.every((set) => set.completed && set.reps >= prescribedMaxReps)) {
    return currentWeight;
  }
  const step = increment > 0 ? increment : 2.5;
  return Math.round((currentWeight + step) * 100) / 100;
};

export const WORKOUT_TYPE_STYLES: Record<WorkoutType, { icon: string; badge: string }> = {
  strength: { icon: 'bg-orange-500 text-white', badge: 'bg-orange-500 text-white' },
  cardio: { icon: 'bg-sky-500 text-white', badge: 'bg-sky-500 text-white' },
  interval: { icon: 'bg-rose-500 text-white', badge: 'bg-rose-500 text-white' },
  recovery: { icon: 'bg-emerald-500 text-white', badge: 'bg-emerald-500 text-white' }
};

export const exerciseLabel = (name: string, equipment?: ExerciseEquipment | '') =>
  equipment ? `${name} · ${EXERCISE_EQUIPMENT_LABELS[equipment]}` : name;
