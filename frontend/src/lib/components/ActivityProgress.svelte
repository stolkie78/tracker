<script lang="ts">
  import { onMount } from 'svelte';
  import { Trophy } from '@lucide/svelte';
  import { activityProgress, goalForWeek, setWeeklyGoal, weekKey } from '$lib/gamification';
  import { getOrCreateMyProfile, getWorkouts, saveMyProfile } from '$lib/pocketbase';
  import type { Profile, Workout } from '$lib/types';

  export let collection = false;
  export let trends = false;
  let record: Profile | null = null;
  let workouts: Workout[] = [];
  let loading = true;
  let saving = false;
  let error = '';
  let success = '';
  let target = 3;
  let now = new Date();
  $: progress = activityProgress(workouts, record?.weekly_goals ?? [], now);
  $: nextBadge = progress.badges.find((badge) => !badge.earned);

  async function load() {
    loading = true;
    error = '';
    try {
      [record, workouts] = await Promise.all([getOrCreateMyProfile(), getWorkouts()]);
      now = new Date();
      target = goalForWeek(record.weekly_goals ?? [], weekKey(now));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Your activity progress could not be loaded.';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void load();
    const timer = window.setInterval(() => { now = new Date(); }, 60000);
    return () => window.clearInterval(timer);
  });

  async function saveGoal() {
    if (!record) return;
    saving = true;
    error = '';
    success = '';
    try {
      const data = new FormData();
      data.set('weekly_goals', JSON.stringify(setWeeklyGoal(record.weekly_goals ?? [], target)));
      record = await saveMyProfile(record.id, data);
      now = new Date();
      success = 'Weekly goal saved. Previous weeks keep their own targets.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Your weekly goal could not be saved.';
    } finally {
      saving = false;
    }
  }
</script>

<section class="card space-y-4" aria-label={collection ? 'Your achievements' : 'Your week'}>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h3 class="flex items-center gap-2 text-xl font-bold"><Trophy size={22} /> {collection ? 'Your achievements' : 'Your week'}</h3>
    {#if !collection}<a class="font-bold text-overload-signal" href="/stats/achievements">View milestones</a>{/if}
  </div>
  {#if loading}
    <p role="status">Loading your progress...</p>
  {:else}
    {#if error}
      <p role="alert" class="text-red-700 dark:text-red-300">{error}</p>
      {#if !record}<button class="btn-secondary" on:click={load}>Try again</button>{/if}
    {/if}
    {#if record}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p><strong class="text-2xl">{progress.completed} / {progress.target}</strong> sessions this week</p>
        <p><strong>{progress.streak}</strong> {progress.streak === 1 ? 'week' : 'weeks'} of consistency</p>
      </div>
      <progress class="activity-progress" max={progress.target} value={Math.min(progress.completed, progress.target)} aria-label="Weekly session goal"></progress>
      <p class="text-sm text-gray-600 dark:text-gray-300">
        {progress.completed >= progress.target ? 'Weekly goal met. Enjoy your rest days.' : 'Monday to Sunday. Walking and recovery count; daily training is not required.'}
        An unfinished week does not break your streak.
      </p>
      <form class="flex flex-wrap items-end gap-2" on:submit|preventDefault={saveGoal}>
        <div>
          <label class="label" for="weekly-goal">Your weekly goal</label>
          <select class="input" id="weekly-goal" bind:value={target} disabled={saving}>
            {#each [1, 2, 3, 4, 5, 6, 7] as count}<option value={count}>{count} {count === 1 ? 'session' : 'sessions'}</option>{/each}
          </select>
        </div>
        <button class="btn-secondary" type="submit" disabled={saving || target === progress.target}>{saving ? 'Saving...' : 'Save goal'}</button>
      </form>
      {#if success}<p role="status" class="text-sm text-emerald-700 dark:text-emerald-300">{success}</p>{/if}
      {#if collection}
        <p class="text-sm text-gray-600 dark:text-gray-300">Milestones reflect your current history, including imported sessions. Corrections update progress; they never create duplicate awards. Nutrition and fasting do not earn rewards.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          {#each progress.badges as badge (badge.id)}
            <div class="rounded-xl border p-3 {badge.earned ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-gray-200 dark:border-gray-700'}">
              <p class="font-bold">{badge.title} <span class="text-sm">{badge.earned ? '- Earned' : '- In progress'}</span></p>
              <p class="text-sm">{badge.description}</p>
              <p class="mt-2 text-sm">{Math.min(badge.value, badge.target)} / {badge.target} {badge.unit}</p>
              <progress class="activity-progress" max={badge.target} value={Math.min(badge.value, badge.target)} aria-label={badge.title}></progress>
            </div>
          {/each}
        </div>
      {:else if nextBadge}
        <p class="text-sm"><strong>Next milestone: {nextBadge.title}</strong> · {Math.min(nextBadge.value, nextBadge.target)} / {nextBadge.target} {nextBadge.unit}</p>
      {/if}
      {#if trends}
        <h4 class="font-bold">Last 8 weeks · best streak: {progress.bestStreak} weeks</h4>
        <ul class="space-y-2 text-sm">
          {#each progress.recentWeeks as week}
            <li class="flex justify-between gap-2"><span>Week of {week.week}</span><span>{week.completed} / {week.target} {week.completed >= week.target ? '- Goal met' : ''}</span></li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}
</section>
