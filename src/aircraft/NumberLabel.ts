import { CanvasTexture, Sprite, SpriteMaterial } from 'three';

const CANVAS_SIZE = 128;

/** World-space size of the label sprite (it's square). */
export const NUMBER_LABEL_SCALE = 3;

/**
 * A small always-camera-facing tag showing a plane's number, rendered onto a canvas rather than
 * projected onto the model — robust and legible from any angle, unlike the tail-fin decal this
 * replaces (see AircraftLoader's doc comment for why that approach was dropped).
 */
export function createNumberSprite(label: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(10, 14, 22, 0.75)';
  ctx.beginPath();
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(230, 236, 245, 0.8)';
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(label), CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 4);

  const texture = new CanvasTexture(canvas);
  const material = new SpriteMaterial({ map: texture, transparent: true });
  const sprite = new Sprite(material);
  sprite.scale.set(NUMBER_LABEL_SCALE, NUMBER_LABEL_SCALE, 1);
  return sprite;
}
