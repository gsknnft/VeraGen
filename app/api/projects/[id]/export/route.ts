import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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
import { enqueueExport } from "@/lib/render-queue";

export const runtime = "nodejs";

/**
 * Enqueues a render; it does not perform one.
 *
 * Rendering here meant holding the request open for minutes while a headless
 * Chromium ran, losing the job entirely on deploy, and letting N clicks start
 * N Chromiums on the same box. The worker (`worker/render-worker.ts`) claims
 * these one at a time. Poll `GET /api/exports/[id]` for the result.
 */
export const POST = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  if (process.env.ENABLE_SERVER_EXPORTS !== "true") return NextResponse.json({ error: "Server export is disabled. Use browser export." }, { status: 503 });
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

  // One queued export per project at a time. Without this, holding the button
  // down queues a dozen identical renders that each cost a Chromium.
  const inFlight = await prisma.export.findFirst({
    where: { projectId, status: { in: ["queued", "rendering"] } },
    select: { id: true, status: true },
  });
  if (inFlight) {
    return NextResponse.json(
      { error: "This project already has an export in progress.", ...inFlight },
      { status: 409 }
    );
  }

  // Cast to satisfy Remotion's Record<string, unknown> inputProps signature
  // — it just serializes whatever's given, and Root.tsx's calculateMetadata
  // treats it as StudioCompositionProps on the other side.
  const inputProps = {
    clips: timelineClips,
    brand,
    projectName: project.name,
    aspect,
  } satisfies StudioCompositionProps as Record<string, unknown>;

  const job = await enqueueExport({
    projectId,
    aspect,
    durationSeconds: duration,
    // Prisma's InputJsonValue does not accept an open Record; the value is a
    // plain serializable object, which is what the column stores.
    inputProps: inputProps as Prisma.InputJsonObject,
  });

  return NextResponse.json(job, { status: 202 });
});
