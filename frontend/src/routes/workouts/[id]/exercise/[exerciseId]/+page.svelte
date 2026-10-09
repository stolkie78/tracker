<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ArrowLeft, Check, Plus, Trash2 } from '@lucide/svelte';
  import {
    createWorkoutSet,
    deleteWorkoutSet,
    getSetsForWorkoutExercise,
    getWorkout,
    getWorkoutExercise,
    getWorkoutExercises,
    updateWorkout,
    updateWorkoutSet
  } from '$lib/pocketbase';
  import {
    DEFAULT_STRENGTH_REST_SECONDS,
    DEFAULT_STRENGTH_TEMPO,
    EXERCISE_EQUIPMENT_LABELS,
    nextSuggestedWeight,
    type Workout,
    type WorkoutExercise,
    type WorkoutSet
  } from '$lib/types';

  let workout: Workout | null = null;
  let record: WorkoutExercise | null = null;
  let sets: WorkoutSet[] = [];
  let siblings: WorkoutExercise[] = [];
  let loading = true;
  let saving = false;
  let error = '';

  $: index = record ? siblings.findIndex((item) => item.id === record?.id) : -1;
  $: next = index >= 0 ? siblings[index + 1] : undefined;
  $: allDone = sets.length > 0 && sets.every((set) => set.completed);
  $: suggestion =
    record && allDone && sets.every((set) => Number(set.reps) >= record!.reps_max)
      ? nextSuggestedWeight(record.reps_max, sets, Math.min(...sets.map((set) => Number(set.weight) || 0)), record.weight_increment)
      : null;

  onMount(async () => {
    try {
      const { id, exerciseId } = $page.params;
      if (!id || !exerciseId) throw new Error('Oefening ontbreekt.');
      [workout, record, sets, siblings] = await Promise.all([
        getWorkout(id),
        getWorkoutExercise(exerciseId),
        getSetsForWorkoutExercise(exerciseId),
        getWorkoutExercises(id)
      ]);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Oefening kon niet worden geladen.';
    } finally {
      loading = false;
    }
  });

  const completeSet = (set: WorkoutSet) => {
    if (!set.completed && record && !Number(set.reps)) set.reps = record.reps_max;
    set.completed = !set.completed;
    sets = sets;
  };

  const addSet = async () => {
    if (!record) return;
    error = '';
    try {
      const last = sets[sets.length - 1];
      const created = await createWorkoutSet({
        owner: record.owner,
        workout_exercise: record.id,
        set_order: sets.length + 1,
        reps: 0,
        weight: Number(last?.weight) || record.starting_weight || 0,
        completed: false
      });
      sets = [...sets, created];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Set kon niet worden toegevoegd.';
    }
  };

  const removeSet = async (set: WorkoutSet) => {
    if (sets.length <= 1) return;
    try {
      await deleteWorkoutSet(set.id);
      sets = sets.filter((item) => item.id !== set.id);
      await Promise.all(sets.map((item, order) => (item.set_order === order + 1 ? null : updateWorkoutSet(item.id, { set_order: order + 1 }))));
      sets = sets.map((item, order) => ({ ...item, set_order: order + 1 }));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Set kon niet worden verwijderd.';
    }
  };

  const save = async (goNext: boolean) => {
    if (!workout || !record) return;
    saving = true;
    error = '';
    try {
      await Promise.all(
        sets.map((set) =>
          updateWorkoutSet(set.id, { reps: Number(set.reps) || 0, weight: Number(set.weight) || 0, completed: set.completed })
        )
      );
      if (workout.status === 'planned') {
        await updateWorkout(workout.id, { status: 'in_progress', performed_at: new Date().toISOString() });
      }
      await goto(goNext && next ? `/workouts/${workout.id}/exercise/${next.id}` : `/workouts/${workout.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Sets konden niet worden opgeslagen.';
    } finally {
      saving = false;
    }
  };

  $: weightStep = Number(record?.weight_increment) > 0 && Number(record?.weight_increment) <= 5 ? Number(record?.weight_increment) : 2.5;

  const adjust = (set: WorkoutSet, key: 'reps' | 'weight', delta: number) => {
    const current = Number((set as Record<string, any>)[key]) || 0;
    (set as Record<string, any>)[key] = Math.max(0, Math.round((current + delta) * 100) / 100);
    sets = sets;
  };
</script>

<svelte:head><title>{record?.expand?.exercise?.name ?? 'Oefening'} · T.O.P. Trainer</title></svelte:head>

{#if loading}
  <div class="card animate-pulse">Oefening laden...</div>
{:else if !record || !workout}
  <div class="card space-y-3">
    <p class="text-gray-600 dark:text-gray-300">{error || 'Oefening niet gevonden.'}</p>
    <a class="btn-secondary" href="/">Terug naar tijdlijn</a>
  </div>
{:else}
  <div class="space-y-5">
    <a href={`/workouts/${workout.id}`} class="inline-flex min-h-12 items-center gap-2 font-semibold text-gray-600 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300"><ArrowLeft size={18} /> {workout.title}</a>
    <div>
      <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Oefening {index + 1} van {siblings.length}</p>
      <h2 class="mt-1 text-3xl font-black">{record.expand?.exercise?.name}</h2>
      <p class="mt-1 text-gray-600 dark:text-gray-300">
        {#if record.equipment}{EXERCISE_EQUIPMENT_LABELS[record.equipment]} · {/if}{record.target_sets} sets · {record.reps_min}-{record.reps_max} reps
      </p>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">
        Rust tussen sets: {record.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS} sec · tempo: {record.tempo ?? DEFAULT_STRENGTH_TEMPO}
      </p>
    </div>

    <section class="card space-y-3">
      {#each sets as set, setIndex (set.id)}
        <div class="space-y-3 rounded-xl border p-3 {set.completed ? 'border-emerald-500 bg-emerald-500/10' : 'border-gray-200 dark:border-gray-700'}">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold text-gray-700 dark:text-gray-200">Set {setIndex + 1}</span>
            <button type="button" class="touch-target flex items-center justify-center rounded-xl text-red-600 disabled:opacity-30" aria-label="Set verwijderen" disabled={sets.length <= 1} on:click={() => removeSet(set)}><Trash2 size={20} /></button>
          </div>
          {#each [{ key: 'reps' as 'reps' | 'weight', label: 'Reps', step: 1, big: 5, decimal: false }, { key: 'weight' as 'reps' | 'weight', label: 'Kg', step: weightStep, big: weightStep * 4, decimal: true }] as field}
            <div>
              <label class="label" for={`${field.key}-${set.id}`}>{field.label}</label>
              <div class="grid grid-cols-[auto_auto_1fr_auto_auto] items-stretch gap-1.5">
                <button type="button" class="touch-target rounded-xl border border-gray-300 px-2 text-xs font-bold text-gray-800 active:scale-95 dark:border-gray-600 dark:text-gray-100" aria-label="{field.label} -{field.big}" on:click={() => adjust(set, field.key, -field.big)}>−{field.big}</button>
                <button type="button" class="touch-target rounded-xl bg-primary-600 text-2xl font-bold text-white active:scale-95" aria-label="{field.label} verlagen" on:click={() => adjust(set, field.key, -field.step)}>−</button>
                <input id={`${field.key}-${set.id}`} class="input min-w-0 text-center text-xl font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" type="number" min="0" step={field.decimal ? 'any' : 1} inputmode={field.decimal ? 'decimal' : 'numeric'} bind:value={set[field.key]} />
                <button type="button" class="touch-target rounded-xl bg-primary-600 text-2xl font-bold text-white active:scale-95" aria-label="{field.label} verhogen" on:click={() => adjust(set, field.key, field.step)}>+</button>
                <button type="button" class="touch-target rounded-xl border border-gray-300 px-2 text-xs font-bold text-gray-800 active:scale-95 dark:border-gray-600 dark:text-gray-100" aria-label="{field.label} +{field.big}" on:click={() => adjust(set, field.key, field.big)}>+{field.big}</button>
              </div>
            </div>
          {/each}
          <button type="button" class="touch-target flex w-full items-center justify-center gap-2 rounded-xl font-bold {set.completed ? 'bg-emerald-500 text-white' : 'border border-gray-300 text-gray-800 dark:border-gray-600 dark:text-gray-100'}" aria-label="Set afronden" aria-pressed={set.completed} on:click={() => completeSet(set)}>
            <Check size={22} strokeWidth={3} /> {set.completed ? 'Afgerond' : 'Set afronden'}
          </button>
        </div>
      {/each}
      <button type="button" class="btn-secondary w-full" on:click={addSet}><Plus size={18} /> Set toevoegen</button>
      <p class="text-sm text-gray-600 dark:text-gray-300">Houd bij elke herhaling het tempo {record.tempo ?? DEFAULT_STRENGTH_TEMPO} aan en rust {record.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS} seconden tussen de sets.</p>
      <p class="text-sm text-gray-600 dark:text-gray-300">Progressie: +{record.weight_increment} kg zodra alle sets {record.reps_max} reps halen.</p>
      {#if suggestion !== null}<p class="rounded-xl bg-emerald-500/15 p-3 font-semibold text-emerald-700 dark:text-emerald-300">Volgende keer: {suggestion} kg</p>{/if}
    </section>

    {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
    <div class="grid gap-3 sm:grid-cols-2">
      <button class="btn-secondary" disabled={saving} on:click={() => save(false)}>Opslaan en terug naar lijst</button>
      {#if next}<button class="btn-primary" disabled={saving} on:click={() => save(true)}>Opslaan en volgende oefening</button>{/if}
    </div>
  </div>
{/if}
