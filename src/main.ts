import { LoadingManager } from 'three';
import { App } from './core/App';
import { AircraftLoader } from './aircraft/AircraftLoader';
import { AircraftManager } from './aircraft/AircraftManager';
import type { Skin } from './aircraft/SkinManager';
import { canChangePlaneCount } from './formations/rules';
import { ControlPanel } from './ui/ControlPanel';
import type { ControlPanelState } from './ui/ControlPanel';

const MODEL_URL = '/models/L39C2.glb';

const SKINS: Skin[] = [
  { id: 'iaf-1', label: 'IAF 1', textureUrl: '/skins/L39C_DIFF_IAF-1.png' },
  { id: 'iaf-2', label: 'IAF 2', textureUrl: '/skins/L39C_DIFF_IAF-2.png' },
  { id: 'iaf-3', label: 'IAF 3', textureUrl: '/skins/L39C_DIFF_IAF-3.png' },
  { id: 'iaf-4', label: 'IAF 4', textureUrl: '/skins/L39C_DIFF_IAF-4.png' },
  { id: 'iaf-5', label: 'IAF 5', textureUrl: '/skins/L39C_DIFF_IAF-5.png' },
  { id: 'iaf-6', label: 'IAF 6', textureUrl: '/skins/L39C_DIFF_IAF-6.png' },
];

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

  await manager.applySkins(SKINS);

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
    onDurationChange: (seconds) => {
      transitionDurationSeconds = seconds;
      manager.setTransitionDuration(seconds);
      render();
    },
    onResetView: () => {
      app.cameraRig.resetView();
    },
    // Menu open = cursor usable, look-around off. Menu closed = look-around back on. Covers every
    // way the menu can open/close (M key, the close button, clicking the backdrop) from one place.
    onOpenChange: (open) => {
      if (open) {
        if (app.cameraRig.isLocked) app.cameraRig.controls.unlock();
      } else {
        app.cameraRig.controls.lock();
      }
    },
  });

  function render(): void {
    const state: ControlPanelState = {
      formation: manager.formation,
      echelonDirection: manager.direction,
      planeCount,
      transitioning: manager.isTransitioning,
      transitionDurationSeconds,
    };
    panel.render(state);
  }

  // M toggles the control panel modal. R resets the camera view. T returns to Diamond (a no-op,
  // via manager.transitionTo's own guard, if already in Diamond or mid-transition). Number keys
  // hop the camera to a pilot seat: 1=lead, 2=right wing, 3=left wing, ... (see
  // AircraftManager.pilotHotkeyOrder). Every seat but the lead's looks toward the lead's cockpit
  // as of the moment of the hop, matching how a wingman actually watches their lead in formation;
  // the lead just looks forward. Position keeps tracking the aircraft live afterward (see
  // FirstPersonCameraRig.viewFromCockpit), so the camera follows it through a formation
  // transition — but the look direction is only set once, not continuously re-aimed.
  //
  // There's no more "click the canvas to look around" — browsers require a real user gesture
  // before granting pointer lock, and a keypress counts just as well as a click does, so any key
  // other than the menu/quick-action ones below implicitly engages it (when the menu is closed).
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();

    if (key === 'escape') {
      // Esc closes the menu if it's open, but — unlike every other way of closing it — never
      // re-engages pointer lock; the browser already uses Esc to release it, so re-locking here
      // would immediately fight that. Otherwise Esc does nothing on our end (the browser's own
      // release-on-Esc behavior for pointer lock still happens independently of this).
      if (panel.isOpen) panel.setOpen(false, false);
      return;
    }

    if (key === 'm') {
      panel.setOpen(!panel.isOpen);
      return;
    }

    if (key === 'r') {
      app.cameraRig.resetView();
      return;
    }

    if (key === 't') {
      manager.transitionTo('diamond', manager.direction);
      return;
    }

    if (!panel.isOpen && !app.cameraRig.isLocked) {
      app.cameraRig.controls.lock();
    }

    const digit = Number(event.key);
    if (!Number.isInteger(digit) || digit < 1 || digit > planeCount) return;
    const hotkeyOrder = manager.pilotHotkeyOrder();
    const aircraftId = hotkeyOrder[digit - 1];
    if (aircraftId === undefined) return;
    const lookAt = digit === 1 ? undefined : manager.getPilotWorldPosition(hotkeyOrder[0]!);
    app.cameraRig.viewFromCockpit(() => manager.getPilotWorldPosition(aircraftId), lookAt);
  });

  render();
  app.start();
}

void main();
