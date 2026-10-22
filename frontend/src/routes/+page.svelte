<script lang="ts">
  import { onMount } from 'svelte';
  import CycleChoice from '$lib/components/CycleChoice.svelte';
  import { CalendarDays, Dumbbell, Footprints, HeartPulse, Plus, Timer, Trophy } from '@lucide/svelte';
  const TYPE_ICONS = { strength: Dumbbell, cardio: Footprints, interval: Timer, recovery: HeartPulse, sport: Trophy };
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getTrainingPlans, getWorkouts } from '$lib/pocketbase';
  import { activeWorkoutType, contextFilter } from '$lib/stores/context';
  import { groupByDayPart } from '$lib/programs';
  import { formatWorkoutTime, requiresDistanceAndTime, workoutsInRange, type DateRangeFilter } from '$lib/workouts';
  import {
    CARDIO_MODE_LABELS,
    RECOVERY_ACTIVITY_LABELS,
    SPORT_ACTIVITY_LABELS,
    WORKOUT_STATUS_LABELS,
    WORKOUT_TYPE_LABELS,
    WORKOUT_TYPE_STYLES,
    WORKOUT_STATUS_CARD_STYLES,
    WORKOUT_TYPE_OPTIONS,
    type Workout,
    type WorkoutType
  } from '$lib/types';

  let workouts: Workout[] = [];
  let planTitles = new Map<string, string>();
  let loading = true;
  let error = '';
  let requestId = 0;
  let dateRangeFilter: DateRangeFilter = 'today';
  const DATE_RANGE_OPTIONS: { value: DateRangeFilter; label: string }[] = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This week' },
    { value: 'month', label: 'This month' },
    { value: 'planned', label: 'Planned' },
    { value: 'past', label: 'Past' }
  ];

  const loadWorkouts = async (type: WorkoutType | '', planId = '') => {
    const currentRequest = ++requestId;
    loading = true;
    error = '';
    try {
      const filter = workoutFilter(type, planId);
      const records = await getWorkouts(filter);
      if (currentRequest === requestId) workouts = records;
    } catch (err) {
      if (currentRequest === requestId) error = err instanceof Error ? err.message : 'Workouts could not be loaded.';
    } finally {
      if (currentRequest === requestId) loading = false;
    }
  };

  onMount(async () => {
    try {
      planTitles = new Map((await getTrainingPlans()).map((plan) => [plan.id, plan.title]));
    } catch {
      planTitles = new Map();
    }
  });

  $: selectedPlan = $page.url.searchParams.get('plan') ?? '';
  $: if (typeof window !== 'undefined') void loadWorkouts($activeWorkoutType, selectedPlan);

  const workoutFilter = (type: WorkoutType | '', planId: string) =>
    [contextFilter(type), planId ? `plan = "${planId}"` : ''].filter(Boolean).join(' && ');

  const dateOnly = (date: Date) => {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  };

  const workoutDay = (workout: Workout) => dateOnly(new Date(workout.performed_at));

  const sortWorkouts = (records: Workout[]) => {
    const today = dateOnly(new Date());
    const bucket = (workout: Workout) => {
      if (workout.status === 'in_progress') return 0;
      if (workout.status === 'planned' && workoutDay(workout) >= today) return 1;
      return 2;
    };
    return [...records].sort((a, b) => {
      const bucketDifference = bucket(a) - bucket(b);
      if (bucketDifference !== 0) return bucketDifference;
      const dateDifference = new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime();
      return bucket(a) === 2 ? -dateDifference : dateDifference;
    });
  };

  $: rangedWorkouts = workoutsInRange(workouts, dateRangeFilter);
  $: visibleWorkouts = dateRangeFilter === 'past'
    ? [...rangedWorkouts].sort((a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime())
    : sortWorkouts(rangedWorkouts);

  const groupedByDay = (records: Workout[]) => {
    const groups = new Map<string, Workout[]>();
    for (const workout of records) {
      const date = workoutDay(workout);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      groups.set(key, [...(groups.get(key) ?? []), workout]);
    }
    return [...groups.entries()];
  };

  const formatDay = (date: string) =>
    new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));

  const formatDateTime = (date: string) =>
    new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));

  const isToday = (date: string) => {
    const workoutDay = new Date(date);
    const today = new Date();
    return workoutDay.getFullYear() === today.getFullYear()
      && workoutDay.getMonth() === today.getMonth()
      && workoutDay.getDate() === today.getDate();
  };

  $: activeWorkout = visibleWorkouts
    .filter((workout) => workout.status === 'in_progress')
    .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())[0] ?? null;
  $: upcomingWorkout = visibleWorkouts.find((workout) => workout.status === 'planned') ?? null;

  const workoutSubtitle = (workout: Workout) => {
    const details: string[] = [];
    if (workout.type === 'strength') {
      const exercises = workout.expand?.workout_exercises_via_workout ?? [];
      if (exercises.length > 0) {
        const names = exercises
          .map((entry) => entry.expand?.exercise?.name)
          .filter((name): name is string => Boolean(name));
        details.push(names.length > 0 ? names.join(', ') : `${exercises.length} exercises`);
      }
    }
    if (workout.type === 'cardio' || requiresDistanceAndTime(workout)) {
      if (workout.cardio_mode) details.push(CARDIO_MODE_LABELS[workout.cardio_mode]);
      if (workout.distance_km) details.push(`${workout.distance_km} km`);
    }
    if (workout.type === 'interval' && workout.interval_rounds) {
      details.push(`${workout.interval_rounds} rounds · ${workout.interval_work_seconds ?? 0}s work / ${workout.interval_rest_seconds ?? 0}s rest`);
    }
    if (workout.type === 'recovery' && workout.recovery_activity) {
      details.push(RECOVERY_ACTIVITY_LABELS[workout.recovery_activity]);
    }
    if (workout.type === 'sport' && workout.sport_activity) {
      details.push(SPORT_ACTIVITY_LABELS[workout.sport_activity]);
    }
    if (workout.duration_minutes) details.push(requiresDistanceAndTime(workout) ? formatWorkoutTime(workout.duration_minutes) : `${workout.duration_minutes} min`);
    return details.join(' · ') || 'No additional details';
  };
