import type { Vec3 } from '../formations/types';
import type { Easing } from '../utils/math';
import { clamp01, easeLinearWithEdges, linear } from '../utils/math';

export interface Pose {
  readonly position: Vec3;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function computePose(
  progressT: number,
  source: Vec3,
  target: Vec3,
  easing: Easing = linear,
  dipAmount = 0,
): Pose {
  const clamped = clamp01(progressT);
  const eased = easing(clamped);
  const position = lerpVec3(source, target, eased);
  // Math.sin(Math.PI * 1) isn't exactly 0 (Math.PI is a finite approximation), so force the
  // boundaries explicitly rather than let a sub-epsilon dip leak into the final resting height.
  const dip = clamped <= 0 || clamped >= 1 ? 0 : dipAmount * Math.sin(Math.PI * clamped);
  return { position: { x: position.x, y: position.y - dip, z: position.z } };
}

export interface AircraftTransition {
  readonly aircraftId: number;
  readonly source: Vec3;
  readonly target: Vec3;
}

const SAFE_LATERAL_SEPARATION = 25; // scene units — closer than this, paths are a crossing risk
const MAX_COLLISION_DIP = 4; // scene units — how far the yielding aircraft dips at the deepest point

function xzLength(v: { x: number; z: number }): number {
  return Math.hypot(v.x, v.z);
}

/**
 * For every pair of concurrent transitions whose straight-line paths (in the horizontal XZ plane)
 * come closer than SAFE_LATERAL_SEPARATION at some shared point of progress, the aircraft with the
 * LONGER path yields with a temporary altitude dip, passing under the aircraft with less distance
 * to cover (which holds its planned altitude). Lead never moves (source === target for every
 * formation generator), so it always has right-of-way and never dips.
 *
 * Positions are affine in the shared eased progress, so the closest approach between two paths is
 * the exact minimum of a 1D quadratic — not a per-frame simulation.
 */
export function computeCollisionDips(
  transitions: readonly AircraftTransition[],
): Map<number, number> {
  const dips = new Map<number, number>();
  const pathLength = (t: AircraftTransition) =>
    xzLength({ x: t.target.x - t.source.x, z: t.target.z - t.source.z });

  for (let i = 0; i < transitions.length; i += 1) {
    for (let j = i + 1; j < transitions.length; j += 1) {
      const a = transitions[i]!;
      const b = transitions[j]!;

      const r0x = a.source.x - b.source.x;
      const r0z = a.source.z - b.source.z;
      const dx = a.target.x - a.source.x - (b.target.x - b.source.x);
      const dz = a.target.z - a.source.z - (b.target.z - b.source.z);

      const dSq = dx * dx + dz * dz;
      if (dSq < 1e-9) continue; // paths move in lockstep — no changing crossing risk

      const sStar = clamp01(-(r0x * dx + r0z * dz) / dSq);
      const minDist = Math.hypot(r0x + sStar * dx, r0z + sStar * dz);
      if (minDist >= SAFE_LATERAL_SEPARATION) continue;

      const severity = 1 - minDist / SAFE_LATERAL_SEPARATION;
      const dipAmount = MAX_COLLISION_DIP * severity;

      const aLen = pathLength(a);
      const bLen = pathLength(b);
      const yieldingId =
        aLen === bLen
          ? Math.max(a.aircraftId, b.aircraftId)
          : aLen > bLen
            ? a.aircraftId
            : b.aircraftId;
      dips.set(yieldingId, Math.max(dips.get(yieldingId) ?? 0, dipAmount));
    }
  }

  return dips;
}

// Absolute time, not a fraction of the transition — a 12s transition and a 6s one both ease for
// 1.5s at each end, then move at constant speed through however much middle is left. (0.5s was
// tried first but was too brief a window, against a 6-12s transition, to read as a slow-down.)
const EDGE_EASE_SECONDS = 1.5;

/**
 * Drives a set of concurrent per-aircraft tweens over a shared duration. Pure with respect to
 * `three`/rAF: time only advances via explicit `update(dtSeconds)` calls, so this is directly
 * unit-testable with a fake clock.
 *
 * Position-only orientation-wise by design: aircraft hold a fixed heading for the whole transition
 * and just slide between slots, rather than reorienting to face their instantaneous travel
 * direction — repositioning within a formation isn't a turn, so animating a heading/bank change
 * during it read as an unwanted spin rather than a formation change. Vertical position does move,
 * though: see computeCollisionDips for the collision-avoidance dip applied to a yielding aircraft.
 *
 * Defaults to easing only the first/last EDGE_EASE_SECONDS and moving at constant speed the rest
 * of the way (see easeLinearWithEdges), rather than easing across the whole transition — pass an
 * explicit `easing` to override.
 */
export class FormationTransitionRunner {
  private elapsedSeconds = 0;
  private readonly collisionDips: Map<number, number>;
  private readonly easing: Easing;

  constructor(
    private readonly transitions: readonly AircraftTransition[],
    private readonly durationSeconds: number,
    easing?: Easing,
  ) {
    if (durationSeconds <= 0) {
      throw new RangeError(`durationSeconds must be > 0, got ${durationSeconds}`);
    }
    const edgeFraction = EDGE_EASE_SECONDS / durationSeconds;
    this.easing = easing ?? ((t) => easeLinearWithEdges(t, edgeFraction));
    this.collisionDips = computeCollisionDips(transitions);
  }

  get progress(): number {
    return clamp01(this.elapsedSeconds / this.durationSeconds);
  }

  get done(): boolean {
    return this.elapsedSeconds >= this.durationSeconds;
  }

  update(dtSeconds: number): void {
    this.elapsedSeconds += dtSeconds;
  }

  poses(): Map<number, Pose> {
    const result = new Map<number, Pose>();
    for (const transition of this.transitions) {
      result.set(
        transition.aircraftId,
        computePose(
          this.progress,
          transition.source,
          transition.target,
          this.easing,
          this.collisionDips.get(transition.aircraftId) ?? 0,
        ),
      );
    }
    return result;
  }
}
