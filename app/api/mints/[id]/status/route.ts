import { NextRequest, NextResponse } from "next/server";
import { getVideoMetadata } from "@remotion/renderer";
import { prisma } from "@/lib/db";
import { getJobStatus } from "@/lib/higgsfield";
import { persistRemoteVideo } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
      const metadata = await getVideoMetadata(durableUrl);
      duration = metadata.durationInSeconds ?? 5;
    }

    const updated = await prisma.mint.update({
      where: { id },
      data: { status: "completed", videoUrl: durableUrl, durationSeconds: duration },
      include: { traits: { include: { traitOption: true } } },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Could not check this job. Reconnect the original Higgsfield account if your session expired; the job is preserved." }, { status: 503 });
  }
}
