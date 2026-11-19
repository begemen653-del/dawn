"use client";

import type { SceneDirective } from "@dawn/pipeline/schema";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { useOnline } from "@/lib/use-online";
import { CanvasGlobe, type GlobeFocus } from "./CanvasGlobe";

// The map code is only downloaded when the full globe is used.
const MapGlobe = dynamic(() => import("./MapGlobe").then((m) => m.MapGlobe), { ssr: false });

export interface GlobeProps {
  readonly scene: SceneDirective | null;
  readonly focus: GlobeFocus | null;
  readonly reducedMotion: boolean;
  readonly label: string;
}

/** Remembered for this visit only: a device that failed once doesn't retry on every story. */
const FALLBACK_KEY = "dawn.globe.fallback";

function webglWorks(): boolean {
  try {
    return document.createElement("canvas").getContext("webgl2") !== null;
  } catch {
    return false;
  }
}

function readFallback(): string | null {
  try {
    // ?globe=simple forces the light globe (handy for testing).
    if (new URLSearchParams(window.location.search).get("globe") === "simple") return "asked for";
    const saved = sessionStorage.getItem(FALLBACK_KEY);
    // Older versions also remembered slowness, which a hidden tab could fake; only real failures count.
    if (saved?.startsWith("slow") || saved?.includes("too long")) {
      sessionStorage.removeItem(FALLBACK_KEY);
      return null;
    }
    return saved;
  } catch {
    return null;
  }
}

/**
 * Picks the globe: the full MapLibre map (deep zoom, real place names) when the device has
 * WebGL and a connection, otherwise the light canvas globe, which works offline from bundled data.
 * If the map can't run it switches to the canvas globe for the rest of the visit; if it clearly
 * stutters, only for this page view.
 */
export function Globe(props: GlobeProps) {
  const online = useOnline();
  const [fallback, setFallback] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // Decided after mounting: WebGL and storage only exist in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time browser check
    setFallback(readFallback() ?? (webglWorks() ? null : "no WebGL"));
  }, []);

  const onFail = useCallback((reason: string, remember = true) => {
    console.info(`Dawn: using the simple globe (${reason}).`);
    if (remember) {
      try {
        sessionStorage.setItem(FALLBACK_KEY, reason);
      } catch {
        // Private mode: only this page view falls back.
      }
    }
    setFallback(reason);
  }, []);

  if (fallback === undefined) return null;
  return fallback === null && online ? <MapGlobe {...props} onFail={onFail} /> : <CanvasGlobe {...props} />;
}
