<script lang="ts">
  import { onMount } from 'svelte';
  import CycleChoice from '$lib/components/CycleChoice.svelte';
  import { goto } from '$app/navigation';
  import { Activity, CalendarDays, Check, ChevronDown, LoaderCircle, Sparkles } from '@lucide/svelte';
  import {
    createTrainingPlan,
    createWorkout,
    createWorkoutExercise,
    createWorkoutSet,
    generateTrainingPlan,
    getTrainingPlans
  } from '$lib/pocketbase';
  import {
    CARDIO_MODE_LABELS,
    DEFAULT_STRENGTH_REST_SECONDS,
    DEFAULT_STRENGTH_TEMPO,
    RECOVERY_ACTIVITY_LABELS,
    WORKOUT_TYPE_LABELS,
  WORKOUT_TYPE_STYLES,
    type GeneratedPlan,
    type GeneratedWorkout,
    type TrainingPlan
  } from '$lib/types';

  const DAYS = [
    { value: 'Monday', label: 'Mon' },
    { value: 'Tuesday', label: 'Tue' },
    { value: 'Wednesday', label: 'Wed' },
    { value: 'Thursday', label: 'Thu' },
    { value: 'Friday', label: 'Fri' },
    { value: 'Saturday', label: 'Sat' },
    { value: 'Sunday', label: 'Sun' }
  ];
  const today = new Date();
  const dateInputValue = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  let startDate = dateInputValue;
  let weeks = 4;
  let goal = 'General fitness and building strength';
  let experience = 'beginner';
  let equipment = 'Gym with standard fitness equipment';
  let availableDays = ['Monday', 'Wednesday', 'Friday', 'Saturday', 'Sunday'];
  let strengthSessions = 3;
  let cardioSessions = 1;
  let intervalSessions = 0;
  let recoverySessions = 1;

  let generated: GeneratedPlan | null = null;
  let plans: TrainingPlan[] = [];
  let loading = false;
  let saving = false;
  let pageLoading = true;
  let error = '';
  let success = '';
  let savedWorkoutCount = 0;

  $: endDate = calculateEndDate(startDate, weeks);
  $: sessionsPerWeek = strengthSessions + cardioSessions + intervalSessions + recoverySessions;

  onMount(async () => {
    try {
      plans = await getTrainingPlans();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Saved plans could not be loaded.';
    } finally {
      pageLoading = false;
    }
  });

  function calculateEndDate(firstDay: string, durationInWeeks: number) {
    const date = new Date(`${firstDay}T12:00:00`);
    date.setDate(date.getDate() + durationInWeeks * 7 - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));

  const toggleDay = (day: string) => {
    availableDays = availableDays.includes(day) ? availableDays.filter((entry) => entry !== day) : [...availableDays, day];
  };

  const generate = async () => {
    error = '';
    success = '';
    generated = null;
    if (sessionsPerWeek < 1 || sessionsPerWeek > 7) {
      error = 'Choose at least one and no more than seven sessions per week.';
      return;
    }
    if (availableDays.length < sessionsPerWeek) {
      error = `Select at least ${sessionsPerWeek} available days per week for your chosen training frequency.`;
      return;
    }

    loading = true;
    try {
      generated = await generateTrainingPlan({
        start_date: startDate,
        end_date: endDate,
        weeks,
        goal: goal.trim(),
        experience,
        available_days: DAYS.filter((day) => availableDays.includes(day.value)).map((day) => day.value),
        equipment: equipment.trim(),
        preferences: {
          strength_sessions: strengthSessions,
          cardio_sessions: cardioSessions,
          interval_sessions: intervalSessions,
          recovery_sessions: recoverySessions
        }
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Could not generate the plan. Check your AI settings and try again.';
    } finally {
      loading = false;
    }
  };

  const persistWorkout = async (planId: string, workout: GeneratedWorkout, index: number) => {
    const created = await createWorkout({
      plan: planId,
      title: workout.title,
      type: workout.type,
      status: 'planned',
      performed_at: new Date(`${workout.date}T09:00:00`).toISOString(),
      duration_minutes: workout.duration_minutes,
      notes: workout.notes,
      ...(workout.cardio_mode ? { cardio_mode: workout.cardio_mode } : {}),
      ...(workout.distance_km !== undefined ? { distance_km: workout.distance_km } : {}),
      ...(workout.interval_work_seconds !== undefined ? { interval_work_seconds: workout.interval_work_seconds } : {}),
      ...(workout.interval_rest_seconds !== undefined ? { interval_rest_seconds: workout.interval_rest_seconds } : {}),
      ...(workout.interval_rounds !== undefined ? { interval_rounds: workout.interval_rounds } : {}),
      ...(workout.recovery_activity ? { recovery_activity: workout.recovery_activity } : {})
    });

    for (const [exerciseIndex, item] of (workout.strength_exercises ?? []).entries()) {
      const workoutExercise = await createWorkoutExercise({
        owner: created.owner,
        workout: created.id,
        exercise: item.exercise_id,
        ...(item.equipment ? { equipment: item.equipment } : {}),
        set_order: exerciseIndex + 1,
        target_sets: item.sets,
        reps_min: item.reps_min,
        reps_max: item.reps_max,
        starting_weight: item.starting_weight,
        weight_increment: item.weight_increment,
        rest_seconds: item.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS,
        tempo: item.tempo ?? DEFAULT_STRENGTH_TEMPO
      });
      for (let setIndex = 0; setIndex < item.sets; setIndex += 1) {
        await createWorkoutSet({
          owner: created.owner,
          workout_exercise: workoutExercise.id,
          set_order: setIndex + 1,
          reps: 0,
          weight: item.starting_weight,
          completed: false
        });
      }
    }
    savedWorkoutCount = index + 1;
  };

  const savePlan = async () => {
    if (!generated) return;
    saving = true;
    error = '';
    success = '';
    savedWorkoutCount = 0;
    let planId = '';
    const totalWorkoutCount = generated.workouts.length;
    try {
      const saved = await createTrainingPlan({
        title: generated.title,
        goal: goal.trim(),
        start_date: new Date(`${startDate}T12:00:00`).toISOString(),
        end_date: new Date(`${endDate}T12:00:00`).toISOString(),
        weeks,
        summary: generated.summary
      });
      planId = saved.id;
      for (const [index, workout] of generated.workouts.entries()) {
        await persistWorkout(saved.id, workout, index);
      }
      plans = [saved, ...plans];
      success = `Plan saved with ${generated.workouts.length} workouts.`;
      generated = null;
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Could not save changes.';
      error = planId
        ? `The plan was created and ${savedWorkoutCount} of ${totalWorkoutCount} workouts were saved. Try creating the missing workouts again. ${reason}`
        : reason;
    } finally {
      saving = false;
    }
  };

  const workoutDetails = (workout: GeneratedWorkout) => {
    if (workout.type === 'strength') return `${workout.strength_exercises?.length ?? 0} exercises`;
    if (workout.type === 'cardio') {
      return [workout.cardio_mode ? CARDIO_MODE_LABELS[workout.cardio_mode] : '', workout.distance_km ? `${workout.distance_km} km` : ''].filter(Boolean).join(' · ');
    }
    if (workout.type === 'interval') {
      return `${workout.interval_rounds} rounds · ${workout.interval_work_seconds}s work / ${workout.interval_rest_seconds}s rest`;
    }
    return workout.recovery_activity ? RECOVERY_ACTIVITY_LABELS[workout.recovery_activity] : '';
  };
</script>

<svelte:head>
  <title>AI Workout Planner · T.O.P. Trainer</title>
</svelte:head>

<div class="space-y-6">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Personal planning</p>
    <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">AI Workout Planner</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Create a mixed training plan for several weeks. Review the proposal before saving it to your timeline.</p>
  </div>

  {#if pageLoading}
    <div class="card animate-pulse">Loading planner...</div>
  {:else}
    <form class="card space-y-5" on:submit|preventDefault={generate}>
      <div class="flex items-start gap-3 rounded-xl bg-primary-50 p-4 text-sm text-primary-900 dark:bg-primary-950 dark:text-primary-100">
        <Sparkles class="mt-0.5 shrink-0" size={20} />
        <p>The planner creates strength, cardio, interval, and recovery sessions based on your goals, availability, equipment, and preferences. Always review an AI-generated plan before following it.</p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div>
          <label class="label" for="plan-start">Start date</label>
          <input id="plan-start" class="input" type="date" bind:value={startDate} required />
        </div>
        <div>
          <label class="label" for="plan-weeks">Duration</label>
          <CycleChoice id="plan-weeks" label="Duration" bind:value={weeks}
            options={[2, 3, 4, 6, 8, 12].map((value) => ({ value, label: `${value} weeks · through ${formatDate(calculateEndDate(startDate, value))}` }))} />
        </div>
        <div class="sm:col-span-2">
          <label class="label" for="plan-goal">Goal or additional context</label>
          <textarea id="plan-goal" class="input min-h-24 resize-y" bind:value={goal} maxlength="500" placeholder="For example: build strength, improve fitness, prepare for a hiking trip." required></textarea>
        </div>
        <div>
          <label class="label" for="experience">Ervaringsniveau</label>
          <CycleChoice id="experience" label="Ervaringsniveau" bind:value={experience}
            options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
        </div>
        <div>
          <label class="label" for="equipment">Available equipment</label>
          <input id="equipment" class="input" bind:value={equipment} maxlength="500" placeholder="Gym, dumbbells at home, no equipment..." />
        </div>
      </div>

      <fieldset>
        <legend class="label">Available days</legend>
        <div class="grid grid-cols-7 gap-2">
          {#each DAYS as day}
            <label class="touch-target flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border text-sm font-bold transition {availableDays.includes(day.value) ? 'border-primary-500 bg-primary-50 text-primary-800 dark:bg-primary-950 dark:text-primary-100' : 'border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-400'}">
              <input class="sr-only" type="checkbox" checked={availableDays.includes(day.value)} on:change={() => toggleDay(day.value)} />
              {day.label}
              {#if availableDays.includes(day.value)}<Check size={14} />{/if}
            </label>
          {/each}
        </div>
      </fieldset>

      <fieldset>
        <legend class="label">Sessions per week <span class="font-normal text-gray-500">· {sessionsPerWeek} total</span></legend>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><label class="label" for="sessions-strength">Strength</label><input id="sessions-strength" class="input" type="number" min="0" max="7" bind:value={strengthSessions} /></div>
          <div><label class="label" for="sessions-cardio">Cardio</label><input id="sessions-cardio" class="input" type="number" min="0" max="7" bind:value={cardioSessions} /></div>
          <div><label class="label" for="sessions-interval">Interval</label><input id="sessions-interval" class="input" type="number" min="0" max="7" bind:value={intervalSessions} /></div>
          <div><label class="label" for="sessions-recovery">Recovery</label><input id="sessions-recovery" class="input" type="number" min="0" max="7" bind:value={recoverySessions} /></div>
        </div>
      </fieldset>

      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      {#if success}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}
      <button class="btn-primary w-full" type="submit" disabled={loading}>
        {#if loading}<LoaderCircle class="animate-spin" size={18} /> Creating plan...{:else}<Sparkles size={18} /> Generate plan{/if}
      </button>
      <p class="text-center text-xs text-gray-500 dark:text-gray-400">Generation may take up to two minutes. Configure your AI key in <a class="font-semibold text-primary-700 underline dark:text-primary-300" href="/settings">Settings</a>.</p>
    </form>
  {/if}

  {#if generated}
    <section class="space-y-4">
      <div class="card">
        <p class="text-xs font-bold uppercase tracking-[0.18em] text-overload-signal">AI proposal · {generated.workouts.length} sessions</p>
        <h3 class="mt-2 text-2xl font-black">{generated.title}</h3>
        <p class="mt-2 whitespace-pre-line text-gray-600 dark:text-gray-300">{generated.summary}</p>
        <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">{formatDate(startDate)} – {formatDate(endDate)} · {weeks} weeks</p>
      </div>
      {#each generated.workouts as workout, index}
        <article class="card flex gap-3">
          <div class="flex w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-50 text-center dark:bg-primary-950">
            <span class="text-[10px] font-bold uppercase text-primary-700 dark:text-primary-300">{new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${workout.date}T12:00:00`))}</span>
            <span class="text-xl font-black">{new Date(`${workout.date}T12:00:00`).getDate()}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h4 class="font-bold">{workout.title}</h4>
              <span class="badge {WORKOUT_TYPE_STYLES[workout.type].badge}">{WORKOUT_TYPE_LABELS[workout.type]}</span>
            </div>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{workoutDetails(workout)} · {workout.duration_minutes} min</p>
            {#if workout.type === 'strength' && workout.strength_exercises}
              <ul class="mt-3 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                {#each workout.strength_exercises as exercise}
                  <li>{exercise.sets} × {exercise.reps_min}-{exercise.reps_max} reps · {exercise.rest_seconds ?? DEFAULT_STRENGTH_REST_SECONDS}s rest · tempo {exercise.tempo ?? DEFAULT_STRENGTH_TEMPO} · weight as desired ({exercise.weight_increment} kg increments)</li>
                {/each}
              </ul>
            {/if}
            {#if workout.notes}<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{workout.notes}</p>{/if}
          </div>
          <span class="sr-only">Sessie {index + 1}</span>
        </article>
      {/each}
      <button class="btn-primary w-full" on:click={savePlan} disabled={saving}>
        {#if saving}<LoaderCircle class="animate-spin" size={18} /> Saving...{:else}<Check size={18} /> Save plan to my timeline{/if}
      </button>
      <button class="btn-secondary w-full" on:click={() => (generated = null)} disabled={saving}>Discard proposal</button>
    </section>
  {/if}

  <section class="space-y-3">
    <div class="flex items-center gap-2">
      <CalendarDays size={20} class="text-overload-signal" />
      <h3 class="text-xl font-black">Previous plans</h3>
    </div>
    {#if plans.length === 0}
      <div class="card text-sm text-gray-600 dark:text-gray-300">Your saved training plans will appear here.</div>
    {:else}
      {#each plans as plan}
        <details class="card group">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3">
            <div>
              <p class="font-bold">{plan.title}</p>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatDate(plan.start_date)} – {formatDate(plan.end_date)} · {plan.weeks} weeks</p>
            </div>
            <ChevronDown size={19} class="transition group-open:rotate-180" />
          </summary>
          {#if plan.summary}<p class="mt-4 whitespace-pre-line border-t border-gray-100 pt-4 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">{plan.summary}</p>{/if}
          <a class="btn-secondary mt-4 w-full" href={`/?plan=${plan.id}`}><Activity size={17} /> Back to timeline</a>
        </details>
      {/each}
    {/if}
  </section>
</div>
