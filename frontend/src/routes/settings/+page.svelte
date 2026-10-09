<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, KeyRound, Save } from '@lucide/svelte';
  import { getAISettings, saveAISettings } from '$lib/pocketbase';

  const defaultEndpoint = 'https://api.openai.com/v1';
  let endpoint = defaultEndpoint;
  let model = 'gpt-4o-mini';
  let apiKey = '';
  let keyConfigured = false;
  let loading = true;
  let saving = false;
  let error = '';
  let success = '';

  onMount(async () => {
    try {
      const settings = await getAISettings();
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
    saving = true;
    error = '';
    success = '';
    try {
      const saved = await saveAISettings({ endpoint, model, api_key: apiKey });
      keyConfigured = saved.api_key_set;
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
    <h2 class="mt-1 text-3xl font-black">AI-instellingen</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Koppel je eigen OpenAI-compatibele API om trainingsperiodes te laten plannen.</p>
  </div>

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
