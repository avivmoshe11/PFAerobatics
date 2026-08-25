import { PerspectiveCamera, type Quaternion, Vector3 } from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { Updatable } from './Updatable';

const MOVE_SPEED = 16; // scene units per second — 0.4x the original 40 default
const FAST_SPEED_MULTIPLIER = 4; // held with Shift
const WORLD_UP = new Vector3(0, 1, 0);
const INITIAL_POSITION = new Vector3(60, 35, 90);
const INITIAL_LOOK_AT = new Vector3(0, -8, 0);

interface MoveState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
}

const MOVE_KEYS: Record<string, keyof MoveState> = {
  w: 'forward',
  s: 'backward',
  a: 'left',
  d: 'right',
};

/**
 * FPS-style look: mouse movement rotates the camera in place via the browser's Pointer Lock API
 * (engaged by clicking the canvas, released with Esc — both browser-mandated, not overridable),
 * rather than orbiting the camera around a fixed target. W/S move along the exact direction the
 * camera is currently looking (including pitch — look up and W climbs, look down and W dives),
 * like a free-fly/noclip camera rather than a level walk. A/D strafe stays level regardless of
 * look pitch, since PointerLockControls never introduces roll. Holding Shift moves faster.
 *
 * Deliberately has no idea what a "plane" or "formation" is — viewFromCockpit takes a plain
 * position-getter callback rather than any aircraft-domain type, so this stays a generic engine
 * component (see aircraft/AircraftManager.ts and main.ts for how it's actually wired up).
 */
export class FirstPersonCameraRig implements Updatable {
  readonly camera: PerspectiveCamera;
  readonly controls: PointerLockControls;

  private readonly initialPosition: Vector3;
  private readonly initialQuaternion: Quaternion;
  private readonly moveState: MoveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };
  private fastModifier = false;
  private followPosition: (() => Vector3 | undefined) | null = null;

  constructor(domElement: HTMLElement, aspect: number) {
    this.camera = new PerspectiveCamera(50, aspect, 0.1, 5000);
    this.camera.position.copy(INITIAL_POSITION);
    this.camera.lookAt(INITIAL_LOOK_AT);

    this.controls = new PointerLockControls(this.camera, domElement);
    domElement.addEventListener('click', () => this.controls.lock());

    this.initialPosition = this.camera.position.clone();
    this.initialQuaternion = this.camera.quaternion.clone();

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  get isLocked(): boolean {
    return this.controls.isLocked;
  }

  /** Subscribes to pointer-lock engage/release, e.g. to toggle a "click to look around" hint. */
  onLockChange(listener: (locked: boolean) => void): void {
    this.controls.addEventListener('lock', () => listener(true));
    this.controls.addEventListener('unlock', () => listener(false));
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Restores the camera to its position/orientation as of construction. */
  resetView(): void {
    this.followPosition = null;
    this.camera.position.copy(this.initialPosition);
    this.camera.quaternion.copy(this.initialQuaternion);
  }

  /**
   * Teleports to a pilot seat and keeps tracking that aircraft's position every frame after — if
   * it moves during a formation transition, the camera moves with it. Broken by pressing a
   * movement key (see handleKeyDown) or resetView().
   *
   * Orientation, in contrast, is set once and then left alone (mouse-look still works normally on
   * top of it): with no `lookAt`, faces forward (-Z world) — every aircraft shares that heading
   * since none of them bank/turn in this app. With `lookAt` (e.g. the lead's cockpit at the moment
   * of the hop), faces that point instead, matching how a wingman actually watches their lead —
   * but it isn't re-aimed every frame, since continuously re-snapping orientation while your own
   * position is also sliding during a transition reads as a disorienting sweep, not a look.
   */
  viewFromCockpit(getPosition: () => Vector3 | undefined, lookAt?: Vector3): void {
    this.followPosition = getPosition;
    const position = getPosition();
    if (!position) return;
    this.camera.position.copy(position);
    if (lookAt) {
      this.camera.lookAt(lookAt);
    } else {
      this.camera.quaternion.identity();
    }
  }

  update(dtSeconds: number): void {
    if (this.followPosition) {
      const position = this.followPosition();
      if (position) this.camera.position.copy(position);
    }
    this.applyMovement(dtSeconds);
  }

  private applyMovement(dtSeconds: number): void {
    const { forward, backward, left, right } = this.moveState;
    if (!forward && !backward && !left && !right) return;

    const step = MOVE_SPEED * (this.fastModifier ? FAST_SPEED_MULTIPLIER : 1) * dtSeconds;

    const forwardVec = new Vector3();
    this.camera.getWorldDirection(forwardVec); // full 3D look direction, pitch included

    const rightVec = forwardVec.clone().cross(WORLD_UP);
    if (rightVec.lengthSq() > 1e-9) rightVec.normalize();

    const delta = new Vector3();
    if (forward) delta.add(forwardVec);
    if (backward) delta.sub(forwardVec);
    if (right) delta.add(rightVec);
    if (left) delta.sub(rightVec);
    if (delta.lengthSq() > 1e-9) delta.normalize();
    delta.multiplyScalar(step);

    this.camera.position.add(delta);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const moveKey = MOVE_KEYS[key];
    if (moveKey) {
      event.preventDefault();
      this.moveState[moveKey] = true;
      this.followPosition = null; // flying under your own control means you've left the seat
      return;
    }
    if (key === 'shift') this.fastModifier = true;
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    const moveKey = MOVE_KEYS[key];
    if (moveKey) {
      event.preventDefault();
      this.moveState[moveKey] = false;
      return;
    }
    if (key === 'shift') this.fastModifier = false;
  };
}
