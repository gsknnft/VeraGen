import React from "react";
import { AbsoluteFill, OffthreadVideo, Series } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { TitleCard } from "./TitleCard";
import { BrandWatermark } from "./BrandWatermark";
import {
  CROSSFADE_SECONDS,
  FPS,
  clipLengthSeconds,
  introFrames,
  outroFrames,
  totalDurationInFrames,
  type Aspect,
  type BrandKit,
  type TimelineClip,
} from "./durationUtils";

const FADE_FRAMES = Math.round(CROSSFADE_SECONDS * FPS);

function CaptionOverlay({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "12%",
        display: "flex",
        justifyContent: "center",
        padding: "0 40px",
      }}
    >
      <span
        style={{
          background: "rgba(0,0,0,0.55)",
          color: "white",
          fontFamily: "sans-serif",
          fontSize: 34,
          fontWeight: 600,
          padding: "10px 20px",
          borderRadius: 10,
          textAlign: "center",
        }}
      >
        {text}
      </span>
    </div>
  );
}

export const ClipsSequence: React.FC<{ clips: TimelineClip[] }> = ({ clips }) => (
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
          <AbsoluteFill>
            <OffthreadVideo
              src={clip.videoUrl}
              startFrom={Math.round(clip.trimStart * FPS)}
              endAt={Math.round(clip.trimEnd * FPS)}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {clip.caption && <CaptionOverlay text={clip.caption} />}
          </AbsoluteFill>
        </TransitionSeries.Sequence>
      );

      return items;
    })}
  </TransitionSeries>
);

export interface StudioCompositionProps {
  clips: TimelineClip[];
  brand: BrandKit;
  projectName: string;
  // Read by Root.tsx's calculateMetadata to size the canvas; the component
  // itself doesn't need it — AbsoluteFill just fills whatever canvas it's
  // given.
  aspect?: Aspect;
}

export const StudioComposition: React.FC<StudioCompositionProps> = ({
  clips,
  brand,
  projectName,
}) => {
  const intro = introFrames(brand);
  const outro = outroFrames(brand);
  const clipsFrames = totalDurationInFrames(clips);

  return (
    <AbsoluteFill>
      <Series>
        {intro > 0 && (
          <Series.Sequence durationInFrames={intro}>
            <TitleCard
              headline={brand.template === "announcement" ? projectName : undefined}
              logoUrl={brand.logoUrl}
            />
          </Series.Sequence>
        )}
        <Series.Sequence durationInFrames={clipsFrames}>
          <ClipsSequence clips={clips} />
        </Series.Sequence>
        {outro > 0 && (
          <Series.Sequence durationInFrames={outro}>
            <TitleCard headline={brand.ctaText} logoUrl={brand.logoUrl} background="#111" />
          </Series.Sequence>
        )}
      </Series>
      {brand.logoUrl && <BrandWatermark logoUrl={brand.logoUrl} />}
    </AbsoluteFill>
  );
};
