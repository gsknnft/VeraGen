import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { consumeLinkNonce, linkOrigin, verifyLinkProof } from "@/lib/wallet-link";

/**
 * Link a wallet by signed proof. See lib/wallet-link.ts for what is checked.
 * The nonce is consumed against THIS account, which is what stops a proof
 * obtained for one account being replayed into another.
 */
export const POST = withAccess(null, async (req: NextRequest, _context, session) => {
  const body = (await req.json()) as { message?: unknown; signature?: unknown };
  const proof = await verifyLinkProof({ message: body.message, signature: body.signature, ...linkOrigin() });
  if (!proof.ok) return NextResponse.json({ error: proof.error }, { status: 400 });

  if (!(await consumeLinkNonce(session.user.id, proof.nonce))) {
    return NextResponse.json({ error: "This link request has expired or was already used. Try again." }, { status: 400 });
  }

  const existing = await prisma.linkedWallet.findUnique({ where: { address: proof.address } });
  if (existing && existing.userId !== session.user.id) {
    // Same 409 whoever owns it: which account holds a wallet is not disclosed.
    return NextResponse.json({ error: "That wallet is already linked to another account." }, { status: 409 });
  }
  const wallet = existing ?? await prisma.linkedWallet.create({
    data: { userId: session.user.id, address: proof.address, chainId: proof.chainId },
  });
  return NextResponse.json({ address: wallet.address, chainId: wallet.chainId, createdAt: wallet.createdAt });
});
