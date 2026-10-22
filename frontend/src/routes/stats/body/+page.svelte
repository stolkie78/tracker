<script lang="ts">
  import { onMount } from 'svelte';
  import CycleChoice from '$lib/components/CycleChoice.svelte';
  import { getBodyMeasurements } from '$lib/pocketbase';
  import { calculateBMI, MEASUREMENT_METRICS, measurementChart, measurementDateLabel, measurementStats, type MeasurementMetric } from '$lib/measurements';
  import type { BodyMeasurement } from '$lib/types';
  import { type PeriodKey } from '$lib/stats';
  import StatsPeriodPicker from '$lib/components/StatsPeriodPicker.svelte';

  let measurements: BodyMeasurement[] = [];
  let loading = true;
  let error = '';
  let period: PeriodKey = '12w';
  let measurementMetric: MeasurementMetric = 'weight';

  $: body = measurementStats(measurements, period);
  $: bodyChart = measurementChart(body.entries, measurementMetric);

  onMount(async () => {
    try {
      measurements = await getBodyMeasurements();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Body measurements could not be loaded.';
    } finally {
      loading = false;
    }
  });

  const sign = (value: number) => (value > 0 ? `+${value}` : `${value}`);
</script>

<svelte:head><title>Body · Insights · T.O.P. Trainer</title></svelte:head>

<div class="space-y-5">
  <div>
    <p class="text-sm font-bold uppercase tracking-[0.18em] text-overload-signal">Insights</p>
    <h2 class="mt-1 text-3xl font-black">Body</h2>
    <p class="mt-1 text-gray-600 dark:text-gray-300">Track trends in your body measurements. <a class="font-bold text-overload-signal" href="/health/measurements">Add or manage measurements</a>.</p>
  </div>

  <StatsPeriodPicker bind:value={period} />

  {#if loading}
    <div class="card animate-pulse">Loading body measurements...</div>
  {:else if error}
    <p role="alert" class="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>
  {:else if body.latest}
    <section class="card space-y-4">
      <p class="text-sm text-gray-600 dark:text-gray-300">Latest measurement in this period: {measurementDateLabel(body.latest.measured_at)}</p>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><p class="label">Weight</p><p class="text-2xl font-black">{body.latest.weight_kg} kg</p></div>
        <div><p class="label">BMI</p><p class="text-2xl font-black">{body.bmi ?? '—'}</p></div>
        <div><p class="label">Change</p><p class="text-2xl font-black">{body.weightChange === null ? '—' : `${sign(body.weightChange)} kg`}</p></div>
        <div><p class="label">Waist</p><p class="text-2xl font-black">{body.latest.waist_cm ? `${body.latest.waist_cm} cm` : '—'}</p></div>
      </div>
      <div>
        <label class="label" for="measurement-metric">Chart</label>
        <CycleChoice id="measurement-metric" label="Chart" bind:value={measurementMetric}
          options={Object.entries(MEASUREMENT_METRICS).map(([value, metric]) => ({ value, label: `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}` }))} />
      </div>
      {#if bodyChart.points.length}
        <svg viewBox="0 0 500 180" class="h-auto w-full text-gray-600 dark:text-gray-300" role="img" aria-label={`${MEASUREMENT_METRICS[measurementMetric].label} over the selected period`}>
          <line x1="55" y1="30" x2="55" y2="140" stroke="currentColor" opacity="0.3" />
          <line x1="55" y1="140" x2="475" y2="140" stroke="currentColor" opacity="0.3" />
          {#if bodyChart.min === bodyChart.max}
            <text x="48" y="89" text-anchor="end" fill="currentColor" font-size="12">{bodyChart.min}</text>
          {:else}
            <text x="48" y="34" text-anchor="end" fill="currentColor" font-size="12">{bodyChart.max}</text>
            <text x="48" y="144" text-anchor="end" fill="currentColor" font-size="12">{bodyChart.min}</text>
          {/if}
          <polyline fill="none" stroke="#f97316" stroke-width="3" stroke-linejoin="round" points={bodyChart.points.map((point) => `${point.x},${point.y}`).join(' ')} />
          {#each bodyChart.points as point}
            <circle cx={point.x} cy={point.y} r="4" fill="#f97316"><title>{measurementDateLabel(point.date)}: {point.value} {MEASUREMENT_METRICS[measurementMetric].unit}</title></circle>
          {/each}
          <text x="55" y="165" fill="currentColor" font-size="12">{measurementDateLabel(bodyChart.points[0].date)}</text>
          {#if bodyChart.points.length > 1}
            <text x="475" y="165" text-anchor="end" fill="currentColor" font-size="12">{measurementDateLabel(bodyChart.points[bodyChart.points.length - 1].date)}</text>
          {/if}
        </svg>
        {#if bodyChart.points.length === 1}<p class="text-sm text-gray-600 dark:text-gray-300">One measurement; add more to see a trend.</p>{/if}
      {:else}
        <p class="text-sm text-gray-600 dark:text-gray-300">No {MEASUREMENT_METRICS[measurementMetric].label.toLowerCase()} measurements in this period.</p>
      {/if}
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead><tr><th class="py-2">Date</th><th>Weight</th><th>BMI</th></tr></thead>
          <tbody>{#each [...body.entries].reverse() as entry}<tr class="border-t border-gray-200 dark:border-gray-700"><td class="py-2">{measurementDateLabel(entry.measured_at)}</td><td>{entry.weight_kg} kg</td><td>{calculateBMI(entry.weight_kg, entry.height_cm) ?? '—'}</td></tr>{/each}</tbody>
        </table>
      </div>
      <p class="text-sm text-gray-600 dark:text-gray-300">BMI is a rough indicator, not a diagnosis. Change compares the first and last measurements in the selected period.</p>
    </section>
  {:else}
    <section class="card space-y-2 text-gray-600 dark:text-gray-300">
      <p>No body measurements in this period yet.</p>
      <a class="font-bold text-overload-signal" href="/health/measurements">Add a measurement under Health → Measurements</a>
    </section>
  {/if}
</div>
