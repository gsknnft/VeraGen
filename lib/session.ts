import "server-only";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { prisma } from "./db";

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/**
 * A real, persisted user that stands in for a signed-in one during local
 * development, so the studio is usable without an OAuth round trip.
 *
 * Two independent gates, both required:
 *   - `NODE_ENV` is not `production`. This is checked first and cannot be
 *     overridden by any environment variable, so a production build ignores
 *     the whole mechanism even if the var is set by accident.
 *   - `VERAGEN_DEV_USER` is set to an email address, deliberately, by hand.
 *
 * The user is a real row, not a fabricated id, because ownership filters join
 * against `User` — a phantom id would make every owned query return nothing
 * and look like a bug in `withAccess` rather than a missing user.
 */
const DEV_USER_EMAIL = process.env.VERAGEN_DEV_USER;
const DEV_ENABLED = process.env.NODE_ENV !== "production" && !!DEV_USER_EMAIL;

let warned = false;

async function devSession(): Promise<Session | null> {
  if (!DEV_ENABLED || !DEV_USER_EMAIL) return null;

  if (!warned) {
    warned = true;
    console.warn(
      `[veragen] DEV AUTH BYPASS ACTIVE — every request is treated as ${DEV_USER_EMAIL}. ` +
        "Unset VERAGEN_DEV_USER to require real sign-in.",
    );
  }

  const user = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: {
      // better-auth owns id generation for real users, so `User.id` has no
      // database default. A stable, derived id keeps the same dev user across
      // restarts and across a reset database.
      id: `dev-${createHash("sha256").update(DEV_USER_EMAIL).digest("hex").slice(0, 24)}`,
      email: DEV_USER_EMAIL,
      name: "Dev User",
      emailVerified: true,
    },
  });

  // Shaped like better-auth's session so callers cannot tell the difference.
  // Never written to the Session table: this grants nothing beyond the
  // process that created it, and leaves no credential behind.
  return {
    user,
    session: {
      id: "dev-session",
      userId: user.id,
      token: "dev-session",
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
    },
  } as unknown as Session;
}

export async function currentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) return session;
  return devSession();
}

export async function requireUser() {
  const session = await currentSession();
  if (!session) redirect("/sign-in");
  return session.user;
}
