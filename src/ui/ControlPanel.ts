import { MAX_PLANES, MIN_PLANES } from '../formations/types';
import type { EchelonDirection, FormationType } from '../formations/types';

export interface ControlPanelState {
  readonly formation: FormationType;
  readonly echelonDirection: EchelonDirection;
  readonly planeCount: number;
  readonly transitioning: boolean;
  readonly transitionDurationSeconds: number;
}

export interface ControlPanelCallbacks {
  readonly onPlaneCountChange: (count: number) => void;
  readonly onTransitionRequest: (target: FormationType, echelonDirection: EchelonDirection) => void;
  readonly onDurationChange: (seconds: number) => void;
  readonly onResetView: () => void;
  /** Fired whenever setOpen() actually changes state — from any trigger (M key, the close
   * button, or clicking the backdrop), so callers have one place to react (e.g. pointer lock). */
  readonly onOpenChange: (open: boolean) => void;
}

const FORMATION_LABELS: Record<FormationType, string> = {
  diamond: 'Diamond',
  echelon: 'Echelon',
  trail: 'Trail',
  'diamond-slot': 'Diamond Slot',
};

export class ControlPanel {
  constructor(
    private readonly root: HTMLElement,
    private readonly callbacks: ControlPanelCallbacks,
  ) {
    // Click the backdrop (not the card itself) to close, like any standard modal.
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.setOpen(false);
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  /**
   * `notify=false` closes/opens without firing onOpenChange — for Esc specifically, which should
   * close the menu but never re-engage pointer lock the way every other close path does.
   */
  setOpen(open: boolean, notify = true): void {
    if (open === this.isOpen) return;
    this.root.classList.toggle('open', open);
    if (notify) this.callbacks.onOpenChange(open);
  }

  render(state: ControlPanelState): void {
    const card = document.createElement('div');
    card.className = 'modal-card';
    card.append(
      this.buildCloseButton(),
      this.buildHeading(state),
      this.buildPlaneCountControl(state),
      this.buildFormationButtons(state),
      this.buildDurationControl(state),
      this.buildViewControl(),
    );
    this.root.replaceChildren(card);
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
            this.makeButton('Diamond Slot', () =>
              this.callbacks.onTransitionRequest('diamond-slot', 1),
            ),
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

  private buildViewControl(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'panel-section';

    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent =
      'WASD to fly (follows look direction) · Shift for speed · any key looks around · Esc to release · 1-6 hop to a cockpit · R reset view · T diamond · M toggles this menu';
    section.append(hint);

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

  private buildCloseButton(): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'modal-close-button';
    button.textContent = '✕';
    button.setAttribute('aria-label', 'Close menu');
    button.addEventListener('click', () => this.setOpen(false));
    return button;
  }

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }
}
