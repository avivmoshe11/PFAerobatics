import { describe, expect, it } from 'vitest';
import { clamp01, degToRad, easeInOutCubic, easeLinearWithEdges, lerp, linear } from '../../src/utils/math';

describe('clamp01', () => {
  it('clamps into [0, 1]', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(2)).toBe(1);
  });
});

describe('lerp', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('degToRad', () => {
  it('converts degrees to radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 9);
    expect(degToRad(0)).toBe(0);
  });
});

describe('easing functions', () => {
  it('linear is the identity', () => {
    expect(linear(0.3)).toBe(0.3);
  });

  it('easeInOutCubic passes through the endpoints', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 9);
  });

  describe('easeLinearWithEdges', () => {
    it('passes through the endpoints', () => {
      expect(easeLinearWithEdges(0, 0.1)).toBe(0);
      expect(easeLinearWithEdges(1, 0.1)).toBe(1);
    });

    it('is the identity when edgeFraction is 0 (pure linear)', () => {
      expect(easeLinearWithEdges(0.3, 0)).toBeCloseTo(0.3, 9);
      expect(easeLinearWithEdges(0.73, 0)).toBeCloseTo(0.73, 9);
    });

    it('moves at constant speed through the middle (equal steps cover equal distance)', () => {
      const f = 0.2;
      const stepA = easeLinearWithEdges(0.5, f) - easeLinearWithEdges(0.4, f);
      const stepB = easeLinearWithEdges(0.7, f) - easeLinearWithEdges(0.6, f);
      expect(stepA).toBeCloseTo(stepB, 9);
    });

    it('accelerates through the leading edge and decelerates through the trailing edge', () => {
      const f = 0.3;
      // Ramp-in: later steps within the edge cover more distance (still speeding up).
      const rampInEarly = easeLinearWithEdges(0.1, f) - easeLinearWithEdges(0.05, f);
      const rampInLate = easeLinearWithEdges(0.3, f) - easeLinearWithEdges(0.25, f);
      expect(rampInLate).toBeGreaterThan(rampInEarly);

      // Ramp-out: later steps within the edge cover less distance (still slowing down).
      const rampOutEarly = easeLinearWithEdges(0.75, f) - easeLinearWithEdges(0.7, f);
      const rampOutLate = easeLinearWithEdges(0.95, f) - easeLinearWithEdges(0.9, f);
      expect(rampOutLate).toBeLessThan(rampOutEarly);
    });

    it('clamps edgeFraction above 0.5 (the two edges cannot overlap)', () => {
      expect(easeLinearWithEdges(0.5, 10)).toBeCloseTo(easeLinearWithEdges(0.5, 0.5), 9);
    });
  });
});
