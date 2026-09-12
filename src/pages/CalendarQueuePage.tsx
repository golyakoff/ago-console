import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { useCalendarConnection } from "../realtime/CalendarConnectionContext.js";
import { config } from "../config.js";
import {
  cancelBooking,
  getPendingBookings,
  markNoShow,
  rejectBooking,
  revealCustomerPhone,
  type PendingBooking,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { renderPhone, type RevealControl } from "../calendar/calendarFormat.js";
import { hasAnyBookingActionPermission } from "../calendar/calendarPermissions.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatAbsolute, formatClockTime, parseInstant, resolveTimeZone } from "../time/format.js";

/**
 * `22-06`/`adr/0093`: `/calendar` - the shared pending-bookings queue, moved from
 * `ago-calendar-console`'s own `QueuePage.tsx`. Rewritten against this console's closed
 * eleven-component set (`Panel`/`Table`/`Button`/`Alert`) - see `calendar/WorkersTable.tsx`'s own
 * doc comment for why every calendar screen is a rewrite, not a port, of the source console's
 * bare-HTML markup.
 *
 * <b>`23-57`: gated on `calendar:configure` **or** holding any of the booking action permissions</b>
 * (`hasAnyBookingActionPermission` - `booking:confirm`/`booking:reject`/`booking:cancel`,
 * `calendarAccess.tsx`'s own doc comment), not on `calendar:configure` alone. The seeded Operator
 * role holds those three and never `calendar:configure` (`ago-chat`'s own
 * `RegisterSiteHandler.OperatorRolePermissions`) - before this item the nav could be made to offer
 * this screen without the screen itself ever admitting that operator, which is the identical defect
 * from the other side (`docs/backlog/23-57-*.md`'s own "no screen from which to reach it"). This
 * mirrors `23-34`'s `CalendarBookingsPage`, whose own gate is `customer:read` rather than
 * `calendar:configure` for the same reason - a page's own gate has to match whatever the nav now
 * promises, or the promise is empty.
 *
 * <b>One queue, spanning every calendar the tenant has.</b> Unchanged from the source: there is
 * deliberately no filter by calendar and no notion of "mine".
 *
 * <b>Reject, not approve.</b> Everything auto-confirms unless somebody vetoes it before the deadline.
 *
 * <b>Overdue rows are shown, loudly, rather than hidden.</b> Unchanged from the source - a broken
 * confirmation sweep must stay visible to the one person who can notice it.
 *
 * `23-30`/`23-12`: the phone column now shares `calendarFormat.tsx`'s own `renderPhone` with the
 * worker-slots and re-cut screens, rather than a bespoke null check - a masked, non-null phone gets a
 * Reveal button, and `handleReveal` replaces every row for that customer in place from the server's
 * own response.
 */
export function CalendarQueuePage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const { connection: calendarConnection } = useCalendarConnection();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [rows, setRows] = useState<PendingBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // `23-30`: which customer's own Reveal is in flight, if any - `CalendarWorkerSlotsPage`'s own
  // identical state.
  const [revealingCustomerId, setRevealingCustomerId] = useState<string | null>(null);
  const canViewQueue = hasPermission("calendar:configure") || hasAnyBookingActionPermission(hasPermission);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      try {
        setRows(await getPendingBookings(accessToken, signal));
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      }
    },
    [user?.access_token, strings],
  );

  useEffect(() => {
    if (!canViewQueue || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    // `23-100`: suppressed here rather than rewritten. `react-hooks/set-state-in-effect` is new in the
    // plugin's v7, which folded the React Compiler's own analyzer in; it follows the call below and sees a
    // `setState` reachable from an effect body. It is right about the shape and wrong about the defect:
    // fetching in an effect is what React's own documentation prescribes until a framework or Suspense
    // removes the need, and every `setState` reached from here runs after an `await`, never synchronously
    // in the effect body. Rewriting the call to satisfy the analyzer would answer "when should this
    // request happen" by accident rather than by decision.
    //
    // Per-line, replacing the file-scoped override `23-96` left: that one downgraded the rule for the
    // whole file, so a genuinely synchronous `setState` written here tomorrow was also only a warning.
    // This marks the one site that is deliberate and leaves the rest of the file an error again.
    //
    // Loads the pending queue, aborting on unmount. `23-57` gated this screen on the operator's own permissions, and the fetch follows that gate rather than racing it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, canViewQueue]);

  // `25-63`: the one real event this screen exists to react to live - CalendarOperatorHub pushes
  // "PendingBookingsChanged" whenever any booking, anywhere in this tenant, enters or leaves
  // PendingConfirmation; this re-reads the queue exactly the way the manual Refresh button already
  // does. No per-message data is read from the push itself - it is a bare "something changed" signal,
  // and this handler's only job is to ask the server again, which is what keeps GetPendingBookingsForTenantHandler's
  // own permission and contact-masking decisions as the one place either is made (the push payload
  // deliberately carries neither, see BookingPendingStateChanged's own remarks, Ago.Calendar.Contracts).
  // `calendarConnection` is null whenever this operator's session never opened the hub at all
  // (CalendarOperatorConnectionProvider's own guard) - the effect is then simply a no-op, the same
  // "no live update, the initial fetch and the manual button still work" degradation as any other
  // dropped realtime channel in this console.
  useEffect(() => {
    if (calendarConnection === null || !canViewQueue) {
      return;
    }

    calendarConnection.onPendingBookingsChanged(() => void reload());
  }, [calendarConnection, canViewQueue, reload]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!canViewQueue) {
    // `23-21`: the shared refusal, not a hand-copied block - see `calendarAccess.tsx`'s own doc
    // comment. `showElsewhereNotice` stays true only here: `/calendar` is the section's landing
    // page, the one a bookmark or a stale link lands on (`CalendarElsewhereNotice`'s own remarks).
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarQueue}
        forbiddenMessage={strings.calendarQueueForbidden}
        strings={strings}
        showElsewhereNotice
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarQueue} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const act = async (bookingId: string, action: (token: string, id: string) => Promise<void>) => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    setBusyId(bookingId);
    try {
      await action(accessToken, bookingId);
      await reload();
    } catch (reason) {
      // Losing a race with the sweep is an ordinary outcome, not a fault - re-read first, then set
      // the message, unchanged from the source (a successful reload clears the error, so the other
      // order would wipe the one sentence the operator needed).
      const failure = calendarErrorMessage(reason, strings);
      await reload();
      setError(failure);
    } finally {
      setBusyId(null);
    }
  };

  // `23-30`: replaces every row for this customer with the server's own unmasked phone - `PendingBooking`
  // rows are always keyed by a real, non-null `customerId` (a booking always has a customer), so this
  // is the same "match by customerId" replacement `CalendarWorkerSlotsPage.handleReveal` uses.
  const handleReveal = async (customerId: string) => {
    const accessToken = user?.access_token;
    if (!accessToken) {
      return;
    }

    setRevealingCustomerId(customerId);
    setError(null);
    try {
      const { phone } = await revealCustomerPhone(accessToken, customerId, "ConsoleQueue");
      setRows((prev) => prev?.map((row) => (row.customerId === customerId ? { ...row, phone, masked: false } : row)) ?? prev);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setRevealingCustomerId(null);
    }
  };

  const reveal: RevealControl = { revealingCustomerId, onReveal: (id) => void handleReveal(id) };

  const columns: TableColumn<PendingBooking>[] = [
    {
      key: "when",
      header: strings.calendarQueueColumnWhen,
      render: (row) => {
        const startsAt = parseInstant(row.startsAt);
        const endsAt = parseInstant(row.endsAt);
        return (
          <span title={startsAt ? formatAbsolute(startsAt, timeZone, strings) : undefined}>
            {startsAt ? formatClockTime(startsAt, timeZone, strings) : "—"}
            {" – "}
            {endsAt ? formatClockTime(endsAt, timeZone, strings) : "—"}
          </span>
        );
      },
    },
    {
      key: "calendar",
      header: strings.calendarQueueColumnCalendar,
      // `.ago-mono`, not a bare `<code>` - `AdminConversationsPage.tsx`'s own convention for a
      // truncated id, and also what `ux-gate/lib/i18nCompleteness.ts`'s own "no untranslated
      // interface text" assertion treats as "literally an identifier" rather than a translation gap.
      render: (row) => <span className="ago-mono">{row.calendarId.slice(0, 8)}</span>,
    },
    {
      key: "phone",
      header: strings.calendarQueueColumnPhone,
      render: (row) => renderPhone(row, strings, reveal),
    },
    {
      key: "deadline",
      header: strings.calendarQueueColumnDeadline,
      render: (row) => {
        const deadline = parseInstant(row.confirmationDeadline);
        return (
          <span title={deadline ? formatAbsolute(deadline, timeZone, strings) : undefined}>
            {deadline ? formatClockTime(deadline, timeZone, strings) : "—"}
            {row.isOverdue && <strong> {strings.calendarQueueOverdueNote}</strong>}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: strings.calendarQueueColumnActions,
      render: (row) => (
        <div className="ago-row">
          <Button size="sm" disabled={busyId === row.bookingId} onClick={() => void act(row.bookingId, rejectBooking)}>
            {strings.calendarRejectButton}
          </Button>
          <Button size="sm" disabled={busyId === row.bookingId} onClick={() => void act(row.bookingId, cancelBooking)}>
            {strings.cancelButton}
          </Button>
          <Button size="sm" disabled={busyId === row.bookingId} onClick={() => void act(row.bookingId, markNoShow)}>
            {strings.calendarNoShowButton}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title={strings.navCalendarQueue}
        description={strings.calendarQueueDescription}
        aside={
          <Button onClick={() => void reload()}>{strings.calendarRefreshButton}</Button>
        }
      />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {rows === null && error === null ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : rows !== null && rows.length === 0 ? (
        <Panel>
          <p className="ago-meta">{strings.calendarQueueEmpty}</p>
        </Panel>
      ) : rows !== null && rows.length > 0 ? (
        <Table
          caption={strings.calendarQueueDescription}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.bookingId}
        />
      ) : null}
    </>
  );
}
