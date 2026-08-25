import type { Object3D } from 'three';
import type { Pose } from './FormationAnimator';

/** The only place `three` and the pure Pose math meet. */
export function applyPoseToObject3D(object: Object3D, pose: Pose): void {
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
}
