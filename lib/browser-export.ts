"use client";
import { ASPECTS, FPS, totalDurationInFramesWithBrand, type Aspect } from "@/remotion/durationUtils";
import { StudioComposition, type StudioCompositionProps } from "@/remotion/Composition";

/**
 * Resolve a private media reference to a local `blob:` URL.
 *
 * Signed URLs expire after ten minutes, and the renderer reads media
 * progressively for as long as the render runs. A slow device rendering a
 * 60-second edit could outlive the signature and fail partway through on a
 * 403. Downloading each asset once, up front, removes the deadline entirely
 * and means the render makes no further network requests at all.
 */
async function localMedia(reference: string, signal: AbortSignal, owned: string[]) {
  if (!/^\/api\/media\/[a-zA-Z0-9_-]+$/.test(reference)) throw new Error("This older asset needs to be re-imported into private storage.");
  const signed = await fetch(`${reference}/sign`, { signal });
  if (!signed.ok) throw new Error("Media is unavailable. Sign in again if your session expired.");
  const { url } = (await signed.json()) as { url: string };
  const media = await fetch(url, { signal });
  if (!media.ok) throw new Error("A clip could not be downloaded for export. Check your connection and try again.");
  const objectUrl = URL.createObjectURL(await media.blob());
  owned.push(objectUrl);
  return objectUrl;
}

export async function browserExport(input: StudioCompositionProps, aspect: Aspect, signal: AbortSignal, onProgress: (progress: number) => void) {
  const { renderMediaOnWeb, canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const dimensions = ASPECTS[aspect];
  const support = await canRenderMediaOnWeb({ ...dimensions, container: "mp4", videoCodec: "h264", audioCodec: "aac" });
  if (!support.canRender) throw new Error("This browser cannot export MP4 with audio. Try an up-to-date desktop Chrome or Edge browser.");
  const durationInFrames = totalDurationInFramesWithBrand(input.clips, input.brand);
  if (durationInFrames < 1 || durationInFrames > FPS * 60) throw new Error("Browser exports support up to 60 seconds. Shorten this edit.");

  // Every object URL created here is revoked however the export ends, so a
  // cancelled or failed export does not pin hundreds of MB of video in memory.
  const owned: string[] = [];
  try {
    // One clip at a time rather than all at once: on a slow connection,
    // parallel downloads all finish late instead of some finishing early.
    const clips = [];
    for (const clip of input.clips) clips.push({ ...clip, videoUrl: await localMedia(clip.videoUrl, signal, owned) });
    const brand = { ...input.brand, logoUrl: input.brand.logoUrl ? await localMedia(input.brand.logoUrl, signal, owned) : null };

    const result = await renderMediaOnWeb({
      composition: { component: StudioComposition, id: "Studio", fps: FPS, durationInFrames, ...dimensions, calculateMetadata: null, defaultProps: { ...input, clips, brand, aspect } },
      inputProps: { ...input, clips, brand, aspect },
      container: "mp4", videoCodec: "h264", audioCodec: "aac", signal,
      onProgress: ({ progress }) => onProgress(progress),
      licenseKey: process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY ?? null,
    });
    return await result.getBlob();
  } finally {
    for (const url of owned) URL.revokeObjectURL(url);
  }
}
