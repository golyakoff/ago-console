import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Renders the error border and sets `aria-invalid`. The *message* is `Field`'s job - colour on
   * its own never carries meaning (WCAG 1.4.1), so an invalid control without accompanying error
   * text is a bug in the caller, not something this component can fix. */
  invalid?: boolean;
}

/** `11-05`. See `Button` for why the set spreads native props rather than re-declaring them. */
export function Input({ invalid, className, type, ...rest }: InputProps) {
  const classes = ["ago-control", type === "file" && "ago-control--file", className].filter(Boolean).join(" ");

  return <input type={type} className={classes} aria-invalid={invalid ? true : undefined} {...rest} />;
}
