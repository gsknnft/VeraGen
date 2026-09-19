import { prisma } from "./db";
// One atomic upsert per key. Counters reset in place, so rows do not grow per time window.
export async function consumeQuota(key: string, limit: number, seconds: number) {
  const now = new Date();
  const expires = new Date(now.getTime() + seconds * 1000);
  const result = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "UsageQuota" ("key", "count", "expiresAt") VALUES (${key}, 1, ${expires})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "UsageQuota"."expiresAt" <= ${now} THEN 1 ELSE "UsageQuota"."count" + 1 END,
      "expiresAt" = CASE WHEN "UsageQuota"."expiresAt" <= ${now} THEN ${expires} ELSE "UsageQuota"."expiresAt" END
    WHERE "UsageQuota"."expiresAt" <= ${now} OR "UsageQuota"."count" < ${limit}
    RETURNING "count"`;
  return result.length > 0;
}

/** Give back one unit, never going below zero. For a reservation that did not end in a billable call. */
export async function refundQuota(key: string) {
  await prisma.$executeRaw`UPDATE "UsageQuota" SET "count" = "count" - 1 WHERE "key" = ${key} AND "count" > 0`;
}

/** Units used in the current window (0 if the window has expired or never started). */
export async function quotaUsed(key: string) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT "count" FROM "UsageQuota" WHERE "key" = ${key} AND "expiresAt" > ${new Date()}`;
  return rows[0]?.count ?? 0;
}
