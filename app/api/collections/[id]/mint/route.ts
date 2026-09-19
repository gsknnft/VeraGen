import { getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { NextRequest, NextResponse } from "next/server";
import { resolveWeightedTraits } from "@gsknnft/weighted-roll";
import { prisma } from "@/lib/db";
import { submitVideoJob } from "@/lib/higgsfield";
import { consumeQuota } from "@/lib/quota";
import { readMedia, signedMediaUrl, uploadBuffer } from "@/lib/storage";
import { compositeLayers } from "@/lib/composite";
import { mintLabAllowed, missingLayers, mintMotionPrompt } from "@/lib/mint-lab";
import { withAccess } from "@/lib/access";

export const runtime = "nodejs";

/**
 * Mint: roll traits → composite their layers into the identity image →
 * animate THAT image.
 *
 * This used to send the trait fragments to text-to-video, so every mint
 * re-imagined the character from words and the result never matched the
 * traits it claimed. There is no text-only path anymore: a mint without art
 * for every rollable option is refused, not degraded.
 */
export const POST = withAccess("collection", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, session
) => {
  if (!mintLabAllowed(session.user.email)) {
    return NextResponse.json({ error: "Mint generation is limited to the operator's own collections while character identity is being verified." }, { status: 403 });
  }
  if (!(await getHiggsfieldCredentials())) return NextResponse.json({ error: "Connect your own Higgsfield account. Generation uses your API credits." }, { status: 401 });
  const { id: collectionId } = await params;

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: { traitCategories: { orderBy: { sortOrder: "asc" }, include: { options: true } } },
  });
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  const categories = collection.traitCategories.filter(c => c.options.length > 0);
  if (categories.length === 0) {
    return NextResponse.json({ error: "Add at least one trait category before minting" }, { status: 400 });
  }
  const missing = missingLayers(categories);
  if (missing.length > 0) {
    return NextResponse.json({ error: `Every trait option needs layer art before minting. Missing: ${missing.slice(0, 5).join("; ")}${missing.length > 5 ? ` and ${missing.length - 5} more` : ""}.` }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    mintNumber?: number;
    walletAddress?: string;
    txHash?: string;
  };
  let mintNumber = body.mintNumber;
  if (!mintNumber) {
    const last = await prisma.mint.findFirst({ where: { collectionId }, orderBy: { mintNumber: "desc" } });
    mintNumber = (last?.mintNumber ?? 0) + 1;
  }
  const existing = await prisma.mint.findUnique({ where: { collectionId_mintNumber: { collectionId, mintNumber } } });
  if (existing) {
    return NextResponse.json({ error: `Mint #${mintNumber} already exists in this collection` }, { status: 409 });
  }

  // Charged only once the request is known to be mintable.
  if (!(await consumeQuota(`generation:${session.user.id}`, 20, 86400))) {
    return NextResponse.json({ error: "Daily generation limit reached. Try again tomorrow." }, { status: 429 });
  }

  const walletAddress = body.walletAddress?.trim() || undefined;
  const txHash = body.txHash?.trim() || undefined;

  // Deterministic: this exact seed always yields this exact trait
  // combination — re-running it can't silently reroll rarity. Folding in a
  // wallet address / tx hash (when supplied) ties the roll to that specific
  // mint action instead of just a sequence number. This is seed *input*, not
  // identity — the Mint's own id/mintNumber is authoritative, matching
  // bittyverse's "persistent subject is a characterId, not a wallet" rule.
  // resolveWeightedTraits is @gsknnft/weighted-roll, the one shared
  // implementation (hardened hash: adjacent mint numbers no longer draw
  // near-identical rolls).
  const seed = [collectionId, mintNumber, walletAddress, txHash].filter(Boolean).join(":");
  const picks = resolveWeightedTraits(
    categories.map(c => ({ id: c.id, options: c.options.map(o => ({ id: o.id, weight: o.weight })) })),
    seed,
  );
  // Category order is layer order: background first, top layer last.
  const chosen = categories.map(c => c.options.find(o => o.id === picks[c.id])!);

  // The identity image. Uploaded under a key derived from the mint, so a
  // retried composite lands on the same asset instead of a second one.
  let imageUrl: string;
  try {
    const layers = await Promise.all(chosen.map(o => readMedia(o.layerImageUrl!, session.user.id)));
    imageUrl = await uploadBuffer(`mints/${collectionId}/${mintNumber}/identity.png`, await compositeLayers(layers), "image/png", session.user.id);
  } catch (err) {
    console.error(`[veragen] mint composite failed for ${collectionId} #${mintNumber}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The mint's image could not be assembled from its layers. Nothing was generated or charged." }, { status: 503 });
  }

  const prompt = mintMotionPrompt(chosen.map(o => o.promptFragment), collection.styleLock);
  const mint = await prisma.mint.create({
    data: {
      collectionId,
      mintNumber,
      seed,
      walletAddress,
      txHash,
      prompt,
      imageUrl,
      status: "processing",
      traits: { create: chosen.map(o => ({ traitOptionId: o.id })) },
    },
    include: { traits: { include: { traitOption: true } } },
  });
  try {
    const { requestId } = await submitVideoJob({ prompt, imageUrl: await signedMediaUrl(imageUrl, session.user.id) });
    await prisma.mint.update({ where: { id: mint.id }, data: { higgsfieldRequestId: requestId } });
    return NextResponse.json(mint);
  } catch {
    await prisma.mint.update({ where: { id: mint.id }, data: { status: "failed", errorMessage: "Submission uncertain. Check your Higgsfield account before generating again." } });
    return NextResponse.json({ error: "Submission uncertain. Check your Higgsfield account before generating again." }, { status: 502 });
  }
});
