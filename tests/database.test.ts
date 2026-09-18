import { it, expect, vi, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("../lib/db", () => ({ prisma: { $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const sql = strings.reduce((result, part, i) => result + part + (i < values.length ? "$" + (i + 1) : ""), "");
  return (await state.db.query(sql, values)).rows;
} } }));
import { consumeQuota } from "../lib/quota";
afterAll(async () => { await state.db?.close(); });
it("applies the complete schema to isolated Postgres and atomically caps concurrent requests", async () => {
  state.db = new PGlite();
  await state.db.exec(await readFile("prisma/migrations/20260918000000_platform_baseline/migration.sql", "utf8"));
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeQuota("alice:test", 3, 60)));
  expect(results.filter(Boolean)).toHaveLength(3);
  expect(await consumeQuota("bob:test", 3, 60)).toBe(true);
  await state.db.exec('UPDATE "UsageQuota" SET "expiresAt" = NOW() - INTERVAL \'1 minute\'');
  expect(await consumeQuota("alice:test", 3, 60)).toBe(true);
});

