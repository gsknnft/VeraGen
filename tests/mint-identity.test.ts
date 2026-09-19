import { it, expect, afterEach } from "vitest";
import sharp from "sharp";
import { normalizeLayer, compositeLayers, LAYER_CANVAS } from "../lib/composite";
import { mintLabAllowed, missingLayers, mintMotionPrompt } from "../lib/mint-lab";

const solid = (width: number, height: number, rgba: [number, number, number, number]) =>
  sharp({ create: { width, height, channels: 4, background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] / 255 } } }).png().toBuffer();

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

it("normalizes any layer to the shared transparent canvas, so layers always align", async () => {
  const wide = await sharp({ create: { width: 300, height: 150, channels: 3, background: "#ff0000" } }).jpeg().toBuffer();
  const layer = await normalizeLayer(wide);
  const meta = await sharp(layer).metadata();
  expect([meta.width, meta.height, meta.channels, meta.format]).toEqual([LAYER_CANVAS, LAYER_CANVAS, 4, "png"]);
  // Letterboxed with transparency, never stretched or cropped: the top band is empty.
  expect((await pixel(layer, 512, 10))[3]).toBe(0);
  // The source is a JPEG, which is lossy: red comes back as ~254, not exactly 255.
  const [r, g, b, a] = await pixel(layer, 512, 512);
  expect(r).toBeGreaterThan(245);
  expect(g + b).toBeLessThan(10);
  expect(a).toBe(255);
});

it("rejects files that are not images", async () => {
  await expect(normalizeLayer(Buffer.from("not an image"))).rejects.toThrow();
});

it("stacks layers bottom to top: upper layers cover, transparency shows through", async () => {
  const background = await normalizeLayer(await solid(64, 64, [0, 0, 255, 255]));
  // A top layer that is opaque green on its left half only.
  const half = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await solid(32, 64, [0, 255, 0, 255]), left: 0, top: 0 }])
    .png().toBuffer();
  const top = await normalizeLayer(half);

  const image = await compositeLayers([background, top]);
  expect(await pixel(image, 100, 512)).toEqual([0, 255, 0, 255]); // covered
  expect(await pixel(image, 900, 512)).toEqual([0, 0, 255, 255]); // shows through
});

it("is deterministic: the same layers always produce the same identity image", async () => {
  const a = await normalizeLayer(await solid(40, 40, [10, 20, 30, 255]));
  const b = await normalizeLayer(await solid(40, 40, [200, 100, 50, 128]));
  const first = await compositeLayers([a, b]);
  const second = await compositeLayers([a, b]);
  expect(first.equals(second)).toBe(true);
  expect((await compositeLayers([b, a])).equals(first)).toBe(false); // order is part of identity
});

const previous = process.env.MINT_LAB_USERS;
afterEach(() => { process.env.MINT_LAB_USERS = previous; });

it("mint generation fails closed: nobody is allowed unless explicitly listed", () => {
  delete process.env.MINT_LAB_USERS;
  expect(mintLabAllowed("owner@example.com")).toBe(false);
  process.env.MINT_LAB_USERS = "";
  expect(mintLabAllowed("owner@example.com")).toBe(false);
  process.env.MINT_LAB_USERS = " Owner@Example.com , other@example.com";
  expect(mintLabAllowed("owner@example.com")).toBe(true);
  expect(mintLabAllowed("OTHER@example.com")).toBe(true);
  expect(mintLabAllowed("stranger@example.com")).toBe(false);
  expect(mintLabAllowed(null)).toBe(false);
});

it("names every option still missing art, so the owner knows exactly what to add", () => {
  expect(missingLayers([
    { name: "Body", options: [{ label: "Ember", layerImageUrl: "/api/media/a" }, { label: "Frost", layerImageUrl: null }] },
    { name: "Wings", options: [{ label: "Bat", layerImageUrl: null }] },
  ])).toEqual(["Body: Frost", "Wings: Bat"]);
  expect(missingLayers([{ name: "Body", options: [{ label: "Ember", layerImageUrl: "/api/media/a" }] }])).toEqual([]);
});

it("asks image-to-video to animate the character, not re-describe it", () => {
  const prompt = mintMotionPrompt(["ember scales", "", "bat wings"], "flat pastel, thick outline");
  expect(prompt).toMatch(/^Bring this exact character to life/);
  expect(prompt).toContain("(ember scales, bat wings)");
  expect(prompt).toContain("flat pastel, thick outline");
  expect(mintMotionPrompt([], null)).toBe("Bring this exact character to life. Keep its appearance, colors and proportions unchanged");
});
