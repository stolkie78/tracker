<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { CalendarPlus, LoaderCircle, Play, Plus, Trash2 } from '@lucide/svelte';
  import {
    createTemplate,
    createTemplateExercise,
    deleteTemplate,
    getExercises,
    getTemplates,
    instantiateTemplate
  } from '$lib/pocketbase';
  import {
    CARDIO_MODE_LABELS,
    CARDIO_MODE_OPTIONS,
    DEFAULT_STRENGTH_REST_SECONDS,
    DEFAULT_STRENGTH_TEMPO,
    EXERCISE_EQUIPMENT_LABELS,
    EXPERIENCE_LEVEL_LABELS,
    RECOVERY_ACTIVITY_LABELS,
    RECOVERY_ACTIVITY_OPTIONS,
    WORKOUT_TYPE_LABELS,
    WORKOUT_TYPE_OPTIONS,
    WORKOUT_TYPE_STYLES,
    type CardioMode,
    type Exercise,
    type ExperienceLevel,
    type ExerciseEquipment,
    type RecoveryActivity,
    type WorkoutTemplate,
    type WorkoutType
  } from '$lib/types';

  type Entry = { exercise: string; equipment: ExerciseEquipment | ''; sets: number; repsMin: number; repsMax: number; weight: number; increment: number };
  const emptyEntry = (): Entry => ({ exercise: '', equipment: '', sets: 3, repsMin: 8, repsMax: 12, weight: 0, increment: 2.5 });
  const toInputDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  let templates: WorkoutTemplate[] = [];
  let exercises: Exercise[] = [];
  let pageLoading = true;
  let saving = false;
  let busyId = '';
  let error = '';
  let success = '';
  let showForm = false;
  let planDates: Record<string, string> = {};

  let type: WorkoutType = 'strength';
  let title = '';
  let duration = 60;
  let notes = '';
  let level: ExperienceLevel = 'beginner';
  let goal = '';
  let tags = '';
  let cardioMode: CardioMode = 'running';
  let distance = 0;
  let intervalWork = 30;
  let intervalRest = 60;
  let intervalRounds = 8;
  let recoveryActivity: RecoveryActivity = 'mobility';
  let entries: Entry[] = [emptyEntry()];

  onMount(async () => {
    try {
      [templates, exercises] = await Promise.all([getTemplates(), getExercises()]);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Bibliotheek kon niet worden geladen.';
    } finally {
      pageLoading = false;
    }
  });

  const optionsFor = (exerciseId: string) => exercises.find((exercise) => exercise.id === exerciseId)?.equipment_options ?? [];

  const pickExercise = (index: number, exerciseId: string) => {
    entries[index] = { ...entries[index], exercise: exerciseId, equipment: optionsFor(exerciseId)[0] ?? '' };
    entries = entries;
  };

  const resetForm = () => {
    title = '';
    notes = '';
    goal = '';
    tags = '';
    distance = 0;
    entries = [emptyEntry()];
  };

  const detailsOf = (template: WorkoutTemplate) => {
    const parts: string[] = [`${template.duration_minutes} min`];
    if (template.type === 'strength') parts.push(`${template.expand?.template_exercises_via_template?.length ?? 0} oefeningen`);
    if (template.type === 'cardio') {
      if (template.cardio_mode) parts.push(CARDIO_MODE_LABELS[template.cardio_mode]);
      if (template.distance_km) parts.push(`${template.distance_km} km`);
    }
    if (template.type === 'interval') parts.push(`${template.interval_rounds} × ${template.interval_work_seconds}s / ${template.interval_rest_seconds}s`);
    if (template.type === 'recovery' && template.recovery_activity) parts.push(RECOVERY_ACTIVITY_LABELS[template.recovery_activity]);
    return parts.join(' · ');
  };

  const save = async () => {
    error = '';
    success = '';
    if (!title.trim()) {
      error = 'Geef het bouwblok een naam.';
      return;
    }
    if (type === 'strength' && entries.some((entry) => !entry.exercise || entry.sets < 1 || entry.repsMin < 1 || entry.repsMax < entry.repsMin)) {
      error = 'Kies per oefening een oefening en controleer sets en herhalingsbereik.';
      return;
    }
    saving = true;
    try {
      const created = await createTemplate({
        title: title.trim(),
        type,
        duration_minutes: duration,
        notes,
        level,
        goal: goal.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).join(','),
        ...(type === 'cardio' ? { cardio_mode: cardioMode, distance_km: distance } : {}),
        ...(type === 'interval' ? { cardio_mode: cardioMode, interval_work_seconds: intervalWork, interval_rest_seconds: intervalRest, interval_rounds: intervalRounds } : {}),
        ...(type === 'recovery' ? { recovery_activity: recoveryActivity } : {})
      });
      if (type === 'strength') {
        for (const [index, entry] of entries.entries()) {
          await createTemplateExercise({
            template: created.id,
            exercise: entry.exercise,
            ...(entry.equipment ? { equipment: entry.equipment } : {}),
            set_order: index + 1,
            target_sets: entry.sets,
            reps_min: entry.repsMin,
            reps_max: entry.repsMax,
            starting_weight: entry.weight,
            weight_increment: entry.increment,
            rest_seconds: DEFAULT_STRENGTH_REST_SECONDS,
            tempo: DEFAULT_STRENGTH_TEMPO
          });
        }
      }
      templates = await getTemplates();
      success = `“${created.title}” is toegevoegd aan je bibliotheek.`;
      resetForm();
      showForm = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Bouwblok kon niet worden opgeslagen.';
    } finally {
      saving = false;
    }
  };

  const start = async (template: WorkoutTemplate) => {
    busyId = template.id;
    error = '';
    try {
      const workout = await instantiateTemplate(template, new Date(), { status: 'in_progress' });
      await goto(`/workouts/${workout.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Training kon niet worden gestart.';
      busyId = '';
    }
  };

  const schedule = async (template: WorkoutTemplate) => {
    const day = planDates[template.id] || toInputDate(new Date());
    busyId = template.id;
    error = '';
    success = '';
    try {
      await instantiateTemplate(template, new Date(`${day}T09:00:00`));
      success = `“${template.title}” is ingepland op ${day}.`;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Inplannen is mislukt.';
    } finally {
      busyId = '';
    }
  };

  const remove = async (template: WorkoutTemplate) => {
    if (!confirm(`“${template.title}” uit de bibliotheek verwijderen? Eerder ingeplande trainingen blijven bestaan.`)) return;
    busyId = template.id;
    try {
      await deleteTemplate(template.id);
      templates = templates.filter((entry) => entry.id !== template.id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Verwijderen is mislukt.';
    } finally {
      busyId = '';
    }
  };
</script>

<svelte:head><title>Bibliotheek · T.O.P. Trainer</title></svelte:head>

<div class="space-y-6">
  <div class="flex items-start justify-between gap-3">
    <div>
      <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Bouwblokken</p>
      <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Bibliotheek</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">
        Maak standaard trainingen (bijvoorbeeld 10K hardlopen of Upper body). Start ze direct, plan ze op een dag of gebruik ze in een
        <a class="font-semibold text-primary-700 underline dark:text-primary-300" href="/programs">programma</a>.
      </p>
    </div>
    <button class="btn-primary shrink-0" type="button" on:click={() => (showForm = !showForm)}><Plus size={18} /> Nieuw</button>
  </div>

  {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
  {#if success}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}

  {#if showForm}
    <form class="card space-y-4" on:submit|preventDefault={save}>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="tpl-type">Type</label>
          <select id="tpl-type" class="input" bind:value={type}>
            {#each WORKOUT_TYPE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="tpl-title">Naam</label>
          <input id="tpl-title" class="input" bind:value={title} maxlength="120" placeholder="Bijvoorbeeld: 10K hardlopen" required />
        </div>
        <div>
          <label class="label" for="tpl-duration">Duur (min)</label>
          <input id="tpl-duration" class="input" type="number" min="1" max="600" bind:value={duration} />
        </div>
        {#if type === 'cardio' || type === 'interval'}
          <div>
            <label class="label" for="tpl-cardio">Soort</label>
            <select id="tpl-cardio" class="input" bind:value={cardioMode}>
              {#each CARDIO_MODE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </div>
        {/if}
        {#if type === 'cardio'}
          <div>
            <label class="label" for="tpl-distance">Afstand (km)</label>
            <input id="tpl-distance" class="input" type="number" min="0" step="0.1" bind:value={distance} />
          </div>
        {/if}
        {#if type === 'interval'}
          <div><label class="label" for="tpl-work">Werk (sec)</label><input id="tpl-work" class="input" type="number" min="1" bind:value={intervalWork} /></div>
          <div><label class="label" for="tpl-rest">Rust (sec)</label><input id="tpl-rest" class="input" type="number" min="0" bind:value={intervalRest} /></div>
          <div><label class="label" for="tpl-rounds">Rondes</label><input id="tpl-rounds" class="input" type="number" min="1" bind:value={intervalRounds} /></div>
        {/if}
        {#if type === 'recovery'}
          <div>
            <label class="label" for="tpl-recovery">Activiteit</label>
            <select id="tpl-recovery" class="input" bind:value={recoveryActivity}>
              {#each RECOVERY_ACTIVITY_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </div>
        {/if}
        <div>
          <label class="label" for="tpl-level">Niveau</label>
          <select id="tpl-level" class="input" bind:value={level}>
            {#each Object.entries(EXPERIENCE_LEVEL_LABELS) as [value, label]}<option {value}>{label}</option>{/each}
          </select>
        </div>
        <div>
          <label class="label" for="tpl-goal">Doel</label>
          <input id="tpl-goal" class="input" bind:value={goal} maxlength="120" placeholder="Bijvoorbeeld: spiermassa" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="tpl-tags">Tags (komma-gescheiden)</label>
          <input id="tpl-tags" class="input" bind:value={tags} maxlength="200" placeholder="bovenlichaam, duwen, trekken" />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="tpl-notes">Notities</label>
          <textarea id="tpl-notes" class="input min-h-20 resize-y" bind:value={notes} maxlength="1000"></textarea>
        </div>
      </div>

      {#if type === 'strength'}
        <fieldset class="space-y-3">
          <legend class="label">Oefeningen</legend>
          {#each entries as entry, index}
            <div class="grid gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-2">
              <select class="input" aria-label="Oefening" value={entry.exercise} on:change={(event) => pickExercise(index, event.currentTarget.value)}>
                <option value="">Kies oefening…</option>
                {#each exercises as exercise}<option value={exercise.id}>{exercise.name}</option>{/each}
              </select>
              <select class="input" aria-label="Materiaal" bind:value={entry.equipment}>
                {#each optionsFor(entry.exercise) as option}<option value={option}>{EXERCISE_EQUIPMENT_LABELS[option]}</option>{/each}
              </select>
              <div class="grid grid-cols-4 gap-2 sm:col-span-2">
                <div><label class="label" for="e-sets-{index}">Sets</label><input id="e-sets-{index}" class="input" type="number" min="1" bind:value={entry.sets} /></div>
                <div><label class="label" for="e-min-{index}">Reps min</label><input id="e-min-{index}" class="input" type="number" min="1" bind:value={entry.repsMin} /></div>
                <div><label class="label" for="e-max-{index}">Reps max</label><input id="e-max-{index}" class="input" type="number" min="1" bind:value={entry.repsMax} /></div>
                <div><label class="label" for="e-w-{index}">Kg</label><input id="e-w-{index}" class="input" type="number" min="0" step="0.5" bind:value={entry.weight} /></div>
              </div>
              {#if entries.length > 1}
                <button class="btn-secondary sm:col-span-2" type="button" on:click={() => (entries = entries.filter((_, i) => i !== index))}><Trash2 size={16} /> Verwijderen</button>
              {/if}
            </div>
          {/each}
          <button class="btn-secondary w-full" type="button" on:click={() => (entries = [...entries, emptyEntry()])}><Plus size={16} /> Oefening toevoegen</button>
        </fieldset>
      {/if}

      <button class="btn-primary w-full" type="submit" disabled={saving}>
        {#if saving}<LoaderCircle class="animate-spin" size={18} /> Opslaan...{:else}Opslaan in bibliotheek{/if}
      </button>
    </form>
  {/if}

  {#if pageLoading}
    <div class="card animate-pulse">Laden...</div>
  {:else if templates.length === 0}
    <div class="card text-sm text-gray-600 dark:text-gray-300">Je bibliotheek is nog leeg. Maak een eerste bouwblok met “Nieuw”.</div>
  {:else}
    <div class="space-y-3">
      {#each templates as template}
        <article class="card space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-bold">{template.title}</h3>
            <span class="badge {WORKOUT_TYPE_STYLES[template.type].badge}">{WORKOUT_TYPE_LABELS[template.type]}</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300">{detailsOf(template)}</p>
          {#if template.level || template.goal || template.tags}
            <div class="flex flex-wrap items-center gap-2 text-xs">
              {#if template.level}<span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{EXPERIENCE_LEVEL_LABELS[template.level]}</span>{/if}
              {#if template.goal}<span class="text-gray-600 dark:text-gray-300">Doel: {template.goal}</span>{/if}
              {#each (template.tags ?? '').split(',').filter(Boolean) as tag}<span class="rounded-full bg-primary-50 px-2 py-0.5 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200">#{tag}</span>{/each}
            </div>
          {/if}
          {#if template.notes}<p class="text-sm text-gray-500 dark:text-gray-400">{template.notes}</p>{/if}
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-primary" type="button" disabled={busyId === template.id} on:click={() => start(template)}><Play size={16} /> Start nu</button>
            <input class="input !w-auto" type="date" aria-label="Datum inplannen" bind:value={planDates[template.id]} placeholder={toInputDate(new Date())} />
            <button class="btn-secondary" type="button" disabled={busyId === template.id} on:click={() => schedule(template)}><CalendarPlus size={16} /> Inplannen</button>
            <button class="btn-secondary" type="button" aria-label="Verwijderen" disabled={busyId === template.id} on:click={() => remove(template)}><Trash2 size={16} /></button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>
