// Thin wrapper around the Higgsfield API. One file, no SDK dependency —
// easy to read and swap out. Confirm the model endpoint/name against
// current docs (https://docs.higgsfield.ai/docs) before relying on it;
// the API launched days before this was written.

const HF_BASE_URL = "https://platform.higgsfield.ai";
const HF_MODEL_ENDPOINT = "/v1/image2video/dop";

export type Vibe =
  | "cinematic-pan"
  | "dance-loop"
  | "talking-head"
  | "action-hero"
  | "retro-film"
  | "product-hold";

const VIBE_PROMPTS: Record<Vibe, string> = {
  "cinematic-pan": "Slow cinematic camera pan, dramatic lighting, film grain",
  "dance-loop": "Subject dancing energetically, seamless loop, club lighting",
  "talking-head": "Subject talking to camera, natural gestures, studio lighting",
  "action-hero": "Subject in a dynamic action pose, motion blur, epic score energy",
  "retro-film": "1970s film stock look, warm tones, handheld camera movement",
  "product-hold": "Subject holding an object up to camera, studio softbox lighting",
};

function authHeader(): string {
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) {
    throw new Error("HF_API_KEY_ID / HF_API_KEY_SECRET are not configured");
  }
  return `Key ${id}:${secret}`;
}

export interface SubmitJobResult {
  requestId: string;
}

export async function submitFaceVideoJob(
  imageUrl: string,
  vibe: Vibe
): Promise<SubmitJobResult> {
  const res = await fetch(`${HF_BASE_URL}${HF_MODEL_ENDPOINT}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "dop-turbo",
      prompt: VIBE_PROMPTS[vibe],
      input_images: [{ type: "image_url", image_url: imageUrl }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Higgsfield submit failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { request_id: string };
  return { requestId: data.request_id };
}

export type JobStatus =
  | { status: "processing" }
  | { status: "completed"; videoUrl: string }
  | { status: "failed"; error: string };

export async function getJobStatus(requestId: string): Promise<JobStatus> {
  const res = await fetch(`${HF_BASE_URL}/v1/jobs/${requestId}`, {
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Higgsfield status check failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    status: string;
    video?: { url: string };
    error?: string;
  };

  if (data.status === "completed" && data.video?.url) {
    return { status: "completed", videoUrl: data.video.url };
  }
  if (data.status === "failed") {
    return { status: "failed", error: data.error ?? "unknown error" };
  }
  return { status: "processing" };
}
