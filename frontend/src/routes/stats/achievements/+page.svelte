<script lang="ts">
  import ActivityProgress from '$lib/components/ActivityProgress.svelte';
</script>

<svelte:head><title>Achievements · T.O.P. Trainer</title></svelte:head>

<div class="space-y-6">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Your progress</p>
    <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Achievements</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Your weekly goal, consistency, and milestones in one place.</p>
  </div>
  <ActivityProgress collection trends />
</div>
