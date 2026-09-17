import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "./session";
import { prisma } from "./db";
import { ownerFilter, type ResourceKind } from "./ownership";
import { consumeQuota } from "./quota";

type Context = { params: Promise<{ id: string }> };
type Handler = (request: NextRequest, context: Context) => Promise<Response>;
export function withAccess(kind: ResourceKind | null, handler: Handler): Handler {
  return async (request, context) => {
    try {
      const session = await currentSession();
      if (!session) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
      if (!["GET", "HEAD"].includes(request.method)) {
        const origin = process.env.BETTER_AUTH_URL ? new URL(process.env.BETTER_AUTH_URL).origin : request.nextUrl.origin;
        if (request.headers.get("origin") !== origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
        const maxBytes = request.headers.get("content-type")?.startsWith("multipart/form-data") ? 4 * 1024 * 1024 : 32 * 1024;
        if (Number(request.headers.get("content-length")) > maxBytes) return NextResponse.json({ error: "Request too large" }, { status: 413 });
        // Bound chunked bodies as well as requests with Content-Length.
        const reader = request.body?.getReader();
        if (reader) {
          const chunks: Uint8Array[] = []; let size = 0;
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            size += value.byteLength;
            if (size > maxBytes) { await reader.cancel(); return NextResponse.json({ error: "Request too large" }, { status: 413 }); }
            chunks.push(value);
          }
          request = new NextRequest(request.url, { method: request.method, headers: request.headers, body: Buffer.concat(chunks) });
        }
        if (!(await consumeQuota(`write:${session.user.id}`, 120, 60))) return NextResponse.json({ error: "Please slow down." }, { status: 429, headers: { "Retry-After": "60" } });
      }
      if (kind) {
        const { id } = await context.params;
        const delegate = prisma[kind] as unknown as { findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<unknown> };
        const owned = await delegate.findFirst({ where: { id, ...ownerFilter(kind, session.user.id) }, select: { id: true } });
        if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const response = await handler(request, context);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      // Never serialize provider errors, secrets, database URLs, or stack traces to clients.
      return NextResponse.json({ error: "Request could not be completed. Please try again." }, { status: 503 });
    }
  };
}
