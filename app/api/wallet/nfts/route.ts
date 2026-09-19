import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { consumeQuota } from "@/lib/quota";
import { isNftNetwork, listOwnedNfts, NftLookupError, type OwnedNft } from "@/lib/nfts";

export const runtime = "nodejs";

/** NFTs held by the signed-in user's linked wallets, on one network. */
export const GET = withAccess(null, async (req: NextRequest, _context, session) => {
  const network = req.nextUrl.searchParams.get("network") ?? "ethereum";
  if (!isNftNetwork(network)) return NextResponse.json({ error: "Unsupported network." }, { status: 400 });

  const wallets = await prisma.linkedWallet.findMany({ where: { userId: session.user.id }, select: { address: true } });
  if (wallets.length === 0) return NextResponse.json({ nfts: [], truncated: false, wallets: 0 });

  // Each listing is several paid indexer calls; bound them per account.
  if (!(await consumeQuota(`nft-list:${session.user.id}`, 30, 3600))) {
    return NextResponse.json({ error: "Too many lookups this hour. Try again later." }, { status: 429 });
  }

  try {
    const results = await Promise.all(wallets.map(w => listOwnedNfts(w.address, network)));
    const nfts: OwnedNft[] = results.flatMap(r => r.nfts);
    return NextResponse.json({ nfts, truncated: results.some(r => r.truncated), wallets: wallets.length });
  } catch (err) {
    // An indexer failure must not read as "you own nothing".
    if (err instanceof NftLookupError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
});
