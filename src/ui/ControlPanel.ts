import type { Skin } from '../aircraft/SkinManager';
import { MAX_PLANES, MIN_PLANES } from '../formations/types';
import type { EchelonDirection, FormationType } from '../formations/types';

export interface ControlPanelState {
  readonly formation: FormationType;
  readonly echelonDirection: EchelonDirection;
  readonly planeCount: number;
  readonly transitioning: boolean;
  readonly skins: readonly Skin[];
  readonly activeSkinId: string | null;
  readonly transitionDurationSeconds: number;
}

export interface ControlPanelCallbacks {
  readonly onPlaneCountChange: (count: number) => void;
  readonly onTransitionRequest: (target: FormationType, echelonDirection: EchelonDirection) => void;
  readonly onSkinChange: (skinId: string) => void;
  readonly onDurationChange: (seconds: number) => void;
  readonly onResetView: () => void;
}

const FORMATION_LABELS: Record<FormationType, string> = {
  diamond: 'Diamond',
  echelon: 'Echelon',
  trail: 'Trail',
};

export class ControlPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: ControlPanelCallbacks,
  ) {}

  render(state: ControlPanelState): void {
    this.root.replaceChildren(
      this.buildHeading(state),
      this.buildPlaneCountControl(state),
      this.buildFormationButtons(state),
      this.buildSkinPicker(state),
      this.buildDurationControl(state),
      this.buildViewControl(),
    );
  }

  private buildHeading(state: ControlPanelState): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section panel-heading';

    const title = document.createElement('h1');
    title.textContent = 'PF Aerobatics';

    const status = document.createElement('p');
    const directionSuffix =
      state.formation === 'echelon' ? (state.echelonDirection === 1 ? ' (Right)' : ' (Left)') : '';
    status.textContent = `Current formation: ${FORMATION_LABELS[state.formation]}${directionSuffix}`;

    section.append(title, status);

    if (state.transitioning) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'transitioning…';
      section.append(badge);
    }

    return section;
  }

  private buildPlaneCountControl(state: ControlPanelState): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';

    const label = document.createElement('label');
    label.htmlFor = 'plane-count';
    label.textContent = `Planes: ${state.planeCount}`;

    const input = document.createElement('input');
    input.id = 'plane-count';
    input.type = 'range';
    input.min = String(MIN_PLANES);
    input.max = String(MAX_PLANES);
    input.step = '1';
    input.value = String(state.planeCount);

    const locked = state.formation !== 'diamond';
    input.disabled = locked || state.transitioning;
    input.addEventListener('input', () => {
      this.callbacks.onPlaneCountChange(Number(input.value));
    });

    section.append(label, input);

    if (locked) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Return to Diamond to change plane count.';
      section.append(hint);
    }

    return section;
  }

  private buildFormationButtons(state: ControlPanelState): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section panel-buttons';

    const buttons: HTMLButtonElement[] =
      state.formation === 'diamond'
        ? [
            this.makeButton('Echelon Left', () =>
              this.callbacks.onTransitionRequest('echelon', -1),
            ),
            this.makeButton('Echelon Right', () =>
              this.callbacks.onTransitionRequest('echelon', 1),
            ),
            this.makeButton('Trail', () => this.callbacks.onTransitionRequest('trail', 1)),
          ]
        : [
            this.makeButton('Return to Diamond', () =>
              this.callbacks.onTransitionRequest('diamond', state.echelonDirection),
            ),
          ];

    for (const button of buttons) {
      button.disabled = state.transitioning;
    }
    section.append(...buttons);

    return section;
  }

  private buildSkinPicker(state: ControlPanelState): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';
    if (state.skins.length === 0) return section;

    const label = document.createElement('label');
    label.htmlFor = 'skin-select';
    label.textContent = 'Skin';

    const select = document.createElement('select');
    select.id = 'skin-select';
    for (const skin of state.skins) {
      const option = document.createElement('option');
      option.value = skin.id;
      option.textContent = skin.label;
      option.selected = skin.id === state.activeSkinId;
      select.append(option);
    }
    select.addEventListener('change', () => this.callbacks.onSkinChange(select.value));

    section.append(label, select);
    return section;
  }

  private buildViewControl(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent =
      'WASD to fly (follows look direction) · Shift for speed · click canvas to look · Esc to release · 1-6 hop to a cockpit';
    section.append(hint);

    section.append(this.makeButton('Reset View', () => this.callbacks.onResetView()));

    return section;
  }

  private buildDurationControl(state: ControlPanelState): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';

    const label = document.createElement('label');
    label.htmlFor = 'duration';
    label.textContent = `Transition duration: ${state.transitionDurationSeconds.toFixed(1)}s`;

    const input = document.createElement('input');
    input.id = 'duration';
    input.type = 'range';
    input.min = '6';
    input.max = '12';
    input.step = '0.5';
    input.value = String(state.transitionDurationSeconds);
    input.addEventListener('input', () => {
      this.callbacks.onDurationChange(Number(input.value));
    });

    section.append(label, input);
    return section;
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}
