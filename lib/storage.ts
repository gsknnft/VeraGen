import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
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
export async function persistRemoteVideo(remoteUrl: string, key: string): Promise<string> {
  const buffer = await downloadProviderVideo(remoteUrl);
  return uploadBuffer(key, buffer, "video/mp4");
}

