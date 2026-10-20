<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { LogOut, Moon, Sun } from '@lucide/svelte';
  import { darkTheme } from '$lib/stores/theme';
  import { currentUser } from '$lib/stores/auth';
  import { clearUserRoles, profile as profileStore } from '$lib/stores/role';
  import {
    createBodyMeasurement, deleteBodyMeasurement, getBodyMeasurements,
    getOrCreateMyProfile, getProfilePhotoUrl, logout, saveMyProfile
  } from '$lib/pocketbase';
  import { calculateBMI, measurementDateLabel } from '$lib/measurements';
  import type { BodyMeasurement, Profile } from '$lib/types';

  let record: Profile | null = null;
  let measurements: BodyMeasurement[] = [];
  let loading = true;
  let saving = false;
  let savingMeasurement = false;
  let error = '';
  let measurementError = '';
  let success = '';
  let displayName = '';
  let birthDate = '';
  let phone = '';
  let bio = '';
  let height: number | undefined;
  let photoUrl = '';
  let photoInput: HTMLInputElement;
  let removePhoto = false;
  let measuredAt = localDate();
  let weight: number | undefined;
  let measurementHeight: number | undefined;
  let waist: number | undefined;
  let deleting = '';

  const signOut = () => {
    logout();
    clearUserRoles();
    goto('/login');
  };

  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  $: bmi = calculateBMI(weight ?? 0, measurementHeight ?? 0);

  onMount(async () => {
    try {
      [record, measurements] = await Promise.all([getOrCreateMyProfile(), getBodyMeasurements()]);
      displayName = record.display_name;
      birthDate = record.birth_date?.slice(0, 10) ?? '';
      phone = record.phone ?? '';
      bio = record.bio ?? '';
      height = record.height_cm || undefined;
      measurementHeight = height ?? measurements[0]?.height_cm;
      photoUrl = await getProfilePhotoUrl(record);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Je profiel kon niet worden geladen.';
    } finally {
      loading = false;
    }
  });

  const save = async () => {
    if (!record) return;
    saving = true;
    error = '';
    success = '';
    try {
      const photo = photoInput.files?.[0];
      if (photo && (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024)) {
        throw new Error('Kies een JPG-, PNG- of WebP-foto van maximaal 5 MB.');
      }
      const data = new FormData();
      data.set('display_name', displayName.trim());
      data.set('birth_date', birthDate ? `${birthDate} 12:00:00.000Z` : '');
      data.set('phone', phone.trim());
      data.set('bio', bio.trim());
      data.set('height_cm', String(height ?? 0));
      if (photo) data.set('photo', photo);
      else if (removePhoto) data.set('photo', '');
      record = await saveMyProfile(record.id, data);
      profileStore.set(record);
      success = 'Profiel opgeslagen.';
      photoInput.value = '';
      removePhoto = false;
      if (height) measurementHeight = height;
      photoUrl = await getProfilePhotoUrl(record);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Opslaan mislukt.';
    } finally {
      saving = false;
    }
  };

  const addMeasurement = async () => {
    savingMeasurement = true;
    measurementError = '';
    try {
      if (!weight || !measurementHeight || !measuredAt || measuredAt > localDate()) {
        throw new Error('Vul een geldige datum, gewicht en lengte in. De datum mag niet in de toekomst liggen.');
      }
      const entry = await createBodyMeasurement({
        measured_at: `${measuredAt} 12:00:00.000Z`,
        weight_kg: weight,
        height_cm: measurementHeight,
        waist_cm: waist ?? 0
      });
      measurements = [entry, ...measurements].sort((a, b) => b.measured_at.localeCompare(a.measured_at));
      weight = undefined;
      waist = undefined;
    } catch (err) {
      measurementError = err instanceof Error ? err.message : 'Meting opslaan mislukt.';
    } finally {
      savingMeasurement = false;
    }
  };

  const removeMeasurement = async (entry: BodyMeasurement) => {
    if (!window.confirm('Deze meting definitief verwijderen?')) return;
    deleting = entry.id;
    measurementError = '';
    try {
      await deleteBodyMeasurement(entry.id);
      measurements = measurements.filter((item) => item.id !== entry.id);
    } catch (err) {
      measurementError = err instanceof Error ? err.message : 'Meting verwijderen mislukt.';
    } finally {
      deleting = '';
    }
  };
</script>

