import { NextResponse } from "next/server";
import { withAccess } from "@/lib/access";
import { signedMediaUrl } from "@/lib/storage";
export const GET = withAccess("mediaAsset", async (_request, { params }: { params: Promise<{ id: string }> }, session) => {
  const { id } = await params;
  return NextResponse.json({ url: await signedMediaUrl(`/api/media/${id}`, session.user.id) });
});

