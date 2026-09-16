/**
 * `12-03`: the owner screen's pure rendering rules - the parts of it that can be wrong in a way a
 * test can catch, kept out of the component for exactly that reason (the console has no DOM testing
 * library, `adr/0030`, so anything that must be proven has to be a function).
 *
 * Two of the three exist because of the same hazard: `12-02` returns `recentWindowDays` with every
 * response *so that no client hardcodes the window*, and the only way to honour that is for every
 * label naming a number of days to be computed from that field. A literal "30 days" anywhere in this
 * screen would be a defect the day the server's constant changes.
 *
 * `25-89`: every function here that renders words, not just numbers, now takes an optional
 * `strings: ConsoleStrings = en` parameter - the identical shape `time/format.ts`'s own
 * `formatElapsedWords` and `11-12`'s `closeOutcomeFor`/`alertTextFor`/`linkStatusOf` already use for a
 * pure function outside render: existing English-asserting callers (and this file's own
 * `ownerSites.test.ts`) keep working unchanged because the default is `en`, while `OwnerSitesPage.tsx`
 * and its siblings now pass `useStrings()` through explicitly once they read from the owner panel's
 * own `OwnerStringsProvider` rather than the fixed `en` table `/owner` used before this item.
 */
import { en } from "../i18n/en.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/** `en-GB` throughout, unconditionally, for numbers only - `Intl.NumberFormat`'s own grouping
 * separator does not depend on the reader's language the way the *words* around a number do, and
 * `25-89` deliberately leaves this constant untouched: `/owner`'s numbers were never the gap, only its
 * words were (`docs/backlog/25-89-*.md`'s own Scope). Keeping this fixed is also what keeps these
 * assertions portable across machines. */
const DISPLAY_LOCALE = "en-GB";

/** Thousands-separated, so a six-figure conversation count is readable at a glance. */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(DISPLAY_LOCALE).format(value);
}

const BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/**
 * Stored attachment bytes as something a human can compare across rows, with the exact figure kept
 * for the cell's `title` by the caller.
 *
 * Binary units, because that is what the number actually is - a byte count, not a marketing capacity
 * - and rounding is **towards zero**, never up: `1048575` reads `1023.9 KiB`, not `1 MiB`. Same rule
 * `formatElapsed` follows for durations (`time/format.ts`): where a rendering has to lose precision,
 * it loses it in the direction that cannot overstate.
 *
 * No currency, no cost estimate, ever - `12-02`'s contract is explicit that this system holds no data
 * from which an infrastructure cost could be derived, and `CLAUDE.md` forbids inventing one.
 *
 * `25-89`: the unit letters themselves (`B`/`KiB`/`MiB`...) stay untranslated, the same "a unit
 * abbreviation is not a phrase to render in the reader's language" reasoning `time/format.ts`'s own
 * `formatElapsed` gives for `d`/`h`/`m` - only `formatElapsedWords`'s *spelled-out* sibling takes
 * `strings`, and this function has no such sibling of its own.
 */
export function formatByteSize(bytes: number): string {
  // Negative is not a state the API can produce (`coalesce(sum(...), 0)`), so this is a guard
  // against a garbled response rather than a case with a meaning.
  const safe = Math.max(0, bytes);

  let unit = 0;
  let value = safe;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  if (unit === 0) {
    return `${formatCount(safe)} B`;
  }

  const truncated = Math.floor(value * 10) / 10;
  return `${truncated.toFixed(1)} ${BYTE_UNITS[unit]}`;
}

/** `the last day` / `the last 5 days` - the phrase every window-scoped label is built from, so the
 * window is named once and the plural is right for a one-day window.
 *
 * `25-89`: reuses `strings.elapsedDayOne`/`elapsedDayOther` (`time/format.ts`'s own pair) for the
 * word "day"/"days" itself, rather than a second, duplicate pair scoped to this file - the same word
 * in the same binary singular/plural convention, so a second copy would be exactly the "should not
 * get a second, duplicate key" case this item's own brief warns against. Only the "the last "/"last N"
 * framing around it is new. */
export function describeRecentWindow(days: number, strings: ConsoleStrings = en): string {
  return days === 1
    ? strings.ownerRecentWindowLastDay
    : `${strings.ownerRecentWindowLastDaysPrefix}${formatCount(days)} ${strings.elapsedDayOther}`;
}

/** The message-volume column header. The window is in the header rather than in a footnote because
 * the number under it is meaningless without it, and a reader scanning columns should not have to
 * find a footnote to learn that this one is not all-time. */
export function formatRecentMessagesHeader(days: number, strings: ConsoleStrings = en): string {
  return `${strings.ownerMessagesHeaderPrefix}${describeRecentWindow(days, strings)}${strings.ownerMessagesHeaderSuffix}`;
}

/**
 * What an empty `lastMessageAt` says. Deliberately **not** "Never": `12-02`'s value is windowed, so
 * a tenant whose last message was a year ago and a tenant that has never had one are the same null
 * here. Saying "never" would be inventing the distinction the API says it cannot make.
 */
export function formatNoRecentActivity(days: number, strings: ConsoleStrings = en): string {
  return `${strings.ownerNoRecentActivityPrefix}${describeRecentWindow(days, strings)}`;
}

