/**
 * `26-325`/`26-326`: the console's own hand-rolled Russian-mobile phone mask, rewritten to mirror
 * `ago-android`'s `RuPhoneField.kt` byte-for-byte in behaviour (input normalisation, the inline mask,
 * the caret offset mapping, and the completeness/display helpers) - the backlog item's own framing:
 * "code differs per platform, behaviour must match." Read `RuPhoneField.kt` first; every exported
 * function here is a deliberate, named port of one function there, called out in its own doc comment.
 *
 * **Why hand-rolled, not a library** - unchanged from this file's pre-26-326 self and from
 * `ago-widget`'s own `phoneFormat.ts`: one country, no new package without saying what it replaces
 * (`CLAUDE.md`), and this is still on the order of Android's own ~40-line estimate.
 *
 * **What changed in 26-326.** The pre-26-326 shape formatted only the *subscriber* part
 * (`(9XX) XXX-XX-XX`) and left the `+7` to a separate, non-interactive `🇷🇺 +7` chip beside the field
 * (`PhoneInput.tsx`'s old doc comment). Android's `RuPhoneField` never had a separate chip - the `+7`
 * lives inside the one masked control, fixed and non-deletable. This file now mirrors that: `+7` is
 * part of `maskRuNational`'s own output, and the chip is gone (`PhoneInput.tsx`).
 */

/** A Russian mobile number's national part is exactly 10 digits, the mask's own `XXX XXX-XX-XX`.
 * `RuPhoneField.kt`'s `NATIONAL_DIGIT_COUNT`. */
export const NATIONAL_DIGIT_COUNT = 10;

/** The fixed, non-deletable country prefix the field always shows. `RuPhoneField.kt`'s `RU_PREFIX`. */
export const RU_PREFIX = "+7";

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Keeps digits only, drops one leading `8` or `7` country marker when the run is longer than
 * `NATIONAL_DIGIT_COUNT` digits, and caps at `NATIONAL_DIGIT_COUNT` - `RuPhoneField.kt`'s
 * `normalizeRuNationalDigits`, verbatim: `89211234567`, `+7 921 123-45-67`, `7 9211234567` and
 * `9211234567` all collapse to the same 10-digit `9211234567`. Runs on every keystroke and every
 * paste - both reach this through the same DOM `input` event in `PhoneInput.tsx`, so there is no
 * separate paste-only path to keep in sync.
 */
export function normalizeRuNationalDigits(raw: string): string {
  let digits = onlyDigits(raw);
  if (digits.length > NATIONAL_DIGIT_COUNT && (digits.startsWith("8") || digits.startsWith("7"))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, NATIONAL_DIGIT_COUNT);
}

/** The national digits a value is currently carrying, recovered from whatever it holds - `PhoneInput`'s
 * own canonical `+7…` output most of the time, but also a value seeded from elsewhere. `RuPhoneField.kt`'s
 * `ruNationalDigits`: a literal `+7` lead is stripped first (`removePrefix`, restated here since JS has
 * no built-in equivalent), so the ambiguity `normalizeRuNationalDigits` otherwise resolves by
 * digit-counting alone never mis-fires on this component's own output. */
export function ruNationalDigits(value: string): string {
  return normalizeRuNationalDigits(value.startsWith(RU_PREFIX) ? value.slice(RU_PREFIX.length) : value);
}

/** `PhoneInput`'s own public value shape: blank while `nationalDigits` is empty, otherwise the fixed
 * `RU_PREFIX` followed by `nationalDigits` verbatim. `RuPhoneField.kt`'s `canonicalRuPhone`. */
export function canonicalRuPhone(nationalDigits: string): string {
  return nationalDigits.length === 0 ? "" : RU_PREFIX + nationalDigits;
}

/** True once `value` carries all `NATIONAL_DIGIT_COUNT` national digits, i.e. is `+7` followed by
 * exactly 10 digits. Callers gate a forward action (search, submit, save) on this, never on a plain
 * blank check - `RuPhoneField.kt`'s `isRuPhoneComplete`. */
export function isRuPhoneComplete(value: string): boolean {
  return ruNationalDigits(value).length === NATIONAL_DIGIT_COUNT;
}

