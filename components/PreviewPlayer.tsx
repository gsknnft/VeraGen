"use client";

import { Player } from "@remotion/player";
import { StudioComposition } from "@/remotion/Composition";
import {
  FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  totalDurationInFramesWithBrand,
  type BrandKit,
  type TimelineClip,
} from "@/remotion/durationUtils";

export function PreviewPlayer({
  clips,
  brand,
  projectName,
}: {
  clips: TimelineClip[];
  brand: BrandKit;
  projectName: string;
}) {
  if (clips.length === 0 && brand.template === "none") {
    return (
      <div className="preview-empty">
        <span>Generate a clip to see it here</span>
      </div>
    );
  }

  return (
    <Player
      component={StudioComposition}
      inputProps={{ clips, brand, projectName }}
      durationInFrames={totalDurationInFramesWithBrand(clips, brand)}
      fps={FPS}
      compositionWidth={VIDEO_WIDTH}
      compositionHeight={VIDEO_HEIGHT}
      style={{ width: "100%", borderRadius: 12 }}
      controls
      loop
    />
  );
}
