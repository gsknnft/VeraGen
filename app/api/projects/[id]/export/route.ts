import path from "path";
import os from "os";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { prisma } from "@/lib/db";
import { uploadBuffer } from "@/lib/storage";
import { FREE_EXPORT_MAX_SECONDS } from "@/lib/config";
import { totalDurationSeconds, type TimelineClip } from "@/remotion/durationUtils";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { clips: { where: { status: "completed" }, orderBy: { order: "asc" } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.clips.length === 0) {
    return NextResponse.json({ error: "No completed clips to export" }, { status: 400 });
  }

  const timelineClips: TimelineClip[] = project.clips.map((c) => ({
    id: c.id,
    videoUrl: c.videoUrl!,
    trimStart: c.trimStart,
    trimEnd: c.trimEnd ?? c.durationSeconds ?? c.trimStart,
    transitionIn: c.transitionIn,
  }));

  const duration = totalDurationSeconds(timelineClips);
  if (duration > FREE_EXPORT_MAX_SECONDS) {
    return NextResponse.json(
      {
        error: `Free tier caps exports at ${FREE_EXPORT_MAX_SECONDS}s of final video (this timeline is ${duration.toFixed(1)}s). Tiered plans for longer exports are coming.`,
      },
      { status: 402 }
    );
  }

  const outputLocation = path.join(os.tmpdir(), `loopface-export-${randomUUID()}.mp4`);

  try {
    const serveUrl = await bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    });

    const composition = await selectComposition({
      serveUrl,
      id: "Studio",
      inputProps: { clips: timelineClips },
    });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation,
      inputProps: { clips: timelineClips },
    });

    const buffer = await fs.readFile(outputLocation);
    const videoUrl = await uploadBuffer(
      `exports/${projectId}/${randomUUID()}.mp4`,
      buffer,
      "video/mp4"
    );

    const exportRow = await prisma.export.create({
      data: { projectId, videoUrl, durationSeconds: duration },
    });

    return NextResponse.json(exportRow);
  } catch (err) {
    console.error("Export render failed", err);
    return NextResponse.json({ error: "Export failed to render" }, { status: 500 });
  } finally {
    await fs.unlink(outputLocation).catch(() => {});
  }
}