/**
 * `23-14`: "3 of 41 sites match" - the exact shape this item's own "must not break" clause asks for,
 * so a search result never reads like a bare, narrower row count. Always built from the server's own
 * `matchingSites`/`totalSites`, never from `sites.length` (which is only the current page) - the same
 * "the predicate is explicit in the response, never implicit in a narrowed page" rule the API contract
 * itself carries.
 *
 * A caller with no active search should not call this at all - `OwnerSitesPage` only renders it while
 * a query is active, since "41 of 41 sites match" says nothing an unfiltered list's own row count
 * does not already say plainer.
 */
export function formatMatchSummary(matchingSites: number, totalSites: number, strings: ConsoleStrings = en): string {
  const siteWord = totalSites === 1 ? strings.ownerSiteWordOne : strings.ownerSiteWordOther;
  return `${strings.ownerMatchSummaryPrefix}${formatCount(matchingSites)}${strings.ownerMatchSummaryOf}${formatCount(totalSites)} ${siteWord}${strings.ownerMatchSummarySuffix}`;
}

/**
 * `23-14`: what `expiresAt` means, rendered as a value rather than left to speak for itself - a
 * `null` is an explicit "No end date", never a blank cell (this item's own Done-when), and a real
 * date is handed back unformatted (the caller renders it with `formatDateStamp`, the same as every
 * other date on this screen) so this function's only job is the null case.
 */
export function formatModuleExpiry(expiresAt: string | null, strings: ConsoleStrings = en): string | null {
  return expiresAt === null ? strings.ownerModuleExpiryNever : null;
}

/**
 * `23-14`/`23-103`: "Active" / "Expired" / "Revoked" - rendered directly from the server's own
 * `status`, never recomputed here by comparing `expiresAt`/`revokedAt` against the browser's own
 * clock (this item's own Done-when: "matching what the live read-store query already decides rather
 * than re-deriving it in the console"). A passthrough of *which case it is*, kept as a named function
 * rather than inlined so this file stays the one place that knows the server sends exactly one of
 * three literal strings to show.
 *
 * `25-89`: now a translation-mapping function rather than a literal passthrough - the identical
 * `11-12` precedent for a backend enum value rendered as UI chrome
 * (`MessageDto.authorKind`/`ConversationSummaryDto.state`, that item's own doc comment): the three
 * words on screen must be Russian on this page like everything else, but the *wire* value
 * (`Ago.Chat.Contracts.OwnerSiteModuleDto.Status`) is not itself translatable data, so this function
 * is where the mapping happens, once. An unrecognised value still passes through raw - a defensive
 * fallback for a status this file has not been taught yet, never a blank cell.
 */
export function formatModuleStatus(status: string, strings: ConsoleStrings = en): string {
  if (status === "Active") {
    return strings.ownerModuleStatusActive;
  }
  if (status === "Expired") {
    return strings.ownerModuleStatusExpired;
  }
  if (status === "Revoked") {
    return strings.ownerModuleStatusRevoked;
  }
  return status;
}

/**
 * `23-103`: a badge tone per status - `Ago.Chat.Contracts.OwnerSiteModuleDto.Status`'s own remarks on
 * why "Revoked" and "Expired" are different facts (a deliberate act versus a grant's own end date
 * quietly arriving) carried into the console: Revoked gets the same `danger` tone Active's absence
 * used to carry alone, Expired gets `neutral` rather than being conflated with it.
 *
 * Keyed off the server's own **wire** value, not the translated label `formatModuleStatus` produces -
 * this function takes no `strings` at all, deliberately, since comparing against a Russian word here
 * would make the tone depend on the locale rather than on the fact the server reported.
 */
export function moduleStatusTone(status: string): "success" | "neutral" | "danger" {
  if (status === "Active") {
    return "success";
  }

  if (status === "Revoked") {
    return "danger";
  }

  return "neutral";
}

/**
 * `23-66`: what `module.quantity` means, rendered as a value rather than left to speak for itself -
 * the identical "an explicit statement for the special case, never a blank cell" shape
 * `formatModuleExpiry` already gives its own null. `null` here means no quantity was ever granted;
 * `0` is a real, legitimate grant (a tenant with the module and no workers yet) and must render as
 * "0", never fall through to the same "Not granted" text - collapsing the two is exactly the mistake
 * this item's own warning names.
 */
export function formatModuleQuantity(quantity: number | null, strings: ConsoleStrings = en): string {
  return quantity === null ? strings.ownerModuleQuantityNotGranted : formatCount(quantity);
}

/**
 * `25-115`: `OwnerSiteChannelEntitlement.kind` is `Ago.Chat.Domain.ChannelKind.ToString()` - a wire
 * value, not a phrase to show a Russian-reading platform owner as-is, the identical "the mapping
 * happens once, here" reasoning `formatModuleStatus` above gives for a different backend enum. An
 * unrecognised kind still passes through raw - a defensive fallback for a kind this file has not been
 * taught yet, never a blank cell, matching that function's own fallback.
 */
export function channelKindLabel(kind: string, strings: ConsoleStrings = en): string {
  if (kind === "Max") {
    return strings.ownerChannelKindMax;
  }
  if (kind === "Telegram") {
    return strings.ownerChannelKindTelegram;
  }
  if (kind === "Vk") {
    return strings.ownerChannelKindVk;
  }
  if (kind === "WhatsApp") {
    return strings.ownerChannelKindWhatsApp;
  }
  if (kind === "Avito") {
    return strings.ownerChannelKindAvito;
  }
  return kind;
}
