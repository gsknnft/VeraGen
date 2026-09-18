import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { uploadBuffer } from "@/lib/storage";
import { withAccess } from "@/lib/access";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const POST = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A logo image is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Logo too large (max 4MB)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // PNG (not JPEG) so a transparent logo stays transparent over any clip.
  const clean = await sharp(bytes)
    .rotate()
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  const logoUrl = await uploadBuffer(`brand/${projectId}/${randomUUID()}.png`, clean, "image/png");

  const project2 = await prisma.project.update({
    where: { id: projectId },
    data: { brandLogoUrl: logoUrl },
  });
  return NextResponse.json(project2);
});
