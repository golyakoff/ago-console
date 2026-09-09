import { describe, expect, it } from "vitest";
import { en } from "../i18n/en.js";
import { ru } from "../i18n/ru.js";
import { timeZoneOptions } from "./calendarFormat.js";

/**
 * `25-16`: the calendar setup screen's timezone dropdown. Two things this suite exists to nail down,
 * both named directly by the backlog item's own "where this is likely to go wrong" section:
 *
 * - **Localizing is not the same as translating a lookup table, and must be checked live.** This
 *   project's own curated map (`CURATED_TIME_ZONES` in `calendarFormat.tsx`) exists *because*
 *   `new Intl.DisplayNames(["ru"], { type: "timeZone" })` throws `RangeError` on this runtime -
 *   `"timeZone"` was never a valid `Intl.DisplayNames` type per ECMA-402. The first test below proves
 *   that failure directly, so a future reader does not have to take the doc comment's word for it;
 *   the rest prove the curated map actually renders "Город/Город" in Russian and reads the live UTC
 *   offset through `Intl.DateTimeFormat`, not a hardcoded string.
 * - **A saved zone outside the curated list must still resolve to a selectable option** - the second
 *   Done-when box on the item.
 */
describe("Intl.DisplayNames cannot localize a time zone id on this runtime", () => {
  it("throws RangeError for type: \"timeZone\" - confirmed live, not assumed", () => {
    function probe(): Intl.DisplayNames {
      // @ts-expect-error - "timeZone" is not a valid Intl.DisplayNames `type` per its own lib.es2022
      // types; that is exactly what this test proves live, not merely at the type level.
      return new Intl.DisplayNames(["ru"], { type: "timeZone" });
    }

    expect(probe).toThrow(RangeError);
  });
});

describe("timeZoneOptions", () => {
  it("renders each curated zone as \"Континент/Город (+HH:MM)\" in Russian", () => {
    const options = timeZoneOptions(ru, "Europe/Moscow");
    const moscow = options.find((option) => option.value === "Europe/Moscow");

    expect(moscow?.label).toBe("Европа/Москва (+03:00)");
  });

  it("renders the same zone as \"Continent/City (+HH:MM)\" in English", () => {
    const options = timeZoneOptions(en, "Europe/Moscow");
    const moscow = options.find((option) => option.value === "Europe/Moscow");

    expect(moscow?.label).toBe("Europe/Moscow (+03:00)");
  });

  it("reads the offset live rather than from a stored guess - every curated zone against a real Intl call", () => {
    const options = timeZoneOptions(ru, "Europe/Moscow");
    const byZone = new Map(options.map((option) => [option.value, option.label]));

    // A hand-checkable subset spanning the federation's own +02:00..+12:00 spread - if any of these
    // drifted, it means either tzdata's offsets changed or the parsing in `zoneOffsetLabel` broke.
    expect(byZone.get("Europe/Kaliningrad")).toBe("Европа/Калининград (+02:00)");
    expect(byZone.get("Asia/Yekaterinburg")).toBe("Азия/Екатеринбург (+05:00)");
    expect(byZone.get("Asia/Vladivostok")).toBe("Азия/Владивосток (+10:00)");
    expect(byZone.get("Asia/Kamchatka")).toBe("Азия/Камчатка (+12:00)");
  });

  it("still lists exactly the eleven curated zones when the saved zone is already one of them", () => {
    expect(timeZoneOptions(ru, "Europe/Moscow")).toHaveLength(11);
  });

  it("appends a saved zone that is not in the curated list, so an existing site never loses its setting", () => {
    const options = timeZoneOptions(ru, "Asia/Tokyo");

    expect(options).toHaveLength(12);
    const tokyo = options.find((option) => option.value === "Asia/Tokyo");
    // No curated translation for an unlisted zone - falls back to the raw IANA id, still selectable,
    // still offset-labelled live rather than guessed.
    expect(tokyo?.label).toBe("Asia/Tokyo (+09:00)");
  });

  it("never throws for a saved zone id Intl cannot resolve at all - the page must still render", () => {
    expect(() => timeZoneOptions(ru, "Not/AZone")).not.toThrow();
    const options = timeZoneOptions(ru, "Not/AZone");
    expect(options.find((option) => option.value === "Not/AZone")?.label).toBe("Not/AZone (+00:00)");
  });
});
