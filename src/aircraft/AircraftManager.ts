import { Group, Quaternion, type Object3D, Vector3 } from 'three';
import type { Updatable } from '../core/Updatable';
import { generateDiamond } from '../formations/diamond';
import { computeDiamondBijection } from '../formations/matchAircraft';
import { generateFormationSlots } from '../formations/registry';
import { canTransitionTo } from '../formations/rules';
import type { AircraftId, EchelonDirection, FormationType, Slot } from '../formations/types';
import { applyPoseToObject3D } from '../animation/applyPose';
import type { AircraftTransition } from '../animation/FormationAnimator';
import { FormationTransitionRunner } from '../animation/FormationAnimator';
import type { AircraftLoader } from './AircraftLoader';
import { createNumberSprite } from './NumberLabel';
import type { Skin } from './SkinManager';
import { applySkin } from './SkinManager';

export interface AircraftManagerOptions {
  readonly planeCount: number;
  readonly transitionDurationSeconds: number;
}

/**
 * The L-39C GLB's rest pose points its nose along +X, not the -Z "forward" every formation offset
 * and heading in this app assumes (see formations/types.ts). This constant corrects for that once,
 * here at the render-adapter boundary, so the pure formation/animation math never has to know about
 * any particular model's authored orientation. +90° (turn left) takes +X to -Z.
 */
const MODEL_FORWARD_YAW_CORRECTION_RAD = Math.PI / 2;

/**
 * Slight nose-up angle of attack applied to every aircraft at rest, purely cosmetic (a level
 * fuselage reads as "parked," not "flying"). Composed as the Euler z-component: since the yaw
 * correction above is applied first (Euler 'XYZ' order), the model's local Z axis is already the
 * horizontal wing axis by the time this pitch is applied, so it tilts the nose up regardless of
 * yaw/echelon direction rather than rolling the model.
 */
const AOA_PITCH_RAD = (1 * Math.PI) / 180;

/**
 * Rough estimate of the pilot seat position in the model's local space (forward and up from the
 * pivot; centered laterally, since a tandem two-seat trainer has both seats on the centerline).
 * This hasn't been verified against the real GLB's cockpit geometry — see README's "Adding the
 * L-39C model" section — so nudge it once you've seen how close it actually lands to the canopy.
 */
const PILOT_LOCAL_OFFSET = new Vector3(6.7, 2.5, 0);

/** Local-space position of the floating number label, above the canopy. */
const NUMBER_LABEL_LOCAL_OFFSET = new Vector3(0, 4, 0);

/**
 * Owns the live aircraft Object3D instances and drives transitions between formations. Aircraft
 * identity `k` is always its Diamond home-slot index (see AircraftId), so returning to Diamond
 * never needs a solver — it's just "go back to slot k". `onStateChange` fires only when a
 * transition starts or completes (not every frame), so UI can re-render cheaply on real changes.
 */
export class AircraftManager implements Updatable {
  private readonly group = new Group();
  private instances: Object3D[] = [];
  private currentFormation: FormationType = 'diamond';
  private currentDirection: EchelonDirection = 1;
  private runner: FormationTransitionRunner | null = null;
  private pendingTarget: FormationType | null = null;
  private pendingDirection: EchelonDirection = 1;
  private planeCount: number;
  private transitionDurationSeconds: number;
  private currentSkins: readonly Skin[] | null = null;

  constructor(
    private readonly loader: AircraftLoader,
    options: AircraftManagerOptions,
    private readonly onStateChange?: () => void,
  ) {
    this.planeCount = options.planeCount;
    this.transitionDurationSeconds = options.transitionDurationSeconds;
  }

  get object3D(): Object3D {
    return this.group;
  }

  get formation(): FormationType {
    return this.currentFormation;
  }

  get direction(): EchelonDirection {
    return this.currentDirection;
  }

  get isTransitioning(): boolean {
    return this.runner !== null;
  }

  /**
   * Human-facing plane numbering (1=lead, 2=right wing, 3=left wing, 4=next row back, ...),
   * indexed 0-based here: `pilotHotkeyOrder()[0]` is the lead's AircraftId, `[1]` is plane 2's, etc.
   * Reuses the Diamond->Trail bijection rather than re-deriving the ordering — trail's queue order
   * *is* this numbering (see matchAircraft.ts and the trail-ordering rule it documents).
   */
  pilotHotkeyOrder(): AircraftId[] {
    const bijection = computeDiamondBijection('trail', this.planeCount, 1);
    const order: AircraftId[] = new Array(this.planeCount);
    bijection.forEach((humanIndex, aircraftId) => {
      order[humanIndex] = aircraftId;
    });
    return order;
  }

