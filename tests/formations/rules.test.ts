import { describe, expect, it } from 'vitest';
import { canChangePlaneCount, canTransitionTo } from '../../src/formations/rules';

describe('canTransitionTo', () => {
  it('allows diamond -> any other formation', () => {
    expect(canTransitionTo('diamond', 'echelon')).toBe(true);
    expect(canTransitionTo('diamond', 'trail')).toBe(true);
  });

  it('allows any formation -> diamond', () => {
    expect(canTransitionTo('echelon', 'diamond')).toBe(true);
    expect(canTransitionTo('trail', 'diamond')).toBe(true);
  });

  it('rejects direct transitions between two non-diamond formations', () => {
    expect(canTransitionTo('echelon', 'trail')).toBe(false);
    expect(canTransitionTo('trail', 'echelon')).toBe(false);
  });

  it('rejects a no-op transition to the same formation', () => {
    expect(canTransitionTo('diamond', 'diamond')).toBe(false);
    expect(canTransitionTo('echelon', 'echelon')).toBe(false);
  });
});

describe('canChangePlaneCount', () => {
  it('only allows changing plane count while in diamond', () => {
    expect(canChangePlaneCount('diamond')).toBe(true);
    expect(canChangePlaneCount('echelon')).toBe(false);
    expect(canChangePlaneCount('trail')).toBe(false);
  });
});
