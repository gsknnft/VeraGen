import { it, expect, vi, beforeEach } from "vitest";
const state = vi.hoisted(() => ({ existing: null as any, send: vi.fn(), create: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async importOriginal => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>();
  return { ...actual, S3Client: class { send = state.send; } };
});
vi.mock("../lib/db", () => ({ prisma: {
  mediaAsset: { findFirst: async () => state.existing },
  $transaction: async (callback: any) => callback({
    $executeRaw: async () => 1,
    mediaAsset: { findUnique: async () => null, aggregate: async () => ({ _sum: { size: 0 } }), create: state.create },
  }),
} }));
import { claimUpload } from "../lib/storage";
const pending = "veragen/pending/alice/0f8fad5b-d9cb-469f-a165-70867728950e";
beforeEach(() => {
  Object.assign(process.env, { S3_ENDPOINT: "https://storage.invalid", S3_ACCESS_KEY_ID: "test", S3_SECRET_ACCESS_KEY: "test", S3_BUCKET: "test" });
  state.existing = null;
  state.create.mockReset().mockResolvedValue({ id: "asset" });
  state.send.mockReset().mockImplementation(async command => {
    switch (command.constructor.name) {
      case "HeadObjectCommand": return { ContentLength: 1024, ContentType: "video/mp4", ETag: '"original"' };
      case "GetObjectCommand": return { Body: { transformToByteArray: async () => Buffer.from([0,0,0,24,102,116,121,112,0,0,0,0]) } };
      default: return {};
    }
  });
});
it("pins inspection and promotion to the same object version and makes the final object private", async () => {
  expect((await claimUpload("alice", pending)).reference).toBe("/api/media/asset");
  const commands = state.send.mock.calls.map(([command]) => command);
  expect(commands.find(c => c.constructor.name === "GetObjectCommand").input.IfMatch).toBe('"original"');
  expect(commands.find(c => c.constructor.name === "CopyObjectCommand").input).toMatchObject({ CopySourceIfMatch: '"original"', ACL: "private" });
  expect(state.create).toHaveBeenCalledOnce();
});
it("returns an already completed claim without fetching a deleted pending object", async () => {
  state.existing = { id: "asset", size: 1024 };
  expect(await claimUpload("alice", pending)).toEqual({ reference: "/api/media/asset", size: 1024 });
  expect(state.send).not.toHaveBeenCalled();
});
it("does not create a media record when the source changes during promotion", async () => {
  const handler = state.send.getMockImplementation()!;
  state.send.mockImplementation(async command => {
    if (command.constructor.name === "CopyObjectCommand") throw new Error("provider precondition failure");
    return handler(command);
  });
  await expect(claimUpload("alice", pending)).rejects.toThrow("Upload changed or could not be saved");
  expect(state.create).not.toHaveBeenCalled();
});

import { uploadError } from "../lib/upload-error";
it("does not expose provider exceptions in upload responses", () => {
  expect(uploadError(new Error("provider secret-token"))).not.toContain("secret-token");
  expect(uploadError(new Error("Storage allowance reached."))).toBe("Storage allowance reached.");
});
