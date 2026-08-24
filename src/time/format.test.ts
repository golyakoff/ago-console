import { describe, expect, it } from "vitest";
import {
  dayKey,
  formatAbsolute,
  formatClockTime,
  formatDayLabel,
  formatElapsed,
  formatElapsedWords,
  parseInstant,
} from "./format.js";

/** A real IANA zone with a real spring-forward, so the DST cases below are not hypothetical:
 * Europe/Berlin moves CET (+01:00) to CEST (+02:00) at 01:00 UTC on 2026-03-29, and local clocks
 * jump straight from 01:59 to 03:00. `date-and-time.md`'s test note ("at least one test runs across
 * a DST boundary in a non-UTC zone; if that test never existed, the code has not been proven") is
 * what these exist for. */
const BERLIN = "Europe/Berlin";
const MOSCOW = "Europe/Moscow"; // +03:00 all year - no DST, so it isolates the plain-offset cases.

describe("dayKey", () => {
  it("keys by the day in the rendering zone, not by the UTC day", () => {
    // 22:30 UTC on the 24th is already 01:30 on the 25th in Moscow. Deriving the day from the ISO
    // string's own date part - the obvious shortcut - gets this wrong for every user east of
    // Greenwich after their local midnight.
    const instant = new Date("2026-08-24T22:30:00+00:00");

    expect(dayKey(instant, "UTC")).toBe("2026-08-24");
    expect(dayKey(instant, MOSCOW)).toBe("2026-08-25");
  });

  it("falls back to the UTC day when no zone is known", () => {
    expect(dayKey(new Date("2026-08-24T22:30:00+00:00"), null)).toBe("2026-08-24");
  });
});

describe("formatClockTime", () => {
  it("renders a 24-hour clock time in the given zone", () => {
    expect(formatClockTime(new Date("2026-08-24T11:03:00+00:00"), MOSCOW)).toBe("14:03");
  });

  it("renders UTC when the zone is unknown", () => {
    expect(formatClockTime(new Date("2026-08-24T11:03:00+00:00"), null)).toBe("11:03");
  });

  it("follows the zone across a DST transition rather than a fixed offset", () => {
    // Half an hour either side of Berlin's 2026 spring-forward. A cached +01:00 offset would render
    // the second one as 02:30 - a wall-clock time that does not exist on that date.
    expect(formatClockTime(new Date("2026-03-29T00:30:00+00:00"), BERLIN)).toBe("01:30");
    expect(formatClockTime(new Date("2026-03-29T01:30:00+00:00"), BERLIN)).toBe("03:30");
  });
});

describe("formatAbsolute", () => {
  it("always carries a zone label - an unlabelled timestamp shown to a human is a defect", () => {
    const rendered = formatAbsolute(new Date("2026-08-24T11:03:00+00:00"), MOSCOW);

    expect(rendered).toContain("24 August 2026");
    expect(rendered).toContain("14:03");
    expect(rendered).toMatch(/GMT\+3/);
  });

  it("labels the unknown-zone fallback as UTC rather than rendering it bare", () => {
    expect(formatAbsolute(new Date("2026-08-24T11:03:00+00:00"), null)).toContain("UTC");
  });
});

