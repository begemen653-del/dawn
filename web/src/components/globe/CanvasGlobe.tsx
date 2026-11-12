"use client";

import { COUNTRIES, getCountry, type Country } from "@dawn/config";
import type { SceneDirective } from "@dawn/pipeline/schema";
import {
  geoCircle,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoPath,
} from "d3-geo";
import { useEffect, useRef } from "react";
import { cameraAt, planFlight, zoomToScale, type Flight, type GlobeCamera } from "./camera";
import { dawnLine, subsolarPoint } from "./sun";
import { loadPlaces, loadWorld, type CountryShape, type Place, type WorldData } from "./world";

/** Country label positions by ISO numeric code, from the bundled catalog. */
const COUNTRY_BY_NUMERIC = new Map<string, Country>(
  COUNTRIES.flatMap((c) => (c.isoNumeric ? [[c.isoNumeric, c] as const] : [])),
);

/** Zoom (globe scale) from which the detailed 1:50m shapes replace the 1:110m ones. */
const FINE_DETAIL_FROM = 1.6;

/** A flight frame slower than this (ms) switches that flight to the light map, so slow phones never stutter. */
const SLOW_FRAME_MS = 22;

/** How long the settled map (labels, extra detail) fades in after the camera stops. */
const SETTLE_FADE_MS = 250;

export interface GlobeFocus {
  /** Where on screen (CSS px) the story's location should sit, between the overlays. */
  readonly x: number;
  readonly y: number;
  /** Screen areas covered by cards and controls ([x, y, width, height]); map labels avoid them. */
  readonly obstacles?: readonly (readonly [number, number, number, number])[];
}

export interface CanvasGlobeProps {
  readonly scene: SceneDirective | null;
  readonly focus: GlobeFocus | null;
  readonly reducedMotion: boolean;
  readonly label: string;
}

/** One warm accent ("first light"); everything else on the globe is greyscale. */
const ACCENT = "#e3b36a";
const TONES = {
  focus: ACCENT,
  alert: "#e07a6f",
  neutral: "#c3cbd5",
} as const;

const ARC_COLOR = "#e6e9ed";
const IDLE_CAMERA: GlobeCamera = { lon: 15, lat: 25, k: 1 };

/**
 * Lightweight 2D canvas globe (d3-geo orthographic) in quiet greyscale. It flies between stories and draws the
 * scene directive: highlighted countries, areas, routes and pulsing markers.
 * It is also the low-power fallback for devices without good WebGL once the MapLibre
 * globe arrives in Milestone 6.
 */
