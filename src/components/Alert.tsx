import type { ReactNode } from "react";

export type AlertTone = "danger" | "success" | "info";

export interface AlertProps {
  tone: AlertTone;
  title?: string;
  /** Rendered under the message - a Retry button, typically. */
  action?: ReactNode;
  children: ReactNode;
}

const GLYPH: Record<AlertTone, string> = {
  danger: "!",
  success: "✓",
  info: "i",
};

/**
 * `11-05`. Error, success and informational messages, with the live-region semantics derived from
 * the tone rather than left to each caller.
 *
 * `danger` gets `role="alert"` - the assertive live region every pre-`11-05` page already had on its
 * bare `<p role="alert">`, which this item's accessibility floor requires be preserved rather than
 * lost in the rewrite. `success`/`info` get `role="status"`: polite, because "Saved." interrupting
 * whatever a screen-reader user was reading is worse than it arriving a moment later. Hard-coding
 * this instead of exposing a `role` prop is deliberate - it makes the wrong pairing unavailable.
 *
 * The glyph is `aria-hidden`: the role and the text already carry the meaning.
 */
export function Alert({ tone, title, action, children }: AlertProps) {
  return (
    <div className={`ago-alert ago-alert--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="ago-alert__glyph" aria-hidden="true">
        {GLYPH[tone]}
      </span>
      <div className="ago-alert__body">
        {title && <span className="ago-alert__title">{title}</span>}
        <span>{children}</span>
        {action}
      </div>
    </div>
  );
}
