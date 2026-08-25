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

Drop a single self-contained `.glb` (binary glTF, with textures/materials embedded) at
`public/models/` and point `MODEL_URL` in `src/main.ts` at it. The app won't render anything
meaningful until that file exists — `npm run dev` will show a "could not load the model" message
on the loading screen until it's in place.

The model's main body-paint material is `l39_base` (confirmed by inspecting the GLB's material
list — the other materials are `l39_mask`, `l39_glass`, `l39_additional_inner`, `l39_additional`,
none of which are the livery). `BODY_MATERIAL_NAME` in `AircraftLoader.ts` is set to that; if you
swap in a different model with different material names, update it there — inspect a GLB's
materials with a one-off script (see git history for the pattern used) or by logging
`obj.material.name` while traversing `gltf.scene` in the browser console. If it's wrong, skin
decals won't be created at all (a console warning says so) rather than applying somewhere wrong.

The model also has no separately-named landing gear — it's fused into `l39_additional[_inner]`
alongside other unnamed detail geometry, so removing it (or anything else bundled in there) means
either editing the source GLB directly in a 3D tool (Blender: Edit Mode, Select Linked on the gear,
delete, re-export as glTF Binary) or a runtime height-based triangle filter — see git history for
an attempted heuristic and why it's fragile (it also cut into the canopy arch at too high a cutoff).

## Adding squadron skins

DCS liveries ship as `.dds`, which browsers can't decode natively — convert to PNG first (e.g.
Microsoft's `texconv -ft png -o <outdir> *.dds`, or GIMP/Paint.NET for a GUI). Only the main
color/diffuse texture is needed; `SkinManager` doesn't use normal/roughness maps. Then add the PNGs
under `public/skins/` and register them in `src/main.ts`:

```ts
const SKINS: Skin[] = [
  { id: 'iaf-1', label: 'IAF 1', textureUrl: '/skins/L39C_DIFF_IAF-1.png' },
  { id: 'iaf-2', label: 'IAF 2', textureUrl: '/skins/L39C_DIFF_IAF-2.png' },
];
```

The skin picker in the control panel only appears once `SKINS` is non-empty.

### Why skins are decals, not a material swap

A DCS livery texture is authored for **DCS's own L-39C model's UV unwrap**. This app uses a
separately-sourced model with a completely different unwrap, so dropping a DCS skin straight onto
`material.map` samples the texture through the wrong UVs and comes out visually scrambled — the
texture file is fine, but each patch of pixels lands on the wrong part of the mesh.

Instead, `AircraftLoader` projects the skin onto the body as a single `THREE.DecalGeometry` decal
from directly above, independent of the mesh's own UVs, like a stencil. This works because a DCS
skin atlas is itself typically laid out as a top-view/bottom-view unwrap of the aircraft (not a
single coherent photo), so a top-down projection has a real shot at lining up with a same-shaped
aircraft's actual geometry regardless of whose UV unwrap it is. `SkinManager` crops the decal's
texture to its slice of the atlas via `texture.offset`/`.repeat` (see `SkinDecalUserData` /
`DECAL_SPECS` in `AircraftLoader.ts`). Everywhere the decal doesn't reach (fuselage sides, belly)
falls back to a flat `BODY_BASE_COLOR` rather than the model's original baked-in texture.

A matching bottom-up decal was tried and dropped — it produced colors that didn't match anything
in the source atlas at all (not just a wrong crop, likely a UV-range/clamping issue on the belly's
more complex geometry), and the belly is rarely visible in this app anyway (formations are viewed
from above/behind/the side). Not worth debugging further for a view nobody sees.

This is a heuristic, not a precise fix, and has real limits:
- The crop boundary (which rows of the atlas are the "top view") was eyeballed from the image, not
  measured — expect to need to nudge `DECAL_SPECS[0].crop`.
- Decal projection distorts around compound curves that don't face the projector — nose cone,
  tail fin, wingtips, fuselage sides — since projection is fundamentally a "shine a flashlight
  through a box" operation, not a true wraparound unwrap. This is inherent to the technique, not a
  bug to fix; those areas fall back to the flat body color instead.
- The projector position/size are derived from the body mesh's actual bounding box at load time
  (not hardcoded), so they adapt to the model's real dimensions — but the crop may still need
  visual tuning.

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
  aircraft/     GLTFLoader wrapper + per-instance material cloning + skin decal projection
                (AircraftLoader.ts — see "Why skins are decals" above), skin texture application
                (SkinManager.ts), and the runtime glue that owns the live aircraft Object3Ds and
                drives transitions (AircraftManager.ts).
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
