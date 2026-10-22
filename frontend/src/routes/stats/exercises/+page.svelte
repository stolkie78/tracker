<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowDown, ArrowUp, Minus } from '@lucide/svelte';
  import { getWorkouts } from '$lib/pocketbase';
  import { computeStats, type ExerciseProgress, type PeriodKey } from '$lib/stats';
  import type { Workout } from '$lib/types';
  import StatsPeriodPicker from '$lib/components/StatsPeriodPicker.svelte';

  let workouts: Workout[] = [];
  let loading = true;
  let error = '';
  let period: PeriodKey = '12w';
  let selected = '';

  $: stats = computeStats(workouts, period);
  $: if (stats.exercises.length && !stats.exercises.some((exercise) => exercise.id === selected)) selected = stats.exercises[0].id;
  $: current = stats.exercises.find((exercise) => exercise.id === selected);

  onMount(async () => {
    try {
      workouts = await getWorkouts('status = "completed"');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Exercise trends could not be loaded.';
    } finally {
      loading = false;
    }
  });

  const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(value));
  const sign = (value: number) => (value > 0 ? `+${value}` : `${value}`);
  const trendClass = (value: number) => (value > 0 ? 'text-emerald-600 dark:text-emerald-400' : value < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300');

  const chart = (exercise: ExerciseProgress) => {
    const values = exercise.sessions.map((session) => session.topWeight);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values.map((value, index) => ({
      x: values.length === 1 ? 150 : (index / (values.length - 1)) * 300,
      y: 70 - ((value - min) / range) * 60
    }));
  };
  $: points = current ? chart(current) : [];
</script>

<svelte:head><title>Exercises · Insights · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Insights</p>
    <h2 class="mt-1 text-3xl font-black">Exercises</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Track your progress for each exercise based on completed strength workouts.</p>
  </div>

  <StatsPeriodPicker bind:value={period} />

  {#if loading}
    <div class="card animate-pulse">Loading exercise trends...</div>
  {:else if error}
    <p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
  {:else if stats.exercises.length === 0}
    <div class="card text-gray-600 dark:text-gray-300">No completed sets in this period yet.</div>
  {:else}
    <ul class="space-y-2">
      {#each stats.exercises as exercise}
        <li>
          <button type="button" class="card flex w-full items-center gap-3 text-left transition {selected === exercise.id ? 'border-primary-500 ring-2 ring-primary-500/40' : 'hover:border-primary-300'}" on:click={() => (selected = exercise.id)}>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-bold">{exercise.name}</span>
              <span class="text-sm text-gray-600 dark:text-gray-300">Trained {exercise.sessions.length}× · best {exercise.bestWeight} kg</span>
            </span>
            <span class="flex shrink-0 items-center gap-1 font-bold {trendClass(exercise.weightChange)}">
              {#if exercise.weightChange > 0}<ArrowUp size={18} />{:else if exercise.weightChange < 0}<ArrowDown size={18} />{:else}<Minus size={18} />{/if}
              {sign(exercise.weightChange)} kg
            </span>
          </button>
        </li>
      {/each}
    </ul>

    {#if current}
      <article class="card space-y-4">
        <h3 class="text-xl font-bold">{current.name}</h3>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Weight</p><p class="font-black {trendClass(current.weightChange)}">{sign(current.weightChange)} kg</p><p class="text-xs text-gray-600 dark:text-gray-300">{current.first.topWeight} → {current.last.topWeight}</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Reps (top weight)</p><p class="font-black {trendClass(current.repsChange)}">{sign(current.repsChange)}</p><p class="text-xs text-gray-600 dark:text-gray-300">{current.first.repsAtTop} → {current.last.repsAtTop}</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Estimated 1RM</p><p class="font-black">{current.last.estimated1RM} kg</p><p class="text-xs text-gray-600 dark:text-gray-300">was {current.first.estimated1RM}</p></div>
        </div>
        <svg viewBox="0 0 300 80" class="h-24 w-full" role="img" aria-label="Top weight per workout">
          <polyline fill="none" stroke="#f97316" stroke-width="3" stroke-linejoin="round" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
          {#each points as point}<circle cx={point.x} cy={point.y} r="4" fill="#f97316" />{/each}
        </svg>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-gray-600 dark:text-gray-300"><th class="py-2">Date</th><th>Top weight</th><th>Reps</th><th>Volume</th></tr></thead>
            <tbody>
              {#each [...current.sessions].reverse() as session}
                <tr class="border-t border-gray-200 dark:border-gray-700"><td class="py-2">{dateLabel(session.date)}</td><td>{session.topWeight} kg</td><td>{session.repsAtTop} (total {session.totalReps})</td><td>{Math.round(session.volume)} kg</td></tr>
              {/each}
            </tbody>
          </table>
        </div>
      </article>
    {/if}
  {/if}
</div>
