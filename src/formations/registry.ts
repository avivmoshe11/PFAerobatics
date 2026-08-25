import type { EchelonDirection, FormationGenerator, FormationType, Slot } from './types';
import { generateDiamond } from './diamond';
import { generateEchelon } from './echelon';
import { generateTrail } from './trail';

export const FORMATION_GENERATORS: Record<FormationType, FormationGenerator> = {
  diamond: generateDiamond,
  echelon: generateEchelon,
  trail: generateTrail,
};

export function generateFormationSlots(
  formationType: FormationType,
  planeCount: number,
  echelonDirection: EchelonDirection = 1,
): Slot[] {
  return FORMATION_GENERATORS[formationType]({ planeCount, echelonDirection });
}
