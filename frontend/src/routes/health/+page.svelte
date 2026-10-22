<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => goto('/health/fasting', { replaceState: true }));
</script>

<div class="card animate-pulse">Loading...</div>
