import type { EchelonDirection, FormationType } from './types';
import { generateDiamond } from './diamond';
import { generateFormationSlots } from './registry';

/**
 * Because every transition is Diamond<->X (never X<->Y directly), slot assignment doesn't need a
 * general weighted-cost optimal-assignment solver. Instead: each aircraft's permanent identity is
 * its Diamond home-slot index (see AircraftId in types.ts). For any other formation X, we compute
 * once a fixed bijection between Diamond slot order and X's slot order, and reuse it for both
 * directions — Diamond->X sends aircraft k to targetSlots[bijection[k]], and X->Diamond always
 * returns aircraft k to its own home diamond slot k. No runtime search, no ambiguity, and an
 * aircraft can never end up swapped with its mirror-image wingman.
 *
 * The bijection pins the lead 1:1, then orders the remaining Diamond slots by a formation-specific
 * comparator and zips that order against X's own remaining slots in their natural generator order:
 *  - echelon: primarily by row depth (shallower Diamond rows — the wings — queue up before deeper
 *    ones like slot/tail, so those always land at the back of the line regardless of side). Within
 *    a row, the wing on the *opposite* side from the echelon's direction goes first (closest to
 *    lead) and the same-side wing goes second — e.g. for an echelon stepping left, the right wing
 *    tucks in right behind lead and the left wing queues up behind it.
 *  - trail: primarily by row depth, same as echelon (shallower Diamond rows — the wings — queue up
 *    before deeper ones like slot/tail). A trail line has no inherent side, but ties within a row
 *    still need breaking, so the right-side slot queues before the left-side one when depth ties.
 */
export function computeDiamondBijection(
  targetFormation: Exclude<FormationType, 'diamond'>,
  planeCount: number,
  echelonDirection: EchelonDirection = 1,
): number[] {
  const diamondSlots = generateDiamond({ planeCount });
  const targetSlots = generateFormationSlots(targetFormation, planeCount, echelonDirection);

  const diamondLeadIndex = diamondSlots.findIndex((slot) => slot.role === 'lead');
  const targetLeadIndex = targetSlots.findIndex((slot) => slot.role === 'lead');
  if (diamondLeadIndex === -1 || targetLeadIndex === -1) {
    throw new Error('Formation generator did not produce a lead slot');
  }

  const compareDiamondRest = (a: { x: number; z: number }, b: { x: number; z: number }): number => {
    if (a.z !== b.z) return a.z - b.z;
    if (targetFormation !== 'echelon') return b.x - a.x; // trail: right wing queues before left wing
    // Same row: opposite-side-from-echelon-direction sorts first (closest to lead).
    const oppositeSideKey = (offsetX: number) => -echelonDirection * offsetX;
    return oppositeSideKey(b.x) - oppositeSideKey(a.x);
  };

  const sortedDiamondRest = diamondSlots
    .map((slot, index) => ({ slot, index }))
    .filter(({ index }) => index !== diamondLeadIndex)
    .sort((a, b) => compareDiamondRest(a.slot.offset, b.slot.offset));

  const targetRestIndices = targetSlots
    .map((_, index) => index)
    .filter((index) => index !== targetLeadIndex);

  if (sortedDiamondRest.length !== targetRestIndices.length) {
    throw new Error(
      `Mismatched slot counts between diamond (${diamondSlots.length}) and ${targetFormation} (${targetSlots.length})`,
    );
  }

  const bijection: number[] = new Array(planeCount);
  bijection[diamondLeadIndex] = targetLeadIndex;
  sortedDiamondRest.forEach(({ index }, i) => {
    bijection[index] = targetRestIndices[i]!;
  });

  return bijection;
}
