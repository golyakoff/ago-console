/**
 * `12-03`: the owner screen's pure rendering rules - the parts of it that can be wrong in a way a
 * test can catch, kept out of the component for exactly that reason (the console has no DOM testing
 * library, `adr/0030`, so anything that must be proven has to be a function).
 *
 * Two of the three exist because of the same hazard: `12-02` returns `recentWindowDays` with every
 * response *so that no client hardcodes the window*, and the only way to honour that is for every
 * label naming a number of days to be computed from that field. A literal "30 days" anywhere in this
 * screen would be a defect the day the server's constant changes.
 */

/** `en-GB` throughout, unconditionally - `/owner` is deliberately English-only regardless of any
 * tenant locale (`11-11`'s settled design call, restated in `OwnerSitesPage.tsx`'s own doc comment),
 * so this stays a fixed constant rather than taking `strings.dateIntlLocale` the way `time/format.ts`
 * itself now does post-`343`. A fixed locale is also what makes these assertions portable across
 * machines. */
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

/** `the last 30 days` / `the last day` - the phrase every window-scoped label is built from, so the
 * window is named once and the plural is right for a one-day window. */
export function describeRecentWindow(days: number): string {
  return days === 1 ? "the last day" : `the last ${formatCount(days)} days`;
}

/** The message-volume column header. The window is in the header rather than in a footnote because
 * the number under it is meaningless without it, and a reader scanning columns should not have to
 * find a footnote to learn that this one is not all-time. */
export function formatRecentMessagesHeader(days: number): string {
  return `Messages (${describeRecentWindow(days)})`;
}

/**
 * What an empty `lastMessageAt` says. Deliberately **not** "Never": `12-02`'s value is windowed, so
 * a tenant whose last message was a year ago and a tenant that has never had one are the same null
 * here. Saying "never" would be inventing the distinction the API says it cannot make.
 */
export function formatNoRecentActivity(days: number): string {
  return `None in ${describeRecentWindow(days)}`;
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
export function formatMatchSummary(matchingSites: number, totalSites: number): string {
  return `${formatCount(matchingSites)} of ${formatCount(totalSites)} ${totalSites === 1 ? "site" : "sites"} match.`;
}

/**
 * `23-14`: what `expiresAt` means, rendered as a value rather than left to speak for itself - a
 * `null` is an explicit "No end date", never a blank cell (this item's own Done-when), and a real
 * date is handed back unformatted (the caller renders it with `formatDateStamp`, the same as every
 * other date on this screen) so this function's only job is the null case.
 */
export function formatModuleExpiry(expiresAt: string | null): string | null {
  return expiresAt === null ? "No end date" : null;
}

/**
 * `23-14`: "Active" / "Expired" - rendered directly from the server's own `isActive`, never
 * recomputed here by comparing `expiresAt` against the browser's own clock (this item's own
 * Done-when: "matching what the live read-store query already decides rather than re-deriving it in
 * the console").
 */
export function formatModuleStatus(isActive: boolean): string {
  return isActive ? "Active" : "Expired";
}
