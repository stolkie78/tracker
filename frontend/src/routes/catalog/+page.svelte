<script lang="ts">
  import { onMount } from 'svelte';
  import { Check, Pencil, Plus, X } from '@lucide/svelte';
  import { isAdmin } from '$lib/stores/role';
  import { currentUserId, getCatalog, getCatalogExercises, saveCatalogEntry, saveCatalogExercise } from '$lib/pocketbase';
  import { applyCatalog, CATALOG_CATEGORIES, CATALOG_KIND_LABELS, type CatalogEntry, type CatalogKind } from '$lib/catalog';
  import { EXERCISE_EQUIPMENT_LABELS, MUSCLE_GROUP_OPTIONS, WORKOUT_TYPE_LABELS, type Exercise, type WorkoutType } from '$lib/types';
  import CycleChoice from '$lib/components/CycleChoice.svelte';

  let entries: CatalogEntry[] = [];
  let exercises: Exercise[] = [];
  let loading = true;
  let saving = false;
  let error = '';
  let success = '';
  let selectedCategory: WorkoutType = 'life';
  let search = '';
  let showInactive = false;
  let entryForm: { id?: string; kind: CatalogKind; label: string; categories: WorkoutType[]; active: boolean } | null = null;
  let exerciseForm: { id?: string; name: string; category: string; muscle_group: string; equipment_options: string[]; active: boolean } | null = null;
  let kind: CatalogKind;
  $: kind = selectedCategory === 'strength' ? 'equipment' : selectedCategory === 'sport' ? 'sport' : selectedCategory === 'recovery' ? 'recovery' : 'movement';
  $: visibleEntries = entries.filter((entry) => entry.categories.includes(selectedCategory) && (showInactive || entry.active) && entry.label.toLowerCase().includes(search.toLowerCase()));
  $: visibleExercises = exercises.filter((exercise) => (showInactive || exercise.active) && exercise.name.toLowerCase().includes(search.toLowerCase()));
  $: editingStandardExercise = !!exerciseForm?.id && !exercises.find((exercise) => exercise.id === exerciseForm?.id)?.owner;
  $: equipmentLabels = Object.fromEntries(entries.filter((entry) => entry.kind === 'equipment').map((entry) => [entry.key, entry.label]));

  const load = async () => {
    loading = true;
    error = '';
    try {
      [entries, exercises] = await Promise.all([getCatalog(), getCatalogExercises()]);
      applyCatalog(entries);
    } catch (err) {
      error = err instanceof Error ? err.message : 'The catalog could not be loaded.';
    } finally { loading = false; }
  };
  onMount(() => { void load(); });

  const editEntry = (entry?: CatalogEntry) => {
    exerciseForm = null;
    entryForm = entry ? { id: entry.id, kind: entry.kind, label: entry.label, categories: [...entry.categories], active: entry.active }
      : { kind, label: '', categories: [selectedCategory], active: true };
    error = '';
    success = '';
  };
  const editExercise = (exercise?: Exercise) => {
    entryForm = null;
    exerciseForm = exercise ? { id: exercise.id, name: exercise.name, category: exercise.category, muscle_group: exercise.muscle_group ?? '', equipment_options: [...exercise.equipment_options], active: exercise.active }
      : { name: '', category: 'compound', muscle_group: '', equipment_options: [], active: true };
    error = '';
    success = '';
  };
  const saveEntry = async () => {
    if (!entryForm || saving) return;
    saving = true;
    error = '';
    try {
      const saved = await saveCatalogEntry(entryForm);
      entries = [...entries.filter((entry) => entry.id !== saved.id), saved].sort((a, b) => a.label.localeCompare(b.label));
      applyCatalog(entries);
      entryForm = null;
      success = saved.owner ? 'Personal choice saved. Only you can see and use it.' : 'Standard choice saved. Other users see the change on their next page load.';
    } catch (err) { error = err instanceof Error ? err.message : 'The entry could not be saved.'; }
    finally { saving = false; }
  };
  const saveExercise = async () => {
    if (!exerciseForm || saving) return;
    saving = true;
    error = '';
    try {
      const muscle = MUSCLE_GROUP_OPTIONS.find((option) => option.value === exerciseForm?.muscle_group)?.value;
      const saved = await saveCatalogExercise({ ...exerciseForm, muscle_group: muscle });
      exercises = [...exercises.filter((exercise) => exercise.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name));
      exerciseForm = null;
      success = saved.owner ? 'Personal exercise saved. Only you can see and use it.' : 'Standard exercise saved. Existing workout prescriptions remain unchanged.';
    } catch (err) { error = err instanceof Error ? err.message : 'The exercise could not be saved.'; }
    finally { saving = false; }
  };
  const changeCategory = (category: WorkoutType) => {
    selectedCategory = category;
    entryForm = null;
    exerciseForm = null;
    search = '';
    error = '';
    success = '';
  };
