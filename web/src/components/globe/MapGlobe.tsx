"use client";

import { COUNTRIES, getCountry } from "@dawn/config";
import type { SceneDirective, SceneElement } from "@dawn/pipeline/schema";
import type * as MapLibre from "maplibre-gl";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import type { GlobeFocus } from "./CanvasGlobe";
import { LABEL_LAYERS, mapStyle } from "./map-style";
import { EMPTY, flightMs, paddingFor, partOfLine, sceneShapes, unwrapGeometry } from "./scene-geo";
import { loadPlaces, loadWorld, type Place, type WorldData } from "./world";

export interface MapGlobeProps {
  readonly scene: SceneDirective | null;
  readonly focus: GlobeFocus | null;
  readonly reducedMotion: boolean;
  readonly label: string;
  /**
   * The map can't run here (no WebGL, map code missing) or runs too slowly: use the canvas globe.
   * `remember: false` = only for this page view (slowness and timeouts can be passing).
   */
  readonly onFail: (reason: string, remember?: boolean) => void;
}

const ACCENT = "#e3b36a";
const ALERT = "#e07a6f";
const NEUTRAL = "#c3cbd5";
const TONE_COLOR = ["match", ["get", "tone"], "focus", ACCENT, "alert", ALERT, NEUTRAL] as const;

/** Deepest the camera goes: close enough to read city districts, not street level. */
const MAX_ZOOM = 9.5;
/** Give up on the map if it hasn't drawn within this time (very slow device or network). */
const LOAD_TIMEOUT_MS = 15_000;
/** Average frame rate during flights below which the light canvas globe takes over. */
const MIN_FLIGHT_FPS = 15;
const ARC_DRAW_MS = 1100;

/**
 * Camera tilt by zoom: straight down at the whole Earth, leaning in as it comes down to a city.
 * Kept moderate: a steeper tilt shows more land up to the horizon, which all has to download.
 */
export function pitchFor(zoom: number): number {
  if (zoom <= 3) return 0;
  return Math.round(Math.min(40, (zoom - 3) * 11));
}

/**
 * Light and shadow on the zoomed-out planet, like a lit sphere: a soft highlight towards the
 * upper left and darker edges. Placed exactly over the globe every frame; gone when zoomed in.
 */
function updateShade(map: MapLibreMap, shade: HTMLDivElement) {
  const zoom = map.getZoom();
  const strength = Math.max(0, Math.min(1, (4.2 - zoom) / 1.2));
  if (strength === 0) {
    shade.style.opacity = "0";
    return;
  }
  // MapLibre's globe: radius = world size / 2π / cos(latitude); the camera sits 1.5 screen heights
  // away (its default 36.87° field of view).
  const lat = Math.min(85, Math.abs(map.getCenter().lat));
  const r = (512 * 2 ** zoom) / (2 * Math.PI) / Math.cos((lat * Math.PI) / 180);
  const d = 1.5 * map.getCanvas().clientHeight;
  // Apparent radius of a sphere of radius r seen from distance d + r with focal length d.
  const radius = d * Math.tan(Math.asin(Math.min(0.999, r / (d + r))));
  const c = map.project(map.getCenter());
  shade.style.opacity = String(strength);
  shade.style.width = `${radius * 2}px`;
  shade.style.height = `${radius * 2}px`;
  shade.style.transform = `translate(${c.x - radius}px, ${c.y - radius}px)`;
}

/**
 * The full globe (MapLibre GL, WebGL): real map tiles, deep zoom down to city level, borders
 * and place names. Flies between stories and draws the scene directive. Falls back to the
 * canvas globe through `onFail`.
 */
