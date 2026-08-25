import { describe, expect, it } from 'vitest';
import {
  computeCollisionDips,
  computePose,
  FormationTransitionRunner,
  lerpVec3,
} from '../../src/animation/FormationAnimator';
import type { Vec3 } from '../../src/formations/types';

const ORIGIN: Vec3 = { x: 0, y: 0, z: 0 };

describe('lerpVec3', () => {
  it('interpolates each axis independently', () => {
    const a: Vec3 = { x: 0, y: 0, z: 0 };
    const b: Vec3 = { x: 10, y: -20, z: 4 };
    expect(lerpVec3(a, b, 0.5)).toEqual({ x: 5, y: -10, z: 2 });
  });
});

describe('computePose', () => {
  const source: Vec3 = { x: 0, y: 0, z: 0 };
  const target: Vec3 = { x: 10, y: -5, z: 10 };

  it('starts exactly at source and ends exactly at target', () => {
    expect(computePose(0, source, target).position).toEqual(source);
    expect(computePose(1, source, target).position).toEqual(target);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(computePose(-1, source, target).position).toEqual(source);
    expect(computePose(2, source, target).position).toEqual(target);
  });
});

describe('computePose dip', () => {
  const dipSource: Vec3 = { x: 0, y: 0, z: 0 };
  const dipTarget: Vec3 = { x: 10, y: 0, z: 10 };

  it('applies no dip at the exact start or end of the move', () => {
    expect(computePose(0, dipSource, dipTarget, undefined, 3).position.y).toBe(0);
    expect(computePose(1, dipSource, dipTarget, undefined, 3).position.y).toBe(0);
  });

  it('dips below the interpolated height at the midpoint', () => {
    const withoutDip = computePose(0.5, dipSource, dipTarget, undefined, 0).position.y;
    const withDip = computePose(0.5, dipSource, dipTarget, undefined, 3).position.y;
    expect(withDip).toBeLessThan(withoutDip);
    expect(withoutDip - withDip).toBeCloseTo(3, 9); // sin(pi*0.5) = 1, full dipAmount applied
  });
});

describe('computeCollisionDips', () => {
  it('never dips a stationary lead, even when a mover crosses its position', () => {
    const transitions = [
      { aircraftId: 0, source: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }, // lead, stationary
      { aircraftId: 1, source: { x: 13, y: 0, z: 0 }, target: { x: -13, y: 0, z: 0 } }, // crosses through lead
    ];
    const dips = computeCollisionDips(transitions);
    expect(dips.has(0)).toBe(false);
    expect(dips.get(1)!).toBeGreaterThan(0);
  });

  it('assigns no dip when paths stay well separated', () => {
    const transitions = [
      { aircraftId: 0, source: { x: -50, y: 0, z: 0 }, target: { x: -50, y: 0, z: 10 } },
      { aircraftId: 1, source: { x: 50, y: 0, z: 0 }, target: { x: 50, y: 0, z: 10 } },
    ];
    expect(computeCollisionDips(transitions).size).toBe(0);
  });

  it('assigns no dip when two paths move in lockstep (constant separation)', () => {
    const transitions = [
      { aircraftId: 0, source: { x: 0, y: 0, z: 0 }, target: { x: 10, y: 0, z: 10 } },
      { aircraftId: 1, source: { x: 2, y: 0, z: 0 }, target: { x: 12, y: 0, z: 10 } },
    ];
    expect(computeCollisionDips(transitions).size).toBe(0);
  });

  it('breaks a tie between equal-length crossing paths by aircraftId', () => {
    const transitions = [
      { aircraftId: 5, source: { x: -10, y: 0, z: 0 }, target: { x: 10, y: 0, z: 0 } },
      { aircraftId: 2, source: { x: 10, y: 0, z: 0 }, target: { x: -10, y: 0, z: 0 } },
    ];
    const dips = computeCollisionDips(transitions);
    expect(dips.has(5)).toBe(true); // larger id
    expect(dips.has(2)).toBe(false);
  });
});

describe('FormationTransitionRunner', () => {
  it('reaches every aircraft target exactly once elapsed time meets the duration', () => {
    const runner = new FormationTransitionRunner(
      [
        { aircraftId: 0, source: ORIGIN, target: { x: 5, y: 0, z: 5 } },
        { aircraftId: 1, source: ORIGIN, target: { x: -5, y: 0, z: 5 } },
      ],
      2,
    );

    expect(runner.done).toBe(false);
    runner.update(1);
    expect(runner.done).toBe(false);
    runner.update(1);
    expect(runner.done).toBe(true);

    const poses = runner.poses();
    expect(poses.get(0)!.position).toEqual({ x: 5, y: 0, z: 5 });
    expect(poses.get(1)!.position).toEqual({ x: -5, y: 0, z: 5 });
  });

  it('rejects a non-positive duration', () => {
    expect(() => new FormationTransitionRunner([], 0)).toThrow(RangeError);
  });

  it('defaults to constant speed through the middle and eases only near the edges', () => {
    const duration = 10; // EDGE_EASE_SECONDS (1.5) leaves a real linear middle at this duration
    const target: Vec3 = { x: 100, y: 0, z: 0 };
    const deltaOverStep = (fromSeconds: number, stepSeconds: number): number => {
      const runner = new FormationTransitionRunner([{ aircraftId: 0, source: ORIGIN, target }], duration);
      runner.update(fromSeconds);
      const start = runner.poses().get(0)!.position.x;
      runner.update(stepSeconds);
      const end = runner.poses().get(0)!.position.x;
      return end - start;
    };

    const middleStep = deltaOverStep(5, 0.1);
    const otherMiddleStep = deltaOverStep(3, 0.1);
    expect(middleStep).toBeCloseTo(otherMiddleStep, 6);

    const leadingEdgeStep = deltaOverStep(0, 0.1); // inside the 1.5s ease-in window
    expect(leadingEdgeStep).toBeLessThan(middleStep);
  });

  it('dips a crossing yielding aircraft mid-transition and lands it exactly at target when done', () => {
    // Both start at the same point, so this is the same symmetric-crossing case as the test above —
    // aircraft 1 (larger id, equal path length) is the one that yields.
    const runner = new FormationTransitionRunner(
      [
        { aircraftId: 0, source: ORIGIN, target: { x: 5, y: 0, z: 5 } },
        { aircraftId: 1, source: ORIGIN, target: { x: -5, y: 0, z: 5 } },
      ],
      2,
    );

    runner.update(1); // halfway through the transition
    const midPoses = runner.poses();
    expect(midPoses.get(1)!.position.y).toBeLessThan(0);
    expect(midPoses.get(0)!.position.y).toBe(0); // lead-path-length aircraft holds altitude

    runner.update(1); // done
    expect(runner.poses().get(1)!.position).toEqual({ x: -5, y: 0, z: 5 });
  });
});
