import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "./session";
import { prisma } from "./db";
import { ownerFilter, type ResourceKind } from "./ownership";
import { consumeQuota } from "./quota";

/**
 * Collection-level routes (`POST /api/projects`) have no `:id` segment, so
 * their params resolve to `{}`. Those pass `kind: null` and never read it.
 */
type Params = Record<string, string>;
type Context<P extends Params> = { params: Promise<P> };
type Session = NonNullable<Awaited<ReturnType<typeof currentSession>>>;
/**
 * The verified session is handed to the handler rather than looked up again.
 * A create needs `session.user.id` to set `ownerId`, and a second
 * `currentSession()` inside the handler would be both wasteful and a chance
 * for the two to disagree.
 */
type Handler<P extends Params> = (
  request: NextRequest,
  context: Context<P>,
  session: Session,
) => Promise<Response>;

/**
 * `P` is inferred from the handler so the wrapped export matches whatever
 * shape Next generates for that route: `{}` for a collection route,
 * `{ id: string }` for a `[id]` segment. Widening `Context` to one fixed
 * shape fails the generated route validator in one direction or the other.
 */
export function withAccess<P extends Params = Params>(
  kind: ResourceKind | null,
  handler: Handler<P>,
): (request: NextRequest, context: Context<P>) => Promise<Response> {
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
        if (!context.params) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const { id } = (await context.params) as { id?: string };
        if (!id) return NextResponse.json({ error: "Not found" }, { status: 404 });
        const delegate = prisma[kind] as unknown as { findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<unknown> };
        const owned = await delegate.findFirst({ where: { id, ...ownerFilter(kind, session.user.id) }, select: { id: true } });
        // 404 rather than 403: a resource someone else owns should not be
        // distinguishable from one that does not exist.
        if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const response = await handler(request, context, session);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      // Never serialize provider errors, secrets, database URLs, or stack traces to clients.
      return NextResponse.json({ error: "Request could not be completed. Please try again." }, { status: 503 });
    }
  };
}
