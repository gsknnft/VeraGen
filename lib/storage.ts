import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "./db";
import { downloadProviderVideo } from "./safe-download";

let client: S3Client | null = null;
function s3() {
  if (client) return client;
  const { S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error("Private storage is not configured.");
  return client = new S3Client({ endpoint: S3_ENDPOINT, region: process.env.S3_REGION || "auto", credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY }, forcePathStyle: true });
}
function bucket() { if (!process.env.S3_BUCKET) throw new Error("Private storage is not configured."); return process.env.S3_BUCKET; }
export async function uploadBuffer(logicalKey: string, body: Buffer, contentType: string, ownerId?: string): Promise<string> {
  if (!ownerId) { const { currentSession } = await import("./session"); ownerId = (await currentSession())?.user.id; }
  if (!ownerId) throw new Error("Sign in required.");
  if (!["video/mp4", "image/jpeg", "image/png", "image/webp"].includes(contentType) || body.length > 64 * 1024 * 1024) throw new Error("Unsupported media.");
  const key = `veragen/users/${ownerId}/${createHash("sha256").update(logicalKey).digest("hex")}`;
  const owner = ownerId;
  const { asset, reserved } = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${owner}))`;
    const existing = await tx.mediaAsset.findUnique({ where: { key } });
    if (existing) return { asset: existing, reserved: false };
    const used = await tx.mediaAsset.aggregate({ where: { ownerId: owner }, _sum: { size: true } });
    if ((used._sum.size ?? 0) + body.length > 512 * 1024 * 1024) throw new Error("Storage allowance reached.");
    const asset = await tx.mediaAsset.create({ data: { ownerId: owner, key, contentType, size: body.length } });
    return { asset, reserved: true };
  });
  try {
    await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType, ACL: "private", CacheControl: "private, max-age=0" }));
  } catch {
    if (reserved) await prisma.mediaAsset.delete({ where: { id: asset.id } });
    throw new Error("Media could not be stored.");
  }
  return `/api/media/${asset.id}`;
}
export async function signedMediaUrl(reference: string, ownerId: string) {
  const match = /^\/api\/media\/([a-zA-Z0-9_-]+)$/.exec(reference);
  if (!match) throw new Error("Legacy public media must be imported into private storage first.");
  const asset = await prisma.mediaAsset.findFirst({ where: { id: match[1], ownerId } });
  if (!asset) throw new Error("Media not found.");
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: asset.key }), { expiresIn: 600 });
}
// --- Direct uploads -------------------------------------------------------
//
// User video goes browser → bucket on a presigned PUT, never through the app.
// `withAccess` caps request bodies at 4 MB, and on a Pi behind a home
// connection, proxying video through the app would spend the one resource
// that is scarcest.
//
// The flow is two-phase so the bucket cannot be filled for free:
//   1. presign — the object lands under `veragen/pending/`, which a bucket
//      lifecycle rule expires after a day. Abandoned uploads clean themselves
//      up and never count against anyone.
//   2. claim — the server reads what actually arrived (size, type, magic
//      bytes), charges it against the owner's allowance under the same lock
//      `uploadBuffer` uses, then copies it to the owner's permanent prefix.
//
// Nothing the client says about the file is trusted at claim time; the size
// and content type are signed into the PUT, then re-read from the bucket.

export const UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const ALLOWANCE_BYTES = 512 * 1024 * 1024;
export const UPLOAD_TYPES = ["video/mp4", "video/quicktime"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

const PENDING_KEY = /^veragen\/pending\/([A-Za-z0-9_-]+)\/([0-9a-f-]{36})$/;

export async function presignUpload(ownerId: string, contentType: UploadType, size: number) {
  if (!UPLOAD_TYPES.includes(contentType)) throw new Error("Upload an MP4 or MOV video.");
  if (!Number.isSafeInteger(size) || size < 1 || size > UPLOAD_MAX_BYTES) throw new Error("Videos can be up to 64 MB.");
  // Advisory only — the binding check is at claim time, under the lock. This
  // just stops someone uploading 64 MB to learn they were already full.
  const used = await prisma.mediaAsset.aggregate({ where: { ownerId }, _sum: { size: true } });
  if ((used._sum.size ?? 0) + size > ALLOWANCE_BYTES) throw new Error("Storage allowance reached.");

  const key = `veragen/pending/${ownerId}/${randomUUID()}`;
  // ContentLength and ContentType are part of the signature, so the bucket
  // itself rejects a PUT that differs from what was declared here.
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType, ContentLength: size }),
    { expiresIn: 900 },
  );
  return { key, url };
}

/** MP4 and QuickTime both open with an ISO-BMFF `ftyp` box at byte 4. */
function looksLikeIsoBmff(head: Uint8Array) {
  return head.length >= 8 && head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
}

export async function claimUpload(ownerId: string, pendingKey: string): Promise<{ reference: string; size: number }> {
  // The key comes back from the client, so it is re-derived rather than
  // trusted: it must be a pending key under THIS owner's prefix. That is what
  // stops one user claiming another's in-flight upload.
  const match = PENDING_KEY.exec(pendingKey);
  if (!match || match[1] !== ownerId) throw new Error("Upload not found.");

  let head;
  try {
    head = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: pendingKey }));
  } catch {
    throw new Error("Upload not found. It may not have finished, or it expired.");
  }
  const size = Number(head.ContentLength ?? 0);
  const contentType = head.ContentType ?? "";
  const discard = () => s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: pendingKey })).catch(() => {});

  if (!UPLOAD_TYPES.includes(contentType as UploadType) || size < 1 || size > UPLOAD_MAX_BYTES) {
    await discard();
    throw new Error("Upload an MP4 or MOV video up to 64 MB.");
  }

  // The declared type is a label anyone can set. The first bytes are not.
  const sniff = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: pendingKey, Range: "bytes=0-11" }));
  const headBytes = await sniff.Body?.transformToByteArray();
  if (!headBytes || !looksLikeIsoBmff(headBytes)) {
    await discard();
    throw new Error("That file is not a playable MP4 or MOV video.");
  }

  const finalKey = `veragen/users/${ownerId}/${match[2]}`;
  const asset = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerId}))`;
    const existing = await tx.mediaAsset.findUnique({ where: { key: finalKey } });
    if (existing) return existing; // A repeated claim is idempotent.
    const used = await tx.mediaAsset.aggregate({ where: { ownerId }, _sum: { size: true } });
    if ((used._sum.size ?? 0) + size > ALLOWANCE_BYTES) throw new Error("Storage allowance reached.");
    return tx.mediaAsset.create({ data: { ownerId, key: finalKey, contentType, size } });
  }).catch(async (err) => {
    await discard();
    throw err;
  });

  try {
    await s3().send(new CopyObjectCommand({
      Bucket: bucket(),
      Key: finalKey,
      CopySource: `${bucket()}/${pendingKey}`,
      ContentType: contentType,
      MetadataDirective: "REPLACE",
      CacheControl: "private, max-age=0",
    }));
  } catch {
    await prisma.mediaAsset.delete({ where: { id: asset.id } }).catch(() => {});
    throw new Error("Upload could not be saved. Try again.");
  }
  await discard();
  return { reference: `/api/media/${asset.id}`, size };
}

export async function persistRemoteVideo(remoteUrl: string, key: string): Promise<string> {
  const buffer = await downloadProviderVideo(remoteUrl);
  return uploadBuffer(key, buffer, "video/mp4");
}

