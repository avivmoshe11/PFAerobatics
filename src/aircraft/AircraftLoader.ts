import {
  Box3,
  type BufferGeometry,
  Euler,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

/**
 * Name of the L-39C's main body-paint material — the mesh skin decals project onto, and whose own
 * baked-in default texture gets flattened to a plain color (see `createInstance`) so it reads as
 * clean paint in the areas the decal doesn't reach, rather than leftover unrelated detail.
 */
export const BODY_MATERIAL_NAME = 'l39_base';

/** Flat fallback color for the body paint outside the decal's reach (IAF liveries are white-based). */
const BODY_BASE_COLOR = 0xffffff;

/** Key under which a decal Mesh's crop-of-the-atlas is stashed on `userData` (see SkinManager). */
export const SKIN_DECAL_KEY = 'skinDecal';

export interface SkinDecalUserData {
  /** [offsetX, offsetY, repeatX, repeatY] in standard THREE texture UV space (V=0 at image
   * bottom, V=1 at top) — which crop of the source skin atlas this decal samples. */
  readonly crop: readonly [number, number, number, number];
}

interface DecalProjector {
  readonly position: Vector3;
  readonly orientation: Euler;
  readonly size: Vector3;
}

interface DecalSpec {
  readonly name: string;
  buildProjector(box: Box3, center: Vector3, size: Vector3): DecalProjector;
  readonly crop: readonly [number, number, number, number];
}

const MARGIN = 1;

/**
 * A single decal projected straight down, sized from the body mesh's own bounding box (computed
 * at load time — see `load()`) rather than hardcoded numbers, so it always covers the actual model
 * regardless of its exact dimensions. `crop` is a rough first-pass estimate of where the top-view
 * unwrap sits in the source atlas, eyeballed from the image — expect to need visual tuning (see
 * README's "Adding squadron skins").
 *
 * A matching bottom-up decal was tried and dropped: it came out badly wrong (not just a wrong
 * crop — colors that don't match anything prominent in the source atlas, suggesting a UV-range or
 * clamping bug on the belly's more complex geometry), and the belly is rarely visible in this app
 * anyway (formations are viewed from above/behind/the side, not from underneath). Not worth
 * debugging further for a view nobody sees; BODY_BASE_COLOR covers the belly instead.
 *
 * A second decal projecting the tail number sideways onto the vertical fin was also tried and
 * dropped — the fin's location had to be guessed from box fractions (no real fin geometry to go
 * on), and the atlas's tail-marking region turned out to need splitting across two mirrored decals
 * for the fin's two faces. Too fragile for the payoff; plane identity is shown with a floating
 * number label instead (see AircraftManager).
 */
const DECAL_SPECS: readonly DecalSpec[] = [
  {
    name: 'top',
    buildProjector: (box, center, size) => ({
      position: new Vector3(center.x, box.max.y + MARGIN, center.z),
      orientation: new Euler(-Math.PI / 2, 0, 0), // looking straight down
      size: new Vector3(size.x + MARGIN * 2, size.z + MARGIN * 2, size.y + MARGIN * 2),
    }),
    crop: [0, 0.74, 1, 0.26],
  },
];

export interface LoadedAircraftTemplate {
  readonly scene: Object3D;
}

interface DecalTemplate {
  readonly name: string;
  readonly geometry: BufferGeometry;
  readonly crop: readonly [number, number, number, number];
}

/**
 * Loads the L-39C GLB once and clones it per aircraft instance. Materials are cloned per instance
 * (not just the geometry) — `Object3D.clone()` alone would leave every instance sharing the same
 * `Material` objects, so applying a skin to one aircraft would silently re-skin all of them.
 *
 * Skins: this model's UVs don't match real DCS liveries (it's a separately-sourced model, not
 * DCS's own — dropping a DCS skin onto its material.map comes out scrambled, since the two use
 * completely different UV unwraps). Instead, a skin is projected onto the body as a decal from
 * directly above (`THREE.DecalGeometry`), independent of the mesh's own UVs, like a stencil, since
 * DCS's skin textures are themselves a top-view/bottom-view unwrap rather than a single coherent
 * image. Areas the decal doesn't reach (fuselage sides, belly — anywhere near edge-on to a
 * straight-down projector) fall back to a flat BODY_BASE_COLOR rather than the model's original
 * baked-in texture, so they read as clean paint instead of unrelated leftover detail.
 */
export class AircraftLoader {
  private readonly gltfLoader: GLTFLoader;
  private template: Object3D | null = null;
  private decalTemplates: DecalTemplate[] = [];

  constructor(loadingManager: LoadingManager = new LoadingManager()) {
    this.gltfLoader = new GLTFLoader(loadingManager);
  }

  async load(url: string): Promise<LoadedAircraftTemplate> {
    const gltf = await this.gltfLoader.loadAsync(url);
    this.template = gltf.scene;
    this.template.updateMatrixWorld(true);

    const bodyMesh = this.findBodyMesh(this.template);
    this.decalTemplates = [];
    if (bodyMesh) {
      const box = new Box3().setFromObject(bodyMesh);
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      for (const spec of DECAL_SPECS) {
        const projector = spec.buildProjector(box, center, size);
        const geometry = new DecalGeometry(bodyMesh, projector.position, projector.orientation, projector.size);
        this.decalTemplates.push({ name: spec.name, geometry, crop: spec.crop });
      }
    } else {
      console.warn(
        `[AircraftLoader] No material named "${BODY_MATERIAL_NAME}" found on the loaded model — ` +
          'skin decals will not be created, so skins will have no effect.',
      );
    }

    return { scene: this.template };
  }

  createInstance(): Object3D {
    if (!this.template) {
      throw new Error('AircraftLoader.load() must resolve before createInstance() is called');
    }
    const instance = this.template.clone(true);
    instance.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.castShadow = true;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();

      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material.name !== BODY_MATERIAL_NAME || !(material instanceof MeshStandardMaterial)) {
          continue;
        }
        material.map = null;
        material.color.set(BODY_BASE_COLOR);
        material.needsUpdate = true;
      }
    });

    for (const decalTemplate of this.decalTemplates) {
      const material = new MeshStandardMaterial({
        transparent: true,
        opacity: 0, // invisible until SkinManager gives it a texture
        polygonOffset: true,
        polygonOffsetFactor: -4, // avoids z-fighting with the body surface underneath
        depthWrite: false,
      });
      const decalMesh = new Mesh(decalTemplate.geometry, material);
      decalMesh.name = `skin-decal-${decalTemplate.name}`;
      const userData: SkinDecalUserData = { crop: decalTemplate.crop };
      decalMesh.userData[SKIN_DECAL_KEY] = userData;
      instance.add(decalMesh);
    }

    return instance;
  }

  private findBodyMesh(root: Object3D): Mesh | null {
    let found: Mesh | null = null;
    root.traverse((object) => {
      if (found || !(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material.name === BODY_MATERIAL_NAME)) {
        found = object;
      }
    });
    return found;
  }
}
