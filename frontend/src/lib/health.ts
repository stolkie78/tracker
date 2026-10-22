import type { HealthCheckin, HealthProgramKind } from '$lib/types';

export type MealPlan = Record<number, string>;

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MEAL_IDEAS = [
  'Salmon, eggs, boiled potatoes, broccoli, and olive oil; add yogurt with nuts and berries.',
  'Chicken thighs with rice, mixed vegetables, and avocado; add cottage cheese and fruit.',
  'Beef chili with beans, rice, and lettuce; add a handful of nuts.',
  'Four-egg omelet with spinach and feta, whole-grain bread, lentil soup, and fruit.',
  'Tuna quinoa salad with chickpeas, vegetables, and olive oil; add kefir.',
  'Turkey with sweet potato, kale, and tahini; add cottage cheese with apple.',
  'White fish with pasta, tomato sauce, and vegetables; add Greek yogurt with honey.'
];

export const suggestMealPlan = (proteinG: number, calories: number, kind: HealthProgramKind = 'omad'): MealPlan =>
  Object.fromEntries(
    WEEK_ORDER.map((day, index) => [
      day,
      `${MEAL_IDEAS[index]} (target: approx. ${calories} kcal and ${proteinG} g protein${kind === 'omad' ? '' : ', spread across your eating window'})`
    ])
  );

export const parseMealPlan = (raw?: string): MealPlan => {
  try {
    const parsed = JSON.parse(raw ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const addDays = (key: string, days: number) => {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
};

/** Consecutive fasting days; include today if checked off, otherwise start with yesterday. */
export const currentStreak = (checkins: HealthCheckin[], today: string) => {
  const fasted = new Set(checkins.filter((entry) => entry.fasted).map((entry) => entry.date));
  let cursor = fasted.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (fasted.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

export const longestStreak = (checkins: HealthCheckin[]) => {
  const days = [...new Set(checkins.filter((entry) => entry.fasted).map((entry) => entry.date))].sort();
  let best = 0;
  let run = 0;
  days.forEach((day, index) => {
    run = index > 0 && addDays(days[index - 1], 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
};

export const healthInsights = (checkins: HealthCheckin[], start: Date | null, today = toDateKey(new Date())) => {
  const startDay = start ? toDateKey(start) : '';
  const entries = checkins.filter((entry) => entry.date >= startDay && entry.date <= today);
  const loggedDays = new Set(entries.map((entry) => entry.date)).size;
  const fastedDays = new Set(entries.filter((entry) => entry.fasted).map((entry) => entry.date)).size;
  return {
    loggedDays,
    fastedDays,
    completion: loggedDays ? Math.round((fastedDays / loggedDays) * 100) : null,
    longestStreak: longestStreak(entries)
  };
};

export const FASTING_PROTOCOLS: Record<HealthProgramKind, { label: string; eatHours: number; description: string; defaultStart: string }> = {
  omad: { label: 'OMAD', eatHours: 1, defaultStart: '18:00', description: 'One Meal A Day: fast throughout the day and eat one nourishing meal.' },
  '16_8': { label: '16:8', eatHours: 8, defaultStart: '12:00', description: 'Fast for 16 hours with an 8-hour eating window.' },
  '12_12': { label: '12:12', eatHours: 12, defaultStart: '08:00', description: 'Fast for 12 hours with a 12-hour eating window; a gentle starting point.' }
};

export const FASTING_KINDS = Object.keys(FASTING_PROTOCOLS) as HealthProgramKind[];

/** Whether you are in your eating window and how long until it opens or closes. */
export const windowStatus = (start: string, eatHours: number, now: Date) => {
  const [hours, minutes] = start.split(':').map(Number);
  const open = new Date(now);
  open.setHours(hours || 0, minutes || 0, 0, 0);
  let eating = false;
  let target = open;
  for (const shift of [-1, 0]) {
    const candidateOpen = new Date(open.getTime() + shift * 86_400_000);
    const candidateClose = new Date(candidateOpen.getTime() + eatHours * 3_600_000);
    if (now >= candidateOpen && now < candidateClose) {
      eating = true;
      target = candidateClose;
    }
  }
  if (!eating) {
    target = now < open ? open : new Date(open.getTime() + 86_400_000);
  }
  const totalMinutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  return { eating, hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
};

const QUOTES = [
  'Discipline is choosing between what you want now and what you want most.',
  'Hunger comes in waves. Drink water, wait 15 minutes, and the wave will pass.',
  'One meal, fully present. Enjoy it; you have earned it.',
  'Small daily wins add up to big results.',
  'You do not have to be perfect, just consistent.',
  'Every fasting day is a vote for the person you want to become.',
  'Difficulty is not a reason to stop; it is a sign that you are growing.',
  'Black coffee, tea, and water can help you through the morning.'
];

export const motivationFor = (streak: number, fastedToday: boolean, dayOfYear: number) => {
  if (fastedToday) return `Great, today's check-in is saved! Streak: ${streak} ${streak === 1 ? 'day' : 'days'}. Get some rest.`;
  if (streak >= 7) return `${streak} days in a row. Keep your streak going; you can do it again today.`;
  if (streak >= 1) return `You're at ${streak} ${streak === 1 ? 'day' : 'days'}. Keep it up; today is day ${streak + 1}.`;
  return QUOTES[dayOfYear % QUOTES.length];
};

export const dayOfYear = (date: Date) =>
  Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);

export const quoteOfDay = (date: Date) => QUOTES[dayOfYear(date) % QUOTES.length];
