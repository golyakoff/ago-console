import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getPersonBookings, type PersonBooking } from "../api/calendarApi.js";
import { splitBookings } from "../calendar/calendarFormat.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

export interface VisitorBookingsPanelProps {
  /** `adr/0184`: chat's `Visitor` *is* the account-scoped `Person` - the identical id, no lookup
   * needed. `null` while the queue row for this conversation has not loaded yet (`VisitorPanel`'s own
   * `visitorId`, threaded straight through). */
  personId: string | null;
  accessToken: string | null;
}

/** Russian's three-way plural (1 / 2-4 / 5+), the same shape `calendarFormat.tsx`'s `noShowWord` and
 * `WorkerScheduleSection`'s `slotWord` already establish for a counted noun next to a number. */
function upcomingBookingsWord(strings: ConsoleStrings, count: number): string {
  if (count === 1) {
    return strings.visitorBookingsWordOne;
  }
  return count < 5 ? strings.visitorBookingsWordFew : strings.visitorBookingsWordMany;
}

/**
 * `26-272` T3: the dialog -> client-record edge `26-272-console-usability-parity.md` §3.3 names as the
 * booking<->dialog<->client triangle's missing third side. `26-269` already built client -> dialog and
 * client -> booking (its client-detail hub, `CalendarClientDetailPage`); this is the reverse - from an
 * open conversation, "does this visitor have an upcoming booking, and where is their client card."
 *
 * <b>Reuses `26-269`'s own per-person read, adds no new one.</b> `getPersonBookings` is the identical
 * call `CalendarClientDetailPage` already makes; this panel only asks the same question from the other
 * surface. Its past-vs-future split reuses `calendarFormat.tsx`'s shared `splitBookings` - the same
 * function that page's own Предстоящие/Прошедшие split calls - rather than a second, possibly-drifting
 * copy of the same "a booking with an unparseable `startsAt` sorts into the past" rule.
 *
 * <b>A count, not a second list.</b> The design doc's own §3.3 recommendation, settled rather than left
 * open: link to the `26-269` client-detail hub instead of rendering booking rows here too - "one hub,
 * not two divergent booking views to keep in sync," the same discipline `renderPersonName`/`renderPhone`
 * reuse already follows elsewhere in the calendar surface.
 *
 * <b>Gated exactly like the Клиенты screens, not a new rule.</b> `calendar:configure` or
 * `customer:read` plus `config.calendarApiBaseUrl !== null` - `CalendarContactsPage`'s own gate,
 * reused verbatim - so a tenant with no calendar module, or an operator without the permission, sees no
 * trace of this section at all rather than an empty or broken one (the item's own "degrade gracefully"
 * instruction).
 *
 * <b>Degrades silently on a failed read, per `adr/0184`.</b> This is a chat-side display read of a
 * calendar fact ("reads are display-only and console-side... degrades to 'name not shown yet', never to
 * a failed booking" - adr/0184 consequence 4/negative). A failed fetch here empties the count, not an
 * `Alert` in a panel whose only job is a compact hint; the link to the full hub still renders, where a
 * retry (the page's own refresh button) is available.
 */
export function VisitorBookingsPanel({ personId, accessToken }: VisitorBookingsPanelProps) {
  const { hasPermission } = usePermissions();
  const strings = useStrings();
  const [bookings, setBookings] = useState<PersonBooking[] | null>(null);
  // `CalendarClientDetailPage`'s own `useState(() => new Date())` shape: `Date.now()` is an impure call
  // and may not run during render (`react-hooks/purity`) - resolved once per mount instead. This panel
  // is a compact hint, not a live ticking display, so freezing "now" at mount is the correct reading
  // here too.
  const [now] = useState(() => new Date());

  // `23-100`/`ConversationOutcomePanel`'s own precedent: reset during render when the identity this
  // panel is about changes, rather than in an effect (`react-hooks/set-state-in-effect`) - so switching
  // to a different visitor's conversation never shows a stale count for one beat.
  const [prevPersonId, setPrevPersonId] = useState(personId);
  if (personId !== prevPersonId) {
    setPrevPersonId(personId);
    setBookings(null);
  }

  const canView = hasPermission("calendar:configure") || hasPermission("customer:read");

  useEffect(() => {
    if (!accessToken || !personId || !canView || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    getPersonBookings(accessToken, personId, controller.signal)
      .then((rows) => setBookings(rows))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setBookings([]);
      });
    return () => controller.abort();
  }, [accessToken, personId, canView]);

  if (!canView || config.calendarApiBaseUrl === null || personId === null) {
    return null;
  }

  const upcomingCount = bookings === null ? null : splitBookings(bookings, now.getTime()).upcoming.length;

  return (
    <section className="ago-aside__section" aria-labelledby="ago-visitor-bookings-title">
      <h3 className="ago-aside__subtitle" id="ago-visitor-bookings-title">
        {strings.calendarClientDetailBookingsTitle}
      </h3>

      {upcomingCount !== null && (
        <p className="ago-meta">
          {upcomingCount > 0
            ? `${upcomingCount} ${upcomingBookingsWord(strings, upcomingCount)}`
            : strings.calendarClientDetailNoUpcoming}
        </p>
      )}

      {/* `ux-gate/lib/minSize.ts`'s own 24px WCAG 2.5.8 floor: a bare inline `<a>` is exempt (running
          text), but this is a standalone navigation control, not text in a sentence, so it does not
          qualify for that exemption and is measured on its own box - a plain `<Link>` here first
          measured 22.5/23.75px tall, under the floor. Styled with the `Button` component's own classes
          (`OwnerSitesPage`'s identical `Link` + `ago-btn` precedent) rather than a one-off padding rule,
          the same `.ago-btn--sm` 32px control every other button-shaped action in this console already
          clears the floor with. */}
      <div className="ago-row">
        <Link to={`/calendar/clients/${personId}`} className="ago-btn ago-btn--secondary ago-btn--sm">
          {strings.visitorBookingsOpenClientCardLink}
        </Link>
      </div>
    </section>
  );
}
