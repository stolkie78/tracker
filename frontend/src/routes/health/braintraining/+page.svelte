<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Brain } from '@lucide/svelte';
  import { currentUserId } from '$lib/pocketbase';

  type Phase = 'idle' | 'show' | 'input' | 'result';

  const STORAGE_KEY = `braintraining-best:${currentUserId()}`;
  let phase: Phase = 'idle';
  let level = 3;
  let sequence = '';
  let answer = '';
  let best = 1;
  let correct = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    best = Number(localStorage.getItem(STORAGE_KEY) ?? 1) || 1;
  });
  onDestroy(() => timer && clearTimeout(timer));

  const start = (startLevel = level) => {
    level = startLevel;
    sequence = Array.from({ length: level }, () => Math.floor(Math.random() * 10)).join('');
    answer = '';
    phase = 'show';
    timer = setTimeout(() => (phase = 'input'), 1000 + level * 700);
  };

  const submit = () => {
    correct = answer.trim() === sequence;
    if (correct && level > best) {
      best = level;
      localStorage.setItem(STORAGE_KEY, String(best));
    }
    phase = 'result';
  };

  const next = () => (correct ? start(level + 1) : start(Math.max(3, level - 1)));
</script>

<svelte:head><title>Braintraining · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Health · Braintraining</p>
    <h2 class="mt-1 flex items-center gap-2 text-3xl font-black"><Brain size={28} /> Braintraining</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Number memory: remember the sequence and enter it. Each correct sequence adds one digit.</p>
  </div>

  <section class="card space-y-5 text-center">
    <p class="text-sm text-gray-600 dark:text-gray-300">Level {level} · Best: {best} digits</p>
    {#if phase === 'idle'}
      <button class="btn-primary w-full" on:click={() => start(3)}>Start</button>
    {:else if phase === 'show'}
      <p class="py-8 text-5xl font-black tracking-[0.3em]" aria-live="polite">{sequence}</p>
      <p class="text-gray-600 dark:text-gray-300">Remember the numbers...</p>
    {:else if phase === 'input'}
      <form class="space-y-4" on:submit|preventDefault={submit}>
        <label class="label" for="answer">Which numbers did you see?</label>
        <!-- svelte-ignore a11y_autofocus -->
        <input id="answer" class="input text-center text-2xl tracking-[0.3em]" inputmode="numeric" pattern="[0-9]*" autocomplete="off" autofocus bind:value={answer} />
        <button class="btn-primary w-full" type="submit">Check</button>
      </form>
    {:else}
      <p class="text-2xl font-black {correct ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-600 dark:text-red-300'}">{correct ? 'Correct!' : 'Not quite'}</p>
      {#if !correct}<p class="text-gray-600 dark:text-gray-300">The sequence was <span class="font-bold">{sequence}</span>.</p>{/if}
      <button class="btn-primary w-full" on:click={next}>{correct ? `Next: ${level + 1} digits` : 'Try again'}</button>
    {/if}
  </section>
</div>