/**
 * `25-209`'s escape hatch, kept exactly as `PhoneInput.tsx` already had it and as `ago-widget`'s own
 * `phoneFormat.ts` names it: true once a value carries an explicit `+` followed by anything other than
 * Russia's own `7` - a different, real country code (`+1 555…`), never guessed at from digit count
 * alone. `RuPhoneField.kt` has no such hatch (every field it renders is known in advance to be
 * Russian); the console's own `PhoneInput` is used on values that are not (`ContactDetailsPanel`'s
 * `detail.value` can be whatever the widget's own contact-capture form wrote), so this stays.
 */
export function isExplicitNonRussianPhoneValue(value: string): boolean {
  return value.startsWith("+") && !value.startsWith(RU_PREFIX);
}

/**
 * Renders `digits` (0-10, already normalised) as `+7 (XXX) XXX-XX-XX`, growing one group at a time -
 * closing punctuation for a group appears the instant that group is full. `RuPhoneField.kt`'s
 * `maskRuNational`, verbatim including the always-present `+7 ` lead (so an empty value still renders
 * `+7 `, never a blank string - the mask's own "fixed, non-deletable +7").
 */
export function maskRuNational(digits: string): string {
  let out = `${RU_PREFIX} `;
  if (digits.length === 0) {
    return out;
  }

  out += `(${digits.slice(0, 3)}`;
  if (digits.length >= 3) {
    out += ") ";
  }
  if (digits.length > 3) {
    out += digits.slice(3, Math.min(6, digits.length));
  }
  if (digits.length >= 6) {
    out += "-";
  }
  if (digits.length > 6) {
    out += digits.slice(6, Math.min(8, digits.length));
  }
  if (digits.length >= 8) {
    out += "-";
  }
  if (digits.length > 8) {
    out += digits.slice(8, Math.min(NATIONAL_DIGIT_COUNT, digits.length));
  }
  return out;
}

/** The masked-string offset immediately after the `count`-th national digit (`0` = right after the
 * fixed `+7 ` lead, with no digits typed yet). `RuPhoneField.kt`'s `maskedOffsetForDigitCount`: depends
 * only on how many digits precede that point, not their values, so a run of `"0"`s stands in for the
 * real digits. */
export function maskedOffsetForDigitCount(count: number): number {
  const clamped = Math.min(Math.max(count, 0), NATIONAL_DIGIT_COUNT);
  return maskRuNational("0".repeat(clamped)).length;
}

/** The inverse of `maskedOffsetForDigitCount`: how many national digits (0..`totalDigits`) precede a
 * given offset into the masked string - `RuPhoneField.kt`'s `digitCountForMaskedOffset`. A caret that
 * lands inside punctuation snaps forward to the next digit slot, `PhoneInput.tsx`'s own `onSelect`
 * handler's one use of this (Android's identical direction: a tap between groups "pushes" the caret
 * the same way a masked field's own inserted characters do while typing). */
export function digitCountForMaskedOffset(maskedOffset: number, totalDigits: number): number {
  for (let count = 0; count <= totalDigits; count += 1) {
    if (maskedOffsetForDigitCount(count) >= maskedOffset) {
      return count;
    }
  }
  return totalDigits;
}

