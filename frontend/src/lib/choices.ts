export function cycleChoice<T extends string | number>(
  options: readonly { value: T; label: string }[], value: T
) {
  if (!options.length) return undefined;
  const index = options.findIndex((option) => option.value === value);
  return options[(index + 1) % options.length];
}
