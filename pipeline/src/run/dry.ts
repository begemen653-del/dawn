import { join } from "node:path";
import { getCountry, getRegion, REGION_IDS, type RegionId } from "@dawn/config";
import { SAMPLE_EVENTS, SAMPLE_LEARN, SAMPLE_PLAYLISTS } from "../../fixtures/sample-brief";
import {
  DayIndex,
  EventStore,
  Playlist,
  RunStatus,
  SCHEMA_VERSION,
  type DayIndex as DayIndexType,
} from "../schema";
import { writeJson } from "./write";

export interface DryRunOptions {
  /** Folder that receives latest/*.json and status.json. */
  readonly outDir: string;
  readonly now?: Date;
}

export interface DryRunResult {
  readonly status: RunStatus;
  readonly files: readonly string[];
}

/** Ids of the chapter files; scopes may be region ids or ISO2 codes. */
export function playlistFile(scope: string): string {
  return `playlists/${scope}.json`;
}

function scopeTitle(scope: string): string {
  if ((REGION_IDS as readonly string[]).includes(scope)) return getRegion(scope as RegionId).name;
  return getCountry(scope)?.name ?? scope;
}

function berlinDate(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);
}

/**
 * Writes a complete brief from sample fixtures, without any network or AI calls.
 * Lets the app and the Actions workflow be tested end to end before real ingestion exists.
 */
export async function runDry({ outDir, now = new Date() }: DryRunOptions): Promise<DryRunResult> {
  const startedAt = now.toISOString();
  const date = berlinDate(now);
  const latest = join(outDir, "latest");
  const files: string[] = [];

  await writeJson(join(latest, "events.json"), EventStore, {
    schemaVersion: SCHEMA_VERSION,
    date,
    generatedAt: startedAt,
    events: SAMPLE_EVENTS,
  });
  files.push("latest/events.json");

  const scopes: DayIndexType["scopes"] = [];
  for (const [scope, eventIds] of Object.entries(SAMPLE_PLAYLISTS)) {
    const file = playlistFile(scope);
    await writeJson(join(latest, file), Playlist, {
      schemaVersion: SCHEMA_VERSION,
      date,
      scope,
      title: scopeTitle(scope),
      eventIds: [...eventIds],
    });
    files.push(`latest/${file}`);
    scopes.push({ scope, file, count: eventIds.length });
  }

  await writeJson(join(latest, "index.json"), DayIndex, {
    schemaVersion: SCHEMA_VERSION,
    date,
    generatedAt: startedAt,
    sample: true,
    scopes,
    learn: SAMPLE_LEARN,
  });
  files.push("latest/index.json");

  const status: RunStatus = {
    schemaVersion: SCHEMA_VERSION,
    ok: true,
    mode: "dry",
    date,
    startedAt,
    finishedAt: new Date().toISOString(),
    counts: { articles: 0, events: SAMPLE_EVENTS.length, playlists: scopes.length },
    warnings: ["Dry run: sample data only, no real news fetched."],
    errors: [],
  };
  await writeJson(join(outDir, "status.json"), RunStatus, status);
  files.push("status.json");

  return { status, files };
}
