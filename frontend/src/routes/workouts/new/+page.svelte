<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Plus, RefreshCw, Trash2 } from '@lucide/svelte';
  import {
    CARDIO_MODE_OPTIONS,
    EXERCISE_EQUIPMENT_LABELS,
    EXERCISE_EQUIPMENT_OPTIONS,
    MUSCLE_GROUP_OPTIONS,
    RECOVERY_ACTIVITY_OPTIONS,
    WORKOUT_STATUS_LABELS,
    WORKOUT_TYPE_OPTIONS,
    type CardioMode,
    type Exercise,
    type ExerciseEquipment,
    type MuscleGroup,
    type RecoveryActivity,
    type WorkoutStatus,
    type WorkoutType
  } from '$lib/types';
  import { createExercise, createWorkout, createWorkoutExercise, createWorkoutSet, getExercises, getStrengthSuggestion } from '$lib/pocketbase';

  type StrengthEntry = {
    muscle: string;
    exercise: string;
    equipment: ExerciseEquipment | '';
    sets: number;
    repsMin: number;
    repsMax: number;
    weight: number;
    increment: number;
  };

  let type: WorkoutType = 'strength';
  let title = '';
  let dateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  let scheduleStartDate = dateTime.slice(0, 10);
  const WEEKDAYS = [
    { value: 1, label: 'Ma' },
    { value: 2, label: 'Di' },
    { value: 3, label: 'Wo' },
    { value: 4, label: 'Do' },
    { value: 5, label: 'Vr' },
    { value: 6, label: 'Za' },
    { value: 0, label: 'Zo' }
  ];
  const STATUS_CYCLE: WorkoutStatus[] = ['planned', 'in_progress', 'completed', 'skipped'];
  let status: WorkoutStatus = 'planned';
  const cycleStatus = () => (status = STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length]);
  let duration = 60;
  let notes = '';
  let exercises: Exercise[] = [];
  let strengthEntries: StrengthEntry[] = [{ muscle: '', exercise: '', equipment: '', sets: 3, repsMin: 8, repsMax: 12, weight: 0, increment: 2.5 }];
  let cardioMode = 'running';
  let distance = 0;
  let averageHeartRate = 0;
  let intervalWork = 30;
  let intervalRest = 60;
  let intervalRounds = 8;
  let recoveryActivity = 'mobility';
  let perceivedEffort = 5;
  let repeatWeekly = false;
  let repeatDays = [new Date().getDay()];
  let repeatWeeks = 4;
  let loading = false;
  let error = '';
  let exerciseError = '';
  let newExerciseName = '';
  let newExerciseEquipment: ExerciseEquipment = 'machine';
  let newExerciseMuscle: MuscleGroup = 'chest';
  let addingExercise = false;

  onMount(async () => {
    try {
      exercises = await getExercises();
    } catch (err) {
      exerciseError = err instanceof Error ? err.message : 'Oefeningen konden niet worden geladen.';
    }
  });

  const TYPE_TITLES: Record<WorkoutType, string> = { strength: 'Krachttraining', cardio: 'Cardio', interval: 'Intervaltraining', recovery: 'Herstel' };
  let titleEdited = false;
  title = TYPE_TITLES[type];

  const onTypeChange = () => {
    if (!titleEdited) title = TYPE_TITLES[type];
  };

  const addStrengthEntry = () => {
    const entry: StrengthEntry = { muscle: '', exercise: '', equipment: '', sets: 3, repsMin: 8, repsMax: 12, weight: 0, increment: 2.5 };
    strengthEntries = [...strengthEntries, entry];
  };

  const removeStrengthEntry = (index: number) =>
    (strengthEntries = strengthEntries.filter((_, entryIndex) => entryIndex !== index));

  const toggleRepeatDay = (day: number) => {
    repeatDays = repeatDays.includes(day)
      ? repeatDays.filter((selected) => selected !== day)
      : [...repeatDays, day];
  };

  const updateEntry = (index: number, patch: Partial<StrengthEntry>) =>
    (strengthEntries = strengthEntries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));

  const exercisesFor = (muscle: string) => exercises.filter((exercise) => exercise.muscle_group === muscle);
  const optionsFor = (exerciseId: string) => exercises.find((exercise) => exercise.id === exerciseId)?.equipment_options ?? [];

  const selectMuscle = (index: number, muscle: string) => updateEntry(index, { muscle, exercise: '', equipment: '' });

  const selectExercise = async (index: number, exerciseId: string, muscle?: string) => {
    const equipment = optionsFor(exerciseId)[0] ?? '';
    updateEntry(index, { exercise: exerciseId, equipment, ...(muscle ? { muscle } : {}) });
    await applyPreviousProgress(index, exerciseId, equipment);
  };

  const selectEquipment = async (index: number, equipment: ExerciseEquipment) => {
    updateEntry(index, { equipment });
    await applyPreviousProgress(index, strengthEntries[index].exercise, equipment);
  };

  const applyPreviousProgress = async (index: number, exerciseId: string, equipment?: string) => {
    if (!exerciseId) return;
    try {
      const suggestion = await getStrengthSuggestion(exerciseId, equipment);
      if (!suggestion) return;
      strengthEntries = strengthEntries.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              sets: suggestion.sets,
              repsMin: suggestion.repsMin,
              repsMax: suggestion.repsMax,
              increment: suggestion.increment,
              weight: suggestion.weight
            }
          : entry
      );
    } catch (err) {
      exerciseError = err instanceof Error ? err.message : 'Vorige krachtresultaten konden niet worden geladen.';
    }
  };

  const addExercise = async () => {
    if (!newExerciseName.trim()) return;
    addingExercise = true;
    exerciseError = '';
    try {
      const created = await createExercise({ name: newExerciseName.trim(), category: 'compound', muscle_group: newExerciseMuscle, equipment_options: [newExerciseEquipment] });
      exercises = [...exercises, created].sort((a, b) => a.name.localeCompare(b.name));
      const target = strengthEntries.find((entry) => !entry.exercise);
      if (target) selectExercise(strengthEntries.indexOf(target), created.id, created.muscle_group ?? '');
      newExerciseName = '';
    } catch (err) {
      exerciseError = err instanceof Error ? err.message : 'Oefening kon niet worden aangemaakt.';
    } finally {
      addingExercise = false;
    }
  };

  const saveWorkout = async () => {
    error = '';
    if (type === 'strength' && strengthEntries.some((entry) => !entry.exercise || !entry.equipment || entry.repsMin < 1 || entry.repsMax < entry.repsMin)) {
      error = 'Controleer per oefening de selectie en het herhalingsbereik.';
      return;
    }
    if (status === 'planned' && repeatWeekly && repeatDays.length === 0) {
      error = 'Kies minimaal één weekdag voor de trainingsreeks.';
      return;
    }

    loading = true;
    try {
      const scheduleDates: Date[] = [];
      if (status === 'planned' && repeatWeekly) {
        const start = new Date(`${scheduleStartDate}T12:00:00`);
        const startWeekday = start.getDay();
        const totalDays = Math.min(Math.max(Number(repeatWeeks) || 1, 1), 52) * 7;
        for (const weekday of repeatDays) {
          let offset = (weekday - startWeekday + 7) % 7;
          while (offset < totalDays) {
            const occurrence = new Date(start);
            occurrence.setDate(start.getDate() + offset);
            scheduleDates.push(occurrence);
            offset += 7;
          }
        }
        scheduleDates.sort((a, b) => a.getTime() - b.getTime());
      } else {
        scheduleDates.push(status === 'planned' ? new Date(`${scheduleStartDate}T12:00:00`) : new Date(dateTime));
      }
      const seriesId = scheduleDates.length > 1 ? crypto.randomUUID() : '';
      let first: Awaited<ReturnType<typeof createWorkout>> | undefined;
      for (const when of scheduleDates) {
        const created = await createWorkout({
          title: title.trim(),
          type,
          status,
          performed_at: when.toISOString(),
          ...(seriesId ? { series_id: seriesId } : {}),
          duration_minutes: duration,
          notes,
          ...(type === 'cardio'
            ? { cardio_mode: cardioMode as CardioMode, distance_km: distance, average_heart_rate: averageHeartRate }
            : {}),
          ...(type === 'interval'
            ? { cardio_mode: cardioMode as CardioMode, interval_work_seconds: intervalWork, interval_rest_seconds: intervalRest, interval_rounds: intervalRounds }
            : {}),
          ...(type === 'recovery' ? { recovery_activity: recoveryActivity as RecoveryActivity } : {}),
          ...(type === 'cardio' || type === 'interval' ? { perceived_effort: perceivedEffort } : {})
        });

        if (type === 'strength') {
          for (const [index, entry] of strengthEntries.entries()) {
            const workoutExercise = await createWorkoutExercise({
              owner: created.owner,
              workout: created.id,
              exercise: entry.exercise,
              ...(entry.equipment ? { equipment: entry.equipment } : {}),
              set_order: index + 1,
              target_sets: entry.sets,
              reps_min: entry.repsMin,
              reps_max: entry.repsMax,
              starting_weight: entry.weight,
              weight_increment: entry.increment
            });
            for (let setIndex = 0; setIndex < entry.sets; setIndex += 1) {
              await createWorkoutSet({
                owner: created.owner,
                workout_exercise: workoutExercise.id,
                set_order: setIndex + 1,
                reps: 0,
                weight: entry.weight,
                completed: false
              });
            }
          }
        }
        first ??= created;
      }
      const created = first!;
      await goto(`/workouts/${created.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Training kon niet worden opgeslagen.';
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head><title>Training toevoegen · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <a href="/" class="inline-flex min-h-12 items-center gap-2 font-semibold text-gray-600 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300"><ArrowLeft size={18} /> Terug naar tijdlijn</a>
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Nieuwe sessie</p>
    <h2 class="mt-1 text-3xl font-black">Training toevoegen</h2>
  </div>

  <form class="space-y-5" on:submit|preventDefault={saveWorkout}>
    <section class="card space-y-4">
      <div>
        <label class="label" for="workout-type">Trainingstype</label>
        <select id="workout-type" class="input" bind:value={type} on:change={onTypeChange}>
          {#each WORKOUT_TYPE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
        </select>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="title">Naam</label>
          <input id="title" class="input" bind:value={title} on:input={() => (titleEdited = true)} required />
        </div>
        <div>
          <label class="label" for="performed-at">{status === 'planned' ? 'Startdatum' : 'Datum en tijd'}</label>
          {#if status === 'planned'}
            <input id="performed-at" class="input" type="date" bind:value={scheduleStartDate} required />
          {:else}
            <input id="performed-at" class="input" type="datetime-local" bind:value={dateTime} required />
          {/if}
        </div>
        <div>
          <label class="label" for="duration">Duur (minuten)</label>
          <input id="duration" class="input" type="number" min="0" step="1" bind:value={duration} />
        </div>
        <div>
          <label class="label" for="status">Status</label>
          <button id="status" type="button" class="btn-secondary w-full justify-between" on:click={cycleStatus} aria-label="Status wijzigen, nu {WORKOUT_STATUS_LABELS[status]}">
            <span class="font-bold">{WORKOUT_STATUS_LABELS[status]}</span>
            <span class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300"><RefreshCw size={16} /> Volgende: {WORKOUT_STATUS_LABELS[STATUS_CYCLE[(STATUS_CYCLE.indexOf(status) + 1) % STATUS_CYCLE.length]]}</span>
          </button>
        </div>
      </div>
      {#if status === 'planned'}
        <div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
          <label class="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" class="h-5 w-5" bind:checked={repeatWeekly} /> Wekelijks herhalen</label>
          {#if repeatWeekly}
            <div class="mt-3 space-y-4">
              <fieldset>
                <legend class="label">Weekdagen voor deze training</legend>
                <div class="flex flex-wrap gap-2">
                  {#each WEEKDAYS as day}
                    <button
                      type="button"
                      class="touch-target min-w-12 rounded-xl px-3 text-sm font-bold transition {repeatDays.includes(day.value) ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}"
                      aria-pressed={repeatDays.includes(day.value)}
                      on:click={() => toggleRepeatDay(day.value)}>{day.label}</button>
                  {/each}
                </div>
              </fieldset>
              <div class="max-w-xs">
                <label class="label" for="repeat-weeks">Aantal weken</label>
                <input id="repeat-weeks" class="input" type="number" min="1" max="52" bind:value={repeatWeeks} />
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">Plant deze training op de gekozen weekdagen, vanaf de startdatum. Er wordt geen tijd ingepland.</p>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </section>

    {#if type === 'strength'}
      <section class="card space-y-4">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.17em] text-overload-signal">Krachttraining</p>
          <h3 class="mt-1 text-xl font-bold">Oefeningen en overload</h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Verhoogt het gewicht automatisch met de ingestelde stap zodra alle werksets de bovengrens halen.</p>
        </div>
        {#if exerciseError}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{exerciseError}</p>{/if}
        {#each strengthEntries as entry, index}
          <div class="rounded-2xl border border-gray-200 p-4 dark:border-gray-700">
            <div class="mb-4 flex items-center justify-between">
              <h4 class="font-bold">Oefening {index + 1}</h4>
              {#if strengthEntries.length > 1}<button class="touch-target rounded-xl p-3 text-red-600" type="button" aria-label="Oefening verwijderen" on:click={() => removeStrengthEntry(index)}><Trash2 size={18} /></button>{/if}
            </div>
            <div class="space-y-4">
              <div>
                <p class="label">1. Wat wil je trainen?</p>
                <div class="flex flex-wrap gap-2" role="group" aria-label="Spiergroep">
                  {#each MUSCLE_GROUP_OPTIONS as option}
                    <button type="button" class="touch-target rounded-xl px-4 text-sm font-bold transition {entry.muscle === option.value ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}" aria-pressed={entry.muscle === option.value} on:click={() => selectMuscle(index, option.value)}>{option.label}</button>
                  {/each}
                </div>
              </div>
              {#if entry.muscle}
                <div>
                  <label class="label" for={`exercise-${index}`}>2. Welke oefening?</label>
                  <select id={`exercise-${index}`} class="input" value={entry.exercise} on:change={(event) => selectExercise(index, event.currentTarget.value)} required>
                    <option value="">Kies een oefening</option>
                    {#each exercisesFor(entry.muscle) as exercise}<option value={exercise.id}>{exercise.name}</option>{/each}
                  </select>
                </div>
              {/if}
              {#if entry.exercise}
                <div>
                  <p class="label">3. Met welk materiaal?</p>
                  <div class="flex flex-wrap gap-2" role="group" aria-label="Materiaal">
                    {#each optionsFor(entry.exercise) as option}
                      <button type="button" class="touch-target rounded-xl px-4 text-sm font-bold transition {entry.equipment === option ? 'bg-overload-signal text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}" aria-pressed={entry.equipment === option} on:click={() => selectEquipment(index, option)}>{EXERCISE_EQUIPMENT_LABELS[option]}</button>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><label class="label" for={`sets-${index}`}>Sets</label><input id={`sets-${index}`} class="input" type="number" min="1" max="20" bind:value={entry.sets} /></div>
                <div><label class="label" for={`reps-min-${index}`}>Min reps</label><input id={`reps-min-${index}`} class="input" type="number" min="1" bind:value={entry.repsMin} /></div>
                <div><label class="label" for={`reps-max-${index}`}>Max reps</label><input id={`reps-max-${index}`} class="input" type="number" min="1" bind:value={entry.repsMax} /></div>
                <div><label class="label" for={`weight-${index}`}>Startgewicht (kg)</label><input id={`weight-${index}`} class="input" type="number" min="0" step="0.5" bind:value={entry.weight} /></div>
              </div>
              <div class="max-w-xs">
                <label class="label" for={`increment-${index}`}>Gewichtsstap (kg)</label>
                <input id={`increment-${index}`} class="input" type="number" min="0.25" step="0.25" bind:value={entry.increment} />
              </div>
            </div>
          </div>
        {/each}
        <button class="btn-secondary w-full" type="button" on:click={addStrengthEntry}><Plus size={18} /> Oefening toevoegen</button>
        <div class="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input class="input" bind:value={newExerciseName} placeholder="Nieuwe oefening in catalogus" aria-label="Naam nieuwe oefening" />
          <label class="sr-only" for="new-exercise-muscle">Spiergroep</label>
          <select id="new-exercise-muscle" class="input sm:w-40" bind:value={newExerciseMuscle}>
            {#each MUSCLE_GROUP_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
          </select>
          <label class="sr-only" for="new-exercise-equipment">Materiaaltype</label>
          <select id="new-exercise-equipment" class="input sm:w-40" bind:value={newExerciseEquipment}>
            {#each EXERCISE_EQUIPMENT_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
          </select>
          <button class="btn-secondary shrink-0" type="button" on:click={addExercise} disabled={addingExercise || !newExerciseName.trim()}>{addingExercise ? 'Opslaan...' : 'Aanmaken'}</button>
        </div>
      </section>
    {:else if type === 'cardio'}
      <section class="card space-y-4">
        <div><p class="text-xs font-bold uppercase tracking-[0.17em] text-overload-signal">Cardio</p><h3 class="mt-1 text-xl font-bold">Cardio-details</h3></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="cardio-mode">Activiteit</label><select id="cardio-mode" class="input" bind:value={cardioMode}>{#each CARDIO_MODE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}</select></div>
          <div><label class="label" for="distance">Afstand (km)</label><input id="distance" class="input" type="number" min="0" step="0.01" bind:value={distance} /></div>
          <div><label class="label" for="heart-rate">Gem. hartslag (bpm)</label><input id="heart-rate" class="input" type="number" min="0" step="1" bind:value={averageHeartRate} /></div>
          <div><label class="label" for="effort">Ervaren inspanning (1-10)</label><input id="effort" class="input" type="number" min="1" max="10" bind:value={perceivedEffort} /></div>
        </div>
      </section>
    {:else if type === 'interval'}
      <section class="card space-y-4">
        <div><p class="text-xs font-bold uppercase tracking-[0.17em] text-overload-signal">Interval</p><h3 class="mt-1 text-xl font-bold">Intervaldetails</h3></div>
        <div class="grid grid-cols-2 gap-4">
          <div><label class="label" for="interval-mode">Activiteit</label><select id="interval-mode" class="input" bind:value={cardioMode}>{#each CARDIO_MODE_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}</select></div>
          <div><label class="label" for="rounds">Aantal rondes</label><input id="rounds" class="input" type="number" min="1" bind:value={intervalRounds} /></div>
          <div><label class="label" for="work-seconds">Werktijd (sec)</label><input id="work-seconds" class="input" type="number" min="1" bind:value={intervalWork} /></div>
          <div><label class="label" for="rest-seconds">Rusttijd (sec)</label><input id="rest-seconds" class="input" type="number" min="0" bind:value={intervalRest} /></div>
          <div class="col-span-2"><label class="label" for="interval-effort">Ervaren inspanning (1-10)</label><input id="interval-effort" class="input" type="number" min="1" max="10" bind:value={perceivedEffort} /></div>
        </div>
      </section>
    {:else}
      <section class="card space-y-4">
        <div><p class="text-xs font-bold uppercase tracking-[0.17em] text-overload-signal">Herstel</p><h3 class="mt-1 text-xl font-bold">Herstelactiviteit</h3></div>
        <div><label class="label" for="recovery-activity">Activiteit</label><select id="recovery-activity" class="input" bind:value={recoveryActivity}>{#each RECOVERY_ACTIVITY_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}</select></div>
      </section>
    {/if}

    <section class="card">
      <label class="label" for="notes">Notities</label>
      <textarea id="notes" class="input min-h-28 resize-y" bind:value={notes} placeholder="Hoe voelde de training?"></textarea>
    </section>
    {#if error}<div class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</div>{/if}
    <button class="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Training opslaan...' : 'Training opslaan'}</button>
  </form>
</div>
