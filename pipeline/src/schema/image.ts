import { z } from "zod";
import { HttpUrl } from "./common";

/** The only licenses Dawn may show. NC, ND and unknown licenses are rejected. */
export const ALLOWED_LICENSES = ["public-domain", "cc0", "cc-by", "cc-by-sa"] as const;
export const LicenseId = z.enum(ALLOWED_LICENSES);
export type LicenseId = z.infer<typeof LicenseId>;

export const IMAGE_PROVIDERS = [
  "wikimedia-commons",
  "openverse",
  "nasa",
  "nasa-gibs",
  "copernicus",
  "us-gov",
  "eu-parliament",
  "eu-commission",
  "ai",
  "map",
] as const;

export const ImageAsset = z.strictObject({
  id: z.string().min(1),
  kind: z.enum(["photo", "satellite", "ai-illustration", "map"]),
  /** Provider-recommended thumbnail URL (hotlinked, never re-hosted). */
  thumbUrl: HttpUrl,
  /** Page describing the file and its license. */
  sourceUrl: HttpUrl,
  provider: z.enum(IMAGE_PROVIDERS),
  author: z.string().min(1).max(200),
  license: z.strictObject({
    id: LicenseId,
    /** Exact name as published, e.g. "CC BY-SA 4.0". */
    name: z.string().min(1).max(60),
    url: HttpUrl.optional(),
  }),
  alt: z.string().min(1).max(200),
  /** True unless metadata proves the image shows this exact event. */
  illustrative: z.boolean(),
});
export type ImageAsset = z.infer<typeof ImageAsset>;
