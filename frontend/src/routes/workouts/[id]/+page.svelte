<script lang="ts">
  import { onMount } from 'svelte';
  import CycleChoice from '$lib/components/CycleChoice.svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { formatWorkoutTime, requiresDistanceAndTime, distanceCompletionData } from '$lib/workouts';
  import { ArrowLeft, Check, ChevronRight, Pencil, Play, Plus, Trash2 } from '@lucide/svelte';
  import { createWorkoutExercise, createWorkoutSet, deleteFutureSeries, deleteWorkout, getExercises, getStrengthSuggestion, getWorkout, getWorkoutExercises, getSetsForWorkoutExercise, updateNextSeriesExerciseWeight, updateWorkout } from '$lib/pocketbase';
  import {
    CARDIO_MODE_LABELS,
    DEFAULT_STRENGTH_REST_SECONDS,
    DEFAULT_STRENGTH_TEMPO,
    DAY_PART_LABELS,
    DAY_PART_OPTIONS,
    EXERCISE_EQUIPMENT_LABELS,
    formatPace,
    getTopProtocol,
    MUSCLE_GROUP_OPTIONS,
    RECOVERY_ACTIVITY_LABELS,
    SPORT_ACTIVITY_LABELS,
    SPORT_ACTIVITY_OPTIONS,
    CARDIO_MODE_OPTIONS,
    LIFE_ACTIVITY_OPTIONS,
    RECOVERY_ACTIVITY_OPTIONS,
    nextSuggestedWeight,
    WORKOUT_STATUS_LABELS,
    WORKOUT_STATUS_CARD_STYLES,
    WORKOUT_STATUS_OPTIONS,
    WORKOUT_TYPE_LABELS,
    WORKOUT_TYPE_STYLES,
    type Exercise,
    type DayPart,
    type ExerciseEquipment,
    type Workout,
    type WorkoutExercise,
    type WorkoutSet
  } from '$lib/types';

  type ExerciseLog = { record: WorkoutExercise; name: string; sets: WorkoutSet[] };

  let workout: Workout | null = null;
  let selectedStatus: Workout['status'] = 'planned';
  let exerciseLogs: ExerciseLog[] = [];
  let loading = true;
  let error = '';
  let statusSaving = false;
  let showDistanceCompletion = false;
  let actualDistance: number | undefined = undefined;
  let actualTime = '';

  $: workoutDate = workout
    ? new Intl.DateTimeFormat('en-US', {
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
        error = err instanceof Error ? err.message : 'Exercises could not be loaded.';
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
      error = 'Choose an exercise and check the sets and rep range.';
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
      error = err instanceof Error ? err.message : 'Exercise could not be added.';
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
          name: record.expand?.exercise?.name ?? 'Exercise',
          sets: await getSetsForWorkoutExercise(record.id)
        }))
      );
    } catch (err) {
      error = err instanceof Error ? err.message : 'Strength sets could not be loaded.';
    } finally {
      loading = false;
    }
  };

  onMount(async () => {
    try {
      const workoutId = $page.params.id;
      if (!workoutId) throw new Error('Workout ID is missing.');
      workout = await getWorkout(workoutId);
      selectedStatus = workout.status;
      await loadExerciseLogs();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Workout could not be loaded.';
      loading = false;
    }
  });

  const persistStatus = async (
    status: Workout['status'],
    results: Partial<Pick<Workout, 'distance_km' | 'duration_minutes'>> = {}
  ) => {
    if (!workout || statusSaving) return false;
    statusSaving = true;
    error = '';
    try {
      if (status === 'completed' && workout.status !== 'completed' && workout.series_id) {
        for (const exercise of exerciseLogs) {
          const { record, sets } = exercise;
          if (sets.length === 0 || !sets.every((set) => set.completed && Number(set.reps) >= record.reps_max)) continue;
          const currentWeight = Math.min(...sets.map((set) => Number(set.weight) || 0));
          const nextWeight = nextSuggestedWeight(record.reps_max, sets, currentWeight, record.weight_increment);
          if (nextWeight > currentWeight) {
            await updateNextSeriesExerciseWeight(workout, record, nextWeight);
          }
        }
      }
      workout = await updateWorkout(workout.id, {
        status,
        ...results,
        ...(workout.status === 'planned' && status === 'in_progress' ? { performed_at: new Date().toISOString() } : {})
      });
      selectedStatus = workout.status;
      return true;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Workout could not be updated.';
      return false;
    } finally {
      statusSaving = false;
    }
  };

  let editing = false;
  let saving = false;
  let editDayPart: DayPart | '' = '';
  let edit = { title: '', when: '', duration: 0, notes: '', cardio: 'running', distance: 0, work: 30, rest: 60, rounds: 8, recovery: 'mobility', sport: 'indoor_volleyball' };

  const toLocalInput = (iso: string) => {
    const date = new Date(iso);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const openEdit = () => {
    if (!workout) return;
    editDayPart = workout.day_part || '';
    edit = {
      title: workout.title,
      when: toLocalInput(workout.performed_at),
      duration: workout.duration_minutes ?? 0,
      notes: workout.notes ?? '',
      cardio: workout.cardio_mode ?? 'running',
      distance: workout.distance_km ?? 0,
      work: workout.interval_work_seconds ?? 30,
      rest: workout.interval_rest_seconds ?? 60,
      rounds: workout.interval_rounds ?? 8,
      recovery: workout.recovery_activity ?? 'mobility',
      sport: workout.sport_activity ?? 'indoor_volleyball'
    };
    editing = true;
  };

  const saveEdit = async () => {
    if (!workout) return;
    if (!edit.title.trim() || !edit.when) {
      error = 'Title and date are required.';
      return;
    }
    saving = true;
    error = '';
    try {
      const type = workout.type;
      const updated = await updateWorkout(workout.id, {
        title: edit.title.trim(),
        performed_at: new Date(edit.when).toISOString(),
        day_part: editDayPart,
        duration_minutes: edit.duration,
        notes: edit.notes,
        ...(type === 'cardio' || type === 'life' ? { cardio_mode: edit.cardio as Workout['cardio_mode'], distance_km: edit.distance } : {}),
        ...(type === 'interval' ? { cardio_mode: edit.cardio as Workout['cardio_mode'], distance_km: edit.distance, interval_work_seconds: edit.work, interval_rest_seconds: edit.rest, interval_rounds: edit.rounds } : {}),
        ...(type === 'recovery' ? { recovery_activity: edit.recovery as Workout['recovery_activity'] } : {}),
        ...(type === 'sport' ? { sport_activity: edit.sport as Workout['sport_activity'] } : {})
      });
      workout = { ...workout, ...updated, expand: workout.expand };
      editing = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not save changes.';
    } finally {
      saving = false;
    }
  };

  const removeWorkout = async () => {
    if (!workout) return;
    if (workout.plan) {
      error = 'Manage this workout from its program.';
      return;
    }
    if (!confirm('Are you sure you want to delete this workout?')) return;
    try {
      await deleteWorkout(workout.id);
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Workout could not be deleted.';
    }
  };

  const removeSeries = async () => {
    if (!workout?.series_id) return;
    if (workout.plan) {
      error = 'Manage this series from its program.';
      return;
    }
    if (!confirm('Delete all remaining planned workouts in this series?')) return;
    try {
      await deleteFutureSeries(workout.series_id);
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Series could not be deleted.';
    }
  };

  const doneSets = (exercise: ExerciseLog) => exercise.sets.filter((set) => set.completed).length;
  const isDone = (exercise: ExerciseLog) => exercise.sets.length > 0 && doneSets(exercise) === exercise.sets.length;
  $: finishedCount = exerciseLogs.filter(isDone).length;


  const startWorkout = () => changeStatus('in_progress');
  const finishWorkout = async () => {
    if (!workout || statusSaving) return;
    if (requiresDistanceAndTime(workout)) {
      error = '';
      showDistanceCompletion = true;
      return;
    }
    if (exerciseLogs.some((exercise) => !isDone(exercise)) && !confirm('Not all exercises are complete. Finish anyway?')) return;
    await persistStatus('completed');
  };

  const changeStatus = async (status: Workout['status']) => {
    if (!workout || statusSaving) return;
    if (status === 'completed' && workout.status !== 'completed' && requiresDistanceAndTime(workout)) {
      selectedStatus = workout.status;
      await finishWorkout();
      return;
    }
    if (await persistStatus(status)) showDistanceCompletion = false;
    else selectedStatus = workout.status;
  };

  const finishDistanceWorkout = async () => {
    if (!workout || statusSaving) return;
    try {
      const results = distanceCompletionData(actualDistance, actualTime);
      if (await persistStatus('completed', results)) showDistanceCompletion = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Check the distance and time.';
    }
  };

  const selectStatus = (event: Event) => {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) return;
    const option = WORKOUT_STATUS_OPTIONS.find(({ value }) => value === target.value);
    if (option) void changeStatus(option.value);
  };
