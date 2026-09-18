import { NextRequest, NextResponse } from "next/server";
import { getVideoMetadata } from "@remotion/renderer";
import { prisma } from "@/lib/db";
import { getJobStatus } from "@/lib/higgsfield";
import { persistRemoteVideo } from "@/lib/storage";
import { withAccess } from "@/lib/access";

export const runtime = "nodejs";

export const GET = withAccess("clip", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
      const metadata = await getVideoMetadata(durableUrl);
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
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Could not check this job. Reconnect the original Higgsfield account if your session expired; the job is preserved." }, { status: 503 });
  }
});