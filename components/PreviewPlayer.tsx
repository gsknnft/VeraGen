"use client";

import { Player } from "@remotion/player";
import { StudioComposition } from "@/remotion/Composition";
import {
  FPS,
  ASPECTS,
  type Aspect,
  totalDurationInFramesWithBrand,
  type BrandKit,
  type TimelineClip,
} from "@/remotion/durationUtils";

export function PreviewPlayer({
  clips,
  brand,
  projectName,
  aspect,
}: {
  clips: TimelineClip[];
  brand: BrandKit;
  projectName: string;
  aspect: Aspect;
}) {
  if (clips.length === 0 && brand.template === "none") {
    return (
      <div className="preview-empty" style={{ aspectRatio: `${ASPECTS[aspect].width} / ${ASPECTS[aspect].height}` }}>
        <img src="/brand/veragen-mark.svg" alt="" width={54} height={54} />
        <strong>Your next frame starts here.</strong><span>Generate a clip to begin your edit.</span>
      </div>
    );
  }

  return (
    <Player
      component={StudioComposition}
      inputProps={{ clips, brand, projectName, aspect }}
      durationInFrames={totalDurationInFramesWithBrand(clips, brand)}
      fps={FPS}
      compositionWidth={ASPECTS[aspect].width}
      compositionHeight={ASPECTS[aspect].height}
      style={{ width: "100%", maxWidth: aspect === "9:16" ? 340 : 800, margin: "0 auto", borderRadius: 12 }}
      controls
      loop
    />
  );
}
