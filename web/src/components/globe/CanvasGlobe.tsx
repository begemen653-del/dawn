"use client";

import { getCountry } from "@dawn/config";
import type { SceneDirective } from "@dawn/pipeline/schema";
import {
  geoCircle,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
  type GeoProjection,
} from "d3-geo";
import { useEffect, useRef } from "react";
import { cameraAt, planFlight, zoomToScale, type Flight, type GlobeCamera } from "./camera";
import { dawnLine, subsolarPoint } from "./sun";
import { loadWorld, type WorldData } from "./world";

export interface GlobeFocus {
  /** Where on screen (CSS px) the story's location should sit, between the overlays. */
  readonly x: number;
  readonly y: number;
}

export interface CanvasGlobeProps {
  readonly scene: SceneDirective | null;
  readonly focus: GlobeFocus | null;
  readonly reducedMotion: boolean;
  readonly label: string;
}

const TONES = {
  focus: "#ff9a62",
  alert: "#ff5f8f",
  neutral: "#8b7bff",
} as const;

const ARC_COLOR = "#ffd27a";
const IDLE_CAMERA: GlobeCamera = { lon: 15, lat: 25, k: 1 };

interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly phase: number;
}

/**
 * Lightweight 2D canvas globe (d3-geo orthographic). It flies between stories and draws the
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

  // Runs before the scene effect so a first scene already sees the right motion setting.
  useEffect(() => {
    focusRef.current = focus;
    reducedRef.current = reducedMotion;
    dirtyRef.current = true;
  }, [focus, reducedMotion]);

  // New story: fly there (or cut, with reduced motion).
  useEffect(() => {
    sceneRef.current = scene;
    dirtyRef.current = true;
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

    let world: WorldData | null = null;
    let disposed = false;
    loadWorld()
      .then((w) => {
        if (disposed) return;
        world = w;
        dirtyRef.current = true;
      })
      .catch(() => {
        // The globe still works without land shapes (sphere, markers, routes).
      });

    const font = getComputedStyle(document.body).fontFamily;
    const stars: Star[] = Array.from({ length: 90 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.1 + 0.3,
      phase: Math.random() * 6.28,
    }));

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
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let last = 0;
    let raf = 0;
    let sun = subsolarPoint(new Date());
    let sunUpdatedAt = 0;

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
      const current = sceneRef.current;
      if (!current) {
        // Idle: slow spin while nothing is selected.
        if (!reducedRef.current)
          cameraRef.current = { ...cameraRef.current, lon: cameraRef.current.lon + dt * 0.004 };
        return;
      }
      if (reducedRef.current) return;
      // Gentle push-in while holding on a story.
      const base = zoomToScale(current.camera.zoom);
      const hold = Math.min(1, (now - holdStartRef.current) / 12000);
      cameraRef.current = { lon: current.camera.lng, lat: current.camera.lat, k: base * (1 + 0.05 * hold) };
    };

    const draw = (now: number) => {
      const reduced = reducedRef.current;
      const cam = cameraRef.current;
      const f = focusRef.current;
      const cx = f?.x ?? width / 2;
      const cy = f?.y ?? height / 2;
      const radius = Math.min(width, height) * 0.42;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const twinkle = reduced ? 0.4 : 0.25 + 0.3 * Math.abs(Math.sin(now / 1600 + s.phase));
        ctx.fillStyle = `rgba(200,210,255,${twinkle})`;
        ctx.fillRect(s.x * width, s.y * height, s.r, s.r);
      }

      const projection = geoOrthographic()
        .translate([cx, cy])
        .scale(radius * cam.k)
        .rotate([-cam.lon, -cam.lat])
        .clipAngle(90)
        .precision(0.6);
      const path = geoPath(projection, ctx);

      if (now - sunUpdatedAt > 1000) {
        sun = subsolarPoint(new Date());
        sunUpdatedAt = now;
      }

      const r = radius * cam.k;
      // How much of the whole globe is on screen: 1 when fully visible, 0 when zoomed into a country.
      const wholeGlobe = Math.min(1, Math.max(0, 1.7 - cam.k));

      // Atmosphere halo outside the rim.
      const halo = ctx.createRadialGradient(cx, cy, r * 0.96, cx, cy, r * 1.16);
      halo.addColorStop(0, "rgba(64,190,255,0.5)");
      halo.addColorStop(0.35, "rgba(64,190,255,0.16)");
      halo.addColorStop(1, "rgba(64,190,255,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.16, 0, Math.PI * 2);
      ctx.fill();

      if (wholeGlobe > 0) drawOrbit("back", wholeGlobe, now);

      // Ocean, lit from the upper left.
      const ocean = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
      ocean.addColorStop(0, "#0c3168");
      ocean.addColorStop(1, "#020b22");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = ocean;
      ctx.fill();

      ctx.beginPath();
      path(geoGraticule10());
      ctx.strokeStyle = "rgba(120,210,255,0.08)";
      ctx.lineWidth = 0.6;
      ctx.stroke();

      if (world) {
        ctx.beginPath();
        path(world.land);
        ctx.fillStyle = "#1f80d0";
        ctx.fill();
        ctx.beginPath();
        path(world.borders);
        ctx.strokeStyle = "rgba(2,16,44,0.6)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
        ctx.beginPath();
        path(world.land);
        ctx.strokeStyle = "rgba(150,225,255,0.85)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }

      drawNight();

      // Edge darkening, then the glowing rim.
      const limb = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
      limb.addColorStop(0, "rgba(2,8,26,0)");
      limb.addColorStop(1, "rgba(2,8,26,0.55)");
      ctx.beginPath();
      path({ type: "Sphere" });
      ctx.fillStyle = limb;
      ctx.fill();
      ctx.save();
      ctx.shadowColor = "rgba(80,200,255,0.95)";
      ctx.shadowBlur = 26;
      ctx.strokeStyle = "rgba(110,215,255,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      if (wholeGlobe > 0) drawOrbit("front", wholeGlobe, now);

      /** Night side, a soft twilight edge, and the warm line where the sun is rising right now. */
      function drawNight() {
        const night: [number, number] = [sun[0] + 180, -sun[1]];
        for (const [radiusDeg, alpha] of [
          [96, 0.1],
          [90, 0.18],
          [84, 0.18],
        ] as const) {
          ctx.beginPath();
          path(geoCircle().center(night).radius(radiusDeg)());
          ctx.fillStyle = `rgba(1,4,16,${alpha})`;
          ctx.fill();
        }
        const line = { type: "LineString" as const, coordinates: dawnLine(sun) };
        ctx.save();
        ctx.beginPath();
        path(line);
        ctx.shadowColor = "#ff9a62";
        ctx.shadowBlur = 18;
        ctx.strokeStyle = "rgba(255,154,98,0.28)";
        ctx.lineWidth = 9;
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        path(line);
        ctx.strokeStyle = "rgba(255,210,122,0.85)";
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      /** A tilted orbit ring with a small satellite; the back half is drawn behind the globe. */
      function drawOrbit(half: "back" | "front", strength: number, time: number) {
        const rx = r * 1.38;
        const ry = r * 0.42;
        const tilt = -0.42;
        const [start, end] = half === "back" ? [Math.PI, Math.PI * 2] : [0, Math.PI];
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(tilt);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, start, end);
        ctx.setLineDash([2, 5]);
        ctx.strokeStyle = `rgba(140,220,255,${0.4 * strength})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
        const angle = reduced ? 1.9 : time / 1600;
        const onThisHalf = half === "back" ? Math.sin(angle) < 0 : Math.sin(angle) >= 0;
        if (onThisHalf) {
          ctx.shadowColor = "#8fe3ff";
          ctx.shadowBlur = 10;
          ctx.fillStyle = `rgba(220,245,255,${strength})`;
          ctx.beginPath();
          ctx.arc(rx * Math.cos(angle), ry * Math.sin(angle), 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      const current = sceneRef.current;
      if (current) drawScene(current, now);

      drawHud(cx, cy, cam, now);

      function drawScene(sceneToDraw: SceneDirective, time: number) {
        const holding = flightRef.current === null;
        const sinceHold = holding ? time - holdStartRef.current : 0;
        const pulse = reduced ? 1 : 0.65 + 0.35 * Math.sin(time / 420);

        for (const el of sceneToDraw.elements) {
          if (el.type === "highlight" && world) {
            const numeric = getCountry(el.country)?.isoNumeric;
            const shape = numeric ? world.countries.get(numeric) : undefined;
            if (!shape) continue;
            const color = TONES[el.tone];
            ctx.beginPath();
            path(shape);
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 16 * pulse;
            ctx.fillStyle = `${color}44`;
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.4;
            ctx.stroke();
          } else if (el.type === "area") {
            const color = TONES[el.tone];
            ctx.beginPath();
            path(
              geoCircle()
                .center(el.center)
                .radius(el.radiusKm / 111.32)(),
            );
            ctx.fillStyle = `${color}26`;
            ctx.fill();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

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
          ctx.setLineDash([7, 6]);
          ctx.lineDashOffset = el.animated && !reduced ? -time / 60 : 0;
          ctx.strokeStyle = ARC_COLOR;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
          drawArrowHead(projection, coordinates);
        }

        for (const el of sceneToDraw.elements) {
          if (el.type === "marker") drawMarker(projection, el.at, el.label, el.emphasis === "primary", time);
          else if (el.type === "timelineStep" && el.focus)
            drawMarker(projection, el.focus, `${el.order}. ${el.label}`, false, time);
        }
      }

      function drawArrowHead(proj: GeoProjection, coordinates: [number, number][]) {
        const a = coordinates.at(-2);
        const b = coordinates.at(-1);
        if (!a || !b) return;
        const pa = proj(a);
        const pb = proj(b);
        if (!pa || !pb) return;
        const angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        ctx.beginPath();
        ctx.moveTo(pb[0], pb[1]);
        ctx.lineTo(pb[0] - 10 * Math.cos(angle - 0.45), pb[1] - 10 * Math.sin(angle - 0.45));
        ctx.lineTo(pb[0] - 10 * Math.cos(angle + 0.45), pb[1] - 10 * Math.sin(angle + 0.45));
        ctx.closePath();
        ctx.fillStyle = ARC_COLOR;
        ctx.fill();
      }

      function drawMarker(
        proj: GeoProjection,
        at: readonly [number, number],
        text: string,
        primary: boolean,
        time: number,
      ) {
        if (geoDistance([at[0], at[1]], [cam.lon, cam.lat]) > 1.5) return; // behind the globe
        const p = proj([at[0], at[1]]);
        if (!p) return;
        const [x, y] = p;
        if (!reduced) {
          const phase = ((time / 1000) % 1.2) / 1.2;
          ctx.beginPath();
          ctx.arc(x, y, 5 + phase * (primary ? 26 : 16), 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,210,122,${0.85 * (1 - phase)})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(x, y, primary ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, primary ? 8 : 6, 0, Math.PI * 2);
        ctx.strokeStyle = TONES.focus;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.font = `600 ${primary ? 13 : 12}px ${font}`;
        const tw = ctx.measureText(text).width;
        const lx = x + 13;
        const ly = y - 10;
        ctx.fillStyle = "rgba(7,10,22,0.72)";
        ctx.beginPath();
        ctx.roundRect(lx - 6, ly - 2, tw + 12, 20, 10);
        ctx.fill();
        ctx.fillStyle = "#eef1fb";
        ctx.textBaseline = "top";
        ctx.fillText(text, lx, ly + 2);
      }

      function drawHud(x: number, y: number, c: GlobeCamera, time: number) {
        const spin = reduced ? 0 : time / 2200;
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = "rgba(120,210,255,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, 36, spin, spin + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `500 10px ui-monospace, "SF Mono", Consolas, monospace`;
        ctx.fillStyle = "rgba(190,200,240,0.7)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const ns = c.lat >= 0 ? "N" : "S";
        const ew = c.lon >= 0 ? "E" : "W";
        const lon = ((((c.lon + 180) % 360) + 360) % 360) - 180;
        ctx.fillText(
          `${Math.abs(c.lat).toFixed(2)}°${ns}  ${Math.abs(lon).toFixed(2)}°${ew}  ·  ${c.k.toFixed(1)}×`,
          x,
          y + 44,
        );
        ctx.textAlign = "left";
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
