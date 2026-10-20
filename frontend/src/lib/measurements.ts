import { periodStart, type PeriodKey } from '$lib/stats';
import type { BodyMeasurement } from '$lib/types';

export const measurementDateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('nl-NL');

export const calculateBMI = (weightKg: number, heightCm: number): number | null =>
  Number.isFinite(weightKg) && Number.isFinite(heightCm) && weightKg > 0 && heightCm > 0
    ? Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
    : null;

export const MEASUREMENT_METRICS = {
  weight: { label: 'Gewicht', unit: 'kg' },
  bmi: { label: 'BMI', unit: '' },
  waist: { label: 'Taille', unit: 'cm' }
};
export type MeasurementMetric = keyof typeof MEASUREMENT_METRICS;

export const measurementChart = (entries: BodyMeasurement[], metric: MeasurementMetric) => {
  const values = entries.map((entry) => ({
    id: entry.id,
    date: entry.measured_at,
    time: new Date(`${entry.measured_at.slice(0, 10)}T12:00:00Z`).getTime(),
    value: metric === 'bmi' ? calculateBMI(entry.weight_kg, entry.height_cm)
      : metric === 'weight' ? entry.weight_kg : entry.waist_cm
  })).filter((entry): entry is typeof entry & { value: number } =>
    typeof entry.value === 'number' && Number.isFinite(entry.value) && entry.value > 0 && Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time);
  if (!values.length) return { points: [], min: 0, max: 0 };
  const min = Math.min(...values.map((entry) => entry.value));
  const max = Math.max(...values.map((entry) => entry.value));
  const first = values[0].time;
  const duration = values[values.length - 1].time - first;
  return {
    min, max,
    points: values.map((entry) => ({
      ...entry,
      x: duration ? 55 + ((entry.time - first) / duration) * 420 : 265,
      y: max === min ? 85 : 140 - ((entry.value - min) / (max - min)) * 110
    }))
  };
};

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
