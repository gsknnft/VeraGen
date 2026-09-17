import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const hooks = registerHooks({ resolve(specifier, context, next) {
  if (specifier === "./higgsfield-credentials") return { url: "data:text/javascript,export async function getHiggsfieldCredentials(){return globalThis.testCredentials ?? null}", shortCircuit: true };
  return next(specifier, context);
} });
const { submitVideoJob, getJobStatus } = await import("./higgsfield.ts");
hooks.deregister();

test("only connected user credentials can submit or poll; no owner fallback or paid requests in tests", async () => {
  const originalFetch = globalThis.fetch;
  let calls = [];
  process.env.HF_API_KEY_ID = "owner-id";
  process.env.HF_API_KEY_SECRET = "owner-secret";
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(options.method === "POST" ? { request_id: "job-123" } : { status: "completed", video: { url: "https://example.com/video.mp4" } });
  };
  try {
    globalThis.testCredentials = null;
    await assert.rejects(submitVideoJob({ prompt: "test" }), /Connect your own/);
    assert.equal(calls.length, 0);
    globalThis.testCredentials = { id: "user-id", secret: "user-secret" };
    const { requestId } = await submitVideoJob({ prompt: "test", imageUrl: "https://example.com/source.jpg" });
    assert.equal(calls[0].url, "https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video");
    assert.equal(calls[0].options.headers.Authorization, "Key user-id:user-secret");
    assert.equal(JSON.parse(calls[0].options.body).image_url, "https://example.com/source.jpg");
    assert.ok(!requestId.includes("user-secret"));
    assert.equal((await getJobStatus(requestId)).status, "completed");
    assert.equal(calls[1].url, "https://api.higgsfield.ai/requests/job-123/status");
    globalThis.testCredentials = { id: "other-user", secret: "other-secret" };
    await assert.rejects(getJobStatus(requestId), /Reconnect/);
    assert.equal(calls.length, 2);
    globalThis.testCredentials = null;
    await assert.rejects(getJobStatus(requestId), /Connect your own/);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.testCredentials;
    delete process.env.HF_API_KEY_ID;
    delete process.env.HF_API_KEY_SECRET;
  }
});
