import { describe, expect, it } from 'vitest';
import { generateEchelon } from '../../src/formations/echelon';

describe('generateEchelon', () => {
  it('produces planeCount slots with a single lead at the origin', () => {
    const slots = generateEchelon({ planeCount: 4 });
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ role: 'lead', offset: { x: 0, y: 0, z: 0 } });
  });

  it('steps every non-lead slot out to the right for direction=1', () => {
    const slots = generateEchelon({ planeCount: 5, echelonDirection: 1 });
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]!.offset.x).toBeGreaterThan(slots[i - 1]!.offset.x);
    }
  });

  it('mirrors to the left for direction=-1', () => {
    const right = generateEchelon({ planeCount: 5, echelonDirection: 1 });
    const left = generateEchelon({ planeCount: 5, echelonDirection: -1 });
    right.forEach((slot, i) => {
      expect(left[i]!.offset.x).toBeCloseTo(-slot.offset.x, 9);
      expect(left[i]!.offset.y).toBeCloseTo(slot.offset.y, 9);
      expect(left[i]!.offset.z).toBeCloseTo(slot.offset.z, 9);
    });
  });

  it('steps depth and altitude monotonically down the line', () => {
    const slots = generateEchelon({ planeCount: 6 });
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]!.offset.z).toBeGreaterThan(slots[i - 1]!.offset.z);
      expect(slots[i]!.offset.y).toBeLessThan(slots[i - 1]!.offset.y);
    }
  });
});
