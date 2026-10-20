<script lang="ts" generics="T extends string | number">
  import { Repeat2 } from '@lucide/svelte';
  import { cycleChoice } from '$lib/choices';

  export let value: T;
  export let options: readonly { value: T; label: string }[];
  export let label: string;
  export let id: string | undefined = undefined;
  export let disabled = false;
  export let placeholder = 'Geen opties beschikbaar';
  export let onChange: ((next: T) => void) | undefined = undefined;

  $: current = options.find((option) => option.value === value);
  $: next = cycleChoice(options, value);
  $: text = current?.label ?? (options.length ? 'Kies een optie' : placeholder);
  $: canChange = options.length > 1 || (options.length === 1 && !current);
  $: hint = canChange ? `Volgende: ${next?.label}` : '';

  const advance = () => {
    if (disabled || !canChange || !next) return;
    if (onChange) onChange(next.value);
    else value = next.value;
  };
</script>

<button
  {id}
  type="button"
  class="input flex min-w-0 items-center justify-between gap-3 text-left font-semibold transition hover:border-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-default disabled:opacity-60"
  disabled={disabled || !canChange}
  aria-label={`${label}: ${text}${hint ? `. ${hint}` : ''}`}
  title={hint || text}
  on:click={advance}>
  <span class="min-w-0 break-words" aria-live="polite">{text}</span>
  {#if canChange}<Repeat2 size={18} class="shrink-0 text-primary-600 dark:text-primary-300" aria-hidden="true" />{/if}
</button>
