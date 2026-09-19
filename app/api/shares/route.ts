import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { createShareLink, sharePageUrl } from "@/lib/share";
import { uploadBuffer } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Create a public share link.
 *
 * Body JSON:
 *   { clipId } — share a project clip (poster = source/character image)
 *   { mintId } — share a claimed mint video
 *   { title?, description?, videoMediaId?, posterMediaId? } — explicit media refs
 *
 * Or multipart with `video` file + optional `title` / `posterMediaId` for
 * browser-export uploads (capped by withAccess at 4 MB — larger exports use
 * the two-phase upload then pass videoMediaId).
 */
export const POST = withAccess(null, async (req: NextRequest, _ctx, session) => {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("video");
    const title = typeof form.get("title") === "string" ? String(form.get("title")).trim() : "VeraGen video";
    const description = typeof form.get("description") === "string" ? String(form.get("description")).trim() : null;
    const posterMediaId = typeof form.get("posterMediaId") === "string" ? String(form.get("posterMediaId")) : null;
    if (!(file instanceof File) || file.size < 1) {
      return NextResponse.json({ error: "Attach a video to share." }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Video is too large for direct share upload. Export still downloads locally." }, { status: 413 });
    }
    if (file.type !== "video/mp4") {
      return NextResponse.json({ error: "Share uploads must be MP4." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const videoUrl = await uploadBuffer(`shares/${session.user.id}/${Date.now()}.mp4`, bytes, "video/mp4", session.user.id);
    const posterUrl = posterMediaId ? `/api/media/${posterMediaId}` : null;
    if (posterUrl) {
      const owned = await prisma.mediaAsset.findFirst({ where: { id: posterMediaId!, ownerId: session.user.id }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: "Poster not found." }, { status: 404 });
    }
    const share = await createShareLink({
      ownerId: session.user.id,
      title: title || "VeraGen video",
      description,
      posterUrl,
      videoUrl,
    });
    return NextResponse.json({ id: share.id, token: share.token, url: sharePageUrl(share.token) });
  }

  const body = (await req.json()) as {
    clipId?: unknown;
    mintId?: unknown;
    title?: unknown;
    description?: unknown;
    videoMediaId?: unknown;
    posterMediaId?: unknown;
  };

  if (typeof body.clipId === "string" && body.clipId) {
    const clip = await prisma.clip.findFirst({
      where: { id: body.clipId, project: { ownerId: session.user.id } },
      include: { character: true, project: { select: { name: true } } },
    });
    if (!clip) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Reuse an existing share for this clip when possible.
    const existing = await prisma.shareLink.findFirst({
      where: { ownerId: session.user.id, clipId: clip.id },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (clip.videoUrl && existing.videoUrl !== clip.videoUrl) {
        await prisma.shareLink.update({ where: { id: existing.id }, data: { videoUrl: clip.videoUrl } });
      }
      return NextResponse.json({ id: existing.id, token: existing.token, url: sharePageUrl(existing.token), status: clip.status });
    }

    const title =
      (typeof body.title === "string" && body.title.trim()) ||
      clip.character?.name ||
      clip.project.name ||
      "VeraGen clip";
    const share = await createShareLink({
      ownerId: session.user.id,
      title,
      description: typeof body.description === "string" ? body.description : clip.prompt.slice(0, 280),
      posterUrl: clip.sourceImageUrl ?? clip.character?.referenceImageUrl ?? null,
      videoUrl: clip.videoUrl,
      clipId: clip.id,
    });
    return NextResponse.json({ id: share.id, token: share.token, url: sharePageUrl(share.token), status: clip.status });
  }

  if (typeof body.mintId === "string" && body.mintId) {
    const mint = await prisma.mint.findFirst({
      where: {
        id: body.mintId,
        OR: [{ claimedById: session.user.id }, { collection: { ownerId: session.user.id } }],
      },
      include: { collection: { select: { name: true } } },
    });
    if (!mint) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const existing = await prisma.shareLink.findFirst({
      where: { ownerId: session.user.id, mintId: mint.id },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (mint.videoUrl && existing.videoUrl !== mint.videoUrl) {
        await prisma.shareLink.update({
          where: { id: existing.id },
          data: { videoUrl: mint.videoUrl, posterUrl: mint.imageUrl ?? existing.posterUrl },
        });
      }
      return NextResponse.json({ id: existing.id, token: existing.token, url: sharePageUrl(existing.token), status: mint.status });
    }
    const share = await createShareLink({
      ownerId: session.user.id,
      title: `${mint.collection.name} #${mint.mintNumber}`,
      description: typeof body.description === "string" ? body.description : "Animated with VeraGen",
      posterUrl: mint.imageUrl,
      videoUrl: mint.videoUrl,
      mintId: mint.id,
    });
    return NextResponse.json({ id: share.id, token: share.token, url: sharePageUrl(share.token), status: mint.status });
  }

  // Explicit media ids (e.g. after two-phase upload of a browser export).
  const videoMediaId = typeof body.videoMediaId === "string" ? body.videoMediaId : null;
  const posterMediaId = typeof body.posterMediaId === "string" ? body.posterMediaId : null;
  if (!videoMediaId && !posterMediaId) {
    return NextResponse.json({ error: "Provide a clipId, mintId, or media to share." }, { status: 400 });
  }
  for (const id of [videoMediaId, posterMediaId].filter(Boolean) as string[]) {
    const owned = await prisma.mediaAsset.findFirst({ where: { id, ownerId: session.user.id }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "VeraGen video";
  const share = await createShareLink({
    ownerId: session.user.id,
    title,
    description: typeof body.description === "string" ? body.description : null,
    posterUrl: posterMediaId ? `/api/media/${posterMediaId}` : null,
    videoUrl: videoMediaId ? `/api/media/${videoMediaId}` : null,
  });
  return NextResponse.json({ id: share.id, token: share.token, url: sharePageUrl(share.token) });
});

