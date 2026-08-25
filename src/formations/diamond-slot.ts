import type { FormationGenerator, Role, Slot } from './types';
import { assertValidPlaneCount } from './types';
import { negateZeroSafe } from '../utils/math';

interface RowSlotSpec {
  readonly lateral: number;
  readonly role: Role;
}

interface RowSpec {
  readonly depthBehind: number;
  readonly verticalDrop: number;
  readonly slots: readonly RowSlotSpec[];
}

const LEAD: RowSpec = { depthBehind: 0, verticalDrop: 0, slots: [{ lateral: 0, role: 'lead' }] };

// Base spacing units (scene units, roughly meters). Tuned by eye against the aircraft model,
// not derived from a formula — real formation spacing is a matter of visual judgment.
const LAT = 12.7;
const DEPTH = 10.5;
const VERT = 1.4;

/**
 * Nudges tail-right a hair deeper than tail-left (6-ship diamond) so trail's depth-first ordering
 * — not its right-before-left tie-break — decides which one queues later. That keeps the
 * human-facing "6" on the right without touching the shared tie-break rule the wing row's ordering
 * relies on (see matchAircraft.ts's compareDiamondRest and its trail tie-break tests).
 */
const TAIL_RIGHT_DEPTH_NUDGE = 0.1;

const WINGS: RowSpec = {
  depthBehind: DEPTH,
  verticalDrop: VERT,
  slots: [
    { lateral: -LAT, role: 'wing-left' },
    { lateral: LAT, role: 'wing-right' },
  ],
};

/**
 * Row table keyed by plane count. Diamond-derived formations are hand-composed shapes in real
 * squadrons, not the output of a closed-form formula, and a formula degenerates awkwardly at the
 * low-N edge cases (2, 3) — a table keeps every N an explicit, independently tunable, testable case.
 */
const DIAMOND_SLOT_TABLE: Record<number, readonly RowSpec[]> = {
  2: [
    LEAD,
    { depthBehind: DEPTH, verticalDrop: VERT, slots: [{ lateral: LAT, role: 'wing-right' }] },
  ],
  3: [LEAD, WINGS],
  4: [
    LEAD,
    WINGS,
    { depthBehind: DEPTH * 2, verticalDrop: VERT * 2, slots: [{ lateral: 0, role: 'slot' }] },
  ],
  5: [
    LEAD,
    WINGS,
    { depthBehind: DEPTH * 2, verticalDrop: VERT * 2, slots: [{ lateral: 0, role: 'slot' }] },
    { depthBehind: DEPTH * 3.7, verticalDrop: VERT * 4, slots: [{ lateral: 0, role: 'tail' }] },
  ],
  6: [
    LEAD,
    WINGS,
    // Same depth/lateral as N=4's solo slot — going from 4 to 6 planes shouldn't relocate plane 4.
    { depthBehind: DEPTH * 2, verticalDrop: VERT * 2, slots: [{ lateral: 0, role: 'slot' }] },
    {
      depthBehind: DEPTH * 3,
      verticalDrop: VERT * 3,
      slots: [{ lateral: -LAT, role: 'tail-left' }],
    },
    {
      depthBehind: DEPTH * 3 + TAIL_RIGHT_DEPTH_NUDGE,
      verticalDrop: VERT * 3,
      slots: [{ lateral: LAT, role: 'tail-right' }],
    },
  ],
};

function layoutRows(rows: readonly RowSpec[]): Slot[] {
  return rows.flatMap((row) =>
    row.slots.map((slot): Slot => ({
      role: slot.role,
      offset: { x: slot.lateral, y: negateZeroSafe(row.verticalDrop), z: row.depthBehind },
    })),
  );
}

export const generateDiamondSlot: FormationGenerator = ({ planeCount }) => {
  assertValidPlaneCount(planeCount);
  const rows = DIAMOND_SLOT_TABLE[planeCount];
  if (!rows) {
    throw new RangeError(`No diamond layout defined for planeCount=${planeCount}`);
  }
  return layoutRows(rows);
};

export { DIAMOND_SLOT_TABLE };
