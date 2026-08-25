import {
  Clock,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import type { Updatable } from './Updatable';
import { FirstPersonCameraRig } from './FirstPersonCameraRig';

const SKY_COLOR = 0x9fc7e8;
const GROUND_COLOR = 0x5c7a4a;

/**
 * Owns the renderer, scene, camera, lights, and the render loop. The loop itself is a flat list
 * of registered `Updatable`s (camera damping, formation animation, ...) — no bespoke per-frame
 * logic grows here as features are added.
 */
export class App {
  readonly scene: Scene;
  readonly renderer: WebGLRenderer;
  readonly cameraRig: FirstPersonCameraRig;

  private readonly clock = new Clock();
  private readonly updatables: Updatable[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new Scene();
    this.scene.background = new Color(SKY_COLOR);
    this.scene.fog = new Fog(SKY_COLOR, 300, 1200);

    this.renderer = new WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.cameraRig = new FirstPersonCameraRig(canvas, window.innerWidth / window.innerHeight);
    this.registerUpdatable(this.cameraRig);

    this.setupLights();
    this.setupGround();

    window.addEventListener('resize', () => this.handleResize());
  }

  registerUpdatable(updatable: Updatable): void {
    this.updatables.push(updatable);
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dtSeconds = Math.min(this.clock.getDelta(), 0.1);
      for (const updatable of this.updatables) updatable.update(dtSeconds);
      this.renderer.render(this.scene, this.cameraRig.camera);
    });
  }

  private setupLights(): void {
    this.scene.add(new HemisphereLight(0xffffff, 0x4b5a3a, 1.1));

    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(150, 220, 100);
    this.scene.add(sun);
  }

  private setupGround(): void {
    const ground = new Mesh(
      new PlaneGeometry(4000, 4000),
      new MeshStandardMaterial({ color: GROUND_COLOR }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -80;
    this.scene.add(ground);
  }

  private handleResize(): void {
    const { innerWidth, innerHeight } = window;
    this.renderer.setSize(innerWidth, innerHeight);
    this.cameraRig.setAspect(innerWidth / innerHeight);
  }
}
