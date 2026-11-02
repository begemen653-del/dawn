import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="glass max-w-sm rounded-[var(--radius-card)] p-6">
        <h1 className="text-gradient-dawn font-display text-2xl font-bold">You&apos;re offline</h1>
        <p className="mt-2 text-ink-muted">
          Dawn needs a connection the first time. After that, your latest brief stays available offline.
        </p>
      </div>
    </main>
  );
}
