export interface ProgressBarProps {
  /** Number of stories in the chapter. */
  readonly segments: number;
  /** Index of the story playing now. */
  readonly active: number;
  /** 0–1 progress through the active story. */
  readonly progress: number;
  readonly label: string;
}

/** Story-style segmented progress bar shown at the top of the brief. */
export function ProgressBar({ segments, active, progress, label }: ProgressBarProps) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={segments}
      aria-valuenow={active + 1}
      aria-valuetext={`Story ${active + 1} of ${segments}`}
      className="flex w-full gap-1.5"
    >
      {Array.from({ length: segments }, (_, i) => {
        const fill = i < active ? 1 : i === active ? progress : 0;
        return (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="bg-gradient-dawn h-full origin-left rounded-full transition-transform duration-300"
              style={{ transform: `scaleX(${fill})` }}
            />
          </div>
        );
      })}
    </div>
  );
}
