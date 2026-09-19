import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

/** The signed-in user's linked wallets. */
export const GET = withAccess(null, async (_request, _context, session) => {
  const wallets = await prisma.linkedWallet.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { address: true, chainId: true, createdAt: true },
  });
  return NextResponse.json(wallets);
});
