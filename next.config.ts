import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  // These pull in native bindings / dynamic requires that webpack can't
  // (and shouldn't) bundle — Remotion's own render pipeline, and sharp's
  // native image bindings. Left external, Node just requires them normally.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "sharp",
  ],
};

export default nextConfig;
