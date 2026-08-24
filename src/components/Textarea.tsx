import type { TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

/**
 * `11-05`. One of the eleven.
 *
 * No screen retrofitted by this item uses it yet, and that is deliberate rather than an oversight:
 * the only multi-line-shaped field in the console today is `ConversationPage`'s message composer,
 * which is an `<input>` inside a `<form>`, so Enter submits it. Swapping it for a textarea would
 * change what Enter does - a behaviour change, and this item is explicitly a presentation-only
 * retrofit. `11-06` redesigns that composer and is where the swap belongs.
 */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  const classes = ["ago-control", "ago-control--textarea", className].filter(Boolean).join(" ");

  return <textarea className={classes} aria-invalid={invalid ? true : undefined} {...rest} />;
}
