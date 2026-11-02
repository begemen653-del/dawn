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
  // Lets a phone on the home Wi-Fi load the dev server (otherwise Next.js blocks its scripts
  // and the page never gets past "Loading"). Private network ranges only; dev mode only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default withSerwist(nextConfig);
