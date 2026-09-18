import { it, expect, vi } from "vitest";
const state = vi.hoisted(() => ({ session: null as any, cookie: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: state.cookie }) }) }));
vi.mock("../lib/session", () => ({ currentSession: async () => state.session }));
import { sealCredentials } from "../lib/higgsfield-session";
import { getHiggsfieldCredentials } from "../lib/higgsfield-credentials";
it("cannot inherit a previous user's provider key after account switching or session replacement", async () => {
  process.env.VERAGEN_SESSION_SECRET = "ab".repeat(32);
  state.cookie = sealCredentials({ id: "id", secret: "secret", userId: "alice", sessionId: "a" });
  state.session = { user: { id: "alice" }, session: { id: "a" } };
  expect(await getHiggsfieldCredentials()).not.toBeNull();
  state.session.user.id = "bob"; expect(await getHiggsfieldCredentials()).toBeNull();
  state.session = { user: { id: "alice" }, session: { id: "new" } }; expect(await getHiggsfieldCredentials()).toBeNull();
  state.session = null; expect(await getHiggsfieldCredentials()).toBeNull();
});

