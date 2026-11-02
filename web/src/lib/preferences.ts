"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { moveScope, normalizeSelection, toggleScope, type Scope } from "./selection";

interface PreferencesState {
  /** Chosen regions/countries in play order (Global is implied and always last). */
  readonly selection: readonly Scope[];
  /** False until the user finished the first-run "Choose your news" step. */
  readonly onboarded: boolean;
  toggle: (scope: Scope) => void;
  move: (from: number, to: number) => void;
  /** Replaces the order after a drag; ignores anything that isn't a reordering. */
  reorder: (next: readonly Scope[]) => void;
  completeOnboarding: () => void;
}

/** Storage that never throws (private windows and blocked storage just don't persist). */
function safeLocalStorage(): Storage | undefined {
  try {
    const probe = "__dawn_probe__";
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * User preferences, stored on this device only (no accounts, nothing sent anywhere).
 * Hydration is manual (see usePreferencesHydration) so the static HTML renders identically.
 */
export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      selection: [],
      onboarded: false,
      toggle: (scope) => {
        set((s) => ({ selection: toggleScope(s.selection, scope) }));
      },
      move: (from, to) => {
        set((s) => ({ selection: moveScope(s.selection, from, to) }));
      },
      reorder: (next) => {
        set((s) => {
          const same = next.length === s.selection.length && next.every((x) => s.selection.includes(x));
          return same ? { selection: [...next] } : {};
        });
      },
      completeOnboarding: () => {
        set({ onboarded: true });
      },
    }),
    {
      name: "dawn.preferences",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage() ?? sessionStorageFallback),
      skipHydration: true,
      partialize: (s) => ({ selection: s.selection, onboarded: s.onboarded }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PreferencesState>;
        return {
          ...current,
          selection: normalizeSelection(p.selection),
          onboarded: p.onboarded === true,
        };
      },
    },
  ),
);

/** In-memory stand-in when localStorage is unavailable. */
const memory = new Map<string, string>();
const sessionStorageFallback: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => {
    memory.set(k, v);
  },
  removeItem: (k) => {
    memory.delete(k);
  },
};
