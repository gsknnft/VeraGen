import { NextRequest, NextResponse } from "next/server";
import { signedUrlForShare } from "@/lib/share";

export const runtime = "nodejs";

/**
 * Public (no session) media for a share token. Discord/X and browsers fetch
 * this absolute URL for og:image / og:video / playback.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const kindParam = req.nextUrl.searchParams.get("kind") ?? "video";
  const kind = kindParam === "poster" ? "poster" : "video";
  try {
    const result = await signedUrlForShare(token, kind);
    if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const response = NextResponse.redirect(result.url, 307);
    // Crawlers cache aggressively; signed URLs expire in 10 minutes.
    response.headers.set("Cache-Control", "public, max-age=60");
    return response;
  } catch (err) {
    if (err instanceof Error && err.message === "Private storage is not configured.") {
      return NextResponse.json({ error: "Media is temporarily unavailable." }, { status: 503 });
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
