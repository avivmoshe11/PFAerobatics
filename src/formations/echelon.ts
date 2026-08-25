import type { FormationGenerator, Slot } from './types';
import { assertValidPlaneCount } from './types';
import { negateZeroSafe } from '../utils/math';

const LATERAL_STEP = 13;
const DEPTH_STEP = 10.8;
const VERTICAL_STEP = 1.4;

/**
 * A single generator parameterized by direction (rather than two "echelon-left"/"echelon-right"
 * formation types) so the mirror image never duplicates logic. `echelonDirection` is +1 for a
 * line stepping out to the right, -1 for the left.
 */
export const generateEchelon: FormationGenerator = ({ planeCount, echelonDirection = 1 }) => {
  assertValidPlaneCount(planeCount);
  const slots: Slot[] = [];
  for (let i = 0; i < planeCount; i += 1) {
    slots.push({
      role: i === 0 ? 'lead' : 'echelon',
      offset: {
        x: i * LATERAL_STEP * echelonDirection,
        y: negateZeroSafe(i * VERTICAL_STEP),
        z: i * DEPTH_STEP,
      },
    });
  }
  return slots;
};
