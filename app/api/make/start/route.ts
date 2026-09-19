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
import { downloadNftImage } from "@/lib/safe-download";
import { findOwnedNft, isNftNetwork, NftLookupError } from "@/lib/nfts";
import { VALID_VIBES, VIBE_OPTIONS, type Vibe } from "@/lib/vibes";
import { createShareLink, sharePageUrl } from "@/lib/share";

export const runtime = "nodejs";

/**
 * One-shot holder flow: wallet already linked → pick NFT + motion →
 * project/character/clip/share created together. Returns the public share URL
 * immediately (poster unfurls; video fills in when generation completes).
 */
export const POST = withAccess(null, async (req: NextRequest, _ctx, session) => {
  const ownKey = !!(await getHiggsfieldCredentials());
  if (!ownKey && !trialConfig().enabled) {
    return NextResponse.json(
      { error: "Connect your own Higgsfield account to generate, or ask the operator to enable free trial generations." },
      { status: 401 },
    );
  }

  const body = (await req.json()) as {
    network?: unknown;
    contract?: unknown;
    tokenId?: unknown;
    vibe?: unknown;
    attempt?: unknown;
  };

  if (!isNftNetwork(body.network) || typeof body.contract !== "string" || typeof body.tokenId !== "string") {
    return NextResponse.json({ error: "Choose an NFT." }, { status: 400 });
  }
  const vibe: Vibe =
    typeof body.vibe === "string" && VALID_VIBES.includes(body.vibe as Vibe) && body.vibe !== "custom"
      ? (body.vibe as Vibe)
      : "cinematic-pan";
  const attempt =
    typeof body.attempt === "string" && /^[a-f0-9-]{36}$/i.test(body.attempt) ? body.attempt : randomUUID();

  const wallets = await prisma.linkedWallet.findMany({ where: { userId: session.user.id }, select: { address: true } });
  if (wallets.length === 0) return NextResponse.json({ error: "Link a wallet first." }, { status: 400 });

  let nft;
  try {
    nft = await findOwnedNft(wallets.map((w) => w.address), body.network, body.contract, body.tokenId);
  } catch (err) {
    if (err instanceof NftLookupError) return NextResponse.json({ error: err.message }, { status: 502 });
    throw err;
  }
  if (!nft) return NextResponse.json({ error: "That NFT isn't in any wallet you've linked." }, { status: 404 });
  if (!nft.imageUrl) {
    return NextResponse.json({ error: "This NFT's image isn't available from the indexer yet. Try again later." }, { status: 422 });
  }

  const vibePrompt = VIBE_OPTIONS.find((v) => v.id === vibe)?.prompt ?? VIBE_OPTIONS[0].prompt;
  const sourceNft = `${nft.network}:${nft.contract}:${nft.tokenId}`;

  const projectName = `${nft.name}`.slice(0, 80);
  let project = await prisma.project.findFirst({
    where: { ownerId: session.user.id, name: projectName, characters: { some: { sourceNft } } },
    orderBy: { updatedAt: "desc" },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { ownerId: session.user.id, name: projectName },
    });
  }

  let character = await prisma.character.findUnique({
    where: { projectId_sourceNft: { projectId: project.id, sourceNft } },
  });
  if (!character) {
    let clean: Buffer;
    try {
      clean = await sharp(await downloadNftImage(nft.imageUrl), { limitInputPixels: 16_000_000 })
        .rotate()
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 92 })
        .toBuffer();
    } catch {
      return NextResponse.json({ error: "This NFT's image couldn't be loaded. Try again later." }, { status: 502 });
    }
    const referenceImageUrl = await uploadBuffer(
      `characters/${project.id}/nft/${sourceNft}.jpg`,
      clean,
      "image/jpeg",
      session.user.id,
    );
    const notes = nft.traits.length
      ? nft.traits.map((t) => `${t.trait}: ${t.value}`).join("; ").slice(0, 2000)
      : null;
    character = await prisma.character.create({
      data: { projectId: project.id, name: nft.name, referenceImageUrl, notes, sourceNft },
    });
  }

  const submissionKey = createHash("sha256")
    .update(`${session.user.id}:${project.id}:make:${attempt}`)
    .digest("hex");
  const previous = await prisma.clip.findUnique({ where: { submissionKey } });
  if (previous) {
    const share =
      (await prisma.shareLink.findFirst({ where: { clipId: previous.id, ownerId: session.user.id } })) ??
      (await createShareLink({
        ownerId: session.user.id,
        title: nft.name,
        description: vibePrompt.slice(0, 280),
        posterUrl: character.referenceImageUrl,
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
        { error: "You've used your free generations. Connect your own Higgsfield account to keep generating." },
        { status: 402 },
      );
    }
    if (reservation === "paused") {
      return NextResponse.json(
        { error: "Today's free generations are all taken. Try again tomorrow or connect your own Higgsfield account." },
        { status: 429 },
      );
    }
    if (reservation !== "ok") {
      return NextResponse.json({ error: "Connect your own Higgsfield account to generate." }, { status: 401 });
    }
  }

  const imageUrl = await signedMediaUrl(character.referenceImageUrl, session.user.id);
  let clip;
  try {
    clip = await prisma.clip.create({
      data: {
        projectId: project.id,
        submissionKey,
        order: 0,
        prompt: vibePrompt,
        vibe,
        sourceImageUrl: character.referenceImageUrl,
        characterId: character.id,
        status: "processing",
      },
    });
  } catch {
    if (source === "trial") await releaseTrial(session.user.id, { billable: false });
    const again = await prisma.clip.findUnique({ where: { submissionKey } });
    if (again) {
      const share = await createShareLink({
        ownerId: session.user.id,
        title: nft.name,
        description: vibePrompt.slice(0, 280),
        posterUrl: character.referenceImageUrl,
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
    title: nft.name,
    description: `${vibePrompt}`.slice(0, 280),
    posterUrl: character.referenceImageUrl,
    videoUrl: null,
    clipId: clip.id,
  });

  try {
    const { requestId } = await submitVideoJob({ prompt: vibePrompt, imageUrl }, source);
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
