import type { FormationType } from './types';

/** Diamond is the hub: transitions only ever go Diamond->X or X->Diamond, never X->Y directly. */
export function canTransitionTo(current: FormationType, target: FormationType): boolean {
  if (current === target) return false;
  return current === 'diamond' || target === 'diamond';
}

/** Plane count can only change while in Diamond, mirroring the hub-only-transition rule. */
export function canChangePlaneCount(current: FormationType): boolean {
  return current === 'diamond';
}
