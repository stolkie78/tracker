<script lang="ts">
  import { onMount } from 'svelte';
  import { getWorkouts } from '$lib/pocketbase';
  import { computeStats, type PeriodKey } from '$lib/stats';
  import { CARDIO_MODE_LABELS, formatPace, WORKOUT_TYPE_LABELS, WORKOUT_TYPE_STYLES, type CardioMode, type Workout, type WorkoutType } from '$lib/types';
  import StatsPeriodPicker from '$lib/components/StatsPeriodPicker.svelte';

  let workouts: Workout[] = [];
  let loading = true;
  let error = '';
  let period: PeriodKey = '12w';
  const activityModes = ['walking', 'hiking', 'cycling'] as const;

  $: stats = computeStats(workouts, period);
  $: hours = Math.floor(stats.totalMinutes / 60);
  $: minutes = stats.totalMinutes % 60;

  onMount(async () => {
    try {
      workouts = await getWorkouts('status = "completed"');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Training insights could not be loaded.';
    } finally {
      loading = false;
    }
  });

  const dateLabel = (value: string) => new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' }).format(new Date(value));
</script>

<svelte:head><title>Training · Insights · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Insights</p>
    <h2 class="mt-1 text-3xl font-black">Training</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Training statistics are based on completed workouts.</p>
  </div>

  <StatsPeriodPicker bind:value={period} />

  {#if loading}
    <div class="card animate-pulse">Loading training insights...</div>
  {:else if error}
    <p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
  {:else if stats.total === 0}
    <div class="card text-gray-600 dark:text-gray-300">No completed workouts in this period yet.</div>
  {:else}
    <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div class="card"><p class="label">Workouts</p><p class="text-3xl font-black">{stats.total}</p><p class="text-sm text-gray-600 dark:text-gray-300">{stats.perWeek} per week</p></div>
      <div class="card"><p class="label">Workout time</p><p class="text-3xl font-black">{hours}h {minutes}m</p></div>
      <div class="card"><p class="label">Distance run</p><p class="text-3xl font-black">{stats.runningKm} km</p><p class="text-sm text-gray-600 dark:text-gray-300">longest: {stats.longestRunKm} km</p></div>
      <div class="card"><p class="label">Total cardio</p><p class="text-3xl font-black">{stats.cardioKmTotal} km</p></div>
    </section>

    {#if stats.run.runs > 0}
      <section class="card space-y-3">
        <h3 class="text-xl font-bold">Running</h3>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Runs</p><p class="text-2xl font-black">{stats.run.runs}</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Distance</p><p class="text-2xl font-black">{stats.run.km} km</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Average pace</p><p class="text-2xl font-black">{formatPace(stats.run.km, stats.run.minutes) || '-'}</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Fastest pace</p><p class="text-2xl font-black">{formatPace(1, stats.run.fastestPaceMinPerKm) || '-'}</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Elevation gain</p><p class="text-2xl font-black">{stats.run.elevation} m</p></div>
          <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Average heart rate</p><p class="text-2xl font-black">{stats.run.averageHeartRate ? `${stats.run.averageHeartRate} bpm` : '-'}</p></div>
        </div>
        <ul class="divide-y divide-gray-200 text-sm dark:divide-gray-700">
          {#each stats.run.recent as run}
            <li><a class="flex items-center justify-between gap-3 py-2" href={`/workouts/${run.id}`}><span>{dateLabel(run.performed_at)} · {run.title}</span><span class="shrink-0 font-bold">{run.distance_km} km · {formatPace(Number(run.distance_km), Number(run.duration_minutes)) || '-'}</span></a></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#each activityModes as mode}
      {@const activity = stats.activities[mode]}
      <section class="card space-y-3">
        <h3 class="text-xl font-bold">{CARDIO_MODE_LABELS[mode]} <span class="text-sm font-normal text-gray-500 dark:text-gray-400">{mode === 'cycling' ? 'Cardio' : 'Life'}</span></h3>
        {#if activity.sessions === 0}
          <p class="text-sm text-gray-600 dark:text-gray-300">No completed {CARDIO_MODE_LABELS[mode].toLowerCase()} sessions in this period yet.</p>
        {:else}
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Sessions</p><p class="text-2xl font-black">{activity.sessions}</p></div>
            <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Distance</p><p class="text-2xl font-black">{activity.km} km</p></div>
            <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Time</p><p class="text-2xl font-black">{Math.floor(Math.round(activity.minutes) / 60)}h {Math.round(activity.minutes) % 60}m</p></div>
            <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
              <p class="text-xs font-semibold text-gray-600 dark:text-gray-300">{mode === 'cycling' ? 'Average speed' : 'Average pace'}</p>
              <p class="text-2xl font-black">{mode === 'cycling' ? activity.paceMinPerKm > 0 ? `${(60 / activity.paceMinPerKm).toFixed(1)} km/h` : '-' : formatPace(1, activity.paceMinPerKm) || '-'}</p>
            </div>
            <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Longest distance</p><p class="text-2xl font-black">{activity.longestKm} km</p></div>
            <div class="rounded-xl bg-gray-100 p-3 dark:bg-gray-800"><p class="text-xs font-semibold text-gray-600 dark:text-gray-300">Elevation gain</p><p class="text-2xl font-black">{activity.elevation} m</p></div>
          </div>
          <ul class="divide-y divide-gray-200 text-sm dark:divide-gray-700">
            {#each activity.recent as session}
              <li><a class="flex items-center justify-between gap-3 py-2" href={`/workouts/${session.id}`}><span>{dateLabel(session.performed_at)} · {session.title}</span><span class="shrink-0 font-bold">{session.distance_km ?? 0} km</span></a></li>
            {/each}
          </ul>
        {/if}
      </section>
    {/each}

    <section class="card space-y-3">
      <h3 class="text-xl font-bold">Workouts by type</h3>
      {#each Object.entries(stats.byType) as [type, count]}
        {#if count > 0}
          <div class="flex items-center gap-3">
            <span class="badge w-20 justify-center {WORKOUT_TYPE_STYLES[type as WorkoutType].badge}">{WORKOUT_TYPE_LABELS[type as WorkoutType]}</span>
            <div class="h-3 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div class="h-full rounded-full {WORKOUT_TYPE_STYLES[type as WorkoutType].badge}" style="width: {(count / stats.total) * 100}%"></div></div>
            <span class="w-8 text-right font-bold">{count}</span>
          </div>
        {/if}
      {/each}
      {#if Object.keys(stats.cardioKm).length}
        <p class="pt-2 text-sm text-gray-600 dark:text-gray-300">
          Distance: {#each Object.entries(stats.cardioKm) as [mode, km], i}{i ? ' · ' : ''}{CARDIO_MODE_LABELS[mode as CardioMode]} {Math.round((km ?? 0) * 10) / 10} km{/each}
        </p>
      {/if}
    </section>
  {/if}
</div>
