import type { InputHTMLAttributes } from "react";
import { Input } from "./Input.js";

export interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Same meaning as `Input`'s own `invalid` - forwarded to the native control for `aria-invalid`
   * and also used here to redden this wrapper's own border, since the native control's border is
   * suppressed (see this file's own remarks below on why). */
  invalid?: boolean;
}

/**
 * `25-186`: Russia is the only country any phone field on this platform serves - `ago-widget`'s own
 * `phoneFormat.ts` header comment gives the full reasoning (bundle-size cost of a real
 * country-aware library against a single-country need) and this component does not re-litigate it.
 * What was missing here was purely visual: a plain, un-flagged phone field gives an operator no signal
 * that a Russian number is expected before they start typing.
 *
 * Wraps `Input` rather than extending `Field`'s own `adornment` slot. `Field.tsx`'s `adornment`
 * renders *after* the control (`{control}{adornment}`, its own JSX) - the hex-colour swatch on
 * `WidgetConfigPage` is the one caller that shape exists for. This item needs the flag+prefix
 * *before* the control, which does not fit that slot without reordering it for every caller - and
 * reordering a shared component's rendering for one new caller would silently change the hex-swatch
 * field's own layout too, which is out of this item's scope and unreviewed. A small, self-contained
 * wrapper keeps `Field` and its existing caller completely untouched.
 *
 * Non-interactive by design: `🇷🇺 +7` is plain text, not a control - there is exactly one country to
 * choose from, so a dropdown here would offer a choice that does not exist. Emoji, not an SVG/icon-font
 * flag, for the same bundle-size reason `ago-widget`'s own choice is emoji: zero additional asset,
 * zero additional font, renders with the system emoji font already available everywhere.
 *
 * `25-209`: the `🇷🇺 +7` prefix used to sit beside a value that could itself already carry `+7` (a
 * `ContactDetailsPanel` row's `detail.value` is exactly what the widget's own `phoneFormat.ts` wrote,
 * unverified free text with no format contract), showing the country code twice. The fix is to hide
 * this prefix the moment the value is not a plain Russian subscriber number - **inferred from
 * `value`'s own shape (`+` followed by anything other than `7`), not a separate caller-supplied
 * boolean prop.** A second prop would need this component's one real caller to independently keep it
 * in sync with the `value` it is already passing on every render, the two could drift, and the value
 * itself already carries the one fact that matters - `ago-widget`'s own escape-hatch condition
 * (`phoneFormat.ts`'s `isExplicitNonRussianPhoneValue`) makes the identical call the identical way,
 * from the value alone, for the identical reason. `Input`'s own `value` can be non-`string` per
 * `InputHTMLAttributes` (an uncontrolled `undefined`, or, in principle, `readonly string[]` for a
 * `<select multiple>` this component never renders) - anything but a plain `string` is treated as "no
 * signal either way" and the prefix shows, matching this component's pre-25-209 default.
 */
export function PhoneInput({ invalid, className, value, ...rest }: PhoneInputProps) {
  const wrapperClasses = ["ago-phone-input", invalid && "ago-phone-input--invalid", className]
    .filter(Boolean)
    .join(" ");

  const isNonRussianValue = typeof value === "string" && value.startsWith("+") && !value.startsWith("+7");

  return (
    <div className={wrapperClasses}>
      {!isNonRussianValue && (
        <span className="ago-phone-input__prefix" aria-hidden="true">
          🇷🇺 +7
        </span>
      )}
      <Input type="tel" invalid={invalid} value={value} {...rest} />
    </div>
  );
}
