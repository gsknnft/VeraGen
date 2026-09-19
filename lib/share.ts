import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Public share links for finished (or in-progress) holder videos.
 *
 * Media stays private in S3. A ShareLink holds an unguessable token; anyone
 * with `/s/<token>` can read the poster/video through `/api/share/<token>/media`
 * — that token is the capability, not a forged secret and not a bucket ACL change.
 */

const MEDIA_REF = /^\/api\/media\/([a-zA-Z0-9_-]+)$/;

export function parseMediaId(reference: string | null | undefined): string | null {
  if (!reference) return null;
  const match = MEDIA_REF.exec(reference);
  return match?.[1] ?? null;
}

export function publicOrigin() {
  return process.env.BETTER_AUTH_URL?.replace(/\/$/, "") || "http://localhost:3000";
}

export function sharePageUrl(token: string) {
  return `${publicOrigin()}/s/${token}`;
}

export function shareMediaUrl(token: string, kind: "poster" | "video") {
  return `${publicOrigin()}/api/share/${token}/media?kind=${kind}`;
}

export function newShareToken() {
  // 24 bytes → 32 chars base64url; unguessable without being an invented API key.
  return randomBytes(24).toString("base64url");
}

export type ShareCreateInput = {
  ownerId: string;
  title: string;
  description?: string | null;
  posterUrl?: string | null;
  videoUrl?: string | null;
  clipId?: string | null;
  mintId?: string | null;
};

export async function createShareLink(input: ShareCreateInput) {
  const token = newShareToken();
  return prisma.shareLink.create({
    data: {
      token,
      ownerId: input.ownerId,
      title: input.title.slice(0, 120),
      description: input.description?.slice(0, 280) ?? null,
      posterUrl: input.posterUrl ?? null,
      videoUrl: input.videoUrl ?? null,
      clipId: input.clipId ?? null,
      mintId: input.mintId ?? null,
    },
  });
}

/** When a clip finishes, any share waiting on it gets the playable video. */
export async function attachClipVideoToShares(clipId: string, videoUrl: string) {
  await prisma.shareLink.updateMany({
    where: { clipId, OR: [{ videoUrl: null }, { videoUrl: "" }] },
    data: { videoUrl },
  });
}

/** When a claimed mint finishes, refresh shares pointing at it. */
export async function attachMintVideoToShares(mintId: string, videoUrl: string, posterUrl?: string | null) {
  await prisma.shareLink.updateMany({
    where: { mintId },
    data: {
      videoUrl,
      ...(posterUrl ? { posterUrl } : {}),
    },
  });
}

export async function findShareByToken(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null;
  return prisma.shareLink.findUnique({ where: { token } });
}

/**
 * Resolve a share's poster or video to a short-lived signed S3 URL.
 * Auth is the share token itself (public by design).
 */
export async function signedUrlForShare(token: string, kind: "poster" | "video") {
  const share = await findShareByToken(token);
  if (!share) return null;
  const reference = kind === "poster" ? share.posterUrl : share.videoUrl;
  const mediaId = parseMediaId(reference);
  if (!mediaId) return null;
  const asset = await prisma.mediaAsset.findUnique({ where: { id: mediaId } });
  if (!asset) return null;
  // Lazy import keeps this module usable in tests without S3 env.
  const { S3Client } = await import("@aws-sdk/client-s3");
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Private storage is not configured.");
  }
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION || "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: asset.key }),
    { expiresIn: 600 },
  );
  return { url, contentType: asset.contentType, share };
}

/** Stable idempotency key so re-sharing the same clip does not mint endless tokens. */
export function shareIdempotencyKey(ownerId: string, clipId: string) {
  return createHash("sha256").update(`share:${ownerId}:${clipId}`).digest("hex").slice(0, 32);
}
