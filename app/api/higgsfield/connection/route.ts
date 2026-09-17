import { NextRequest, NextResponse } from "next/server";
import { CREDENTIAL_COOKIE, getHiggsfieldCredentials } from "@/lib/higgsfield-credentials";
import { sealCredentials, SESSION_SECONDS } from "@/lib/higgsfield-session";

export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({ connected: Boolean(await getHiggsfieldCredentials()) }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 4096) return NextResponse.json({ error: "Request too large" }, { status: 413 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  if (!body || ![body.id, body.secret].every(value => typeof value === "string" && /^[\x21-\x7e]{1,512}$/.test(value) && !value.includes(":"))) return NextResponse.json({ error: "Enter your API key ID and secret." }, { status: 400 });
  try {
    const value = sealCredentials({ id: body.id, secret: body.secret });
    const response = NextResponse.json({ connected: true, verified: false });
    response.cookies.set(CREDENTIAL_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: SESSION_SECONDS });
    return response;
  } catch { return NextResponse.json({ error: "Account connections are not configured on this server yet." }, { status: 503 }); }
}
export async function DELETE(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const response = NextResponse.json({ connected: false });
  response.cookies.set(CREDENTIAL_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
