import { exerciseLabel, type CardioMode, type Workout, type WorkoutType } from '$lib/types';

export type PeriodKey = '4w' | '12w' | '1y' | 'all';

export const PERIOD_OPTIONS: { value: PeriodKey; label: string; days: number | null }[] = [
  { value: '4w', label: '4 weken', days: 28 },
  { value: '12w', label: '12 weken', days: 84 },
  { value: '1y', label: '1 jaar', days: 365 },
  { value: 'all', label: 'Alles', days: null }
];

export interface ExerciseSession {
  date: string;
  topWeight: number;
  repsAtTop: number;
  totalReps: number;
  volume: number;
  estimated1RM: number;
}

export interface ExerciseProgress {
  id: string;
  name: string;
  sessions: ExerciseSession[];
  first: ExerciseSession;
  last: ExerciseSession;
  bestWeight: number;
  weightChange: number;
  repsChange: number;
}

export interface RunStats {
  runs: number;
  km: number;
  minutes: number;
  paceMinPerKm: number;
  elevation: number;
  averageHeartRate: number;
  fastestPaceMinPerKm: number;
  recent: Workout[];
}

export interface Stats {
  run: RunStats;
  total: number;
  perWeek: number;
  totalMinutes: number;
  byType: Record<WorkoutType, number>;
  runningKm: number;
  cardioKm: Partial<Record<CardioMode, number>>;
  cardioKmTotal: number;
  longestRunKm: number;
  exercises: ExerciseProgress[];
}

const epley = (weight: number, reps: number) => (reps <= 1 ? weight : weight * (1 + reps / 30));
const round1 = (value: number) => Math.round(value * 10) / 10;

export const periodStart = (period: PeriodKey): Date | null => {
  const days = PERIOD_OPTIONS.find((option) => option.value === period)?.days;
  return days ? new Date(Date.now() - days * 86_400_000) : null;
};

export const computeStats = (workouts: Workout[], period: PeriodKey): Stats => {
  const start = periodStart(period);
  const done = workouts
    .filter((workout) => workout.status === 'completed' && (!start || new Date(workout.performed_at) >= start))
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at));

  const byType: Record<WorkoutType, number> = { strength: 0, cardio: 0, interval: 0, recovery: 0, sport: 0 };
  const cardioKm: Partial<Record<CardioMode, number>> = {};
  let totalMinutes = 0;
  let longestRunKm = 0;
  const runs = done.filter((workout) => workout.cardio_mode === 'running' && (workout.type === 'cardio' || workout.type === 'interval') && Number(workout.distance_km) > 0);
  const runKm = runs.reduce((sum, workout) => sum + Number(workout.distance_km), 0);
  const runMinutes = runs.reduce((sum, workout) => sum + (Number(workout.duration_minutes) || 0), 0);
  const heartRuns = runs.filter((workout) => Number(workout.average_heart_rate) > 0);
  const paces = runs.filter((workout) => Number(workout.duration_minutes) > 0).map((workout) => Number(workout.duration_minutes) / Number(workout.distance_km));
  const run: RunStats = {
    runs: runs.length,
    km: round1(runKm),
    minutes: Math.round(runMinutes),
    paceMinPerKm: runKm && runMinutes ? runMinutes / runKm : 0,
    elevation: Math.round(runs.reduce((sum, workout) => sum + (Number(workout.elevation_gain_m) || 0), 0)),
    averageHeartRate: heartRuns.length ? Math.round(heartRuns.reduce((sum, workout) => sum + Number(workout.average_heart_rate), 0) / heartRuns.length) : 0,
    fastestPaceMinPerKm: paces.length ? Math.min(...paces) : 0,
    recent: [...runs].reverse().slice(0, 5)
  };
  const perExercise = new Map<string, { name: string; sessions: ExerciseSession[] }>();

  for (const workout of done) {
    byType[workout.type] += 1;
    totalMinutes += Number(workout.duration_minutes) || 0;

    if ((workout.type === 'cardio' || workout.type === 'interval') && workout.distance_km) {
      const mode = workout.cardio_mode ?? 'other';
      cardioKm[mode] = (cardioKm[mode] ?? 0) + workout.distance_km;
      if (mode === 'running') longestRunKm = Math.max(longestRunKm, workout.distance_km);
    }

    if (workout.type !== 'strength') continue;
    for (const entry of workout.expand?.workout_exercises_via_workout ?? []) {
      const sets = (entry.expand?.workout_sets_via_workout_exercise ?? []).filter((set) => set.completed && Number(set.reps) > 0);
      if (sets.length === 0) continue;
      const topWeight = Math.max(...sets.map((set) => Number(set.weight) || 0));
      const topSets = sets.filter((set) => (Number(set.weight) || 0) === topWeight);
      const session: ExerciseSession = {
        date: workout.performed_at,
        topWeight,
        repsAtTop: Math.max(...topSets.map((set) => Number(set.reps))),
        totalReps: sets.reduce((sum, set) => sum + Number(set.reps), 0),
        volume: sets.reduce((sum, set) => sum + Number(set.reps) * (Number(set.weight) || 0), 0),
        estimated1RM: round1(Math.max(...sets.map((set) => epley(Number(set.weight) || 0, Number(set.reps)))))
      };
      const key = `${entry.exercise}|${entry.equipment ?? ''}`;
      const bucket = perExercise.get(key) ?? { name: exerciseLabel(entry.expand?.exercise?.name ?? 'Oefening', entry.equipment), sessions: [] };
      bucket.sessions.push(session);
      perExercise.set(key, bucket);
    }
  }

  const weeks = Math.max(
    1,
    (start ? Date.now() - start.getTime() : done.length ? Date.now() - new Date(done[0].performed_at).getTime() : 0) / (7 * 86_400_000)
  );
  const cardioKmTotal = Object.values(cardioKm).reduce((sum, value) => sum + (value ?? 0), 0);

  const exercises = [...perExercise.entries()]
    .map(([id, { name, sessions }]) => {
      const first = sessions[0];
      const last = sessions[sessions.length - 1];
      return {
        id,
        name,
        sessions,
        first,
        last,
        bestWeight: Math.max(...sessions.map((session) => session.topWeight)),
        weightChange: round1(last.topWeight - first.topWeight),
        repsChange: last.repsAtTop - first.repsAtTop
      };
    })
    .sort((a, b) => b.sessions.length - a.sessions.length || a.name.localeCompare(b.name));

  return {
    run,
    total: done.length,
    perWeek: round1(done.length / weeks),
    totalMinutes,
    byType,
    runningKm: round1(cardioKm.running ?? 0),
    cardioKm,
    cardioKmTotal: round1(cardioKmTotal),
    longestRunKm,
    exercises
  };
};
