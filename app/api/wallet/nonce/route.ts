import { NextResponse } from "next/server";
import { withAccess } from "@/lib/access";
import { consumeQuota } from "@/lib/quota";
import { issueLinkNonce } from "@/lib/wallet-link";

// POST, not GET: it creates server state, so it goes through withAccess's
// origin check and write quota like any other write.
export const POST = withAccess(null, async (_request, _context, session) => {
  if (!(await consumeQuota(`wallet-nonce:${session.user.id}`, 20, 3600))) {
    return NextResponse.json({ error: "Too many link attempts. Try again later." }, { status: 429 });
  }
  return NextResponse.json(await issueLinkNonce(session.user.id));
});
