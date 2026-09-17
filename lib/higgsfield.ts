// Thin wrapper around the Higgsfield API. One file, no SDK dependency —
// easy to read and swap out. Confirm the model endpoint/name and image
// input format against current docs (https://docs.higgsfield.ai/docs)
// before relying on this in production; the API launched days before
// this was written and these details are marked TODO below.

const HF_BASE_URL = "https://platform.higgsfield.ai";
const HF_IMAGE2VIDEO_ENDPOINT = "/v1/image2video/dop";
// TODO(day-1 spike): confirm the text-only (no face input) endpoint name.
const HF_TEXT2VIDEO_ENDPOINT = "/v1/text2video/dop";

function authHeader(): string {
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) {
    throw new Error("HF_API_KEY_ID / HF_API_KEY_SECRET are not configured");
  }
  return `Key ${id}:${secret}`;
}

export interface GenerateInput {
  prompt: string;
  /** Data URI or hosted URL of a face photo. Omit for a prompt-only (no face) clip. */
  imageUrl?: string;
}

export interface SubmitJobResult {
  requestId: string;
}

export async function submitVideoJob(input: GenerateInput): Promise<SubmitJobResult> {
  const prompt = input.prompt;
  const useImage = Boolean(input.imageUrl);

  const res = await fetch(
    `${HF_BASE_URL}${useImage ? HF_IMAGE2VIDEO_ENDPOINT : HF_TEXT2VIDEO_ENDPOINT}`,
    {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        useImage
          ? {
              model: "dop-turbo",
              prompt,
              input_images: [{ type: "image_url", image_url: input.imageUrl }],
            }
          : {
              model: "dop-turbo",
              prompt,
            }
      ),
    }
  );

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
