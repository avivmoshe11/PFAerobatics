import type { FormationGenerator, Slot } from './types';
import { assertValidPlaneCount } from './types';
import { negateZeroSafe } from '../utils/math';

const DEPTH_STEP = 16;
// Small per-aircraft altitude step purely so each plane reads visually distinct rather than
// appearing hidden directly behind the one ahead — matches how real trail formations fly stepped.
const VERTICAL_STEP = 3;

export const generateTrail: FormationGenerator = ({ planeCount }) => {
  assertValidPlaneCount(planeCount);
  const slots: Slot[] = [];
  for (let i = 0; i < planeCount; i += 1) {
    slots.push({
      role: i === 0 ? 'lead' : 'trail',
      offset: { x: 0, y: negateZeroSafe(i * VERTICAL_STEP), z: i * DEPTH_STEP },
    });
  }
  return slots;
};
