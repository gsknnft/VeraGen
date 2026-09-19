import { it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// The trial spends the operator's money, so it runs against real Postgres
// (in-process PGlite with every migration applied) and the real quota SQL.
const state = vi.hoisted(() => ({ db: null as any }));
const toSql = (strings: TemplateStringsArray) => strings.reduce((sql, part, i) => sql + (i ? "$" + i : "") + part, "");
vi.mock("../lib/db", () => ({ prisma: {
  $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (await state.db.query(toSql(strings), values)).rows,
  $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => (await state.db.query(toSql(strings), values)).affectedRows ?? 0,
} }));

import { reserveTrial, releaseTrial, trialRemaining, trialConfig } from "../lib/trial";

const ENV = ["TRIAL_GENERATIONS_PER_USER", "TRIAL_DAILY_LIMIT", "VERAGEN_TRIAL_HF_KEY_ID", "VERAGEN_TRIAL_HF_KEY_SECRET"] as const;
function configure(perUser?: number, daily?: number, key = true) {
  for (const k of ENV) delete process.env[k];
  if (perUser !== undefined) process.env.TRIAL_GENERATIONS_PER_USER = String(perUser);
  if (daily !== undefined) process.env.TRIAL_DAILY_LIMIT = String(daily);
  if (key) { process.env.VERAGEN_TRIAL_HF_KEY_ID = "id"; process.env.VERAGEN_TRIAL_HF_KEY_SECRET = "secret"; }
}

beforeAll(async () => {
  state.db = new PGlite();
  const dirs = (await readdir("prisma/migrations", { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name).sort();
  for (const dir of dirs) await state.db.exec(await readFile(`prisma/migrations/${dir}/migration.sql`, "utf8"));
});
beforeEach(async () => { await state.db.exec('DELETE FROM "UsageQuota"'); });
afterAll(async () => { for (const k of ENV) delete process.env[k]; await state.db?.close(); });

it("is off unless both limits and the operator key are all set", async () => {
  configure();
  expect(trialConfig().enabled).toBe(false);
  expect(await reserveTrial("u")).toBe("off");
  configure(3, 0);
  expect(await reserveTrial("u")).toBe("off");
  configure(3, 10, false);
  expect(await reserveTrial("u")).toBe("off");
  configure(0, 10);
  expect(await reserveTrial("u")).toBe("off");
  expect(await trialRemaining("u")).toBe(0);
});

it("gives each account its allowance and no more", async () => {
  configure(2, 100);
  expect(await trialRemaining("alice")).toBe(2);
  expect(await reserveTrial("alice")).toBe("ok");
  expect(await reserveTrial("alice")).toBe("ok");
  expect(await reserveTrial("alice")).toBe("used");
  expect(await trialRemaining("alice")).toBe(0);
  expect(await reserveTrial("bob")).toBe("ok");
});

it("the daily cap stops everyone, and a user turned away keeps their slot", async () => {
  configure(2, 3);
  expect(await reserveTrial("a")).toBe("ok");
  expect(await reserveTrial("a")).toBe("ok");
  expect(await reserveTrial("b")).toBe("ok");
  expect(await reserveTrial("c")).toBe("paused");
  expect(await trialRemaining("c")).toBe(2);
});

it("returns the global slot only when no billable request was made", async () => {
  configure(1, 1);
  expect(await reserveTrial("a")).toBe("ok");
  await releaseTrial("a", { billable: false });
  expect(await trialRemaining("a")).toBe(1);
  expect(await reserveTrial("b")).toBe("ok"); // global slot came back

  await releaseTrial("b", { billable: true });
  expect(await trialRemaining("b")).toBe(1); // b keeps their free generation...
  expect(await reserveTrial("b")).toBe("paused"); // ...but the operator may have paid, so the cap holds
});

it("never exceeds the daily cap under concurrent requests", async () => {
  configure(1, 5);
  const results = await Promise.all(Array.from({ length: 25 }, (_, i) => reserveTrial(`user-${i}`)));
  expect(results.filter(r => r === "ok")).toHaveLength(5);
  expect(results.filter(r => r === "paused")).toHaveLength(20);
  // Everyone turned away still has their free generation for tomorrow.
  const left = await Promise.all(results.map((r, i) => r === "paused" ? trialRemaining(`user-${i}`) : Promise.resolve(1)));
  expect(left.every(n => n === 1)).toBe(true);
});
