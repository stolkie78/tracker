<script lang="ts">
  import '../app.css';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { CalendarDays, ChartNoAxesColumn, Dumbbell, LogOut, Menu, Moon, Plus, Sparkles, Sun, X } from '@lucide/svelte';
  import { isAuthenticated } from '$lib/stores/auth';
  import { loadUserRoles, rolesLoaded, clearUserRoles } from '$lib/stores/role';
  import { logout } from '$lib/pocketbase';

  let menuOpen = false;
  let dark = true;
  let roleLoadError = '';

  const nav = [
    { href: '/', label: 'Tijdlijn' },
    { href: '/workouts/new', label: 'Training toevoegen' },
    { href: '/stats', label: 'Statistieken' },
    { href: '/planner', label: 'AI-planner' },
    { href: '/settings', label: 'Instellingen' }
  ];

  const tabs = [
    { href: '/', label: 'Tijdlijn', icon: CalendarDays },
    { href: '/workouts/new', label: 'Nieuw', icon: Plus },
    { href: '/stats', label: 'Stats', icon: ChartNoAxesColumn },
    { href: '/planner', label: 'Planner', icon: Sparkles }
  ];
  const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path.startsWith(href));

  $: isLogin = $page.url.pathname === '/login';

  $: if (browser && !$isAuthenticated && !isLogin) {
    goto('/login');
  }

  $: if (browser && $isAuthenticated && !isLogin && !$rolesLoaded) {
    roleLoadError = '';
    loadUserRoles().catch((error) => {
      roleLoadError = error instanceof Error ? error.message : 'Je profiel kon niet worden geladen.';
    });
  }

  $: if (browser) {
    document.documentElement.classList.toggle('dark', dark);
  }

  const signOut = () => {
    logout();
    clearUserRoles();
    goto('/login');
  };

  const retryRoleLoad = async () => {
    roleLoadError = '';
    try {
      await loadUserRoles();
    } catch (error) {
      roleLoadError = error instanceof Error ? error.message : 'Je profiel kon niet worden geladen.';
    }
  };
</script>

<svelte:head>
  <meta name="description" content="Houd je trainingen bij en zie je voortgang in één overzicht." />
  <link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

{#if isLogin}
  <slot />
{:else if !$isAuthenticated}
  <main class="mx-auto max-w-lg px-4 py-16 text-center">
    <div class="card">Je wordt doorgestuurd naar aanmelden...</div>
  </main>
{:else if !$rolesLoaded}
  <main class="mx-auto max-w-lg px-4 py-16 text-center">
    <div class="card">
      {#if roleLoadError}
        <p class="font-semibold text-red-700 dark:text-red-300">Profiel laden mislukt: {roleLoadError}</p>
        <button class="btn-secondary mt-4" on:click={retryRoleLoad}>Opnieuw proberen</button>
      {:else}
        Je profiel wordt geladen...
      {/if}
    </div>
  </main>
{:else}
  <div class="min-h-screen">
    <header class="sticky top-0 z-40 border-b border-gray-200/70 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-950/90">
      <div class="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <a href="/" class="flex items-center gap-3" aria-label="T.O.P. Trainer startpagina">
          <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-overload-signal text-white">
            <Dumbbell size={22} />
          </div>
          <div>
            <p class="text-xs font-black uppercase tracking-[0.25em] text-overload-signal">T.O.P.</p>
            <h1 class="text-lg font-black">Trainer</h1>
          </div>
        </a>
        <nav class="hidden items-center gap-1 lg:flex" aria-label="Hoofdmenu">
          {#each nav as item}
            <a
              class="whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition {isActive($page.url.pathname, item.href) ? 'bg-primary-600 text-white' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'}"
              aria-current={isActive($page.url.pathname, item.href) ? 'page' : undefined}
              href={item.href}>{item.label}</a
            >
          {/each}
        </nav>
        <div class="flex items-center gap-2">
          <button class="btn-secondary touch-target p-3" aria-label="Wissel tussen licht en donker thema" on:click={() => (dark = !dark)}>
            {#if dark}<Sun size={20} />{:else}<Moon size={20} />{/if}
          </button>
          <button class="btn-secondary touch-target hidden p-3 lg:inline-flex" aria-label="Uitloggen" title="Uitloggen" on:click={signOut}><LogOut size={20} /></button>
          <button class="btn-secondary touch-target p-3 lg:hidden" aria-label="Menu" on:click={() => (menuOpen = !menuOpen)}>
            {#if menuOpen}<X size={20} />{:else}<Menu size={20} />{/if}
          </button>
        </div>
      </div>
      {#if menuOpen}
        <div class="border-t border-gray-200 px-4 py-3 dark:border-gray-800 lg:hidden">
          <div class="mx-auto grid max-w-4xl gap-2">
            {#each nav as item}
              <a class="btn-secondary justify-start {isActive($page.url.pathname, item.href) ? '!bg-primary-600 !text-white' : ''}" href={item.href} on:click={() => (menuOpen = false)}>{item.label}</a>
            {/each}
            <button class="btn-secondary justify-start" on:click={signOut}>Uitloggen</button>
          </div>
        </div>
      {/if}
    </header>
    <main class="mx-auto max-w-4xl px-4 py-5 pb-28 sm:py-8 lg:pb-8">
      <slot />
    </main>
    <nav class="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 lg:hidden" aria-label="Snelmenu">
      <div class="mx-auto grid max-w-4xl grid-cols-4">
        {#each tabs as tab}
          <a href={tab.href} class="flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-bold {isActive($page.url.pathname, tab.href) ? 'text-overload-signal' : 'text-gray-600 dark:text-gray-300'}" aria-current={isActive($page.url.pathname, tab.href) ? 'page' : undefined}>
            <svelte:component this={tab.icon} size={22} strokeWidth={2.25} />
            {tab.label}
          </a>
        {/each}
      </div>
    </nav>
  </div>
{/if}
