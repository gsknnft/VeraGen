import { it, expect, vi } from "vitest";
const update = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }));
vi.mock("../lib/db", () => ({ prisma: { export: { updateMany: update } } }));
import { completeExport, failExport } from "../lib/render-queue";
it("an old worker cannot overwrite a reclaimed render attempt", async () => {
  await completeExport("job", 1, "/api/media/output");
  expect(update.mock.calls.at(-1)?.[0].where).toEqual({ id: "job", attempts: 1, status: "rendering" });
  await failExport("job", 1, "Please retry.");
  expect(update.mock.calls.at(-1)?.[0].where).toEqual({ id: "job", attempts: 1, status: "rendering" });
});