/**
 * The one piece of this file with no direct Android counterpart, needed only because of how the two
 * platforms model a masked field's own editable text. Compose's `RuPhoneField` gives its `TextField` a
 * plain digit string as the *underlying* value and layers `maskRuNational` on top purely for display
 * (`VisualTransformation`) - so Compose's own `OffsetMapping` only ever has to translate between "digit
 * index" and "masked-string index", never look at raw, not-yet-normalised keystrokes. This console's
 * `<input>` has no such split: its real DOM value *is* the masked string, so the browser applies a
 * keystroke or a paste directly to that masked text before this file ever sees it, punctuation,
 * literal `+7` lead and all.
 *
 * `nextRuPhoneEdit` is `PhoneInput.tsx`'s one entry point for that: given the raw text the browser just
 * produced (`rawEdited`, already carrying the operator's edit) and the caret offset it placed inside
 * it, returns the new canonical value and the masked-string offset the caret should land at once the
 * field re-renders with that value. The caller has already ruled out
 * `isExplicitNonRussianPhoneValue(rawEdited)` (that branch forwards `rawEdited` untouched instead -
 * `PhoneInput.tsx`'s own doc comment) - this function only ever runs for the Russian-mask path, where
 * `rawEdited` either still carries the fixed `+7` lead or does not (the operator deleted into it, or
 * pasted a full replacement without one).
 *
 * The national digits this returns are exactly `ruNationalDigits(rawEdited)` - normalising the same
 * `RU_PREFIX`-stripped text `ruNationalDigits` would - computed by hand here only because the caret
 * math needs the intermediate `dropped` count (whether `normalizeRuNationalDigits` discarded a leading
 * country marker) to shift the caret's own digit index by the same amount.
 */
export function nextRuPhoneEdit(rawEdited: string, caretOffset: number): { canonical: string; maskedOffset: number } {
  const prefixLength = rawEdited.startsWith(RU_PREFIX) ? RU_PREFIX.length : 0;
  const rawForDigits = rawEdited.slice(prefixLength);
  const caretForDigits = Math.max(0, Math.min(caretOffset, rawEdited.length) - prefixLength);

  const digitsBeforeCaret = onlyDigits(rawForDigits.slice(0, caretForDigits)).length;
  const allDigits = onlyDigits(rawForDigits);
  const droppedLeadingMarker = allDigits.length > NATIONAL_DIGIT_COUNT && (allDigits.startsWith("7") || allDigits.startsWith("8")) ? 1 : 0;
  const nationalDigits = allDigits.slice(droppedLeadingMarker, droppedLeadingMarker + NATIONAL_DIGIT_COUNT);

  const digitIndex = Math.min(Math.max(digitsBeforeCaret - droppedLeadingMarker, 0), nationalDigits.length);
  return {
    canonical: canonicalRuPhone(nationalDigits),
    maskedOffset: maskedOffsetForDigitCount(digitIndex),
  };
}

/**
 * `formatRuPhoneForDisplay`'s own recognition step - `null` unless `raw` unambiguously names a
 * complete Russian number. `RuPhoneField.kt`'s private `ruNationalDigitsForDisplay`: a leading `+` has
 * to be exactly `RU_PREFIX` to be considered at all (a real, different country code such as
 * `+4758655828` is rejected outright, never reinterpreted by digit count alone); a value with no `+`
 * is judged on digit count the same way `ruNationalDigits` already does (`8`/`7` plus
 * `NATIONAL_DIGIT_COUNT` more digits drops the leading trunk/country digit, a bare
 * `NATIONAL_DIGIT_COUNT`-digit run is the national number outright).
 */
function ruNationalDigitsForDisplay(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) {
    if (!trimmed.startsWith(RU_PREFIX)) {
      return null;
    }
    const digits = onlyDigits(trimmed.slice(RU_PREFIX.length));
    return digits.length === NATIONAL_DIGIT_COUNT ? digits : null;
  }

  const digits = onlyDigits(trimmed);
  if (digits.length === NATIONAL_DIGIT_COUNT + 1 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }
  return digits.length === NATIONAL_DIGIT_COUNT ? digits : null;
}

/**
 * `26-307`'s console mirror: the read-only counterpart to the live mask - every full-phone *display*
 * site (a contact row, a client detail header, a booking review line) renders through this rather than
 * the raw wire string, so a number reads `+7 (916) 222-22-22` wherever it is shown, not only while it
 * is being typed. `RuPhoneField.kt`'s `formatRuPhoneForDisplay`: anything not unambiguously a complete
 * Russian number - a foreign number, an incomplete or malformed value, a server's own masked preview
 * (`+7 ··· 08`, dots included - never `NATIONAL_DIGIT_COUNT` real digits), or a blank string - comes
 * back unchanged.
 */
export function formatRuPhoneForDisplay(phone: string): string {
  const national = ruNationalDigitsForDisplay(phone);
  return national === null ? phone : maskRuNational(national);
}
