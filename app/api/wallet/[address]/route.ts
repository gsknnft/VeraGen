import { NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";

/** Unlink one of your own wallets. Someone else's reads as not found. */
export const DELETE = withAccess(null, async (_request, { params }: { params: Promise<{ address: string }> }, session) => {
  const { address } = await params;
  if (!isAddress(address)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { count } = await prisma.linkedWallet.deleteMany({ where: { address: getAddress(address), userId: session.user.id } });
  if (count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