<svelte:head><title>Mijn profiel · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <h2 class="text-3xl font-black">Mijn profiel</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Je persoonlijke gegevens, foto en metingen zijn alleen voor jou zichtbaar. Trainers hebben geen toegang.</p>
  </div>
  <section class="card space-y-3" aria-label="Weergave en account">
    <h3 class="text-xl font-bold">Weergave en account</h3>
    <div class="flex flex-wrap gap-3">
      <button type="button" class="btn-secondary gap-2" on:click={() => darkTheme.update((dark) => !dark)}>
        {#if $darkTheme}<Sun size={20} /> Licht thema{:else}<Moon size={20} /> Donker thema{/if}
      </button>
      <button type="button" class="btn-secondary gap-2" on:click={signOut}><LogOut size={20} /> Uitloggen</button>
    </div>
  </section>
  {#if error}<p role="alert" class="card text-red-700 dark:text-red-300">{error}</p>{/if}
  {#if success}<p role="status" class="card text-emerald-700 dark:text-emerald-300">{success}</p>{/if}
  {#if loading}
    <div class="card">Profiel laden...</div>
  {:else if record}
    <form class="card space-y-4" on:submit|preventDefault={save}>
      <h3 class="text-xl font-bold">Persoonlijke gegevens</h3>
      <fieldset disabled={saving} class="space-y-4">
        {#if photoUrl && !removePhoto}
          <img src={photoUrl} alt="Mijn profielfoto" class="h-28 w-28 rounded-full object-cover" on:error={() => { error = 'Je profielfoto kon niet worden geladen. Vernieuw de pagina om het opnieuw te proberen.'; }} />
        {/if}
        <div>
          <label class="label" for="photo">Profielfoto (JPG, PNG of WebP, maximaal 5 MB)</label>
          <input id="photo" class="input" type="file" accept="image/jpeg,image/png,image/webp" bind:this={photoInput} on:change={() => { removePhoto = false; }} />
          {#if record.photo}
            <label class="mt-2 flex items-center gap-2"><input type="checkbox" bind:checked={removePhoto} on:change={() => { if (removePhoto) photoInput.value = ''; }} /> Huidige foto verwijderen</label>
          {/if}
        </div>
        <div><label class="label" for="display-name">Naam</label><input class="input" id="display-name" required maxlength="200" autocomplete="name" bind:value={displayName} /></div>
        <div><label class="label" for="email">E-mailadres</label><input class="input" id="email" type="email" readonly value={$currentUser?.email ?? ''} /></div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div><label class="label" for="birth-date">Geboortedatum (optioneel)</label><input class="input" id="birth-date" type="date" max={localDate()} autocomplete="bday" bind:value={birthDate} /></div>
          <div><label class="label" for="phone">Telefoonnummer (optioneel)</label><input class="input" id="phone" type="tel" maxlength="50" autocomplete="tel" bind:value={phone} /></div>
        </div>
        <div><label class="label" for="height">Lengte (cm, optioneel)</label><input class="input" id="height" type="number" min="30" max="300" step="0.1" bind:value={height} /></div>
        <div><label class="label" for="bio">Over mij / trainingsdoelen (optioneel)</label><textarea class="input" id="bio" rows="3" maxlength="2000" bind:value={bio}></textarea></div>
        <button class="btn-primary" type="submit">{saving ? 'Opslaan...' : 'Profiel opslaan'}</button>
      </fieldset>
    </form>

    <form class="card space-y-4" on:submit|preventDefault={addMeasurement}>
      <h3 class="text-xl font-bold">Lichaamsmetingen</h3>
      <p class="text-sm text-gray-600 dark:text-gray-300">Voeg een meting toe om gewicht en BMI door de tijd te volgen. Lengte wordt per meting bewaard.</p>
      {#if measurementError}<p role="alert" class="text-red-700 dark:text-red-300">{measurementError}</p>{/if}
      <fieldset disabled={savingMeasurement} class="grid gap-4 sm:grid-cols-2">
        <div><label class="label" for="measured-at">Datum</label><input class="input" id="measured-at" type="date" required max={localDate()} bind:value={measuredAt} /></div>
        <div><label class="label" for="weight">Gewicht (kg)</label><input class="input" id="weight" type="number" required min="1" max="700" step="0.1" bind:value={weight} /></div>
        <div><label class="label" for="measurement-height">Lengte bij meting (cm)</label><input class="input" id="measurement-height" type="number" required min="30" max="300" step="0.1" bind:value={measurementHeight} /></div>
        <div><label class="label" for="waist">Tailleomtrek (cm, optioneel)</label><input class="input" id="waist" type="number" min="1" max="400" step="0.1" bind:value={waist} /></div>
        <p class="self-center font-semibold">BMI: {bmi ?? '—'}</p>
        <button class="btn-primary" type="submit">{savingMeasurement ? 'Opslaan...' : 'Meting opslaan'}</button>
      </fieldset>
      <p class="text-sm text-gray-600 dark:text-gray-300">BMI is een grove indicatie en geen diagnose; het houdt geen rekening met bijvoorbeeld spiermassa, zwangerschap of leeftijd.</p>
    </form>

    <section class="card space-y-3">
      <div class="flex items-center justify-between gap-3"><h3 class="text-xl font-bold">Meetgeschiedenis</h3><a class="font-bold text-overload-signal" href="/stats">Insights</a></div>
      {#if !measurements.length}
        <p>Nog geen metingen toegevoegd.</p>
      {:else}
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead><tr><th class="py-2">Datum</th><th>Gewicht</th><th>Lengte</th><th>BMI</th><th>Taille</th><th><span class="sr-only">Acties</span></th></tr></thead>
            <tbody>
              {#each measurements as entry (entry.id)}
                <tr class="border-t border-gray-200 dark:border-gray-700">
                  <td class="py-2">{measurementDateLabel(entry.measured_at)}</td>
                  <td>{entry.weight_kg} kg</td><td>{entry.height_cm} cm</td><td>{calculateBMI(entry.weight_kg, entry.height_cm) ?? '—'}</td><td>{entry.waist_cm ? `${entry.waist_cm} cm` : '—'}</td>
                  <td><button type="button" class="btn-secondary" disabled={!!deleting} aria-label={`Meting van ${entry.measured_at.slice(0, 10)} verwijderen`} on:click={() => removeMeasurement(entry)}>{deleting === entry.id ? 'Verwijderen...' : 'Verwijderen'}</button></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>
