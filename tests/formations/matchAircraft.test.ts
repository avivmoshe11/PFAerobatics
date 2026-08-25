import { describe, expect, it } from 'vitest';
import { computeDiamondBijection } from '../../src/formations/matchAircraft';
import { generateDiamond } from '../../src/formations/diamond';
import type { EchelonDirection, FormationType } from '../../src/formations/types';
import { MAX_PLANES, MIN_PLANES } from '../../src/formations/types';

const NON_DIAMOND: Exclude<FormationType, 'diamond'>[] = ['echelon', 'trail'];
const DIRECTIONS: EchelonDirection[] = [1, -1];

function isValidPermutation(bijection: number[], n: number): boolean {
  if (bijection.length !== n) return false;
  const seen = new Set(bijection);
  return seen.size === n && bijection.every((v) => v >= 0 && v < n);
}

describe('computeDiamondBijection', () => {
  for (const formation of NON_DIAMOND) {
    for (const direction of DIRECTIONS) {
      for (let n = MIN_PLANES; n <= MAX_PLANES; n += 1) {
        it(`is a valid permutation for ${formation} dir=${direction} n=${n}`, () => {
          const bijection = computeDiamondBijection(formation, n, direction);
          expect(isValidPermutation(bijection, n)).toBe(true);
        });

        it(`pins the lead (index 0) to index 0 for ${formation} dir=${direction} n=${n}`, () => {
          const diamondLeadIndex = generateDiamond({ planeCount: n }).findIndex(
            (slot) => slot.role === 'lead',
          );
          const bijection = computeDiamondBijection(formation, n, direction);
          expect(bijection[diamondLeadIndex]).toBe(0);
        });
      }
    }
  }

  it('sends the opposite-side wing (left) closest to lead for echelon-right, same-side wing second, slot last (n=4)', () => {
    // diamond order: [lead, wing-left, wing-right, slot]
    const bijection = computeDiamondBijection('echelon', 4, 1);
    expect(bijection).toEqual([0, 1, 2, 3]);
  });

  it('mirrors: opposite-side wing (right) closest to lead for echelon-left, same-side wing second, slot last (n=4)', () => {
    const bijection = computeDiamondBijection('echelon', 4, -1);
    expect(bijection).toEqual([0, 2, 1, 3]);
  });

  it('queues shallower diamond rows before deeper ones for trail, right wing ahead of left when tied (n=4)', () => {
    // diamond order: [lead, wing-left, wing-right, slot] — wings are shallower than slot, and
    // wing-right queues ahead of wing-left since they tie on depth.
    const bijection = computeDiamondBijection('trail', 4, 1);
    expect(bijection).toEqual([0, 2, 1, 3]);
  });

  it('always routes the right-side wing ahead of the left-side wing for trail (n=4,5,6)', () => {
    for (const n of [4, 5, 6]) {
      const diamondSlots = generateDiamond({ planeCount: n });
      const wingRightIndex = diamondSlots.findIndex((s) => s.role === 'wing-right');
      const wingLeftIndex = diamondSlots.findIndex((s) => s.role === 'wing-left');
      const bijection = computeDiamondBijection('trail', n, 1);
      expect(bijection[wingRightIndex]!).toBeLessThan(bijection[wingLeftIndex]!);
    }
  });

  it('always routes the opposite-side wing closer to lead than the same-side wing for echelon (n=4,5,6, both directions)', () => {
    for (const n of [4, 5, 6]) {
      for (const direction of DIRECTIONS) {
        const diamondSlots = generateDiamond({ planeCount: n });
        const oppositeSideRole = direction === 1 ? 'wing-left' : 'wing-right';
        const sameSideRole = direction === 1 ? 'wing-right' : 'wing-left';
        const oppositeIndex = diamondSlots.findIndex((s) => s.role === oppositeSideRole);
        const sameIndex = diamondSlots.findIndex((s) => s.role === sameSideRole);
        const bijection = computeDiamondBijection('echelon', n, direction);
        expect(bijection[oppositeIndex]!).toBeLessThan(bijection[sameIndex]!);
      }
    }
  });

  it('always routes slot/tail behind both wings for echelon, regardless of side (n=4,5,6, both directions)', () => {
    for (const n of [4, 5, 6]) {
      for (const direction of DIRECTIONS) {
        const diamondSlots = generateDiamond({ planeCount: n });
        const wingIndices = diamondSlots
          .map((s, i) => ({ role: s.role, i }))
          .filter(({ role }) => role === 'wing-left' || role === 'wing-right')
          .map(({ i }) => i);
        const trailingIndices = diamondSlots
          .map((s, i) => ({ role: s.role, i }))
          .filter(({ role }) => role === 'slot' || role === 'tail' || role.startsWith('row2'))
          .map(({ i }) => i);
        const bijection = computeDiamondBijection('echelon', n, direction);
        const maxWingTarget = Math.max(...wingIndices.map((i) => bijection[i]!));
        const minTrailingTarget = Math.min(...trailingIndices.map((i) => bijection[i]!));
        expect(minTrailingTarget).toBeGreaterThan(maxWingTarget);
      }
    }
  });
});
