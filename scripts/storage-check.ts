/**
 * Prove object storage is usable AND private, before trusting it with
 * anything: pnpm storage:check
 *
 * VeraGen serves every file through short-lived signed URLs and uploads with
 * a private ACL. That is only meaningful if the bucket does not make objects
 * public anyway — a bucket policy or default-public setting silently defeats
 * per-object ACLs. This uploads one probe object, then tries to read it back
 * WITHOUT credentials, which is the only test that settles the question. The
 * probe is deleted either way.
 *
 * Especially worth running when VeraGen shares a bucket with public assets
 * (the ApeFathers Space serves NFT art publicly): the prefix is not a
 * boundary, the ACL and policy are.
 */
// Load env the way Next does: .env first, then .env.local wins. Node loads
// neither for a plain script, and Prisma only pulls in .env for its own URL.
for (const file of [".env", ".env.local"]) { try { process.loadEnvFile(file); } catch { /* optional */ } }
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetBucketPolicyCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const KEY = `veragen/_storage-check-${Date.now()}.txt`;

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is empty. Note that .env.local overrides .env — an empty key there blanks a real one.`);
  return value;
}

async function main() {
  const endpoint = env("S3_ENDPOINT"), bucket = env("S3_BUCKET");
  const region = process.env.S3_REGION || "auto";
  const s3 = new S3Client({
    endpoint, region, forcePathStyle: true,
    credentials: { accessKeyId: env("S3_ACCESS_KEY_ID"), secretAccessKey: env("S3_SECRET_ACCESS_KEY") },
  });
  console.log(`bucket   ${bucket}\nendpoint ${endpoint}  (region ${region})\n`);

  try {
    await s3.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));
    console.log("credentials      OK");
  } catch (err) {
    const name = err instanceof Error ? err.name : String(err);
    const hint = name === "InvalidAccessKeyId" ? " — the ID is wrong (Spaces IDs start with DO00 and are 20 chars)"
      : name === "SignatureDoesNotMatch" ? " — the ID is valid but the secret is wrong. Spaces shows the secret once; make a new key pair if it was not saved."
      : name === "NoSuchBucket" ? " — no bucket by that name in this region"
      : "";
    throw new Error(`credentials      FAILED: ${name}${hint}`);
  }

  try {
    const policy = await s3.send(new GetBucketPolicyCommand({ Bucket: bucket }));
    const text = policy.Policy ?? "";
    const publicRead = /"Principal"\s*:\s*(\{\s*"AWS"\s*:\s*)?"\*"/.test(text) && /s3:GetObject/.test(text);
    console.log(`bucket policy    ${publicRead ? "GRANTS PUBLIC READ — see below" : "present, no blanket public read"}`);
  } catch (err) {
    console.log(`bucket policy    ${err instanceof Error && err.name === "NoSuchBucketPolicy" ? "none (per-object ACLs decide)" : "unreadable (" + (err instanceof Error ? err.name : "error") + ")"}`);
  }

  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: KEY, Body: Buffer.from("veragen storage check"), ContentType: "text/plain", ACL: "private" }));
  console.log("private upload   OK");

  // The decisive test: no credentials, both URL styles Spaces answers on.
  const host = new URL(endpoint).host;
  const urls = [`${endpoint}/${bucket}/${KEY}`, `https://${bucket}.${host}/${KEY}`];
  let leaked = false;
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      const open = response.status === 200;
      leaked ||= open;
      console.log(`public read      ${open ? "PUBLIC" : "denied"} (${response.status})  ${url.replace(bucket, "<bucket>")}`);
    } catch {
      console.log(`public read      unreachable  ${url.replace(bucket, "<bucket>")}`);
    }
  }
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: KEY }));
  console.log("probe deleted    OK\n");

  if (leaked) {
    throw new Error(
      "This bucket serves objects publicly even when uploaded privately.\n" +
      "Every user upload, reference image, layer and finished video would be readable by anyone with the URL,\n" +
      "and unreleased collection art would be exposed. Use a private bucket for VeraGen, or remove the\n" +
      "public-read bucket policy and serve public assets another way.",
    );
  }
  console.log("Storage is usable and private. Signed URLs are doing real work.");
}

main().catch(err => { console.error("\n" + (err instanceof Error ? err.message : err)); process.exitCode = 1; });
