/**
 * `11-05`. The loading pair - counted as one entry on the item's closed list of eleven, because they
 * are one decision expressed two ways: `Skeleton` when the shape of what is coming is already known
 * (a list, a table, a form), `Spinner` when it is not (a whole page still resolving, an in-flight
 * submit).
 *
 * Both are announced, not just drawn. A silent animation tells a screen-reader user nothing, which
 * is how "Loading…" as literal text - the thing this replaces - was accidentally more accessible
 * than most spinners. The text stays; it is the visual that got better.
 */

export interface SpinnerProps {
  /** The announced and (by default) visible label. */
  label?: string;
  /** Hides the label visually while keeping it for assistive technology - for a spinner inside a
   * control that already says what it is doing. */
  labelHidden?: boolean;
}

export function Spinner({ label = "Loading…", labelHidden = false }: SpinnerProps) {
  return (
    <span className="ago-spinner-row" role="status">
      <span className="ago-spinner" aria-hidden="true" />
      <span className={labelHidden ? "ago-visually-hidden" : undefined}>{label}</span>
    </span>
  );
}

export interface SkeletonProps {
  /** How many placeholder rows to draw - match it to the shape actually being loaded so the layout
   * does not jump when the real content arrives. */
  lines?: number;
  /** The announced label. A skeleton without one is a decorative smear as far as a screen reader is
   * concerned. */
  label?: string;
}

export function Skeleton({ lines = 3, label = "Loading…" }: SkeletonProps) {
  return (
    <div className="ago-skeleton-stack" role="status" aria-busy="true">
      <span className="ago-visually-hidden">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="ago-skeleton"
          aria-hidden="true"
          // Uneven widths so a stack of placeholders reads as text rather than as a table of bars.
          style={{ width: index % 3 === 2 ? "62%" : index % 3 === 1 ? "84%" : "100%" }}
        />
      ))}
    </div>
  );
}
