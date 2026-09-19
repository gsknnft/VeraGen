import sharp from "sharp";

/**
 * Trait layers → one identity image, the HashLips / art-engine way.
 *
 * Every layer is normalized on upload to the same transparent square canvas,
 * so compositing is a straight stack with no per-layer positioning: layer art
 * is expected to be drawn on a shared canvas, exactly as HashLips requires.
 * Normalizing at upload (not at mint) means a bad layer is rejected when the
 * owner adds it, not discovered when someone mints.
 */
export const LAYER_CANVAS = 1024;
const MAX_INPUT_PIXELS = 16_000_000;

export async function normalizeLayer(bytes: Buffer): Promise<Buffer> {
  const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw new Error("That file is not a readable image.");
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .ensureAlpha()
    // `contain` keeps the whole layer and pads with transparency, so art drawn
    // on a non-square canvas is not cropped out of alignment.
    .resize(LAYER_CANVAS, LAYER_CANVAS, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/**
 * Stack normalized layers bottom → top. Same layers in the same order always
 * produce the same pixels, which is what lets a mint's identity be recomputed
 * and checked rather than trusted.
 */
export async function compositeLayers(layers: readonly Buffer[]): Promise<Buffer> {
  if (layers.length === 0) throw new Error("Nothing to composite.");
  return sharp({
    create: { width: LAYER_CANVAS, height: LAYER_CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers.map(input => ({ input, top: 0, left: 0 })))
    .png()
    .toBuffer();
}
