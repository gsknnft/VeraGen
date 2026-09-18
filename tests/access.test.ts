import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const state = vi.hoisted(() => ({ session: null as any, quota: true, owner: "alice", find: vi.fn() }));
vi.mock("../lib/session", () => ({ currentSession: async () => state.session }));
vi.mock("../lib/quota", () => ({ consumeQuota: async () => state.quota }));
vi.mock("../lib/db", () => ({ prisma: Object.fromEntries(["project","clip","character","collection","traitCategory","traitOption","mint","export","mediaAsset"].map(kind => [kind, { findFirst: state.find }])) }));
import { withAccess } from "../lib/access";
import { ownerFilter, type ResourceKind } from "../lib/ownership";
const context = { params: Promise.resolve({ id: "resource" }) };
const request = (method = "GET", origin = "http://localhost:3000", body?: string) => new NextRequest("http://localhost:3000/api/test", { method, headers: { origin }, ...(body ? { body } : {}) });
beforeEach(() => {
  delete process.env.BETTER_AUTH_URL;
  state.session = { user: { id: "alice" }, session: { id: "session-a" } }; state.quota = true;
  state.find.mockReset().mockImplementation(async ({ where }) => JSON.stringify(where).includes('"alice"') ? { id: "resource" } : null);
});
describe("tenant boundary", () => {
  for (const kind of ["project","clip","character","collection","traitCategory","traitOption","mint","export","mediaAsset"] as ResourceKind[]) {
    it(kind + " denies another tenant before executing the handler", async () => {
      const handler = vi.fn(async () => NextResponse.json({ private: true }));
      state.session.user.id = "bob";
      const response = await withAccess(kind, handler)(request(), context);
      expect(response.status).toBe(404); expect(handler).not.toHaveBeenCalled();
      expect(state.find).toHaveBeenCalledWith({ where: { id: "resource", ...ownerFilter(kind, "bob") }, select: { id: true } });
    });
  }
  it("denies signed-out requests and forged-cookie assumptions", async () => {
    state.session = null; const handler = vi.fn();
    expect((await withAccess("project", handler)(request(), context)).status).toBe(401);
    expect(handler).not.toHaveBeenCalled(); expect(state.find).not.toHaveBeenCalled();
  });
  it("allows an owner and prevents response caching", async () => {
    const response = await withAccess("clip", async () => NextResponse.json({ ok: true }))(request(), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects cross-origin writes before resource access", async () => {
    const handler = vi.fn();
    expect((await withAccess("project", handler)(request("PATCH", "https://evil.example"), context)).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
  it("bounds bodies even without a content-length header", async () => {
    const handler = vi.fn();
    expect((await withAccess(null, handler)(request("POST", undefined, "x".repeat(33000)), context)).status).toBe(413);
    expect(handler).not.toHaveBeenCalled();
  });
  it("enforces shared quotas and does not leak exception messages", async () => {
    state.quota = false;
    expect((await withAccess(null, vi.fn())(request("POST"), context)).status).toBe(429);
    const response = await withAccess(null, async () => { throw new Error("SECRET"); })(request(), context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("SECRET");
  });
});

