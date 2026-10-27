export type ID = string;

export type WorkoutType = 'strength' | 'cardio' | 'interval' | 'recovery' | 'sport' | 'life';
export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';
export type CardioMode = 'running' | 'cycling' | 'rowing' | 'swimming' | 'walking' | 'hiking' | 'other';
export type RecoveryActivity = 'rest' | 'mobility' | 'yoga' | 'walking' | 'stretching' | 'other';
export type SportActivity = 'indoor_volleyball' | 'beach_volleyball' | 'pickleball' | 'football' | 'tennis' | 'basketball';
export type UserRole = 'admin' | 'coach' | 'athlete';
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';
export type ExerciseEquipment = 'cable' | 'dumbbell' | 'kettlebell' | 'barbell' | 'machine' | 'bodyweight' | 'band' | 'other';

export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced'
};

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
  { index: 1, name: 'Coordination', reps_min: 5, reps_max: 12, rest_min_seconds: 60, rest_max_seconds: 60, recovery: '3-4 hours' },
  { index: 2, name: 'Strength endurance', reps_min: 30, reps_max: 60, rest_min_seconds: 30, rest_max_seconds: 60, recovery: '12 hours' },
  { index: 3, name: 'Endurance / hypertrophy', reps_min: 20, reps_max: 30, rest_min_seconds: 60, rest_max_seconds: 90, recovery: '12 hours' },
  { index: 4, name: 'Hypertrophy / endurance', reps_min: 15, reps_max: 20, rest_min_seconds: 60, rest_max_seconds: 120, recovery: '24 hours' },
  { index: 5, name: 'Hypertrophy', reps_min: 8, reps_max: 15, rest_min_seconds: 60, rest_max_seconds: 120, recovery: '48 hours' },
  { index: 6, name: 'Hypertrophy / strength', reps_min: 6, reps_max: 10, rest_min_seconds: 120, rest_max_seconds: 180, recovery: '48 hours' },
  { index: 7, name: 'Strength / hypertrophy', reps_min: 5, reps_max: 8, rest_min_seconds: 180, rest_max_seconds: 240, recovery: '72 hours' },
  { index: 8, name: 'Strength', reps_min: 2, reps_max: 5, rest_min_seconds: 240, rest_max_seconds: 300, recovery: '72 hours' },
  { index: 9, name: 'Maximum strength', reps_min: 1, reps_max: 3, rest_min_seconds: 240, rest_max_seconds: 300, recovery: '72 hours' },
  { index: 10, name: 'Retro gravity', reps_min: 1, reps_max: 3, rest_min_seconds: 180, rest_max_seconds: 300, recovery: '72 hours' }
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
  birth_date?: string;
  phone?: string;
  bio?: string;
  height_cm?: number;
  photo?: string;
}

export interface BodyMeasurement extends BaseRecord {
  owner: ID;
  measured_at: string;
  weight_kg: number;
  height_cm: number;
  waist_cm?: number;
}

export interface Exercise extends BaseRecord {
  owner?: ID;
  name: string;
  category: string;
  muscle_group?: MuscleGroup;
  equipment_options: ExerciseEquipment[];
  active: boolean;
}

export interface Workout extends BaseRecord {
  owner: ID;
  plan?: ID;
  template?: ID;
  due_date?: string;
  title: string;
  type: WorkoutType;
  status: WorkoutStatus;
  performed_at: string;
  day_part?: DayPart | '';
  duration_minutes: number;
  notes: string;
  cardio_mode?: CardioMode;
  distance_km?: number;
  average_heart_rate?: number;
  interval_work_seconds?: number;
  interval_rest_seconds?: number;
  interval_rounds?: number;
  recovery_activity?: RecoveryActivity;
  sport_activity?: SportActivity;
  perceived_effort?: number;
  series_id?: string;
  strava_id?: string;
  elevation_gain_m?: number;
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
  schedule_mode?: ScheduleMode;
  cycle_days?: number;
  cycles?: number;
  cycle_pattern?: string;
}

export type ScheduleMode = 'fixed_weekdays' | 'flexible_cycle';

export const SCHEDULE_MODE_LABELS: Record<ScheduleMode, string> = {
  fixed_weekdays: 'Fixed cycle',
  flexible_cycle: 'Flexible cycle'
};

export type DayPart = 'morning' | 'afternoon' | 'evening';

export const DAY_PARTS: DayPart[] = ['morning', 'afternoon', 'evening'];
export const DAY_PART_LABELS: Record<DayPart, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening'
};
export const DAY_PART_HOURS: Record<DayPart, number> = { morning: 9, afternoon: 14, evening: 19 };
export const DAY_PART_OPTIONS = DAY_PARTS.map((value) => ({ value, label: DAY_PART_LABELS[value] }));

export interface CycleSlot {
  periods: Record<DayPart, ID[]>;
}

