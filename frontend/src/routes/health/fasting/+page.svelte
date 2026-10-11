<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Flame, HeartPulse, Sparkles } from '@lucide/svelte';
  import { createHealthProgram, getHealthCheckins, getHealthPrograms, saveHealthCheckin, updateHealthProgram } from '$lib/pocketbase';
  import {
    currentStreak,
    dayOfYear,
    longestStreak,
    motivationFor,
    parseMealPlan,
    quoteOfDay,
    FASTING_KINDS,
    FASTING_PROTOCOLS,
    suggestMealPlan,
    windowStatus,
    toDateKey,
    WEEKDAY_LABELS,
    WEEK_ORDER,
    type MealPlan
  } from '$lib/health';
  import type { HealthCheckin, HealthProgram, HealthProgramKind } from '$lib/types';

  let kind: HealthProgramKind = 'omad';
  let programs: HealthProgram[] = [];
  let program: HealthProgram | null = null;
  let checkins: HealthCheckin[] = [];
  let mealPlan: MealPlan = {};
  let mealTime = FASTING_PROTOCOLS.omad.defaultStart;
  let calories = 2000;
  let protein = 130;
  let loading = true;
  let saving = false;
  let error = '';
  let message = '';
  let now = new Date();

  $: today = toDateKey(now);
  $: todayCheckin = checkins.find((entry) => entry.date === today);
  $: fastedToday = Boolean(todayCheckin?.fasted);
  $: streak = currentStreak(checkins, today);
  $: best = longestStreak(checkins);
  $: totalDays = checkins.filter((entry) => entry.fasted).length;
  $: protocol = FASTING_PROTOCOLS[kind];
  $: status = windowStatus(program?.meal_time || mealTime, protocol.eatHours, now);
  $: motivation = motivationFor(streak, fastedToday, dayOfYear(now));
  $: todaysMeal = mealPlan[now.getDay()];

  const select = async (next: HealthProgramKind) => {
    kind = next;
    error = '';
    message = '';
    program = programs.find((entry) => entry.kind === kind && entry.active) ?? null;
    mealPlan = parseMealPlan(program?.meal_plan);
    mealTime = program?.meal_time || FASTING_PROTOCOLS[kind].defaultStart;
    calories = program?.calories || 2000;
    protein = program?.protein_g || 130;
    checkins = program ? await getHealthCheckins(program.id) : [];
  };

  const load = async () => {
    try {
      programs = await getHealthPrograms();
      await select(kind);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Health-programma kon niet worden geladen.';
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    load();
    const timer = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(timer);
  });

  const run = async (action: () => Promise<void>, success = '') => {
    saving = true;
    error = '';
    message = '';
    try {
      await action();
      message = success;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Opslaan is mislukt.';
    } finally {
      saving = false;
    }
  };

  const startProgram = () =>
    run(async () => {
      program = await createHealthProgram({
        kind,
        title: protocol.label,
        start_date: toDateKey(new Date()),
        meal_time: mealTime,
        calories,
        protein_g: protein,
        meal_plan: JSON.stringify(Object.keys(mealPlan).length ? mealPlan : suggestMealPlan(protein, calories, kind)),
        active: true
      });
      mealPlan = parseMealPlan(program.meal_plan);
      programs = [...programs, program];
    }, `${protocol.label}-programma gestart.`);

  const savePlan = () =>
    run(async () => {
      if (!program) return;
      program = await updateHealthProgram(program.id, {
        meal_time: mealTime,
        calories,
        protein_g: protein,
        meal_plan: JSON.stringify(mealPlan)
      });
      programs = programs.map((entry) => (entry.id === program?.id ? program : entry));
    }, 'Maaltijdplanner opgeslagen.');

  const generate = () => {
    mealPlan = suggestMealPlan(protein, calories, kind);
  };

  const toggleToday = () =>
    run(async () => {
      if (!program) return;
      const saved = await saveHealthCheckin(program.id, today, { fasted: !fastedToday }, todayCheckin);
      checkins = todayCheckin ? checkins.map((entry) => (entry.id === saved.id ? saved : entry)) : [saved, ...checkins];
    });

  const stopProgram = async () => {
    if (!program || !confirm(`${protocol.label}-programma stoppen? Je voortgang blijft bewaard.`)) return;
    await run(async () => {
      if (!program) return;
      await updateHealthProgram(program.id, { active: false });
      programs = programs.filter((entry) => entry.id !== program?.id);
      program = null;
      checkins = [];
    });
  };
</script>

