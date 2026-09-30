import { describe, expect, it } from "vitest";
import type { BookingPrecondition, CalendarReadiness, PreconditionState } from "../api/calendarApi.js";
import { deriveWizardStep } from "./setupWizardStep.js";

/**
 * `26-329`: the wizard's entire "which step am I on" decision, exercised with no React and no network -
 * see `setupWizardStep.ts`'s own doc comment for why this is a plain function in the first place.
 * Covers every place the loop over `PRECONDITION_STEPS` can stop (one test per precondition, as the
 * first unmet one, with everything before it met and everything after it deliberately mixed so the
 * function is proven to stop at the *first* gap rather than the last), plus the three states outside
 * that loop (null-calendar sentinel, the booking-trigger gate, and `CalendarPublished`) and the two
 * "nothing to derive yet" inputs.
 */

const ORDER: BookingPrecondition[] = [
  "WorkerOnCalendar",
  "ServiceOffered",
  "WorkingHoursConfigured",
  "ScheduleSaved",
  "SlotsMaterialized",
  "CalendarPublished",
];

/** Builds one calendar's own preconditions list, every entry met except the ones named - the same
 * stable order `GetBookingReadinessHandler` always returns them in. */
function preconditions(unmet: BookingPrecondition[]): PreconditionState[] {
  return ORDER.map((precondition) => ({ precondition, isMet: !unmet.includes(precondition) }));
}

function readinessWith(unmet: BookingPrecondition[]): CalendarReadiness[] {
  return [
    {
      calendarId: "cal-1",
      calendarName: "Main",
      isBookable: unmet.length === 0,
      preconditions: preconditions(unmet),
    },
  ];
}

const NOTHING_CONFIGURED: CalendarReadiness[] = [
  { calendarId: null, calendarName: null, isBookable: false, preconditions: preconditions(ORDER) },
];

describe("deriveWizardStep", () => {
  it("returns undefined while readiness has not loaded yet", () => {
    expect(deriveWizardStep(null, true)).toBeUndefined();
  });

  it("returns undefined for an empty readiness list", () => {
    expect(deriveWizardStep([], true)).toBeUndefined();
  });

  it("sends a tenant with no calendar at all to create-calendar, regardless of the trigger word", () => {
    expect(deriveWizardStep(NOTHING_CONFIGURED, false)).toBe("create-calendar");
    expect(deriveWizardStep(NOTHING_CONFIGURED, true)).toBe("create-calendar");
  });

  it("stops at WorkerOnCalendar when it is the first unmet precondition", () => {
    // Later preconditions mixed (some met, some not) - proves the loop stops at the first gap, not
    // the first `false` it happens to see while scanning the whole list.
    const readiness = readinessWith(["WorkerOnCalendar", "ScheduleSaved"]);
    expect(deriveWizardStep(readiness, true)).toBe("add-master");
  });

  it("stops at ServiceOffered once WorkerOnCalendar is met", () => {
    const readiness = readinessWith(["ServiceOffered", "SlotsMaterialized"]);
    expect(deriveWizardStep(readiness, true)).toBe("add-service");
  });

  it("stops at WorkingHoursConfigured once Worker/Service are met", () => {
    const readiness = readinessWith(["WorkingHoursConfigured"]);
    expect(deriveWizardStep(readiness, true)).toBe("working-hours");
  });

  it("stops at ScheduleSaved once Worker/Service/Hours are met", () => {
    const readiness = readinessWith(["ScheduleSaved"]);
    expect(deriveWizardStep(readiness, true)).toBe("confirm-schedule");
  });

  it("stops at SlotsMaterialized once every earlier precondition is met", () => {
    const readiness = readinessWith(["SlotsMaterialized"]);
    expect(deriveWizardStep(readiness, true)).toBe("materializing");
  });

  it("gates on the booking trigger before publish, once every readiness precondition but publish is met", () => {
    const readiness = readinessWith(["CalendarPublished"]);
    expect(deriveWizardStep(readiness, false)).toBe("booking-trigger");
  });

  // Decision 6: the trigger gate applies even once the calendar is fully bookable by the server's own
  // readiness answer - "done" requires a way in, not just a met precondition list.
  it("gates on the booking trigger even when every precondition, including publish, is already met", () => {
    const readiness = readinessWith([]);
    expect(deriveWizardStep(readiness, false)).toBe("booking-trigger");
  });

  it("moves to publish once the trigger word exists and only CalendarPublished is unmet", () => {
    const readiness = readinessWith(["CalendarPublished"]);
    expect(deriveWizardStep(readiness, true)).toBe("publish");
  });

  it("reaches done once every precondition is met and the trigger word exists", () => {
    const readiness = readinessWith([]);
    expect(deriveWizardStep(readiness, true)).toBe("done");
  });

  it("only ever reads the first calendar in the list", () => {
    const readiness: CalendarReadiness[] = [
      ...readinessWith([]),
      { calendarId: "cal-2", calendarName: "Second", isBookable: false, preconditions: preconditions(ORDER) },
    ];
    expect(deriveWizardStep(readiness, true)).toBe("done");
  });
});
