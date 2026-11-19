import type { MetadataRoute } from "next";
import { withBase } from "@/lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: withBase("/"),
    name: "Dawn — morning world brief",
    short_name: "Dawn",
    description: "Understand what is happening in the world in two or three minutes.",
    start_url: withBase("/"),
    scope: withBase("/"),
    display: "standalone",
    orientation: "any",
    background_color: "#0f141b",
    theme_color: "#0f141b",
    categories: ["news", "education"],
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBase("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
