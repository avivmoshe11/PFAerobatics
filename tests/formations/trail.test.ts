import { describe, expect, it } from 'vitest';
import { generateTrail } from '../../src/formations/trail';

describe('generateTrail', () => {
  it('produces planeCount slots with a single lead at the origin', () => {
    const slots = generateTrail({ planeCount: 4 });
    expect(slots).toHaveLength(4);
    expect(slots[0]).toEqual({ role: 'lead', offset: { x: 0, y: 0, z: 0 } });
  });

  it('keeps every slot centered on x=0', () => {
    const slots = generateTrail({ planeCount: 6 });
    for (const slot of slots) {
      expect(slot.offset.x).toBe(0);
    }
  });

  it('steps depth strictly forward and altitude non-increasing down the column', () => {
    const slots = generateTrail({ planeCount: 6 });
    for (let i = 1; i < slots.length; i += 1) {
      expect(slots[i]!.offset.z).toBeGreaterThan(slots[i - 1]!.offset.z);
      expect(slots[i]!.offset.y).toBeLessThan(slots[i - 1]!.offset.y);
    }
  });
});