  /** World-space position of aircraftId's pilot seat (see PILOT_LOCAL_OFFSET), or undefined if
   * that aircraft doesn't currently exist (aircraftId >= current plane count). */
  getPilotWorldPosition(aircraftId: AircraftId): Vector3 | undefined {
    const instance = this.instances[aircraftId];
    if (!instance) return undefined;
    const worldPosition = instance.getWorldPosition(new Vector3());
    const worldQuaternion = instance.getWorldQuaternion(new Quaternion());
    return worldPosition.add(PILOT_LOCAL_OFFSET.clone().applyQuaternion(worldQuaternion));
  }

  /** Discards current instances and spawns `planeCount` fresh ones, reset to Diamond. */
  rebuild(planeCount: number): void {
    this.planeCount = planeCount;
    for (const instance of this.instances) this.group.remove(instance);

    this.instances = Array.from({ length: planeCount }, () => this.loader.createInstance());

    const hotkeyOrder = this.pilotHotkeyOrder(); // hotkeyOrder[i] = the AircraftId shown as number i+1
    this.instances.forEach((instance, aircraftId) => {
      this.group.add(instance);
      const humanNumber = hotkeyOrder.indexOf(aircraftId) + 1;
      const label = createNumberSprite(humanNumber);
      label.position.copy(NUMBER_LABEL_LOCAL_OFFSET);
      instance.add(label);
    });

    this.currentFormation = 'diamond';
    this.currentDirection = 1;
    this.runner = null;
    this.pendingTarget = null;
    this.applyStaticFormation('diamond', 1);

    if (this.currentSkins) void this.applySkins(this.currentSkins);
  }

  /**
   * Assigns skins[aircraftId % skins.length] to each aircraft — a stable per-plane tail number
   * (AircraftId is permanent, see the class doc comment) rather than every plane wearing the same
   * livery, so pilots can tell planes apart at a glance. Cycles if there are fewer skins than planes.
   */
  async applySkins(skins: readonly Skin[]): Promise<void> {
    this.currentSkins = skins;
    await Promise.all(
      this.instances.map((instance, aircraftId) =>
        applySkin(instance, skins[aircraftId % skins.length]!),
      ),
    );
  }

  setTransitionDuration(seconds: number): void {
    this.transitionDurationSeconds = seconds;
  }

  canTransitionTo(target: FormationType): boolean {
    return !this.isTransitioning && canTransitionTo(this.currentFormation, target);
  }

  transitionTo(target: FormationType, echelonDirection: EchelonDirection = 1): void {
    if (!this.canTransitionTo(target)) return;

    const sourceSlots = this.slotsFor(this.currentFormation, this.currentDirection);
    const targetSlots = this.slotsFor(target, echelonDirection);

    const transitions: AircraftTransition[] = this.instances.map((_, aircraftId) => ({
      aircraftId,
      source:
        sourceSlots[this.slotIndexFor(this.currentFormation, this.currentDirection, aircraftId)]!
          .offset,
      target: targetSlots[this.slotIndexFor(target, echelonDirection, aircraftId)]!.offset,
    }));

    this.runner = new FormationTransitionRunner(transitions, this.transitionDurationSeconds);
    this.pendingTarget = target;
    this.pendingDirection = echelonDirection;
    this.onStateChange?.();
  }

  update(dtSeconds: number): void {
    if (!this.runner) return;

    this.runner.update(dtSeconds);
    const poses = this.runner.poses();
    this.instances.forEach((instance, aircraftId) => {
      const pose = poses.get(aircraftId);
      // Orientation is intentionally left untouched here — aircraft hold a fixed heading for the
      // whole transition and just slide between slots (see FormationTransitionRunner's doc comment).
      if (pose) applyPoseToObject3D(instance, pose);
    });

    if (this.runner.done) {
      this.currentFormation = this.pendingTarget!;
      this.currentDirection = this.pendingDirection;
      this.runner = null;
      this.pendingTarget = null;
      this.applyStaticFormation(this.currentFormation, this.currentDirection);
      this.onStateChange?.();
    }
  }

  private slotsFor(formation: FormationType, direction: EchelonDirection): Slot[] {
    return formation === 'diamond'
      ? generateDiamond({ planeCount: this.planeCount })
      : generateFormationSlots(formation, this.planeCount, direction);
  }

  private slotIndexFor(
    formation: FormationType,
    direction: EchelonDirection,
    aircraftId: AircraftId,
  ): number {
    if (formation === 'diamond') return aircraftId;
    return computeDiamondBijection(formation, this.planeCount, direction)[aircraftId]!;
  }

  private applyStaticFormation(formation: FormationType, direction: EchelonDirection): void {
    const slots = this.slotsFor(formation, direction);
    this.instances.forEach((instance, aircraftId) => {
      const offset = slots[this.slotIndexFor(formation, direction, aircraftId)]!.offset;
      instance.position.set(offset.x, offset.y, offset.z);
      instance.rotation.set(0, MODEL_FORWARD_YAW_CORRECTION_RAD, AOA_PITCH_RAD);
    });
  }
}
