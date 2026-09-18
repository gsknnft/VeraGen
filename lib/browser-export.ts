"use client";
import { ASPECTS, FPS, totalDurationInFramesWithBrand, type Aspect } from "@/remotion/durationUtils";
import { StudioComposition, type StudioCompositionProps } from "@/remotion/Composition";
async function mediaUrl(reference: string) {
  if (!/^\/api\/media\/[a-zA-Z0-9_-]+$/.test(reference)) throw new Error("This older asset needs to be re-imported into private storage.");
  const response = await fetch(`${reference}/sign`);
  if (!response.ok) throw new Error("Media is unavailable. Sign in again if your session expired.");
  return (await response.json()).url as string;
}
export async function browserExport(input: StudioCompositionProps, aspect: Aspect, signal: AbortSignal, onProgress: (progress: number) => void) {
  const { renderMediaOnWeb, canRenderMediaOnWeb } = await import("@remotion/web-renderer");
  const dimensions = ASPECTS[aspect];
  const support = await canRenderMediaOnWeb({ ...dimensions, container: "mp4", videoCodec: "h264", audioCodec: "aac" });
  if (!support.canRender) throw new Error("This browser cannot export MP4 with audio. Try an up-to-date desktop Chrome or Edge browser.");
  const durationInFrames = totalDurationInFramesWithBrand(input.clips, input.brand);
  if (durationInFrames < 1 || durationInFrames > FPS * 60) throw new Error("Browser exports support up to 60 seconds. Shorten this edit.");
  const clips = await Promise.all(input.clips.map(async clip => ({ ...clip, videoUrl: await mediaUrl(clip.videoUrl) })));
  const brand = { ...input.brand, logoUrl: input.brand.logoUrl ? await mediaUrl(input.brand.logoUrl) : null };
  const result = await renderMediaOnWeb({
    composition: { component: StudioComposition, id: "Studio", fps: FPS, durationInFrames, ...dimensions, calculateMetadata: null, defaultProps: { ...input, clips, brand, aspect } },
    inputProps: { ...input, clips, brand, aspect },
    container: "mp4", videoCodec: "h264", audioCodec: "aac", signal,
    onProgress: ({ progress }) => onProgress(progress),
    licenseKey: process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY ?? null,
  });
  return result.getBlob();
}

