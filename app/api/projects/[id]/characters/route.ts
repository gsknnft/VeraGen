import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { uploadBuffer } from "@/lib/storage";
import { withAccess } from "@/lib/access";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

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
  const name = form.get("name");
  const notes = form.get("notes");
  const file = form.get("image");

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "Name this character" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A reference photo is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const clean = await sharp(bytes)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const referenceImageUrl = await uploadBuffer(
    `characters/${projectId}/${randomUUID()}.jpg`,
    clean,
    "image/jpeg"
  );

  const character = await prisma.character.create({
    data: {
      projectId,
      name: name.trim(),
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      referenceImageUrl,
    },
  });

  return NextResponse.json(character);
});
