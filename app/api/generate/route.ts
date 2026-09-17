import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { submitFaceVideoJob, type Vibe } from "@/lib/higgsfield";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const VALID_VIBES: Vibe[] = [
  "cinematic-pan",
  "dance-loop",
  "talking-head",
  "action-hero",
  "retro-film",
  "product-hold",
];

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { error: "Daily generation limit reached. Try again tomorrow." },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get("image");
  const vibe = form.get("vibe");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image upload" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 });
  }
  if (typeof vibe !== "string" || !VALID_VIBES.includes(vibe as Vibe)) {
    return NextResponse.json({ error: "Invalid vibe" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Re-encode through sharp: strips EXIF (including GPS location) and
  // normalizes the format, regardless of what the browser sent.
  const clean = await sharp(bytes)
    .rotate() // apply EXIF orientation before stripping it
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  // TODO(day 1 spike): confirm whether Higgsfield's image_url field
  // accepts data: URIs directly. If not, upload `clean` to Vercel Blob
  // (or similar) first and pass that public URL instead.
  const dataUri = `data:image/jpeg;base64,${clean.toString("base64")}`;

  try {
    const { requestId } = await submitFaceVideoJob(dataUri, vibe as Vibe);
    return NextResponse.json({ requestId, remaining });
  } catch (err) {
    console.error("Higgsfield submit failed", err);
    return NextResponse.json(
      { error: "Generation failed to start. Try again shortly." },
      { status: 502 }
    );
  }
}
