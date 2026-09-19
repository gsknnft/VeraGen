import { uploadError } from "@/lib/upload-error";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { withAccess } from "@/lib/access";
import { claimUpload } from "@/lib/storage";

export const runtime = "nodejs";

/** Longest clip the timeline accepts; matches the trim bounds in lib/input.ts. */
const MAX_DURATION_SECONDS = 600;

/**
 * Step 2: verify what actually landed in the bucket and put it on the
 * timeline as a finished clip.
 *
 * `durationSeconds` comes from the browser's own read of the file. It is
 * trusted, within bounds, because it only drives this user's own timeline
 * math and their own device's render. The server cannot probe it without
 * downloading the whole video, which is the exact cost direct upload avoids.
 */
export const POST = withAccess("project", async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session,
) => {
  const { id: projectId } = await params;
  const body = (await req.json()) as { key?: unknown; durationSeconds?: unknown; name?: unknown };

  if (typeof body.key !== "string") {
    return NextResponse.json({ error: "Missing upload." }, { status: 400 });
  }
  const duration = typeof body.durationSeconds === "number" && Number.isFinite(body.durationSeconds)
    ? Math.min(Math.max(body.durationSeconds, 0.1), MAX_DURATION_SECONDS)
    : null;
  if (duration === null) {
    return NextResponse.json({ error: "Could not read this video's length. Try a different file." }, { status: 400 });
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Uploaded clip";

  // Completing the same upload twice (a double click, a retried request)
  // returns the clip it already made. The pending object is gone after the
  // first claim, so without this a retry would report "not found".
  const submissionKey = createHash("sha256").update(`upload:${session.user.id}:${projectId}:${body.key}`).digest("hex");
  const previous = await prisma.clip.findUnique({ where: { submissionKey } });
  if (previous) return NextResponse.json(previous);

  let reference: string;
  try {
    ({ reference } = await claimUpload(session.user.id, body.key));
  } catch (err) {
    return NextResponse.json({ error: uploadError(err) }, { status: 400 });
  }

  const last = await prisma.clip.findFirst({ where: { projectId }, orderBy: { order: "desc" } });
  const clip = await prisma.clip.upsert({
    where: { submissionKey },
    update: {},
    create: {
      projectId,
      submissionKey,
      order: (last?.order ?? -1) + 1,
      prompt: name,
      vibe: "upload",
      status: "completed",
      videoUrl: reference,
      durationSeconds: duration,
      trimStart: 0,
      trimEnd: duration,
    },
  });
  return NextResponse.json(clip);
});
