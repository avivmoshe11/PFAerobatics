/**
 * Coordinate convention for every offset in this module: +X = right, +Y = up, -Z = forward
 * (Three.js's standard right-handed default). All generators and consumers must agree on this.
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export const ZERO_VEC3: Vec3 = { x: 0, y: 0, z: 0 };

export type Role =
  | 'lead'
  | 'wing-left'
  | 'wing-right'
  | 'row2-left'
  | 'row2-right'
  | 'slot'
  | 'tail'
  | 'echelon'
  | 'trail';

export interface Slot {
  readonly role: Role;
  readonly offset: Vec3;
}

export type FormationType = 'diamond' | 'echelon' | 'trail';

export type EchelonDirection = 1 | -1;

export interface FormationParams {
  readonly planeCount: number;
  readonly echelonDirection?: EchelonDirection;
}

export type FormationGenerator = (params: FormationParams) => Slot[];

/**
 * An aircraft's permanent identity is its Diamond home-slot index (0 = lead). Every other
 * formation's slot order is reached via a bijection keyed off this index (see matchAircraft.ts),
 * so an aircraft always has a well-defined "home" to return to.
 */
export type AircraftId = number;

export const MIN_PLANES = 2;
export const MAX_PLANES = 6;

export function assertValidPlaneCount(planeCount: number): void {
  if (!Number.isInteger(planeCount) || planeCount < MIN_PLANES || planeCount > MAX_PLANES) {
    throw new RangeError(
      `planeCount must be an integer between ${MIN_PLANES} and ${MAX_PLANES}, got ${planeCount}`,
    );
  }
}
