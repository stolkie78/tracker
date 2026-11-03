<script lang="ts">
  import { BookOpen, ChevronRight, Dumbbell, Repeat, Sparkles } from '@lucide/svelte';
  import { aiAvailability } from '$lib/stores/ai';

  const sections = [
    { href: '/library', label: 'Activities', description: 'Create reusable activities for your workouts, breathing, and nutrition.', icon: Dumbbell },
    { href: '/programs', label: 'Programs', description: 'Combine your activities into a planned schedule or a free period.', icon: Repeat },
    { href: '/catalog', label: 'Catalog', description: 'Personalize activity choices, exercises, and equipment.', icon: BookOpen }
  ];
</script>

<svelte:head><title>Setup · T.O.P. Trainer</title></svelte:head>

<div class="space-y-6">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Your building blocks</p>
    <h2 class="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Setup</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Set up once, reuse every day. Manage your building blocks here; follow and log them in Activities.</p>
  </div>

  <div class="space-y-3">
    {#each sections as section}
      <a class="card flex items-center gap-4 transition hover:border-primary-400" href={section.href}>
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
          <svelte:component this={section.icon} size={24} />
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-bold">{section.label}</h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{section.description}</p>
        </div>
        <ChevronRight class="shrink-0" size={20} />
      </a>
    {/each}
    {#if $aiAvailability.enabled}
      <a class="card flex items-center gap-4 transition hover:border-primary-400" href="/planner">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"><Sparkles size={24} /></div>
        <div class="min-w-0 flex-1">
          <h3 class="font-bold">AI planner</h3>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-300">Generate a schedule to use in your activity timeline.</p>
        </div>
        <ChevronRight class="shrink-0" size={20} />
      </a>
    {/if}
  </div>
</div>
