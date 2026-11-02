/**
 * Stand-in for the MapLibre globe (Milestone 6): a lit sphere with a slowly drifting texture.
 * Pure CSS, so it costs nothing on phones.
 */
export function GlobePlaceholder({ label }: { readonly label: string }) {
  return (
    <div className="relative grid place-items-center" role="img" aria-label={label}>
      <div className="absolute size-[min(70vw,30rem)] rounded-full bg-dawn-rose/10 blur-3xl" aria-hidden />
      <div
        aria-hidden
        className="relative size-[min(62vw,26rem)] animate-globe-spin rounded-full shadow-[inset_-30px_-20px_60px_rgb(0_0_0/0.75),inset_10px_10px_40px_rgb(255_210_122/0.15),0_0_80px_-10px_rgb(139_123_255/0.45)]"
        style={{
          backgroundColor: "#0b1530",
          backgroundImage:
            "repeating-linear-gradient(90deg, rgb(139 123 255 / 0.12) 0 1px, transparent 1px 8%), repeating-linear-gradient(0deg, rgb(139 123 255 / 0.1) 0 1px, transparent 1px 12.5%), radial-gradient(circle at 30% 30%, rgb(108 198 255 / 0.25), transparent 60%)",
          backgroundSize: "200% 100%, 100% 100%, 100% 100%",
        }}
      />
      <div className="absolute size-[min(62vw,26rem)] rounded-full ring-1 ring-dawn-violet/30" aria-hidden />
    </div>
  );
}
