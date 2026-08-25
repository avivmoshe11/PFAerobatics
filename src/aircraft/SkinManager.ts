import {
  ClampToEdgeWrapping,
  Mesh,
  type Object3D,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';
import { SKIN_DECAL_KEY, type SkinDecalUserData } from './AircraftLoader';

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
      texture.colorSpace = SRGBColorSpace;
      return texture;
    });
    textureCache.set(url, cached);
  }
  return cached;
}

/**
 * Applies a skin texture to the aircraft's projected decals (see AircraftLoader for why decals
 * rather than a plain material.map swap). Each decal mesh gets its own clone of the loaded texture
 * — same decoded image, independent offset/repeat — cropped to whichever part of the source atlas
 * that decal's `SkinDecalUserData.crop` says it should sample.
 */
export async function applySkin(aircraft: Object3D, skin: Skin): Promise<void> {
  const baseTexture = await loadTextureCached(skin.textureUrl);

  aircraft.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const decalData = object.userData[SKIN_DECAL_KEY] as SkinDecalUserData | undefined;
    if (!decalData) return;

    const texture = baseTexture.clone();
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    const [offsetX, offsetY, repeatX, repeatY] = decalData.crop;
    texture.offset.set(offsetX, offsetY);
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;

    const material = object.material;
    if (!Array.isArray(material) && 'map' in material) {
      material.map = texture;
      if ('opacity' in material) material.opacity = 1;
      material.needsUpdate = true;
    }
  });
}