</script>

<svelte:head><title>{workout?.title ?? 'Workout'} · T.O.P. Trainer</title></svelte:head>

{#if loading && !workout}
  <div class="card animate-pulse">Loading workout...</div>
{:else if !workout}
  <div class="card space-y-3">
    <h2 class="text-xl font-bold">Workout unavailable</h2>
    <p class="text-gray-600 dark:text-gray-300">{error || 'This workout does not exist or you do not have access.'}</p>
    <a class="btn-secondary" href="/">Back to timeline</a>
  </div>
{:else}
<div class="space-y-5">
  <a href="/" class="inline-flex min-h-12 items-center gap-2 font-semibold text-gray-600 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300"><ArrowLeft size={18} /> Back to timeline</a>
  <article class="card {WORKOUT_STATUS_CARD_STYLES[workout.status]}">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex flex-wrap gap-2">
          <span class="badge {WORKOUT_TYPE_STYLES[workout.type].badge}">{WORKOUT_TYPE_LABELS[workout.type]}</span>
          <span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{WORKOUT_STATUS_LABELS[workout.status]}</span>
          {#if workout.type === 'strength'}<span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{workout.series_id || workout.plan ? 'Program' : 'Standalone session'}</span>{/if}
          {#if workout.strava_id}<a class="badge bg-orange-600 text-white" href={`https://www.strava.com/activities/${workout.strava_id}`} target="_blank" rel="noopener noreferrer">Strava</a>{/if}
        </div>
        <h2 class="mt-3 text-3xl font-black">{workout.title}</h2>
        <p class="mt-2 capitalize text-gray-600 dark:text-gray-300">{workoutDate}{workout.day_part ? ` · ${DAY_PART_LABELS[workout.day_part]}` : ''}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-secondary" type="button" on:click={() => (editing ? (editing = false) : openEdit())}><Pencil size={17} /> {editing ? 'Cancel' : 'Edit'}</button>
        {#if !workout.plan}<button class="btn-danger" on:click={removeWorkout}><Trash2 size={17} /> Delete</button>{/if}
      </div>
    </div>
    {#if editing}
      <form class="mt-5 grid gap-4 rounded-xl border border-gray-200 p-4 dark:border-gray-700 sm:grid-cols-2" on:submit|preventDefault={saveEdit}>
        <div><label class="label" for="edit-title">Title</label><input id="edit-title" class="input" bind:value={edit.title} maxlength="120" required /></div>
        <div><label class="label" for="edit-when">Date and time</label><input id="edit-when" class="input" type="datetime-local" bind:value={edit.when} required /></div>
        <div>
          <label class="label" for="edit-day-part">Day part</label>
          <CycleChoice id="edit-day-part" label="Day part" bind:value={editDayPart}
            options={[{ value: '', label: 'No day part' }, ...DAY_PART_OPTIONS]} />
        </div>
        <div><label class="label" for="edit-duration">Duration (minutes)</label><input id="edit-duration" class="input" type="number" min="0" step="any" bind:value={edit.duration} /></div>
        {#if workout.type === 'cardio' || workout.type === 'interval' || workout.type === 'life'}
          <div>
            <label class="label" for="edit-cardio">Activity</label>
            <CycleChoice id="edit-cardio" label="Activity" options={workout.type === 'life' ? LIFE_ACTIVITY_OPTIONS : CARDIO_MODE_OPTIONS} bind:value={edit.cardio} />
          </div>
        {/if}
        {#if workout.type === 'cardio' || workout.type === 'interval' || workout.type === 'life'}
          <div><label class="label" for="edit-distance">Distance (km)</label><input id="edit-distance" class="input" type="number" min="0" step="any" bind:value={edit.distance} /></div>
        {/if}
        {#if workout.type === 'interval'}
          <div><label class="label" for="edit-work">Work (sec)</label><input id="edit-work" class="input" type="number" min="0" bind:value={edit.work} /></div>
          <div><label class="label" for="edit-rest">Rest (sec)</label><input id="edit-rest" class="input" type="number" min="0" bind:value={edit.rest} /></div>
          <div><label class="label" for="edit-rounds">Rounds</label><input id="edit-rounds" class="input" type="number" min="1" bind:value={edit.rounds} /></div>
        {/if}
        {#if workout.type === 'recovery'}
          <div>
            <label class="label" for="edit-recovery">Activity</label>
            <CycleChoice id="edit-recovery" label="Activity" options={RECOVERY_ACTIVITY_OPTIONS} bind:value={edit.recovery} />
          </div>
        {/if}
        {#if workout.type === 'sport'}
          <div>
            <label class="label" for="edit-sport">Sport</label>
            <CycleChoice id="edit-sport" label="Sport" options={SPORT_ACTIVITY_OPTIONS} bind:value={edit.sport} />
          </div>
        {/if}
        <div class="sm:col-span-2"><label class="label" for="edit-notes">Notes</label><textarea id="edit-notes" class="input" rows="3" bind:value={edit.notes}></textarea></div>
        <button class="btn-primary sm:col-span-2" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      </form>
    {/if}
    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      {#if workout.duration_minutes}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Duration</span><p class="font-bold">{requiresDistanceAndTime(workout) ? formatWorkoutTime(workout.duration_minutes) : `${workout.duration_minutes} minutes`}</p></div>{/if}
      {#if requiresDistanceAndTime(workout) && workout.distance_km}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Distance</span><p class="font-bold">{workout.distance_km} km</p></div>{/if}
      {#if requiresDistanceAndTime(workout) && workout.cardio_mode !== 'cycling' && workout.distance_km && workout.duration_minutes}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Average pace</span><p class="font-bold">{formatPace(workout.distance_km, workout.duration_minutes)}</p></div>{/if}
      {#if workout.type === 'cardio' || workout.type === 'life'}
        {#if workout.cardio_mode}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Activity</span><p class="font-bold">{CARDIO_MODE_LABELS[workout.cardio_mode]}</p></div>{/if}
        {#if workout.elevation_gain_m}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Elevation gain</span><p class="font-bold">{workout.elevation_gain_m} m</p></div>{/if}
        {#if workout.average_heart_rate}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Average heart rate</span><p class="font-bold">{workout.average_heart_rate} bpm</p></div>{/if}
      {:else if workout.type === 'interval'}
        {#if workout.cardio_mode}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Activity</span><p class="font-bold">{CARDIO_MODE_LABELS[workout.cardio_mode]}</p></div>{/if}
        <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Intervals</span><p class="font-bold">{workout.interval_rounds} rounds · {workout.interval_work_seconds}s work / {workout.interval_rest_seconds}s rest</p></div>
      {:else if workout.type === 'recovery' && workout.recovery_activity}
        <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Activity</span><p class="font-bold">{RECOVERY_ACTIVITY_LABELS[workout.recovery_activity]}</p></div>
      {:else if workout.type === 'sport' && workout.sport_activity}
        <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Sport</span><p class="font-bold">{SPORT_ACTIVITY_LABELS[workout.sport_activity]}</p></div>
      {/if}
      {#if workout.perceived_effort}<div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><span class="text-sm text-gray-500 dark:text-gray-400">Perceived effort</span><p class="font-bold">{workout.perceived_effort} / 10</p></div>{/if}
    </div>
    {#if workout.notes}<div class="mt-4 rounded-xl bg-gray-50 p-4 dark:bg-gray-800"><p class="text-sm font-semibold text-gray-500 dark:text-gray-400">Notes</p><p class="mt-1 whitespace-pre-wrap">{workout.notes}</p></div>{/if}
    <div class="mt-5">
      <label class="label" for="workout-status">Status</label>
      <div class="flex flex-wrap items-center gap-2">
        <div class="w-full sm:w-64">
          <select id="workout-status" class="input" bind:value={selectedStatus} disabled={statusSaving} on:change={selectStatus}>
            {#each WORKOUT_STATUS_OPTIONS as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </div>
      </div>
    </div>
    {#if workout.plan}
      <a class="btn-secondary mt-4" href="/programs">Manage program</a>
    {:else if workout.series_id}
      <button class="btn-secondary mt-4" type="button" on:click={removeSeries}>Delete planned series</button>
    {/if}
  </article>

  {#if workout.type === 'strength'}
    <section class="space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.17em] text-overload-signal">Exercises</p>
          <h3 class="mt-1 text-2xl font-black">{finishedCount} of {exerciseLogs.length} completed</h3>
        </div>
        <button type="button" class="btn-secondary" aria-label="Add exercise" on:click={openAdd}><Plus size={18} /> Add exercise</button>
      </div>
      {#if showAdd}
        <form class="card space-y-4" on:submit|preventDefault={addExerciseToWorkout}>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            {workout.series_id ? 'This exercise applies only to this session; the rest of the planned program will remain unchanged.' : 'Add an extra exercise to this workout.'}
          </p>
          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="add-muscle">Muscle group</label>
              <CycleChoice id="add-muscle" label="Muscle group" value={addMuscle}
                options={[{ value: '', label: 'All' }, ...MUSCLE_GROUP_OPTIONS]}
                onChange={(value) => { addMuscle = value; addExerciseId = ''; addEquipment = ''; }} />
            </div>
            <div>
              <label class="label" for="add-exercise">Exercise</label>
              <select id="add-exercise" class="input" bind:value={addExerciseId} on:change={pickExercise} required>
                <option value="">Choose...</option>
                {#each addOptions as option}<option value={option.id}>{option.name}</option>{/each}
              </select>
            </div>
            <div>
              <label class="label" for="add-equipment">Equipment</label>
              <CycleChoice id="add-equipment" label="Equipment" bind:value={addEquipment} placeholder="Choose an exercise first"
                options={equipmentOptions.map((value) => ({ value, label: EXERCISE_EQUIPMENT_LABELS[value] }))} />
            </div>
            <div><label class="label" for="add-sets">Sets</label><input id="add-sets" class="input" type="number" min="1" bind:value={addSets} /></div>
            <div><label class="label" for="add-min">Min reps</label><input id="add-min" class="input" type="number" min="1" bind:value={addRepsMin} /></div>
            <div><label class="label" for="add-max">Max reps</label><input id="add-max" class="input" type="number" min="1" bind:value={addRepsMax} /></div>
            <div><label class="label" for="add-weight">Starting weight (kg)</label><input id="add-weight" class="input" type="number" min="0" step="0.5" bind:value={addWeight} /></div>
            <div><label class="label" for="add-inc">Weight increment (kg)</label><input id="add-inc" class="input" type="number" min="0" step="0.5" bind:value={addIncrement} /></div>
          </div>
          <button class="btn-primary w-full" type="submit" disabled={adding}>{adding ? 'Adding...' : 'Add to workout'}</button>
        </form>
      {/if}
      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      {#if loading}
        <div class="card animate-pulse">Loading exercises...</div>
      {:else if exerciseLogs.length === 0}
        <div class="card text-gray-600 dark:text-gray-300">No exercises have been added to this workout yet.</div>
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
                    Rest {exercise.record.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS}s · tempo {exercise.record.tempo ?? DEFAULT_STRENGTH_TEMPO}
                  </span>
                  <span class="block text-sm font-semibold text-primary-700 dark:text-primary-300">
                    T.O.P. index {String(topProtocol.index).padStart(2, '0')} · {topProtocol.name} · recovery after workout: {topProtocol.recovery}
                  </span>
                </span>
                <ChevronRight size={22} class="shrink-0 text-gray-500" />
              </a>
            </li>
          {/each}
        </ul>
        {#if workout.status === 'planned'}
          <button class="btn-primary w-full" disabled={statusSaving} on:click={startWorkout}><Play size={18} /> Start workout</button>
        {:else if workout.status === 'in_progress'}
          <button class="btn-primary w-full" disabled={statusSaving} on:click={finishWorkout}><Check size={18} /> Finish workout</button>
        {/if}
      {/if}
    </section>
  {:else if workout.status === 'planned'}
    <button class="btn-primary w-full" disabled={statusSaving} on:click={startWorkout}><Play size={18} /> Start workout</button>
  {:else if workout.status === 'in_progress' && !showDistanceCompletion}
    <button class="btn-primary w-full" disabled={statusSaving} on:click={finishWorkout}><Check size={18} /> Finish workout</button>
  {/if}
  {#if showDistanceCompletion}
    <form class="card space-y-4" aria-labelledby="distance-completion-title" on:submit|preventDefault={finishDistanceWorkout}>
      <h3 id="distance-completion-title" class="text-xl font-bold">Finish workout</h3>
      <p class="text-sm text-gray-600 dark:text-gray-300">Enter the distance and time you actually completed.</p>
      <div>
        <label class="label" for="actual-distance">Actual distance (km)</label>
        <input id="actual-distance" class="input" type="number" min="0" step="any" bind:value={actualDistance} disabled={statusSaving} required />
      </div>
      <div>
        <label class="label" for="actual-time">Time (hh:mm:ss)</label>
        <input id="actual-time" class="input" type="text" placeholder="00:32:15" pattern="[0-9]+:[0-5][0-9]:[0-5][0-9]" bind:value={actualTime} disabled={statusSaving} required />
      </div>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" type="submit" disabled={statusSaving}>{statusSaving ? 'Saving...' : 'Save and finish'}</button>
        <button class="btn-secondary" type="button" disabled={statusSaving} on:click={() => { showDistanceCompletion = false; error = ''; }}>Cancel</button>
      </div>
    </form>
  {/if}
  {#if error && workout.type !== 'strength'}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
</div>
{/if}
