import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-16`: "a figure carries the preceding period to compare it against, ... dynamics, relative and
 * absolute together" (`docs/design/decisions.md` §7). One shared pair of pure formatters, used by all
 * four report pages (`OperatorAnalyticsPage`, `ConversionReportPage`, `TagBreakdownReportPage`,
 * `BookingFlowConversionPage`) rather than four copies.
 *
 * <b>Why shared here, unlike the four pages' own `startOfDayIso`/`endOfDayIso` helpers, which are
 * deliberately *not* shared.</b> Those are each four lines with no branching - restating them costs
 * less than the coupling of a shared import would (`ConversionReportPage`'s own doc comment states
 * this precedent directly). The comparison text below is a real decision procedure with several
 * branches (previous absolute zero, `null` current or previous rate, sign, rounding) that four report
 * pages must all get identically right - the same "a computation, not a constant, must not have four
 * chances to drift apart" reasoning `Ago.Chat.Application.Abstractions.PrecedingPeriod` states for the
 * server-side window arithmetic this text describes. A wrong copy here would not fail loudly; it would
 * just show a slightly different percentage on one page than another for the same underlying figure.
 *
 * <b>Pure functions, no hook context</b> - the same `strings: ConsoleStrings` parameter (rather than
 * `useStrings()`) `time/format.ts`'s own header comment explains: testable without a component render,
 * and usable from a plain `render` callback inside a `TableColumn` definition.
 */

/** A whole number of a kind that is always well-defined (never `null`) - a conversation count, a
 * flows-started count, and so on. `previous` may legitimately be zero (a real "nothing happened last
 * period" fact, not a missing-data case - decisions.md's own "a zero on a report is information, not
 * hidden" rule), so the only branch this function needs is "cannot divide by zero", not "no data".
 */
export function formatCountComparison(current: number, previous: number, strings: ConsoleStrings): string {
  const delta = current - previous;
  const sign = delta >= 0 ? "+" : "";

  if (previous === 0) {
    return current === 0
      ? `${strings.analyticsPreviousPeriodLabel} 0 (${strings.analyticsComparisonNoChange})`
      : `${strings.analyticsPreviousPeriodLabel} 0 (${sign}${delta})`;
  }

  const relativePercent = (delta / previous) * 100;
  return `${strings.analyticsPreviousPeriodLabel} ${previous} (${sign}${delta}, ${sign}${relativePercent.toFixed(1)}%)`;
}

/**
 * A rate or percentage, where either side may genuinely be `null` - "nothing to compute a rate from
 * yet" (`ConversionBucketDto.conversionRate`/`TagBreakdownReportResponse.percentageTagged`'s own
 * convention), which is a different fact from a real `0`. `noDataValue` is the caller's own existing
 * "—"-shaped string (`conversionReportNoDataValue`/`tagBreakdownNoDataValue`) - reused rather than a
 * third copy of the same glyph, so every "no data" cell on a page reads identically.
 *
 * <b>A `null` `previous` never gets folded into "0%".</b> That is exactly the confusion decisions.md
 * §7 exists to prevent one level up (a bare rate with no fraction) - doing it here, silently, in a
 * comparison line would reintroduce the identical mistake through a side door.
 */
export function formatRateComparison(
  current: number | null,
  previous: number | null,
  strings: ConsoleStrings,
  noDataValue: string,
): string {
  const previousText = previous === null ? noDataValue : `${(previous * 100).toFixed(1)}%`;

  if (current === null || previous === null) {
    return `${strings.analyticsPreviousPeriodLabel} ${previousText}`;
  }

  const deltaPoints = (current - previous) * 100;
  const sign = deltaPoints >= 0 ? "+" : "";
  return `${strings.analyticsPreviousPeriodLabel} ${previousText} (${sign}${deltaPoints.toFixed(1)} ${strings.analyticsComparisonPointsSuffix})`;
}
