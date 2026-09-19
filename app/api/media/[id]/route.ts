import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { readableMedia, signedMediaUrl } from "@/lib/storage";

// `null` rather than "mediaAsset": readable media includes shared example
// clips, which the owner-only ownerFilter would 404. The read rule lives in
// readableMedia(), and this route only ever reads.
export const GET = withAccess(null, async (_request, { params }: { params: Promise<{ id: string }> }, session) => {
  const { id } = await params;
  const asset = await prisma.mediaAsset.findFirst({ where: { id, ...readableMedia(session.user.id) }, select: { id: true } });
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(await signedMediaUrl(`/api/media/${id}`, session.user.id), 307);
});
