import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/**
 * The MapLibre globe's look: free OpenFreeMap vector tiles (OpenStreetMap data via OpenMapTiles,
 * no key, no request limit; attribution required) drawn in Dawn's quiet greyscale. Only what
 * helps place a story is shown: land, water, borders, a few roads up close, and place names.
 */
export const TILES_URL = "https://tiles.openfreemap.org/planet";
export const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>';

const LAND = "#252e3a";
const WATER = "#0f161f";
const BORDER = "rgba(160,172,188,0.55)";
const INK = "#c9d0d8";
const INK_MUTED = "#8f99a5";
const HALO = "rgba(12,16,22,0.9)";

const REGULAR = ["Noto Sans Regular"];
const BOLD = ["Noto Sans Bold"];

/** English names first, local names as fallback. */
const NAME: ExpressionSpecification = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name"]];

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    glyphs: GLYPHS_URL,
    sources: {
      osm: { type: "vector", url: TILES_URL, attribution: ATTRIBUTION },
    },
    // A thin halo around the planet that fades out as the camera comes down.
    sky: {
      "sky-color": "#0f141b",
      "horizon-color": "#1c2633",
      "fog-color": "#0f141b",
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 4, 0.35, 7, 0],
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": LAND } },
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": WATER, "fill-antialias": false },
      },
      {
        id: "towns",
        type: "fill",
        source: "osm",
        "source-layer": "landuse",
        minzoom: 8,
        filter: ["match", ["get", "class"], ["residential", "suburb", "neighbourhood"], true, false],
        paint: { "fill-color": "#2c3644", "fill-opacity": 0.7 },
      },
      {
        id: "roads",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 6,
        filter: ["match", ["get", "class"], ["motorway", "trunk", "primary"], true, false],
        paint: {
          "line-color": "#3b4757",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 10, 1.4, 14, 3],
        },
      },
      {
        id: "borders-inner",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        minzoom: 4,
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": "rgba(160,172,188,0.28)", "line-width": 0.6, "line-dasharray": [3, 2] },
      },
      {
        id: "borders",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": BORDER,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 5, 1, 10, 1.6],
          "line-dasharray": [
            "case",
            ["==", ["get", "disputed"], 1],
            ["literal", [2, 2]],
            ["literal", [1, 0]],
          ],
        },
      },
    ],
  };
}

/** Place names go above the story's own layers, so highlights never hide them. */
export const LABEL_LAYERS: StyleSpecification["layers"] = [
  {
    id: "labels-towns",
    type: "symbol",
    source: "osm",
    "source-layer": "place",
    minzoom: 7,
    filter: ["match", ["get", "class"], ["town", "village", "suburb"], true, false],
    layout: { "text-field": NAME, "text-font": REGULAR, "text-size": 11, "text-max-width": 8 },
    paint: { "text-color": INK_MUTED, "text-halo-color": HALO, "text-halo-width": 1.2 },
  },
  {
    id: "labels-cities",
    type: "symbol",
    source: "osm",
    "source-layer": "place",
    minzoom: 3,
    filter: ["==", ["get", "class"], "city"],
    layout: {
      "text-field": NAME,
      "text-font": REGULAR,
      "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 8, 13],
      "text-max-width": 8,
      "symbol-sort-key": ["get", "rank"],
    },
    paint: { "text-color": INK, "text-halo-color": HALO, "text-halo-width": 1.2 },
  },
  {
    id: "labels-states",
    type: "symbol",
    source: "osm",
    "source-layer": "place",
    minzoom: 4.5,
    maxzoom: 8,
    filter: ["==", ["get", "class"], "state"],
    layout: {
      "text-field": NAME,
      "text-font": REGULAR,
      "text-size": 10,
      "text-transform": "uppercase",
      "text-letter-spacing": 0.12,
      "text-max-width": 8,
    },
    paint: { "text-color": INK_MUTED, "text-halo-color": HALO, "text-halo-width": 1 },
  },
  {
    id: "labels-countries",
    type: "symbol",
    source: "osm",
    "source-layer": "place",
    maxzoom: 9,
    filter: ["==", ["get", "class"], "country"],
    layout: {
      "text-field": NAME,
      "text-font": BOLD,
      "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 14],
      "text-max-width": 7,
      "symbol-sort-key": ["get", "rank"],
    },
    paint: { "text-color": INK, "text-halo-color": HALO, "text-halo-width": 1.4 },
  },
];