</script>

<svelte:head><title>Training catalog · T.O.P. Trainer</title></svelte:head>

  <div class="space-y-5">
    <header>
      <p class="text-sm font-bold uppercase tracking-wide text-overload-signal">Your training choices</p>
      <h2 class="mt-1 text-3xl font-black">Training catalog</h2>
      <p class="mt-2 text-gray-600 dark:text-gray-300">Use the standard catalog and add your own activities, strength materials, machines and exercises. Your additions are private. The six main categories stay fixed.</p>
    </header>
    <div class="flex flex-wrap gap-2" role="group" aria-label="Catalog category">
      {#each Object.entries(WORKOUT_TYPE_LABELS) as [value, label]}
        <button type="button" class={selectedCategory === value ? 'btn-primary' : 'btn-secondary'} disabled={saving} aria-pressed={selectedCategory === value} on:click={() => changeCategory(value as WorkoutType)}>{label}</button>
      {/each}
    </div>
    {#if error}<div role="alert" class="card text-red-700 dark:text-red-300"><p>{error}</p>{#if !entryForm && !exerciseForm}<button type="button" class="btn-secondary mt-2" on:click={load}>Try again</button>{/if}</div>{/if}
    {#if success}<p role="status" class="rounded-xl bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">{success}</p>{/if}
    {#if loading}<p class="card animate-pulse">Loading catalog...</p>
    {:else}
      {#if entryForm}
        <form class="card" on:submit|preventDefault={saveEntry}>
          <fieldset class="space-y-4" disabled={saving}>
            <h3 class="text-xl font-bold">{entryForm.id ? 'Edit' : 'New personal'} {CATALOG_KIND_LABELS[entryForm.kind].toLowerCase()}</h3>
            <div><label class="label" for="catalog-label">Name</label><input id="catalog-label" class="input" bind:value={entryForm.label} required maxlength="80" /></div>
            <fieldset>
              <legend class="label">Available under</legend>
              <div class="flex flex-wrap gap-4">
                {#each CATALOG_CATEGORIES[entryForm.kind] as category}
                  <label class="flex min-h-12 items-center gap-2"><input type="checkbox" value={category} bind:group={entryForm.categories} />{WORKOUT_TYPE_LABELS[category]}</label>
                {/each}
              </div>
            </fieldset>
            <label class="flex min-h-12 items-center gap-2"><input type="checkbox" bind:checked={entryForm.active} />Active for new selections</label>
            <p class="text-sm text-gray-600 dark:text-gray-300">Renaming updates the displayed name in workouts. Deactivating preserves existing workouts and their saved selection.</p>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="btn-primary"><Check size={18} />{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" class="btn-secondary" on:click={() => entryForm = null}><X size={18} />Cancel</button>
            </div>
          </fieldset>
        </form>
      {:else if exerciseForm}
        <form class="card" on:submit|preventDefault={saveExercise}>
          <fieldset class="space-y-4" disabled={saving}>
            <h3 class="text-xl font-bold">{exerciseForm.id ? 'Edit exercise' : 'New personal exercise'}</h3>
            <div><label class="label" for="exercise-name">Name</label><input id="exercise-name" class="input" bind:value={exerciseForm.name} required maxlength="120" /></div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div><label class="label" for="exercise-category">Exercise category</label><CycleChoice id="exercise-category" label="Exercise category" bind:value={exerciseForm.category} options={[{ value: 'compound', label: 'Compound' }, { value: 'isolation', label: 'Isolation' }, { value: 'bodyweight', label: 'Bodyweight' }, { value: 'other', label: 'Other' }]} /></div>
              <div><label class="label" for="exercise-muscle">Muscle group</label><CycleChoice id="exercise-muscle" label="Muscle group" bind:value={exerciseForm.muscle_group} options={[{ value: '', label: 'Not specified' }, ...MUSCLE_GROUP_OPTIONS]} /></div>
            </div>
            <fieldset>
              <legend class="label">Materials / machines (1–8)</legend>
              <div class="grid gap-2 sm:grid-cols-2">
                {#each entries.filter((entry) => entry.kind === 'equipment' && (!editingStandardExercise || !entry.owner) && (entry.active || exerciseForm?.equipment_options.includes(entry.key))) as entry}
                  <label class="flex min-h-12 items-center gap-2 rounded-xl border border-gray-200 px-3 dark:border-gray-700"><input type="checkbox" value={entry.key} bind:group={exerciseForm.equipment_options} />{entry.label}{entry.active ? '' : ' (inactive)'}</label>
                {/each}
              </div>
            </fieldset>
            <label class="flex min-h-12 items-center gap-2"><input type="checkbox" bind:checked={exerciseForm.active} />Active in the exercise picker</label>
            <div class="flex flex-wrap gap-2">
              <button type="submit" class="btn-primary"><Check size={18} />{saving ? 'Saving...' : 'Save'}</button>
              <button type="button" class="btn-secondary" on:click={() => exerciseForm = null}><X size={18} />Cancel</button>
            </div>
          </fieldset>
        </form>
      {:else}
        <div class="flex flex-wrap items-end gap-4">
          <div class="min-w-0 flex-1"><label class="label" for="catalog-search">Search</label><input id="catalog-search" class="input" type="search" bind:value={search} placeholder="Search by name" /></div>
          <label class="flex min-h-12 items-center gap-2"><input type="checkbox" bind:checked={showInactive} />Show inactive</label>
        </div>
        <section class="card space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-xl font-bold">{selectedCategory === 'strength' ? 'Materials & machines' : `${WORKOUT_TYPE_LABELS[selectedCategory]} activities`}</h3>
            <button type="button" class="btn-primary" on:click={() => editEntry()}><Plus size={18} />New</button>
          </div>
          {#each visibleEntries as entry (entry.id)}
            <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <div><p class="font-bold">{entry.label}{#if !entry.active}<span class="ml-2 text-xs text-gray-500">Inactive</span>{/if}</p><p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{entry.owner ? 'Personal' : 'Standard'} · {entry.categories.map((category) => WORKOUT_TYPE_LABELS[category]).join(' · ')}</p></div>
              {#if entry.owner === currentUserId() || !entry.owner && $isAdmin}
                <button type="button" class="btn-secondary" aria-label={`Edit ${entry.label}`} on:click={() => editEntry(entry)}><Pencil size={16} />Edit</button>
              {/if}
            </div>
          {:else}<p class="py-4 text-sm text-gray-600 dark:text-gray-300">No entries match this filter.</p>{/each}
        </section>
        {#if selectedCategory === 'strength'}
          <section class="card space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-3"><h3 class="text-xl font-bold">Strength exercises</h3><button type="button" class="btn-primary" on:click={() => editExercise()}><Plus size={18} />New exercise</button></div>
            <p class="text-sm text-gray-600 dark:text-gray-300">Add personal exercises and assign materials or machines so they appear in your workout choices. Standard exercises remain available.</p>
            {#each visibleExercises as exercise (exercise.id)}
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
                <div class="min-w-0"><p class="font-bold">{exercise.name}{#if !exercise.active}<span class="ml-2 text-xs text-gray-500">Inactive</span>{/if}</p><p class="mt-1 text-sm text-gray-600 dark:text-gray-300">{exercise.owner ? 'Personal' : 'Standard'} · {exercise.equipment_options.map((key) => equipmentLabels[key] ?? EXERCISE_EQUIPMENT_LABELS[key] ?? key).join(' · ')}</p></div>
                {#if exercise.owner === currentUserId() || !exercise.owner && $isAdmin}
                  <button type="button" class="btn-secondary" aria-label={`Edit exercise ${exercise.name}`} on:click={() => editExercise(exercise)}><Pencil size={16} />Edit</button>
                {/if}
              </div>
            {:else}<p class="py-4 text-sm text-gray-600 dark:text-gray-300">No exercises match this filter.</p>{/each}
          </section>
        {/if}
      {/if}
    {/if}
  </div>
