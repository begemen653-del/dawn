export interface ProgressBarProps {
  /** Number of steps in the brief. */
  readonly segments: number;
  /** Index of the step showing now. */
  readonly active: number;
  /** 0–1 progress through the active step. */
  readonly progress: number;
  readonly label: string;
}

/** Thin segmented progress bar at the top of the brief. */
export function ProgressBar({ segments, active, progress, label }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={segments}
      aria-valuenow={active + 1}
      aria-valuetext={`Story ${active + 1} of ${segments}`}
      className="flex w-full gap-1"
    >
      {Array.from({ length: segments }, (_, i) => {
        const fill = i < active ? 1 : i === active ? progress : 0;
        return (
          <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/15">
            <div
              className="h-full origin-left rounded-full bg-ink transition-transform duration-300"
              style={{ transform: `scaleX(${fill})` }}
            />
          </div>
        );
      })}
    </div>
  );
}
