import type { LicenseId } from "../schema/image";

/** Raw license info as an image API reports it (Wikimedia extmetadata, Openverse, ...). */
export interface RawLicense {
  /** e.g. "CC BY-SA 4.0", "Public domain", "by-nc", "PD-USGov". */
  readonly name?: string | null | undefined;
  /** e.g. "https://creativecommons.org/licenses/by-sa/4.0/". */
  readonly url?: string | null | undefined;
}

const FORBIDDEN = /\b(nc|nd|non-?commercial|no-?deriv\w*|fair[\s-]?use|all rights reserved|copyrighted)\b/i;

function fromName(name: string): LicenseId | null {
  const n = name.trim().toLowerCase().replace(/_/g, " ");
  if (n === "") return null;
  if (FORBIDDEN.test(n)) return null;
  if (/^(cc0|cc-zero|cc zero)\b/.test(n)) return "cc0";
  if (/^(public domain|pd|pdm|pd-\S+)\b/.test(n) || n === "publicdomain") return "public-domain";
  if (/^(cc[\s-])?by[\s-]sa\b/.test(n)) return "cc-by-sa";
  if (/^(cc[\s-])?by\b(?![\s-]?(nc|nd))/.test(n)) return "cc-by";
  return null;
}

function fromUrl(url: string): LicenseId | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!/(^|\.)creativecommons\.org$/.test(parsed.hostname)) return null;
  const path = parsed.pathname.toLowerCase();
  if (path.startsWith("/publicdomain/zero/")) return "cc0";
  if (path.startsWith("/publicdomain/mark/")) return "public-domain";
  if (path.startsWith("/licenses/by-sa/")) return "cc-by-sa";
  if (path.startsWith("/licenses/by/")) return "cc-by";
  return null;
}

/**
 * Maps a provider's license info to an allowed license, or null to reject the image.
 * Rejects NC/ND, unknown and missing licenses, and cases where name and URL disagree.
 */
export function verifyLicense(raw: RawLicense): LicenseId | null {
  const name = raw.name?.trim() ?? "";
  const url = raw.url?.trim() ?? "";
  if (name === "" && url === "") return null;
  if (FORBIDDEN.test(name) || /-(nc|nd)\b|\/(by-nc|by-nd)/i.test(url)) return null;

  const byName = name === "" ? null : fromName(name);
  const byUrl = url === "" ? null : fromUrl(url);

  if (name !== "" && byName === null) return null;
  if (byName !== null && byUrl !== null && byName !== byUrl) return null;
  return byName ?? byUrl;
}
