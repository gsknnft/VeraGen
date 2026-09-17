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
