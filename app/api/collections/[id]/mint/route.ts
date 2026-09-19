import { getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { consumeQuota } from "@/lib/quota";
import { mintLabAllowed } from "@/lib/mint-lab";
import { generateMint, mintableCategories } from "@/lib/mint-generate";
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
    include: { traitCategories: { include: { options: true } } },
  });
  if (!collection) {
    return NextResponse.json({ error: "Collection not found" }, { status: 404 });
  }
  const mintable = mintableCategories(collection);
  if (!mintable.ok) return NextResponse.json({ error: mintable.error }, { status: 400 });

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
  const seed = [collectionId, mintNumber, walletAddress, txHash].filter(Boolean).join(":");
  const outcome = await generateMint({
    collection, mintNumber, seed, walletAddress, txHash,
    mediaOwnerId: session.user.id,
    source: "byok",
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(outcome.mint);
});
