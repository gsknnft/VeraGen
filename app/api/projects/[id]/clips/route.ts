import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { submitVideoJob } from "@/lib/higgsfield";
import { checkRateLimit } from "@/lib/rate-limit";
import { uploadBuffer, fetchAsDataUri } from "@/lib/storage";
import { VALID_VIBES, type Vibe } from "@/lib/vibes";
import { randomUUID } from "crypto";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily generation limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("image");
  const promptField = form.get("prompt");
  const vibeField = form.get("vibe");
  const characterIdField = form.get("characterId");

  const prompt = typeof promptField === "string" ? promptField.trim() : "";
  const vibe: Vibe =
    typeof vibeField === "string" && VALID_VIBES.includes(vibeField as Vibe)
      ? (vibeField as Vibe)
      : "custom";

  if (!prompt) {
    return NextResponse.json({ error: "Write a prompt for this clip" }, { status: 400 });
  }

  let imageUrl: string | undefined;
  let durableImageUrl: string | undefined;
  let characterId: string | undefined;

  if (typeof characterIdField === "string" && characterIdField) {
    const character = await prisma.character.findFirst({
      where: { id: characterIdField, projectId },
    });
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    characterId = character.id;
    durableImageUrl = character.referenceImageUrl;
    // TODO(day-1 spike): same data-URI-vs-hosted-URL question as below —
    // once confirmed, this can skip the re-fetch and pass the hosted URL.
    imageUrl = await fetchAsDataUri(character.referenceImageUrl);
  } else if (file instanceof File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // Re-encode through sharp: strips EXIF (including GPS location) and
    // normalizes the format, regardless of what the browser sent.
    const clean = await sharp(bytes)
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    durableImageUrl = await uploadBuffer(
      `sources/${projectId}/${randomUUID()}.jpg`,
      clean,
      "image/jpeg"
    );
    // TODO(day-1 spike): confirm whether Higgsfield's image_url field
    // accepts data: URIs directly, or requires a hosted URL — if the
    // latter, pass `durableImageUrl` instead (it's already hosted).
    imageUrl = `data:image/jpeg;base64,${clean.toString("base64")}`;
  }

  // The style lock is what makes clips generated separately, over days,
  // still read as the same world — every clip in the project inherits it.
  const finalPrompt = project.styleLock ? `${prompt}. ${project.styleLock}` : prompt;

  const last = await prisma.clip.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
  });
  const order = (last?.order ?? -1) + 1;

  try {
    const { requestId } = await submitVideoJob({ prompt: finalPrompt, imageUrl });
    const clip = await prisma.clip.create({
      data: {
        projectId,
        order,
        prompt,
        vibe,
        sourceImageUrl: durableImageUrl ?? null,
        characterId,
        status: "processing",
        higgsfieldRequestId: requestId,
      },
    });
    return NextResponse.json(clip);
  } catch (err) {
    console.error("Higgsfield submit failed", err);
    return NextResponse.json(
      { error: "Generation failed to start. Try again shortly." },
      { status: 502 }
    );
  }
}
