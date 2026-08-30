/**
 * `18-10`: the three date-range presets its own backlog item names - calendar month, previous
 * calendar month, last 30 days - built once here so a second report (`18-11`'s own scope names the
 * same three presets, in case that item lands after this one) can reuse rather than re-derive them.
 *
 * <b>Client-side only, on purpose - there is no server-side "preset" concept.</b> Every preset here
 * resolves to a concrete `from`/`to` pair in the caller's own local time zone, sent through the exact
 * same `from`/`to` query parameters the free-form date fields already use
 * (`GetConversionReportForSite`'s own remarks, `ago-chat`). The server has no opinion about what
 * "this month" means - it only ever sees two ISO-8601 instants - and it always echoes back the range
 * it actually used, so a preset button is UX sugar over the existing contract, never a new one. The
 * alternative (a `preset=this-month` parameter the server resolves) would need the server to adopt an
 * opinion about the caller's time zone it has no other reason to hold, for a report that is a
 * date-range query and nothing else.
 *
 * <b>Local time, not UTC</b> - a calendar month boundary is a wall-clock concept ("the whole of
 * March"), and computing it in UTC would shift the boundary by the caller's own UTC offset, the same
 * reasoning `OperatorAnalyticsPage`'s own `startOfDayIso`/`endOfDayIso` helpers already apply to a
 * single day.
 */

export interface DateRangePreset {
  from: string;
  to: string;
}

/** The current calendar month so far - `from` is this month's first instant, `to` is `now` itself
 * (not the theoretical end of the month, which has not happened yet and would report on a range that
 * includes no real data past the current moment anyway). */
export function currentCalendarMonth(now: Date): DateRangePreset {
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: now.toISOString() };
}

/** The complete previous calendar month - `from` its first instant, `to` (exclusive) this month's
 * first instant, so the range covers every day of that month and nothing of this one. */
export function previousCalendarMonth(now: Date): DateRangePreset {
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The trailing thirty days up to `now` - the same width `GetConversionReportForSiteHandler.
 * DefaultWindowDays`/`GetOperatorAnalyticsForSiteHandler.DefaultWindowDays` already default to when no
 * range is named at all, offered here as an explicit, nameable choice rather than only an implicit
 * one. */
export function last30Days(now: Date): DateRangePreset {
  const from = new Date(now.getTime());
  from.setDate(from.getDate() - 30);
  return { from: from.toISOString(), to: now.toISOString() };
}
