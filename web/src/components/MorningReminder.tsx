"use client";

import { useEffect } from "react";

/** Daily reminder time (phone's local time). */
export const REMINDER = { hour: 6, minute: 30 } as const;
const REMINDER_ID = 630;

/**
 * In the Android app only: a quiet daily notification at 06:30 that the morning brief is waiting.
 * It is scheduled on the phone itself (no server, no account, works offline). Re-scheduling on
 * every start keeps it in place after updates; in a normal browser this does nothing.
 */
export function MorningReminder() {
  useEffect(() => {
    void (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      let { display } = await LocalNotifications.checkPermissions();
      if (display === "prompt" || display === "prompt-with-rationale")
        ({ display } = await LocalNotifications.requestPermissions());
      if (display !== "granted") return;
      await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
      await LocalNotifications.schedule({
        notifications: [
          {
            id: REMINDER_ID,
            title: "Your morning brief",
            body: "What happened in the world overnight, in two or three minutes.",
            schedule: { on: REMINDER, allowWhileIdle: true },
          },
        ],
      });
    })().catch(() => {
      // A reminder is a nice-to-have: never let it break the app.
    });
  }, []);
  return null;
}
