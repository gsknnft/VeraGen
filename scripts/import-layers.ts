/**
 * Import a folder of registered PNGs as a trait category.
 *
 *   pnpm collection:import --dir <folder> --collection "BittyDragons" --category "Skin"
 *   pnpm collection:import --dir <folder> --collection "BittyDragons" --category "Skin" --apply
 *
 * Nothing is written without --apply; the default is a dry run that reports
 * exactly what would be imported and what would be skipped.
 *
 * The art engine produces whole-body variants in one shared pose and
 * registration (see BittyDragons: 17 skins, silhouettes overlapping 82-92%).
 * That is a trait category: one option per file, composited by the mint route
 * in category order.
 *
 * Two checks matter more than convenience here:
 *   - A file with no transparency is reference art (a sheet, a grid, a card),
 *     not a layer. Imported as a layer it would paint over everything below
 *     it, so it is skipped and named.
 *   - Layers must be REGISTERED: the same subject at the same size and place.
 *     Each file's opaque bounding box is compared to the first accepted one,
 *     and anything far out of line is reported, because misregistered art
 *     composites into a broken character rather than failing loudly.
 *
 * Re-running is safe: an option whose label already exists in the category is
 * left alone.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "../lib/db";
import { normalizeLayer, LAYER_CANVAS } from "../lib/composite";
import { uploadBuffer } from "../lib/storage";

type Args = { dir?: string; collection?: string; category?: string; owner?: string; apply: boolean; weight: number };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    dir: get("dir"),
    collection: get("collection"),
    category: get("category"),
    owner: get("owner"),
    apply: argv.includes("--apply"),
    weight: Number(get("weight") ?? 1),
  };
}

/** bitty_base_mech_sentinel_v1.png -> "Mech Sentinel" */
export function labelFromFilename(file: string): string {
  return path.basename(file, path.extname(file))
    .replace(/^bitty[_-]?(base[_-]?)?/i, "")
    .replace(/[_-]?(prod|atlas|final|clean)?[_-]?v\d+$/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || "Base";
}

/** Opaque bounding box, used to check that layers line up with each other. */
async function registration(bytes: Buffer) {
  const N = 256;
  const { data } = await sharp(bytes).resize(N, N, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = N, y0 = N, x1 = 0, y1 = 0, opaque = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (data[(y * N + x) * 4 + 3]! > 200) { opaque++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0, coverage: opaque / (N * N) };
}

async function main() {
  const args = parseArgs();
  if (!args.dir || !args.collection || !args.category) {
    throw new Error('Usage: pnpm collection:import --dir <folder> --collection <name|id> --category <name> [--owner <email>] [--weight 1] [--apply]');
  }

  const ownerEmail = args.owner ?? process.env.MINT_LAB_USERS?.split(",")[0]?.trim() ?? process.env.VERAGEN_DEV_USER;
  if (!ownerEmail) throw new Error("No owner: pass --owner <email>, or set MINT_LAB_USERS.");
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail }, select: { id: true, email: true } });
  if (!owner) throw new Error(`No account for ${ownerEmail}. Sign in once so the account exists.`);

  const files = (await readdir(args.dir)).filter(f => /\.(png|webp)$/i.test(f)).sort();
  if (files.length === 0) throw new Error(`No PNG/WebP files in ${args.dir}`);

  console.log(`${args.apply ? "IMPORTING" : "DRY RUN"} ${files.length} file(s) from ${args.dir}`);
  console.log(`  owner      ${owner.email}`);
  console.log(`  collection ${args.collection}`);
  console.log(`  category   ${args.category}\n`);

  // Read and vet everything BEFORE writing anything.
  const accepted: { file: string; label: string; bytes: Buffer }[] = [];
  const skipped: string[] = [];
  let anchor: Awaited<ReturnType<typeof registration>> | null = null;

  for (const file of files) {
    const bytes = await readFile(path.join(args.dir, file));
    const meta = await sharp(bytes).metadata();
    if (!meta.hasAlpha) { skipped.push(`${file} — no transparency (reference art, not a layer)`); continue; }
    const reg = await registration(bytes);
    if (reg.coverage < 0.02) { skipped.push(`${file} — almost entirely transparent`); continue; }
    anchor ??= reg;
    // A moved centre means the art composites in the wrong place. A bigger
    // silhouette does not: armour, crystals and horns legitimately grow it.
    const centre = Math.max(
      Math.abs((reg.x0 + reg.w / 2) - (anchor.x0 + anchor.w / 2)),
      Math.abs((reg.y0 + reg.h / 2) - (anchor.y0 + anchor.h / 2)),
    ) / 256;
    const size = Math.max(reg.w / anchor.w, reg.h / anchor.h) - 1;
    const note = centre > 0.04
      ? `  OFF-CENTRE by ${(100 * centre).toFixed(0)}% — will composite misaligned`
      : size > 0.15 ? `  ${(100 * size).toFixed(0)}% larger silhouette (added geometry)` : "";
    const label = labelFromFilename(file);
    accepted.push({ file, label, bytes });
    console.log(`  ${centre > 0.04 ? "!" : "+"} ${label.padEnd(20)} ${String(meta.width)}x${String(meta.height)}  subject ${(100 * reg.coverage).toFixed(0)}%${note}`);
  }
  for (const s of skipped) console.log(`  - skipped ${s}`);
  if (accepted.length === 0) throw new Error("Nothing importable here.");

  if (!args.apply) {
    console.log(`\n${accepted.length} option(s) would be imported into "${args.category}". Re-run with --apply to write them.`);
    return;
  }

  // Prove storage works BEFORE creating a collection and a category that
  // would otherwise be left behind empty. uploadBuffer deliberately hides
  // provider errors from users; an operator running a script needs the
  // actual reason.
  const missing = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].filter(k => !process.env[k]);
  if (missing.length) {
    throw new Error(`Storage is not configured: ${missing.join(", ")} empty.\nNote that .env.local overrides .env — an empty key there blanks a real one here.`);
  }
  try {
    await uploadBuffer(`layers/_probe/${Date.now()}.png`, await normalizeLayer(accepted[0]!.bytes), "image/png", owner.id);
  } catch (err) {
    throw new Error(`Storage rejected a test upload (${err instanceof Error ? err.message : err}).\nCheck S3_ENDPOINT, S3_BUCKET and the key's write permission. Use a PRIVATE bucket for VeraGen: layer art and user media are served through signed URLs, never public ones.`);
  }

  const collection = await prisma.collection.findFirst({ where: { ownerId: owner.id, OR: [{ id: args.collection }, { name: args.collection }] } })
    ?? await prisma.collection.create({ data: { ownerId: owner.id, name: args.collection } });

  const existingCategories = await prisma.traitCategory.findMany({ where: { collectionId: collection.id }, select: { id: true, name: true, sortOrder: true } });
  const category = existingCategories.find(c => c.name === args.category)
    ?? await prisma.traitCategory.create({
      data: { collectionId: collection.id, name: args.category, sortOrder: existingCategories.length },
    });

  const existing = new Set((await prisma.traitOption.findMany({ where: { categoryId: category.id }, select: { label: true } })).map(o => o.label));
  let imported = 0;
  for (const { file, label, bytes } of accepted) {
    if (existing.has(label)) { console.log(`  = ${label} already in this category`); continue; }
    const layer = await normalizeLayer(bytes);
    const layerImageUrl = await uploadBuffer(`layers/${category.id}/${path.basename(file)}`, layer, "image/png", owner.id);
    await prisma.traitOption.create({
      data: {
        categoryId: category.id,
        label,
        // A starting point the owner edits: it rides into the video prompt and the lore.
        promptFragment: `${label.toLowerCase()} ${args.category.toLowerCase()}`,
        weight: Number.isSafeInteger(args.weight) && args.weight > 0 ? args.weight : 1,
        layerImageUrl,
      },
    });
    imported++;
    console.log(`  ✓ ${label}`);
  }

  console.log(`\nImported ${imported} option(s) into "${category.name}" of "${collection.name}" (${collection.id}).`);
  console.log(`Layers normalized to ${LAYER_CANVAS}x${LAYER_CANVAS}. Set weights and lore per option in Mint Lab: /collections/${collection.id}`);
}

main()
  .catch(err => { console.error(err instanceof Error ? err.message : err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
