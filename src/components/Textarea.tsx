import type { RefAttributes, TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, RefAttributes<HTMLTextAreaElement> {
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
 *
 * `11-06` is that item, and `Composer` is the consumer `adr/0030` said was coming. The only change
 * needed to adopt it was declaring `ref` in the props type: React 19 passes `ref` to a function
 * component as an ordinary prop, so the existing `{...rest}` spread already forwards it to the real
 * `<textarea>` - `RefAttributes` just makes TypeScript agree, without a `forwardRef` wrapper the
 * runtime no longer needs. The composer's auto-grow needs the element to measure its own
 * `scrollHeight`, which is the sort of thing a thin wrapper over a native element must not get in
 * the way of.
 */
export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  const classes = ["ago-control", "ago-control--textarea", className].filter(Boolean).join(" ");

  return <textarea className={classes} aria-invalid={invalid ? true : undefined} {...rest} />;
}
