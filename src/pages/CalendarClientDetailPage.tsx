import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  confirmOperatorVerifiedPhone,
  getContacts,
  getPersonBookings,
  getWorkerSlots,
  rescheduleBooking,
  revealCustomerPhone,
  type Contact,
  type PersonBooking,
} from "../api/calendarApi.js";
import { getPersonConversations, getPersons, type PersonContactChannel, type PersonConversation } from "../api/personsApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { RescheduleBookingButton } from "./RescheduleBookingButton.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { noShowWord, phoneStatusWarningGlyph, renderPhone, slotStatusLabel, type RevealControl } from "../calendar/calendarFormat.js";
import { usePersonNames } from "../calendar/usePersonNames.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatClockTime, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/** `Ago.Chat.Domain.VisitorContactDetailKind`'s own two channel kinds this hub reads - the identical
 * mapping `ContactDetailsPanel.kindLabel` already keeps for the dialog's own contact-details panel,
 * reused here rather than duplicated as a third copy: a channel kind is chat vocabulary regardless of
 * which screen renders it. */
function channelKindLabel(kind: string, strings: ConsoleStrings): string {
  if (kind === "Phone") {
    return strings.contactDetailsKindPhone;
  }
  if (kind === "Email") {
    return strings.contactDetailsKindEmail;
  }
  return kind;
}

/**
 * `26-269`/`26-269-clients-redesign.md` §6 decision (b): past-vs-future is a property of a *booking*,
 * not of the *client*, so the split happens here, client-side, against `Date.now()` - never against
 * `status` (a `Booked` row can be in the past for a moment before the confirmation sweep marks a
 * missed one `NoShow`; a `PendingConfirmation` row is always in the near future by construction). A
 * booking whose `startsAt` fails to parse (never expected - `PersonBooking.startsAt` is a required,
 * server-produced timestamp) sorts into the past rather than being silently dropped, the same "never
 * let a shape surprise erase a row" posture `matchesContactSearch`'s own callers take.
 *
 * Upcoming is ordered soonest-first, past is ordered most-recent-first - the mockup's own "Предстоящие
 * leads" framing (§4) applied to each segment's own natural reading order.
 */
function splitBookings(bookings: PersonBooking[], nowMs: number): { upcoming: PersonBooking[]; past: PersonBooking[] } {
  const upcoming: PersonBooking[] = [];
  const past: PersonBooking[] = [];

  for (const booking of bookings) {
    const startsAt = parseInstant(booking.startsAt);
    if (startsAt !== null && startsAt.getTime() >= nowMs) {
      upcoming.push(booking);
    } else {
      past.push(booking);
    }
  }

  const time = (booking: PersonBooking) => parseInstant(booking.startsAt)?.getTime() ?? 0;
  upcoming.sort((a, b) => time(a) - time(b));
  past.sort((a, b) => time(b) - time(a));
  return { upcoming, past };
}

/**
 * `26-269`/`26-269-clients-redesign.md` §4: `/calendar/clients/:personId` - the hub the redesigned
 * Клиенты list's own rows now open (`CalendarContactsPage`'s name-cell `Link`). A pure **read +
 * navigation** surface: every write it offers - reveal, operator phone-confirm, reschedule - already
 * exists and is reused verbatim; this page introduces none of its own (§4's own framing: "it composes
 * existing writes... it introduces none of its own").
 *
 * <b>No single-contact read exists, so this reuses the tenant-wide one, filtered.</b> `26-269`'s two
 * genuinely new reads are the bookings and the conversations (`getPersonBookings`/
 * `getPersonConversations`); the phone/verification/no-show facts are **not** a third new read - the
 * design doc's own §5 table marks that row "reuse" - `GET /contacts` has no single-person counterpart,
 * so this hub loads the same tenant-wide list `CalendarContactsPage` already loads and finds this one
 * row client-side, the identical shape that screen's own client-side search already established for
 * "no backend change" reads.
 *
 * <b>Three independent reads, three independent degrades.</b> A failed `contacts` load is fatal to this
 * screen (there is no row to show at all) and gets the same `Alert` treatment `CalendarContactsPage`
 * gives it. A failed `bookings` load only empties the Bookings panel, with its own retry via the page's
 * refresh button. A failed `conversations` load, and a failed person-profile (channels) load, both
 * degrade silently to "nothing to show here" - `adr/0184`'s own named consequence for a chat display
 * read: "degrades to 'name not shown yet' [here: 'no dialog to open yet' / no channels listed], never
 * to a failed booking" - never an `Alert` over a page whose main content (this person's own bookings)
 * still rendered fine.
 *
 * <b>«Открыть диалог» reads `conversations[0]`, never picks one itself.</b> The chat read's own
 * ordering contract (`PersonConversationItem`'s doc comment on the server side) already guarantees the
 * active conversation sorts first when one exists, else the most recent - this page trusts that
 * ordering rather than re-deriving "which one" from `isActive`/`lastActivityAt` a second time
 * client-side, the same "the server's own order is the grouping" discipline
 * `CalendarBookingsPage.groupByDayThenWorker`'s own doc comment states for its own read. The link
 * target is the console's one existing conversation route (`/conversations/:conversationId`,
 * `CalendarBookingsPage`'s own `Link` for a booking's origin conversation) regardless of whether that
 * conversation is open or closed - `ConversationPage` itself already renders a closed conversation
 * read-only (composer hidden, not greyed - that page's own `closed` state), so this hub needs no
 * separate "is it closed" branch of its own.
 *
 * <b>«Записать» (manual booking, case 7) is deliberately absent.</b> It depends on `26-268` landing
 * first (`26-269-clients-redesign.md` §8 item #4's own "Depends on #1, #2" - and §8's deferred-notes
 * list names #7 as filed only once `26-268` ships) - there is nothing to deep-link to yet, so this hub
 * offers no stub button that would do nothing when pressed.
 */
