import { useLayoutEffect, useRef, type ChangeEvent, type InputHTMLAttributes, type SyntheticEvent } from "react";
import {
  digitCountForMaskedOffset,
  isExplicitNonRussianPhoneValue,
  maskRuNational,
  maskedOffsetForDigitCount,
  nextRuPhoneEdit,
  ruNationalDigits,
} from "./phoneFormat.js";

export interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Same meaning as `Input`'s own `invalid` - forwarded to the native control for `aria-invalid`
   * and also used here to redden this wrapper's own border, since the native control's border is
   * suppressed (see this file's own remarks below on why). */
  invalid?: boolean;
}

/**
 * `25-186`/`26-326`: Russia is the only country any phone field on this platform serves - see
 * `phoneFormat.ts`'s own header for the "why hand-rolled" reasoning, unchanged since `25-186`.
 *
 * **`26-326`: rewritten to mirror `ago-android`'s `RuPhoneField.kt` byte-for-byte** (`26-325`'s own
 * canonical spec) - both the shape of the mask and, now, where the country code lives. The pre-26-326
 * version rendered only `(9XX) XXX-XX-XX` inside the control and a separate, non-interactive `🇷🇺 +7`
 * chip beside it. Android's field never had that split: `+7` is fixed, non-deletable, *inside* the one
 * masked control (`phoneFormat.ts`'s `maskRuNational`) - so the chip is gone, and this component now
 * renders the mask itself rather than delegating to the plain `Input` wrapper it used to. `value`/
 * `onChange` carry the canonical form described in `phoneFormat.ts` (blank, or `+7` + up to 10 national
 * digits) - a caller's own state is therefore already what a search/submit/save call sends the server,
 * exactly the guarantee `RuPhoneField.kt`'s own doc comment makes for Android's callers.
 *
 * **Not built on `Input`.** `Input.tsx` is a plain function component with no forwarded ref, and this
 * component needs a real ref to the native `<input>` to restore the caret after each keystroke
 * (`useLayoutEffect` below) - something `Input` cannot give it without changing that shared component
 * for every one of its other callers, which is out of this item's scope. The native element this
 * renders carries the identical `ago-control`/`aria-invalid` treatment `Input` itself applies, so it
 * looks and behaves like any other field; only the ref plumbing differs.
 *
 * **Caret math, ported rather than reused verbatim.** Compose's `RuPhoneField` gives its `TextField` a
 * plain digit string as the underlying value and layers the mask on purely for display, so its own
 * `OffsetMapping` only ever translates digit-index to masked-string-index. This control's real DOM
 * value *is* the masked string, so the browser applies each keystroke or paste directly to masked text -
 * `phoneFormat.ts`'s `nextRuPhoneEdit` is the one function that bridges that difference; see its own
 * doc comment. `maskedOffsetForDigitCount`/`digitCountForMaskedOffset` are still the same two Android
 * functions, used here for the reverse direction: snapping a caret a click or arrow-key landed inside
 * punctuation forward to the next digit slot (`handleSelect` below).
 *
 * **The `25-209` foreign-passthrough escape hatch is unchanged in spirit**, and still inferred from
 * `value`'s own shape rather than a separate prop - `phoneFormat.ts`'s `isExplicitNonRussianPhoneValue`.
 * A value that already carries an explicit, non-`+7` country code is rendered and edited completely
 * unmasked: this component becomes a plain `<input type="tel">` for as long as that holds, exactly
 * `PhoneInput`'s own pre-26-326 behaviour for that case (only the RU-shaped branch changed).
 */
export function PhoneInput({ invalid, className, value, onChange, ...rest }: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // The masked-string offset the caret should land at once the DOM re-renders with the next `value` -
  // set synchronously inside `handleChange`, applied in the `useLayoutEffect` below because React's own
  // controlled re-render (which happens after this handler returns) is what actually moves the caret to
  // the end otherwise. `null` means "let the browser keep wherever it already put the caret" - the
  // foreign-passthrough branch's own case, since that text is never rewritten out from under the operator.
  const pendingCaretRef = useRef<number | null>(null);

  const stringValue = typeof value === "string" ? value : "";
  const foreignMode = isExplicitNonRussianPhoneValue(stringValue);
  const displayValue = foreignMode ? stringValue : maskRuNational(ruNationalDigits(stringValue));

  useLayoutEffect(() => {
    const caret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    if (caret !== null && inputRef.current !== null) {
      inputRef.current.setSelectionRange(caret, caret);
    }
  }, [displayValue]);

  const wrapperClasses = ["ago-phone-input", invalid && "ago-phone-input--invalid", className].filter(Boolean).join(" ");

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;

    if (isExplicitNonRussianPhoneValue(raw)) {
      // The escape hatch just engaged (or was already engaged) - forward the operator's own text
      // verbatim, unmasked, and let the browser keep its own caret since nothing here rewrites the value.
      onChange?.(event);
      return;
    }

    const caret = event.target.selectionStart ?? raw.length;
    const { canonical, maskedOffset } = nextRuPhoneEdit(raw, caret);
    pendingCaretRef.current = maskedOffset;
    // Rewrites the event's own `target.value` from the raw, mask-punctuation-included text the browser
    // just produced to the canonical value this component's callers actually store - the same event
    // object is forwarded on, so `onChange`'s usual `(e) => setX(e.target.value)` shape needs no change
    // at any of this component's call sites.
    event.target.value = canonical;
    onChange?.(event);
  };

  // Snaps a caret that a click, or arrow-key navigation, landed inside the mask's own punctuation
  // forward to the next digit slot - `phoneFormat.ts`'s `digitCountForMaskedOffset`/
  // `maskedOffsetForDigitCount`, the reverse direction from `handleChange`'s own use of the latter.
  // Left alone for a real range selection (`selectionStart !== selectionEnd`) and in foreign-passthrough
  // mode, where there is no mask shape to snap to.
  const handleSelect = (event: SyntheticEvent<HTMLInputElement>) => {
    if (foreignMode) {
      return;
    }
    const el = event.currentTarget;
    if (el.selectionStart === null || el.selectionStart !== el.selectionEnd) {
      return;
    }
    const totalDigits = ruNationalDigits(stringValue).length;
    const digitIndex = digitCountForMaskedOffset(el.selectionStart, totalDigits);
    const snapped = maskedOffsetForDigitCount(digitIndex);
    if (snapped !== el.selectionStart) {
      el.setSelectionRange(snapped, snapped);
    }
  };

  return (
    <div className={wrapperClasses}>
      <input
        {...rest}
        ref={inputRef}
        type="tel"
        className="ago-control"
        aria-invalid={invalid ? true : undefined}
        value={displayValue}
        onChange={handleChange}
        onSelect={handleSelect}
      />
    </div>
  );
}
