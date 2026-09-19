import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { consumeQuota } from "@/lib/quota";
import { mintLabAllowed } from "@/lib/mint-lab";
import { isNftNetwork } from "@/lib/nfts";
import { alchemyRpc, verifyMintTx } from "@/lib/mint-proof";
import { reserveSponsored, releaseSponsored } from "@/lib/sponsor";
import { generateMint } from "@/lib/mint-generate";

export const runtime = "nodejs";

const MAX_TOKEN_ID = 2_147_483_647; // Mint.mintNumber is a 32-bit Int.

/**
 * A holder claims the generation their mint paid for.
 *
 * The holder is not the collection's owner, so this is `withAccess(null)`
 * with every check explicit: the collection must be sponsored and on-chain
 * configured, the transaction must be a confirmed mint from its contract to
 * a wallet the caller has linked (lib/mint-proof.ts), and each token can be
 * claimed once. The generation is animated from the token's identity image,
 * paid from the collection's sponsored allowance, and owned by the holder.
 *
 * This is for collections that use VeraGen AS their generator: traits come
 * from VeraGen's deterministic roll, seeded by the on-chain mint. A
 * collection whose traits already exist on-chain should send holders to
 * "Make your NFT move" instead, which animates the token they actually hold.
 */
export const POST = withAccess(null, async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session,
) => {
  const { id: collectionId } = await params;
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    include: { traitCategories: { include: { options: true } }, owner: { select: { email: true } } },
  });
  // Unsponsored or unconfigured collections are indistinguishable from
  // missing ones to a stranger.
  if (!collection || collection.sponsoredPerDay <= 0 || !collection.contractAddress || !isNftNetwork(collection.chainNetwork)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // While identity is being proven, only the operator's own collections sponsor.
  if (!mintLabAllowed(collection.owner.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as { txHash?: unknown };
  if (typeof body.txHash !== "string") return NextResponse.json({ error: "Paste your mint transaction hash." }, { status: 400 });

  // Each claim costs chain lookups; bound them per account.
  if (!(await consumeQuota(`claim:${session.user.id}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many claims this hour. Try again later." }, { status: 429 });
  }

  const wallets = await prisma.linkedWallet.findMany({ where: { userId: session.user.id }, select: { address: true } });
  let proof;
  try {
    proof = await verifyMintTx({
      rpc: alchemyRpc(collection.chainNetwork),
      contract: collection.contractAddress,
      txHash: body.txHash,
      minters: wallets.map(w => w.address),
      minValueWei: collection.mintMinValueWei,
    });
  } catch (err) {
    console.error(`[veragen] mint verification failed for ${collectionId}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't reach the chain to verify your mint. Try again shortly." }, { status: 502 });
  }
  if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: 400 });

  const results: { tokenId: string; status: "started" | "already-claimed" | "unsupported" | "not-sponsored" | "failed"; mintId?: string; error?: string }[] = [];
  for (const tokenId of proof.tokenIds) {
    const mintNumber = Number(tokenId);
    if (!Number.isSafeInteger(mintNumber) || mintNumber > MAX_TOKEN_ID) {
      results.push({ tokenId, status: "unsupported", error: "Token ids this large aren't supported yet." });
      continue;
    }
    const existing = await prisma.mint.findUnique({ where: { collectionId_mintNumber: { collectionId, mintNumber } } });
    if (existing) {
      // The holder's own failed claim may be retried; anything else is taken.
      if (existing.claimedById === session.user.id && existing.status === "failed") {
        await prisma.mint.delete({ where: { id: existing.id } });
      } else {
        results.push({ tokenId, status: "already-claimed", mintId: existing.claimedById === session.user.id ? existing.id : undefined });
        continue;
      }
    }
    if (!(await reserveSponsored(collectionId, collection.sponsoredPerDay))) {
      results.push({ tokenId, status: "not-sponsored", error: "Today's sponsored generations for this collection are all taken. Try again tomorrow." });
      continue;
    }
    const outcome = await generateMint({
      collection,
      mintNumber,
      // The on-chain mint IS the roll: same token, same transaction, same character, every time.
      seed: `${collectionId}:${tokenId}:${body.txHash.toLowerCase()}`,
      walletAddress: proof.minter,
      txHash: body.txHash.toLowerCase(),
      mediaOwnerId: session.user.id,
      claimedById: session.user.id,
      source: "trial", // the operator/sponsor key; see lib/sponsor.ts
    });
    if (!outcome.ok) {
      await releaseSponsored(collectionId, { billable: outcome.billable });
      results.push({ tokenId, status: outcome.status === 409 ? "already-claimed" : "failed", error: outcome.error });
      continue;
    }
    results.push({ tokenId, status: "started", mintId: outcome.mint.id });
  }
  return NextResponse.json({ minter: proof.minter, results });
});
