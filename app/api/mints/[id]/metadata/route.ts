import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { buildTokenMetadata } from "@/lib/mint-metadata";

export const runtime = "nodejs";

/**
 * This mint as token metadata: attributes from the same rows that supplied
 * the layers, lore from those rows too. Reachable by the collection's owner
 * and by the holder who claimed it (ownerFilter "mint").
 */
export const GET = withAccess("mint", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const mint = await prisma.mint.findUnique({
    where: { id },
    include: {
      collection: { select: { name: true, description: true, externalUrl: true, chainNetwork: true, contractAddress: true } },
      traits: { include: { traitOption: { include: { category: { select: { name: true, kind: true, sortOrder: true } } } } } },
    },
  });
  if (!mint) return NextResponse.json({ error: "Mint not found" }, { status: 404 });

  return NextResponse.json(buildTokenMetadata({
    collection: mint.collection,
    mint,
    traits: mint.traits.map(t => ({ category: t.traitOption.category, label: t.traitOption.label, lore: t.traitOption.lore })),
    baseUrl: process.env.BETTER_AUTH_URL ?? req.nextUrl.origin,
  }));
});
