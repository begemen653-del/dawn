import type { Region, RegionId } from "./types";

export const REGIONS: readonly Region[] = [
  {
    id: "global",
    name: "Global",
    tier: 1,
    camera: { lng: 15, lat: 20, zoom: 1.2 },
    blurb: "The biggest stories on Earth today",
  },
  {
    id: "europe",
    name: "Europe",
    tier: 1,
    camera: { lng: 14, lat: 50, zoom: 3 },
    blurb: "From the Atlantic to the Urals",
  },
  {
    id: "asia",
    name: "Asia",
    tier: 1,
    camera: { lng: 100, lat: 30, zoom: 2.2 },
    blurb: "East, South, Southeast and Central Asia",
  },
  {
    id: "north-america",
    name: "North America",
    tier: 1,
    camera: { lng: -98, lat: 38, zoom: 2.4 },
    blurb: "USA, Canada, Mexico, Central America, Caribbean",
  },
  {
    id: "south-america",
    name: "South America",
    tier: 2,
    camera: { lng: -60, lat: -18, zoom: 2.4 },
    blurb: "From Colombia to Tierra del Fuego",
  },
  {
    id: "middle-east",
    name: "Middle East",
    tier: 2,
    camera: { lng: 45, lat: 28, zoom: 3.2 },
    blurb: "The Gulf, the Levant, Iran and Egypt",
  },
  {
    id: "africa",
    name: "Africa",
    tier: 2,
    camera: { lng: 20, lat: 3, zoom: 2.3 },
    blurb: "All 54 countries of the continent",
  },
  {
    id: "oceania",
    name: "Oceania",
    tier: 2,
    camera: { lng: 150, lat: -22, zoom: 2.6 },
    blurb: "Australia, New Zealand and the Pacific",
  },
];

const byId = new Map<RegionId, Region>(REGIONS.map((r) => [r.id, r]));

export function getRegion(id: RegionId): Region {
  const region = byId.get(id);
  if (!region) throw new Error(`Unknown region: ${id}`);
  return region;
}
