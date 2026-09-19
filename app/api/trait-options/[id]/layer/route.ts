import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { uploadBuffer } from "@/lib/storage";
import { withAccess } from "@/lib/access";
import { normalizeLayer } from "@/lib/composite";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/**
 * Attach this trait option's art layer. Normalized here, at upload, to the
 * shared transparent canvas — so a layer that can't be read or aligned is
 * rejected now, in front of the collection owner, not at someone's mint.
 */
export const POST = withAccess("traitOption", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;
  const form = await req.formData();
  const file = form.get("layer");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a layer image (PNG with transparency works best)." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Layer too large (max 3MB)." }, { status: 400 });

  let layer: Buffer;
  try {
    layer = await normalizeLayer(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ error: "That file is not a readable image." }, { status: 400 });
  }

  const layerImageUrl = await uploadBuffer(`layers/${id}/${randomUUID()}.png`, layer, "image/png");
  const option = await prisma.traitOption.update({ where: { id }, data: { layerImageUrl } });
  return NextResponse.json(option);
});
