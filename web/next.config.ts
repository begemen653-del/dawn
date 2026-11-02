import { join } from "node:path";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: the app only reads JSON files written by the nightly pipeline.
  output: "export",
  reactStrictMode: true,
  transpilePackages: ["@dawn/config", "@dawn/pipeline"],
  images: { unoptimized: true },
  turbopack: { root: join(import.meta.dirname, "..") },
};

export default withSerwist(nextConfig);
