<script lang="ts">
  import { onMount } from 'svelte';
  import { CalendarDays, Check, LoaderCircle, Repeat } from '@lucide/svelte';
  import { createTrainingPlan, getPlanWorkouts, getTemplates, getTrainingPlans, instantiateTemplate } from '$lib/pocketbase';
  import {
    SCHEDULE_MODE_LABELS,
    WORKOUT_TYPE_LABELS,
    WORKOUT_TYPE_STYLES,
    type CycleItem,
    type CycleSlot,
    type Workout,
    type ScheduleMode,
    type TrainingPlan,
    type WorkoutTemplate
  } from '$lib/types';

  const WEEKDAYS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
  const MAX_WORKOUTS = 200;
  const toInputDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const emptySlot = (): CycleSlot => ({ template: '' });

  let title = '';
  let goal = '';
  let mode: ScheduleMode = 'fixed_weekdays';
  let startDate = toInputDate(new Date());
  let weeks = 4;
  let cycleDays = 10;
  let cycles = 3;
  let slots: CycleSlot[] = Array.from({ length: 7 }, emptySlot);
  let items: CycleItem[] = [{ template: '', count: 1 }];
  let progress: Record<string, Workout[]> = {};
  let plans: TrainingPlan[] = [];
  let templates: WorkoutTemplate[] = [];
  let pageLoading = true;
  let saving = false;
  let error = '';
  let success = '';

  $: cycleLength = clamp(cycleDays, 2, 120);
  $: templateById = new Map(templates.map((template) => [template.id, template]));
  $: schedule = buildSchedule(mode, startDate, weeks, cycleLength, cycles, slots, items, templateById);

  onMount(async () => {
    try {
      const [allPlans, allTemplates] = await Promise.all([getTrainingPlans(), getTemplates()]);
      plans = allPlans.filter((plan) => plan.schedule_mode);
      templates = allTemplates;
      const entries = await Promise.all(plans.filter((plan) => plan.schedule_mode === 'flexible_cycle').map(async (plan) => [plan.id, await getPlanWorkouts(plan.id)] as const));
      progress = Object.fromEntries(entries);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Programma’s konden niet worden geladen.';
    } finally {
      pageLoading = false;
    }
  });

  function clamp(value: number, min: number, max: number) {
    const number = Number.isFinite(value) ? Math.round(value) : min;
    return Math.min(max, Math.max(min, number));
  }

  function buildSchedule(
    scheduleMode: ScheduleMode,
    start: string,
    weekCount: number,
    length: number,
    cycleCount: number,
    pattern: CycleSlot[],
    cycleItems: CycleItem[],
    lookup: Map<string, WorkoutTemplate>
  ) {
    const first = new Date(`${start}T12:00:00`);
    if (Number.isNaN(first.getTime())) return [];
    const result: { date: Date; due?: Date; template: WorkoutTemplate; cycle: number; day: number; seq: number; total: number }[] = [];
    if (scheduleMode === 'fixed_weekdays') {
      const monday = new Date(first);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
      for (let offset = 0; offset < clamp(weekCount, 1, 52) * 7; offset += 1) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + offset);
        if (date < first) continue;
        const template = lookup.get(pattern[offset % 7]?.template);
        if (template) result.push({ date, template, cycle: Math.floor(offset / 7) + 1, day: offset % 7, seq: 0, total: 0 });
      }
    } else {
      for (let cycle = 0; cycle < clamp(cycleCount, 1, 52); cycle += 1) {
        const cycleStart = new Date(first);
        cycleStart.setDate(first.getDate() + cycle * length);
        const due = new Date(cycleStart);
        due.setDate(cycleStart.getDate() + length - 1);
        const queue = cycleItems.flatMap((item) => {
          const template = lookup.get(item.template);
          return template ? Array.from({ length: clamp(item.count, 1, 20) }, () => template) : [];
        });
        // Volgorde van de lijst bepaalt de plek op de tijdlijn; gelijkmatig verspreid over de periode.
        queue.forEach((template, index) => {
          const date = new Date(cycleStart);
          date.setDate(cycleStart.getDate() + Math.floor((index * length) / queue.length));
          result.push({ date, due, template, cycle: cycle + 1, day: 0, seq: index + 1, total: queue.length });
        });
      }
    }
    return result;
  }

  const formatDate = (value: string | Date) =>
    new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00`) : value
    );

  const slotLabel = (index: number) => WEEKDAYS[index];

  const cycleStats = (planId: string) => {
    const all = progress[planId] ?? [];
    const byCycle = new Map<string, { done: number; total: number; due: string }>();
    for (const workout of all) {
      const key = workout.due_date?.slice(0, 10) ?? workout.performed_at.slice(0, 10);
      const entry = byCycle.get(key) ?? { done: 0, total: 0, due: key };
      entry.total += 1;
      if (workout.status === 'completed') entry.done += 1;
      byCycle.set(key, entry);
    }
    return [...byCycle.entries()].sort(([a], [b]) => a.localeCompare(b));
  };

  const save = async () => {
    error = '';
    success = '';
    if (!title.trim()) {
      error = 'Geef het programma een naam.';
      return;
    }
    if (schedule.length === 0) {
      error = 'Kies minimaal één bouwblok uit je bibliotheek.';
      return;
    }
    if (schedule.length > MAX_WORKOUTS) {
      error = `Een programma mag maximaal ${MAX_WORKOUTS} trainingen bevatten.`;
      return;
    }

    saving = true;
    let planId = '';
    let created = 0;
    try {
      const lastDate = schedule[schedule.length - 1].due ?? schedule[schedule.length - 1].date;
      const totalDays = mode === 'fixed_weekdays' ? clamp(weeks, 1, 52) * 7 : clamp(cycles, 1, 52) * cycleLength;
      const plan = await createTrainingPlan({
        title: title.trim(),
        goal: goal.trim() || title.trim(),
        start_date: new Date(`${startDate}T12:00:00`).toISOString(),
        end_date: new Date(`${toInputDate(lastDate)}T12:00:00`).toISOString(),
        weeks: Math.ceil(totalDays / 7),
        summary: `${SCHEDULE_MODE_LABELS[mode]} · ${schedule.length} trainingen`,
        schedule_mode: mode,
        cycle_days: mode === 'fixed_weekdays' ? 7 : cycleLength,
        cycles: mode === 'fixed_weekdays' ? clamp(weeks, 1, 52) : clamp(cycles, 1, 52),
        cycle_pattern: JSON.stringify(mode === 'fixed_weekdays' ? slots : items)
      });
      planId = plan.id;
      for (const entry of schedule) {
        const when = new Date(`${toInputDate(entry.date)}T09:00:00`);
        when.setMinutes(when.getMinutes() + entry.seq);
        await instantiateTemplate(entry.template, when, {
          plan: plan.id,
          ...(entry.due ? { dueDate: new Date(`${toInputDate(entry.due)}T12:00:00`).toISOString() } : {}),
          notes: mode === 'fixed_weekdays' ? `${title.trim()} · week ${entry.cycle}, ${WEEKDAYS[entry.day]}` : `${title.trim()} · cyclus ${entry.cycle}, training ${entry.seq}/${entry.total}`
        });
        created += 1;
      }
      plans = [plan, ...plans];
      success = `Programma opgeslagen met ${created} geplande trainingen in je tijdlijn.`;
      title = '';
      goal = '';
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Opslaan is mislukt.';
      error = planId ? `Programma aangemaakt, maar slechts ${created} van de ${schedule.length} trainingen zijn opgeslagen. ${reason}` : reason;
    } finally {
      saving = false;
    }
  };
</script>

<svelte:head><title>Programma · T.O.P. Trainer</title></svelte:head>

<div class="space-y-6">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Meerdere trainingen</p>
    <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Programma maken</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">
      Een programma plant bouwblokken uit je <a class="font-semibold text-primary-700 underline dark:text-primary-300" href="/library">bibliotheek</a> (kracht, cardio, interval, herstel) in een herhaalbare cyclus.
    </p>
  </div>

  {#if pageLoading}
    <div class="card animate-pulse">Laden...</div>
  {:else}
    <form class="card space-y-5" on:submit|preventDefault={save}>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="prog-title">Naam</label>
          <input id="prog-title" class="input" bind:value={title} maxlength="120" placeholder="Bijvoorbeeld: 10-daagse cyclus" required />
        </div>
        <div>
          <label class="label" for="prog-start">Startdatum</label>
          <input id="prog-start" class="input" type="date" bind:value={startDate} required />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="prog-goal">Doel (optioneel)</label>
          <input id="prog-goal" class="input" bind:value={goal} maxlength="500" />
        </div>
      </div>

      <fieldset>
        <legend class="label">Planning</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          {#each Object.entries(SCHEDULE_MODE_LABELS) as [value, label]}
            <label class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 {mode === value ? 'border-primary-500 bg-primary-50 dark:bg-primary-950' : 'border-gray-200 dark:border-gray-700'}">
              <input class="mt-1" type="radio" bind:group={mode} value={value} />
              <span>
                <span class="block font-bold">{label}</span>
                <span class="text-sm text-gray-600 dark:text-gray-300">
                  {value === 'fixed_weekdays' ? 'Elke week dezelfde trainingen op dezelfde dagen (ma–zo).' : 'Een periode van een eigen aantal dagen (bijv. 10 of 21) met een set bouwblokken die je er in willekeurige volgorde in afrondt. De periode herhaalt zich.'}
                </span>
              </span>
            </label>
          {/each}
        </div>
      </fieldset>

      <div class="grid gap-4 sm:grid-cols-2">
        {#if mode === 'fixed_weekdays'}
          <div>
            <label class="label" for="prog-weeks">Aantal weken</label>
            <input id="prog-weeks" class="input" type="number" min="1" max="52" bind:value={weeks} />
          </div>
        {:else}
          <div>
            <label class="label" for="prog-cycle">Duur van de cyclus (dagen)</label>
            <input id="prog-cycle" class="input" type="number" min="2" max="120" bind:value={cycleDays} />
          </div>
          <div>
            <label class="label" for="prog-cycles">Aantal herhalingen van de cyclus</label>
            <input id="prog-cycles" class="input" type="number" min="1" max="52" bind:value={cycles} />
          </div>
        {/if}
      </div>

      <fieldset class="space-y-3">
        <legend class="label flex items-center gap-2"><Repeat size={16} /> {mode === 'fixed_weekdays' ? 'Weekschema' : `Binnen elke cyclus van ${cycleLength} dagen uit te voeren`}</legend>
        {#if templates.length === 0}
          <p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Je bibliotheek is leeg. Maak eerst bouwblokken in de <a class="font-semibold underline" href="/library">bibliotheek</a>.
          </p>
        {/if}
        {#if mode === 'flexible_cycle'}
          {#each items as item, index}
            <div class="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
              <select class="input" aria-label="Bouwblok" bind:value={item.template}>
                <option value="">Kies bouwblok…</option>
                {#each templates as template}<option value={template.id}>{template.title} · {WORKOUT_TYPE_LABELS[template.type]}</option>{/each}
              </select>
              <input class="input" type="number" min="1" max="20" aria-label="Aantal keer" bind:value={item.count} />
              <button class="btn-secondary" type="button" aria-label="Verwijderen" disabled={items.length === 1} on:click={() => (items = items.filter((_, i) => i !== index))}>✕</button>
            </div>
          {/each}
          <button class="btn-secondary w-full" type="button" on:click={() => (items = [...items, { template: '', count: 1 }])}>+ Bouwblok toevoegen</button>
        {:else}
        {#each slots as slot, index}
          <div class="grid gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-[7rem_1fr] sm:items-center">
            <p class="font-bold">{slotLabel(index)}</p>
            <select class="input" aria-label="Bouwblok voor {slotLabel(index)}" bind:value={slot.template}>
              <option value="">Rustdag</option>
              {#each templates as template}<option value={template.id}>{template.title} · {WORKOUT_TYPE_LABELS[template.type]}</option>{/each}
            </select>
          </div>
        {/each}
        {/if}
      </fieldset>

      <div class="rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-900">
        <p class="font-bold">Voorbeeld: {schedule.length} geplande trainingen</p>
        {#if schedule.length > 0}
          <p class="mt-1 text-gray-600 dark:text-gray-300">{formatDate(schedule[0].date)} – {formatDate(schedule[schedule.length - 1].due ?? schedule[schedule.length - 1].date)}</p>
          <ul class="mt-3 flex flex-wrap gap-2">
            {#each schedule.slice(0, 14) as entry}
              <li class="badge {WORKOUT_TYPE_STYLES[entry.template.type].badge}">
                {entry.template.title} · {entry.due ? `c${entry.cycle} · #${entry.seq}` : new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(entry.date)}
              </li>
            {/each}
            {#if schedule.length > 14}<li class="text-gray-500">+ {schedule.length - 14} meer</li>{/if}
          </ul>
        {/if}
      </div>

      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      {#if success}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}
      <button class="btn-primary w-full" type="submit" disabled={saving}>
        {#if saving}<LoaderCircle class="animate-spin" size={18} /> Opslaan...{:else}<Check size={18} /> Programma opslaan in mijn tijdlijn{/if}
      </button>
    </form>

    <section class="space-y-3">
      <div class="flex items-center gap-2">
        <CalendarDays size={20} class="text-overload-signal" />
        <h3 class="text-xl font-black">Mijn programma’s</h3>
      </div>
      {#if plans.length === 0}
        <div class="card text-sm text-gray-600 dark:text-gray-300">Opgeslagen programma’s verschijnen hier.</div>
      {:else}
        {#each plans as plan}
          <div class="card">
            <p class="font-bold">{plan.title}</p>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {plan.schedule_mode ? SCHEDULE_MODE_LABELS[plan.schedule_mode] : ''}{plan.schedule_mode === 'flexible_cycle' ? ` · ${plan.cycle_days} dagen × ${plan.cycles} cycli` : ''} · {formatDate(plan.start_date)} – {formatDate(plan.end_date)}
            </p>
            {#if plan.schedule_mode === 'flexible_cycle'}
              <ul class="mt-3 space-y-1 text-sm">
                {#each cycleStats(plan.id) as [, stat], index}
                  <li class="flex items-center justify-between gap-3">
                    <span>Cyclus {index + 1} · t/m {formatDate(stat.due)}</span>
                    <span class="font-bold {stat.done === stat.total ? 'text-emerald-600' : ''}">{stat.done}/{stat.total} uitgevoerd</span>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      {/if}
    </section>
  {/if}
</div>
