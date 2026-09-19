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
  // Every migration, in order — not just the baseline — so a later migration
  // that fails to apply on a real database fails here first.
  const { readdir } = await import("node:fs/promises");
  const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  expect(dirs.length).toBeGreaterThan(1);
  for (const dir of dirs) await state.db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"));
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeQuota("alice:test", 3, 60)));
  expect(results.filter(Boolean)).toHaveLength(3);
  expect(await consumeQuota("bob:test", 3, 60)).toBe(true);
  await state.db.exec('UPDATE "UsageQuota" SET "expiresAt" = NOW() - INTERVAL \'1 minute\'');
  expect(await consumeQuota("alice:test", 3, 60)).toBe(true);
});

