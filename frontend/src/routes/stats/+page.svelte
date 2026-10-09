<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowDown, ArrowUp, Minus } from '@lucide/svelte';
  import { getWorkouts } from '$lib/pocketbase';
  import { computeStats, PERIOD_OPTIONS, type ExerciseProgress, type PeriodKey } from '$lib/stats';
  import { CARDIO_MODE_LABELS, WORKOUT_TYPE_LABELS, WORKOUT_TYPE_STYLES, type CardioMode, type Workout, type WorkoutType } from '$lib/types';

  let workouts: Workout[] = [];
  let loading = true;
  let error = '';
  let period: PeriodKey = '12w';
  let selected = '';

  $: stats = computeStats(workouts, period);
  $: if (stats.exercises.length && !stats.exercises.some((exercise) => exercise.id === selected)) selected = stats.exercises[0].id;
  $: current = stats.exercises.find((exercise) => exercise.id === selected);
  $: hours = Math.floor(stats.totalMinutes / 60);
  $: minutes = stats.totalMinutes % 60;

  onMount(async () => {
    try {
      workouts = await getWorkouts('status = "completed"');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Statistieken konden niet worden geladen.';
    } finally {
      loading = false;
    }
  });

  const dateLabel = (value: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' }).format(new Date(value));
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

<svelte:head><title>Statistieken · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Voortgang</p>
    <h2 class="mt-1 text-3xl font-black">Statistieken</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Alleen voltooide trainingen tellen mee.</p>
  </div>

  <div class="flex flex-wrap gap-2" role="group" aria-label="Periode">
    {#each PERIOD_OPTIONS as option}
      <button type="button" class="touch-target rounded-xl px-4 text-sm font-bold transition {period === option.value ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}" aria-pressed={period === option.value} on:click={() => (period = option.value)}>{option.label}</button>
    {/each}
  </div>

  {#if loading}
    <div class="card animate-pulse">Statistieken laden...</div>
  {:else if error}
    <p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
  {:else if stats.total === 0}
    <div class="card text-gray-600 dark:text-gray-300">Nog geen voltooide trainingen in deze periode.</div>
  {:else}
    <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card"><p class="label">Trainingen</p><p class="text-3xl font-black">{stats.total}</p><p class="text-sm text-gray-600 dark:text-gray-300">{stats.perWeek} per week</p></div>
      <div class="card"><p class="label">Trainingstijd</p><p class="text-3xl font-black">{hours}u {minutes}m</p></div>
      <div class="card"><p class="label">Hardgelopen</p><p class="text-3xl font-black">{stats.runningKm} km</p><p class="text-sm text-gray-600 dark:text-gray-300">langste: {stats.longestRunKm} km</p></div>
      <div class="card"><p class="label">Cardio totaal</p><p class="text-3xl font-black">{stats.cardioKmTotal} km</p></div>
    </section>

    <section class="card space-y-3">
      <h3 class="text-xl font-bold">Trainingen per type</h3>
      {#each Object.entries(stats.byType) as [type, count]}
        <div class="flex items-center gap-3">
          <span class="badge w-20 justify-center {WORKOUT_TYPE_STYLES[type as WorkoutType].badge}">{WORKOUT_TYPE_LABELS[type as WorkoutType]}</span>
          <div class="h-3 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div class="h-full rounded-full {WORKOUT_TYPE_STYLES[type as WorkoutType].badge}" style="width: {(count / stats.total) * 100}%"></div></div>
          <span class="w-8 text-right font-bold">{count}</span>
        </div>
      {/each}
      {#if Object.keys(stats.cardioKm).length}
        <p class="pt-2 text-sm text-gray-600 dark:text-gray-300">
          Afstand: {#each Object.entries(stats.cardioKm) as [mode, km], i}{i ? ' · ' : ''}{CARDIO_MODE_LABELS[mode as CardioMode]} {Math.round((km ?? 0) * 10) / 10} km{/each}
        </p>
      {/if}
    </section>

    <section class="space-y-3">
      <h3 class="text-xl font-bold">Groei per oefening</h3>
      {#if stats.exercises.length === 0}
        <div class="card text-gray-600 dark:text-gray-300">Nog geen afgeronde sets in deze periode.</div>
      {:else}
        <ul class="space-y-2">
          {#each stats.exercises as exercise}
            <li>
              <button type="button" class="card flex w-full items-center gap-3 text-left transition {selected === exercise.id ? 'border-primary-500 ring-2 ring-primary-500/40' : 'hover:border-primary-300'}" on:click={() => (selected = exercise.id)}>
                <span class="min-w-0 flex-1">
                  <span class="block truncate font-bold">{exercise.name}</span>
                  <span class="text-sm text-gray-600 dark:text-gray-300">{exercise.sessions.length}× getraind · beste {exercise.bestWeight} kg</span>
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
            <h4 class="text-lg font-bold">{current.name}</h4>
            <div class="grid grid-cols-3 gap-3 text-center">
              <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Gewicht</p><p class="font-black {trendClass(current.weightChange)}">{sign(current.weightChange)} kg</p><p class="text-xs text-gray-600 dark:text-gray-300">{current.first.topWeight} → {current.last.topWeight}</p></div>
              <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Reps (topgewicht)</p><p class="font-black {trendClass(current.repsChange)}">{sign(current.repsChange)}</p><p class="text-xs text-gray-600 dark:text-gray-300">{current.first.repsAtTop} → {current.last.repsAtTop}</p></div>
              <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Geschat 1RM</p><p class="font-black">{current.last.estimated1RM} kg</p><p class="text-xs text-gray-600 dark:text-gray-300">was {current.first.estimated1RM}</p></div>
            </div>
            <svg viewBox="0 0 300 80" class="h-24 w-full" role="img" aria-label="Topgewicht per training">
              <polyline fill="none" stroke="#f97316" stroke-width="3" stroke-linejoin="round" points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
              {#each points as point}<circle cx={point.x} cy={point.y} r="4" fill="#f97316" />{/each}
            </svg>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-left text-gray-600 dark:text-gray-300"><th class="py-2">Datum</th><th>Topgewicht</th><th>Reps</th><th>Volume</th></tr></thead>
                <tbody>
                  {#each [...current.sessions].reverse() as session}
                    <tr class="border-t border-gray-200 dark:border-gray-700"><td class="py-2">{dateLabel(session.date)}</td><td>{session.topWeight} kg</td><td>{session.repsAtTop} (totaal {session.totalReps})</td><td>{Math.round(session.volume)} kg</td></tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </article>
        {/if}
      {/if}
    </section>
  {/if}
</div>