<svelte:head><title>Health · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Health · Fasting</p>
    <h2 class="mt-1 flex items-center gap-2 text-3xl font-black"><HeartPulse size={28} /> {protocol.label}</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">{protocol.description} Dit is geen medisch advies; overleg bij gezondheidsklachten of medicatie eerst met je huisarts.</p>
  </div>
  <div class="flex flex-wrap gap-2" role="tablist" aria-label="Vastenprotocol">
    {#each FASTING_KINDS as option}
      <button type="button" role="tab" aria-selected={kind === option} class="touch-target rounded-xl px-5 text-sm font-bold transition {kind === option ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}" on:click={() => select(option)}>{FASTING_PROTOCOLS[option].label}</button>
    {/each}
  </div>

  {#if loading}
    <div class="card animate-pulse">Laden...</div>
  {:else}
    {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
    {#if message}<p class="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{message}</p>{/if}

    {#if program}
      <section class="card space-y-4">
        <div class="flex items-start gap-3">
          <Sparkles class="mt-1 shrink-0 text-overload-signal" size={22} />
          <p class="text-lg font-semibold">{motivation}</p>
        </div>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><Flame class="mx-auto text-orange-500" size={20} /><p class="text-2xl font-black">{streak}</p><p class="text-xs text-gray-500 dark:text-gray-400">Huidige reeks</p></div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><p class="text-2xl font-black">{best}</p><p class="text-xs text-gray-500 dark:text-gray-400">Langste reeks</p></div>
          <div class="rounded-xl bg-gray-50 p-3 dark:bg-gray-800"><p class="text-2xl font-black">{totalDays}</p><p class="text-xs text-gray-500 dark:text-gray-400">Dagen totaal</p></div>
        </div>
        <div class="rounded-xl bg-gray-50 p-4 dark:bg-gray-800">
          <p class="text-sm text-gray-500 dark:text-gray-400">{kind === 'omad' ? 'Maaltijd' : 'Eetvenster'} vanaf {program.meal_time || mealTime}{kind === 'omad' ? '' : ` (${protocol.eatHours} uur)`}</p>
          <p class="font-bold">{status.eating ? 'Eetvenster sluit over' : 'Eetvenster opent over'} {status.hours} uur en {status.minutes} min</p>
          {#if todaysMeal}<p class="mt-2 text-sm text-gray-700 dark:text-gray-200"><span class="font-semibold">Vandaag:</span> {todaysMeal}</p>{/if}
        </div>
        <button class="w-full {fastedToday ? 'btn-secondary' : 'btn-primary'}" disabled={saving} on:click={toggleToday}>
          <Check size={18} /> {fastedToday ? 'Vandaag gevast: ongedaan maken' : 'Vandaag gevast'}
        </button>
        <p class="text-sm italic text-gray-600 dark:text-gray-300">“{quoteOfDay(now)}”</p>
      </section>

      <section class="card space-y-4">
        <h3 class="text-xl font-black">Maaltijdplanner</h3>
        <div class="grid gap-4 sm:grid-cols-3">
          <div><label class="label" for="meal-time">{kind === 'omad' ? 'Maaltijdtijd' : 'Start eetvenster'}</label><input id="meal-time" class="input" type="time" bind:value={mealTime} /></div>
          <div><label class="label" for="calories">Calorieën (kcal)</label><input id="calories" class="input" type="number" min="800" step="50" bind:value={calories} /></div>
          <div><label class="label" for="protein">Eiwit (g)</label><input id="protein" class="input" type="number" min="0" step="5" bind:value={protein} /></div>
        </div>
        <div class="space-y-3">
          {#each WEEK_ORDER as day}
            <div>
              <label class="label" for={`meal-${day}`}>{WEEKDAY_LABELS[day]}</label>
              <textarea id={`meal-${day}`} class="input" rows="2" bind:value={mealPlan[day]} placeholder="Wat eet je op deze dag?"></textarea>
            </div>
          {/each}
        </div>
        <div class="flex flex-wrap gap-3">
          <button class="btn-primary" disabled={saving} on:click={savePlan}>Opslaan</button>
          <button class="btn-secondary" type="button" on:click={generate}>Weekmenu voorstellen</button>
          <button class="btn-secondary" type="button" disabled={saving} on:click={stopProgram}>Programma stoppen</button>
        </div>
      </section>
    {:else}
      <section class="card space-y-4">
        <h3 class="text-xl font-black">Start je {protocol.label}-programma</h3>
        <div class="grid gap-4 sm:grid-cols-3">
          <div><label class="label" for="meal-time">{kind === 'omad' ? 'Maaltijdtijd' : 'Start eetvenster'}</label><input id="meal-time" class="input" type="time" bind:value={mealTime} /></div>
          <div><label class="label" for="calories">Calorieën (kcal)</label><input id="calories" class="input" type="number" min="800" step="50" bind:value={calories} /></div>
          <div><label class="label" for="protein">Eiwit (g)</label><input id="protein" class="input" type="number" min="0" step="5" bind:value={protein} /></div>
        </div>
        <p class="text-sm text-gray-600 dark:text-gray-300">Je krijgt een weekmenu als startpunt, een reekstracker en dagelijkse motivatie.</p>
        <button class="btn-primary w-full" disabled={saving} on:click={startProgram}>Programma starten</button>
      </section>
    {/if}
  {/if}
</div>
