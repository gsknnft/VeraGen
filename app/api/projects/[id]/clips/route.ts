import { getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { submitVideoJob, type CreditSource } from "@/lib/higgsfield";
import { trialConfig, reserveTrial, releaseTrial } from "@/lib/trial";
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
  // Their own key pays if they have one connected; otherwise the operator's
  // free trial may (lib/trial.ts). The slot itself is reserved much later,
  // immediately before the billable call.
  const ownKey = !!(await getHiggsfieldCredentials());
  if (!ownKey && !trialConfig().enabled) return NextResponse.json({ error: "Connect your own Higgsfield account to generate, or upload your own clips." }, { status: 401 });
  const { id: projectId } = await params;

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

  // Charged only after the duplicate check: a refresh or retry of the same
  // attempt returns the existing clip and must not spend a daily slot.
  const allowed = await consumeQuota(`generation:${session.user.id}`, 20, 86400);
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily generation limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

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

  // Everything has been validated; only now is a free trial slot taken.
  const source: CreditSource = ownKey ? "byok" : "trial";
  if (source === "trial") {
    const reservation = await reserveTrial(session.user.id);
    if (reservation === "used") return NextResponse.json({ error: "You've used your free generations. Connect your own Higgsfield account to keep generating, or upload your own clips." }, { status: 402 });
    if (reservation === "paused") return NextResponse.json({ error: "Today's free generations are all taken. Try again tomorrow, connect your own Higgsfield account, or upload your own clips." }, { status: 429 });
    if (reservation !== "ok") return NextResponse.json({ error: "Connect your own Higgsfield account to generate, or upload your own clips." }, { status: 401 });
  }

  // Reserve the attempt in Postgres before making a billable call.
  let clip;
  try {
    clip = await prisma.clip.create({ data: { projectId, submissionKey, order, prompt, vibe, sourceImageUrl: durableImageUrl ?? null, characterId, status: "processing" } });
  } catch {
    // No request reached the provider, so a trial slot is returned in full.
    if (source === "trial") await releaseTrial(session.user.id, { billable: false });
    const previous = await prisma.clip.findUnique({ where: { submissionKey } });
    if (previous) return NextResponse.json(previous);
    return NextResponse.json({ error: "Could not reserve this generation. No request was sent." }, { status: 503 });
  }
  try {
    const { requestId } = await submitVideoJob({ prompt: finalPrompt, imageUrl }, source);
    return NextResponse.json(await prisma.clip.update({ where: { id: clip.id }, data: { higgsfieldRequestId: requestId } }));
  } catch {
    if (source === "trial") {
      // The request may have reached the provider, so the daily cap keeps the
      // slot (the operator may have paid). The user gets theirs back: an
      // unconfirmed submission is not their free generation.
      await releaseTrial(session.user.id, { billable: true });
      const failed = await prisma.clip.update({ where: { id: clip.id }, data: { status: "failed", errorMessage: "The free generation could not be started. It hasn't counted against you; try again." } });
      return NextResponse.json(failed);
    }
    const failed = await prisma.clip.update({ where: { id: clip.id }, data: { status: "failed", errorMessage: "Submission could not be confirmed. Check your Higgsfield account before starting another generation; it may have been charged." } });
    return NextResponse.json(failed);
  }
});
