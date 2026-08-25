import { describe, expect, it } from 'vitest';
import { generateDiamond } from '../../src/formations/diamond';
import { MAX_PLANES, MIN_PLANES } from '../../src/formations/types';

describe('generateDiamond', () => {
  for (let n = MIN_PLANES; n <= MAX_PLANES; n += 1) {
    it(`produces exactly ${n} slots for planeCount=${n}`, () => {
      expect(generateDiamond({ planeCount: n })).toHaveLength(n);
    });

    it(`has exactly one lead at the origin for planeCount=${n}`, () => {
      const slots = generateDiamond({ planeCount: n });
      const leads = slots.filter((slot) => slot.role === 'lead');
      expect(leads).toHaveLength(1);
      expect(leads[0]!.offset).toEqual({ x: 0, y: 0, z: 0 });
    });

    if (n === 2) {
      it('offsets the single wingman to one side for planeCount=2', () => {
        const slots = generateDiamond({ planeCount: 2 });
        const wing = slots.find((slot) => slot.role !== 'lead')!;
        expect(wing.offset.x).not.toBe(0);
      });
    } else {
      it(`is laterally symmetric for planeCount=${n}`, () => {
        const slots = generateDiamond({ planeCount: n });
        const lateralSum = slots.reduce((sum, slot) => sum + slot.offset.x, 0);
        expect(lateralSum).toBeCloseTo(0, 9);
      });
    }

    it(`has no two slots at the same offset for planeCount=${n}`, () => {
      const slots = generateDiamond({ planeCount: n });
      const keys = slots.map((slot) => `${slot.offset.x},${slot.offset.y},${slot.offset.z}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it(`never places a non-lead slot behind or level with the lead for planeCount=${n}`, () => {
      const slots = generateDiamond({ planeCount: n });
      for (const slot of slots) {
        if (slot.role === 'lead') continue;
        expect(slot.offset.z).toBeGreaterThan(0);
      }
    });
  }

  it('rejects out-of-range plane counts', () => {
    expect(() => generateDiamond({ planeCount: 1 })).toThrow(RangeError);
    expect(() => generateDiamond({ planeCount: 7 })).toThrow(RangeError);
    expect(() => generateDiamond({ planeCount: 3.5 })).toThrow(RangeError);
  });
});
