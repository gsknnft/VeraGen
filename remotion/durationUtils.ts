// Single source of truth for timeline math, shared by the Remotion root
// (server-side duration calculation), the in-browser preview player, and
// the export route. All three must agree on frame counts or the preview
// will drift from what actually gets rendered.

export const FPS = 30;
export const CROSSFADE_SECONDS = 0.5;
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

export type TransitionType = "cut" | "crossfade";

export interface TimelineClip {
  id: string;
  videoUrl: string;
  trimStart: number;
  trimEnd: number;
  transitionIn: TransitionType;
}

export function clipLengthSeconds(clip: TimelineClip): number {
  return Math.max(clip.trimEnd - clip.trimStart, 0);
}

export function totalDurationSeconds(clips: TimelineClip[]): number {
  const raw = clips.reduce((sum, c) => sum + clipLengthSeconds(c), 0);
  const crossfadeCount = clips
    .slice(1)
    .filter((c) => c.transitionIn === "crossfade").length;
  return Math.max(raw - crossfadeCount * CROSSFADE_SECONDS, 0);
}

export function totalDurationInFrames(clips: TimelineClip[]): number {
  return Math.max(Math.round(totalDurationSeconds(clips) * FPS), 1);
}
