<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { CalendarPlus, LoaderCircle, Pencil, Play, Plus, Trash2 } from '@lucide/svelte';
  import {
    saveTemplate,
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
    DAY_PARTS,
    DAY_PART_HOURS,
    DAY_PART_LABELS,
    EXERCISE_EQUIPMENT_LABELS,
    EXPERIENCE_LEVEL_LABELS,
    MUSCLE_GROUP_OPTIONS,
    RECOVERY_ACTIVITY_LABELS,
    RECOVERY_ACTIVITY_OPTIONS,
    SPORT_ACTIVITY_LABELS,
    SPORT_ACTIVITY_OPTIONS,
    WORKOUT_TYPE_LABELS,
    WORKOUT_TYPE_OPTIONS,
    WORKOUT_TYPE_STYLES,
    type CardioMode,
    type DayPart,
    type Exercise,
    type ExperienceLevel,
    type ExerciseEquipment,
    type RecoveryActivity,
    type SportActivity,
    type WorkoutTemplate,
    type WorkoutType
  } from '$lib/types';

  type Entry = { muscle: string; exercise: string; equipment: ExerciseEquipment | ''; sets: number; repsMin: number; repsMax: number; weight: number; increment: number; rest: number; tempo: string };
  const emptyEntry = (): Entry => ({ muscle: '', exercise: '', equipment: '', sets: 3, repsMin: 8, repsMax: 12, weight: 0, increment: 2.5, rest: DEFAULT_STRENGTH_REST_SECONDS, tempo: DEFAULT_STRENGTH_TEMPO });
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
  let wizardStep: 1 | 2 = 1;
  let editing: string | null = null;
  let planDates: Record<string, string> = {};
  let planParts: Record<string, DayPart> = {};

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
  let sportActivity: SportActivity = 'indoor_volleyball';
  let entries: Entry[] = [emptyEntry()];

  onMount(async () => {
    try {
      [templates, exercises] = await Promise.all([getTemplates(), getExercises()]);
      for (const template of templates) {
        for (const entry of template.expand?.template_exercises_via_template ?? []) {
          if (entry.expand?.exercise && !exercises.some((exercise) => exercise.id === entry.exercise)) {
            exercises = [...exercises, entry.expand.exercise];
          }
        }
      }
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
    editing = null;
    wizardStep = 1;
    type = 'strength';
    title = '';
    notes = '';
    goal = '';
    tags = '';
    distance = 0;
    duration = 60;
    level = 'beginner';
    cardioMode = 'running';
    intervalWork = 30;
    intervalRest = 60;
    intervalRounds = 8;
    recoveryActivity = 'mobility';
    sportActivity = 'indoor_volleyball';
    entries = [emptyEntry()];
  };

  const chooseType = async (value: WorkoutType) => {
    type = value;
    wizardStep = 2;
    error = '';
    await tick();
    document.getElementById('tpl-title')?.focus();
  };

  const edit = (template: WorkoutTemplate) => {
    editing = template.id;
    type = template.type;
    title = template.title;
    duration = template.duration_minutes;
    notes = template.notes;
    level = template.level ?? 'beginner';
    goal = template.goal ?? '';
    tags = template.tags ?? '';
    cardioMode = template.cardio_mode ?? 'running';
    distance = template.distance_km ?? 0;
    intervalWork = template.interval_work_seconds ?? 30;
    intervalRest = template.interval_rest_seconds ?? 60;
    intervalRounds = template.interval_rounds ?? 8;
    recoveryActivity = template.recovery_activity ?? 'mobility';
    sportActivity = template.sport_activity ?? 'indoor_volleyball';
    entries = [...(template.expand?.template_exercises_via_template ?? [])]
      .sort((a, b) => a.set_order - b.set_order)
      .map((entry) => ({
        muscle: entry.expand?.exercise?.muscle_group ?? '',
        exercise: entry.exercise, equipment: entry.equipment ?? '',
        sets: entry.target_sets, repsMin: entry.reps_min, repsMax: entry.reps_max,
        weight: entry.starting_weight, increment: entry.weight_increment,
        rest: entry.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS,
        tempo: entry.tempo ?? DEFAULT_STRENGTH_TEMPO
      }));
    if (!entries.length) entries = [emptyEntry()];
    showForm = true;
    wizardStep = 2;
    error = '';
    success = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const detailsOf = (template: WorkoutTemplate) => {
    const parts: string[] = [`${template.duration_minutes} min`];
    if (template.type === 'strength') parts.push(`${template.expand?.template_exercises_via_template?.length ?? 0} oefeningen`);
    if (template.type === 'cardio') {
      if (template.cardio_mode) parts.push(CARDIO_MODE_LABELS[template.cardio_mode]);
      if (template.distance_km) parts.push(`${template.distance_km} km`);
    }
    if (template.type === 'interval') parts.push(`${template.interval_rounds} × ${template.interval_work_seconds}s / ${template.interval_rest_seconds}s`);
    if (template.type === 'sport' && template.sport_activity) parts.push(SPORT_ACTIVITY_LABELS[template.sport_activity]);
    if (template.type === 'recovery' && template.recovery_activity) parts.push(RECOVERY_ACTIVITY_LABELS[template.recovery_activity]);
    return parts.join(' · ');
  };

  const save = async () => {
    if (wizardStep !== 2) return;
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
      const wasEditing = !!editing;
      const created = await saveTemplate(editing, {
        title: title.trim(),
        type,
        duration_minutes: duration,
        notes,
        level,
        goal: goal.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean).join(','),
        cardio_mode: type === 'cardio' || type === 'interval' ? cardioMode : undefined,
        distance_km: type === 'cardio' ? distance : 0,
        interval_work_seconds: type === 'interval' ? intervalWork : 0,
        interval_rest_seconds: type === 'interval' ? intervalRest : 0,
        interval_rounds: type === 'interval' ? intervalRounds : 0,
        recovery_activity: type === 'recovery' ? recoveryActivity : undefined,
        sport_activity: type === 'sport' ? sportActivity : undefined
      }, type === 'strength' ? entries.map((entry, index) => ({
        exercise: entry.exercise,
        ...(entry.equipment ? { equipment: entry.equipment } : {}),
        set_order: index + 1,
        target_sets: entry.sets,
        reps_min: entry.repsMin,
        reps_max: entry.repsMax,
        starting_weight: entry.weight,
        weight_increment: entry.increment,
        rest_seconds: entry.rest,
        tempo: entry.tempo
      })) : []);
      resetForm();
      showForm = false;
      templates = await getTemplates();
      success = wasEditing ? `“${created.title}” is bijgewerkt. Bestaande trainingen zijn niet gewijzigd.` : `“${created.title}” is toegevoegd aan je bibliotheek.`;
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
      const part = planParts[template.id] ?? 'morning';
      const hour = String(DAY_PART_HOURS[part]).padStart(2, '0');
      await instantiateTemplate(template, new Date(`${day}T${hour}:00:00`), { dayPart: part });
      success = `“${template.title}” is ingepland op ${day} · ${DAY_PART_LABELS[part]}.`;
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
      if (editing === template.id) {
        resetForm();
        showForm = false;
      }
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
    {#if !showForm}<button class="btn-primary shrink-0" type="button" disabled={pageLoading || saving || !!busyId} on:click={() => { resetForm(); showForm = true; error = ''; success = ''; }}><Plus size={18} /> Nieuw</button>{/if}
  </div>

  {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
  {#if success}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}

  {#if showForm}
    <form class="card space-y-4" on:submit|preventDefault={save}>
      <h3 class="text-xl font-bold">{editing ? 'Bouwblok bewerken' : 'Nieuw bouwblok'}</h3>
      {#if editing}<p class="text-sm text-gray-600 dark:text-gray-300">Wijzigingen gelden voor nieuwe trainingen. Reeds ingeplande en uitgevoerde trainingen blijven ongewijzigd.</p>{/if}
      <p class="text-sm text-gray-500 dark:text-gray-400">Stap {wizardStep} van 2 · {wizardStep === 1 ? 'Type kiezen' : 'Invullen'}</p>
      <fieldset disabled={saving} class="min-w-0 space-y-4">
      {#if wizardStep === 1}
        <legend class="label">Welk type training wil je maken?</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          {#each WORKOUT_TYPE_OPTIONS as option}
            <button class="btn-secondary justify-start" type="button" on:click={() => chooseType(option.value)}>{option.label}</button>
          {/each}
        </div>
      {:else}
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="badge {WORKOUT_TYPE_STYLES[type].badge}">{WORKOUT_TYPE_LABELS[type]}</span>
        <button class="btn-secondary" type="button" on:click={() => { wizardStep = 1; error = ''; }}>Type wijzigen</button>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="tpl-title">Naam</label>
          <input id="tpl-title" class="input" bind:value={title} maxlength="120" placeholder={type === 'strength' ? 'Bijvoorbeeld: Upper body' : type === 'recovery' ? 'Bijvoorbeeld: Mobiliteit' : type === 'sport' ? 'Bijvoorbeeld: Volleybaltraining' : 'Bijvoorbeeld: 10K hardlopen'} required />
        </div>
        <div>
          <label class="label" for="tpl-duration">Duur (min)</label>
          <input id="tpl-duration" class="input" type="number" required min="1" max="600" bind:value={duration} />
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
        {#if type === 'sport'}
          <div>
            <label class="label" for="tpl-sport">Sport</label>
            <select id="tpl-sport" class="input" bind:value={sportActivity}>
              {#each SPORT_ACTIVITY_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </div>
        {/if}
        {#if type === 'recovery'}
          <div>
            <label class="label" for="tpl-recovery">Activiteit</label>
            <select id="tpl-recovery" class="input" bind:value={recoveryActivity}>
              {#each RECOVERY_ACTIVITY_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
            </select>
          </div>
        {/if}
      </div>
      <details class="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
        <summary class="cursor-pointer text-sm font-semibold">Extra opties</summary>
        <div class="mt-3 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="tpl-level">Niveau</label>
          <select id="tpl-level" class="input" bind:value={level}>
            {#each Object.entries(EXPERIENCE_LEVEL_LABELS) as [value, label]}<option {value}>{label}</option>{/each}
          </select>
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
      </details>

      {#if type === 'strength'}
        <fieldset class="space-y-3">
          <legend class="label">Oefeningen</legend>
          {#each entries as entry, index}
            <div class="grid gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-2">
              <select class="input" aria-label="Spiergroep" value={entry.muscle} on:change={(event) => (entries[index] = { ...entry, muscle: event.currentTarget.value, exercise: '', equipment: '' })}>
                <option value="">Alle spiergroepen</option>
                {#each MUSCLE_GROUP_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
              </select>
              <select class="input" aria-label="Oefening" value={entry.exercise} required on:change={(event) => pickExercise(index, event.currentTarget.value)}>
                <option value="">Kies oefening…</option>
                {#each exercises.filter((item) => !entry.muscle || item.muscle_group === entry.muscle) as exercise}<option value={exercise.id}>{exercise.name}</option>{/each}
              </select>
              <select class="input" aria-label="Materiaal" bind:value={entry.equipment}>
                {#each optionsFor(entry.exercise) as option}<option value={option}>{EXERCISE_EQUIPMENT_LABELS[option]}</option>{/each}
              </select>
              <div class="grid grid-cols-2 gap-2 sm:col-span-2 sm:grid-cols-4">
                <div><label class="label" for="e-sets-{index}">Sets</label><input id="e-sets-{index}" class="input" type="number" required min="1" bind:value={entry.sets} /></div>
                <div><label class="label" for="e-min-{index}">Reps min</label><input id="e-min-{index}" class="input" type="number" required min="1" bind:value={entry.repsMin} /></div>
                <div><label class="label" for="e-max-{index}">Reps max</label><input id="e-max-{index}" class="input" type="number" required min="1" bind:value={entry.repsMax} /></div>
                <div><label class="label" for="e-w-{index}">Kg</label><input id="e-w-{index}" class="input" type="number" required min="0" step="0.1" bind:value={entry.weight} /></div>
              </div>
              <details class="sm:col-span-2">
              <summary class="cursor-pointer text-sm font-semibold">Extra oefenopties</summary>
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <div><label class="label" for="e-increment-{index}">Stap (kg)</label><input id="e-increment-{index}" class="input" type="number" min="0.1" step="0.1" required bind:value={entry.increment} /></div>
                <div><label class="label" for="e-rest-{index}">Rust (sec)</label><input id="e-rest-{index}" class="input" type="number" min="0" required bind:value={entry.rest} /></div>
                <div><label class="label" for="e-tempo-{index}">Tempo</label><input id="e-tempo-{index}" class="input" maxlength="100" bind:value={entry.tempo} /></div>
              </div>
              </details>
              {#if entries.length > 1}
                <button class="btn-secondary sm:col-span-2" type="button" on:click={() => (entries = entries.filter((_, i) => i !== index))}><Trash2 size={16} /> Verwijderen</button>
              {/if}
            </div>
          {/each}
          <button class="btn-secondary w-full" type="button" aria-label="Nieuwe oefening" on:click={() => (entries = [...entries, emptyEntry()])}><Plus size={16} /> Nieuw</button>
        </fieldset>
      {/if}

      <button class="btn-primary w-full" type="submit" disabled={saving}>
        {#if saving}<LoaderCircle class="animate-spin" size={18} /> Opslaan...{:else}Opslaan{/if}
      </button>
      {/if}
      <button class="btn-secondary w-full" type="button" on:click={() => { showForm = false; resetForm(); }}>Annuleren</button>
      </fieldset>
    </form>
  {:else if pageLoading}
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
          {#if template.level || template.tags}
            <div class="flex flex-wrap items-center gap-2 text-xs">
              {#if template.level}<span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{EXPERIENCE_LEVEL_LABELS[template.level]}</span>{/if}
              {#each (template.tags ?? '').split(',').filter(Boolean) as tag}<span class="rounded-full bg-primary-50 px-2 py-0.5 font-semibold text-primary-800 dark:bg-primary-950 dark:text-primary-200">#{tag}</span>{/each}
            </div>
          {/if}
          {#if template.notes}<p class="text-sm text-gray-500 dark:text-gray-400">{template.notes}</p>{/if}
          <div class="flex flex-wrap items-center gap-2">
            <button class="btn-secondary" type="button" disabled={saving || !!busyId} on:click={() => edit(template)}><Pencil size={16} /> Bewerken</button>
            <button class="btn-primary" type="button" disabled={saving || !!busyId} on:click={() => start(template)}><Play size={16} /> Start nu</button>
            <input class="input !w-auto" type="date" aria-label="Datum inplannen" bind:value={planDates[template.id]} placeholder={toInputDate(new Date())} />
            <select class="input !w-auto" aria-label="Dagdeel inplannen" value={planParts[template.id] ?? 'morning'} on:change={(event) => {
              const part = DAY_PARTS.find((part) => part === event.currentTarget.value);
              if (part) planParts[template.id] = part;
            }}>
              {#each DAY_PARTS as part}<option value={part}>{DAY_PART_LABELS[part]}</option>{/each}
            </select>
            <button class="btn-secondary" type="button" disabled={saving || !!busyId} on:click={() => schedule(template)}><CalendarPlus size={16} /> Inplannen</button>
            <button class="btn-secondary" type="button" aria-label="Verwijderen" disabled={saving || !!busyId} on:click={() => remove(template)}><Trash2 size={16} /></button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>
