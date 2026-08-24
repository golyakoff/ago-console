import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "accent" | "success" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  /** A leading dot. On `success` it is the landing page's own live-dot, halo included. Decorative
   * only - the badge always carries the word too, so the dot never has to be understood alone. */
  dot?: boolean;
  /** Renders in JetBrains Mono - for values that are literally identifiers (a truncated visitor id,
   * a sequence number, a hex colour), which is the only role the item gives the mono family. */
  mono?: boolean;
  children: ReactNode;
}

/** `11-05`. One of the eleven. */
export function Badge({ tone = "neutral", dot = false, mono = false, children }: BadgeProps) {
  const classes = ["ago-badge", `ago-badge--${tone}`, mono && "ago-badge--mono"].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {dot && <span className="ago-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
