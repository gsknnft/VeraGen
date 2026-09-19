import { NextRequest, NextResponse } from "next/server";
import { getVideoMetadata } from "@remotion/renderer";
import { prisma } from "@/lib/db";
import { getJobStatus } from "@/lib/higgsfield";
import { persistRemoteVideo, signedMediaUrl } from "@/lib/storage";
import { UnapprovedMediaHost } from "@/lib/safe-download";
import { withAccess } from "@/lib/access";

export const runtime = "nodejs";

export const GET = withAccess("mint", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }, session
) => {
  const { id } = await params;

  const mint = await prisma.mint.findUnique({
    where: { id },
    include: { traits: { include: { traitOption: true } } },
  });
  if (!mint) {
    return NextResponse.json({ error: "Mint not found" }, { status: 404 });
  }

  if (mint.status !== "processing") {
    return NextResponse.json(mint);
  }
  if (!mint.higgsfieldRequestId) {
    return NextResponse.json({ error: "Mint has no pending job" }, { status: 400 });
  }

  try {
    const status = await getJobStatus(mint.higgsfieldRequestId);

    if (status.status === "processing") {
      return NextResponse.json(mint);
    }

    if (status.status === "failed") {
      const updated = await prisma.mint.update({
        where: { id },
        data: { status: "failed", errorMessage: status.error },
        include: { traits: { include: { traitOption: true } } },
      });
      return NextResponse.json(updated);
    }

    let durableUrl = status.videoUrl;
    let duration = status.durationSeconds ?? 5;
    if (!status.skipPersist) {
      durableUrl = await persistRemoteVideo(status.videoUrl, `mints/${id}.mp4`);
      const metadata = await getVideoMetadata(await signedMediaUrl(durableUrl, session.user.id));
      duration = metadata.durationInSeconds ?? 5;
    }

    const updated = await prisma.mint.update({
      where: { id },
      data: { status: "completed", videoUrl: durableUrl, durationSeconds: duration },
      include: { traits: { include: { traitOption: true } } },
    });
    return NextResponse.json(updated);
  } catch (err) {
    // See the clip status route: a setup gap is not the user's session.
    if (err instanceof UnapprovedMediaHost || (err instanceof Error && err.message === "Private storage is not configured.")) {
      return NextResponse.json({ error: "Your mint finished generating. This server isn't set up to save it yet; it's preserved and will appear once setup is complete." }, { status: 503 });
    }
    console.error(`[veragen] mint ${id} status check failed:`, err instanceof Error ? `${err.name}: ${err.message}` : err);
    return NextResponse.json({ error: "Could not check this job. Reconnect the original Higgsfield account if your session expired; the job is preserved." }, { status: 503 });
  }
});
