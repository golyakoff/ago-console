import type { BookingPrecondition, CalendarReadiness } from "../api/calendarApi.js";

/**
 * `26-329`/`26-318`: the guided setup wizard's own steps, at `/calendar/setup/guide`. This module is
 * the one place that decides *which* step a tenant is on - a pure function of the server's own
 * `GET /booking-readiness` answer (plus one console-only fact, whether a booking trigger word is set)
 * and nothing else. No local "onboarding progress" is stored anywhere: the wizard and
 * `BookingReadiness.tsx`'s own panel (rendered on `/calendar/setup` and `/calendar/masters`) read the
 * identical server fact, so the two can never disagree about what is left to do, and leaving the
 * wizard and coming back simply re-derives the same step from the same read (`26-318`'s own Done-when:
 * "the wizard and the readiness panel share one source of truth for 'what's missing'").
 *
 * <b>Why a pure function, not a component.</b> `CalendarSetupGuidePage.tsx` is one `useEffect`, one
 * `switch`, and a handful of step components - every decision about *which* branch that `switch` takes
 * lives here instead, where it can be driven with plain data and asserted against every precondition
 * combination without mounting React at all (`docs/conventions/testing.md`: a decision with no I/O of
 * its own is a Domain-shaped unit test, not an Application-shaped one, even sitting in a console
 * repository that has neither layer literally named).
 */
export type WizardStepId =
  | "create-calendar"
  | "add-master"
  | "add-service"
  | "working-hours"
  | "confirm-schedule"
  | "materializing"
  | "booking-trigger"
  | "publish"
  | "done";

/**
 * `GetBookingReadinessHandler.Order` (`ago-calendar`), mirrored exactly - fill order, not
 * `BookingPrecondition`'s own wire/enum order (`CalendarPublished` first). `BookingReadiness.tsx`'s
 * `ROUTE_FOR` already reads each of these five precondition keys; this is that same set, in the
 * server's own gating order, each mapped onto the wizard step that fixes it instead of onto a
 * classic-screen route. `CalendarPublished` is deliberately not a key here - see
 * {@link deriveWizardStep}'s own remarks for why it is handled after this list, not inside it.
 */
const PRECONDITION_STEPS: readonly [Exclude<BookingPrecondition, "CalendarPublished">, WizardStepId][] = [
  ["WorkerOnCalendar", "add-master"],
  ["ServiceOffered", "add-service"],
  ["WorkingHoursConfigured", "working-hours"],
  ["ScheduleSaved", "confirm-schedule"],
  ["SlotsMaterialized", "materializing"],
];

/**
 * `undefined` while the readiness read has not resolved yet (the caller renders a loading state) -
 * never a step of its own, because "loading" is not a place in the funnel.
 *
 * <p><b>The wizard only ever walks one calendar</b> - `readiness[0]`, the tenant's first (v1 has no
 * multi-calendar UI to choose a second one from). A tenant with several calendars finishes the rest on
 * the classic screens, the same "the wizard is a fast path, not the only path" reasoning that governs
 * every step below.</p>
 *
 * <p><b>`hasBookingTrigger` is not a `BookingPrecondition`.</b> Decision 6 (`26-329`'s own scope) gates
 * "done" on a booking trigger word existing, deliberately as a console-only wizard gate rather than a
 * seventh server-side precondition - the server's own readiness answer says nothing about it, on
 * purpose, so this parameter is the one fact `deriveWizardStep` takes from anywhere but `readiness`.
 * Checked <em>before</em> `CalendarPublished`: publishing with no trigger word would make a calendar
 * "bookable" by the readiness read's own definition while a visitor still has no way to reach it - the
 * widget's booking chip is the only entry point (`BookingsModulePage.tsx`'s own remarks), so a trigger
 * word is worth blocking on even though `isBookable` alone would say yes.</p>
 */
export function deriveWizardStep(
  readiness: CalendarReadiness[] | null,
  hasBookingTrigger: boolean,
): WizardStepId | undefined {
  if (readiness === null || readiness.length === 0) {
    return undefined;
  }

  const calendar = readiness[0];
  if (calendar.calendarId === null) {
    return "create-calendar";
  }

  for (const [precondition, step] of PRECONDITION_STEPS) {
    const state = calendar.preconditions.find((candidate) => candidate.precondition === precondition);
    if (state !== undefined && !state.isMet) {
      return step;
    }
  }

  if (!hasBookingTrigger) {
    return "booking-trigger";
  }

  const published = calendar.preconditions.find((candidate) => candidate.precondition === "CalendarPublished");
  if (published !== undefined && !published.isMet) {
    return "publish";
  }

  return "done";
}
