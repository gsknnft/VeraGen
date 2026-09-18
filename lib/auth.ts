// import "server-only";
if (process.env.NEXT_RUNTIME) {
  require("server-only");
}
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./db";

/**
 * Refuse to run a production build without real auth configuration.
 *
 * better-auth falls back to a built-in default secret and only logs about it.
 * A default signing secret is a forgeable session cookie, and a log line at
 * build time is not something anyone reads before deploying. `BETTER_AUTH_URL`
 * is equally load-bearing: the API's origin check on writes compares against
 * it, so a missing value silently weakens CSRF protection too.
 */
// Not during `next build`: a build machine legitimately has no runtime
// secrets, and failing there would block deploys for the wrong reason. This
// is a start-up check, so it fires when the server actually boots.
if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  const missing = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"].filter((k) => !process.env[k]);
  if (process.env.BETTER_AUTH_SECRET && process.env.BETTER_AUTH_SECRET.length < 32) throw new Error("BETTER_AUTH_SECRET must contain at least 32 random characters.");
  if (process.env.BETTER_AUTH_URL && !process.env.BETTER_AUTH_URL.startsWith("https://")) throw new Error("Production authentication requires HTTPS.");
  if (missing.length) {
    throw new Error(
      `Refusing to start: ${missing.join(" and ")} must be set in production. ` +
        "See .env.example.",
    );
  }
}

export const auth = betterAuth({
  appName: "VeraGen",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // OAuth avoids an unverified email/password account and mail-delivery dependency.
  socialProviders: {
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? { github: { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET } } : {}),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } } : {}),
  },
  account: { accountLinking: { enabled: false } },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, cookieCache: { enabled: false } },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
  advanced: { cookiePrefix: "veragen", useSecureCookies: process.env.NODE_ENV === "production" },
});
