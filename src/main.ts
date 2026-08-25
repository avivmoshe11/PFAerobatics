import { LoadingManager } from 'three';
import { App } from './core/App';
import { AircraftLoader } from './aircraft/AircraftLoader';
import { AircraftManager } from './aircraft/AircraftManager';
import type { Skin } from './aircraft/SkinManager';
import { canChangePlaneCount } from './formations/rules';
import { ControlPanel } from './ui/ControlPanel';
import type { ControlPanelState } from './ui/ControlPanel';

const MODEL_URL = '/models/l39c.glb';

// Populate once squadron skin textures are added under public/skins/ — see README.
const SKINS: Skin[] = [];

const DEFAULT_PLANE_COUNT = 4;
const DEFAULT_DURATION_SECONDS = 9;

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

async function main(): Promise<void> {
  const canvas = requireElement<HTMLCanvasElement>('#scene-canvas');
  const panelContainer = requireElement<HTMLElement>('#control-panel');
  const loadingOverlay = requireElement<HTMLElement>('#loading-overlay');
  const loadingBarFill = requireElement<HTMLElement>('#loading-bar-fill');
  const loadingLabel = requireElement<HTMLElement>('#loading-label');
  const pointerLockHint = requireElement<HTMLElement>('#pointer-lock-hint');

  const app = new App(canvas);
  app.cameraRig.onLockChange((locked) => {
    pointerLockHint.classList.toggle('hidden', locked);
  });

  const loadingManager = new LoadingManager();
  loadingManager.onProgress = (_url, loaded, total) => {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
    loadingBarFill.style.width = `${pct}%`;
  };
  loadingManager.onLoad = () => {
    loadingOverlay.classList.add('hidden');
  };

  const aircraftLoader = new AircraftLoader(loadingManager);

  let planeCount = DEFAULT_PLANE_COUNT;
  let transitionDurationSeconds = DEFAULT_DURATION_SECONDS;
  let activeSkinId: string | null = SKINS[0]?.id ?? null;

  try {
    await aircraftLoader.load(MODEL_URL);
  } catch (error) {
    loadingLabel.textContent =
      'Could not load the L-39C model. Place l39c.glb under public/models/ — see README.';
    console.error(error);
    return;
  }

  const manager = new AircraftManager(
    aircraftLoader,
    { planeCount, transitionDurationSeconds },
    () => render(),
  );
  app.scene.add(manager.object3D);
  app.registerUpdatable(manager);
  manager.rebuild(planeCount);

  const initialSkin = SKINS.find((skin) => skin.id === activeSkinId) ?? null;
  if (initialSkin) await manager.applySkinToAll(initialSkin);

  // Number keys hop the camera to a pilot seat: 1=lead, 2=right wing, 3=left wing, ... (see
  // AircraftManager.pilotHotkeyOrder). Every seat but the lead's looks toward the lead's cockpit
  // as of the moment of the hop, matching how a wingman actually watches their lead in formation;
  // the lead just looks forward. Position keeps tracking the aircraft live afterward (see
  // FirstPersonCameraRig.viewFromCockpit), so the camera follows it through a formation
  // transition — but the look direction is only set once, not continuously re-aimed.
  window.addEventListener('keydown', (event) => {
    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 1 || digit > planeCount) return;
    const hotkeyOrder = manager.pilotHotkeyOrder();
    const aircraftId = hotkeyOrder[digit - 1];
    if (aircraftId === undefined) return;
    const lookAt = digit === 1 ? undefined : manager.getPilotWorldPosition(hotkeyOrder[0]!);
    app.cameraRig.viewFromCockpit(() => manager.getPilotWorldPosition(aircraftId), lookAt);
  });

  const panel = new ControlPanel(panelContainer, {
    onPlaneCountChange: (count) => {
      if (!canChangePlaneCount(manager.formation) || manager.isTransitioning) return;
      planeCount = count;
      manager.rebuild(count);
      render();
    },
    onTransitionRequest: (target, direction) => {
      manager.transitionTo(target, direction);
    },
    onSkinChange: (skinId) => {
      activeSkinId = skinId;
      const skin = SKINS.find((s) => s.id === skinId);
      if (skin) void manager.applySkinToAll(skin).then(render);
      render();
    },
    onDurationChange: (seconds) => {
      transitionDurationSeconds = seconds;
      manager.setTransitionDuration(seconds);
      render();
    },
    onResetView: () => {
      app.cameraRig.resetView();
    },
  });

  function render(): void {
    const state: ControlPanelState = {
      formation: manager.formation,
      echelonDirection: manager.direction,
      planeCount,
      transitioning: manager.isTransitioning,
      skins: SKINS,
      activeSkinId,
      transitionDurationSeconds,
    };
    panel.render(state);
  }

  render();
  app.start();
}

void main();