export function CanvasGlobe({ scene, focus, reducedMotion, label }: CanvasGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef(scene);
  const focusRef = useRef(focus);
  const reducedRef = useRef(reducedMotion);
  const cameraRef = useRef<GlobeCamera>(IDLE_CAMERA);
  const flightRef = useRef<{ flight: Flight; start: number } | null>(null);
  const holdStartRef = useRef(0);
  const dirtyRef = useRef(true);
  const cacheVersionRef = useRef(0);

  // Runs before the scene effect so a first scene already sees the right motion setting.
  useEffect(() => {
    focusRef.current = focus;
    reducedRef.current = reducedMotion;
    dirtyRef.current = true;
    cacheVersionRef.current++;
  }, [focus, reducedMotion]);

  // New story: fly there (or cut, with reduced motion).
  useEffect(() => {
    sceneRef.current = scene;
    dirtyRef.current = true;
    cacheVersionRef.current++;
    if (!scene) return;
    const target: GlobeCamera = {
      lon: scene.camera.lng,
      lat: scene.camera.lat,
      k: zoomToScale(scene.camera.zoom),
    };
    const now = performance.now();
    if (reducedRef.current) {
      cameraRef.current = target;
      flightRef.current = null;
      holdStartRef.current = now;
    } else {
      flightRef.current = { flight: planFlight(cameraRef.current, target), start: now };
    }
  }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ctx: CanvasRenderingContext2D = context;

    // Coarse shapes first for a fast first frame, then detailed shapes and cities.
    // Any of these may fail: the globe still works without them (sphere, markers, routes).
    let coarse: WorldData | null = null;
    let fine: WorldData | null = null;
    let places: readonly Place[] = [];
    let disposed = false;
    const loaded = () => {
      if (disposed) return;
      dirtyRef.current = true;
      cacheVersionRef.current++;
    };
    loadWorld("110m")
      .then((w) => {
        coarse = w;
        loaded();
      })
      .catch(() => undefined)
      .finally(() => {
        loadWorld("50m")
          .then((w) => {
            fine = w;
            loaded();
          })
          .catch(() => undefined);
        loadPlaces()
          .then((p) => {
            places = p;
            loaded();
          })
          .catch(() => undefined);
      });

    const font = getComputedStyle(document.body).fontFamily;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      dirtyRef.current = true;
      cacheVersionRef.current++;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let last = 0;
    let raf = 0;
    let sun = subsolarPoint(new Date());
    let sunUpdatedAt = 0;

    // The detailed map is expensive (~20 ms on a PC), so while the camera holds still it is
    // drawn once into this hidden canvas and reused every frame. Only the pulse and routes
    // are redrawn live. During flights the light 1:110m map is drawn directly instead.
    const cache = document.createElement("canvas");
    const cacheContext = cache.getContext("2d");
    let cacheKey = "";
    // Flights draw the detailed map when zoomed in, unless this device proves too slow for it.
    let lightFlight: object | null = null;

    const updateCamera = (now: number, dt: number) => {
      const active = flightRef.current;
      if (active) {
        const t = (now - active.start) / active.flight.durationMs;
        cameraRef.current = cameraAt(active.flight, t);
        if (t >= 1) {
          flightRef.current = null;
          holdStartRef.current = now;
        }
        return;
      }
      if (!sceneRef.current && !reducedRef.current) {
        // Idle: slow spin while nothing is selected.
        cameraRef.current = { ...cameraRef.current, lon: cameraRef.current.lon + dt * 0.004 };
      }
    };

    const draw = (now: number) => {
      const reduced = reducedRef.current;
      const cam = cameraRef.current;
      const focus = focusRef.current;
      const cx = focus?.x ?? width / 2;
      const cy = focus?.y ?? height / 2;
      const radius = Math.min(width, height) * 0.42;
      const r = radius * cam.k;
      const center: [number, number] = [cam.lon, cam.lat];
      const current = sceneRef.current;
      const flight = flightRef.current;
      const moving = flight !== null || current === null;
      const light = flight === null || lightFlight === flight.flight;

      const projection = geoOrthographic()
        .translate([cx, cy])
        .scale(r)
        .rotate([-cam.lon, -cam.lat])
        .clipAngle(90)
        .precision(moving && light ? 0.9 : 0.6);

      if (now - sunUpdatedAt > 1000) {
        sun = subsolarPoint(new Date());
        sunUpdatedAt = now;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const fadeIn = reduced ? 1 : Math.min(1, (now - holdStartRef.current) / SETTLE_FADE_MS);
      if (moving || !cacheContext) {
        const t0 = performance.now();
        drawMap(ctx, false, !light);
        if (flight && !light && performance.now() - t0 > SLOW_FRAME_MS) lightFlight = flight.flight;
      } else {
        const key = [
          cacheVersionRef.current,
          cam.lon.toFixed(5),
          cam.lat.toFixed(5),
          cam.k.toFixed(5),
          cx,
          cy,
          width,
          height,
          dpr,
          Math.floor(Date.now() / 60_000), // the night side moves; refresh once a minute
        ].join("|");
        if (key !== cacheKey) {
          cache.width = canvas.width;
          cache.height = canvas.height;
          cacheContext.setTransform(dpr, 0, 0, dpr, 0, 0);
          cacheContext.clearRect(0, 0, width, height);
          drawMap(cacheContext, true, true);
          cacheKey = key;
        }
        // Just after landing, fade the settled map in over the flight's last frame instead of popping.
        if (fadeIn < 1) drawMap(ctx, false, cam.k >= FINE_DETAIL_FROM);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = fadeIn;
        ctx.drawImage(cache, 0, 0);
        ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      if (current) drawLive(current, now);

      /** Everything that only changes when the camera moves: sea, land, night, highlights, labels. */
      function drawMap(g: CanvasRenderingContext2D, settled: boolean, allowFine: boolean) {
        const path = geoPath(projection, g);

        // Water, very slightly lit from the upper left.
        const ocean = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
        ocean.addColorStop(0, "#18222e");
        ocean.addColorStop(1, "#0c1118");
        g.beginPath();
        path({ type: "Sphere" });
        g.fillStyle = ocean;
        g.fill();

        g.beginPath();
        path(geoGraticule10());
        g.strokeStyle = "rgba(200,210,225,0.045)";
        g.lineWidth = 0.6;
        g.stroke();

        const detailed = allowFine && cam.k >= FINE_DETAIL_FROM && fine !== null;
        const world = detailed ? fine : (coarse ?? fine);
        // Angular radius of the part of the globe that is on screen, to skip everything else.
        const farthest = Math.max(
          Math.hypot(cx, cy),
          Math.hypot(width - cx, cy),
          Math.hypot(cx, height - cy),
          Math.hypot(width - cx, height - cy),
        );
        const visibleAngle = farthest >= r ? Math.PI / 2 : Math.asin(farthest / r) + 0.04;
        const visibleShapes = world
          ? world.shapes.filter((shape) => geoDistance(shape.center, center) - shape.radius < visibleAngle)
          : [];

        if (visibleShapes.length > 0) {
          g.beginPath();
          for (const shape of visibleShapes) path(shape.feature);
          g.fillStyle = "#2a3441";
          g.fill();
          // Coasts and borders together; finer when zoomed in so detail doesn't turn into clutter.
          g.strokeStyle = "rgba(150,163,180,0.42)";
          g.lineWidth = detailed ? 0.6 : 0.7;
          g.stroke();
        }

        drawNight(g, path);

        // Edge shading and a fine rim.
        const limb = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, r);
        limb.addColorStop(0, "rgba(8,11,16,0)");
        limb.addColorStop(1, "rgba(8,11,16,0.55)");
        g.beginPath();
        path({ type: "Sphere" });
        g.fillStyle = limb;
        g.fill();
        g.strokeStyle = "rgba(150,163,180,0.35)";
        g.lineWidth = 1;
        g.stroke();

        if (current && world) drawRegions(g, path, current, world);
        // Labels only once the camera has settled: names sliding past during a flight are noise.
        if (settled) drawLabels(g, current, visibleShapes);
      }

      /** Night side, a soft twilight edge, and the one warm line: where the sun is rising now. */
      function drawNight(g: CanvasRenderingContext2D, path: GeoPath) {
        const night: [number, number] = [sun[0] + 180, -sun[1]];
        for (const [radiusDeg, alpha] of [
          [96, 0.1],
          [90, 0.2],
          [84, 0.2],
        ] as const) {
          g.beginPath();
          path(geoCircle().center(night).radius(radiusDeg)());
          g.fillStyle = `rgba(4,6,10,${alpha})`;
          g.fill();
        }
        const line = { type: "LineString" as const, coordinates: dawnLine(sun) };
        g.save();
        g.beginPath();
        path(line);
        g.shadowColor = ACCENT;
        g.shadowBlur = 10;
        g.strokeStyle = "rgba(227,179,106,0.18)";
        g.lineWidth = 6;
        g.stroke();
        g.restore();
        g.beginPath();
        path(line);
        g.strokeStyle = "rgba(227,179,106,0.9)";
        g.lineWidth = 1.2;
        g.stroke();
      }

      /** Highlighted countries and shaded areas from the scene directive. */
      function drawRegions(
        g: CanvasRenderingContext2D,
        path: GeoPath,
        sceneToDraw: SceneDirective,
        world: WorldData,
      ) {
        for (const el of sceneToDraw.elements) {
          if (el.type === "highlight") {
            const numeric = getCountry(el.country)?.isoNumeric;
            const shape = numeric ? world.byId.get(numeric)?.feature : undefined;
            if (!shape) continue;
            const color = TONES[el.tone];
            g.beginPath();
            path(shape);
            g.fillStyle = `${color}2e`;
            g.fill();
            g.strokeStyle = color;
            g.lineWidth = 1.3;
            g.stroke();
          } else if (el.type === "area") {
            const color = TONES[el.tone];
            g.beginPath();
            path(
              geoCircle()
                .center(el.center)
                .radius(el.radiusKm / 111.32)(),
            );
            g.fillStyle = `${color}1f`;
            g.fill();
            g.setLineDash([4, 4]);
            g.strokeStyle = color;
            g.lineWidth = 1;
            g.stroke();
            g.setLineDash([]);
          }
        }
      }

      /**
       * Country names and cities, revealed as the camera zooms in. Labels never overlap:
       * more important ones are placed first, and anything that would collide is skipped.
       */
      function drawLabels(
        g: CanvasRenderingContext2D,
        sceneToDraw: SceneDirective | null,
        visibleShapes: readonly CountryShape[],
      ) {
        const taken: [number, number, number, number][] = (focus?.obstacles ?? []).map(([x, y, w, h]) => [
          x,
          y,
          w,
          h,
        ]);
        const fits = (x: number, y: number, w: number, h: number) => {
          if (x < 4 || y < 4 || x + w > width - 4 || y + h > height - 4) return false;
          for (const [tx, ty, tw, th] of taken) {
            if (x < tx + tw + 6 && x + w + 6 > tx && y < ty + th + 4 && y + h + 4 > ty) return false;
          }
          taken.push([x, y, w, h]);
          return true;
        };
        const onFront = (lon: number, lat: number) => geoDistance([lon, lat], center) < Math.PI / 2 - 0.12;

        // Keep room for the story's own markers, which are drawn on top.
        const storyNames = new Set<string>();
        for (const el of sceneToDraw?.elements ?? []) {
          if (el.type !== "marker") continue;
          storyNames.add(el.label.toLowerCase());
          const p = projection([el.at[0], el.at[1]]);
          if (p && onFront(el.at[0], el.at[1])) taken.push([p[0] - 6, p[1] - 12, 130, 24]);
        }

        g.textBaseline = "middle";

        // Countries: named once they are large enough on screen to carry a label.
        g.font = `500 11px ${font}`;
        g.textAlign = "center";
        const countries = visibleShapes
          .map((shape) => ({ shape, country: COUNTRY_BY_NUMERIC.get(shape.id) }))
          .filter((c) => c.country !== undefined && c.shape.radius * r > 34)
          .sort((a, b) => b.shape.radius - a.shape.radius);
        for (const { country } of countries) {
          if (!country || !onFront(country.camera.lng, country.camera.lat)) continue;
          const p = projection([country.camera.lng, country.camera.lat]);
          if (!p) continue;
          const name = country.name.replace(/ \(.*\)$/, "");
          const w = g.measureText(name).width;
          if (!fits(p[0] - w / 2, p[1] - 7, w, 14)) continue;
          g.fillStyle = "rgba(152,162,174,0.7)";
          g.fillText(name, p[0], p[1]);
        }

        // Cities: capitals and big cities first, smaller towns as the camera gets closer.
        g.textAlign = "left";
        if (cam.k < 2) return;
        const maxRank = cam.k < 3 ? 1 : cam.k < 4.5 ? 3 : cam.k < 6.5 ? 4 : 6;
        g.font = `400 11px ${font}`;
        let shown = 0;
        for (const [name, lon, lat, rank, capital] of places) {
          if (shown >= 35) break;
          if (rank > maxRank && !(capital === 1 && cam.k >= 2.6)) continue;
          if (storyNames.has(name.toLowerCase()) || !onFront(lon, lat)) continue;
          const p = projection([lon, lat]);
          if (!p) continue;
          const w = g.measureText(name).width;
          if (!fits(p[0] - 3, p[1] - 7, w + 10, 14)) continue;
          shown++;
          g.fillStyle = "rgba(200,208,218,0.75)";
          if (capital === 1) g.fillRect(p[0] - 2, p[1] - 2, 4, 4);
          else {
            g.beginPath();
            g.arc(p[0], p[1], 1.6, 0, Math.PI * 2);
            g.fill();
          }
          g.fillStyle = "rgba(200,208,218,0.72)";
          g.fillText(name, p[0] + 6, p[1]);
        }
      }

      /** Routes and markers: cheap, and animated, so drawn fresh every frame. */
      function drawLive(sceneToDraw: SceneDirective, time: number) {
        const path = geoPath(projection, ctx);
        const holding = flightRef.current === null;
        const sinceHold = holding ? time - holdStartRef.current : 0;

        for (const el of sceneToDraw.elements) {
          if (el.type !== "arc" || !holding) continue;
          const progress = reduced ? 1 : Math.min(1, Math.max(0, (sinceHold - 300) / 1600));
          if (progress <= 0) continue;
          const interpolate = geoInterpolate(el.from, el.to);
          const steps = 48;
          const coordinates: [number, number][] = [];
          for (let i = 0; i <= steps * progress; i++) coordinates.push(interpolate(i / steps));
          if (coordinates.length < 2) continue;
          ctx.beginPath();
          path({ type: "LineString", coordinates });
          ctx.setLineDash([6, 5]);
          ctx.lineDashOffset = el.animated && !reduced ? -time / 70 : 0;
          ctx.strokeStyle = ARC_COLOR;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.setLineDash([]);
          drawArrowHead(coordinates);
        }

        for (const el of sceneToDraw.elements) {
          if (el.type === "marker") drawMarker(el.at, el.label, el.emphasis === "primary", time);
          else if (el.type === "timelineStep" && el.focus)
            drawMarker(el.focus, `${el.order}. ${el.label}`, false, time);
        }
      }

      function drawArrowHead(coordinates: [number, number][]) {
        const a = coordinates.at(-2);
        const b = coordinates.at(-1);
        if (!a || !b) return;
        const pa = projection(a);
        const pb = projection(b);
        if (!pa || !pb) return;
        const angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        ctx.beginPath();
        ctx.moveTo(pb[0], pb[1]);
        ctx.lineTo(pb[0] - 9 * Math.cos(angle - 0.45), pb[1] - 9 * Math.sin(angle - 0.45));
        ctx.lineTo(pb[0] - 9 * Math.cos(angle + 0.45), pb[1] - 9 * Math.sin(angle + 0.45));
        ctx.closePath();
        ctx.fillStyle = ARC_COLOR;
        ctx.fill();
      }

      function drawMarker(at: readonly [number, number], text: string, primary: boolean, time: number) {
        if (geoDistance([at[0], at[1]], center) > 1.5) return; // behind the globe
        const p = projection([at[0], at[1]]);
        if (!p) return;
        const [x, y] = p;
        if (!reduced && primary) {
          // One slow pulse on the main location; secondary places stay still.
          const phase = ((time / 1000) % 2) / 2;
          ctx.beginPath();
          ctx.arc(x, y, 5 + phase * 18, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(227,179,106,${0.7 * (1 - phase)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, primary ? 4 : 3, 0, Math.PI * 2);
        ctx.fillStyle = primary ? ACCENT : "#e6e9ed";
        ctx.fill();
        ctx.strokeStyle = "#0f141b";
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = `${primary ? 600 : 500} ${primary ? 13 : 12}px ${font}`;
        const tw = ctx.measureText(text).width;
        const lx = x + 11;
        const ly = y - 10;
        ctx.fillStyle = "rgba(15,20,27,0.85)";
        ctx.beginPath();
        ctx.roundRect(lx - 6, ly - 1, tw + 12, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#e6e9ed";
        ctx.textBaseline = "top";
        ctx.fillText(text, lx, ly + 3);
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      const dt = last === 0 ? 16 : Math.min(50, now - last);
      // Cap at ~60 fps; with reduced motion, only redraw when something changed.
      if (now - last < 15) return;
      last = now;
      if (reducedRef.current && !dirtyRef.current && !flightRef.current) return;
      dirtyRef.current = false;
      updateCamera(now, dt);
      draw(now);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full touch-none" />;
}
