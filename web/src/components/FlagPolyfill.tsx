"use client";

import { polyfillCountryFlagEmojis } from "country-flag-emoji-polyfill";
import { useEffect } from "react";

/**
 * Windows doesn't draw flag emojis (it shows "DE" instead of 🇩🇪).
 * Where needed, this loads a small self-hosted flag font (Twemoji, CC BY 4.0).
 */
export function FlagPolyfill() {
  useEffect(() => {
    polyfillCountryFlagEmojis("Twemoji Country Flags", "/fonts/TwemojiCountryFlags.woff2");
  }, []);
  return null;
}
