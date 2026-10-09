<script lang="ts">
  import { CalendarDays, Dumbbell, Filter, Footprints, HeartPulse, Plus, Timer } from '@lucide/svelte';
  const TYPE_ICONS = { strength: Dumbbell, cardio: Footprints, interval: Timer, recovery: HeartPulse };
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getWorkouts } from '$lib/pocketbase';
  import { activeWorkoutType, contextFilter } from '$lib/stores/context';
  import {
    CARDIO_MODE_LABELS,
    RECOVERY_ACTIVITY_LABELS,
    WORKOUT_STATUS_LABELS,
    WORKOUT_TYPE_LABELS,
  WORKOUT_TYPE_STYLES,
    WORKOUT_TYPE_OPTIONS,
    type Workout,
    type WorkoutType
  } from '$lib/types';

  let workouts: Workout[] = [];
  let loading = true;
  let error = '';
  let requestId = 0;

  const loadWorkouts = async (type: WorkoutType | '', planId = '') => {
    const currentRequest = ++requestId;
    loading = true;
    error = '';
    try {
      const filter = workoutFilter(type, planId);
      const records = await getWorkouts(filter);
      if (currentRequest === requestId) workouts = records;
    } catch (err) {
      if (currentRequest === requestId) error = err instanceof Error ? err.message : 'Trainingen konden niet worden geladen.';
    } finally {
      if (currentRequest === requestId) loading = false;
    }
  };

  $: selectedPlan = $page.url.searchParams.get('plan') ?? '';
  $: if (typeof window !== 'undefined') void loadWorkouts($activeWorkoutType, selectedPlan);

  const workoutFilter = (type: WorkoutType | '', planId: string) =>
    [contextFilter(type), planId ? `plan = "${planId}"` : ''].filter(Boolean).join(' && ');

  const groupedByDay = (records: Workout[]) => {
    const groups = new Map<string, Workout[]>();
    for (const workout of records) {
      const key = workout.performed_at.slice(0, 10);
      groups.set(key, [...(groups.get(key) ?? []), workout]);
    }
    return [...groups.entries()];
  };

  const formatDay = (date: string) =>
    new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${date}T12:00:00`));

  const formatDateTime = (date: string) =>
    new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' }).format(new Date(date));

  const isToday = (date: string) => {
    const workoutDay = new Date(date);
    const today = new Date();
    return workoutDay.getFullYear() === today.getFullYear()
      && workoutDay.getMonth() === today.getMonth()
      && workoutDay.getDate() === today.getDate();
  };

  const getUpcomingWorkout = (records: Workout[]) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return records
      .filter((workout) => workout.status === 'planned' && new Date(workout.performed_at) >= today)
      .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())[0] ?? null;
  };

  $: activeWorkout = workouts
    .filter((workout) => workout.status === 'in_progress')
    .sort((a, b) => new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime())[0] ?? null;
  $: upcomingWorkout = getUpcomingWorkout(workouts);

  const workoutSubtitle = (workout: Workout) => {
    const details: string[] = [];
    if (workout.type === 'strength') {
      const exercises = workout.expand?.workout_exercises_via_workout ?? [];
      if (exercises.length > 0) {
        const names = exercises
          .map((entry) => entry.expand?.exercise?.name)
          .filter((name): name is string => Boolean(name));
        details.push(names.length > 0 ? names.join(', ') : `${exercises.length} oefeningen`);
      }
    }
    if (workout.type === 'cardio') {
      if (workout.cardio_mode) details.push(CARDIO_MODE_LABELS[workout.cardio_mode]);
      if (workout.distance_km) details.push(`${workout.distance_km} km`);
    }
    if (workout.type === 'interval' && workout.interval_rounds) {
      details.push(`${workout.interval_rounds} rondes · ${workout.interval_work_seconds ?? 0}s werk / ${workout.interval_rest_seconds ?? 0}s rust`);
    }
    if (workout.type === 'recovery' && workout.recovery_activity) {
      details.push(RECOVERY_ACTIVITY_LABELS[workout.recovery_activity]);
    }
    if (workout.duration_minutes) details.push(`${workout.duration_minutes} min`);
    return details.join(' · ') || 'Geen extra details';
  };
</script>

<svelte:head>
  <title>Tijdlijn · T.O.P. Trainer</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Jouw beweging</p>
      <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Trainingslog</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">Een tijdlijn van je kracht-, cardio-, interval- en herstelsessies.</p>
    </div>
    <button class="btn-primary w-full sm:w-auto" on:click={() => goto('/workouts/new')}>
      <Plus size={19} /> Training toevoegen
    </button>
  </div>

  {#if !loading && !error && (activeWorkout || upcomingWorkout)}
    <div class="grid gap-4 sm:grid-cols-2">
      {#if activeWorkout}
        <section class="card border-2 border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950" aria-labelledby="active-workout-heading">
          <p class="text-sm font-bold uppercase tracking-[0.15em] text-emerald-800 dark:text-emerald-200" id="active-workout-heading">Training bezig</p>
          <h3 class="mt-1 text-xl font-black">{activeWorkout.title}</h3>
          <p class="mt-1 text-sm text-gray-700 dark:text-gray-200">{formatDay(activeWorkout.performed_at.slice(0, 10))} · {formatDateTime(activeWorkout.performed_at)}</p>
          <p class="mt-2 text-sm text-gray-700 dark:text-gray-200">{workoutSubtitle(activeWorkout)}</p>
          <a class="btn-primary mt-4 w-full" href={`/workouts/${activeWorkout.id}`}>Doorgaan met training →</a>
        </section>
      {/if}
      {#if upcomingWorkout}
        <section class="card border-2 border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-950" aria-labelledby="upcoming-workout-heading">
          <p class="text-sm font-bold uppercase tracking-[0.15em] text-primary-800 dark:text-primary-200" id="upcoming-workout-heading">
            {isToday(upcomingWorkout.performed_at) ? 'Training vandaag' : 'Volgende training'}
          </p>
          <h3 class="mt-1 text-xl font-black">{upcomingWorkout.title}</h3>
          <p class="mt-1 text-sm text-gray-700 dark:text-gray-200">{formatDay(upcomingWorkout.performed_at.slice(0, 10))}</p>
          <p class="mt-2 text-sm text-gray-700 dark:text-gray-200">{workoutSubtitle(upcomingWorkout)}</p>
          <a class="btn-secondary mt-4 w-full" href={`/workouts/${upcomingWorkout.id}`}>Training bekijken →</a>
        </section>
      {/if}
    </div>
  {/if}

  {#if selectedPlan}
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-semibold">Tijdlijn gefilterd op één trainingsplan.</p>
      <button class="btn-secondary" on:click={() => goto('/')}>Alle trainingen tonen</button>
    </div>
  {/if}

  <div class="card flex flex-wrap items-center gap-3">
    <Filter size={18} class="text-gray-500" />
    <label class="sr-only" for="type-filter">Filter op trainingstype</label>
    <select id="type-filter" class="input max-w-xs" bind:value={$activeWorkoutType}>
      <option value="">Alle trainingen</option>
      {#each WORKOUT_TYPE_OPTIONS as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
    <span class="ml-auto text-sm text-gray-500 dark:text-gray-400">{workouts.length} {workouts.length === 1 ? 'training' : 'trainingen'}</span>
  </div>

  {#if loading}
    <div class="card animate-pulse py-8 text-center text-gray-500">Je tijdlijn laden...</div>
  {:else if error}
    <div class="card border-red-300 text-red-700 dark:border-red-900 dark:text-red-300">
      <p class="font-bold">Laden mislukt</p>
      <p class="mt-1 text-sm">{error}</p>
      <button class="btn-secondary mt-4" on:click={() => loadWorkouts($activeWorkoutType)}>Opnieuw proberen</button>
    </div>
  {:else if workouts.length === 0}
    <div class="card flex flex-col items-center py-12 text-center">
      <div class="rounded-2xl bg-primary-600 p-4 text-white"><Dumbbell size={28} /></div>
      <h3 class="mt-4 text-xl font-bold">Je tijdlijn is nog leeg</h3>
      <p class="mt-2 max-w-md text-gray-600 dark:text-gray-300">Voeg je eerste training toe. Je kunt kracht, cardio, interval en herstel vastleggen.</p>
      <button class="btn-primary mt-6" on:click={() => goto('/workouts/new')}><Plus size={18} /> Eerste training toevoegen</button>
    </div>
  {:else}
    <div class="space-y-8">
      {#each groupedByDay(workouts) as [day, entries]}
        <section aria-label={formatDay(day)}>
          <div class="mb-3 flex items-center gap-2 text-sm font-bold capitalize text-gray-600 dark:text-gray-300">
            <CalendarDays size={17} />
            {formatDay(day)}
          </div>
          <div class="space-y-3 border-l-2 border-primary-200 pl-4 dark:border-primary-900">
            {#each entries as workout (workout.id)}
              <a
                class="card block border-2 transition hover:shadow-md {activeWorkout?.id === workout.id ? 'border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950' : isToday(workout.performed_at) ? 'border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950' : upcomingWorkout?.id === workout.id ? 'border-primary-400 bg-primary-50 dark:border-primary-700 dark:bg-primary-950' : 'border-transparent hover:border-primary-300 dark:hover:border-primary-800'}"
                href={`/workouts/${workout.id}`}>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="flex items-start gap-3">
                    <div class="mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl shadow-md {WORKOUT_TYPE_STYLES[workout.type].icon}">
                      <svelte:component this={TYPE_ICONS[workout.type]} size={24} strokeWidth={2.25} />
                    </div>
                    <div>
                      <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-lg font-bold">{workout.title}</h3>
                        {#if activeWorkout?.id === workout.id}
                          <span class="badge bg-emerald-600 text-white">Actief</span>
                        {:else if isToday(workout.performed_at)}
                          <span class="badge bg-amber-500 text-white">Vandaag</span>
                        {:else if upcomingWorkout?.id === workout.id}
                          <span class="badge bg-primary-600 text-white">Komend</span>
                        {/if}
                      </div>
                      <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{workoutSubtitle(workout)}</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="badge {WORKOUT_TYPE_STYLES[workout.type].badge}">{WORKOUT_TYPE_LABELS[workout.type]}</span>
                    <span class="badge border border-gray-300 bg-gray-100 text-gray-800 dark:border-gray-600 dark:bg-gray-700 dark:text-white">{WORKOUT_STATUS_LABELS[workout.status]}</span>
                  </div>
                </div>
                {#if workout.notes}
                  <p class="mt-4 line-clamp-2 text-sm text-gray-600 dark:text-gray-300">{workout.notes}</p>
                {/if}
                <div class="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <span>{workout.status === 'planned' ? 'Tijd niet ingepland' : formatDateTime(workout.performed_at)}</span>
                  <span>Details bekijken →</span>
                </div>
              </a>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}
</div>
