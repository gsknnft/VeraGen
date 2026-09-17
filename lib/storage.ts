import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// S3-compatible object storage — works unchanged against AWS S3,
// Cloudflare R2, Backblaze B2, or a self-hosted MinIO instance. We re-host
// every generated clip here because Higgsfield's own result URLs are not
// guaranteed to stay valid indefinitely, and the Remotion render step
// needs a stable source to read from.

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;

  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are not configured"
    );
  }

  client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // Required for MinIO and most non-AWS S3-compatible servers; AWS S3
    // itself tolerates path-style too, so this is safe to leave on.
    forcePathStyle: true,
  });
  return client;
}

function bucket(): string {
  const b = process.env.S3_BUCKET;
  if (!b) throw new Error("S3_BUCKET is not configured");
  return b;
}

function publicUrlFor(key: string): string {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (!base) {
    throw new Error(
      "S3_PUBLIC_BASE_URL is not configured (the URL your bucket is served from, e.g. behind a reverse proxy or CDN)"
    );
  }
  return `${base.replace(/\/$/, "")}/${key}`;
}

export async function uploadBuffer(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return publicUrlFor(key);
}

// Downloads a (possibly short-lived) remote video and re-hosts it in our
// own bucket, returning the durable public URL.
export async function persistRemoteVideo(
  remoteUrl: string,
  key: string
): Promise<string> {
  const res = await fetch(remoteUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch remote video (${res.status}): ${remoteUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return uploadBuffer(key, buffer, "video/mp4");
}

// Re-fetches an already-hosted image and re-encodes it as a data URI —
// used when reusing a saved Character's reference photo, so it goes to
// Higgsfield the same way a fresh upload does (see the data-URI TODO in
// lib/higgsfield.ts).
export async function fetchAsDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status}): ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