describe("formatDayLabel", () => {
  const now = new Date("2026-08-24T11:03:00+00:00");

  it("says Today for an instant on the same day in the rendering zone", () => {
    expect(formatDayLabel(new Date("2026-08-24T05:00:00+00:00"), now, MOSCOW)).toBe("Today");
  });

  it("says Yesterday for the previous day in the rendering zone", () => {
    expect(formatDayLabel(new Date("2026-08-23T20:00:00+00:00"), now, MOSCOW)).toBe("Yesterday");
  });

  it("names the weekday and date for anything older within the same year", () => {
    expect(formatDayLabel(new Date("2026-08-21T09:00:00+00:00"), now, MOSCOW)).toBe("Friday 21 August");
  });

  it("includes the year once it differs, and drops the weekday nobody needs that far back", () => {
    expect(formatDayLabel(new Date("2025-12-31T09:00:00+00:00"), now, MOSCOW)).toBe("31 December 2025");
  });

  it("computes Today and Yesterday across a spring-forward, where a 24-hour step is not a day", () => {
    // 14:00 CEST on 29 March 2026, the day Berlin loses an hour.
    const nowInBerlin = new Date("2026-03-29T12:00:00+00:00");

    // 00:30 CET on the 29th - still "today" locally even though it is the 28th in UTC.
    expect(formatDayLabel(new Date("2026-03-28T23:30:00+00:00"), nowInBerlin, BERLIN)).toBe("Today");
    // 23:30 CET on the 28th - the previous local day, on a day that was only 23 hours long.
    expect(formatDayLabel(new Date("2026-03-28T22:30:00+00:00"), nowInBerlin, BERLIN)).toBe("Yesterday");
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-08-24T12:00:00+00:00");

  it("says just now below a minute", () => {
    expect(formatElapsed(new Date("2026-08-24T11:59:30+00:00"), now)).toBe("just now");
  });

  it("rounds towards the past rather than up - 119 seconds is one minute, not two", () => {
    expect(formatElapsed(new Date("2026-08-24T11:58:01+00:00"), now)).toBe("1m");
  });

  it("renders hours with minutes, and drops an empty minutes part", () => {
    expect(formatElapsed(new Date("2026-08-24T10:48:00+00:00"), now)).toBe("1h 12m");
    expect(formatElapsed(new Date("2026-08-24T09:00:00+00:00"), now)).toBe("3h");
  });

  it("renders days with hours past a day", () => {
    expect(formatElapsed(new Date("2026-08-22T09:00:00+00:00"), now)).toBe("2d 3h");
  });

  it("clamps a future instant instead of rendering a negative age", () => {
    // The browser clock and the server clock are two different clocks; a browser running a few
    // seconds slow legitimately produces this, and "-3s" would be a bug on screen.
    expect(formatElapsed(new Date("2026-08-24T12:00:30+00:00"), now)).toBe("just now");
  });

  it("measures the instant, not the wall clock, across a DST transition", () => {
    // Two hours of real time that the local clock renders as 01:30 -> 04:30 in Berlin.
    const from = new Date("2026-03-29T00:30:00+00:00");
    const to = new Date("2026-03-29T02:30:00+00:00");

    expect(formatElapsed(from, to)).toBe("2h");
  });
});

describe("formatElapsedWords", () => {
  const now = new Date("2026-08-24T12:00:00+00:00");

  it("spells the duration out, singular and plural", () => {
    expect(formatElapsedWords(new Date("2026-08-24T11:59:00+00:00"), now)).toBe("1 minute");
    expect(formatElapsedWords(new Date("2026-08-24T11:45:00+00:00"), now)).toBe("15 minutes");
    expect(formatElapsedWords(new Date("2026-08-24T11:00:00+00:00"), now)).toBe("1 hour");
    expect(formatElapsedWords(new Date("2026-08-22T12:00:00+00:00"), now)).toBe("2 days");
  });

  it("has its own floor below a minute", () => {
    expect(formatElapsedWords(new Date("2026-08-24T11:59:59+00:00"), now)).toBe("less than a minute");
  });
});

describe("parseInstant", () => {
  it("parses the wire format - ISO-8601 with an explicit offset", () => {
    expect(parseInstant("2026-08-24T11:03:00+00:00")?.toISOString()).toBe("2026-08-24T11:03:00.000Z");
  });

  it("returns null rather than an Invalid Date that would render as text three components later", () => {
    expect(parseInstant("not a timestamp")).toBeNull();
    expect(parseInstant(null)).toBeNull();
    expect(parseInstant(undefined)).toBeNull();
  });
});
