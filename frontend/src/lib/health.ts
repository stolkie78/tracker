import type { HealthCheckin } from '$lib/types';

export type MealPlan = Record<number, string>;

export const WEEKDAY_LABELS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag'];
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const MEAL_IDEAS = [
  'Zalm, ei, gekookte aardappel, broccoli en olijfolie; yoghurt met noten en bessen toe.',
  'Kipdijfilet met rijst, gemengde groenten en avocado; kwark met fruit toe.',
  'Rundergehakt-chilli met bonen, rijst en sla; handvol noten toe.',
  'Omelet van 4 eieren met spinazie en feta, volkorenbrood, linzensoep en fruit.',
  'Tonijn-quinoa-salade met kikkererwten, groenten en olijfolie; kefir toe.',
  'Kalkoen met zoete aardappel, boerenkool en tahini; cottage cheese met appel toe.',
  'Witte vis met pasta, tomatensaus en groenten; Griekse yoghurt met honing toe.'
];

export const suggestMealPlan = (proteinG: number, calories: number): MealPlan =>
  Object.fromEntries(
    WEEK_ORDER.map((day, index) => [
      day,
      `${MEAL_IDEAS[index]} (richtlijn ca. ${calories} kcal en ${proteinG} g eiwit)`
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

/** Opeenvolgende gevaste dagen; vandaag telt mee als het al is afgevinkt, anders begint de reeks bij gisteren. */
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

/** Uren en minuten tot de volgende maaltijd (vandaag of morgen). */
export const timeUntilMeal = (mealTime: string, now: Date) => {
  const [hours, minutes] = mealTime.split(':').map(Number);
  const target = new Date(now);
  target.setHours(hours || 0, minutes || 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  const totalMinutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
};

const QUOTES = [
  'Discipline is kiezen tussen wat je nu wilt en wat je het meest wilt.',
  'Honger komt in golven. Drink water, wacht 15 minuten en de golf is voorbij.',
  'Eén maaltijd, volledig aanwezig. Geniet ervan, je hebt hem verdiend.',
  'Kleine dagelijkse winst bouwt het grote resultaat.',
  'Je hoeft niet perfect te zijn, alleen consistent.',
  'Elke gevaste dag is een stem op de persoon die je wilt worden.',
  'Moeilijk is geen teken om te stoppen, maar dat je groeit.',
  'Zwarte koffie, thee en water helpen je door de ochtend heen.'
];

export const motivationFor = (streak: number, fastedToday: boolean, dayOfYear: number) => {
  if (fastedToday) return `Top, vandaag staat erin! Reeks: ${streak} ${streak === 1 ? 'dag' : 'dagen'}. Rust goed uit.`;
  if (streak >= 7) return `${streak} dagen op rij. Laat deze reeks niet los, vandaag gaat het weer lukken.`;
  if (streak >= 1) return `Je zit op ${streak} ${streak === 1 ? 'dag' : 'dagen'}. Bouw door, vandaag is dag ${streak + 1}.`;
  return QUOTES[dayOfYear % QUOTES.length];
};

export const dayOfYear = (date: Date) =>
  Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);

export const quoteOfDay = (date: Date) => QUOTES[dayOfYear(date) % QUOTES.length];
