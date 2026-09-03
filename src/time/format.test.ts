import { describe, expect, it } from "vitest";
import { ru } from "../i18n/ru.js";
import {
  dayKey,
  formatAbsolute,
  formatClockTime,
  formatDateStamp,
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

  it("renders identical digits in Russian - only the words elsewhere in this file change with locale", () => {
    // `343`: `hourCycle: "h23"` is forced regardless of `strings.dateIntlLocale`, so a clock time -
    // digits only, no weekday/month word - is the one rendering in this file genuinely locale-
    // invariant. Proven rather than assumed, the same discipline every other locale test here uses.
    expect(formatClockTime(new Date("2026-08-24T11:03:00+00:00"), MOSCOW, ru)).toBe("14:03");
  });
});

describe("formatAbsolute", () => {
  it("always carries a zone label - an unlabelled timestamp shown to a human is a defect", () => {
    const rendered = formatAbsolute(new Date("2026-08-24T11:03:00+00:00"), MOSCOW);

    expect(rendered).toContain("24 August 2026");
    expect(rendered).toContain("14:03");
    // `343`: `timeZoneName: "long"`, not `"short"` - see `format.ts`'s own header for why a bare
    // "GMT+3" was replaced with the zone spelled out. "Moscow Standard Time" is the label this
    // specific zone/instant/locale combination renders, proven against real `Intl` output rather
    // than assumed.
    expect(rendered).toContain("Moscow Standard Time");
  });

  it("labels the unknown-zone fallback as UTC rather than rendering it bare", () => {
    expect(formatAbsolute(new Date("2026-08-24T11:03:00+00:00"), null)).toContain("Coordinated Universal Time");
  });

  // `343`: the constraint that does not move - `docs/conventions/date-and-time.md` rule 5 still
  // requires a zone label once the words around it are Russian, and translating them must not
  // quietly drop it (the backlog item's own "what must be demonstrated rather than asserted"). Each
  // test below fails if the label disappears, not just if the words stay English.
  describe("locale (343)", () => {
    it("renders in Russian while still carrying its zone label", () => {
      const rendered = formatAbsolute(new Date("2026-08-24T11:03:00+00:00"), MOSCOW, ru);

      // The date, the connective word and the zone name are all Russian - not just the zone.
      expect(rendered).toContain("24 августа 2026");
      expect(rendered).toContain("14:03");
      expect(rendered).toContain("Москва, стандартное время");
      // The specific regression this test exists to catch: a translation that renders the words but
      // silently drops the zone label reads as a plausible, label-less timestamp - exactly the
      // defect `date-and-time.md` rule 5 exists to prevent - so this asserts the label's actual text
      // is present, not merely that the string is non-empty.
      expect(rendered).not.toBe("24 августа 2026 г. в 14:03");
    });

    it("still labels the unknown-zone fallback as UTC once rendered in Russian", () => {
      const rendered = formatAbsolute(new Date("2026-08-24T11:03:00+00:00"), null, ru);

      expect(rendered).toContain("Всемирное координированное время");
    });

    it("keeps the 24-hour clock and day-before-month order in Russian - ru-RU is not a drop-in", () => {
      // `date-and-time.md`: a locale that reintroduced a 12-hour clock or month-before-day here would
      // change what an operator reads under time pressure. `hourCycle: "h23"` and the explicit field
      // order in `format.ts` fix both regardless of locale - this proves it against real `Intl`
      // output for `ru-RU` specifically, not just for the `en-GB` default every other test above uses.
      const rendered = formatAbsolute(new Date("2026-08-24T22:15:00+00:00"), MOSCOW, ru);

      expect(rendered).toContain("25 августа 2026"); // day-before-month, and past local midnight
      expect(rendered).toContain("01:15"); // 24-hour clock, never "1:15 AM"/"01:15 ДП"
    });
  });
});

describe("formatDateStamp", () => {
  it("renders a short calendar date", () => {
    expect(formatDateStamp(new Date("2026-08-24T11:03:00+00:00"), "UTC")).toBe("24 Aug 2026");
  });

  it("takes the date from the rendering zone, not from the ISO string's UTC day", () => {
    // 22:30 UTC on the 24th is already the 25th in Moscow - a table column that showed "24 Aug" to
    // a Moscow reader would disagree with every other timestamp in the console.
    expect(formatDateStamp(new Date("2026-08-24T22:30:00+00:00"), MOSCOW)).toBe("25 Aug 2026");
  });

  it("falls back to the UTC date when no zone is known", () => {
    expect(formatDateStamp(new Date("2026-08-24T22:30:00+00:00"), null)).toBe("24 Aug 2026");
  });

  it("renders the month name in Russian when asked", () => {
    expect(formatDateStamp(new Date("2026-08-24T11:03:00+00:00"), MOSCOW, ru)).toBe("24 авг. 2026 г.");
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

  describe("locale (343)", () => {
    it("says Сегодня/Вчера instead of Today/Yesterday", () => {
      expect(formatDayLabel(new Date("2026-08-24T05:00:00+00:00"), now, MOSCOW, ru)).toBe("Сегодня");
      expect(formatDayLabel(new Date("2026-08-23T20:00:00+00:00"), now, MOSCOW, ru)).toBe("Вчера");
    });

    it("names the weekday and month in Russian for anything older within the same year", () => {
      expect(formatDayLabel(new Date("2026-08-21T09:00:00+00:00"), now, MOSCOW, ru)).toBe("пятница, 21 августа");
    });

    it("includes the year once it differs, in Russian", () => {
      expect(formatDayLabel(new Date("2025-12-31T09:00:00+00:00"), now, MOSCOW, ru)).toBe("31 декабря 2025 г.");
    });
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

  it("says только что instead of just now, and leaves the digit-plus-letter shapes untouched", () => {
    // `343`: `formatElapsed`'s own doc comment states why - `just now` is the one real word here,
    // `4m`/`1h 12m` stay locale-invariant unit letters.
    expect(formatElapsed(new Date("2026-08-24T11:59:30+00:00"), now, ru)).toBe("только что");
    expect(formatElapsed(new Date("2026-08-24T10:48:00+00:00"), now, ru)).toBe("1h 12m");
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

  describe("locale (343)", () => {
    it("spells the duration out in Russian, singular and plural", () => {
      // The binary singular/plural convention `strings.elapsedMinuteOne`'s own doc comment describes -
      // not full Russian plural grammar, the same simplification `queueUnreadMessageOne`/`Other`
      // already accepted elsewhere in this codebase.
      expect(formatElapsedWords(new Date("2026-08-24T11:59:00+00:00"), now, ru)).toBe("1 минута");
      expect(formatElapsedWords(new Date("2026-08-24T11:45:00+00:00"), now, ru)).toBe("15 минут");
      expect(formatElapsedWords(new Date("2026-08-24T11:00:00+00:00"), now, ru)).toBe("1 час");
      // "2 дней" - the binary convention's known imprecision (proper Russian grammar wants "2 дня"
      // for this count), not a bug: `strings.elapsedDayOther`'s own doc comment names this trade-off
      // explicitly, matching `queueUnreadMessageOther`'s existing, already-accepted behaviour for the
      // identical count.
      expect(formatElapsedWords(new Date("2026-08-22T12:00:00+00:00"), now, ru)).toBe("2 дней");
    });

    it("has its own floor below a minute, in Russian", () => {
      expect(formatElapsedWords(new Date("2026-08-24T11:59:59+00:00"), now, ru)).toBe("меньше минуты");
    });
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
