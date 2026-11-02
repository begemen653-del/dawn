import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-sm">
        <h1 className="font-serif text-2xl font-medium">You&apos;re offline</h1>
        <p className="mt-2 text-ink-muted">
          Dawn needs a connection the first time it opens. After that, your latest brief stays available
          offline.
        </p>
      </div>
    </main>
  );
}
