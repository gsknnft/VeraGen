import test from "node:test";
import assert from "node:assert/strict";
import { sealCredentials, openCredentials, SESSION_SECONDS } from "./higgsfield-session.ts";

test("credentials round-trip encrypted, expire, reject tampering and server-key rotation", () => {
  process.env.VERAGEN_SESSION_SECRET = "ab".repeat(32);
  const credentials = { id: "test-id", secret: "test-secret", userId: "alice", sessionId: "session-a" };
  const token = sealCredentials(credentials, 1000);
  assert.deepEqual(openCredentials(token, 1001), credentials);
  assert.ok(!Buffer.from(token, "base64url").toString().includes(credentials.secret));
  assert.equal(openCredentials(token, 1000 + SESSION_SECONDS * 1000), null);
  const modified = Buffer.from(token, "base64url");
  modified[30] ^= 1;
  assert.equal(openCredentials(modified.toString("base64url"), 1001), null);
  process.env.VERAGEN_SESSION_SECRET = "cd".repeat(32);
  assert.equal(openCredentials(token, 1001), null);
  delete process.env.VERAGEN_SESSION_SECRET;
  assert.throws(() => sealCredentials(credentials));
  assert.equal(openCredentials(token), null);
});
