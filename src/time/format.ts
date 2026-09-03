import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `11-06`/`343`: the console's one place where an instant becomes text a human reads.
 *
 * `docs/conventions/date-and-time.md` rule 5 - "render in the user's zone when we know it, UTC
 * labelled as UTC when we do not; an unlabelled timestamp shown to a human is a defect" - is the
 * rule this item finally applies. Before it, the queue printed `toLocaleTimeString()` with no date
 * at all, so a conversation waiting since yesterday read as minutes old, and the admin list printed
 * `toLocaleString()` with no zone label at all.
 *
 * Every function here takes its `now` and its zone as arguments rather than reading `Date.now()` or
 * the ambient locale. That is the browser-side spelling of the same rule that bans `DateTime.UtcNow`
 * outside Infrastructure server-side: behaviour that depends on the clock has to be testable without
 * one. The single function that *does* touch the environment is `resolveTimeZone`, and it does
 * nothing else.
 *
 * The zone is the browser's own IANA zone, not an offset - `date-and-time.md` is explicit that
 * offsets do not survive DST, which `format.test.ts` proves against a real spring-forward.
 *
 * ## `343`: the display locale is now a parameter, not a module constant
 *
 * Every function below that renders words (as opposed to `dayKey`'s comparison-only key) took a
 * fixed `en-GB` until `343`, on the header comment above this one: "interface i18n is out of
 * `11-06`'s scope." It no longer is - `11-11`-`11-15`/`10-06` translated everything else, which left
 * this file's weekday names, month names and connective words the only English still standing on a
 * console set to Russian (`ago-root#343`).
 *
 * The fix threads `strings: ConsoleStrings` through every function that needs a locale-dependent
 * word, defaulted to `en` - the same shape `closeOutcome.ts`/`alerts.ts`/`linkStatus.ts` already use
 * for a pure function that cannot call `useStrings()` (no hook context outside a component render).
 * Two alternatives were rejected, both for the reason the backlog item itself named:
 *
 * - **Reading a module-level global, or importing `StringsContext` and calling `useStrings()` here.**
 *   Either would restore exactly the ambient dependency this file's own header exists to avoid - a
 *   test would once again have to freeze *two* things (a clock and a locale) instead of one, and a
 *   plain function like `formatElapsed` would need to become a hook or read a mutable global nobody
 *   else in this file touches. `resolveTimeZone` is deliberately the *only* function here that reads
 *   the environment, and it does nothing else - a second one would break that promise.
 * - **A second, format.ts-local word table** (its own `{ en: {...}, ru: {...} }` for "Today"/
 *   "Yesterday"/"just now"/the elapsed-unit words) instead of extending `ConsoleStrings`. This would
 *   have kept `format.ts` fully free of any import from `i18n/`, but at the cost of a second place a
 *   translator has to know about and keep in sync with `en.ts`/`ru.ts` - this codebase already has
 *   exactly one canonical string table, and every other pure function needing translated text
 *   (`closeOutcomeFor`, `alertTextFor`, `linkStatusOf`, `validateDraft`) extends that one rather than
 *   forking its own. Consistency with an established, already-reviewed convention won over a
 *   marginally smaller import graph.
 *
 * What threading the parameter costs: one more argument at every call site. It turns out to cost
 * close to nothing here specifically, because every real call site already calls `useStrings()` for
 * its own surrounding text (`Thread.tsx`, `ConversationList.tsx`, the report pages, and so on all
 * already hold a `strings` value in scope) - the one exception is `OwnerSitesPage.tsx`, which is
 * deliberately English-only (`11-11`'s settled design call) and simply omits the argument, relying on
 * the `= en` default to say the same thing its own neighbouring comment already says explicitly.
 *
 * `dayKey`'s own `DAY_KEY_LOCALE` is untouched and stays `en-CA` unconditionally - it is never shown
 * to a human (`ru-RU` is not a drop-in for it any more than for anything else here: it exists purely
 * for its `YYYY-MM-DD` shape, which a lexicographic day-key comparison depends on regardless of which
 * language the rest of the screen renders in).
 *
 * `formatAbsolute`'s zone label also changes shape, for a related but separate reason: `date-and-time.md`
 * still requires the label, but ICU's *short* zone name (`timeZoneName: "short"`, `"GMT+3"`/`"UTC"`)
 * is not itself translated by any locale - it is an international technical abbreviation, not a word,
 * and stays Latin-scripted in `ru-RU` exactly as in `en-GB` (verified against real `Intl` output, see
 * `format.test.ts`). `timeZoneName: "long"` is the one style that renders a fully spelled, fully
 * localized zone name in every locale *and* for the unknown-zone `"UTC"` fallback alike (`"Всемирное
 * координированное время"` for `ru-RU`, `"Coordinated Universal Time"` for `en-GB` - both zero-Latin
 * for the Russian case). Switching styles is a considered call, not a "make the gate pass" hack: the
 * label is still present, still never silently dropped, and still says UTC when the zone is unknown -
 * `date-and-time.md` rule 5 asks for exactly that, not for the specific three-letter abbreviation.
 */

/** The `en-CA` locale renders a date as `YYYY-MM-DD`, which is why it is used for the day *key*
 * (never for anything a human reads) - two instants belong to the same day exactly when their keys
 * match, and a lexicographic key needs no calendar arithmetic to compare. Fixed regardless of the
 * console's own selected locale - see this file's own header for why. */
const DAY_KEY_LOCALE = "en-CA";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * The browser's own IANA zone, or `null` when the environment cannot name one. `null` is not a
 * failure state to hide - it is the "we do not know the user's zone" branch `date-and-time.md`
 * requires be rendered as UTC *labelled* as UTC, which is what `zoneOf` below does with it.
 */
export function resolveTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}

/** The fallback is UTC, and every absolute rendering says so out loud - see `formatAbsolute`. */
function zoneOf(timeZone: string | null): string {
  return timeZone ?? "UTC";
}

/** `YYYY-MM-DD` *in the given zone* - the key `formatDayLabel` and the thread's day separators
 * compare. Deliberately not derived from the ISO string's own date part, which is the UTC day and
 * would put a 23:30 UTC message on the wrong side of midnight for anyone east of Greenwich. */
export function dayKey(instant: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat(DAY_KEY_LOCALE, {
    timeZone: zoneOf(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** `14:03` - the per-message timestamp. Time only, because the day is carried by the thread's day
 * separator; the full labelled instant is always one `title` away (`formatAbsolute`). `hourCycle:
 * "h23"` fixes the 24-hour clock regardless of `strings.dateIntlLocale` - only digits come out of
 * this one, so no locale changes what it renders, but it still takes `strings` for the same reason
 * every function here does now: one consistent shape, not an exception for the one case that happens
 * not to need it today. */
export function formatClockTime(instant: Date, timeZone: string | null, strings: ConsoleStrings = en): string {
  return new Intl.DateTimeFormat(strings.dateIntlLocale, {
    timeZone: zoneOf(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/**
 * `24 August 2026 at 14:03 Moscow Standard Time` - the complete, zone-labelled instant. This is the
 * rendering `date-and-time.md` rule 5 actually mandates, and the reason every abbreviated timestamp
 * in the workspace carries it in a `title`: the short form is for scanning, this one is the truth.
 *
 * `timeZoneName: "long"` is what supplies the label - `343`: the shorter `"short"` style (`"GMT+3"`)
 * used before this item is an international technical abbreviation, not a translated word, and ICU
 * renders it identically in every locale (verified against real `Intl` output in `format.test.ts`),
 * which would leave a Latin-scripted zone name sitting inside an otherwise-Russian sentence. `"long"`
 * spells the zone out fully in the rendering locale - `"Москва, стандартное время"` for `ru-RU`,
 * `"Moscow Standard Time"` for `en-GB` - including for the unknown-zone fallback below
 * (`"Всемирное координированное время"` / `"Coordinated Universal Time"`), so the zone is still
 * always labelled and the label is never a silent local guess, exactly as before - only its shape
 * changed.
 */
export function formatAbsolute(instant: Date, timeZone: string | null, strings: ConsoleStrings = en): string {
  return new Intl.DateTimeFormat(strings.dateIntlLocale, {
    timeZone: zoneOf(timeZone),
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "long",
  }).format(instant);
}

/**
 * `24 Aug 2026` - a calendar date, in the rendering zone, short enough to sit in a table column.
 *
 * `12-03`'s owner table is the caller: "created" and "last activity" are being compared across rows,
 * where the day is the unit that carries meaning and a full timestamp per row is noise. The exact,
 * zone-labelled instant is never lost - the cell keeps `formatAbsolute` in its `title`, the same
 * short-form-for-scanning / full-form-on-hover pairing the workspace already uses.
 *
 * Zone-derived like everything else here, not sliced off the ISO string: a 22:30 UTC instant is
 * already tomorrow in Moscow, and rendering the UTC date for a Moscow reader is the same defect
 * `dayKey` exists to avoid.
 */
export function formatDateStamp(instant: Date, timeZone: string | null, strings: ConsoleStrings = en): string {
  return new Intl.DateTimeFormat(strings.dateIntlLocale, {
    timeZone: zoneOf(timeZone),
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(instant);
}

/**
 * The thread's day separator: `Today`, `Yesterday`, `Friday 21 August`, or `21 August 2025` once
 * the year differs. "Today" is computed by comparing day *keys in the rendering zone*, never by
 * subtracting 24 hours from a timestamp - on a spring-forward day those two answers differ.
 *
 * `"Today"`/`"Yesterday"` come from `strings` directly (`Intl` has no such concept); the weekday and
 * month names in the third branch come from `Intl` rendering in `strings.dateIntlLocale`.
 */
export function formatDayLabel(instant: Date, now: Date, timeZone: string | null, strings: ConsoleStrings = en): string {
  const key = dayKey(instant, timeZone);
  if (key === dayKey(now, timeZone)) {
    return strings.dateToday;
  }

  // Stepping back a fixed 24 hours is safe *for this comparison* even across a DST change: a 23- or
  // 25-hour local day still lands the result somewhere inside the previous local day, and only the
  // resulting day key is used, never the time of day.
  if (key === dayKey(new Date(now.getTime() - MS_PER_DAY), timeZone)) {
    return strings.dateYesterday;
  }

  const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat(strings.dateIntlLocale, {
    timeZone: zoneOf(timeZone),
    weekday: sameYear ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: sameYear ? undefined : "numeric",
  }).format(instant);
}

/**
 * `just now`, `4m`, `1h 12m`, `2d 3h` - how long something has been going on, for the queue's
 * waiting times.
 *
 * Two of `date-and-time.md`'s practical notes are load-bearing here and both are deliberate:
 *
 * - **Rounding is towards the past.** Every division floors, so a conversation that has waited
 *   119 seconds reads `1m`, never `2m`. Over-reporting how long a visitor has waited would be the
 *   friendlier lie and is still a lie.
 * - **A future instant is clamped, not rendered.** This subtracts a *server* timestamp from a
 *   *browser* clock - two clocks, which the convention warns about - so a browser running a few
 *   seconds slow can legitimately produce a negative age. `just now` is the honest floor; showing
 *   `-3s` or a future time for an event that has already happened is not.
 *
 * The digit-plus-unit-letter shapes (`4m`, `1h 12m`, `2d 3h`) stay locale-invariant on purpose - see
 * `formatDurationSeconds`'s own doc comment just below for why a bare unit letter is not the kind of
 * word `343` translates. Only the `just now` floor is real English text, so only it reads from
 * `strings`.
 */
export function formatElapsed(since: Date, now: Date, strings: ConsoleStrings = en): string {
  const ms = Math.max(0, now.getTime() - since.getTime());

  if (ms < MS_PER_MINUTE) {
    return strings.elapsedJustNow;
  }

  if (ms < MS_PER_HOUR) {
    return `${Math.floor(ms / MS_PER_MINUTE)}m`;
  }

  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  }

  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}

/**
 * `18-08`: a span of seconds, not "time since now" - the analytics panel's own average
 * first-response time, which is a duration between two message timestamps and has no "now" in it at
 * all. Deliberately not built from `formatElapsed` above: that function's signature (`since`, `now`)
 * only ever expresses "how long ago", and faking a `now` to borrow it would be a stranger reading than
 * a five-line sibling.
 *
 * `343`: unlike the rest of this file, this one stays locale-invariant on purpose rather than taking
 * `strings` - its `s`/`m`/`h` are bare unit letters, not English words (`"m"` is not an English word
 * any more than it is a Russian one), and the gate `343` was written against agrees: a single Latin
 * letter never matches its `/[A-Za-z]{2,}/` violation pattern, so this shape was never a reported
 * defect in the first place. A narrower, deliberate exemption from this file's own broader fix, not
 * an oversight - kept explicit here so it reads as a decision the next time this file is touched.
 */
export function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));

  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds === 0 ? `${minutes}m` : `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** The same duration spelled out in words - for a `title`, where `2d 3h` is too terse to be a real
 * explanation, and for anything a screen reader has to read aloud. Real words this time, unlike
 * `formatElapsed`'s unit letters, so every branch reads from `strings` - the singular/plural choice
 * is the same binary convention `strings.elapsedMinuteOne`'s own doc comment describes. */
export function formatElapsedWords(since: Date, now: Date, strings: ConsoleStrings = en): string {
  const ms = Math.max(0, now.getTime() - since.getTime());

  if (ms < MS_PER_MINUTE) {
    return strings.elapsedLessThanMinute;
  }

  if (ms < MS_PER_HOUR) {
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    return `${minutes} ${minutes === 1 ? strings.elapsedMinuteOne : strings.elapsedMinuteOther}`;
  }

  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    return `${hours} ${hours === 1 ? strings.elapsedHourOne : strings.elapsedHourOther}`;
  }

  const days = Math.floor(ms / MS_PER_DAY);
  return `${days} ${days === 1 ? strings.elapsedDayOne : strings.elapsedDayOther}`;
}

/** Parses a wire timestamp. The wire format is ISO-8601 with an explicit offset
 * (`date-and-time.md` rule 4), so `Date` parses it unambiguously; an unparseable value returns
 * `null` rather than an `Invalid Date` that renders as the literal string "Invalid Date" three
 * components downstream. */
export function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }

  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
