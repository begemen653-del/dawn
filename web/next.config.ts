import { join } from "node:path";
import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

// "/dawn" when built for GitHub Pages (begemen653-del.github.io/dawn), empty for local use.
const basePath = process.env.DAWN_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // Fully static site: the app only reads JSON files written by the nightly pipeline.
  output: "export",
  basePath,
  // Pages as folders (sources/index.html): GitHub Pages would otherwise find the "sources" folder
  // of page data first and answer "not found" instead of serving sources.html.
  trailingSlash: true,
  // Lets plain fetch() calls and the service worker set-up know the folder too.
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  reactStrictMode: true,
  transpilePackages: ["@dawn/config", "@dawn/pipeline"],
  images: { unoptimized: true },
  turbopack: { root: join(import.meta.dirname, "..") },
  // Lets a phone on the home Wi-Fi load the dev server (otherwise Next.js blocks its scripts
  // and the page never gets past "Loading"). Private network ranges only; dev mode only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
};

export default withSerwist(nextConfig);
