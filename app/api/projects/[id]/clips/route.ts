import { getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { submitVideoJob } from "@/lib/higgsfield";
import { consumeQuota } from "@/lib/quota";
import { uploadBuffer, signedMediaUrl } from "@/lib/storage";
import { VALID_VIBES, type Vibe } from "@/lib/vibes";
import { randomUUID, createHash } from "crypto";
import { withAccess } from "@/lib/access";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export const POST = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, session
) => {
  if (req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (!(await getHiggsfieldCredentials())) return NextResponse.json({ error: "Connect your own Higgsfield account. Generation uses your API credits." }, { status: 401 });
  const { id: projectId } = await params;

  const allowed = await consumeQuota(`generation:${session.user.id}`, 20, 86400);
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
  const attempt = form.get("attempt");
  if (typeof attempt !== "string" || !/^[a-f0-9-]{36}$/i.test(attempt)) return NextResponse.json({ error: "Missing generation attempt ID." }, { status: 400 });
  const submissionKey = createHash("sha256").update(`${session.user.id}:${projectId}:${attempt}`).digest("hex");
  const previous = await prisma.clip.findUnique({ where: { submissionKey } });
  if (previous) return NextResponse.json(previous);
  const file = form.get("image");
  const promptField = form.get("prompt");
  const vibeField = form.get("vibe");
  const characterIdField = form.get("characterId");

  const prompt = typeof promptField === "string" ? promptField.trim() : "";
  const vibe: Vibe =
    typeof vibeField === "string" && VALID_VIBES.includes(vibeField as Vibe)
      ? (vibeField as Vibe)
      : "custom";

  if (!prompt || prompt.length > 4000) {
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
    imageUrl = await signedMediaUrl(character.referenceImageUrl, session.user.id);
  } else if (file instanceof File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image too large (max 3MB)" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    // Re-encode through sharp: strips EXIF (including GPS location) and
    // normalizes the format, regardless of what the browser sent.
    const clean = await sharp(bytes, { limitInputPixels: 16000000 })
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

    durableImageUrl = await uploadBuffer(
      `sources/${projectId}/${randomUUID()}.jpg`,
      clean,
      "image/jpeg"
    );
    imageUrl = await signedMediaUrl(durableImageUrl, session.user.id);
  }

  // The style lock is what makes clips generated separately, over days,
  // still read as the same world — every clip in the project inherits it.
  const finalPrompt = project.styleLock ? `${prompt}. ${project.styleLock}` : prompt;

  const last = await prisma.clip.findFirst({
    where: { projectId },
    orderBy: { order: "desc" },
  });
  const order = (last?.order ?? -1) + 1;

  // Reserve the attempt in Postgres before making a billable call.
  let clip;
  try {
    clip = await prisma.clip.create({ data: { projectId, submissionKey, order, prompt, vibe, sourceImageUrl: durableImageUrl ?? null, characterId, status: "processing" } });
  } catch {
    const previous = await prisma.clip.findUnique({ where: { submissionKey } });
    if (previous) return NextResponse.json(previous);
    return NextResponse.json({ error: "Could not reserve this generation. No request was sent." }, { status: 503 });
  }
  try {
    const { requestId } = await submitVideoJob({ prompt: finalPrompt, imageUrl });
    return NextResponse.json(await prisma.clip.update({ where: { id: clip.id }, data: { higgsfieldRequestId: requestId } }));
  } catch {
    const failed = await prisma.clip.update({ where: { id: clip.id }, data: { status: "failed", errorMessage: "Submission could not be confirmed. Check your Higgsfield account before starting another generation; it may have been charged." } });
    return NextResponse.json(failed);
  }
});
