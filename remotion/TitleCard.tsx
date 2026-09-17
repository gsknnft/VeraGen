import React from "react";
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

export interface TitleCardProps {
  headline?: string | null;
  logoUrl?: string | null;
  background?: string;
}

// A full-bleed card that fades in, holds, and fades out within whatever
// Sequence duration it's placed in — used for both the brand intro and the
// CTA outro (which just supplies different text/background).
export const TitleCard: React.FC<TitleCardProps> = ({
  headline,
  logoUrl,
  background = "#0a0a0a",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const fade = Math.round(fps * 0.4);

  const opacity = interpolate(
    frame,
    [0, fade, durationInFrames - fade, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      {logoUrl && (
        <Img
          src={logoUrl}
          style={{ maxWidth: "40%", maxHeight: "30%", objectFit: "contain", marginBottom: 24 }}
        />
      )}
      {headline && (
        <h1
          style={{
            color: "white",
            fontFamily: "sans-serif",
            fontSize: 56,
            fontWeight: 700,
            textAlign: "center",
            padding: "0 60px",
            margin: 0,
          }}
        >
          {headline}
        </h1>
      )}
    </AbsoluteFill>
  );
};
