"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "./preferences";

/** Loads saved preferences after the first render; returns true once they are ready. */
export function usePreferencesHydration(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void Promise.resolve(usePreferences.persist.rehydrate()).finally(() => {
      setHydrated(true);
    });
  }, []);
  return hydrated;
}
