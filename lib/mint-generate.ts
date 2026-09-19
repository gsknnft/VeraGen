import { resolveWeightedTraits } from "@gsknnft/weighted-roll";
import { prisma } from "./db";
import { submitVideoJob, type CreditSource } from "./higgsfield";
import { readMedia, signedMediaUrl, uploadBuffer } from "./storage";
import { compositeLayers } from "./composite";
import { missingLayers, mintMotionPrompt } from "./mint-lab";

/**
 * One mint, generated from its identity image. Shared by the collection
 * owner's Mint Lab route and the holder's claim route, so the two can never
 * drift into different ideas of what a mint is.
 */

export type MintableCollection = {
  id: string;
  ownerId: string;
  styleLock: string | null;
  traitCategories: {
    id: string;
    name: string;
    sortOrder: number;
    options: { id: string; label: string; weight: number; promptFragment: string; layerImageUrl: string | null }[];
  }[];
};

export type MintOutcome =
  | { ok: true; mint: Awaited<ReturnType<typeof createMint>> }
  | { ok: false; status: number; error: string; billable: boolean };

/** Categories that can be rolled, in layer order; or why the collection can't mint. */
export function mintableCategories(collection: MintableCollection) {
  const categories = [...collection.traitCategories].sort((a, b) => a.sortOrder - b.sortOrder).filter(c => c.options.length > 0);
  if (categories.length === 0) return { ok: false as const, error: "Add at least one trait category before minting" };
  const missing = missingLayers(categories);
  if (missing.length > 0) {
    return { ok: false as const, error: `Every trait option needs layer art before minting. Missing: ${missing.slice(0, 5).join("; ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}.` };
  }
  return { ok: true as const, categories };
}

function createMint(data: Parameters<typeof prisma.mint.create>[0]["data"]) {
  return prisma.mint.create({ data, include: { traits: { include: { traitOption: true } } } });
}

export async function generateMint(args: {
  collection: MintableCollection;
  mintNumber: number;
  /** Deterministic roll input; see the mint route for what goes into it. */
  seed: string;
  walletAddress?: string;
  txHash?: string;
  /** Who owns the identity image and later the video (the holder, for a claim). */
  mediaOwnerId: string;
  claimedById?: string;
  source: CreditSource;
}): Promise<MintOutcome> {
  const check = mintableCategories(args.collection);
  if (!check.ok) return { ok: false, status: 400, error: check.error, billable: false };
  const { categories } = check;

  const picks = resolveWeightedTraits(
    categories.map(c => ({ id: c.id, options: c.options.map(o => ({ id: o.id, weight: o.weight })) })),
    args.seed,
  );
  // Category order is layer order: background first, top layer last.
  const chosen = categories.map(c => c.options.find(o => o.id === picks[c.id])!);

  let imageUrl: string;
  try {
    // Layers are the collection owner's art; the composite belongs to whoever owns this mint's media.
    const layers = await Promise.all(chosen.map(o => readMedia(o.layerImageUrl!, args.collection.ownerId)));
    imageUrl = await uploadBuffer(`mints/${args.collection.id}/${args.mintNumber}/identity.png`, await compositeLayers(layers), "image/png", args.mediaOwnerId);
  } catch (err) {
    console.error(`[veragen] mint composite failed for ${args.collection.id} #${args.mintNumber}:`, err instanceof Error ? err.message : err);
    return { ok: false, status: 503, error: "The mint's image could not be assembled from its layers. Nothing was generated or charged.", billable: false };
  }

  const prompt = mintMotionPrompt(chosen.map(o => o.promptFragment), args.collection.styleLock);
  let mint;
  try {
    mint = await createMint({
      collectionId: args.collection.id,
      mintNumber: args.mintNumber,
      seed: args.seed,
      walletAddress: args.walletAddress,
      txHash: args.txHash,
      prompt,
      imageUrl,
      status: "processing",
      claimedById: args.claimedById,
      traits: { create: chosen.map(o => ({ traitOptionId: o.id })) },
    });
  } catch {
    // (collectionId, mintNumber) is unique: a concurrent request got there first.
    return { ok: false, status: 409, error: `Mint #${args.mintNumber} already exists in this collection`, billable: false };
  }
  try {
    const { requestId } = await submitVideoJob({ prompt, imageUrl: await signedMediaUrl(imageUrl, args.mediaOwnerId) }, args.source);
    await prisma.mint.update({ where: { id: mint.id }, data: { higgsfieldRequestId: requestId } });
    return { ok: true, mint };
  } catch {
    const errorMessage = args.source === "byok"
      ? "Submission uncertain. Check your Higgsfield account before generating again."
      : "The generation could not be started. Try claiming again later.";
    await prisma.mint.update({ where: { id: mint.id }, data: { status: "failed", errorMessage } });
    return { ok: false, status: 502, error: errorMessage, billable: true };
  }
}
