import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { submitVideoJob, type CreditSource } from "@/lib/higgsfield";
import { trialConfig, reserveTrial, releaseTrial } from "@/lib/trial";
import { consumeQuota } from "@/lib/quota";
import { uploadBuffer, signedMediaUrl } from "@/lib/storage";
import { VALID_VIBES, VIBE_OPTIONS, type Vibe } from "@/lib/vibes";
import { createShareLink, sharePageUrl } from "@/lib/share";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/**
 * Growth-loop generate path (no NFT required): optional reference image +
 * motion/prompt → project/clip/share in one shot. Reuses the same trial /
 * BYOK seams as Studio and /api/make/start. Does not invent API keys.
 */
export const POST = withAccess(null, async (req: NextRequest, _ctx, session) => {
  const ownKey = !!(await getHiggsfieldCredentials());
  if (!ownKey && !trialConfig().enabled) {
    return NextResponse.json(
      {
        error:
          "Connect your own Higgsfield account to generate, or ask the operator to enable free trial generations. You can still upload a clip or claim a mint-funded video.",
      },
      { status: 401 },
    );
  }

  const form = await req.formData();
  const attemptRaw = form.get("attempt");
  const attempt =
    typeof attemptRaw === "string" && /^[a-f0-9-]{36}$/i.test(attemptRaw) ? attemptRaw : randomUUID();

  const promptField = form.get("prompt");
  const vibeField = form.get("vibe");
  const file = form.get("image");

  let vibe: Vibe =
    typeof vibeField === "string" && VALID_VIBES.includes(vibeField as Vibe) ? (vibeField as Vibe) : "cinematic-pan";
  if (vibe === "custom" && !(typeof promptField === "string" && promptField.trim())) {
    vibe = "cinematic-pan";
  }

  const vibePrompt = VIBE_OPTIONS.find((v) => v.id === vibe)?.prompt;
  const prompt =
    typeof promptField === "string" && promptField.trim()
      ? promptField.trim().slice(0, 4000)
      : (vibePrompt ?? VIBE_OPTIONS[0].prompt);

  if (!prompt) {
    return NextResponse.json({ error: "Pick a motion or write a prompt." }, { status: 400 });
  }

  let durableImageUrl: string | null = null;
  let imageUrl: string | undefined;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Image too large (max 3MB)." }, { status: 400 });
    }
    try {
      const clean = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000 })
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();
      durableImageUrl = await uploadBuffer(
        `sources/make/${session.user.id}/${randomUUID()}.jpg`,
        clean,
        "image/jpeg",
        session.user.id,
      );
      imageUrl = await signedMediaUrl(durableImageUrl, session.user.id);
    } catch {
      return NextResponse.json({ error: "That image could not be read. Try a JPEG or PNG." }, { status: 400 });
    }
  }

  const projectName = "Make — generate";
  let project = await prisma.project.findFirst({
    where: { ownerId: session.user.id, name: projectName },
    orderBy: { updatedAt: "desc" },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { ownerId: session.user.id, name: projectName },
    });
  }

  const submissionKey = createHash("sha256")
    .update(`${session.user.id}:${project.id}:make-gen:${attempt}`)
    .digest("hex");
  const previous = await prisma.clip.findUnique({ where: { submissionKey } });
  if (previous) {
    const share =
      (await prisma.shareLink.findFirst({ where: { clipId: previous.id, ownerId: session.user.id } })) ??
      (await createShareLink({
        ownerId: session.user.id,
        title: "VeraGen clip",
        description: prompt.slice(0, 280),
        posterUrl: previous.sourceImageUrl,
        videoUrl: previous.videoUrl,
        clipId: previous.id,
      }));
    return NextResponse.json({
      clipId: previous.id,
      shareToken: share.token,
      url: sharePageUrl(share.token),
      status: previous.status,
      projectId: project.id,
    });
  }

  if (!(await consumeQuota(`generation:${session.user.id}`, 20, 86400))) {
    return NextResponse.json({ error: "Daily generation limit reached. Try again tomorrow." }, { status: 429 });
  }

  const source: CreditSource = ownKey ? "byok" : "trial";
  if (source === "trial") {
    const reservation = await reserveTrial(session.user.id);
    if (reservation === "used") {
      return NextResponse.json(
        {
          error:
            "You've used your free generations. Connect your own Higgsfield account to keep generating, upload a clip, or claim a mint-funded video.",
        },
        { status: 402 },
      );
    }
    if (reservation === "paused") {
      return NextResponse.json(
        {
          error:
            "Today's free generations are all taken. Try again tomorrow, connect your own Higgsfield account, or upload a clip.",
        },
        { status: 429 },
      );
    }
    if (reservation !== "ok") {
      return NextResponse.json(
        { error: "Connect your own Higgsfield account to generate, or upload a clip." },
        { status: 401 },
      );
    }
  }

  let clip;
  try {
    clip = await prisma.clip.create({
      data: {
        projectId: project.id,
        submissionKey,
        order: 0,
        prompt,
        vibe,
        sourceImageUrl: durableImageUrl,
        status: "processing",
      },
    });
  } catch {
    if (source === "trial") await releaseTrial(session.user.id, { billable: false });
    const again = await prisma.clip.findUnique({ where: { submissionKey } });
    if (again) {
      const share = await createShareLink({
        ownerId: session.user.id,
        title: "VeraGen clip",
        description: prompt.slice(0, 280),
        posterUrl: again.sourceImageUrl,
        videoUrl: again.videoUrl,
        clipId: again.id,
      });
      return NextResponse.json({
        clipId: again.id,
        shareToken: share.token,
        url: sharePageUrl(share.token),
        status: again.status,
        projectId: project.id,
      });
    }
    return NextResponse.json({ error: "Could not reserve this generation." }, { status: 503 });
  }

  const share = await createShareLink({
    ownerId: session.user.id,
    title: "VeraGen clip",
    description: prompt.slice(0, 280),
    posterUrl: durableImageUrl,
    videoUrl: null,
    clipId: clip.id,
  });

  try {
    const { requestId } = await submitVideoJob({ prompt, imageUrl }, source);
    await prisma.clip.update({ where: { id: clip.id }, data: { higgsfieldRequestId: requestId } });
    return NextResponse.json({
      clipId: clip.id,
      shareToken: share.token,
      url: sharePageUrl(share.token),
      status: "processing",
      projectId: project.id,
    });
  } catch {
    if (source === "trial") await releaseTrial(session.user.id, { billable: true });
    await prisma.clip.update({
      where: { id: clip.id },
      data: {
        status: "failed",
        errorMessage: ownKey
          ? "Submission could not be confirmed. Check your Higgsfield account before trying again."
          : "The free generation could not be started. It hasn't counted against you; try again.",
      },
    });
    return NextResponse.json(
      { error: "Generation could not be started.", clipId: clip.id, url: sharePageUrl(share.token) },
      { status: 502 },
    );
  }
});
