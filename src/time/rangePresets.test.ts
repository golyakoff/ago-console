import { describe, expect, it } from "vitest";
import { currentCalendarMonth, last30Days, previousCalendarMonth } from "./rangePresets.js";

// Local time throughout, deliberately - these presets resolve calendar-month boundaries in the
// caller's own wall-clock time (this file's own doc comment), so every assertion below reads back
// through `Date`'s local getters rather than pinning a specific IANA zone the way `format.test.ts`
// does for `formatDayLabel`'s rendering-zone question - a genuinely different concern from this file's
// "which month is 'this month'" one.

describe("currentCalendarMonth", () => {
  it("starts at this month's first instant and ends at now", () => {
    const now = new Date(2026, 5, 15, 14, 30, 0); // 15 June 2026, 14:30 local

    const { from, to } = currentCalendarMonth(now);

    const fromDate = new Date(from);
    expect(fromDate.getFullYear()).toBe(2026);
    expect(fromDate.getMonth()).toBe(5); // June
    expect(fromDate.getDate()).toBe(1);
    expect(fromDate.getHours()).toBe(0);
    expect(to).toBe(now.toISOString());
  });

  it("on the first of the month, from and the day-part of to are the same day", () => {
    const now = new Date(2026, 2, 1, 9, 0, 0); // 1 March 2026, 09:00 local

    const { from, to } = currentCalendarMonth(now);

    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getDate()).toBe(1);
  });
});

describe("previousCalendarMonth", () => {
  it("covers the whole of the month before now's month, and nothing of this one", () => {
    const now = new Date(2026, 5, 15, 14, 30, 0); // 15 June 2026

    const { from, to } = previousCalendarMonth(now);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect(fromDate.getFullYear()).toBe(2026);
    expect(fromDate.getMonth()).toBe(4); // May
    expect(fromDate.getDate()).toBe(1);
    // `to` is exclusive and lands exactly on this month's first instant - the same boundary
    // `currentCalendarMonth`'s own `from` computes, so the two presets tile without a gap or overlap.
    expect(toDate.getFullYear()).toBe(2026);
    expect(toDate.getMonth()).toBe(5); // June
    expect(toDate.getDate()).toBe(1);
  });

  it("rolls back across a year boundary - January's previous month is last December", () => {
    const now = new Date(2026, 0, 10, 12, 0, 0); // 10 January 2026

    const { from, to } = previousCalendarMonth(now);

    const fromDate = new Date(from);
    const toDate = new Date(to);
    expect(fromDate.getFullYear()).toBe(2025);
    expect(fromDate.getMonth()).toBe(11); // December
    expect(fromDate.getDate()).toBe(1);
    expect(toDate.getFullYear()).toBe(2026);
    expect(toDate.getMonth()).toBe(0); // January
  });
});

describe("last30Days", () => {
  it("spans exactly thirty days up to now", () => {
    const now = new Date(2026, 5, 15, 14, 30, 0);

    const { from, to } = last30Days(now);

    expect(to).toBe(now.toISOString());
    const spanMs = now.getTime() - new Date(from).getTime();
    const spanDays = spanMs / (24 * 60 * 60 * 1000);
    expect(spanDays).toBeCloseTo(30, 5);
  });
});
