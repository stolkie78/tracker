<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ArrowLeft, Check, ChevronRight, Play, Plus, RefreshCw, Trash2 } from '@lucide/svelte';
  import { createWorkoutExercise, createWorkoutSet, deleteFutureSeries, deleteWorkout, getExercises, getStrengthSuggestion, getWorkout, getWorkoutExercises, getSetsForWorkoutExercise, updateWorkout } from '$lib/pocketbase';
  import {
    CARDIO_MODE_LABELS,
    DEFAULT_STRENGTH_REST_SECONDS,
    DEFAULT_STRENGTH_TEMPO,
    EXERCISE_EQUIPMENT_LABELS,
    formatPace,
    getTopProtocol,
    MUSCLE_GROUP_OPTIONS,
    RECOVERY_ACTIVITY_LABELS,
    WORKOUT_STATUS_LABELS,
    WORKOUT_TYPE_LABELS,
  WORKOUT_TYPE_STYLES,
    type Exercise,
    type ExerciseEquipment,
    type Workout,
    type WorkoutExercise,
    type WorkoutSet
  } from '$lib/types';

  type ExerciseLog = { record: WorkoutExercise; name: string; sets: WorkoutSet[] };

  let workout: Workout | null = null;
  let exerciseLogs: ExerciseLog[] = [];
  let loading = true;
  let error = '';

  $: workoutDate = workout
    ? new Intl.DateTimeFormat('nl-NL', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        ...(workout.status === 'planned' ? {} : { hour: '2-digit', minute: '2-digit' })
      }).format(new Date(workout.performed_at))
    : '';

  let catalog: Exercise[] = [];
  let showAdd = false;
  let adding = false;
  let addMuscle = '';
  let addExerciseId = '';
  let addEquipment: ExerciseEquipment | '' = '';
  let addSets = 3;
  let addRepsMin = 8;
  let addRepsMax = 12;
  let addWeight = 0;
  let addIncrement = 2.5;

  $: addOptions = catalog.filter((exercise) => !addMuscle || exercise.muscle_group === addMuscle);
  $: equipmentOptions = catalog.find((exercise) => exercise.id === addExerciseId)?.equipment_options ?? [];

  const openAdd = async () => {
    showAdd = !showAdd;
    if (showAdd && catalog.length === 0) {
      try {
        catalog = await getExercises();
      } catch (err) {
        error = err instanceof Error ? err.message : 'Oefeningen konden niet worden geladen.';
      }
    }
  };

  const pickExercise = async () => {
    addEquipment = equipmentOptions[0] ?? '';
    if (!addExerciseId) return;
    const suggestion = await getStrengthSuggestion(addExerciseId, addEquipment || undefined).catch(() => null);
    if (suggestion) {
      addSets = suggestion.sets;
      addRepsMin = suggestion.repsMin;
      addRepsMax = suggestion.repsMax;
      addIncrement = suggestion.increment;
      addWeight = suggestion.weight;
    }
  };

  const addExerciseToWorkout = async () => {
    if (!workout || !addExerciseId || addRepsMin < 1 || addRepsMax < addRepsMin || addSets < 1) {
      error = 'Kies een oefening en controleer sets en herhalingsbereik.';
      return;
    }
    adding = true;
    error = '';
    try {
      const record = await createWorkoutExercise({
        owner: workout.owner,
        workout: workout.id,
        exercise: addExerciseId,
        ...(addEquipment ? { equipment: addEquipment } : {}),
        set_order: Math.max(0, ...exerciseLogs.map((log) => log.record.set_order)) + 1,
        target_sets: addSets,
        reps_min: addRepsMin,
        reps_max: addRepsMax,
        starting_weight: addWeight,
        weight_increment: addIncrement,
        rest_seconds: DEFAULT_STRENGTH_REST_SECONDS,
        tempo: DEFAULT_STRENGTH_TEMPO
      });
      for (let index = 0; index < addSets; index += 1) {
        await createWorkoutSet({ owner: workout.owner, workout_exercise: record.id, set_order: index + 1, reps: 0, weight: addWeight, completed: false });
      }
      addExerciseId = '';
      addEquipment = '';
      showAdd = false;
      await loadExerciseLogs();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Oefening kon niet worden toegevoegd.';
    } finally {
      adding = false;
    }
  };

  const loadExerciseLogs = async () => {
    if (!workout || workout.type !== 'strength') {
      loading = false;
      return;
    }
    loading = true;
    error = '';
    try {
      const exercises = await getWorkoutExercises(workout.id);
      exerciseLogs = await Promise.all(
        exercises.map(async (record) => ({
          record,
          name: record.expand?.exercise?.name ?? 'Oefening',
          sets: await getSetsForWorkoutExercise(record.id)
        }))
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Krachtsets konden niet worden geladen.';
    } finally {
      loading = false;
    }
  };

  onMount(async () => {
    try {
      const workoutId = $page.params.id;
      if (!workoutId) throw new Error('Training-id ontbreekt.');
      workout = await getWorkout(workoutId);
      await loadExerciseLogs();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Training kon niet worden geladen.';
      loading = false;
    }
  });

  const changeStatus = async (status: Workout['status']) => {
    if (!workout) return;
    try {
      workout = await updateWorkout(workout.id, {
        status,
        ...(workout.status === 'planned' && status === 'in_progress' ? { performed_at: new Date().toISOString() } : {})
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Status kon niet worden aangepast.';
    }
  };

  const removeWorkout = async () => {
    if (!workout) return;
    if (!confirm('Weet je zeker dat je deze training wilt verwijderen?')) return;
    try {
      await deleteWorkout(workout.id);
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Training kon niet worden verwijderd.';
    }
  };

  const removeSeries = async () => {
    if (!workout?.series_id) return;
    if (!confirm('Alle nog geplande trainingen in deze reeks verwijderen?')) return;
    try {
      await deleteFutureSeries(workout.series_id);
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Reeks kon niet worden verwijderd.';
    }
  };

  const doneSets = (exercise: ExerciseLog) => exercise.sets.filter((set) => set.completed).length;
  const isDone = (exercise: ExerciseLog) => exercise.sets.length > 0 && doneSets(exercise) === exercise.sets.length;
  $: finishedCount = exerciseLogs.filter(isDone).length;

  const STATUS_CYCLE: Workout['status'][] = ['planned', 'in_progress', 'completed', 'skipped'];
  const cycleStatus = () => {
    if (!workout) return;
    changeStatus(STATUS_CYCLE[(STATUS_CYCLE.indexOf(workout.status) + 1) % STATUS_CYCLE.length]);
  };

  const startWorkout = () => changeStatus('in_progress');
  const finishWorkout = async () => {
    if (exerciseLogs.some((exercise) => !isDone(exercise)) && !confirm('Niet alle oefeningen zijn afgerond. Toch afronden?')) return;
    await changeStatus('completed');
  };
</script>

<svelte:head><title>{workout?.title ?? 'Training'} · T.O.P. Trainer</title></svelte:head>

{#if loading && !workout}
  <div class="card animate-pulse">Training laden...</div>
{:else if !workout}
  <div class="card space-y-3">
    <h2 class="text-xl font-bold">Training niet beschikbaar</h2>
    <p class="text-gray-600 dark:text-gray-300">{error || 'Deze training bestaat niet of je hebt geen toegang.'}</p>
    <a class="btn-secondary" href="/">Terug naar tijdlijn</a>
  </div>
{:else}
<div class="space-y-5">
  <a href="/" class="inline-flex min-h-12 items-center gap-2 font-semibold text-gray-600 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300"><ArrowLeft size={18} /> Terug naar tijdlijn</a>
  <article class="card">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex flex-wrap gap-2">
          <span class="badge {WORKOUT_TYPE_STYLES[workout.type].badge}">{WORKOUT_TYPE_LABELS[workout.type]}</span>
          <span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{WORKOUT_STATUS_LABELS[workout.status]}</span>
          {#if workout.type === 'strength'}<span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{workout.series_id || workout.plan ? 'Programma' : 'Losse training'}</span>{/if}
          {#if workout.strava_id}<a class="badge bg-orange-600 text-white" href={`https://www.strava.com/activities/${workout.strava_id}`} target="_blank" rel="noopener noreferrer">Strava</a>{/if}
        </div>
        <h2 class="mt-3 text-3xl font-black">{workout.title}</h2>
        <p class="mt-2 capitalize text-gray-600 dark:text-gray-300">{workoutDate}</p>
      </div>
      <button class="btn-danger" on:click={removeWorkout}><Trash2 size={17} /> Verwijderen</button>
    </div>
    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      {#if workout.duration_minutes}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Duur</span><p class="font-bold">{workout.duration_minutes} minuten</p></div>{/if}
      {#if workout.type === 'cardio'}
        {#if workout.cardio_mode}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Activiteit</span><p class="font-bold">{CARDIO_MODE_LABELS[workout.cardio_mode]}</p></div>{/if}
        {#if workout.distance_km}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Afstand</span><p class="font-bold">{workout.distance_km} km</p></div>{/if}
        {#if workout.distance_km && workout.duration_minutes && workout.cardio_mode === 'running'}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Gemiddeld tempo</span><p class="font-bold">{formatPace(workout.distance_km, workout.duration_minutes)}</p></div>{/if}
        {#if workout.elevation_gain_m}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Hoogtemeters</span><p class="font-bold">{workout.elevation_gain_m} m</p></div>{/if}
        {#if workout.average_heart_rate}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Gemiddelde hartslag</span><p class="font-bold">{workout.average_heart_rate} bpm</p></div>{/if}
      {:else if workout.type === 'interval'}
        {#if workout.cardio_mode}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Activiteit</span><p class="font-bold">{CARDIO_MODE_LABELS[workout.cardio_mode]}</p></div>{/if}
        <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Interval</span><p class="font-bold">{workout.interval_rounds} rondes · {workout.interval_work_seconds}s werk / {workout.interval_rest_seconds}s rust</p></div>
      {:else if workout.type === 'recovery' && workout.recovery_activity}
        <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Activiteit</span><p class="font-bold">{RECOVERY_ACTIVITY_LABELS[workout.recovery_activity]}</p></div>
      {/if}
      {#if workout.perceived_effort}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Ervaren inspanning</span><p class="font-bold">{workout.perceived_effort} / 10</p></div>{/if}
    </div>
    {#if workout.notes}<div class="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-800"><p class="text-sm font-semibold text-gray-500 dark:text-gray-400">Notities</p><p class="mt-1 whitespace-pre-wrap">{workout.notes}</p></div>{/if}
    <div class="mt-5">
      <p class="label">Status</p>
      <button type="button" class="btn-secondary min-w-[14rem] justify-between" on:click={cycleStatus} aria-label="Status wijzigen, nu {WORKOUT_STATUS_LABELS[workout.status]}">
        <span class="font-bold">{WORKOUT_STATUS_LABELS[workout.status]}</span>
        <span class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300"><RefreshCw size={16} /> Volgende: {WORKOUT_STATUS_LABELS[STATUS_CYCLE[(STATUS_CYCLE.indexOf(workout.status) + 1) % STATUS_CYCLE.length]]}</span>
      </button>
    </div>
    {#if workout.series_id}<button class="btn-secondary mt-4" type="button" on:click={removeSeries}>Geplande reeks verwijderen</button>{/if}
  </article>

  {#if workout.type === 'strength'}
    <section class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.17em] text-overload-signal">Oefeningen</p>
          <h3 class="mt-1 text-2xl font-black">{finishedCount} van {exerciseLogs.length} afgerond</h3>
        </div>
        <button type="button" class="btn-secondary" on:click={openAdd}><Plus size={18} /> Oefening toevoegen</button>
      </div>
      {#if showAdd}
        <form class="card space-y-4" on:submit|preventDefault={addExerciseToWorkout}>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {workout.series_id ? 'Deze oefening geldt alleen voor deze sessie; de rest van het geplande programma blijft ongewijzigd.' : 'Voeg tijdens de training een extra oefening toe.'}
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="add-muscle">Spiergroep</label>
              <select id="add-muscle" class="input" bind:value={addMuscle} on:change={() => (addExerciseId = '')}>
                <option value="">Alle</option>
                {#each MUSCLE_GROUP_OPTIONS as option}<option value={option.value}>{option.label}</option>{/each}
              </select>
            </div>
            <div>
              <label class="label" for="add-exercise">Oefening</label>
              <select id="add-exercise" class="input" bind:value={addExerciseId} on:change={pickExercise} required>
                <option value="">Kies...</option>
                {#each addOptions as option}<option value={option.id}>{option.name}</option>{/each}
              </select>
            </div>
            <div>
              <label class="label" for="add-equipment">Materiaal</label>
              <select id="add-equipment" class="input" bind:value={addEquipment}>
                {#each equipmentOptions as option}<option value={option}>{EXERCISE_EQUIPMENT_LABELS[option]}</option>{/each}
              </select>
            </div>
            <div><label class="label" for="add-sets">Sets</label><input id="add-sets" class="input" type="number" min="1" bind:value={addSets} /></div>
            <div><label class="label" for="add-min">Reps min</label><input id="add-min" class="input" type="number" min="1" bind:value={addRepsMin} /></div>
            <div><label class="label" for="add-max">Reps max</label><input id="add-max" class="input" type="number" min="1" bind:value={addRepsMax} /></div>
            <div><label class="label" for="add-weight">Startgewicht (kg)</label><input id="add-weight" class="input" type="number" min="0" step="0.5" bind:value={addWeight} /></div>
            <div><label class="label" for="add-inc">Gewichtsstap (kg)</label><input id="add-inc" class="input" type="number" min="0" step="0.5" bind:value={addIncrement} /></div>
          </div>
          <button class="btn-primary w-full" type="submit" disabled={adding}>{adding ? 'Toevoegen...' : 'Toevoegen aan training'}</button>
        </form>
      {/if}
      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      {#if loading}
        <div class="card animate-pulse">Oefeningen laden...</div>
      {:else if exerciseLogs.length === 0}
        <div class="card text-gray-600 dark:text-gray-300">Voor deze training zijn nog geen oefeningen ingevoerd.</div>
      {:else}
        <ul class="space-y-3">
          {#each exerciseLogs as exercise, exerciseIndex}
            {@const topProtocol = getTopProtocol(
              exercise.record.reps_min,
              exercise.record.reps_max,
              exercise.record.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS
            )}
            <li>
              <a href={`/workouts/${workout.id}/exercise/${exercise.record.id}`} class="card flex min-h-[72px] items-center gap-4 transition hover:border-primary-400 hover:shadow-md">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-black {isDone(exercise) ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-white'}">
                  {#if isDone(exercise)}<Check size={22} strokeWidth={3} />{:else}{exerciseIndex + 1}{/if}
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-lg font-bold">{exercise.name}</span>
                  {#if exercise.record.equipment}<span class="mt-0.5 inline-block rounded-full bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-800 dark:bg-gray-700 dark:text-white">{EXERCISE_EQUIPMENT_LABELS[exercise.record.equipment]}</span>{/if}
                  <span class="block text-sm text-gray-600 dark:text-gray-300">
                    {exercise.record.target_sets} × {exercise.record.reps_min}-{exercise.record.reps_max} · {doneSets(exercise)}/{exercise.sets.length} sets
                  </span>
                  <span class="block text-sm text-gray-600 dark:text-gray-300">
                    Rust {exercise.record.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS}s · tempo {exercise.record.tempo ?? DEFAULT_STRENGTH_TEMPO}
                  </span>
                  <span class="block text-sm font-semibold text-primary-700 dark:text-primary-300">
                    T.O.P.-index {String(topProtocol.index).padStart(2, '0')} · {topProtocol.name} · herstel na training: {topProtocol.recovery}
                  </span>
                </span>
                <ChevronRight size={22} class="shrink-0 text-gray-500" />
              </a>
            </li>
          {/each}
        </ul>
        {#if workout.status === 'planned'}
          <button class="btn-primary w-full" on:click={startWorkout}><Play size={18} /> Training starten</button>
        {:else if workout.status === 'in_progress'}
          <button class="btn-primary w-full" on:click={finishWorkout}><Check size={18} /> Training afronden</button>
        {/if}
      {/if}
    </section>
  {:else if workout.status === 'planned'}
    <button class="btn-primary w-full" on:click={startWorkout}><Play size={18} /> Training starten</button>
  {:else if workout.status === 'in_progress'}
    <button class="btn-primary w-full" on:click={finishWorkout}><Check size={18} /> Training afronden</button>
  {/if}
  {#if error && workout.type !== 'strength'}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
</div>
{/if}
