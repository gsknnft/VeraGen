import { createHash } from "node:crypto";
import { getHiggsfieldCredentials } from "./higgsfield-credentials";

const API = "https://api.higgsfield.ai";

/**
 * Whose account pays for a job. Encoded into the stored request ID, which
 * only the server ever writes, so status polling always uses the same
 * account that started the job:
 *   byok:<fingerprint>:<id>   the user's own key; must be reconnected to poll
 *   trial:<id>                the operator's trial key (see lib/trial.ts)
 */
export type CreditSource = "byok" | "trial";

type Key = { authorization: string; fingerprint: string };

function keyFrom(id: string, secret: string): Key {
  return { authorization: `Key ${id}:${secret}`, fingerprint: createHash("sha256").update(`${id}:${secret}`).digest("hex") };
}

async function byokKey(): Promise<Key> {
  const key = await getHiggsfieldCredentials();
  if (!key) throw new Error("Connect your own Higgsfield account before generating.");
  return keyFrom(key.id, key.secret);
}

function trialKey(): Key {
  const id = process.env.VERAGEN_TRIAL_HF_KEY_ID;
  const secret = process.env.VERAGEN_TRIAL_HF_KEY_SECRET;
  if (!id || !secret) throw new Error("Trial generation is not configured.");
  return keyFrom(id, secret);
}

export async function isMockMode() { return !(await getHiggsfieldCredentials()); }

export interface GenerateInput { prompt: string; imageUrl?: string }
export interface SubmitJobResult { requestId: string }

export async function submitVideoJob(input: GenerateInput, source: CreditSource = "byok"): Promise<SubmitJobResult> {
  const key = source === "trial" ? trialKey() : await byokKey();
  const response = await fetch(`${API}/bytedance/seedance-2.5/${input.imageUrl ? "image-to-video" : "text-to-video"}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: key.authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: input.prompt, duration: 5, resolution: "720p", ...(input.imageUrl ? { image_url: input.imageUrl } : { aspect_ratio: "9:16" }) }),
  });
  if (!response.ok) throw new Error(`Higgsfield submission failed (${response.status}).`);
  const data = await response.json();
  if (typeof data.request_id !== "string" || !data.request_id) throw new Error("Higgsfield returned no request ID.");
  const id = encodeURIComponent(data.request_id);
  return { requestId: source === "trial" ? `trial:${id}` : `byok:${key.fingerprint}:${id}` };
}

export type JobStatus =
  | { status: "processing" }
  | { status: "completed"; videoUrl: string; skipPersist?: boolean; durationSeconds?: number }
  | { status: "failed"; error: string };

export async function getJobStatus(requestId: string): Promise<JobStatus> {
  if (requestId.startsWith("mock:")) return { status: "failed", error: "Legacy demo clip. Start a new generation with your own account." };
  const parts = requestId.split(":");
  let key: Key;
  let id: string;
  if (parts[0] === "trial" && parts.length === 2) {
    // Polled with the operator key whatever the user has connected since.
    key = trialKey();
    id = parts[1];
  } else if (parts[0] === "byok" && parts.length === 3) {
    key = await byokKey();
    if (parts[1] !== key.fingerprint) throw new Error("Reconnect the credentials used to start this job.");
    id = parts[2];
  } else {
    throw new Error("Unrecognized job reference.");
  }
  const response = await fetch(`${API}/requests/${id}/status`, {
    headers: { Authorization: key.authorization }, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Higgsfield status unavailable (${response.status}).`);
  const data = await response.json();
  if (data.status === "completed" && typeof data.video?.url === "string") return { status: "completed", videoUrl: data.video.url };
  if (["failed", "nsfw", "canceled"].includes(data.status)) return { status: "failed", error: `Higgsfield job ${data.status}.` };
  return { status: "processing" };
}
