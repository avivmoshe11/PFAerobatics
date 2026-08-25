import {
  Mesh,
  type Material,
  type Object3D,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { LIVERY_MATERIAL_NAME } from './AircraftLoader';

export interface Skin {
  readonly id: string;
  readonly label: string;
  readonly textureUrl: string;
}

const textureLoader = new TextureLoader();
const textureCache = new Map<string, Promise<Texture>>();

function loadTextureCached(url: string): Promise<Texture> {
  let cached = textureCache.get(url);
  if (!cached) {
    cached = textureLoader.loadAsync(url).then((texture) => {
      // Match the color space / winding convention GLTFLoader uses for embedded textures, or a
      // swapped-in skin reads washed-out / inverted relative to the model's baked-in livery.
      texture.colorSpace = SRGBColorSpace;
      texture.flipY = false;
      return texture;
    });
    textureCache.set(url, cached);
  }
  return cached;
}

function isTexturable(material: Material): material is Material & { map: Texture | null } {
  return 'map' in material;
}

/**
 * Applies a skin texture to the aircraft's named livery material. Falls back to replacing every
 * texturable material only as a last resort (and only with a loud warning) — a blind swap-all
 * would risk re-skinning canopy glass or other unrelated parts.
 */
export async function applySkin(aircraft: Object3D, skin: Skin): Promise<void> {
  const texture = await loadTextureCached(skin.textureUrl);
  let applied = false;

  aircraft.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material.name === LIVERY_MATERIAL_NAME && isTexturable(material)) {
        material.map = texture;
        material.needsUpdate = true;
        applied = true;
      }
    }
  });

  if (applied) return;

  console.warn(
    `[SkinManager] Livery material "${LIVERY_MATERIAL_NAME}" not found; applying "${skin.label}" ` +
      'to every material on the model as a fallback. Update LIVERY_MATERIAL_NAME once the real ' +
      "GLB's material names are known to avoid re-skinning canopy glass or other parts.",
  );
  aircraft.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (isTexturable(material)) {
        material.map = texture;
        material.needsUpdate = true;
      }
    }
  });
}
