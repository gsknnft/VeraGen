// Single source of truth for timeline math, shared by the Remotion root
// (server-side duration calculation), the in-browser preview player, and
// the export route. All three must agree on frame counts or the preview
// will drift from what actually gets rendered.

export const FPS = 30;
export const CROSSFADE_SECONDS = 0.5;

// Editor/preview always works in this aspect — export offers a choice
// (see ASPECTS below), re-cropped via object-fit: cover at render time
// rather than needing a live multi-aspect preview.
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

export type Aspect = "9:16" | "1:1" | "16:9";

export const ASPECTS: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
};

export const DEFAULT_ASPECT: Aspect = "9:16";

export function isAspect(value: string): value is Aspect {
  return Object.prototype.hasOwnProperty.call(ASPECTS, value);
}

export type TransitionType = "cut" | "crossfade";

export interface TimelineClip {
  id: string;
  videoUrl: string;
  trimStart: number;
  trimEnd: number;
  transitionIn: TransitionType;
  caption?: string | null;
}

export function clipLengthSeconds(clip: TimelineClip): number {
  return Math.max(clip.trimEnd - clip.trimStart, 0);
}

export function totalDurationSeconds(clips: TimelineClip[]): number {
  return timelineFrames(clips).reduce((sum, item) => sum + item.duration - item.fadeIn, 0) / FPS;
}

export function totalDurationInFrames(clips: TimelineClip[]): number {
  return Math.max(timelineFrames(clips).reduce((sum, item) => sum + item.duration - item.fadeIn, 0), 1);
}

/** Quantize clip endpoints once; reserve half each clip for either adjacent fade. */
export function timelineFrames(clips: TimelineClip[]) {
  const frames = clips.map(clip => {
    const start = Math.max(0, Math.round(clip.trimStart * FPS));
    const end = Math.max(start + 1, Math.round(clip.trimEnd * FPS));
    return { start, end, duration: end - start, fadeIn: 0 };
  });
  return frames.map((item, i) => ({ ...item, fadeIn: i > 0 && clips[i].transitionIn === "crossfade"
    ? Math.min(Math.round(CROSSFADE_SECONDS * FPS), Math.floor(frames[i - 1].duration / 2), Math.floor(item.duration / 2)) : 0 }));
}

// ─── Brand kit: intro/outro cards wrapped around the clips ─────────────────

export type BrandTemplate = "none" | "teaser" | "productReveal" | "announcement";

export const INTRO_SECONDS = 2.5;
export const OUTRO_SECONDS = 3;

export function templateHasIntro(template: BrandTemplate): boolean {
  return template === "productReveal" || template === "announcement";
}

export function templateHasOutro(template: BrandTemplate): boolean {
  return template !== "none";
}

export interface BrandKit {
  logoUrl?: string | null;
  ctaText?: string | null;
  template: BrandTemplate;
}

export function introFrames(brand: Pick<BrandKit, "template">): number {
  return templateHasIntro(brand.template) ? Math.round(INTRO_SECONDS * FPS) : 0;
}

export function outroFrames(brand: Pick<BrandKit, "template">): number {
  return templateHasOutro(brand.template) ? Math.round(OUTRO_SECONDS * FPS) : 0;
}

/** Total frames including intro/outro cards — what the Remotion root and export must agree on. */
export function totalDurationInFramesWithBrand(
  clips: TimelineClip[],
  brand: Pick<BrandKit, "template">,
): number {
  return introFrames(brand) + totalDurationInFrames(clips) + outroFrames(brand);
}

/** Same as `totalDurationSeconds`, plus intro/outro — what the export cap must check against. */
export function totalDurationSecondsWithBrand(
  clips: TimelineClip[],
  brand: Pick<BrandKit, "template">,
): number {
  return totalDurationInFramesWithBrand(clips, brand) / FPS;
}
