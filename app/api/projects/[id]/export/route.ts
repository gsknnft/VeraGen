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
import {
  DEFAULT_ASPECT,
  isAspect,
  totalDurationSecondsWithBrand,
  type BrandKit,
  type TimelineClip,
} from "@/remotion/durationUtils";
import type { StudioCompositionProps } from "@/remotion/Composition";
import { withAccess } from "@/lib/access";

export const runtime = "nodejs";
export const maxDuration = 120;

export const POST = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id: projectId } = await params;

  const body = (await req.json().catch(() => ({}))) as { aspect?: string };
  const aspect = typeof body.aspect === "string" && isAspect(body.aspect) ? body.aspect : DEFAULT_ASPECT;

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
    caption: c.caption,
  }));

  const brand: BrandKit = {
    logoUrl: project.brandLogoUrl,
    ctaText: project.ctaText,
    template: project.template,
  };

  const duration = totalDurationSecondsWithBrand(timelineClips, brand);
  if (duration > FREE_EXPORT_MAX_SECONDS) {
    return NextResponse.json(
      {
        error: `Free tier caps exports at ${FREE_EXPORT_MAX_SECONDS}s of final video, intro/outro included (this timeline is ${duration.toFixed(1)}s). Tiered plans for longer exports are coming.`,
      },
      { status: 402 }
    );
  }

  const outputLocation = path.join(os.tmpdir(), `loopface-export-${randomUUID()}.mp4`);

  // Cast to satisfy Remotion's Record<string, unknown> inputProps signature
  // — it just serializes whatever's given, and Root.tsx's calculateMetadata
  // treats it as StudioCompositionProps on the other side.
  const inputProps = {
    clips: timelineClips,
    brand,
    projectName: project.name,
    aspect,
  } satisfies StudioCompositionProps as Record<string, unknown>;

  try {
    const serveUrl = await bundle({
      entryPoint: path.join(process.cwd(), "remotion", "index.ts"),
    });

    const composition = await selectComposition({ serveUrl, id: "Studio", inputProps });

    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps });

    const buffer = await fs.readFile(outputLocation);
    const videoUrl = await uploadBuffer(
      `exports/${projectId}/${randomUUID()}.mp4`,
      buffer,
      "video/mp4"
    );

    const exportRow = await prisma.export.create({
      data: { projectId, videoUrl, durationSeconds: duration, aspect },
    });

    return NextResponse.json(exportRow);
  } catch (err) {
    console.error("Export render failed", err);
    return NextResponse.json({ error: "Export failed to render" }, { status: 500 });
  } finally {
    await fs.unlink(outputLocation).catch(() => {});
  }
});