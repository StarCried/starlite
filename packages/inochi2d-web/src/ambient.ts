import type { ResolvedAmbientParameterOscillator } from "./types.js";

type ParameterValue = number | readonly [number, number];

/**
 * Applies validated, absolute sine-wave values beneath authored animations.
 * Reduced-motion mode leaves the model at its own neutral/default values.
 */
export function applyAmbientParameterOscillators(
  values: Map<string, ParameterValue>,
  oscillators: readonly ResolvedAmbientParameterOscillator[],
  timestampMs: number,
  reducedMotion: boolean,
): void {
  if (reducedMotion) {
    return;
  }
  const timestamp = Number.isFinite(timestampMs) ? timestampMs : 0;
  for (const oscillator of oscillators) {
    const midpoint = (oscillator.minimum + oscillator.maximum) / 2;
    const amplitude = (oscillator.maximum - oscillator.minimum) / 2;
    const phase =
      (timestamp / oscillator.periodMs + oscillator.phase) * Math.PI * 2;
    const value = midpoint + Math.sin(phase) * amplitude;
    setOscillatorValue(values, oscillator.id, oscillator.axis, value);
  }
}

function setOscillatorValue(
  values: Map<string, ParameterValue>,
  id: string,
  axis: "x" | "y" | undefined,
  value: number,
): void {
  if (axis === undefined) {
    values.set(id, value);
    return;
  }
  const current = values.get(id);
  const vector: [number, number] = Array.isArray(current)
    ? [current[0], current[1]]
    : [0, 0];
  vector[axis === "x" ? 0 : 1] = value;
  values.set(id, vector);
}
