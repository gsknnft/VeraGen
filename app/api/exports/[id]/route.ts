import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { queuePosition } from "@/lib/render-queue";

export const runtime = "nodejs";

/**
 * Poll target for a queued render. Mirrors `/api/clips/[id]/status`: the job
 * row is the source of truth, and the client asks until it stops being
 * `queued` or `rendering`.
 */
export const GET = withAccess("export", async (
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  const { id } = await params;

  const job = await prisma.export.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      videoUrl: true,
      aspect: true,
      durationSeconds: true,
      errorMessage: true,
      attempts: true,
      createdAt: true,
    },
  });
  if (!job) {
    return NextResponse.json({ error: "Export not found" }, { status: 404 });
  }

  // Only meaningful while waiting, and it costs a COUNT, so it is not computed
  // for finished jobs.
  const position = job.status === "queued" ? await queuePosition(job.id, job.createdAt) : 0;

  return NextResponse.json({ ...job, queuePosition: position });
});
