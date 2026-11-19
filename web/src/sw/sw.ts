/**
 * Service worker: precaches the app shell (pages, code, map shapes, fonts) so Dawn opens offline.
 * Story photos already seen are kept for two weeks (max 200).
 * The brief's JSON files under /data/ always go to the network: the app keeps its own saved copy
 * (src/lib/brief.ts) and decides when to swap in a new one.
 */
import { defaultCache } from "@serwist/turbopack/worker";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  type PrecacheEntry,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** The app's folder: "/dawn/" on GitHub Pages, "/" locally (the worker sits at its top). */
const BASE = new URL(self.registration.scope).pathname;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith(`${BASE}data/`),
      handler: new NetworkOnly(),
    },
    // Story photos from Wikimedia: keep the ones already seen so they also show offline.
    // Loaded with CORS (crossOrigin="anonymous"), so no opaque answers fill up storage.
    {
      matcher: ({ url, request }) =>
        request.destination === "image" && /(^|\.)wikimedia\.org$/.test(url.hostname),
      handler: new CacheFirst({
        cacheName: "dawn-photos",
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 14 * 24 * 3600 })],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: `${BASE}~offline/`,
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
