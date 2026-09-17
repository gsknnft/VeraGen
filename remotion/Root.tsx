import React from "react";
import { Composition } from "remotion";
import { StudioComposition, type StudioCompositionProps } from "./Composition";
import { FPS, VIDEO_WIDTH, VIDEO_HEIGHT, totalDurationInFrames } from "./durationUtils";

// Remotion's `Composition` is generic over a zod schema + props type, and
// inference falls back to `Record<string, unknown>` when a schema isn't
// supplied (we don't use zod-validated props here) — casting to a plain,
// concrete prop shape sidesteps that instead of fighting the inference.
const TypedComposition = Composition as unknown as React.FC<{
  id: string;
  component: React.FC<StudioCompositionProps>;
  fps: number;
  width: number;
  height: number;
  durationInFrames: number;
  defaultProps: StudioCompositionProps;
  calculateMetadata: (options: {
    props: StudioCompositionProps;
  }) => Promise<{ durationInFrames: number }>;
}>;

export const RemotionRoot: React.FC = () => {
  return (
    <TypedComposition
      id="Studio"
      component={StudioComposition}
      fps={FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      durationInFrames={FPS}
      defaultProps={{ clips: [] }}
      calculateMetadata={async ({ props }) => ({
        durationInFrames: totalDurationInFrames(props.clips),
      })}
    />
  );
};
