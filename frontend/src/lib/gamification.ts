import { isDietaryActivity, type Workout } from '$lib/types';

export interface WeeklyGoal {
  week: string;
  target: number;
}

export const DEFAULT_WEEKLY_GOAL = 3;

export const weekKey = (date: Date): string => {
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
};

const previousWeek = (week: string) => {
  const date = new Date(`${week}T12:00:00`);
  date.setDate(date.getDate() - 7);
  return weekKey(date);
};

export const goalForWeek = (goals: WeeklyGoal[], week: string) =>
  [...goals].sort((a, b) => b.week.localeCompare(a.week)).find((goal) => goal.week <= week)?.target ?? DEFAULT_WEEKLY_GOAL;

export const setWeeklyGoal = (goals: WeeklyGoal[], target: number, now = new Date()): WeeklyGoal[] => {
  if (!Number.isInteger(target) || target < 1 || target > 7) throw new Error('Choose a weekly goal between 1 and 7 sessions.');
  const week = weekKey(now);
  return [...goals.filter((goal) => goal.week !== week), { week, target }].sort((a, b) => a.week.localeCompare(b.week));
};

export const activityProgress = (workouts: Workout[], goals: WeeklyGoal[] = [], now = new Date()) => {
  const unique = new Map<string, Workout>();
  const imports = new Set<string>();
  for (const workout of workouts) {
    const date = new Date(workout.performed_at);
    if (workout.status !== 'completed' || !Number.isFinite(date.getTime()) || date > now
      || isDietaryActivity(workout.type, workout.wellness_activity)) continue;
    if (unique.has(workout.id) || workout.strava_id && imports.has(workout.strava_id)) continue;
    unique.set(workout.id, workout);
    if (workout.strava_id) imports.add(workout.strava_id);
  }
  const done = [...unique.values()];
  const counts = new Map<string, number>();
  for (const workout of done) {
    const week = weekKey(new Date(workout.performed_at));
    counts.set(week, (counts.get(week) ?? 0) + 1);
  }
  const currentWeek = weekKey(now);
  const target = goalForWeek(goals, currentWeek);
  const completed = counts.get(currentWeek) ?? 0;
  const meetsGoal = (week: string) => (counts.get(week) ?? 0) >= goalForWeek(goals, week);
  let cursor = meetsGoal(currentWeek) ? currentWeek : previousWeek(currentWeek);
  let streak = 0;
  while (meetsGoal(cursor)) {
    streak += 1;
    cursor = previousWeek(cursor);
  }
  let bestStreak = 0;
  for (const week of [...counts.keys()].sort()) {
    if (!meetsGoal(week) || meetsGoal(previousWeek(week))) continue;
    let length = 0;
    let next = week;
    while (meetsGoal(next)) {
      length += 1;
      const date = new Date(`${next}T12:00:00`);
      date.setDate(date.getDate() + 7);
      next = weekKey(date);
    }
    bestStreak = Math.max(bestStreak, length);
  }
  const strength = done.filter((workout) => workout.type === 'strength').length;
  const recovery = done.filter((workout) => workout.type === 'recovery').length;
  const walkingKm = done.reduce((sum, workout) => sum + (
    ['walking', 'hiking'].includes(workout.cardio_mode ?? '') && ['life', 'cardio', 'interval'].includes(workout.type)
      || workout.type === 'recovery' && workout.recovery_activity === 'walking'
      ? Math.max(0, Number(workout.distance_km) || 0) : 0), 0);
  const badges = [
    { id: 'first', title: 'First step', description: 'Complete your first session', value: done.length, target: 1, unit: 'sessions' },
    { id: 'ten', title: 'Finding your rhythm', description: 'Complete 10 sessions', value: done.length, target: 10, unit: 'sessions' },
    { id: 'strength', title: 'Strength foundation', description: 'Complete 10 strength sessions', value: strength, target: 10, unit: 'sessions' },
    { id: 'recovery', title: 'Room to recover', description: 'Complete 5 recovery sessions', value: recovery, target: 5, unit: 'sessions' },
    { id: 'walking', title: 'A hundred little steps', description: 'Walk or hike 100 km in total', value: walkingKm, target: 100, unit: 'km' },
    { id: 'consistency', title: 'Building a habit', description: 'Meet your weekly goal 4 weeks in a row', value: bestStreak, target: 4, unit: 'weeks' }
  ].map((badge) => ({ ...badge, value: Math.floor(badge.value * 10) / 10, earned: badge.value >= badge.target }));
  const recentWeeks = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(`${currentWeek}T12:00:00`);
    date.setDate(date.getDate() - (7 - index) * 7);
    const week = weekKey(date);
    return { week, completed: counts.get(week) ?? 0, target: goalForWeek(goals, week) };
  });
  return { completed, target, streak, bestStreak, badges, recentWeeks };
};
