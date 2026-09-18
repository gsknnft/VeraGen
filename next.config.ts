import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
    ] }];
  },
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
