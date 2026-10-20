<script lang="ts">
  import { onMount } from 'svelte';
  import { CalendarDays, Check, LoaderCircle, Pencil, Repeat, Trash2 } from '@lucide/svelte';
  import { createTrainingPlan, deleteTrainingPlan, deleteWorkout, getPlanWorkouts, getTemplates, getTrainingPlans, instantiateTemplate, updateTrainingPlan } from '$lib/pocketbase';
  import {
    SCHEDULE_MODE_LABELS,
    templateLabel,
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
  const emptySlot = (): CycleSlot => ({ templates: [] });

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
  let editingPlan: TrainingPlan | null = null;
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
        (pattern[offset % 7]?.templates ?? []).forEach((id, order) => {
          const template = lookup.get(id);
          if (template) result.push({ date, template, cycle: Math.floor(offset / 7) + 1, day: offset % 7, seq: order + 1, total: 0 });
        });
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
    let planId = editingPlan?.id ?? '';
    let created = 0;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let entries = schedule;
      let kept = 0;
      if (editingPlan) {
        // Uitgevoerde trainingen en cycli die al gestart zijn blijven staan; de rest wordt opnieuw gepland.
        const existing = await getPlanWorkouts(editingPlan.id);
        const touched = new Set(existing.filter((workout) => workout.status !== 'planned' && workout.due_date).map((workout) => workout.due_date!.slice(0, 10)));
        const removable = existing.filter((workout) =>
          workout.status === 'planned' && (workout.due_date ? !touched.has(workout.due_date.slice(0, 10)) && new Date(workout.due_date) >= today : new Date(workout.performed_at) >= today)
        );
        for (const workout of removable) await deleteWorkout(workout.id);
        kept = existing.length - removable.length;
        entries = schedule.filter((entry) => (entry.due ? !touched.has(toInputDate(entry.due)) && entry.due >= today : entry.date >= today));
      }
      const lastDate = schedule[schedule.length - 1].due ?? schedule[schedule.length - 1].date;
      const totalDays = mode === 'fixed_weekdays' ? clamp(weeks, 1, 52) * 7 : clamp(cycles, 1, 52) * cycleLength;
      const data = {
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
      };
      const plan = editingPlan ? await updateTrainingPlan(editingPlan.id, data) : await createTrainingPlan(data);
      planId = plan.id;
      for (const entry of entries) {
        const when = new Date(`${toInputDate(entry.date)}T09:00:00`);
        when.setMinutes(when.getMinutes() + entry.seq);
        await instantiateTemplate(entry.template, when, {
          plan: plan.id,
          ...(entry.due ? { dueDate: new Date(`${toInputDate(entry.due)}T12:00:00`).toISOString() } : {}),
          notes: mode === 'fixed_weekdays' ? `${title.trim()} · week ${entry.cycle}, ${WEEKDAYS[entry.day]}` : `${title.trim()} · cyclus ${entry.cycle}, training ${entry.seq}/${entry.total}`
        });
        created += 1;
      }
      if (editingPlan) {
        plans = plans.map((item) => (item.id === plan.id ? plan : item));
        if (mode === 'flexible_cycle') progress = { ...progress, [plan.id]: await getPlanWorkouts(plan.id) };
        success = `Programma bijgewerkt: ${created} trainingen opnieuw gepland, ${kept} bestaande behouden.`;
        editingPlan = null;
      } else {
        plans = [plan, ...plans];
        if (mode === 'flexible_cycle') progress = { ...progress, [plan.id]: await getPlanWorkouts(plan.id) };
        success = `Programma opgeslagen met ${created} geplande trainingen in je tijdlijn.`;
      }
      title = '';
      goal = '';
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Opslaan is mislukt.';
      error = planId ? `Programma opgeslagen, maar slechts ${created} trainingen zijn aangemaakt. ${reason}` : reason;
    } finally {
      saving = false;
    }
  };

  const normalizeSlots = (raw: unknown): CycleSlot[] => {
    const parsed = Array.isArray(raw) ? raw : [];
    return Array.from({ length: 7 }, (_, index) => {
      const slot = parsed[index] as { templates?: string[]; template?: string } | undefined;
      return { templates: slot?.templates ?? (slot?.template ? [slot.template] : []) };
    });
  };

  const startEdit = (plan: TrainingPlan) => {
    let pattern: unknown = [];
    try {
      pattern = JSON.parse(plan.cycle_pattern || '[]');
    } catch {
      pattern = [];
    }
    editingPlan = plan;
    success = '';
    error = '';
    title = plan.title;
    goal = plan.goal === plan.title ? '' : plan.goal;
    mode = plan.schedule_mode ?? 'fixed_weekdays';
    startDate = plan.start_date.slice(0, 10);
    if (mode === 'fixed_weekdays') {
      weeks = plan.cycles ?? 4;
      slots = normalizeSlots(pattern);
    } else {
      cycleDays = plan.cycle_days ?? 10;
      cycles = plan.cycles ?? 3;
      items = Array.isArray(pattern) && pattern.length > 0 ? (pattern as CycleItem[]) : [{ template: '', count: 1 }];
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    editingPlan = null;
    title = '';
    goal = '';
  };

  const removePlan = async (plan: TrainingPlan) => {
    if (!confirm(`Programma “${plan.title}” verwijderen? Nog geplande trainingen worden verwijderd, uitgevoerde blijven bewaard.`)) return;
    try {
      await deleteTrainingPlan(plan.id);
      plans = plans.filter((item) => item.id !== plan.id);
      if (editingPlan?.id === plan.id) cancelEdit();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Verwijderen is mislukt.';
    }
  };
</script>

<svelte:head><title>Programma · T.O.P. Trainer</title></svelte:head>

<div class="space-y-6">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Meerdere trainingen</p>
    <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Programma maken</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">
      Een programma plant bouwblokken uit je <a class="font-semibold text-primary-700 underline dark:text-primary-300" href="/library">bibliotheek</a> (kracht, cardio, interval, herstel, sporten) in een herhaalbare cyclus.
    </p>
  </div>

  {#if pageLoading}
    <div class="card animate-pulse">Laden...</div>
  {:else}
    <form class="card space-y-5" on:submit|preventDefault={save}>
      {#if editingPlan}<p class="rounded-xl bg-primary-50 p-3 text-sm dark:bg-primary-950">Je bewerkt “{editingPlan.title}”. Uitgevoerde trainingen en reeds gestarte cycli blijven staan; geplande trainingen vanaf vandaag worden opnieuw ingepland.</p>{/if}
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
                {#each templates as template}<option value={template.id}>{templateLabel(template)}</option>{/each}
              </select>
              <input class="input" type="number" min="1" max="20" aria-label="Aantal keer" bind:value={item.count} />
              <button class="btn-secondary" type="button" aria-label="Verwijderen" disabled={items.length === 1} on:click={() => (items = items.filter((_, i) => i !== index))}>✕</button>
            </div>
          {/each}
          <button class="btn-secondary w-full" type="button" on:click={() => (items = [...items, { template: '', count: 1 }])}>+ Bouwblok toevoegen</button>
        {:else}
        {#each slots as slot, index}
          <div class="grid gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-[7rem_1fr]">
            <p class="font-bold">{slotLabel(index)}</p>
            <div class="space-y-2">
              {#if slot.templates.length === 0}<p class="text-sm text-gray-500 dark:text-gray-400">Rustdag</p>{/if}
              {#each slot.templates as _, order}
                <div class="grid grid-cols-[1fr_auto] items-center gap-2">
                  <select class="input" aria-label="Bouwblok {order + 1} voor {slotLabel(index)}" bind:value={slot.templates[order]}>
                    <option value="">Kies bouwblok…</option>
                    {#each templates as template}<option value={template.id}>{templateLabel(template)}</option>{/each}
                  </select>
                  <button class="btn-secondary" type="button" aria-label="Verwijderen" on:click={() => (slots[index] = { templates: slot.templates.filter((_, i) => i !== order) })}>✕</button>
                </div>
              {/each}
              <button class="btn-secondary w-full" type="button" on:click={() => (slots[index] = { templates: [...slot.templates, ''] })}>+ Training toevoegen</button>
            </div>
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
        {#if saving}<LoaderCircle class="animate-spin" size={18} /> Opslaan...{:else}<Check size={18} /> {editingPlan ? 'Wijzigingen opslaan en toekomstige trainingen herplannen' : 'Programma opslaan in mijn tijdlijn'}{/if}
      </button>
      {#if editingPlan}<button class="btn-secondary w-full" type="button" on:click={cancelEdit}>Bewerken annuleren</button>{/if}
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
            <div class="flex items-start justify-between gap-3">
              <p class="font-bold">{plan.title}</p>
              <div class="flex gap-2">
                <button class="btn-secondary" type="button" aria-label="Programma bewerken" on:click={() => startEdit(plan)}><Pencil size={16} /> Bewerken</button>
                <button class="btn-danger" type="button" aria-label="Programma verwijderen" on:click={() => removePlan(plan)}><Trash2 size={16} /></button>
              </div>
            </div>
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
