<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, ChevronDown, ChevronUp, LoaderCircle, Pencil, Plus, Repeat, Trash2 } from '@lucide/svelte';
  import { createTrainingPlan, deleteTrainingPlan, deleteWorkout, getPlanWorkouts, getTemplates, getTrainingPlans, instantiateTemplate, updateTrainingPlan } from '$lib/pocketbase';
  import { blockTime, buildCycleSchedule, cycleDate, emptyCycleSlot, localDate, normalizeCycleSlots, replanCycle, type ScheduledBlock } from '$lib/programs';
  import { DAY_PARTS, DAY_PART_LABELS, templateLabel, WORKOUT_TYPE_STYLES, type CycleSlot, type DayPart, type TrainingPlan, type WorkoutTemplate } from '$lib/types';

  const MAX_WORKOUTS = 200;
  let title = '';
  let goal = '';
  let startDate = localDate(new Date());
  let cycleWeeks = 1;
  let selectedWeek = 0;
  let cycles = 4;
  let slots: CycleSlot[] = Array.from({ length: 7 }, emptyCycleSlot);
  let plans: TrainingPlan[] = [];
  let templates: WorkoutTemplate[] = [];
  let pageLoading = true;
  let editingPlan: TrainingPlan | null = null;
  let isCreating = false;
  let saving = false;
  let error = '';
  let success = '';

  $: showForm = isCreating || editingPlan !== null;
  $: activePlanCount = plans.filter((plan) => planState(plan) === 'active').length;
  $: templateById = new Map(templates.map((template) => [template.id, template]));
  $: preview = previewSchedule(startDate, cycleWeeks, cycles, slots, templateById);
  $: schedule = preview.entries;

  onMount(async () => {
    try {
      const [allPlans, allTemplates] = await Promise.all([getTrainingPlans(), getTemplates()]);
      plans = allPlans.filter((plan) => plan.schedule_mode);
      templates = allTemplates;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Programma’s konden niet worden geladen.';
    } finally {
      pageLoading = false;
    }
  });

  function previewSchedule(start: string, weeks: number, repeats: number, pattern: CycleSlot[], lookup: Map<string, WorkoutTemplate>) {
    try {
      return { entries: buildCycleSchedule(start, weeks, repeats, pattern, lookup), error: '' };
    } catch (err) {
      return { entries: [] as ScheduledBlock[], error: err instanceof Error ? err.message : 'Het schema is ongeldig.' };
    }
  }

  const formatDate = (value: string | Date) =>
    new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }).format(
      typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00`) : value
    );

  const planState = (plan: TrainingPlan): 'upcoming' | 'active' | 'ended' => {
    const today = localDate(new Date());
    if (today < plan.start_date.slice(0, 10)) return 'upcoming';
    if (today > plan.end_date.slice(0, 10)) return 'ended';
    return 'active';
  };

  const dayLabel = (index: number) => {
    if (!startDate) return `Dag ${index + 1}`;
    const date = new Date(`${startDate}T12:00:00`);
    if (Number.isNaN(date.getTime())) return `Dag ${index + 1}`;
    date.setDate(date.getDate() + index);
    return new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' }).format(date);
  };

  const resizeCycle = (weeks: number) => {
    if (weeks < cycleWeeks && slots.slice(weeks * 7).some((slot) => DAY_PARTS.some((part) => slot.periods[part].length))) {
      if (!confirm('Bij het verkorten vervallen de bouwblokken in de extra weken. Doorgaan?')) return;
    }
    slots = Array.from({ length: weeks * 7 }, (_, index) => slots[index] ?? emptyCycleSlot());
    cycleWeeks = weeks;
    selectedWeek = Math.min(selectedWeek, weeks - 1);
  };

  const setPeriod = (day: number, part: DayPart, ids: string[]) => {
    slots = slots.map((slot, index) => index === day ? { periods: { ...slot.periods, [part]: ids } } : slot);
  };

  const moveBlock = (day: number, part: DayPart, index: number, delta: number) => {
    const ids = [...slots[day].periods[part]];
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    setPeriod(day, part, ids);
  };

  const save = async () => {
    error = '';
    success = '';
    if (!title.trim()) {
      error = 'Geef het programma een naam.';
      return;
    }
    if (preview.error) {
      error = preview.error;
      return;
    }
    if (!schedule.length) {
      error = 'Kies minimaal één bouwblok uit je bibliotheek.';
      return;
    }
    if (schedule.length > MAX_WORKOUTS) {
      error = `Een programma mag maximaal ${MAX_WORKOUTS} trainingen bevatten. Verkort het schema of kies minder herhalingen.`;
      return;
    }

    saving = true;
    let planId = editingPlan?.id ?? '';
    let created = 0;
    let changed = false;
    try {
      let entries = schedule;
      let kept = 0;
      const existing = editingPlan ? await getPlanWorkouts(editingPlan.id) : [];
      const replanning = replanCycle(schedule, existing);
      if (editingPlan) {
        entries = replanning.pending;
        kept = replanning.retained.length;
      }
      const data = {
        title: title.trim(),
        goal: goal.trim() || title.trim(),
        start_date: `${startDate}T12:00:00.000Z`,
        end_date: `${localDate(cycleDate(startDate, cycleWeeks * 7 * cycles - 1))}T12:00:00.000Z`,
        weeks: cycleWeeks * cycles,
        summary: `Cyclus van ${cycleWeeks} ${cycleWeeks === 1 ? 'week' : 'weken'} × ${cycles} · ${schedule.length} trainingen`,
        schedule_mode: 'fixed_weekdays' as const,
        cycle_days: cycleWeeks * 7,
        cycles,
        cycle_pattern: JSON.stringify(slots)
      };
      const plan = editingPlan ? await updateTrainingPlan(editingPlan.id, data) : await createTrainingPlan(data);
      planId = plan.id;
      changed = true;
      if (editingPlan) {
        for (const workout of replanning.removable) await deleteWorkout(workout.id);
      }
      for (const entry of entries) {
        await instantiateTemplate(entry.template, blockTime(entry), {
          plan: plan.id,
          dayPart: entry.part,
          notes: `${title.trim()} · cyclus ${entry.cycle}, week ${Math.floor(entry.day / 7) + 1} · ${DAY_PART_LABELS[entry.part]} · bouwblok ${entry.order + 1}`
        });
        created += 1;
      }
      plans = editingPlan ? plans.map((item) => item.id === plan.id ? plan : item) : [plan, ...plans];
      success = editingPlan
        ? `Programma bijgewerkt: ${created} trainingen opnieuw gepland, ${kept} bestaande behouden.`
        : `Programma opgeslagen met ${created} geplande trainingen in je tijdlijn.`;
      cancelEdit();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Opslaan is mislukt.';
      error = changed
        ? `Opslaan is niet volledig gelukt: ${created} trainingen aangemaakt. Controleer de tijdlijn voordat je opnieuw opslaat. ${reason}`
        : reason;
      if (planId && changed) {
        try {
          plans = (await getTrainingPlans()).filter((plan) => plan.schedule_mode);
          editingPlan = plans.find((plan) => plan.id === planId) ?? editingPlan;
        } catch (reloadError) {
          error += ` Programmalijst niet vernieuwd: ${reloadError instanceof Error ? reloadError.message : 'onbekende fout'}.`;
        }
      }
    } finally {
      saving = false;
    }
  };

  const startEdit = (plan: TrainingPlan) => {
    error = '';
    if (plan.schedule_mode === 'flexible_cycle') {
      error = 'Dit oude flexibele programma kan niet meer worden bewerkt. Verwijder het en maak een programma met een vast cyclusschema.';
      return;
    }
    try {
      const days = plan.cycle_days || 7;
      if (![7, 14, 21].includes(days)) throw new Error('Dit programma heeft geen ondersteunde cyclusduur.');
      const parsed: unknown = JSON.parse(plan.cycle_pattern || '[]');
      const normalized = normalizeCycleSlots(parsed, days);
      const legacy = Array.isArray(parsed) && parsed.some((slot) => slot && typeof slot === 'object' && !('periods' in slot));
      // Oude weekschema's waren aan maandag gekoppeld, ook bij een latere startdatum.
      const start = plan.start_date.slice(0, 10);
      const shift = legacy ? (cycleDate(start, 0).getDay() + 6) % 7 : 0;
      slots = [...normalized.slice(shift), ...normalized.slice(0, shift)];
      editingPlan = plan;
      isCreating = false;
      success = '';
      title = plan.title;
      goal = plan.goal === plan.title ? '' : plan.goal;
      startDate = start;
      cycleWeeks = days / 7;
      selectedWeek = 0;
      cycles = plan.cycles || 4;
      window.setTimeout(() => document.getElementById('program-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Het programma kon niet worden geopend.';
    }
  };

  const cancelEdit = () => {
    editingPlan = null;
    isCreating = false;
    title = '';
    goal = '';
  };

  const startCreate = () => {
    editingPlan = null;
    isCreating = true;
    success = '';
    error = '';
    title = '';
    goal = '';
    startDate = localDate(new Date());
    cycleWeeks = 1;
    selectedWeek = 0;
    cycles = 4;
    slots = Array.from({ length: 7 }, emptyCycleSlot);
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
    <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Programma’s</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">
      Plan bouwblokken uit je <a class="font-semibold text-primary-700 underline dark:text-primary-300" href="/library">bibliotheek</a> in een vaste cyclus van één, twee of drie weken, met meerdere trainingen per dagdeel.
    </p>
  </div>

  {#if pageLoading}
    <div class="card animate-pulse">Laden...</div>
  {:else}
    {#if !showForm}
      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-xl font-black">Mijn programma’s</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{plans.length} programma’s · {activePlanCount} actief</p>
          </div>
          <button class="btn-primary" type="button" on:click={startCreate}><Plus size={18} /> Nieuw</button>
        </div>
        {#if plans.length === 0}
          <div class="card text-sm text-gray-600 dark:text-gray-300">Je hebt nog geen programma’s. Maak een programma om bouwblokken op je tijdlijn te plannen.</div>
        {:else}
          {#each plans as plan}
            <div class="card space-y-2">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  <p class="font-bold">{plan.title}</p>
                  <span class="badge {planState(plan) === 'active' ? 'bg-emerald-600' : planState(plan) === 'upcoming' ? 'bg-sky-600' : 'bg-gray-500'} text-white">
                    {planState(plan) === 'active' ? 'Actief' : planState(plan) === 'upcoming' ? 'Gepland' : 'Afgelopen'}
                  </span>
                </div>
                <div class="flex gap-2">
                  <button class="btn-secondary" type="button" aria-label="Programma bewerken" on:click={() => startEdit(plan)}><Pencil size={16} /> Bewerken</button>
                  <button class="btn-danger" type="button" aria-label="Programma verwijderen" on:click={() => removePlan(plan)}><Trash2 size={16} /></button>
                </div>
              </div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {plan.schedule_mode === 'flexible_cycle' ? 'Oud flexibel programma' : `Cyclus van ${(plan.cycle_days || 7) / 7} ${(plan.cycle_days || 7) === 7 ? 'week' : 'weken'} × ${plan.cycles || 1}`} · {formatDate(plan.start_date)} – {formatDate(plan.end_date)}
              </p>
              <a class="text-sm font-semibold text-primary-700 underline dark:text-primary-300" href={`/?plan=${plan.id}`}>Bekijk in tijdlijn</a>
            </div>
          {/each}
        {/if}
      </section>
    {/if}

    {#if error && !showForm}<p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
    {#if success}<p role="status" class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}

    {#if showForm}
      <form id="program-form" class="card scroll-mt-4 space-y-5" on:submit|preventDefault={save}>
        <fieldset class="min-w-0 space-y-5" disabled={saving}>
          {#if editingPlan}<p class="rounded-xl bg-primary-50 p-3 text-sm dark:bg-primary-950">Je bewerkt “{editingPlan.title}”. Uitgevoerde en gestarte trainingen blijven staan. Nog geplande trainingen vanaf vandaag worden opnieuw ingepland.</p>{/if}
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="prog-title">Naam</label>
              <input id="prog-title" class="input" bind:value={title} maxlength="120" placeholder="Bijvoorbeeld: kracht en mobiliteit" required />
            </div>
            <div>
              <label class="label" for="prog-start">Startdatum</label>
              <input id="prog-start" class="input" type="date" bind:value={startDate} required />
            </div>
            <div>
              <label class="label" for="prog-cycle">Duur van de cyclus</label>
              <select id="prog-cycle" class="input" value={cycleWeeks} on:change={(event) => { resizeCycle(Number(event.currentTarget.value)); event.currentTarget.value = String(cycleWeeks); }}>
                <option value={1}>1 week (7 dagen)</option>
                <option value={2}>2 weken (14 dagen)</option>
                <option value={3}>3 weken (21 dagen)</option>
              </select>
            </div>
            <div>
              <label class="label" for="prog-cycles">Aantal herhalingen van de cyclus</label>
              <input id="prog-cycles" class="input" type="number" min="1" max="52" step="1" bind:value={cycles} required />
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300">De cyclus begint op de startdatum en herhaalt zich elke {cycleWeeks * 7} dagen. Stel iedere week afzonderlijk in; een leeg dagdeel is vrij.</p>

          {#if templates.length === 0}
            <p class="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              Maak eerst bouwblokken in de <a class="font-semibold underline" href="/library">bibliotheek</a>.
            </p>
          {/if}
          {#if cycleWeeks > 1}
            <div class="flex flex-wrap gap-2" role="group" aria-label="Week van de cyclus">
              {#each Array.from({ length: cycleWeeks }, (_, week) => week) as week}
                <button class={selectedWeek === week ? 'btn-primary' : 'btn-secondary'} type="button" aria-pressed={selectedWeek === week} on:click={() => selectedWeek = week}>Week {week + 1}</button>
              {/each}
            </div>
          {/if}
          {#each [selectedWeek] as week}
            <section class="space-y-3" aria-label={`Week ${week + 1}`}>
              <h3 class="flex items-center gap-2 text-lg font-bold"><Repeat size={18} /> Week {week + 1}</h3>
              {#each slots.slice(week * 7, week * 7 + 7) as slot, weekday}
                {@const day = week * 7 + weekday}
                {@const count = DAY_PARTS.reduce((sum, part) => sum + slot.periods[part].length, 0)}
                <details class="rounded-xl border border-gray-200 p-3 dark:border-gray-700" open={DAY_PARTS.some((part) => slot.periods[part].length > 0)}>
                  <summary class="cursor-pointer font-bold capitalize">
                    {dayLabel(day)}
                    <span class="text-xs font-normal normal-case text-gray-500 dark:text-gray-400">
                      · {count ? `${count} ${count === 1 ? 'bouwblok' : 'bouwblokken'}` : 'Rustdag'}
                    </span>
                  </summary>
                  <div class="mt-4 space-y-4">
                    {#each DAY_PARTS as part}
                      <fieldset class="min-w-0 space-y-2">
                        <legend class="label">{DAY_PART_LABELS[part]}</legend>
                        {#each slot.periods[part] as _, order}
                          <div class="space-y-2 rounded-xl bg-gray-50 p-2 dark:bg-gray-900">
                            <select class="input min-w-0" aria-label={`Bouwblok ${order + 1}, dag ${day + 1}, ${DAY_PART_LABELS[part]}`} bind:value={slot.periods[part][order]} required>
                              <option value="">Kies bouwblok…</option>
                              {#each templates as template}<option value={template.id}>{templateLabel(template)}</option>{/each}
                            </select>
                            <div class="flex flex-wrap justify-end gap-2">
                              <button class="btn-secondary" type="button" aria-label="Bouwblok eerder uitvoeren" disabled={order === 0} on:click={() => moveBlock(day, part, order, -1)}><ChevronUp size={16} /></button>
                              <button class="btn-secondary" type="button" aria-label="Bouwblok later uitvoeren" disabled={order === slot.periods[part].length - 1} on:click={() => moveBlock(day, part, order, 1)}><ChevronDown size={16} /></button>
                              <button class="btn-secondary" type="button" aria-label="Bouwblok verwijderen" on:click={() => setPeriod(day, part, slot.periods[part].filter((_, index) => index !== order))}><Trash2 size={16} /></button>
                            </div>
                          </div>
                        {/each}
                        <button class="btn-secondary w-full" type="button" aria-label={`Nieuwe training, dag ${day + 1}, ${DAY_PART_LABELS[part]}`} on:click={() => setPeriod(day, part, [...slot.periods[part], ''])}><Plus size={16} /> Nieuw</button>
                      </fieldset>
                    {/each}
                  </div>
                </details>
              {/each}
            </section>
          {/each}

          <div class="rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-900">
            <p class="font-bold">Voorbeeld: {schedule.length} geplande trainingen</p>
            {#if preview.error}
              <p class="mt-1 text-amber-800 dark:text-amber-200">{preview.error}</p>
            {:else}
              <p class="mt-1 text-gray-600 dark:text-gray-300">{formatDate(cycleDate(startDate, 0))} – {formatDate(cycleDate(startDate, cycleWeeks * 7 * cycles - 1))}</p>
              <ul class="mt-3 flex flex-wrap gap-2">
                {#each schedule.slice(0, 14) as entry}
                  <li class="badge {WORKOUT_TYPE_STYLES[entry.template.type].badge}">
                    {entry.template.title} · {new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(entry.date)} · {DAY_PART_LABELS[entry.part]}
                  </li>
                {/each}
                {#if schedule.length > 14}<li class="text-gray-500">+ {schedule.length - 14} meer</li>{/if}
              </ul>
            {/if}
            {#if schedule.length > MAX_WORKOUTS}<p role="alert" class="mt-2 text-red-700 dark:text-red-300">Maximaal {MAX_WORKOUTS} trainingen per programma. Kies minder herhalingen of bouwblokken.</p>{/if}
          </div>

          {#if error}<p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
          <button class="btn-primary w-full" type="submit" disabled={saving}>
            {#if saving}<LoaderCircle class="animate-spin" size={18} /> Opslaan...{:else}<Check size={18} /> {editingPlan ? 'Wijzigingen opslaan en toekomstige trainingen herplannen' : 'Programma opslaan in mijn tijdlijn'}{/if}
          </button>
          <button class="btn-secondary w-full" type="button" on:click={cancelEdit}>Annuleren</button>
        </fieldset>
      </form>
    {/if}
  {/if}
</div>
