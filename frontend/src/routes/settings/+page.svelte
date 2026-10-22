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
    `Synced: ${counts.created} new, ${counts.linked} linked to a planned workout, ${counts.updated} updated.`;

  const loadStrava = async () => {
    try {
      strava = await getStravaStatus();
      const code = $page.url.searchParams.get('code');
      if (code && $page.url.searchParams.get('scope')?.includes('activity:read')) {
        stravaBusy = true;
        await goto('/settings', { replaceState: true });
        const result = await connectStrava(code);
        strava = await getStravaStatus();
        stravaMessage = `Strava connected. ${describeSync(result.counts)}`;
      } else if (code) {
        await goto('/settings', { replaceState: true });
        stravaError = 'Grant access to your activities to connect Strava.';
      }
    } catch (err) {
      stravaError = err instanceof Error ? err.message : 'Strava could not be loaded.';
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
      stravaConfigError = err instanceof Error ? err.message : 'Strava settings could not be loaded.';
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
      stravaConfigMessage = 'Strava integration saved. The client secret is never sent back to the browser.';
    } catch (err) {
      stravaConfigError = err instanceof Error ? err.message : 'Strava settings could not be saved.';
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
      calendarError = err instanceof Error ? err.message : 'Calendar link could not be loaded.';
    }
  };

  const copyCalendar = async () => {
    await navigator.clipboard.writeText(calendarUrl);
    calendarMessage = 'Link copied.';
  };

  const resetCalendar = async () => {
    if (!confirm('Create a new calendar link? The old link will stop working.')) return;
    try {
      calendarUrl = (await resetCalendarFeed()).url;
      calendarMessage = 'New link created. Subscribe to your calendar again.';
    } catch (err) {
      calendarError = err instanceof Error ? err.message : 'Could not refresh link.';
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
      stravaError = err instanceof Error ? err.message : 'Sync failed.';
    } finally {
      stravaBusy = false;
    }
  };

  const stopStrava = async () => {
    if (!confirm('Disconnect Strava? Previously imported running workouts will be kept.')) return;
    stravaBusy = true;
    try {
      await disconnectStrava();
      strava = await getStravaStatus();
      stravaMessage = 'Strava disconnected.';
    } catch (err) {
      stravaError = err instanceof Error ? err.message : 'Could not disconnect Strava.';
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
      error = err instanceof Error ? err.message : 'AI settings could not be loaded.';
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
      success = 'AI settings saved. The API key is never sent back to the browser.';
    } catch (err) {
      error = err instanceof Error ? err.message : 'AI settings could not be saved.';
    } finally {
      saving = false;
    }
  };
</script>

<svelte:head>
  <title>Settings · T.O.P. Trainer</title>
</svelte:head>

