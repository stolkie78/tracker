<script lang="ts">
  import { PERIOD_OPTIONS, type PeriodKey } from '$lib/stats';

  export let value: PeriodKey = '12w';
</script>

<div class="flex flex-wrap gap-2" role="group" aria-label="Periode">
  {#each PERIOD_OPTIONS as option}
    <button
      type="button"
      class="touch-target rounded-xl px-4 text-sm font-bold transition {value === option.value ? 'bg-primary-600 text-white' : 'border border-gray-300 bg-white text-gray-800 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100'}"
      aria-pressed={value === option.value}
      on:click={() => (value = option.value)}>{option.label}</button
    >
  {/each}
</div>
