<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { LogOut, Moon, Sun } from '@lucide/svelte';
  import { darkTheme } from '$lib/stores/theme';
  import { currentUser } from '$lib/stores/auth';
  import { clearUserRoles, profile as profileStore } from '$lib/stores/role';
  import {
    getOrCreateMyProfile, getProfilePhotoUrl, logout, saveMyProfile
  } from '$lib/pocketbase';
  import type { Profile } from '$lib/types';

  let record: Profile | null = null;
  let loading = true;
  let saving = false;
  let error = '';
  let success = '';
  let displayName = '';
  let birthDate = '';
  let phone = '';
  let bio = '';
  let photoUrl = '';
  let photoInput: HTMLInputElement;
  let removePhoto = false;

  const signOut = () => {
    logout();
    clearUserRoles();
    goto('/login');
  };

  function localDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  onMount(async () => {
    try {
      record = await getOrCreateMyProfile();
      displayName = record.display_name;
      birthDate = record.birth_date?.slice(0, 10) ?? '';
      phone = record.phone ?? '';
      bio = record.bio ?? '';
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
      if (photo) data.set('photo', photo);
      else if (removePhoto) data.set('photo', '');
      record = await saveMyProfile(record.id, data);
      profileStore.set(record);
      success = 'Profiel opgeslagen.';
      photoInput.value = '';
      removePhoto = false;
      photoUrl = await getProfilePhotoUrl(record);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Opslaan mislukt.';
    } finally {
      saving = false;
    }
  };
</script>

<svelte:head><title>Mijn profiel · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <h2 class="text-3xl font-black">Mijn profiel</h2>
    <p class="mt-2 text-gray-600 dark:text-gray-300">Je persoonlijke gegevens en foto zijn alleen voor jou zichtbaar. Trainers hebben geen toegang.</p>
    <a class="mt-2 inline-block font-bold text-overload-signal" href="/health/measurements">Lichaamsmetingen vind je onder Health</a>
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
        <div><label class="label" for="bio">Over mij / trainingsdoelen (optioneel)</label><textarea class="input" id="bio" rows="3" maxlength="2000" bind:value={bio}></textarea></div>
        <button class="btn-primary" type="submit">{saving ? 'Opslaan...' : 'Profiel opslaan'}</button>
      </fieldset>
    </form>
  {/if}
</div>
