import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  cancelBooking,
  getPendingBookings,
  markNoShow,
  rejectBooking,
  type PendingBooking,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarElsewhereNotice } from "../calendar/CalendarElsewhereNotice.js";
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
 * `ago-calendar-console`'s own `QueuePage.tsx`. Gated the same way every tenant self-service screen
 * in this console already is (`usePermissions()` decides whether to render at all; `calendar:configure`
 * on `Ago.Calendar.Api` is the real gate, unchanged by this move) - `FaqModulePage`'s own doc comment
 * is the pattern this whole item copies rather than invents.
 *
 * Rewritten against this console's closed eleven-component set (`Panel`/`Table`/`Button`/`Alert`) -
 * see `calendar/WorkersTable.tsx`'s own doc comment for why every calendar screen is a rewrite, not a
 * port, of the source console's bare-HTML markup.
 *
 * <b>One queue, spanning every calendar the tenant has.</b> Unchanged from the source: there is
 * deliberately no filter by calendar and no notion of "mine".
 *
 * <b>Reject, not approve.</b> Everything auto-confirms unless somebody vetoes it before the deadline.
 *
 * <b>Overdue rows are shown, loudly, rather than hidden.</b> Unchanged from the source - a broken
 * confirmation sweep must stay visible to the one person who can notice it.
 */
export function CalendarQueuePage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [rows, setRows] = useState<PendingBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    if (!hasPermission("calendar:configure") || config.calendarApiBaseUrl === null) {
      return;
    }
    const controller = new AbortController();
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    return (
      <>
        <PageHead title={strings.navCalendarQueue} />
        <Alert tone="danger">{strings.calendarQueueForbidden}</Alert>
        {/* `22-14`/`adr/0100`: "you cannot see it here" and "you have one, in a different shop" are
            different answers, and until this item the console gave the first for both. Renders
            nothing when there is no other shop to name - see the component's own remarks. */}
        <CalendarElsewhereNotice />
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
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
      render: (row) =>
        row.phone === null ? (
          <span className="ago-meta" title={strings.calendarHiddenContactTooltip}>
            {strings.calendarHiddenContactLabel}
          </span>
        ) : (
          row.phone
        ),
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
