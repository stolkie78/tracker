<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { ChartNoAxesCombined, Dumbbell, HeartPulse, Settings, UserRound } from '@lucide/svelte';
  import { darkTheme } from '$lib/stores/theme';
  import { aiAvailability, loadAIAvailability } from '$lib/stores/ai';
  import { currentUser, isAuthenticated } from '$lib/stores/auth';
  import { loadUserRoles, rolesLoaded } from '$lib/stores/role';
  import { getStravaStatus, syncStrava } from '$lib/pocketbase';

  let roleLoadError = '';

  const TRAINING_PATHS = ['/workouts', '/planner', '/programs', '/library'];
  const nav = [
    { href: '/', label: 'Workout', icon: Dumbbell, match: (path: string) => path === '/' || TRAINING_PATHS.some((base) => path.startsWith(base)) },
    { href: '/health', label: 'Health', icon: HeartPulse, match: (path: string) => path.startsWith('/health') },
    { href: '/stats', label: 'Insights', icon: ChartNoAxesCombined, match: (path: string) => path.startsWith('/stats') }
  ];
  const accountNav = [
    { href: '/settings', label: 'Settings', icon: Settings, match: (path: string) => path.startsWith('/settings') },
    { href: '/profile', label: 'Profile', icon: UserRound, match: (path: string) => path.startsWith('/profile') }
  ];

  const trainingNav = [
    { href: '/', label: 'Timeline' },
    { href: '/library', label: 'Workouts' },
    { href: '/programs', label: 'Programs' },
    { href: '/planner', label: 'AI planner', ai: true }
  ];
  const isActive = (path: string, href: string) =>
    href === '/' ? path === '/' : href === '/stats' ? path === href : path.startsWith(href);

  const healthNav = [
    { href: '/health/measurements', label: 'Measurements' },
    { href: '/health/fasting', label: 'Fasting' },
    { href: '/health/mindfulness', label: 'Mindfulness' },
    { href: '/health/braintraining', label: 'Braintraining' }
  ];
  const insightsNav = [
    { href: '/stats', label: 'Overview' },
    { href: '/stats/training', label: 'Training' },
    { href: '/stats/exercises', label: 'Exercises' },
    { href: '/stats/body', label: 'Body' }
  ];

  $: inTraining = nav[0].match($page.url.pathname);
  $: inHealth = nav[1].match($page.url.pathname);
  $: inInsights = nav[2].match($page.url.pathname);
  $: subNav = inHealth ? healthNav : inTraining ? trainingNav.filter((item) => !item.ai || $aiAvailability.enabled) : inInsights ? insightsNav : [];

  $: isLogin = $page.url.pathname === '/login';

  $: if (browser && !$isAuthenticated && !isLogin) {
    goto('/login');
  }

  $: if (browser && $isAuthenticated && !isLogin && !$rolesLoaded) {
    roleLoadError = '';
    loadUserRoles().catch((error) => {
      roleLoadError = error instanceof Error ? error.message : 'Your profile could not be loaded.';
    });
  }

  $: if (browser && $isAuthenticated && !isLogin && $aiAvailability.user !== $currentUser?.id) {
    loadAIAvailability();
  }

  let stravaUser = '';
  $: if (!$isAuthenticated) stravaUser = '';
  $: if (browser && $isAuthenticated && !isLogin && stravaUser !== $currentUser?.id) {
    stravaUser = $currentUser?.id ?? '';
    const syncKey = `strava-sync:${stravaUser}`;
    const last = Number(sessionStorage.getItem(syncKey) ?? 0);
    if (Date.now() - last > 10 * 60_000) {
      sessionStorage.setItem(syncKey, String(Date.now()));
      getStravaStatus()
        .then((status) => (status.connected ? syncStrava() : null))
        .catch(() => undefined);
    }
  }

  $: if (browser) {
    document.documentElement.classList.toggle('dark', $darkTheme);
  }

  const retryRoleLoad = async () => {
    roleLoadError = '';
    try {
      await loadUserRoles();
    } catch (error) {
      roleLoadError = error instanceof Error ? error.message : 'Your profile could not be loaded.';
    }
  };
</script>

<svelte:head>
  <meta name="description" content="Track your workouts and see your progress in one place." />
  <link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

