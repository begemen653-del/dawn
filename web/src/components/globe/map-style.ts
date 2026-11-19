import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

/**
 * The MapLibre globe's look: free OpenFreeMap vector tiles (OpenStreetMap data via OpenMapTiles,
 * no key, no request limit; attribution required) drawn in Dawn's quiet greyscale. Only what
 * helps place a story is shown: land, water, borders, a few roads up close, and place names.
 */
export const TILES_URL = "https://tiles.openfreemap.org/planet";
/**
 * Elevation for relief shading and 3D terrain: the free "Terrain Tiles" open dataset on AWS (no key,
 * no request limit; attribution to its sources required).
 */
export const DEM_URL = "https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png";
const DEM_ATTRIBUTION =
  '<a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noreferrer">Terrain: Mapzen, AWS (SRTM, GMTED, ETOPO1 …)</a>';
export const GLYPHS_URL = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>';

/** Below this zoom, names and borders come from the app's own data; from here on, from the map tiles. */
export const NAMES_UNTIL = 5.5;

const LAND = "#252e3a";
/** Zoomed out, land is a little lighter so continents stand out on the dark sea. */
const LAND_FAR = "#34404f";
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
      // Built-in world shapes (Natural Earth 1:50m, filled in by MapGlobe once loaded). They are on
      // the phone already, so the zoomed-out globe always shows continents and borders, even while
      // the camera flies faster than map tiles can download.
      base: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
      // Elevation tiles for the relief shading (low detail is enough for shading; fewer downloads).
      relief: {
        type: "raster-dem",
        tiles: [DEM_URL],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 9,
        attribution: DEM_ATTRIBUTION,
      },
      // Built-in place names (filled in by MapGlobe): always there when zoomed out, no download needed.
      names: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    },
    // A thin halo around the planet that fades out as the camera comes down.
    sky: {
      "sky-color": "#0f141b",
      "horizon-color": "#1c2633",
      "fog-color": "#0f141b",
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 4, 0.35, 7, 0],
    },
    layers: [
      // Zoomed out, the sea is the background and land comes from the built-in shapes; close up,
      // the tiles take over (land as background, the tiles' own detailed water on top).
      {
        id: "land",
        type: "background",
        paint: { "background-color": ["interpolate", ["linear"], ["zoom"], 5, WATER, 6, LAND] },
      },
      {
        id: "base-land",
        type: "fill",
        source: "base",
        maxzoom: 7,
        paint: {
          "fill-color": ["interpolate", ["linear"], ["zoom"], 2, LAND_FAR, 5, LAND],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 1, 6.5, 0],
          "fill-antialias": true,
        },
      },
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        filter: ["!=", ["get", "brunnel"], "tunnel"],
        paint: { "fill-color": WATER, "fill-antialias": false },
      },
      // Relief shading: light from the north-west, so mountains, valleys and coasts have depth.
      {
        id: "relief",
        type: "hillshade",
        source: "relief",
        paint: {
          "hillshade-illumination-anchor": "map",
          "hillshade-illumination-direction": 315,
          "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 1, 0.55, 6, 0.45, 10, 0.35],
          "hillshade-shadow-color": "#05080c",
          "hillshade-highlight-color": "#6a7788",
          "hillshade-accent-color": "#121820",
        },
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
      // Country borders: built-in ones while zoomed out (always there), the tiles' exact ones close up.
      {
        id: "base-borders",
        type: "line",
        source: "base",
        maxzoom: 6.5,
        paint: {
          "line-color": BORDER,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 5, 0.9],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 1, 6.5, 0],
        },
      },
      {
        id: "borders",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        minzoom: NAMES_UNTIL,
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: {
          "line-color": BORDER,
          "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.5, 5, 1, 10, 1.6],
          "line-opacity": ["interpolate", ["linear"], ["zoom"], NAMES_UNTIL, 0, 6.5, 1],
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

/** Built-in names: countries and ~2,400 cities, bigger ones first, more as the camera comes down. */
const BUILT_IN_NAMES: StyleSpecification["layers"] = [
  ...(
    [
      [0, 1, 1.5, 12],
      [2, 3, 3, 11],
      [4, 6, 4.3, 10.5],
    ] as const
  ).map(
    ([fromRank, toRank, minzoom, size]) =>
      ({
        id: `names-cities-${fromRank}`,
        type: "symbol",
        source: "names",
        minzoom,
        maxzoom: NAMES_UNTIL,
        filter: [
          "all",
          ["==", ["get", "kind"], "city"],
          [">=", ["get", "rank"], fromRank],
          ["<=", ["get", "rank"], toRank],
        ],
        layout: {
          "text-field": ["get", "name"],
          "text-font": REGULAR,
          "text-size": size,
          "text-anchor": "left",
          "text-offset": [0.5, 0],
          "symbol-sort-key": ["get", "rank"],
        },
        paint: { "text-color": INK, "text-halo-color": HALO, "text-halo-width": 1.2 },
      }) satisfies StyleSpecification["layers"][number],
  ),
  {
    id: "names-city-dots",
    type: "circle",
    source: "names",
    minzoom: 1.5,
    maxzoom: NAMES_UNTIL,
    filter: ["all", ["==", ["get", "kind"], "city"], ["<=", ["get", "rank"], 1]],
    paint: { "circle-radius": 1.6, "circle-color": INK_MUTED },
  },
  {
    id: "names-countries",
    type: "symbol",
    source: "names",
    maxzoom: NAMES_UNTIL,
    filter: ["==", ["get", "kind"], "country"],
    layout: {
      "text-field": ["get", "name"],
      "text-font": BOLD,
      "text-size": ["interpolate", ["linear"], ["zoom"], 1, 10, 5, 13],
      "text-max-width": 7,
      // Big countries (seen from far away) win when names would overlap.
      "symbol-sort-key": ["get", "rank"],
    },
    paint: { "text-color": INK, "text-halo-color": HALO, "text-halo-width": 1.4 },
  },
];

/** Place names go above the story's own layers, so highlights never hide them. */
export const LABEL_LAYERS: StyleSpecification["layers"] = [
  ...BUILT_IN_NAMES,
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
    // Zoomed further out, the built-in names below are used instead (they need no download).
    minzoom: NAMES_UNTIL,
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
    minzoom: NAMES_UNTIL,
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
    minzoom: NAMES_UNTIL,
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
