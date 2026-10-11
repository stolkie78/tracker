<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Brain, Pause, Play, RotateCcw } from '@lucide/svelte';

  const PATTERNS = [
    { id: 'box', label: 'Box breathing 4-4-4-4', steps: [['Adem in', 4], ['Vasthouden', 4], ['Adem uit', 4], ['Vasthouden', 4]] },
    { id: '478', label: '4-7-8 ontspanning', steps: [['Adem in', 4], ['Vasthouden', 7], ['Adem uit', 8]] },
    { id: 'calm', label: 'Rustig 5-5', steps: [['Adem in', 5], ['Adem uit', 5]] }
  ] as const;

  let patternId: string = 'box';
  let minutes = 5;
  let running = false;
  let elapsed = 0;
  let stepIndex = 0;
  let stepLeft = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  $: pattern = PATTERNS.find((entry) => entry.id === patternId) ?? PATTERNS[0];
  $: total = minutes * 60;
  $: finished = elapsed >= total;
  $: current = pattern.steps[stepIndex % pattern.steps.length];

  const stop = () => {
    running = false;
    if (timer) clearInterval(timer);
  };

  const tick = () => {
    elapsed += 1;
    stepLeft -= 1;
    if (stepLeft <= 0) {
      stepIndex = (stepIndex + 1) % pattern.steps.length;
      stepLeft = pattern.steps[stepIndex][1];
    }
    if (elapsed >= total) stop();
  };

  const toggle = () => {
    if (running) return stop();
    if (finished) reset();
    if (stepLeft <= 0) stepLeft = pattern.steps[stepIndex][1];
    running = true;
    timer = setInterval(tick, 1000);
  };

  const reset = () => {
    stop();
    elapsed = 0;
    stepIndex = 0;
    stepLeft = 0;
  };

  const format = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  onDestroy(stop);
</script>

<svelte:head><title>Mindfulness · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Health · Mindfulness</p>
    <h2 class="mt-1 flex items-center gap-2 text-3xl font-black"><Brain size={28} /> Mindfulness</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Een korte ademhalingsoefening om tot rust te komen. Neem een comfortabele houding aan en volg het ritme.</p>
  </div>

  <section class="card space-y-5 text-center">
    <div class="grid gap-4 text-left sm:grid-cols-2">
      <div>
        <label class="label" for="pattern">Ademritme</label>
        <select id="pattern" class="input" bind:value={patternId} disabled={running} on:change={reset}>
          {#each PATTERNS as option}<option value={option.id}>{option.label}</option>{/each}
        </select>
      </div>
      <div>
        <label class="label" for="minutes">Duur (minuten)</label>
        <input id="minutes" class="input" type="number" min="1" max="60" bind:value={minutes} disabled={running} />
      </div>
    </div>

    <div class="mx-auto flex h-48 w-48 items-center justify-center rounded-full border-4 border-primary-500 transition-transform duration-1000 {running && current[0] === 'Adem in' ? 'scale-110' : running && current[0] === 'Adem uit' ? 'scale-90' : ''}">
      <div>
        <p class="text-2xl font-black">{finished ? 'Klaar' : running || elapsed > 0 ? current[0] : 'Klaar om te starten'}</p>
        {#if running}<p class="text-3xl font-black">{stepLeft}</p>{/if}
      </div>
    </div>
    <p class="text-gray-600 dark:text-gray-300">{format(elapsed)} / {format(total)}</p>
    {#if finished}<p class="font-semibold text-emerald-600 dark:text-emerald-300">Goed gedaan. Neem even de tijd om terug te komen.</p>{/if}

    <div class="flex justify-center gap-3">
      <button class="btn-primary" on:click={toggle}>{#if running}<Pause size={18} /> Pauzeren{:else}<Play size={18} /> {elapsed > 0 && !finished ? 'Hervatten' : 'Starten'}{/if}</button>
      <button class="btn-secondary" on:click={reset}><RotateCcw size={18} /> Opnieuw</button>
    </div>
  </section>
</div>
