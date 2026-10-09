<script lang="ts">
  export let title = 'Nog niets gevonden';
  export let description = 'Maak je eerste item aan om te starten.';
</script>

<div class="card flex flex-col items-center justify-center py-12 text-center">
  <div class="mb-4 rounded-2xl bg-primary-600 p-4 text-white">
    <slot name="icon">TOP</slot>
  </div>
  <h2 class="text-xl font-bold">{title}</h2>
  <p class="mt-2 max-w-md text-gray-600 dark:text-gray-300">{description}</p>
  <div class="mt-6">
    <slot />
  </div>
</div>
