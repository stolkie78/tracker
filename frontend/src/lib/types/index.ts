export type ID = string;

export type WorkoutType = 'strength' | 'cardio' | 'interval' | 'recovery';
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';
export type CardioMode = 'running' | 'cycling' | 'rowing' | 'swimming' | 'walking' | 'other';
export type RecoveryActivity = 'rest' | 'mobility' | 'yoga' | 'walking' | 'stretching' | 'other';
export type UserRole = 'admin' | 'coach' | 'athlete';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type ExerciseEquipment = 'cable' | 'dumbbell' | 'kettlebell' | 'barbell' | 'machine' | 'bodyweight' | 'band' | 'other';

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
