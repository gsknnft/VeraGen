import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { readableMedia, signedMediaUrl } from "@/lib/storage";

// See ../route.ts for why this is `null` with an explicit read check.
export const GET = withAccess(null, async (_request, { params }: { params: Promise<{ id: string }> }, session) => {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findFirst({ where: { id, ...readableMedia(session.user.id) }, select: { id: true } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ url: await signedMediaUrl(`/api/media/${id}`, session.user.id) });
});
