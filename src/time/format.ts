/**
 * `11-06`: the console's one place where an instant becomes text a human reads.
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
 */

/** The `en-CA` locale renders a date as `YYYY-MM-DD`, which is why it is used for the day *key*
 * (never for anything a human reads) - two instants belong to the same day exactly when their keys
 * match, and a lexicographic key needs no calendar arithmetic to compare. */
const DAY_KEY_LOCALE = "en-CA";

/** Everything a human reads is rendered `en-GB`: 24-hour clock, day before month. Interface i18n is
 * explicitly out of `11-06`'s scope, so this is one fixed locale rather than the browser's - and
 * fixing it is also what makes these functions testable at all, since a test that inherits the
 * machine's locale asserts nothing portable. */
const DISPLAY_LOCALE = "en-GB";

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
 * separator; the full labelled instant is always one `title` away (`formatAbsolute`). */
export function formatClockTime(instant: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: zoneOf(timeZone),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}

/**
 * `24 August 2026 at 14:03 GMT+3` - the complete, zone-labelled instant. This is the rendering
 * `date-and-time.md` rule 5 actually mandates, and the reason every abbreviated timestamp in the
 * workspace carries it in a `title`: the short form is for scanning, this one is the truth.
 *
 * `timeZoneName: "short"` is what supplies the label. With no zone known it renders literally
 * `UTC`, which is exactly the "UTC labelled as UTC" branch rather than a silent local guess.
 */
export function formatAbsolute(instant: Date, timeZone: string | null): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: zoneOf(timeZone),
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(instant);
}

/**
 * The thread's day separator: `Today`, `Yesterday`, `Friday 21 August`, or `21 August 2025` once
 * the year differs. "Today" is computed by comparing day *keys in the rendering zone*, never by
 * subtracting 24 hours from a timestamp - on a spring-forward day those two answers differ.
 */
export function formatDayLabel(instant: Date, now: Date, timeZone: string | null): string {
  const key = dayKey(instant, timeZone);
  if (key === dayKey(now, timeZone)) {
    return "Today";
  }

  // Stepping back a fixed 24 hours is safe *for this comparison* even across a DST change: a 23- or
  // 25-hour local day still lands the result somewhere inside the previous local day, and only the
  // resulting day key is used, never the time of day.
  if (key === dayKey(new Date(now.getTime() - MS_PER_DAY), timeZone)) {
    return "Yesterday";
  }

  const sameYear = key.slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
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
 */
export function formatElapsed(since: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - since.getTime());

  if (ms < MS_PER_MINUTE) {
    return "just now";
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

/** The same duration spelled out - for a `title`, where `2d 3h` is too terse to be a real
 * explanation, and for anything a screen reader has to read aloud. */
export function formatElapsedWords(since: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - since.getTime());

  if (ms < MS_PER_MINUTE) {
    return "less than a minute";
  }

  if (ms < MS_PER_HOUR) {
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  if (ms < MS_PER_DAY) {
    const hours = Math.floor(ms / MS_PER_HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  const days = Math.floor(ms / MS_PER_DAY);
  return `${days} day${days === 1 ? "" : "s"}`;
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
