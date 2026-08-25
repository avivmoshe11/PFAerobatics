import { LoadingManager, Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Expected name of the L-39C's livery material inside the GLB. This is a placeholder until the
 * real model is inspected (see README's "Adding the L-39C model" section) — update it once known.
 * Until then, SkinManager falls back to replacing every material on skin change and logs a warning.
 */
export const LIVERY_MATERIAL_NAME = 'livery';

export interface LoadedAircraftTemplate {
  readonly scene: Object3D;
  readonly liveryMaterialFound: boolean;
}

/**
 * Loads the L-39C GLB once and clones it per aircraft instance. Materials are cloned per instance
 * (not just the geometry) — `Object3D.clone()` alone would leave every instance sharing the same
 * `Material` objects, so applying a skin to one aircraft would silently re-skin all of them.
 */
export class AircraftLoader {
  private readonly gltfLoader: GLTFLoader;
  private template: Object3D | null = null;
  private liveryMaterialFound = false;

  constructor(loadingManager: LoadingManager = new LoadingManager()) {
    this.gltfLoader = new GLTFLoader(loadingManager);
  }

  async load(url: string): Promise<LoadedAircraftTemplate> {
    const gltf = await this.gltfLoader.loadAsync(url);
    this.template = gltf.scene;
    this.liveryMaterialFound = false;

    this.template.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (materials.some((material) => material.name === LIVERY_MATERIAL_NAME)) {
        this.liveryMaterialFound = true;
      }
    });

    if (!this.liveryMaterialFound) {
      console.warn(
        `[AircraftLoader] No material named "${LIVERY_MATERIAL_NAME}" found on the loaded model. ` +
          'SkinManager will fall back to replacing every material when a skin is applied. Inspect ' +
          'the GLB (log mesh.material.name while traversing gltf.scene) and update ' +
          'LIVERY_MATERIAL_NAME once the real name is known.',
      );
    }

    return { scene: this.template, liveryMaterialFound: this.liveryMaterialFound };
  }

  createInstance(): Object3D {
    if (!this.template) {
      throw new Error('AircraftLoader.load() must resolve before createInstance() is called');
    }
    const instance = this.template.clone(true);
    instance.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
    return instance;
  }
}