</script>

<svelte:head>
  <title>Timeline · T.O.P. Trainer</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Your activity</p>
      <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Workout log</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">A timeline of your strength, cardio, interval, recovery, and sports sessions.</p>
    </div>
    <button class="btn-primary w-full sm:w-auto" on:click={() => goto('/library')}>
      <Plus size={19} /> Choose a workout
    </button>
  </div>

  {#if selectedPlan}
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-semibold">Timeline filtered by program: {planTitles.get(selectedPlan) ?? 'unknown'}.</p>
      <button class="btn-secondary" on:click={() => goto('/')}>Show all workouts</button>
    </div>
  {/if}

  <div class="card space-y-4 p-3 sm:p-5">
    <div>
      <p class="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">Date range</p>
      <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Date range">
      {#each DATE_RANGE_OPTIONS as option}
        <button
          type="button"
          class="touch-target w-full rounded-xl px-2 text-sm font-bold transition sm:w-auto sm:px-4 {dateRangeFilter === option.value ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}"
          aria-pressed={dateRangeFilter === option.value}
          on:click={() => (dateRangeFilter = option.value)}>{option.label}</button>
      {/each}
      </div>
    </div>
    <div class="flex flex-wrap items-end gap-2 sm:gap-3">
      <div class="min-w-0 flex-1">
        <label class="label mb-1" for="type-filter">Workout type</label>
        <CycleChoice id="type-filter" label="Workout type" bind:value={$activeWorkoutType}
          options={[{ value: '', label: 'All workouts' }, ...WORKOUT_TYPE_OPTIONS]} />
      </div>
      <span class="w-full text-right text-sm text-gray-500 dark:text-gray-400 sm:w-auto sm:pb-3">{visibleWorkouts.length} {visibleWorkouts.length === 1 ? 'workout' : 'workouts'}</span>
    </div>
  </div>

  {#if loading}
    <div class="card animate-pulse py-8 text-center text-gray-500">Loading your timeline...</div>
  {:else if error}
    <div class="card border-red-300 text-red-700 dark:border-red-900 dark:text-red-300">
      <p class="font-bold">Loading failed</p>
      <p class="mt-1 text-sm">{error}</p>
      <button class="btn-secondary mt-4" on:click={() => loadWorkouts($activeWorkoutType, selectedPlan)}>Try again</button>
    </div>
  {:else if visibleWorkouts.length === 0}
    <div class="card flex flex-col items-center py-12 text-center">
      <div class="rounded-2xl bg-primary-600 p-4 text-white"><Dumbbell size={28} /></div>
      <h3 class="mt-4 text-xl font-bold">{workouts.length === 0 ? 'Your timeline is empty' : 'No workouts in this period'}</h3>
      <p class="mt-2 max-w-md text-gray-600 dark:text-gray-300">Add a workout or choose a different date range.</p>
      <button class="btn-primary mt-6" on:click={() => goto('/library')}><Plus size={18} /> Go to Workouts</button>
    </div>
  {:else}
    <div class="space-y-8">
      {#each groupedByDay(visibleWorkouts) as [day, entries]}
        <section aria-label={formatDay(day)}>
          <div class="mb-3 flex items-center gap-2 text-sm font-bold capitalize text-gray-600 dark:text-gray-300">
            <CalendarDays size={17} />
            {formatDay(day)}
          </div>
          <div class="space-y-3 border-l-2 border-primary-200 pl-4 dark:border-primary-900">
            {#each groupByDayPart(entries) as group}
              <div class="space-y-3" role="group" aria-label={group.label}>
              <h3 class="pt-2 text-sm font-bold text-gray-600 dark:text-gray-300">{group.label}</h3>
            {#each group.workouts as workout (workout.id)}
              <a
                class="card block border-2 p-4 transition hover:shadow-md sm:p-5 {WORKOUT_STATUS_CARD_STYLES[workout.status] || (activeWorkout?.id === workout.id ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950' : isToday(workout.performed_at) ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950' : upcomingWorkout?.id === workout.id ? 'border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-950' : 'border-transparent hover:border-primary-300 dark:hover:border-primary-800')}"
                href={`/workouts/${workout.id}`}>
                <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="flex min-w-0 items-start gap-3">
                    <div class="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md sm:h-12 sm:w-12 {WORKOUT_TYPE_STYLES[workout.type].icon}">
                      <svelte:component this={TYPE_ICONS[workout.type]} size={22} strokeWidth={2.25} />
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-base font-bold sm:text-lg">{workout.title}</h3>
                        {#if activeWorkout?.id === workout.id}
                          <span class="badge bg-emerald-600 text-white">Active</span>
                        {:else if isToday(workout.performed_at)}
                          <span class="badge bg-amber-500 text-white">Today</span>
                        {:else if upcomingWorkout?.id === workout.id}
                          <span class="badge bg-primary-600 text-white">Next up</span>
                        {/if}
                      </div>
                      {#if workout.status === 'planned' && workout.due_date && dateOnly(new Date(workout.due_date)) >= dateOnly(new Date())}
                        <p class="mt-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Ready to start</p>
                      {/if}
                      {#if workout.plan}
                        <p class="mt-1 text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">▦ Program · {planTitles.get(workout.plan) ?? 'unknown'}</p>
                      {:else}
                        <p class="mt-1 text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">Standalone session</p>
                      {/if}
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{workoutSubtitle(workout)}</p>
                    </div>
                  </div>
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="badge {WORKOUT_TYPE_STYLES[workout.type].badge}">{WORKOUT_TYPE_LABELS[workout.type]}</span>
                    <span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{WORKOUT_STATUS_LABELS[workout.status]}</span>
                  </div>
                </div>
                {#if workout.notes}
                  <p class="mt-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{workout.notes}</p>
                {/if}
                <div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <span>{workout.status === 'planned' ? (workout.day_part ? group.label : 'Time not scheduled') : formatDateTime(workout.performed_at)}</span>
                  <span>View details →</span>
                </div>
              </a>
            {/each}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