export interface WorkoutTemplate extends BaseRecord {
  owner: ID;
  title: string;
  type: WorkoutType;
  duration_minutes: number;
  notes: string;
  level?: ExperienceLevel;
  goal?: string;
  tags?: string;
  cardio_mode?: CardioMode;
  distance_km?: number;
  interval_work_seconds?: number;
  interval_rest_seconds?: number;
  interval_rounds?: number;
  recovery_activity?: RecoveryActivity;
  sport_activity?: SportActivity;
  expand?: {
    template_exercises_via_template?: TemplateExercise[];
  };
}

export interface TemplateExercise extends BaseRecord {
  owner: ID;
  template: ID;
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
  };
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
  sport_activity?: SportActivity;
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
  strength: 'Strength',
  cardio: 'Cardio',
  interval: 'Interval',
  recovery: 'Recovery',
  sport: 'Sports',
  life: 'Life'
};

export const templateLabel = (template: { title: string; type: WorkoutType; cardio_mode?: CardioMode; sport_activity?: SportActivity }) => {
  const prefix =
    (template.type === 'cardio' || template.type === 'life') && template.cardio_mode
      ? CARDIO_MODE_LABELS[template.cardio_mode]
      : template.type === 'sport' && template.sport_activity
        ? SPORT_ACTIVITY_LABELS[template.sport_activity]
        : WORKOUT_TYPE_LABELS[template.type];
  return `${prefix} · ${template.title}`;
};

export const WORKOUT_STATUS_LABELS: Record<WorkoutStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped'
};

export const WORKOUT_STATUS_CARD_STYLES: Record<WorkoutStatus, string> = {
  planned: '',
  in_progress: '',
  completed: 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950',
  skipped: 'border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800'
};

export const CARDIO_MODE_LABELS: Record<CardioMode, string> = {
  running: 'Running',
  cycling: 'Cycling',
  rowing: 'Rowing',
  swimming: 'Swimming',
  walking: 'Walking',
  hiking: 'Hiking',
  other: 'Other'
};

export const RECOVERY_ACTIVITY_LABELS: Record<RecoveryActivity, string> = {
  rest: 'Rest',
  mobility: 'Mobility',
  yoga: 'Yoga',
  walking: 'Walking',
  stretching: 'Stretching',
  other: 'Other'
};

export const SPORT_ACTIVITY_LABELS: Record<SportActivity, string> = {
  indoor_volleyball: 'Indoor volleyball',
  beach_volleyball: 'Beach volleyball',
  pickleball: 'Pickleball',
  football: 'Football',
  tennis: 'Tennis',
  basketball: 'Basketball'
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator',
  coach: 'Coach',
  athlete: 'Athlete'
};

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'legs' | 'glutes' | 'core' | 'full_body';

export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  legs: 'Legs',
  glutes: 'Glutes',
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
  bodyweight: 'Bodyweight',
  band: 'Resistance band',
  other: 'Other'
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

export const CARDIO_MODE_OPTIONS = Object.entries(CARDIO_MODE_LABELS).filter(([value]) => value !== 'walking' && value !== 'hiking').map(([value, label]) => ({
  value: value as CardioMode,
  label
}));

export const LIFE_ACTIVITY_OPTIONS = (['walking', 'hiking'] as const).map((value) => ({
  value,
  label: CARDIO_MODE_LABELS[value]
}));

export const RECOVERY_ACTIVITY_OPTIONS = Object.entries(RECOVERY_ACTIVITY_LABELS).filter(([value]) => value !== 'walking').map(([value, label]) => ({
  value: value as RecoveryActivity,
  label
}));

export const SPORT_ACTIVITY_OPTIONS = Object.entries(SPORT_ACTIVITY_LABELS).map(([value, label]) => ({
  value: value as SportActivity,
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
  recovery: { icon: 'bg-emerald-500 text-white', badge: 'bg-emerald-500 text-white' },
  sport: { icon: 'bg-violet-500 text-white', badge: 'bg-violet-500 text-white' },
  life: { icon: 'bg-teal-600 text-white', badge: 'bg-teal-600 text-white' }
};

export const exerciseLabel = (name: string, equipment?: ExerciseEquipment | '') =>
  equipment ? `${name} · ${EXERCISE_EQUIPMENT_LABELS[equipment]}` : name;

export interface StravaStatus {
  configured: boolean;
  client_id: string;
  connected: boolean;
  athlete_name: string;
  last_synced_at: string;
}

export interface StravaConfigStatus {
  configured: boolean;
  client_id: string;
  client_secret_set: boolean;
}

export interface StravaSyncCounts {
  created: number;
  linked: number;
  updated: number;
}

export const formatPace = (distanceKm: number, minutes: number) => {
  if (!distanceKm || !minutes) return '';
  const total = Math.round((minutes / distanceKm) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} /km`;
};

export type HealthProgramKind = 'omad' | '16_8' | '12_12';

export interface HealthProgram extends BaseRecord {
  owner: ID;
  kind: HealthProgramKind;
  title: string;
  start_date: string;
  meal_time?: string;
  calories?: number;
  protein_g?: number;
  meal_plan?: string;
  active: boolean;
}

export interface HealthCheckin extends BaseRecord {
  owner: ID;
  program: ID;
  date: string;
  fasted: boolean;
  note?: string;
}
