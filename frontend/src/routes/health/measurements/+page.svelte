<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus } from '@lucide/svelte';
  import { createBodyMeasurement, deleteBodyMeasurement, getBodyMeasurements, getMyProfile } from '$lib/pocketbase';
  import { calculateBMI, measurementDateLabel } from '$lib/measurements';
  import { toDateKey } from '$lib/health';
  import type { BodyMeasurement } from '$lib/types';

  let measurements: BodyMeasurement[] = [];
  let loading = true;
  let saving = false;
  let deleting = '';
  let error = '';
  let showForm = false;
  let measuredAt = toDateKey(new Date());
  let weight: number | undefined;
  let height: number | undefined;
  let waist: number | undefined;
  $: bmi = calculateBMI(weight ?? 0, height ?? 0);

  onMount(async () => {
    try {
      const [entries, profile] = await Promise.all([getBodyMeasurements(), getMyProfile()]);
      measurements = entries;
      height = entries[0]?.height_cm || profile?.height_cm || undefined;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Metingen konden niet worden geladen.';
    } finally {
      loading = false;
    }
  });

  const save = async () => {
    saving = true;
    error = '';
    try {
      if (!weight || !height || !measuredAt || measuredAt > toDateKey(new Date())) {
        throw new Error('Vul een geldige datum, gewicht en lengte in. De datum mag niet in de toekomst liggen.');
      }
      const entry = await createBodyMeasurement({
        measured_at: `${measuredAt} 12:00:00.000Z`, weight_kg: weight, height_cm: height, waist_cm: waist ?? 0
      });
      measurements = [entry, ...measurements].sort((a, b) =>
        b.measured_at.localeCompare(a.measured_at) || (b.created ?? '').localeCompare(a.created ?? ''));
      weight = undefined;
      waist = undefined;
      showForm = false;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Meting opslaan mislukt.';
    } finally {
      saving = false;
    }
  };

  const remove = async (entry: BodyMeasurement) => {
    if (!window.confirm('Deze meting definitief verwijderen?')) return;
    deleting = entry.id;
    error = '';
    try {
      await deleteBodyMeasurement(entry.id);
      measurements = measurements.filter((item) => item.id !== entry.id);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Meting verwijderen mislukt.';
    } finally {
      deleting = '';
    }
  };
</script>

<svelte:head><title>Metingen · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div class="flex items-start justify-between gap-3">
    <div>
      <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Health</p>
      <h2 class="mt-1 text-3xl font-black">Metingen</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">Volg je gewicht, BMI en taille. Je metingen zijn alleen voor jou zichtbaar.</p>
    </div>
    <button type="button" class="btn-primary shrink-0" disabled={loading || saving} on:click={() => (showForm = !showForm)}><Plus size={18} /> Nieuw</button>
  </div>
  {#if error}<p role="alert" class="card text-red-700 dark:text-red-300">{error}</p>{/if}
  {#if loading}
    <div class="card">Metingen laden...</div>
  {:else}
    {#if showForm}
      <form class="card space-y-4" on:submit|preventDefault={save}>
        <h3 class="text-xl font-bold">Nieuwe meting</h3>
        <p class="text-sm text-gray-600 dark:text-gray-300">Lengte wordt per meting bewaard, zodat historische BMI's niet veranderen.</p>
        <fieldset disabled={saving} class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="measured-at">Datum</label><input class="input" id="measured-at" type="date" required max={toDateKey(new Date())} bind:value={measuredAt} /></div>
          <div><label class="label" for="weight">Gewicht (kg)</label><input class="input" id="weight" type="number" required min="1" max="700" step="0.1" bind:value={weight} /></div>
          <div><label class="label" for="height">Lengte bij meting (cm)</label><input class="input" id="height" type="number" required min="30" max="300" step="0.1" bind:value={height} /></div>
          <div><label class="label" for="waist">Tailleomtrek (cm, optioneel)</label><input class="input" id="waist" type="number" min="1" max="400" step="0.1" bind:value={waist} /></div>
          <p class="self-center font-semibold">BMI: {bmi ?? '—'}</p>
          <div class="flex flex-wrap gap-2">
            <button class="btn-primary" type="submit">{saving ? 'Opslaan...' : 'Opslaan'}</button>
            <button class="btn-secondary" type="button" on:click={() => (showForm = false)}>Annuleren</button>
          </div>
        </fieldset>
      </form>
    {/if}
    <section class="card space-y-3">
      <div class="flex items-center justify-between gap-3"><h3 class="text-xl font-bold">Meetgeschiedenis</h3><a class="font-bold text-overload-signal" href="/stats">Insights</a></div>
      {#if !measurements.length}
        <p>Nog geen metingen. Voeg je eerste meting toe met Nieuw.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead><tr><th class="py-2">Datum</th><th>Gewicht</th><th>Lengte</th><th>BMI</th><th>Taille</th><th><span class="sr-only">Acties</span></th></tr></thead>
            <tbody>
              {#each measurements as entry (entry.id)}
                <tr class="border-t border-gray-200 dark:border-gray-700">
                  <td class="py-2">{measurementDateLabel(entry.measured_at)}</td><td>{entry.weight_kg} kg</td><td>{entry.height_cm} cm</td>
                  <td>{calculateBMI(entry.weight_kg, entry.height_cm) ?? '—'}</td><td>{entry.waist_cm ? `${entry.waist_cm} cm` : '—'}</td>
                  <td><button class="btn-secondary" type="button" disabled={!!deleting || saving} aria-label={`Meting van ${entry.measured_at.slice(0, 10)} verwijderen`} on:click={() => remove(entry)}>{deleting === entry.id ? 'Verwijderen...' : 'Verwijderen'}</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
      <p class="text-sm text-gray-600 dark:text-gray-300">BMI is een grove indicatie en geen diagnose; het houdt geen rekening met bijvoorbeeld spiermassa, zwangerschap of leeftijd.</p>
    </section>
  {/if}
</div>
