import { NextRequest, NextResponse } from "next/server";
import { withAccess } from "@/lib/access";
import { consumeQuota } from "@/lib/quota";
import { presignUpload, UPLOAD_TYPES, type UploadType } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Step 1 of bringing your own clip: get a URL to PUT the video straight to
 * the bucket. No Higgsfield account needed — this is the path that makes the
 * editor usable by anyone, at no generation cost to them or to us.
 */
export const POST = withAccess("project", async (
  req: NextRequest,
  _context: { params: Promise<{ id: string }> },
  session,
) => {
  const body = (await req.json()) as { contentType?: unknown; size?: unknown };
  if (typeof body.contentType !== "string" || !UPLOAD_TYPES.includes(body.contentType as UploadType)) {
    return NextResponse.json({ error: "Upload an MP4 or MOV video." }, { status: 400 });
  }
  if (typeof body.size !== "number") {
    return NextResponse.json({ error: "Missing file size." }, { status: 400 });
  }

  // Each presign can place up to 64 MB in the bucket before anything is
  // verified. Pending objects expire on their own, but this bounds how much
  // one account can stage in the meantime.
  if (!(await consumeQuota(`upload:${session.user.id}`, 30, 3600))) {
    return NextResponse.json({ error: "Too many uploads this hour. Try again later." }, { status: 429 });
  }

  try {
    return NextResponse.json(await presignUpload(session.user.id, body.contentType as UploadType, body.size));
  } catch (err) {
    // These messages are written for users (size, type, allowance); nothing
    // from the storage provider reaches here.
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload could not start." }, { status: 400 });
  }
});
