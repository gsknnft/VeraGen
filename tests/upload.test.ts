import { it, expect, beforeAll, vi } from "vitest";

// claimUpload validates the key before it touches storage or the database, so
// these run without either. S3 settings only need to exist for the client to
// construct; nothing is sent.
beforeAll(() => {
  process.env.S3_ENDPOINT = "https://storage.invalid";
  process.env.S3_ACCESS_KEY_ID = "test";
  process.env.S3_SECRET_ACCESS_KEY = "test";
  process.env.S3_BUCKET = "test";
});

const OWNER = "user_a";
const UUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

it("refuses to claim another user's pending upload", async () => {
  const { claimUpload } = await import("../lib/storage");
  await expect(claimUpload(OWNER, `veragen/pending/user_b/${UUID}`)).rejects.toThrow("Upload not found.");
});

it("refuses keys outside the pending prefix, including already-claimed assets", async () => {
  const { claimUpload } = await import("../lib/storage");
  for (const key of [
    `veragen/users/${OWNER}/${UUID}`, // a permanent asset, not a pending upload
    `veragen/pending/${OWNER}/../user_b/${UUID}`,
    `veragen/pending/${OWNER}/${UUID}/extra`,
    `veragen/pending/${OWNER}/not-a-uuid`,
    `/veragen/pending/${OWNER}/${UUID}`,
    "",
  ]) {
    await expect(claimUpload(OWNER, key), key).rejects.toThrow("Upload not found.");
  }
});

it("refuses to presign anything but MP4/MOV within the size cap", async () => {
  const { presignUpload, UPLOAD_MAX_BYTES } = await import("../lib/storage");
  await expect(presignUpload(OWNER, "image/png" as never, 1000)).rejects.toThrow("MP4 or MOV");
  for (const size of [0, -1, 1.5, UPLOAD_MAX_BYTES + 1, Number.NaN]) {
    await expect(presignUpload(OWNER, "video/mp4", size), String(size)).rejects.toThrow("64 MB");
  }
});

it("signs both upload size and content type without making an S3 request", async () => {
  const { prisma } = await import("../lib/db");
  const aggregate = vi.spyOn(prisma.mediaAsset, "aggregate").mockResolvedValue({ _sum: { size: 0 } } as never);
  try {
    const { presignUpload } = await import("../lib/storage");
    const ticket = await presignUpload(OWNER, "video/mp4", 1024);
    const signed = new URL(ticket.url).searchParams.get("X-Amz-SignedHeaders");
    expect(signed).toContain("content-length");
    expect(signed).toContain("content-type");
  } finally { aggregate.mockRestore(); }
});