{#if isLogin}
  <slot />
{:else if !$isAuthenticated}
  <main class="mx-auto max-w-lg px-4 py-16 text-center">
    <div class="card">Redirecting you to sign in...</div>
  </main>
{:else if !$rolesLoaded}
  <main class="mx-auto max-w-lg px-4 py-16 text-center">
    <div class="card">
      {#if roleLoadError}
        <p class="font-semibold text-red-700 dark:text-red-300">Could not load profile: {roleLoadError}</p>
        <button class="btn-secondary mt-4" on:click={retryRoleLoad}>Try again</button>
      {:else}
        Loading your profile...
      {/if}
    </div>
  </main>
{:else}
  <div class="min-h-screen">
    <header class="sticky top-0 z-40 border-b border-gray-200/70 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
      <div class="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a href="/" class="flex items-center gap-3" aria-label="T.O.P. Trainer home">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-overload-signal text-white">
            <Dumbbell size={22} />
          </div>
          <div>
            <p class="text-xs font-black uppercase tracking-[0.25em] text-overload-signal">T.O.P.</p>
            <h1 class="text-lg font-black">Trainer</h1>
          </div>
        </a>
        <nav class="order-last grid w-full grid-cols-3 gap-2 sm:order-none sm:flex sm:w-auto" aria-label="Main menu">
          {#each nav as item}
            <a
              class="flex min-h-12 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-3 py-3 text-sm font-bold transition sm:px-4 {item.match($page.url.pathname) ? 'bg-primary-600 text-white shadow-sm' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}"
              aria-current={item.match($page.url.pathname) ? 'page' : undefined}
              href={item.href}><svelte:component this={item.icon} size={20} />{item.label}</a
            >
          {/each}
        </nav>
        <nav class="flex items-center gap-2" aria-label="Account">
          {#each accountNav as item}
            <a class="btn-secondary touch-target p-3 {item.match($page.url.pathname) ? '!border-primary-600 !bg-primary-600 !text-white' : ''}" href={item.href} aria-label={item.label} title={item.label} aria-current={item.match($page.url.pathname) ? 'page' : undefined}>
              <svelte:component this={item.icon} size={20} />
            </a>
          {/each}
        </nav>
      </div>
    </header>
    {#if subNav.length}
      <nav class="border-b border-gray-200 bg-white/70 dark:border-gray-800 dark:bg-gray-950/70" aria-label={inHealth ? 'Health' : inInsights ? 'Insights' : 'Training'}>
        <div class="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 py-2">
          {#each subNav as item}
            <a
              class="whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition {isActive($page.url.pathname, item.href) ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'}"
              aria-current={isActive($page.url.pathname, item.href) ? 'page' : undefined}
              href={item.href}>{item.label}</a
            >
          {/each}
        </div>
      </nav>
    {/if}
    <main class="mx-auto max-w-4xl px-4 py-5 pb-28 sm:py-8 lg:pb-8">
      {#if $aiAvailability.error}
        <div role="alert" class="card mb-4 space-y-2 text-red-700 dark:text-red-300">
          <p>Could not check AI planner availability: {$aiAvailability.error}</p>
          <button type="button" class="btn-secondary" on:click={loadAIAvailability}>Try again</button>
        </div>
      {/if}
      {#key $currentUser?.id}
        {#if $page.url.pathname.startsWith('/planner') && !$aiAvailability.enabled}
          <div class="card space-y-3">
            {#if $aiAvailability.loading || $aiAvailability.user !== $currentUser?.id}
              <p>Loading AI settings...</p>
            {:else if $aiAvailability.error}
              <p>The AI planner is unavailable until its settings can be checked.</p>
            {:else}
              <h2 class="text-xl font-bold">AI planner not configured</h2>
              <p>Add your own API key before using the AI planner.</p>
              <a class="btn-primary" href="/settings">Go to Settings</a>
            {/if}
          </div>
        {:else}
          <slot />
        {/if}
      {/key}
    </main>
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 lg:hidden" aria-label="Quick menu">
      <div class="mx-auto grid max-w-4xl grid-cols-3">
        {#each nav as tab}
          <a href={tab.href} class="flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-bold {tab.match($page.url.pathname) ? 'text-overload-signal' : 'text-gray-600 dark:text-gray-300'}" aria-current={tab.match($page.url.pathname) ? 'page' : undefined}>
            <svelte:component this={tab.icon} size={22} strokeWidth={2.25} />
            {tab.label}
          </a>
        {/each}
      </div>
    </nav>
  </div>
{/if}
