export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Negates a value but keeps 0 as +0 (plain `-0` is a common source of surprising equality checks). */
export function negateZeroSafe(value: number): number {
  return value === 0 ? 0 : -value;
}

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Trapezoidal velocity profile: eases in over the first `edgeFraction` of the range and out over
 * the last `edgeFraction`, moving at constant speed through the middle — rather than easing across
 * the whole range. The in/out ramps are linear-velocity (quadratic position), so velocity is
 * continuous where they meet the linear middle (no visible kink), even though acceleration isn't.
 * `edgeFraction` is clamped to [0, 0.5] since the two edges can't overlap.
 */
export function easeLinearWithEdges(t: number, edgeFraction: number): number {
  const f = Math.min(0.5, Math.max(0, edgeFraction));
  const clampedT = clamp01(t);
  if (f === 0) return clampedT;

  const peakSpeed = 1 / (1 - f);
  if (clampedT < f) {
    return (peakSpeed * clampedT * clampedT) / (2 * f);
  }
  if (clampedT > 1 - f) {
    const u = 1 - clampedT;
    return 1 - (peakSpeed * u * u) / (2 * f);
  }
  return (peakSpeed * f) / 2 + peakSpeed * (clampedT - f);
}
