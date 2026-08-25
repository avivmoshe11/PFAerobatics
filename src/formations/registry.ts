import type { EchelonDirection, FormationGenerator, FormationType, Slot } from './types';
import { generateDiamond } from './diamond';
import { generateDiamondSlot } from './diamond-slot';
import { generateEchelon } from './echelon';
import { generateTrail } from './trail';

export const FORMATION_GENERATORS: Record<FormationType, FormationGenerator> = {
  diamond: generateDiamond,
  echelon: generateEchelon,
  trail: generateTrail,
  'diamond-slot': generateDiamondSlot,
};

export function generateFormationSlots(
  formationType: FormationType,
  planeCount: number,
  echelonDirection: EchelonDirection = 1,
): Slot[] {
  return FORMATION_GENERATORS[formationType]({ planeCount, echelonDirection });
}