export function MapGlobe({ scene, focus, reducedMotion, label, onFail }: MapGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shadeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const worldRef = useRef<WorldData | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const markerClassRef = useRef<typeof Marker | null>(null);
  const sceneRef = useRef(scene);
  const focusRef = useRef(focus);
  const reducedRef = useRef(reducedMotion);
  const onFailRef = useRef(onFail);
  const arcAnimRef = useRef(0);
  const slowFlightsRef = useRef(0);

  useEffect(() => {
    onFailRef.current = onFail;
  }, [onFail]);

  // Create the map once. maplibre-gl (~1 MB) is only downloaded here, when it's actually used.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // An object, so the check after `await` sees changes made by the cleanup.
    const life = { disposed: false };
    let timeout = 0;

    void (async () => {
      let maplibre: typeof MapLibre;
      try {
        maplibre = await import("maplibre-gl");
      } catch {
        onFailRef.current("map code could not load");
        return;
      }
      if (life.disposed) return;
      maplibre.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
      markerClassRef.current = maplibre.Marker;

      let map: MapLibreMap;
      try {
        map = new maplibre.Map({
          container,
          style: mapStyle(),
          center: [15, 25],
          zoom: 1.2,
          maxZoom: MAX_ZOOM,
          interactive: false,
          attributionControl: { compact: true },
          // Place names fade in over 250 ms, like the canvas globe's labels.
          fadeDuration: 250,
        });
      } catch {
        onFailRef.current("WebGL is not available");
        return;
      }
      mapRef.current = map;
      timeout = window.setTimeout(() => {
        if (!readyRef.current && !document.hidden) onFailRef.current("the map took too long to load", false);
      }, LOAD_TIMEOUT_MS);

      map.on("render", () => {
        if (shadeRef.current) updateShade(map, shadeRef.current);
      });

      map.on("error", (event) => {
        // Before the first draw any error (style, tiles, WebGL) means the map isn't usable here.
        if (!readyRef.current) onFailRef.current(event.error.message);
      });

      map.on("load", () => {
        if (life.disposed) return;
        map.addSource("dawn-fills", { type: "geojson", data: EMPTY });
        map.addSource("dawn-arcs", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "dawn-fill",
          type: "fill",
          source: "dawn-fills",
          paint: {
            "fill-color": TONE_COLOR as never,
            // Up close a whole-country tint just greys the city out; let it fade away.
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              3,
              ["match", ["get", "kind"], "area", 0.14, 0.18],
              7,
              ["match", ["get", "kind"], "area", 0.12, 0.04],
            ],
          },
        });
        map.addLayer({
          id: "dawn-fill-line",
          type: "line",
          source: "dawn-fills",
          // The bundled outlines are coarser than the map's own coasts: fade them out before they
          // visibly disagree.
          paint: {
            "line-color": TONE_COLOR as never,
            "line-width": 1.3,
            "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.5, 0.9, 5.5, 0],
          },
        });
        map.addLayer({
          id: "dawn-arc-glow",
          type: "line",
          source: "dawn-arcs",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#e6e9ed", "line-width": 6, "line-opacity": 0.12 },
        });
        map.addLayer({
          id: "dawn-arc",
          type: "line",
          source: "dawn-arcs",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#e6e9ed", "line-width": 1.8 },
        });
        for (const layer of LABEL_LAYERS) map.addLayer(layer);
        // Story pins go on top as map layers (not HTML), so the map's own labels make room for them.
        map.addSource("dawn-pins", { type: "geojson", data: EMPTY });
        map.addLayer({
          id: "dawn-pin-dot",
          type: "circle",
          source: "dawn-pins",
          paint: {
            "circle-radius": ["case", ["get", "primary"], 4.5, 3.5],
            "circle-color": ["case", ["get", "primary"], ACCENT, "#e6e9ed"],
            "circle-stroke-color": "#0f141b",
            "circle-stroke-width": 1.5,
          },
        });
        // The main label always shows; other pins' labels give way when they would overlap.
        for (const primary of [false, true]) {
          map.addLayer({
            id: primary ? "dawn-pin-label-main" : "dawn-pin-label",
            type: "symbol",
            source: "dawn-pins",
            filter: ["==", ["get", "primary"], primary],
            layout: {
              "text-field": ["get", "label"],
              "text-font": primary ? ["Noto Sans Bold"] : ["Noto Sans Regular"],
              "text-size": primary ? 13 : 12,
              "text-anchor": "left",
              "text-offset": [0.9, 0],
              "text-allow-overlap": primary,
            },
            paint: {
              "text-color": "#e6e9ed",
              "text-halo-color": "rgba(15,20,27,0.95)",
              "text-halo-width": 2.2,
            },
          });
        }
        // The credit starts as a small (i) button; tapping it shows the full line. (MapLibre only
        // folds it after the first drag, which never happens here because the map doesn't move by hand.)
        // It reopens itself when the screen size changes (e.g. turning the phone), so fold it again then.
        const foldCredit = () => {
          const credit = container.querySelector(".maplibregl-ctrl-attrib");
          credit?.classList.remove("maplibregl-compact-show");
          credit?.removeAttribute("open");
        };
        foldCredit();
        map.on("resize", foldCredit);
        readyRef.current = true;
        window.clearTimeout(timeout);
        showBaseWorld();
        loadPlaces()
          .then((places) => {
            if (!life.disposed) showBuiltInNames(places);
          })
          .catch(() => undefined);
        showScene(true);
      });
    })();

    loadWorld("50m")
      .then((w) => {
        worldRef.current = w;
        showBaseWorld();
        if (readyRef.current) drawShapes(false);
      })
      .catch(() => undefined);

    return () => {
      life.disposed = true;
      window.clearTimeout(timeout);
      cancelAnimationFrame(arcAnimRef.current);
      for (const m of markersRef.current) m.remove();
      markersRef.current = [];
      mapRef.current?.remove();
      mapRef.current = null;
      readyRef.current = false;
    };
    // showScene/drawShapes only read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Built-in place names (countries, ~2,400 cities) for the zoomed-out globe: no download needed. */
  function showBuiltInNames(places: readonly Place[]) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    void map.getSource<GeoJSONSource>("names")?.setData({
      type: "FeatureCollection",
      features: [
        ...COUNTRIES.map((c) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [c.camera.lng, c.camera.lat] },
          // Countries seen from far away (small camera zoom) are big: they win label overlaps.
          properties: { kind: "country", name: c.name, rank: c.camera.zoom },
        })),
        ...places.map(([name, lon, lat, rank]) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [lon, lat] },
          properties: { kind: "city", name, rank },
        })),
      ],
    });
  }

  /** Built-in land and borders under the tiles, so the zoomed-out globe is never a blank disc. */
  function showBaseWorld() {
    const map = mapRef.current;
    const world = worldRef.current;
    if (!map || !world) return;
    void map.getSource<GeoJSONSource>("base")?.setData({
      type: "FeatureCollection",
      features: world.shapes.map((shape) => ({
        ...shape.feature,
        geometry: unwrapGeometry(shape.feature.geometry),
      })),
    });
  }

  /** Highlights, areas and routes; routes draw themselves in once the camera has arrived. */
  function drawShapes(animateArcs: boolean) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const shapes = sceneShapes(sceneRef.current, worldRef.current);
    void map.getSource<GeoJSONSource>("dawn-fills")?.setData(shapes.fills);
    const arcs = map.getSource<GeoJSONSource>("dawn-arcs");
    cancelAnimationFrame(arcAnimRef.current);
    if (!arcs) return;
    if (!animateArcs || reducedRef.current || shapes.arcs.features.length === 0) {
      void arcs.setData(shapes.arcs);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const share = Math.min(1, (now - start) / ARC_DRAW_MS);
      const eased = 1 - (1 - share) ** 3;
      void arcs.setData({
        ...shapes.arcs,
        features: shapes.arcs.features.map((f) => ({
          ...f,
          geometry: {
            ...f.geometry,
            coordinates: partOfLine(f.geometry.coordinates as [number, number][], eased),
          },
        })),
      });
      if (share < 1) arcAnimRef.current = requestAnimationFrame(step);
    };
    arcAnimRef.current = requestAnimationFrame(step);
  }

  /** Pins: dots and labels are map layers; only the main pin's slow pulse is an HTML element. */
  function drawMarkers(pulse: boolean) {
    const map = mapRef.current;
    const MarkerClass = markerClassRef.current;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    if (!map || !MarkerClass) return;
    const elements = sceneRef.current?.elements ?? [];
    // A pin named after a highlighted country only repeats the map's own country label.
    const countryNames = new Set(
      elements.flatMap((el) => (el.type === "highlight" ? [getCountry(el.country)?.name ?? ""] : [])),
    );
    const pins = elements.filter(
      (el): el is Extract<SceneElement, { type: "marker" }> =>
        el.type === "marker" && !(el.emphasis === "secondary" && countryNames.has(el.label)),
    );
    void map.getSource<GeoJSONSource>("dawn-pins")?.setData({
      type: "FeatureCollection",
      features: pins.map((el) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [el.at[0], el.at[1]] },
        properties: { label: el.label, primary: el.emphasis === "primary" },
      })),
    });
    // The pulse waits for the camera to arrive; mid-flight it would float at the planet's edge.
    const main = pulse ? pins.find((el) => el.emphasis === "primary") : undefined;
    if (main) {
      // MapLibre positions the outer element with a transform, so the animation runs on an inner one.
      const holder = document.createElement("div");
      holder.setAttribute("aria-hidden", "true");
      const ring = document.createElement("div");
      ring.className = "dawn-pulse";
      holder.append(ring);
      markersRef.current.push(
        new MarkerClass({ element: holder }).setLngLat([main.at[0], main.at[1]]).addTo(map),
      );
    }
  }

  /** Flies to the current scene (or cuts there with reduced motion) and redraws its shapes. */
  function showScene(first: boolean) {
    const map = mapRef.current;
    const current = sceneRef.current;
    if (!map || !readyRef.current) return;
    drawMarkers(reducedRef.current);
    if (!current) {
      drawShapes(false);
      return;
    }
    const container = map.getContainer();
    const f = focusRef.current;
    const padding = f ? paddingFor(f.x, f.y, container.clientWidth, container.clientHeight) : undefined;
    const target = {
      center: [current.camera.lng, current.camera.lat] as [number, number],
      zoom: Math.min(MAX_ZOOM, current.camera.zoom),
      bearing: 0,
      // Close in, the camera tilts to look across the land instead of straight down.
      pitch: pitchFor(Math.min(MAX_ZOOM, current.camera.zoom)),
      ...(padding ? { padding } : {}),
    };
    if (reducedRef.current) {
      map.jumpTo(target);
      drawShapes(false);
      return;
    }
    // Countries and areas show at once; routes grow in once the camera has arrived.
    drawShapes(false);
    void map.getSource<GeoJSONSource>("dawn-arcs")?.setData(EMPTY);
    const from = map.getCenter();
    const duration = flightMs([from.lng, from.lat], target.center) * (first ? 0.8 : 1);
    let frames = 0;
    let wasHidden = document.hidden;
    const count = () => frames++;
    const onVisibility = () => {
      wasHidden ||= document.hidden;
    };
    map.on("render", count);
    document.addEventListener("visibilitychange", onVisibility);
    const started = performance.now();
    map.once("moveend", () => {
      map.off("render", count);
      document.removeEventListener("visibilitychange", onVisibility);
      if (sceneRef.current === current) {
        drawShapes(true);
        drawMarkers(true);
      }
      // Only a flight watched from start to end counts. A page that isn't on screen draws few or
      // no frames (browsers pause it), which says nothing about the device's speed.
      const fps = (frames * 1000) / Math.max(1, performance.now() - started);
      const measured = !wasHidden && !document.hidden && frames >= 10;
      if (!measured) return;
      slowFlightsRef.current = fps < MIN_FLIGHT_FPS ? slowFlightsRef.current + 1 : 0;
      // Three clearly stuttering flights in a row: this device is better off with the light globe.
      if (slowFlightsRef.current >= 3) onFailRef.current(`slow flights (${Math.round(fps)} fps)`, false);
    });
    map.flyTo({ ...target, duration, curve: 1.5, essential: true });
  }

  // New story.
  useEffect(() => {
    sceneRef.current = scene;
    showScene(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  // Cards moved (rotation, resize): keep the place in the free space.
  useEffect(() => {
    focusRef.current = focus;
    reducedRef.current = reducedMotion;
    const map = mapRef.current;
    if (!map || !readyRef.current || !focus || map.isMoving()) return;
    const container = map.getContainer();
    map.easeTo({
      padding: paddingFor(focus.x, focus.y, container.clientWidth, container.clientHeight),
      duration: reducedMotion ? 0 : 300,
    });
  }, [focus, reducedMotion]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} role="img" aria-label={label} className="dawn-map h-full w-full" />
      <div ref={shadeRef} aria-hidden className="dawn-shade" />
    </div>
  );
}
