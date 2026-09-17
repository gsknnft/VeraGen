import { createHash } from "node:crypto";
import { getHiggsfieldCredentials } from "./higgsfield-credentials";

const API = "https://api.higgsfield.ai";
export async function isMockMode() { return !(await getHiggsfieldCredentials()); }
async function credentials() {
  const key = await getHiggsfieldCredentials();
  if (!key) throw new Error("Connect your own Higgsfield account before generating.");
  return { authorization: `Key ${key.id}:${key.secret}`, fingerprint: createHash("sha256").update(`${key.id}:${key.secret}`).digest("hex") };
}
export interface GenerateInput { prompt: string; imageUrl?: string }
export interface SubmitJobResult { requestId: string }
export async function submitVideoJob(input: GenerateInput): Promise<SubmitJobResult> {
  const key = await credentials();
  const response = await fetch(`${API}/bytedance/seedance-2.5/${input.imageUrl ? "image-to-video" : "text-to-video"}`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: key.authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: input.prompt, duration: 5, resolution: "720p", ...(input.imageUrl ? { image_url: input.imageUrl } : { aspect_ratio: "9:16" }) }),
  });
  if (!response.ok) throw new Error(`Higgsfield submission failed (${response.status}).`);
  const data = await response.json();
  if (typeof data.request_id !== "string" || !data.request_id) throw new Error("Higgsfield returned no request ID.");
  return { requestId: `byok:${key.fingerprint}:${encodeURIComponent(data.request_id)}` };
}
export type JobStatus =
  | { status: "processing" }
  | { status: "completed"; videoUrl: string; skipPersist?: boolean; durationSeconds?: number }
  | { status: "failed"; error: string };
export async function getJobStatus(requestId: string): Promise<JobStatus> {
  if (requestId.startsWith("mock:")) return { status: "failed", error: "Legacy demo clip. Start a new generation with your own account." };
  const key = await credentials();
  const parts = requestId.split(":");
  if (parts[0] !== "byok" || parts.length !== 3 || parts[1] !== key.fingerprint) throw new Error("Reconnect the credentials used to start this job.");
  const response = await fetch(`${API}/requests/${parts[2]}/status`, {
    headers: { Authorization: key.authorization }, redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Higgsfield status unavailable (${response.status}).`);
  const data = await response.json();
  if (data.status === "completed" && typeof data.video?.url === "string") return { status: "completed", videoUrl: data.video.url };
  if (["failed", "nsfw", "canceled"].includes(data.status)) return { status: "failed", error: `Higgsfield job ${data.status}.` };
  return { status: "processing" };
}