export function CalendarClientDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [timeZone] = useState(() => resolveTimeZone());
  // `InstallSnippetPage`'s own `useState(() => new Date())` shape: `Date.now()` is an impure call and
  // may not run during render (`react-hooks/purity`) - resolved once per mount instead. This screen is
  // not a live ticking display either, so freezing "now" at load is the correct reading anyway: a
  // booking that crosses into the past while this tab sits open moves segments on the next explicit
  // reload, not silently mid-read.
  const [now] = useState(() => new Date());
  const canView = hasPermission("calendar:configure") || hasPermission("customer:read");

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<PersonBooking[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<PersonConversation[] | null>(null);
  const [channels, setChannels] = useState<PersonContactChannel[] | "unavailable" | null>(null);
  const [revealingPersonId, setRevealingPersonId] = useState<string | null>(null);
  const [confirmingPhone, setConfirmingPhone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const personNames = usePersonNames(user?.access_token, personId ? [personId] : []);

  const reloadContacts = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }
      try {
        setContacts(await getContacts(accessToken, signal));
        setContactsError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setContactsError(calendarErrorMessage(reason, strings));
        }
      }
    },
    [user?.access_token, strings],
  );

  const reloadBookings = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken || !personId) {
        return;
      }
      try {
        setBookings(await getPersonBookings(accessToken, personId, signal));
        setBookingsError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setBookingsError(calendarErrorMessage(reason, strings));
        }
      }
    },
    [user?.access_token, personId, strings],
  );

  useEffect(() => {
    if (!canView || config.calendarApiBaseUrl === null || !personId) {
      return;
    }
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadContacts(controller.signal);
    return () => controller.abort();
  }, [reloadContacts, canView, personId]);

  useEffect(() => {
    if (!canView || config.calendarApiBaseUrl === null || !personId) {
      return;
    }
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadBookings(controller.signal);
    return () => controller.abort();
  }, [reloadBookings, canView, personId]);

  useEffect(() => {
    const accessToken = user?.access_token;
    if (!canView || !accessToken || !personId) {
      return;
    }
    const controller = new AbortController();
    // `adr/0184`: a chat read, degraded rather than failed - see this component's own doc comment.
    getPersonConversations(accessToken, personId, controller.signal)
      .then((rows) => setConversations(rows))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setConversations([]);
      });
    return () => controller.abort();
  }, [user?.access_token, canView, personId]);

  useEffect(() => {
    const accessToken = user?.access_token;
    if (!canView || !accessToken || !personId) {
      return;
    }
    const controller = new AbortController();
    getPersons(accessToken, [personId], controller.signal)
      .then((profiles) => setChannels(profiles[0]?.channels ?? []))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setChannels("unavailable");
      });
    return () => controller.abort();
  }, [user?.access_token, canView, personId]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!canView) {
    return (
      <CalendarAccessRefusal
        title={strings.calendarClientDetailTitle}
        forbiddenMessage={strings.calendarContactsForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.calendarClientDetailTitle} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  if (!personId) {
    return null;
  }

  const reload = () => {
    void reloadContacts();
    void reloadBookings();
  };

  const contact = contacts?.find((row) => row.personId === personId) ?? null;

  const nameState = personNames.lookup(personId);
  const nameForTitle =
    nameState.status === "loading" ? "…" : nameState.status === "unavailable" ? strings.calendarPersonNameUnavailable
      : (nameState.displayName ?? strings.calendarNotRecordedLabel);

  const handleReveal = async () => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }
    setRevealingPersonId(personId);
    setActionError(null);
    try {
      const { phone } = await revealCustomerPhone(accessToken, personId, "ConsoleClientDetail");
      setContacts((prev) => prev?.map((row) => (row.personId === personId ? { ...row, phone, masked: false } : row)) ?? prev);
    } catch (reason) {
      setActionError(calendarErrorMessage(reason, strings));
    } finally {
      setRevealingPersonId(null);
    }
  };

  const reveal: RevealControl = { revealingPersonId, onReveal: () => void handleReveal() };

  const handleConfirmPhone = async () => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }
    setConfirmingPhone(true);
    setActionError(null);
    try {
      const { confirmedAt } = await confirmOperatorVerifiedPhone(accessToken, personId);
      setContacts(
        (prev) => prev?.map((row) => (row.personId === personId ? { ...row, phoneConfirmedByOperatorAt: confirmedAt } : row)) ?? prev,
      );
    } catch (reason) {
      setActionError(calendarErrorMessage(reason, strings));
    } finally {
      setConfirmingPhone(false);
    }
  };

  const bookingColumns: TableColumn<PersonBooking>[] = [
    {
      key: "when",
      header: strings.calendarBookingsColumnWhen,
      render: (booking) => {
        const startsAt = parseInstant(booking.startsAt);
        const endsAt = parseInstant(booking.endsAt);
        return (
          <span>
            {startsAt ? formatDateStamp(startsAt, timeZone, strings) : "—"}{" "}
            {startsAt ? formatClockTime(startsAt, timeZone, strings) : ""}
            {endsAt ? `–${formatClockTime(endsAt, timeZone, strings)}` : ""}
          </span>
        );
      },
    },
    {
      key: "service",
      header: strings.calendarBookingsColumnService,
      render: (booking) => booking.serviceName ?? <span className="ago-meta">—</span>,
    },
    { key: "master", header: strings.calendarQueueColumnWorker, render: (booking) => booking.workerDisplayName },
    {
      // `26-269`: the quiet default - a `Booked` row (the ordinary case) carries no badge at all,
      // exactly the same "no icon for the unremarkable case" rule `phoneStatusWarningGlyph`/the
      // no-show pill already follow. Only the two exceptional statuses earn a badge.
      key: "status",
      header: strings.calendarSlotsColumnStatus,
      render: (booking) =>
        booking.status === "Booked" ? null : <Badge tone={booking.status === "NoShow" ? "danger" : "accent"}>{slotStatusLabel(booking.status, strings)}</Badge>,
    },
    {
      key: "actions",
      header: strings.calendarBookingsColumnActions,
      // `26-210`/`adr/0187`: reschedule only ever applies to a `Booked` row - the same restriction
      // `CalendarBookingsPage` (whose own tenant-wide list holds only `Booked` rows to begin with)
      // enforces by construction; this hub's list is not status-filtered, so the check is explicit here.
      render: (booking) =>
        booking.status !== "Booked" ? null : (
          <RescheduleBookingButton
            initialDate={booking.localDate}
            timeZone={timeZone}
            onLoadSlots={(date, signal) => {
              const accessToken = user?.access_token;
              if (!accessToken) {
                return Promise.reject(new Error("Not signed in."));
              }
              return getWorkerSlots(accessToken, booking.workerId, date, date, signal);
            }}
            onReschedule={(newStartEventId) => {
              const accessToken = user?.access_token;
              if (!accessToken) {
                return Promise.reject(new Error("Not signed in."));
              }
              return rescheduleBooking(accessToken, booking.bookingId, newStartEventId);
            }}
            onRescheduled={() => void reloadBookings()}
          />
        ),
    },
  ];

  const { upcoming, past } = bookings === null ? { upcoming: [], past: [] } : splitBookings(bookings, now.getTime());
  const openDialogId = conversations !== null && conversations.length > 0 ? conversations[0].conversationId : null;

  return (
    <>
      <PageHead
        title={strings.calendarClientDetailTitle}
        aside={<Button onClick={reload}>{strings.calendarRefreshButton}</Button>}
      />

      <p className="ago-meta">
        <Link to="/calendar/clients">{strings.calendarClientDetailBackLink}</Link>
      </p>

      {contactsError !== null && <Alert tone="danger">{contactsError}</Alert>}

      {contacts === null && contactsError === null ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : contact === null ? (
        contactsError === null && (
          <Panel title={strings.calendarClientDetailNotFoundTitle}>
            <p className="ago-meta">{strings.calendarClientDetailNotFoundBody}</p>
          </Panel>
        )
      ) : (
        <>
          <Panel title={nameForTitle}>
            <div className="ago-stack">
              <div className="ago-row">
                {renderPhone(contact, strings, reveal)}
                {contact.phone !== null && !contact.masked && (
                  <a href={`tel:${contact.phone}`}>{strings.calendarClientDetailCallLink}</a>
                )}
                {phoneStatusWarningGlyph(contact, strings)}
                {contact.noShowCount > 0 && (
                  <Badge tone="danger">
                    {contact.noShowCount} {noShowWord(strings, contact.noShowCount)}
                  </Badge>
                )}
                {openDialogId !== null && <Link to={`/conversations/${openDialogId}`}>{strings.calendarBookingsGoToDialogLink}</Link>}
              </div>

              {contact.phoneVerifiedAt === null && contact.phoneConfirmedByOperatorAt === null && (
                <div className="ago-row">
                  <span className="ago-meta">{strings.calendarClientDetailPhoneStatusHint}</span>
                  <Button size="sm" onClick={() => void handleConfirmPhone()} disabled={confirmingPhone}>
                    {confirmingPhone ? strings.calendarClientDetailConfirmingPhoneButton : strings.calendarClientDetailConfirmPhoneButton}
                  </Button>
                </div>
              )}

              {actionError !== null && <Alert tone="danger">{actionError}</Alert>}
            </div>
          </Panel>

          <Panel title={strings.calendarClientDetailBookingsTitle}>
            {bookingsError !== null && <Alert tone="danger">{bookingsError}</Alert>}

            {bookings === null && bookingsError === null ? (
              <Skeleton lines={3} label={strings.calendarLoading} />
            ) : bookings !== null && bookings.length === 0 ? (
              <p className="ago-meta">{strings.calendarClientDetailNoBookingsAtAll}</p>
            ) : bookings !== null ? (
              <div className="ago-stack">
                <Panel quiet title={strings.calendarClientDetailUpcomingTitle}>
                  {upcoming.length === 0 ? (
                    <p className="ago-meta">{strings.calendarClientDetailNoUpcoming}</p>
                  ) : (
                    <Table
                      caption={`${strings.calendarClientDetailUpcomingTitle} ${nameForTitle}`}
                      columns={bookingColumns}
                      rows={upcoming}
                      rowKey={(booking) => booking.bookingId}
                    />
                  )}
                </Panel>
                <Panel quiet title={strings.calendarClientDetailPastTitle}>
                  {past.length === 0 ? (
                    <p className="ago-meta">{strings.calendarClientDetailNoPast}</p>
                  ) : (
                    <Table
                      caption={`${strings.calendarClientDetailPastTitle} ${nameForTitle}`}
                      columns={bookingColumns}
                      rows={past}
                      rowKey={(booking) => booking.bookingId}
                    />
                  )}
                </Panel>
              </div>
            ) : null}
          </Panel>

          <Panel title={strings.calendarClientDetailMetaTitle}>
            <div className="ago-stack">
              {channels === null ? (
                <Skeleton lines={2} label={strings.calendarLoading} />
              ) : channels === "unavailable" || channels.length === 0 ? (
                <p className="ago-meta">{strings.calendarClientDetailNoChannels}</p>
              ) : (
                <ul>
                  {channels.map((channel) => (
                    <li key={channel.id}>
                      <Badge tone="accent">{channelKindLabel(channel.kind, strings)}</Badge> {channel.value}
                    </li>
                  ))}
                </ul>
              )}
              <p className="ago-meta">
                {strings.calendarContactsColumnFirstSeen}: {formatDateStamp(parseInstant(contact.firstSeenAt) ?? new Date(0), timeZone, strings)}
                {" · "}
                {strings.calendarContactsColumnLastSeen}: {formatDateStamp(parseInstant(contact.lastSeenAt) ?? new Date(0), timeZone, strings)}
              </p>
            </div>
          </Panel>
        </>
      )}
    </>
  );
}
