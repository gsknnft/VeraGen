import React from "react";
import { Img } from "remotion";

export interface BrandWatermarkProps {
  logoUrl: string;
}

// Small, always-on corner mark for the whole video — rendered as a sibling
// after the main content so it paints on top, not part of any Sequence so
// it isn't subject to intro/outro fades.
export const BrandWatermark: React.FC<BrandWatermarkProps> = ({ logoUrl }) => (
  <Img
    src={logoUrl}
    style={{
      position: "absolute",
      bottom: 40,
      right: 40,
      width: 96,
      height: 96,
      objectFit: "contain",
      opacity: 0.85,
    }}
  />
);