<div class="space-y-5">
  <a href="/" class="inline-flex min-h-12 items-center gap-2 font-semibold text-gray-600 hover:text-primary-700 dark:text-gray-300 dark:hover:text-primary-300">
    <ArrowLeft size={18} /> Back to timeline
  </a>
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Personal configuration</p>
    <h2 class="mt-1 text-3xl font-black">Settings</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Connect your own OpenAI-compatible API to generate training plans.</p>
  </div>

  <section class="card space-y-3">
    <h3 class="text-xl font-bold">Strava</h3>
    {#if !strava}
      <p class="animate-pulse text-gray-600 dark:text-gray-300">Loading Strava...</p>
    {:else if !strava.configured}
      <p class="text-gray-600 dark:text-gray-300">An administrator must configure the Strava integration before you can connect your account.</p>
    {:else if strava.connected}
      <p class="text-gray-600 dark:text-gray-300">
        Connected{#if strava.athlete_name} as <strong>{strava.athlete_name}</strong>{/if}. Running activities are imported automatically and linked to a planned running workout on the same day.
        {#if strava.last_synced_at}Last synced: {new Date(strava.last_synced_at.replace(' ', 'T')).toLocaleString('en-US')}.{/if}
      </p>
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" type="button" disabled={stravaBusy} on:click={runStravaSync}><RefreshCw size={18} /> {stravaBusy ? 'Working...' : 'Sync now'}</button>
        <button class="btn-secondary" type="button" disabled={stravaBusy} on:click={stopStrava}>Disconnect</button>
      </div>
    {:else}
      <p class="text-gray-600 dark:text-gray-300">Connect Strava to import your running activities automatically.</p>
      <button class="btn-primary" type="button" disabled={stravaBusy} on:click={startStravaAuth}>{stravaBusy ? 'Working...' : 'Connect to Strava'}</button>
    {/if}
    {#if stravaError}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{stravaError}</p>{/if}
    {#if stravaMessage}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{stravaMessage}</p>{/if}
  </section>

  {#if $isAdmin}
    <section class="card space-y-3">
      <h3 class="text-xl font-bold">Manage Strava integration</h3>
      <p class="text-gray-600 dark:text-gray-300">This app-wide configuration is shared by all users. Strava access and imported workouts remain separate for each user.</p>
      {#if !stravaConfig}
        <p class="animate-pulse text-gray-600 dark:text-gray-300">Loading configuration...</p>
      {:else}
        <form class="space-y-3" on:submit|preventDefault={saveStravaConfiguration}>
          <div>
            <label class="label" for="strava-client-id">Strava Client ID</label>
            <input id="strava-client-id" class="input" bind:value={stravaClientId} required maxlength="100" />
          </div>
          <div>
            <label class="label" for="strava-client-secret">Strava client secret {#if stravaConfig.client_secret_set}<span class="font-normal text-green-700 dark:text-green-300">· configured</span>{/if}</label>
            <input id="strava-client-secret" class="input" type="password" bind:value={stravaClientSecret} autocomplete="new-password" required={!stravaConfig.client_secret_set} placeholder={stravaConfig.client_secret_set ? 'Leave blank to keep the current secret' : 'Enter your Strava client secret'} />
          </div>
          {#if stravaConfigError}<p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{stravaConfigError}</p>{/if}
          {#if stravaConfigMessage}<p role="status" class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{stravaConfigMessage}</p>{/if}
          <button class="btn-primary" type="submit" disabled={stravaConfigBusy}><Save size={18} /> {stravaConfigBusy ? 'Saving...' : 'Save Strava settings'}</button>
        </form>
      {/if}
    </section>
  {/if}

  <section class="card space-y-3">
    <h3 class="text-xl font-bold">Calendar (iCal)</h3>
    <p class="text-gray-600 dark:text-gray-300">Subscribe to this link in your calendar app (Apple, Google, Outlook). Each workout appears as an event with a direct link to start it. Do not share the link: anyone with it can view your timeline.</p>
    {#if calendarUrl}
      <input class="input" readonly value={calendarUrl} on:focus={(e) => e.currentTarget.select()} aria-label="iCal-link" />
      <div class="flex flex-wrap gap-2">
        <button class="btn-primary" type="button" on:click={copyCalendar}>Copy link</button>
        <a class="btn-secondary" href={calendarUrl.replace(/^https?:/, 'webcal:')}>Subscribe</a>
        <button class="btn-secondary" type="button" aria-label="New calendar link" on:click={resetCalendar}>New</button>
      </div>
    {/if}
    {#if calendarError}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{calendarError}</p>{/if}
    {#if calendarMessage}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{calendarMessage}</p>{/if}
  </section>

  {#if loading}
    <div class="card animate-pulse">Loading settings...</div>
  {:else}
    <form class="card space-y-5" on:submit|preventDefault={save}>
      <div class="flex items-start gap-3 rounded-xl bg-primary-50 p-4 text-sm text-primary-900 dark:bg-primary-950 dark:text-primary-100">
        <KeyRound class="mt-0.5 shrink-0" size={20} />
        <p>Your API key is stored as a hidden field in your PocketBase account. It stays on the server and is never returned to the frontend. Set API usage limits with your provider.</p>
      </div>

      <div>
        <label class="label" for="endpoint">API-endpoint</label>
        <input id="endpoint" class="input" type="url" bind:value={endpoint} placeholder="https://api.openai.com/v1" required />
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">OpenAI-compatible chat completions. Use HTTPS, or localhost for a local model server.</p>
      </div>

      <div>
        <label class="label" for="model">Model name</label>
        <input id="model" class="input" bind:value={model} placeholder="gpt-4o-mini" required />
      </div>

      <div>
        <label class="label" for="api-key">API key {#if keyConfigured}<span class="font-normal text-green-700 dark:text-green-300">· configured</span>{/if}</label>
        <input
          id="api-key"
          class="input"
          type="password"
          bind:value={apiKey}
          autocomplete="new-password"
          placeholder={keyConfigured ? 'Leave blank to keep the current key' : 'Paste your provider API key'}
          required={!keyConfigured}
        />
        <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">Only enter a key when adding or replacing it. The previously saved key is never shown.</p>
      </div>

      {#if error}<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>{/if}
      {#if success}<p class="rounded-xl bg-green-50 p-3 text-sm text-green-800 dark:bg-green-950 dark:text-green-200">{success}</p>{/if}

      <button class="btn-primary w-full" type="submit" disabled={saving}>
        <Save size={18} /> {saving ? 'Saving...' : 'Save settings'}
      </button>
    </form>
  {/if}
</div>
