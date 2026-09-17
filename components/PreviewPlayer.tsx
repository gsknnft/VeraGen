"use client";

import { Player } from "@remotion/player";
import { StudioComposition } from "@/remotion/Composition";
import {
  FPS,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  totalDurationInFrames,
  type TimelineClip,
} from "@/remotion/durationUtils";

export function PreviewPlayer({ clips }: { clips: TimelineClip[] }) {
  if (clips.length === 0) {
    return (
      <div className="preview-empty">
        <span>Generate a clip to see it here</span>
      </div>
    );
  }

  return (
    <Player
      component={StudioComposition}
      inputProps={{ clips }}
      durationInFrames={totalDurationInFrames(clips)}
      fps={FPS}
      compositionWidth={VIDEO_WIDTH}
      compositionHeight={VIDEO_HEIGHT}
      style={{ width: "100%", borderRadius: 12 }}
      controls
      loop
    />
  );
}
