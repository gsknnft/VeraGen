import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { uploadBuffer } from "@/lib/storage";
import { downloadNftImage } from "@/lib/safe-download";
import { findOwnedNft, isNftNetwork, NftLookupError } from "@/lib/nfts";

export const runtime = "nodejs";

/**
 * Turn one of the holder's NFTs into a Character: its art becomes the
 * reference image that every generation animates, so the clip is THAT token,
 * not a description of it.
 *
 * The client sends only which token. Ownership is re-verified here against
 * the user's linked wallets, and the image comes from the indexer's cache —
 * never from the client, and never from the token's own metadata URL.
 */
export const POST = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session,
) => {
  const { id: projectId } = await params;
  const body = (await req.json()) as { network?: unknown; contract?: unknown; tokenId?: unknown };
  if (!isNftNetwork(body.network) || typeof body.contract !== "string" || typeof body.tokenId !== "string") {
    return NextResponse.json({ error: "Choose an NFT." }, { status: 400 });
  }

  const wallets = await prisma.linkedWallet.findMany({ where: { userId: session.user.id }, select: { address: true } });
  if (wallets.length === 0) return NextResponse.json({ error: "Link a wallet first." }, { status: 400 });

  let nft;
  try {
    nft = await findOwnedNft(wallets.map(w => w.address), body.network, body.contract, body.tokenId);
  } catch (err) {
    if (err instanceof NftLookupError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
  if (!nft) return NextResponse.json({ error: "That NFT isn't in any wallet you've linked." }, { status: 404 });

  const sourceNft = `${nft.network}:${nft.contract}:${nft.tokenId}`;
  const existing = await prisma.character.findUnique({ where: { projectId_sourceNft: { projectId, sourceNft } } });
  if (existing) return NextResponse.json(existing);

  if (!nft.imageUrl) return NextResponse.json({ error: "This NFT's image isn't available from the indexer yet. Try again later." }, { status: 422 });
  let clean: Buffer;
  try {
    // Same treatment as any uploaded reference: re-encoded, metadata stripped.
    clean = await sharp(await downloadNftImage(nft.imageUrl), { limitInputPixels: 16_000_000 })
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "This NFT's image couldn't be loaded. Try again later." }, { status: 502 });
  }
  const referenceImageUrl = await uploadBuffer(`characters/${projectId}/nft/${sourceNft}.jpg`, clean, "image/jpeg");

  // Traits ride along as notes: grounding for prompts, visible to the holder.
  const notes = nft.traits.length ? nft.traits.map(t => `${t.trait}: ${t.value}`).join("; ").slice(0, 2000) : null;
  const character = await prisma.character.upsert({
    where: { projectId_sourceNft: { projectId, sourceNft } },
    update: {},
    create: { projectId, name: nft.name, referenceImageUrl, notes, sourceNft },
  });
  return NextResponse.json(character);
});
