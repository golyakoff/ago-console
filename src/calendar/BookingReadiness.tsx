import { Link } from "react-router-dom";
import type { BookingPrecondition, CalendarReadiness } from "../api/calendarApi.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-23`: "a tenant setting the calendar up can tell, at any moment, whether a visitor could book
 * right now - and if not, which of the several things that must be true is not yet true"
 * (`flows.md` 3.1). Renders the server's own answer - `GET /booking-readiness` - verbatim: a list of
 * named preconditions with a met/unmet state each, never folded into one sentence.
 *
 * <b>The server decides which precondition is unmet; this component only decides where to point.</b>
 * `Ago.Calendar.Application`'s `GetBookingReadinessHandler` computes the six facts from the same
 * tables the booking path itself reads - re-deriving any of that here (e.g. "does this tenant have a
 * worker") would be a second, client-side copy of a conjunction the item's own scope explicitly
 * rejected ("this is one server-side read rather than six pieces of client-side cleverness"). This
 * component's only judgment call is `ROUTE_FOR`, a label plus a screen to send the tenant to - a
 * presentation decision, not a readiness one.
 *
 * <b>Rendered on both `/calendar/setup` and `/calendar/workers`</b> (the item's own Done-when), each
 * page fetching `getBookingReadiness` itself alongside its own existing `getConfiguration`/
 * `listWorkers` call - no shared fetch, no context, because the two screens already re-read after
 * every write independently and a third syncing mechanism would be more machinery than two GETs.
 */
export function BookingReadiness({ readiness }: { readiness: CalendarReadiness[] | null }) {
  const strings = useStrings();

  if (readiness === null || readiness.length === 0) {
    return null;
  }

  return (
    <Panel title={strings.calendarReadinessTitle}>
      <div className="ago-stack">
        {readiness.map((calendar, index) => (
          <CalendarReadinessCard
            key={calendar.calendarId ?? `none-${String(index)}`}
            calendar={calendar}
            strings={strings}
          />
        ))}
      </div>
    </Panel>
  );
}

function CalendarReadinessCard({
  calendar,
  strings,
}: {
  calendar: CalendarReadiness;
  strings: ConsoleStrings;
}) {
  return (
    <section className="ago-panel ago-panel--quiet">
      <div className="ago-panel__body ago-stack">
        <div className="ago-row">
          <strong>{calendar.calendarName ?? strings.calendarReadinessNoCalendarLabel}</strong>
          <Badge tone={calendar.isBookable ? "success" : "danger"}>
            {calendar.isBookable ? strings.calendarReadinessBookableLabel : strings.calendarReadinessNotBookableLabel}
          </Badge>
        </div>
        <ul className="ago-list">
          {calendar.preconditions.map((state) => (
            <li key={state.precondition}>
              <Badge tone={state.isMet ? "success" : "danger"}>
                {state.isMet ? strings.calendarReadinessMetLabel : strings.calendarReadinessUnmetLabel}
              </Badge>{" "}
              {preconditionLabel(state.precondition, strings)}
              {!state.isMet && (
                <>
                  {" — "}
                  <Link to={ROUTE_FOR[state.precondition]}>{preconditionLinkLabel(state.precondition, strings)}</Link>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Where each unmet precondition sends the tenant - the item's own Done-when ("links each unmet
 * precondition to its form"). `ServiceOffered` and `ScheduleSaved` point at `/calendar/workers`
 * rather than `/calendar/setup`, even though a service is *defined* on Setup: a service nobody
 * performs is not what this fact reports missing (`ServiceOffered` asks whether an active worker
 * *performs* one, which `CalendarWorkersPage`'s own worker card is where a tenant assigns) - and
 * `WorkingHoursConfigured` can be cleared from either screen (a Weekly worker's hours are added on
 * Setup; a Cycle worker's hours are its schedule, saved on Workers) but Setup owns the form named
 * "working hours" in the product's own words, so that is where this points.
 */
const ROUTE_FOR: Record<BookingPrecondition, string> = {
  CalendarPublished: "/calendar/setup",
  WorkerOnCalendar: "/calendar/workers",
  ServiceOffered: "/calendar/workers",
  WorkingHoursConfigured: "/calendar/setup",
  ScheduleSaved: "/calendar/workers",
  // No form fixes this one - materialisation is a background job, not a tenant action - so this
  // points at the one screen that shows what has and has not materialised (`20-15`).
  SlotsMaterialized: "/calendar/workers",
};

function preconditionLabel(precondition: BookingPrecondition, strings: ConsoleStrings): string {
  switch (precondition) {
    case "CalendarPublished":
      return strings.calendarReadinessCalendarPublishedLabel;
    case "WorkerOnCalendar":
      return strings.calendarReadinessWorkerOnCalendarLabel;
    case "ServiceOffered":
      return strings.calendarReadinessServiceOfferedLabel;
    case "WorkingHoursConfigured":
      return strings.calendarReadinessWorkingHoursConfiguredLabel;
    case "ScheduleSaved":
      return strings.calendarReadinessScheduleSavedLabel;
    case "SlotsMaterialized":
      return strings.calendarReadinessSlotsMaterializedLabel;
  }
}

function preconditionLinkLabel(precondition: BookingPrecondition, strings: ConsoleStrings): string {
  return precondition === "SlotsMaterialized" ? strings.calendarReadinessViewSlotsLink : strings.calendarReadinessFixItLink;
}
