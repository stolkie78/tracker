import { periodStart, type PeriodKey } from '$lib/stats';
import type { BodyMeasurement } from '$lib/types';

export const measurementDateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('nl-NL');

export const calculateBMI = (weightKg: number, heightCm: number): number | null =>
  Number.isFinite(weightKg) && Number.isFinite(heightCm) && weightKg > 0 && heightCm > 0
    ? Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
    : null;

export const measurementStats = (measurements: BodyMeasurement[], period: PeriodKey) => {
  const start = periodStart(period);
  const entries = measurements
    .filter((entry) => !start || new Date(entry.measured_at) >= start)
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at) || (a.created ?? '').localeCompare(b.created ?? ''));
  const first = entries[0];
  const latest = entries.at(-1);
  return {
    entries,
    latest,
    bmi: latest ? calculateBMI(latest.weight_kg, latest.height_cm) : null,
    weightChange: entries.length > 1 && latest && first
      ? Math.round((latest.weight_kg - first.weight_kg) * 10) / 10
      : null
  };
};
