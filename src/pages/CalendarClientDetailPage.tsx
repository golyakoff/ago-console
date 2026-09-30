import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  CalendarApiError,
  cancelBooking,
  confirmOperatorVerifiedPhone,
  deleteClient,
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
import { noShowWord, phoneStatusWarningGlyph, renderPhone, slotStatusLabel, splitBookings, type RevealControl } from "../calendar/calendarFormat.js";
import { usePersonNames } from "../calendar/usePersonNames.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Badge } from "../components/Badge.js";
import { Button } from "../components/Button.js";
import { Dialog } from "../components/Dialog.js";
import { Alert } from "../components/Alert.js";
import { formatRuPhoneForDisplay } from "../components/phoneFormat.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";
import { formatClockTime, formatDateStamp, parseInstant, resolveTimeZone } from "../time/format.js";

/** `26-275`: the permission gating the delete-client action - Admin-only (`adr/0189` §3), byte-for-byte
 * the same string `Ago.Calendar.Domain.Permission.CustomerErase`/`Ago.Chat.Domain.Permission` seed. A
 * plain string literal, the identical "no shared type between repos" convention
 * `EraseConversationButton.CONVERSATION_ERASE_PERMISSION` already establishes for `conversation:erase`. */
export const CUSTOMER_ERASE_PERMISSION = "customer:erase";

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
 *
 * <b>`26-275`/`adr/0189`: the delete-client action - the desktop equivalent of the android swipe,
 * mirroring its *intent* rather than its gesture (`26-272`'s "don't import mobile IA" lesson).</b> A
 * destructive `«Удалить клиента»` button beside Refresh, gated on {@link CUSTOMER_ERASE_PERMISSION}
 * (Admin-only) and hidden entirely without it - "hide, don't disable", the identical posture
 * `EraseConversationButton` already carries for `conversation:erase`. Two dialogs, chosen client-side
 * from the bookings this page already loaded (no new read):
 *
 * <ul>
 *   <li>Past-only (or no bookings at all): a confirm dialog naming the erasure's real blast radius
 *   (`adr/0189` §2.3 Option A - the calendar record, the booking history, <i>and</i> the chat history,
 *   never left silent) - confirming calls {@link deleteClient}, and a `204` navigates back to
 *   `/calendar/clients`.</li>
 *   <li>A future booking present: a blocked dialog explaining the guard, with a primary
 *   «Перейти к записям» that scrolls this same page's own Предстоящие panel into view rather than
 *   navigating anywhere - the bookings are already rendered below (`adr/0189` §5's own
 *   navigate-to-cancel affordance).</li>
 * </ul>
 *
 * <b>The client-side branch is a courtesy, never the gate.</b> Rule 8: the server decides inside its
 * own transaction. If this page's own (possibly stale) bookings read says past-only but the server
 * still refuses with `409 person_erase.future_bookings`, the confirm dialog is swapped for the
 * identical blocked dialog rather than showing a raw error - the same two-state UI either way.
 *
 * <b>`person_erase.not_found` is treated as an already-completed delete, not a failure.</b> The person
 * is gone from this tenant either way (this operator's own earlier click, a race with another
 * operator, or a stale link) - the honest thing this page can do is the same thing a fresh `204` would:
 * leave for the list.
 *
 * <b>Each Предстоящие row now also carries a «Отменить» action</b> (gated `booking:cancel`, calling the
 * existing `cancelBooking`/`CancelBookingHandler`) - the composable "cancel the blockers, then delete"
 * flow `adr/0189` §5 describes, reusing the write `CalendarQueuePage`'s own queue already calls. Never
 * offered on a past or `NoShow` row - cancelling something already over is not a real action.
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
  // `26-275`/`adr/0189`: Admin-only, seeded into no other role - see this component's own doc comment.
  const canEraseClient = hasPermission(CUSTOMER_ERASE_PERMISSION);
  const navigate = useNavigate();

  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<PersonBooking[] | null>(null);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<PersonConversation[] | null>(null);
  const [channels, setChannels] = useState<PersonContactChannel[] | "unavailable" | null>(null);
  const [revealingPersonId, setRevealingPersonId] = useState<string | null>(null);
  const [confirmingPhone, setConfirmingPhone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // `26-275`: which upcoming booking's own «Отменить» is in flight, if any - the same single-busy-row
  // shape `revealingPersonId` above and `CalendarQueuePage`'s `busyId` already use.
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  // `26-275`: the delete-client flow's own three flags - which dialog (if either) is open, and whether
  // the confirm click is in flight. Never both dialogs open at once: confirming a stale past-only read
  // that the server refuses closes the confirm dialog and opens the blocked one in the same update.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // `26-275`/`adr/0189` §5: the blocked dialog's own «Перейти к записям» scrolls this ref into view
  // rather than navigating anywhere - the Предстоящие panel is already rendered below on this page.
  const upcomingPanelRef = useRef<HTMLDivElement>(null);

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

  // `26-275`/`adr/0189` §5: the per-row «Отменить» on an upcoming booking - the existing
  // `CancelBookingHandler` write, unchanged, so the client becomes deletable once every future booking
  // is cancelled this way. Reloads the bookings read on success, the identical "re-read rather than
  // patch the row by hand" shape `RescheduleBookingButton`'s own `onRescheduled` already uses here.
  const handleCancelBooking = async (bookingId: string) => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }
    setCancelingBookingId(bookingId);
    setActionError(null);
    try {
      await cancelBooking(accessToken, bookingId);
      await reloadBookings();
    } catch (reason) {
      setActionError(calendarErrorMessage(reason, strings));
    } finally {
      setCancelingBookingId(null);
    }
  };

  // `26-269`'s own split, computed once here (rather than again down beside the render, `26-269`'s own
  // original site) - the delete button in `PageHead`'s `aside` needs `upcoming` for its own client-side
  // branch before the bookings panel below it renders the same list.
  const { upcoming, past } = bookings === null ? { upcoming: [] as PersonBooking[], past: [] as PersonBooking[] } : splitBookings(bookings, now.getTime());
  // `26-275`/`adr/0189` §4: the client-side branch is UX only (rule 8 - the server decides inside its
  // own transaction). While `bookings` has not loaded yet, this reads `false` rather than blocking the
  // button: a delete attempted before the read finishes still goes to the server, which is the real
  // authority and answers `409 person_erase.future_bookings` if the guard actually applies.
  const hasFutureBookings = upcoming.length > 0;

  // `26-275`: the delete button's own click - branches client-side (courtesy only) between the two
  // dialogs, never fires a request itself. `EraseConversationButton`'s own "click opens a dialog, the
  // dialog fires the write" split, applied to a two-dialog flow instead of one.
  const openDeleteFlow = () => {
    setDeleteError(null);
    if (hasFutureBookings) {
      setDeleteBlockedOpen(true);
    } else {
      setDeleteConfirmOpen(true);
    }
  };

  // `26-275`/`adr/0189`: fires `DELETE /contacts/{personId}`. A `204` leaves for the list - the client
  // is gone, there is nothing left on this page to show. `409 person_erase.future_bookings` swaps this
  // dialog for the blocked one instead of showing a raw error - the server caught what the client-side
  // read above missed (a booking made in the moment between this page's load and the click).
  // `person_erase.not_found` is treated identically to a `204`: the person is gone from this tenant
  // either way, so the honest thing is the same "leave for the list" outcome a fresh success would give.
  const handleConfirmDelete = async () => {
    const accessToken = user?.access_token;
    if (!accessToken || !personId) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteClient(accessToken, personId);
      void navigate("/calendar/clients");
    } catch (reason) {
      if (reason instanceof CalendarApiError && reason.code === "person_erase.future_bookings") {
        setDeleteConfirmOpen(false);
        setDeleteBlockedOpen(true);
        return;
      }
      if (reason instanceof CalendarApiError && reason.code === "person_erase.not_found") {
        void navigate("/calendar/clients");
        return;
      }
      setDeleteError(calendarErrorMessage(reason, strings));
    } finally {
      setDeleting(false);
    }
  };

  // `26-275`/`adr/0189` §5: closes the blocked dialog and scrolls the already-rendered Предстоящие
  // panel into view - no navigation, no new read, the bookings this operator needs to cancel are
  // already on this page.
  const handleGoToBookings = () => {
    setDeleteBlockedOpen(false);
    upcomingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      //
      // `26-275`/`adr/0189` §5: «Отменить» sits beside it, gated `booking:cancel` and shown only for a
      // still-upcoming, still-held row (`Booked`/`PendingConfirmation`, `startsAt` in the future) -
      // never on a past row or a `NoShow`, the identical "cancelling something already over is not a
      // real action" reasoning `RecutBookingPreview.canDecide`'s own remarks give a `NoShow` row there.
      render: (booking) => {
        const startsAt = parseInstant(booking.startsAt);
        const isUpcoming = startsAt !== null && startsAt.getTime() >= now.getTime() && booking.status !== "NoShow";
        return (
          <div className="ago-row">
            {booking.status === "Booked" && (
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
            )}
            {isUpcoming && hasPermission("booking:cancel") && (
              <Button
                size="sm"
                variant="ghost"
                disabled={cancelingBookingId === booking.bookingId}
                onClick={() => void handleCancelBooking(booking.bookingId)}
              >
                {strings.cancelButton}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const openDialogId = conversations !== null && conversations.length > 0 ? conversations[0].conversationId : null;

  return (
    <>
      <PageHead
        title={strings.calendarClientDetailTitle}
        aside={
          <div className="ago-row">
            <Button onClick={reload}>{strings.calendarRefreshButton}</Button>
            {/* `26-275`/`adr/0189`: hidden, not disabled, without `customer:erase` - and only once the
              * contact this delete would act on has actually loaded (there is nothing to delete on the
              * not-found or still-loading states below). */}
            {canEraseClient && contact !== null && (
              <Button variant="danger" onClick={openDeleteFlow}>
                {strings.calendarClientDetailDeleteButton}
              </Button>
            )}
          </div>
        }
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
                {/* `26-275`/`adr/0189` §5: the blocked-delete dialog's own «Перейти к записям» scrolls
                  * this wrapper into view - a plain `div` rather than a ref on `Panel` itself, since
                  * `Panel` is one of the closed eleven components (`adr/0030`) and takes no `ref` prop. */}
                <div ref={upcomingPanelRef}>
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
                </div>
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
                      {/* `26-326`: a linked `Phone` channel's own value gets the same display formatter
                          every other phone render site does - `Vk`/`Telegram`/etc. pass through
                          `formatRuPhoneForDisplay` untouched anyway (never RU-mask-shaped), but gating on
                          `channel.kind` says that plainly rather than relying on the formatter's own
                          no-op fallback to do it silently (`ContactDetailsPanel`'s identical gate). */}
                      <Badge tone="accent">{channelKindLabel(channel.kind, strings)}</Badge>{" "}
                      {channel.kind === "Phone" ? formatRuPhoneForDisplay(channel.value) : channel.value}
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

      {/* `26-275`/`adr/0189`: past-only (or no bookings) - the confirm dialog naming the erasure's real
        * blast radius (Option A). Mounted unconditionally, alongside the rest of this page's other
        * `Dialog`s, closed rather than absent - the same native-`<dialog>` shape `EraseConversationButton`
        * already relies on. */}
      <Dialog
        open={deleteConfirmOpen}
        title={strings.calendarClientDetailDeleteConfirmTitle}
        onClose={() => setDeleteConfirmOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>
              {strings.cancelButton}
            </Button>
            <Button variant="danger" onClick={() => void handleConfirmDelete()} disabled={deleting}>
              {deleting ? strings.calendarClientDetailDeleting : strings.calendarClientDetailDeleteConfirmButton}
            </Button>
          </>
        }
      >
        <p>{strings.calendarClientDetailDeleteConfirmBody}</p>
        {deleteError !== null && <Alert tone="danger">{deleteError}</Alert>}
      </Dialog>

      {/* `26-275`/`adr/0189` §4/§5: a future booking blocks the delete - server-refused (`409
        * person_erase.future_bookings`) or caught client-side first, either reaches this same dialog.
        * «Перейти к записям» scrolls the already-rendered Предстоящие panel into view rather than
        * navigating - see `handleGoToBookings`'s own doc comment. */}
      <Dialog
        open={deleteBlockedOpen}
        title={strings.calendarClientDetailDeleteBlockedTitle}
        onClose={() => setDeleteBlockedOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteBlockedOpen(false)}>
              {strings.cancelButton}
            </Button>
            <Button variant="primary" onClick={handleGoToBookings}>
              {strings.calendarClientDetailDeleteBlockedGoToBookingsButton}
            </Button>
          </>
        }
      >
        <p>{strings.calendarClientDetailDeleteBlockedBody}</p>
      </Dialog>
    </>
  );
}
