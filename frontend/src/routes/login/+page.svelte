<script lang="ts">
  import { goto } from '$app/navigation';
  import { Dumbbell } from '@lucide/svelte';
  import { isAuthenticated } from '$lib/stores/auth';
  import { loginWithGoogle, loginWithPassword, registerWithPassword } from '$lib/pocketbase';

  let email = '';
  let password = '';
  let displayName = '';
  let registering = false;
  let loading = false;
  let error = '';

  $: if ($isAuthenticated) goto('/');

  const submit = async () => {
    loading = true;
    error = '';
    try {
      if (registering) await registerWithPassword(email, password, displayName);
      else await loginWithPassword(email, password);
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Aanmelden is niet gelukt.';
    } finally {
      loading = false;
    }
  };

  const googleLogin = async () => {
    loading = true;
    error = '';
    try {
      await loginWithGoogle();
      await goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Google-aanmelden is niet gelukt.';
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head><title>Aanmelden · T.O.P. Trainer</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8 dark:bg-gray-950">
  <div class="w-full max-w-md">
    <div class="mb-6 text-center">
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-overload-signal text-white"><Dumbbell size={30} /></div>
      <p class="mt-4 text-sm font-black uppercase tracking-[0.25em] text-overload-signal">T.O.P. Trainer</p>
      <h1 class="mt-2 text-3xl font-black">{registering ? 'Account aanmaken' : 'Welkom terug'}</h1>
      <p class="mt-2 text-gray-600 dark:text-gray-300">Houd al je trainingen bij op één plek.</p>
    </div>
    <form class="card space-y-4" on:submit|preventDefault={submit}>
      {#if registering}
        <div>
          <label class="label" for="displayName">Naam</label>
          <input id="displayName" class="input" bind:value={displayName} autocomplete="name" required />
        </div>
      {/if}
      <div>
        <label class="label" for="email">E-mailadres</label>
        <input id="email" class="input" type="email" bind:value={email} autocomplete="email" required />
      </div>
      <div>
        <label class="label" for="password">Wachtwoord</label>
        <input id="password" class="input" type="password" bind:value={password} autocomplete={registering ? 'new-password' : 'current-password'} minlength="8" required />
      </div>
      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      <button class="btn-primary w-full" type="submit" disabled={loading}>{loading ? 'Even geduld...' : registering ? 'Account aanmaken' : 'Inloggen'}</button>
      <div class="relative py-1 text-center text-xs text-gray-500"><span class="relative z-10 bg-white px-2 dark:bg-gray-900">of</span><span class="absolute inset-x-0 top-1/2 border-t border-gray-200 dark:border-gray-700"></span></div>
      <button class="btn-secondary w-full" type="button" on:click={googleLogin} disabled={loading}>Verder met Google</button>
      <button class="touch-target w-full text-sm font-semibold text-primary-700 dark:text-primary-300" type="button" on:click={() => (registering = !registering)}>
        {registering ? 'Ik heb al een account' : 'Nieuw? Maak een account aan'}
      </button>
    </form>
  </div>
</main>
