import React from "react";
import { OffthreadVideo } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { CROSSFADE_SECONDS, FPS, clipLengthSeconds, type TimelineClip } from "./durationUtils";

export interface StudioCompositionProps {
  clips: TimelineClip[];
}

const FADE_FRAMES = Math.round(CROSSFADE_SECONDS * FPS);

export const StudioComposition: React.FC<StudioCompositionProps> = ({ clips }) => {
  return (
    <TransitionSeries>
      {clips.flatMap((clip, i) => {
        const items: React.ReactNode[] = [];

        if (i > 0 && clip.transitionIn === "crossfade") {
          items.push(
            <TransitionSeries.Transition
              key={`${clip.id}-transition`}
              presentation={fade()}
              timing={linearTiming({ durationInFrames: FADE_FRAMES })}
            />
          );
        }

        const lengthFrames = Math.round(clipLengthSeconds(clip) * FPS);
        items.push(
          <TransitionSeries.Sequence key={clip.id} durationInFrames={Math.max(lengthFrames, 1)}>
            <OffthreadVideo
              src={clip.videoUrl}
              startFrom={Math.round(clip.trimStart * FPS)}
              endAt={Math.round(clip.trimEnd * FPS)}
            />
          </TransitionSeries.Sequence>
        );

        return items;
      })}
    </TransitionSeries>
  );
};
