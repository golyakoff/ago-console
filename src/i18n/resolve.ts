import { en } from "./en.js";
import { ru } from "./ru.js";
import type { ConsoleStrings } from "./strings.js";

export type SupportedLocale = "en" | "ru";

/**
 * `11-11`: mirrors `ago-widget/src/i18n/resolve.ts`'s `parseWidgetLocale` exactly in shape - the
 * same "courtesy re-check, never trust the wire value blindly" posture, and the same total function
 * that **never throws**: a malformed or missing locale value must never be the reason the console
 * fails to render, only the reason it renders in its own built-in language.
 *
 * `"Ru"` is `Ago.Chat.Domain.Locale`'s one non-default member - anything else (a `null` active site,
 * `"En"`, or a value this console has never heard of) resolves to `"en"`, the console's own existing,
 * only-ever language before this item.
 */
export function parseConsoleLocale(value: string | null | undefined): SupportedLocale {
  return value === "Ru" ? "ru" : "en";
}

/** The locale's own string table - `resolve.ts` is the one place that maps `SupportedLocale` to a
 * `ConsoleStrings` object, so a caller never imports `en.js`/`ru.js` directly. */
export function getStrings(locale: SupportedLocale): ConsoleStrings {
  return locale === "ru" ? ru : en;
}
