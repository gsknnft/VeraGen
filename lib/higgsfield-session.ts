import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type HiggsfieldCredentials = { id: string; secret: string };
export const SESSION_SECONDS = 8 * 60 * 60;

function encryptionKey() {
  const key = process.env.VERAGEN_SESSION_SECRET;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) throw new Error("Configure VERAGEN_SESSION_SECRET with 32 random bytes encoded as hex.");
  return Buffer.from(key, "hex");
}

export function sealCredentials(credentials: HiggsfieldCredentials, now = Date.now()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ ...credentials, expires: now + SESSION_SECONDS * 1000 })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

export function openCredentials(value: string, now = Date.now()): HiggsfieldCredentials | null {
  try {
    const bytes = Buffer.from(value, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString());
    if (payload.expires <= now || typeof payload.expires !== "number" || typeof payload.id !== "string" || typeof payload.secret !== "string") return null;
    return { id: payload.id, secret: payload.secret };
  } catch { return null; }
}
