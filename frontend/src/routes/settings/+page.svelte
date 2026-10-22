<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, KeyRound, RefreshCw, Save } from '@lucide/svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { setAIAvailability } from '$lib/stores/ai';
  import { connectStrava, currentUserId, disconnectStrava, getAISettings, getCalendarFeed, resetCalendarFeed, getStravaConfig, getStravaStatus, saveAISettings, saveStravaConfig, syncStrava } from '$lib/pocketbase';
  import { isAdmin, loadUserRoles } from '$lib/stores/role';
  import type { StravaConfigStatus, StravaStatus, StravaSyncCounts } from '$lib/types';

  const defaultEndpoint = 'https://api.openai.com/v1';
  let endpoint = defaultEndpoint;
  let model = 'gpt-4o-mini';
  let apiKey = '';
  let keyConfigured = false;
  let loading = true;
  let saving = false;
  let error = '';
  let success = '';

  let strava: StravaStatus | null = null;
  let stravaBusy = false;
  let stravaError = '';
  let stravaMessage = '';
  let stravaConfig: StravaConfigStatus | null = null;
  let stravaClientId = '';
  let stravaClientSecret = '';
  let stravaConfigBusy = false;
  let stravaConfigError = '';
  let stravaConfigMessage = '';

  const describeSync = (counts: StravaSyncCounts) =>
    `Gesynchroniseerd: ${counts.created} nieuw, ${counts.linked} gekoppeld aan een geplande training, ${counts.updated} bijgewerkt.`;

  const loadStrava = async () => {
    try {
      strava = await getStravaStatus();
      const code = $page.url.searchParams.get('code');
      if (code && $page.url.searchParams.get('scope')?.includes('activity:read')) {
        stravaBusy = true;
        await goto('/settings', { replaceState: true });
        const result = await connectStrava(code);
        strava = await getStravaStatus();
        stravaMessage = `Strava gekoppeld. ${describeSync(result.counts)}`;
      } else if (code) {
        await goto('/settings', { replaceState: true });
        stravaError = 'Geef toegang tot je activiteiten om Strava te koppelen.';
      }
    } catch (err) {
      stravaError = err instanceof Error ? err.message : 'Strava kon niet worden geladen.';
    } finally {
      stravaBusy = false;
    }
  };

  const startStravaAuth = () => {
    if (!strava) return;
    const params = new URLSearchParams({
      client_id: strava.client_id,
      redirect_uri: `${window.location.origin}/settings`,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'read,activity:read_all'
    });
    window.location.href = `https://www.strava.com/oauth/authorize?${params}`;
  };

  const loadStravaConfig = async () => {
    try {
      await loadUserRoles();
      if (!$isAdmin) return;
      const config = await getStravaConfig();
      stravaConfig = config;
      stravaClientId = config.client_id;
    } catch (err) {
      stravaConfigError = err instanceof Error ? err.message : 'Strava-configuratie kon niet worden geladen.';
    }
  };

  const saveStravaConfiguration = async () => {
    stravaConfigBusy = true;
    stravaConfigError = '';
    stravaConfigMessage = '';
    try {
      const savedConfig = await saveStravaConfig({
        client_id: stravaClientId,
        ...(stravaClientSecret ? { client_secret: stravaClientSecret } : {})
      });
      stravaConfig = savedConfig;
      stravaClientId = savedConfig.client_id;
      stravaClientSecret = '';
      strava = await getStravaStatus();
      stravaConfigMessage = 'Strava-integratie opgeslagen. De Client Secret wordt niet teruggestuurd naar de browser.';
    } catch (err) {
      stravaConfigError = err instanceof Error ? err.message : 'Strava-configuratie kon niet worden opgeslagen.';
    } finally {
      stravaConfigBusy = false;
    }
  };

  let calendarUrl = '';
  let calendarError = '';
  let calendarMessage = '';

  const loadCalendar = async () => {
    try {
      calendarUrl = (await getCalendarFeed()).url;
    } catch (err) {
      calendarError = err instanceof Error ? err.message : 'Agenda-link kon niet worden geladen.';
    }
  };

  const copyCalendar = async () => {
    await navigator.clipboard.writeText(calendarUrl);
    calendarMessage = 'Link gekopieerd.';
  };

  const resetCalendar = async () => {
    if (!confirm('Nieuwe agenda-link aanmaken? De oude link werkt dan niet meer.')) return;
    try {
      calendarUrl = (await resetCalendarFeed()).url;
      calendarMessage = 'Nieuwe link aangemaakt. Abonneer je agenda opnieuw.';
    } catch (err) {
      calendarError = err instanceof Error ? err.message : 'Link vernieuwen mislukt.';
    }
  };

  const runStravaSync = async () => {
    stravaBusy = true;
    stravaError = '';
    stravaMessage = '';
    try {
      const result = await syncStrava();
      strava = await getStravaStatus();
      stravaMessage = describeSync(result.counts);
    } catch (err) {
      stravaError = err instanceof Error ? err.message : 'Synchroniseren mislukt.';
    } finally {
      stravaBusy = false;
    }
  };

  const stopStrava = async () => {
    if (!confirm('Strava ontkoppelen? Al geïmporteerde hardlooptrainingen blijven bewaard.')) return;
    stravaBusy = true;
    try {
      await disconnectStrava();
      strava = await getStravaStatus();
      stravaMessage = 'Strava ontkoppeld.';
    } catch (err) {
      stravaError = err instanceof Error ? err.message : 'Ontkoppelen mislukt.';
    } finally {
      stravaBusy = false;
    }
  };

  onMount(async () => {
    const user = currentUserId();
    loadStrava();
    loadStravaConfig();
    loadCalendar();
    try {
      const settings = await getAISettings();
      setAIAvailability(settings?.api_key_set === true, user);
      if (settings) {
        endpoint = settings.endpoint || defaultEndpoint;
        model = settings.model || model;
        keyConfigured = settings.api_key_set;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'AI-instellingen konden niet worden geladen.';
    } finally {
      loading = false;
    }
  });

  const save = async () => {
    const user = currentUserId();
    saving = true;
    error = '';
    success = '';
    try {
      const saved = await saveAISettings({ endpoint, model, api_key: apiKey });
      keyConfigured = saved.api_key_set;
      setAIAvailability(saved.api_key_set, user);
      apiKey = '';
      success = 'AI-instellingen opgeslagen. De API-sleutel wordt niet teruggestuurd naar de browser.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'AI-instellingen konden niet worden opgeslagen.';
    } finally {
      saving = false;
    }
  };
</script>

<svelte:head>
  <title>Instellingen · T.O.P. Trainer</title>
</svelte:head>

<div class="space-y-5">
  <a href="/" class="inline-flex min-h-12 items-center gap-2 font-semibold text-gray-600 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300">
    <ArrowLeft size={18} /> Terug naar tijdlijn
  </a>
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Persoonlijke configuratie</p>
    <h2 class="mt-1 text-3xl font-black">Instellingen</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Koppel je eigen OpenAI-compatibele API om trainingsperiodes te laten plannen.</p>
  </div>

  <section class="card space-y-3">
    <h3 class="text-xl font-bold">Strava</h3>
    {#if !strava}
      <p class="animate-pulse text-gray-600 dark:text-gray-300">Strava laden...</p>
    {:else if !strava.configured}
      <p class="text-gray-600 dark:text-gray-300">De beheerder moet de Strava-integratie instellen voordat je je account kunt koppelen.</p>
    {:else if strava.connected}
      <p class="text-gray-600 dark:text-gray-300">
        Gekoppeld{#if strava.athlete_name} als <strong>{strava.athlete_name}</strong>{/if}. Hardloopactiviteiten worden automatisch geïmporteerd en gekoppeld aan een geplande hardlooptraining van dezelfde dag.
        {#if strava.last_synced_at}Laatst gesynchroniseerd: {new Date(strava.last_synced_at.replace(' ', 'T')).toLocaleString('nl-NL')}.{/if}
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" type="button" disabled={stravaBusy} on:click={runStravaSync}><RefreshCw size={18} /> {stravaBusy ? 'Bezig...' : 'Nu synchroniseren'}</button>
        <button class="btn-secondary" type="button" disabled={stravaBusy} on:click={stopStrava}>Ontkoppelen</button>
      </div>
    {:else}
      <p class="text-gray-600 dark:text-gray-300">Koppel Strava om je hardloopactiviteiten automatisch te importeren.</p>
      <button class="btn-primary" type="button" disabled={stravaBusy} on:click={startStravaAuth}>{stravaBusy ? 'Bezig...' : 'Koppel met Strava'}</button>
    {/if}
    {#if stravaError}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{stravaError}</p>{/if}
    {#if stravaMessage}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{stravaMessage}</p>{/if}
  </section>

  {#if $isAdmin}
    <section class="card space-y-3">
      <h3 class="text-xl font-bold">Strava-integratie beheren</h3>
      <p class="text-gray-600 dark:text-gray-300">Deze app-brede configuratie wordt door alle gebruikers gedeeld. Strava-toegang en geïmporteerde trainingen blijven per gebruiker gescheiden.</p>
      {#if !stravaConfig}
        <p class="animate-pulse text-gray-600 dark:text-gray-300">Configuratie laden...</p>
      {:else}
        <form class="space-y-3" on:submit|preventDefault={saveStravaConfiguration}>
          <div>
            <label class="label" for="strava-client-id">Strava Client ID</label>
            <input id="strava-client-id" class="input" bind:value={stravaClientId} required maxlength="100" />
          </div>
          <div>
            <label class="label" for="strava-client-secret">Strava Client Secret {#if stravaConfig.client_secret_set}<span class="font-normal text-green-700 dark:text-green-300">· ingesteld</span>{/if}</label>
            <input id="strava-client-secret" class="input" type="password" bind:value={stravaClientSecret} autocomplete="new-password" required={!stravaConfig.client_secret_set} placeholder={stravaConfig.client_secret_set ? 'Laat leeg om de huidige secret te behouden' : 'Vul je Strava Client Secret in'} />
          </div>
          {#if stravaConfigError}<p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{stravaConfigError}</p>{/if}
          {#if stravaConfigMessage}<p role="status" class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{stravaConfigMessage}</p>{/if}
          <button class="btn-primary" type="submit" disabled={stravaConfigBusy}><Save size={18} /> {stravaConfigBusy ? 'Opslaan...' : 'Strava-configuratie opslaan'}</button>
        </form>
      {/if}
    </section>
  {/if}

  <section class="card space-y-3">
    <h3 class="text-xl font-bold">Agenda (iCal)</h3>
    <p class="text-gray-600 dark:text-gray-300">Abonneer je agenda-app (Apple, Google, Outlook) op deze link. Elke training verschijnt als afspraak met een directe link om te starten. Deel de link niet: wie hem heeft, kan je tijdlijn zien.</p>
    {#if calendarUrl}
      <input class="input" readonly value={calendarUrl} on:focus={(e) => e.currentTarget.select()} aria-label="iCal-link" />
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" type="button" on:click={copyCalendar}>Kopieer link</button>
        <a class="btn-secondary" href={calendarUrl.replace(/^https?:/, 'webcal:')}>Abonneren</a>
        <button class="btn-secondary" type="button" aria-label="Nieuwe agenda-link" on:click={resetCalendar}>Nieuw</button>
      </div>
    {/if}
    {#if calendarError}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{calendarError}</p>{/if}
    {#if calendarMessage}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{calendarMessage}</p>{/if}
  </section>

  {#if loading}
    <div class="card animate-pulse">Instellingen laden...</div>
  {:else}
    <form class="card space-y-5" on:submit|preventDefault={save}>
      <div class="flex items-start gap-3 rounded-xl bg-primary-50 p-4 text-sm text-primary-900 dark:bg-primary-950 dark:text-primary-100">
        <KeyRound class="mt-0.5 shrink-0" size={20} />
        <p>Je API-sleutel wordt bij jouw account in PocketBase opgeslagen als verborgen veld. De sleutel blijft op de server en wordt niet aan de frontend teruggegeven. Stel je API-limieten in bij je provider.</p>
      </div>

      <div>
        <label class="label" for="endpoint">API-endpoint</label>
        <input id="endpoint" class="input" type="url" bind:value={endpoint} placeholder="https://api.openai.com/v1" required />
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">OpenAI-compatible chat completions. Gebruik HTTPS, of localhost voor een lokale modelserver.</p>
      </div>

      <div>
        <label class="label" for="model">Modelnaam</label>
        <input id="model" class="input" bind:value={model} placeholder="gpt-4o-mini" required />
      </div>

      <div>
        <label class="label" for="api-key">API-sleutel {#if keyConfigured}<span class="font-normal text-green-700 dark:text-green-300">· sleutel ingesteld</span>{/if}</label>
        <input
          id="api-key"
          class="input"
          type="password"
          bind:value={apiKey}
          autocomplete="new-password"
          placeholder={keyConfigured ? 'Laat leeg om de huidige sleutel te behouden' : 'Plak je provider API-sleutel'}
          required={!keyConfigured}
        />
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">Vul alleen iets in wanneer je de sleutel toevoegt of vervangt. De eerder opgeslagen sleutel wordt nooit getoond.</p>
      </div>

      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      {#if success}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}

      <button class="btn-primary w-full" type="submit" disabled={saving}>
        <Save size={18} /> {saving ? 'Opslaan...' : 'Instellingen opslaan'}
      </button>
    </form>
  {/if}
</div>
