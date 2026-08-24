import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

/**
 * `11-05`. One of the eleven components the item closes the set at (`adr/0030`).
 *
 * Wraps a real `<button>` and spreads the rest of its props onto it rather than re-declaring them,
 * so `disabled`, `type`, `onClick`, `aria-*` and everything else keep working exactly as the DOM
 * defines them - the reason `11-02`'s and `5-08`'s existing pages can adopt this without any change
 * to their behaviour. `type` defaults to `"button"` on purpose: an un-typed `<button>` inside a
 * `<form>` submits it, which is the single most common accidental behaviour change a styling
 * retrofit introduces, and `ConversationPage`'s composer has exactly that shape (a form with both a
 * submit and non-submit buttons in it).
 */
export function Button({ variant = "secondary", size = "md", className, type, children, ...rest }: ButtonProps) {
  const classes = ["ago-btn", `ago-btn--${variant}`, `ago-btn--${size}`, className].filter(Boolean).join(" ");

  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
}
