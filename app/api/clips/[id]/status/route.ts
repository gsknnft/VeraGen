import { NextRequest, NextResponse } from "next/server";
import { getVideoMetadata } from "@remotion/renderer";
import { prisma } from "@/lib/db";
import { getJobStatus } from "@/lib/higgsfield";
import { persistRemoteVideo, signedMediaUrl } from "@/lib/storage";
import { UnapprovedMediaHost } from "@/lib/safe-download";
import { withAccess } from "@/lib/access";
import { attachClipVideoToShares } from "@/lib/share";

export const runtime = "nodejs";

export const GET = withAccess("clip", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, session
) => {
  const { id } = await params;

  const clip = await prisma.clip.findUnique({ where: { id } });
  if (!clip) {
    return NextResponse.json({ error: "Clip not found" }, { status: 404 });
  }

  // Already resolved on a previous poll — nothing to do against Higgsfield.
  if (clip.status !== "processing") {
    return NextResponse.json(clip);
  }
  if (!clip.higgsfieldRequestId) {
    return NextResponse.json({ error: "Clip has no pending job" }, { status: 400 });
  }

  try {
    const status = await getJobStatus(clip.higgsfieldRequestId);

    if (status.status === "processing") {
      return NextResponse.json(clip);
    }

    if (status.status === "failed") {
      const updated = await prisma.clip.update({
        where: { id },
        data: { status: "failed", errorMessage: status.error },
      });
      return NextResponse.json(updated);
    }

    // Completed: re-host the video in our own storage (Higgsfield's URL
    // is not guaranteed to stay valid indefinitely) and probe its real
    // duration so trim/timeline math has accurate numbers. Mock mode's
    // clips are already permanently hosted and their duration is known,
    // so there's nothing to persist or probe — and no storage config
    // needs to exist yet for mock mode to work end to end.
    let durableUrl = status.videoUrl;
    let duration = status.durationSeconds ?? 5;
    if (!status.skipPersist) {
      durableUrl = await persistRemoteVideo(status.videoUrl, `clips/${id}.mp4`);
      const metadata = await getVideoMetadata(await signedMediaUrl(durableUrl, session.user.id));
      duration = metadata.durationInSeconds ?? 5;
    }

    const updated = await prisma.clip.update({
      where: { id },
      data: {
        status: "completed",
        videoUrl: durableUrl,
        durationSeconds: duration,
        trimStart: 0,
        trimEnd: duration,
      },
    });
    if (durableUrl) await attachClipVideoToShares(id, durableUrl);
    return NextResponse.json(updated);
  } catch (err) {
    // A finished-but-unsaveable clip is a setup problem on our side, not the
    // user's session. Telling them to reconnect their account would send them
    // to fix the wrong thing while the provider's result link ages.
    if (err instanceof UnapprovedMediaHost || (err instanceof Error && err.message === "Private storage is not configured.")) {
      return NextResponse.json({ error: "Your clip finished generating. This server isn't set up to save it yet; it's preserved and will appear once setup is complete." }, { status: 503 });
    }
    console.error(`[veragen] clip ${id} status check failed:`, err instanceof Error ? `${err.name}: ${err.message}` : err);
    return NextResponse.json({ error: "Could not check this job. Reconnect the original Higgsfield account if your session expired; the job is preserved." }, { status: 503 });
  }
});