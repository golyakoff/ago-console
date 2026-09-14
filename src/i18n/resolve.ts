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
 * `25-88`: the fallback is Russian, not English - a `null` active site (the platform owner's own
 * screens, which have no one tenant's site to read a locale from at all) or a value this console has
 * never heard of both resolve to `"ru"` now. The same reasoning `23-28` already gave for a
 * pre-session screen with no site to follow ("no site, no locale to read, and the answer is Russian
 * rather than English"), applied here structurally rather than left as the one place it was missed.
 * `"En"` is the only value that still resolves to `"en"` - a tenant's own explicit choice is never
 * overridden by this default, only the absence of one.
 */
export function parseConsoleLocale(value: string | null | undefined): SupportedLocale {
  return value === "En" ? "en" : "ru";
}

/** The locale's own string table - `resolve.ts` is the one place that maps `SupportedLocale` to a
 * `ConsoleStrings` object, so a caller never imports `en.js`/`ru.js` directly. */
export function getStrings(locale: SupportedLocale): ConsoleStrings {
  return locale === "ru" ? ru : en;
}
