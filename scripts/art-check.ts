/**
 * Gate generated art before it can become collection art.
 *
 *   pnpm art:check --candidates <folder> --base <file> [--against <folder>...]
 *
 * A model does not promise that its output is still your character, nor that
 * it differs from what it drew last time. Both are measurable, so neither is
 * taken on trust:
 *
 *   IDENTITY  how much of the base's silhouette the candidate still occupies
 *             (intersection over union of the subject masks). A model that
 *             re-imagines the body drops this; a recolour or an added horn
 *             barely moves it.
 *
 *   NOVELTY   distance from the nearest image in the reference set — the art
 *             already in the collection, plus candidates already accepted in
 *             this run, so a batch cannot fill up with near-copies of itself.
 *
 * Thresholds are not universal. Run it once over art you already trust to see
 * what "a different trait" scores for YOUR set, then set them from that.
 */
// Load env the way Next does, before anything reads it.
for (const file of [".env", ".env.local"]) { try { process.loadEnvFile(file); } catch { /* optional */ } }
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const THUMB = 32;

type Signature = { name: string; mask: Uint8Array; grey: Uint8Array };

/**
 * Subject mask and a small grey thumbnail. Transparency marks the subject when
 * the art has an alpha channel; otherwise anything unlike the corner colour
 * does, so generated art on a flat background is handled the same way.
 */
async function signature(name: string, bytes: Buffer): Promise<Signature> {
  const { data, info } = await sharp(bytes).resize(THUMB, THUMB, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(THUMB * THUMB);
  const grey = new Uint8Array(THUMB * THUMB);
  const corner = [data[0]!, data[1]!, data[2]!, data[3]!];
  const flat = corner[3]! > 200; // opaque corner: background is a colour, not transparency
  for (let p = 0; p < THUMB * THUMB; p++) {
    const i = p * info.channels;
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    const isBackground = flat
      ? Math.abs(r - corner[0]!) + Math.abs(g - corner[1]!) + Math.abs(b - corner[2]!) < 60
      : a < 128;
    mask[p] = isBackground ? 0 : 1;
    grey[p] = isBackground ? 255 : Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return { name, mask, grey };
}

/** Silhouette agreement: 1.0 means the same shape in the same place. */
function identity(a: Signature, b: Signature) {
  let inter = 0, union = 0;
  for (let p = 0; p < a.mask.length; p++) { if (a.mask[p] || b.mask[p]) union++; if (a.mask[p] && b.mask[p]) inter++; }
  return union ? inter / union : 0;
}

/**
 * Mean grey difference over the CHARACTER only, 0-255. Near zero means the
 * same character. Background is excluded deliberately: a new backdrop behind
 * the same dragon is not a new dragon, and scoring the whole frame would let
 * a recoloured background pass as novel art.
 */
function distance(a: Signature, b: Signature) {
  let sum = 0, n = 0;
  // Where BOTH have character. Scoring the union instead makes every
  // antialiased edge pixel a maximum-difference hit, which swamps the real
  // comparison — the same dragon on a new background scored worse than a
  // different dragon. Silhouette disagreement is what `identity` is for.
  for (let p = 0; p < a.grey.length; p++) {
    if (!a.mask[p] || !b.mask[p]) continue;
    sum += Math.abs(a.grey[p]! - b.grey[p]!);
    n++;
  }
  if (n < a.grey.length / 8) { // barely overlapping: fall back to the whole frame
    let all = 0;
    for (let p = 0; p < a.grey.length; p++) all += Math.abs(a.grey[p]! - b.grey[p]!);
    return all / a.grey.length;
  }
  return sum / n;
}

async function load(dir: string): Promise<Signature[]> {
  const files = (await readdir(dir)).filter(f => /\.(png|webp|jpe?g)$/i.test(f)).sort();
  return Promise.all(files.map(async f => signature(f, await readFile(path.join(dir, f)))));
}

async function main() {
  const argv = process.argv.slice(2);
  const get = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  const all = (n: string) => argv.flatMap((a, i) => (a === `--${n}` && argv[i + 1] ? [argv[i + 1]!] : []));
  const candidatesDir = get("candidates");
  const baseFile = get("base");
  const minIdentity = Number(get("min-identity") ?? 0.75);
  const minNovelty = Number(get("min-novelty") ?? 6);
  if (!candidatesDir) throw new Error("Usage: pnpm art:check --candidates <folder> [--base <file>] [--against <folder>] [--min-identity 0.75] [--min-novelty 6]");

  const reference: Signature[] = [];
  for (const dir of all("against")) reference.push(...(await load(dir)));
  const base = baseFile ? await signature(path.basename(baseFile), await readFile(baseFile)) : null;

  console.log(`candidates ${candidatesDir}`);
  console.log(`reference  ${reference.length} image(s)${base ? `, identity measured against ${base.name}` : ", no base given (identity skipped)"}`);
  console.log(`gates      identity >= ${minIdentity}, novelty >= ${minNovelty}\n`);
  console.log("candidate                       identity   novelty  nearest match");
  console.log("------------------------------- --------  --------  ------------------------------");

  let accepted = 0, rejected = 0;
  for (const candidate of await load(candidatesDir)) {
    const id = base ? identity(base, candidate) : 1;
    let nearest = { name: "—", d: Number.POSITIVE_INFINITY };
    // Never compare a file to itself: pointing --against at the same folder is
    // exactly how you calibrate, and a self-match would score every image 0.
    for (const r of reference) {
      if (r.name === candidate.name) continue;
      const d = distance(candidate, r);
      if (d < nearest.d) nearest = { name: r.name, d };
    }
    const noveltyOk = !reference.length || nearest.d >= minNovelty;
    const identityOk = id >= minIdentity;
    const verdict = identityOk && noveltyOk ? "keep" : !identityOk ? "REJECT not your character" : "REJECT too close to existing";
    console.log(
      `${candidate.name.slice(0, 31).padEnd(31)} ${id.toFixed(2).padStart(8)}  ${(reference.length ? nearest.d.toFixed(1) : "n/a").padStart(8)}  ${nearest.name.slice(0, 28).padEnd(28)} ${verdict}`,
    );
    if (identityOk && noveltyOk) { accepted++; reference.push(candidate); } else rejected++;
  }
  console.log(`\n${accepted} kept, ${rejected} rejected. Accepted candidates join the reference set, so a batch cannot fill with near-copies of itself.`);
}

main().catch(err => { console.error("\n" + (err instanceof Error ? err.message : err)); process.exitCode = 1; });
