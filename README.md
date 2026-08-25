# PF Aerobatics — Formation Visualizer

A Three.js visualizer for aerobatic squadron formations and the transitions between them. Pick a
plane count, pick a formation, and watch the aircraft re-form. Diamond is the hub: every transition
goes Diamond → X or X → Diamond, never directly between two non-diamond formations.

Pure client-side app — TypeScript + Vite + vanilla Three.js, no backend, no UI framework.

## Getting started

```bash
npm install
npm run dev       # start the dev server (http://localhost:5173)
npm run test      # run the unit test suite
npm run lint      # lint
npm run build     # type-check + production build to dist/
npm run preview   # preview the production build
```

## Adding the L-39C model

Drop a single self-contained `.glb` (binary glTF, with textures/materials embedded) at:

```
public/models/l39c.glb
```

The app won't render anything meaningful until this file exists — `npm run dev` will show a
"could not load the model" message on the loading screen until it's in place.

### Before wiring up skins: inspect the real material names

`src/aircraft/AircraftLoader.ts` and `src/aircraft/SkinManager.ts` currently assume the model has a
material named `"livery"` that the paint scheme lives on (`LIVERY_MATERIAL_NAME` in
`AircraftLoader.ts`). This is a placeholder — inspect the actual GLB once you have it and update
that constant. Easiest way: temporarily add this to `src/main.ts` right after
`aircraftLoader.load(MODEL_URL)` and check the browser console:

```ts
(await aircraftLoader.load(MODEL_URL)).scene.traverse((obj) => {
  if ('material' in obj) console.log(obj.name, obj.material);
});
```

If the real livery material has a different name, update `LIVERY_MATERIAL_NAME`. Until you do,
`SkinManager` still works but falls back to re-texturing every material on the model (including
canopy glass, tires, etc.) and logs a warning — functional for development, not the final behavior.

## Adding squadron skins

Add texture files under `public/skins/` (PNG/JPG), then register them in `src/main.ts`:

```ts
const SKINS: Skin[] = [
  { id: 'ghost-1', label: 'Ghost 1', textureUrl: '/skins/ghost-1.png' },
  { id: 'ghost-2', label: 'Ghost 2', textureUrl: '/skins/ghost-2.png' },
];
```

The skin picker in the control panel only appears once `SKINS` is non-empty.

### Large binary assets

`public/models/` and `public/skins/` are tracked in git by default. If the GLB or textures grow
large (tens of MB), consider [Git LFS](https://git-lfs.com/) rather than committing them raw —
not set up preemptively here since it depends on actual file sizes you end up with.

## Architecture

```
src/
  core/         Renderer, camera, lights, render loop (App.ts) — engine bootstrap, no formation logic.
  formations/   Pure position math. No `three` import anywhere in this folder — runs and tests
                in plain Node.
    types.ts          Vec3 / Slot / Role / FormationType contracts everything else depends on.
    diamond.ts        Row-table generator for Diamond, N=2..6.
    echelon.ts        Formulaic generator, direction: 1 | -1 for Echelon Left/Right.
    trail.ts          Formulaic generator for Trail (column).
    registry.ts       FormationType -> generator lookup.
    matchAircraft.ts  Fixed Diamond<->X slot bijection (see comment in the file for why this
                       isn't a general assignment solver).
    rules.ts          canTransitionTo / canChangePlaneCount — the hub-only-transition business rule.
  animation/    Pure tween math (FormationAnimator.ts) + the one adapter that touches `three`
                (applyPose.ts).
  aircraft/     GLTFLoader wrapper + per-instance material cloning (AircraftLoader.ts), skin
                texture swapping (SkinManager.ts), and the runtime glue that owns the live
                aircraft Object3Ds and drives transitions (AircraftManager.ts).
  ui/           Plain HTML/CSS/TS control panel. No framework, no virtual DOM — re-renders on
                real state changes only (transition start/end, not every frame).
  main.ts       Wires it all together.
tests/          Mirrors src/ for formations/, animation/, utils/ — all runnable without a browser.
```

### Why aircraft never get "lost" mid-transition

Every aircraft's permanent identity is its Diamond home-slot index (aircraft `k` is always Diamond
slot `k`). Instead of solving a general assignment problem between two formations, each non-diamond
formation gets one fixed, hand-reasoned bijection to/from Diamond slot order (computed in
`matchAircraft.ts`). Diamond → X moves aircraft `k` to `targetSlots[bijection[k]]`; X → Diamond always
returns aircraft `k` to its own home slot. This only works because every transition passes through
Diamond — see the comment at the top of `matchAircraft.ts` for the full reasoning.

## Known simplifications (deliberate, for this project's size)

- **All materials are cloned per aircraft instance**, not just the livery material — simpler and
  safer than selectively cloning, and the memory cost is negligible at ≤6 low-poly aircraft.
- **No `FormationState` observer/pub-sub class.** With exactly one piece of runtime state and one
  subscriber (the control panel), `AircraftManager` exposes getters directly and calls a single
  `onStateChange` callback on real transitions; `main.ts` re-renders the panel from that. A full
  observable store would be premature for this scale.
- **Plane count range is 2–6** (`MIN_PLANES`/`MAX_PLANES` in `formations/types.ts`), tuned for
  typical squadron drill sizes. Widening it just means extending `DIAMOND_TABLE` in `diamond.ts`.
