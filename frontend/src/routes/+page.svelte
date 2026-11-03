<script lang="ts">
  import ActivityProgress from '$lib/components/ActivityProgress.svelte';
  import CycleChoice from '$lib/components/CycleChoice.svelte';
  import { CalendarDays, ChevronRight, Dumbbell, Footprints, HeartPulse, Plus, Timer, Trophy } from '@lucide/svelte';
  const TYPE_ICONS = { strength: Dumbbell, cardio: Footprints, interval: Timer, recovery: HeartPulse, sport: Trophy, life: Footprints, wellness: HeartPulse };
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { getTrainingPlans, getWorkouts } from '$lib/pocketbase';
  import { activeWorkoutType, contextFilter } from '$lib/stores/context';
  import { activityView, activityViewHref, groupByDayPart, groupFreePeriods, groupPeriodCategories, groupPeriodWorkouts, localDate, type ActivityView } from '$lib/programs';
  import { formatWorkoutTime, requiresDistanceAndTime, openPastWorkouts, workoutsInRange, type DateRangeFilter } from '$lib/workouts';
  import {
    CARDIO_MODE_LABELS,
    RECOVERY_ACTIVITY_LABELS,
    SPORT_ACTIVITY_LABELS,
    WELLNESS_ACTIVITY_LABELS,
    WORKOUT_STATUS_LABELS,
    WORKOUT_TYPE_LABELS,
    WORKOUT_TYPE_STYLES,
    WORKOUT_STATUS_CARD_STYLES,
    WORKOUT_TYPE_OPTIONS,
    type Workout,
    type TrainingPlan,
    type WorkoutType
  } from '$lib/types';

  let workouts: Workout[] = [];
  let planTitles = new Map<string, string>();
  let plans: TrainingPlan[] = [];
  let loading = true;
  let error = '';
  let requestId = 0;
  let dateRangeFilter: DateRangeFilter = 'today';
  let openOnly = false;
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
      const [records, allPlans] = await Promise.all([getWorkouts(filter), getTrainingPlans()]);
      if (currentRequest === requestId) {
        workouts = records;
        plans = allPlans;
        planTitles = new Map(allPlans.map((plan) => [plan.id, plan.title]));
      }
    } catch (err) {
      if (currentRequest === requestId) error = err instanceof Error ? err.message : 'Workouts could not be loaded.';
    } finally {
      if (currentRequest === requestId) loading = false;
    }
  };

  $: selectedPlan = $page.url.searchParams.get('plan') ?? '';
  $: selectedView = activityView($page.url.searchParams, plans);
  const viewHref = (view: ActivityView, clearPlan = false) => activityViewHref($page.url.searchParams, view, clearPlan);
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

  $: openPastCount = openPastWorkouts(workouts).length;
  $: freePeriods = groupFreePeriods(plans, workouts, new Date(), Boolean(selectedPlan));
  const selectRange = (range: DateRangeFilter) => {
    dateRangeFilter = range;
    openOnly = false;
  };
  const showOpenPast = () => {
    dateRangeFilter = 'past';
    openOnly = true;
  };
  $: rangedWorkouts = openOnly ? openPastWorkouts(workouts) : workoutsInRange(workouts, dateRangeFilter);
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

  const formatPeriodDate = (date: string) =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${date.slice(0, 10)}T12:00:00`));

  const countLabel = (count: number, unit: 'day' | 'session') => `${count} ${unit}${count === 1 ? '' : 's'}`;

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
    if (workout.type === 'wellness' && workout.wellness_activity) {
      details.push(WELLNESS_ACTIVITY_LABELS[workout.wellness_activity]);
    }
    if (workout.duration_minutes) details.push(requiresDistanceAndTime(workout) ? formatWorkoutTime(workout.duration_minutes) : `${workout.duration_minutes} min`);
    return details.join(' · ') || 'No additional details';
  };
</script>

<svelte:head>
  <title>Activities · T.O.P. Trainer</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Your activity</p>
      <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Activities</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">Follow your schedule or pick up a free activity.</p>
    </div>
    <div class="flex w-full flex-wrap gap-2 sm:w-auto">
    <button class="btn-primary w-full sm:w-auto" on:click={() => goto('/library')}>
      <Plus size={19} /> Choose an activity
    </button>
    </div>
  </div>

  <ActivityProgress />

  <nav class="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-gray-900" aria-label="Activity views">
    <a class="rounded-xl px-4 py-3 text-center text-sm font-bold transition {selectedView === 'planned' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-800'}"
      href={viewHref('planned')} aria-current={selectedView === 'planned' ? 'page' : undefined}>Planned</a>
    <a class="rounded-xl px-4 py-3 text-center text-sm font-bold transition {selectedView === 'free' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-800'}"
      href={viewHref('free')} aria-current={selectedView === 'free' ? 'page' : undefined}>Free</a>
  </nav>

  {#if selectedView === 'planned' && (openPastCount > 0 || openOnly)}
    <div class="card flex flex-wrap items-center justify-between gap-3 border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950">
      <button type="button" class="text-left text-sm font-bold text-amber-900 underline dark:text-amber-200" on:click={showOpenPast}>
        Open activities in the past ({openPastCount}) →
      </button>
      {#if openOnly}
        <button type="button" class="btn-secondary" on:click={() => selectRange('past')}>Show all past</button>
      {/if}
    </div>
  {/if}

  {#if selectedPlan}
    <div class="card flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm font-semibold">Activities filtered by program: {planTitles.get(selectedPlan) ?? 'unknown'}.</p>
      <a class="btn-secondary" href={viewHref(selectedView, true)}>Show all activities</a>
    </div>
  {/if}

  <div class="card space-y-4 p-3 sm:p-5">
    <div class="flex flex-wrap items-end gap-2 sm:gap-3">
      <div class="min-w-0 flex-1">
        <label class="label mb-1" for="type-filter">Activity type</label>
          <CycleChoice id="type-filter" label="Activity type" bind:value={$activeWorkoutType}
            options={[{ value: '', label: 'All activities' }, ...WORKOUT_TYPE_OPTIONS]} />
      </div>
    </div>
  </div>

  {#if loading}
    <div class="card animate-pulse py-8 text-center text-gray-500">Loading your activities...</div>
  {:else if error}
    <div class="card border-red-300 text-red-700 dark:border-red-900 dark:text-red-300" role="alert">
      <p class="font-bold">Loading failed</p>
      <p class="mt-1 text-sm">{error}</p>
      <button class="btn-secondary mt-4" on:click={() => loadWorkouts($activeWorkoutType, selectedPlan)}>Try again</button>
    </div>
  {:else if selectedView === 'free'}
    {#if freePeriods.length > 0}
    <section class="space-y-4" aria-label="Free training periods">
      <div>
        <h3 class="text-2xl font-black">Ready when you are</h3>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Your free periods. Choose an activity and pick up the next session.</p>
      </div>
      {#each freePeriods as period (period.plan.id)}
        {@const remaining = period.groups.reduce((sum, group) => sum + group.workouts.filter((workout) => workout.status === 'planned' || workout.status === 'in_progress').length, 0)}
        <section class="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950" aria-label={period.plan.title}>
          <div class="border-b border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-900">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="mb-1 text-xs font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">Free · {period.plan.weeks} {period.plan.weeks === 1 ? 'week' : 'weeks'}</p>
              <h4 class="text-xl font-bold">{period.plan.title}</h4>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{formatPeriodDate(period.plan.start_date)} – {formatPeriodDate(period.plan.end_date)}</p>
            </div>
            <a class="btn-secondary" href="/programs">Manage period</a>
          </div>
          <div class="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p><span class="font-bold">{period.completed} of {period.total} activities</span> completed</p>
            <p class="font-semibold text-primary-700 dark:text-primary-300">{remaining} remaining</p>
          </div>
          <progress class="activity-progress mt-2" value={period.completed} max={period.total} aria-label={`Progress for ${period.plan.title}`}></progress>
          {#if period.plan.end_date.slice(0, 10) < localDate(new Date())}
            <p class="mt-3 text-sm text-amber-800 dark:text-amber-200">Period ended. Unfinished sessions are still available.</p>
          {:else if period.plan.start_date.slice(0, 10) > localDate(new Date())}
            <p class="mt-3 text-sm text-gray-600 dark:text-gray-300">Upcoming period</p>
          {/if}
          </div>
          <div class="space-y-5 p-3 sm:p-5">
          {#each groupPeriodCategories(period.groups) as category}
            <section class="overflow-hidden rounded-xl border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-gray-900" aria-label={`${category.label} activities`}>
              <div class="border-b-2 border-slate-300 bg-slate-100 p-4 dark:border-slate-600 dark:bg-slate-800">
                <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h5 class="flex items-center gap-3 text-lg font-black">
                    <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl {WORKOUT_TYPE_STYLES[category.type].icon}">
                      <svelte:component this={TYPE_ICONS[category.type]} size={23} strokeWidth={2.25} />
                    </span>
                    {category.label}
                  </h5>
                  <span class="text-sm font-bold text-gray-700 dark:text-gray-200">{category.completed}/{category.total} complete</span>
                </div>
                <progress class="activity-progress" value={category.completed} max={category.total} aria-label={`${category.label} progress`}></progress>
              </div>
              <div class="divide-y divide-gray-200 px-4 dark:divide-gray-700">
                {#each category.groups as group}
                  {#each groupPeriodWorkouts(group.workouts) as item}
                    <div class="flex flex-wrap items-center gap-3 py-3">
                      <span class="flex h-7 w-7 shrink-0 items-center justify-center text-gray-500 dark:text-gray-400">
                        <svelte:component this={TYPE_ICONS[category.type]} size={17} strokeWidth={2} />
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="font-semibold">{item.title}</p>
                        <p class="text-sm text-gray-600 dark:text-gray-300">
                          {item.completed} of {item.workouts.length} complete
                          {#if item.remaining > 0} · {countLabel(item.remaining, item.unit)} left{/if}
                        </p>
                      </div>
                      {#if item.next}
                        <a class={item.next.status === 'in_progress' ? 'btn-primary' : 'btn-secondary'} href={`/workouts/${item.next.id}?view=free`} aria-label={`${item.next.status === 'in_progress' ? 'Continue' : item.unit === 'day' ? 'Log day' : 'Pick up'} ${item.title}`}>
                          {item.next.status === 'in_progress' ? 'Continue' : item.unit === 'day' ? 'Log day' : 'Pick up'} <ChevronRight size={16} />
                        </a>
                      {:else}
                        <span class="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{item.completed === item.workouts.length ? 'Completed' : 'No open activities'}</span>
                      {/if}
                      <details class="basis-full pl-1">
                        <summary class="min-h-8 cursor-pointer py-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
                          History · {countLabel(item.workouts.length, item.unit)}
                        </summary>
                        <div class="space-y-1">
                          {#each item.workouts as workout, index (workout.id)}
                            <a class="flex min-h-10 items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:hover:bg-gray-800" href={`/workouts/${workout.id}?view=free`}>
                              <span>{item.unit === 'day' ? 'Day' : 'Session'} {index + 1}</span>
                              <span class="flex items-center gap-1 {workout.status === 'completed' ? 'text-emerald-700 dark:text-emerald-400' : workout.status === 'in_progress' ? 'font-bold text-primary-700 dark:text-primary-300' : 'text-gray-600 dark:text-gray-300'}">
                                {WORKOUT_STATUS_LABELS[workout.status]} <ChevronRight size={14} />
                              </span>
                            </a>
                          {/each}
                        </div>
                      </details>
                    </div>
                  {/each}
                {/each}
              </div>
            </section>
          {/each}
          </div>
        </section>
      {/each}
    </section>
    {:else}
      <div class="card flex flex-col items-center py-12 text-center">
        <div class="rounded-2xl bg-primary-600 p-4 text-white"><Dumbbell size={28} /></div>
        <h3 class="mt-4 text-xl font-bold">No free activities</h3>
        <p class="mt-2 max-w-md text-gray-600 dark:text-gray-300">No free periods match your filters. Prepare a period in Setup, then pick up its activities here whenever you are ready.</p>
        <a class="btn-primary mt-6" href="/programs?mode=free_period"><Plus size={18} /> Prepare a free period</a>
      </div>
    {/if}
  {:else}

  <section class="space-y-3" aria-label="Dated activity timeline">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-2xl font-black"><CalendarDays size={23} /> Timeline</h3>
      <span class="text-sm text-gray-600 dark:text-gray-300">{visibleWorkouts.length} {visibleWorkouts.length === 1 ? 'dated activity' : 'dated activities'}</span>
    </div>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Timeline date range">
      {#each DATE_RANGE_OPTIONS as option}
        <button type="button" class="touch-target rounded-xl border px-4 text-sm font-bold transition {dateRangeFilter === option.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100'}"
          aria-pressed={dateRangeFilter === option.value} on:click={() => selectRange(option.value)}>{option.label}</button>
      {/each}
    </div>
  </section>

  {#if visibleWorkouts.length === 0}
    {#if freePeriods.length > 0}
      <p class="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">No dated workouts in this range. Completed sessions from your free periods will appear here on their execution date.</p>
    {:else}
    <div class="card flex flex-col items-center py-12 text-center">
      <div class="rounded-2xl bg-primary-600 p-4 text-white"><Dumbbell size={28} /></div>
      <h3 class="mt-4 text-xl font-bold">{workouts.length === 0 ? 'Your timeline is empty' : 'No dated workouts in this range'}</h3>
      <p class="mt-2 max-w-md text-gray-600 dark:text-gray-300">Add a workout or choose a different date range.</p>
      <button class="btn-primary mt-6" on:click={() => goto('/library')}><Plus size={18} /> Go to Activities</button>
    </div>
    {/if}
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
                href={`/workouts/${workout.id}?view=planned`}>
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
                  <span>{workout.day_part === 'all_day' ? group.label : workout.status === 'planned' ? (workout.day_part ? group.label : 'Time not scheduled') : formatDateTime(workout.performed_at)}</span>
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
  {/if}
</div>
