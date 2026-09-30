import type { BookingPrecondition } from "../api/calendarApi.js";

/**
 * Where each unmet precondition sends the tenant - `BookingReadiness.tsx`'s own Done-when ("links each
 * unmet precondition to its form"). Pulled into its own module, rather than declared inside
 * `BookingReadiness.tsx`, purely for `react-refresh/only-export-components`: a component file may only
 * export components once Fast Refresh is enforced, and `26-329`'s `CalendarSetupGuidePage.tsx` needed
 * this same map - see that file's own doc comment for why a second one was the wrong answer.
 *
 * `ServiceOffered` and `ScheduleSaved` point at `/calendar/masters` rather than `/calendar/setup`, even
 * though a service is *defined* on Setup: a service nobody performs is not what this fact reports
 * missing (`ServiceOffered` asks whether an active worker *performs* one, which `CalendarWorkersPage`'s
 * own worker card is where a tenant assigns) - and `WorkingHoursConfigured` can be cleared from either
 * screen (a Weekly worker's hours are added on Setup; a Cycle worker's hours are its schedule, saved on
 * Workers) but Setup owns the form named "working hours" in the product's own words, so that is where
 * this points.
 */
export const ROUTE_FOR: Record<BookingPrecondition, string> = {
  CalendarPublished: "/calendar/setup",
  WorkerOnCalendar: "/calendar/masters",
  ServiceOffered: "/calendar/masters",
  WorkingHoursConfigured: "/calendar/setup",
  ScheduleSaved: "/calendar/masters",
  // No form fixes this one - materialisation is a background job, not a tenant action - so this
  // points at the one screen that shows what has and has not materialised (`20-15`).
  SlotsMaterialized: "/calendar/masters",
};
