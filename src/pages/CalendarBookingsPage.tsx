import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getConfirmedBookings, type ConfirmedBooking } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { weekdayNames } from "../calendar/calendarFormat.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Badge } from "../components/Badge.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";
import { formatClockTime, parseInstant, resolveTimeZone } from "../time/format.js";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** A week, not `CalendarWorkerSlotsPage`'s own fourteen days: that screen exists to verify a
 * schedule's own output ahead of time, this one exists to answer "what is actually on", which is an
 * operational, near-term question - the item's own framing is "what is on for Thursday", not "what
 * does next month look like". */
function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 6);
  return { from: isoDate(today), to: isoDate(horizon) };
}

interface WorkerGroup {
  workerId: string;
  workerDisplayName: string;
  rows: ConfirmedBooking[];
}

interface DayGroup {
  localDate: string;
  weekday: number;
  count: number;
  workers: WorkerGroup[];
}

/**
 * Two-level grouping - day, then master - built in one pass over the read store's own ordering
 * (`ConfirmedBookingReadStore`'s SQL: `order by e.local_date, w.display_name, min(e.starts_at)`)
 * rather than a client-side sort, the identical "the server's own order is the grouping" shape
 * `SharedPendingQueueTests`' own ordering assertion already relies on for the queue.
 */
function groupByDayThenWorker(rows: ConfirmedBooking[]): DayGroup[] {
  const days: DayGroup[] = [];
  const dayByDate = new Map<string, DayGroup>();

  for (const row of rows) {
    let day = dayByDate.get(row.localDate);
    if (day === undefined) {
      day = { localDate: row.localDate, weekday: row.weekday, count: 0, workers: [] };
      dayByDate.set(row.localDate, day);
      days.push(day);
    }
    day.count += 1;

    let worker = day.workers.find((candidate) => candidate.workerId === row.workerId);
    if (worker === undefined) {
      worker = { workerId: row.workerId, workerDisplayName: row.workerDisplayName, rows: [] };
      day.workers.push(worker);
    }
    worker.rows.push(row);
  }

  return days;
}

/**
 * `23-34`: `/calendar/bookings` - what is actually booked, across every calendar the tenant has. The
 * screen the item's own Goal names: "the answer today is: open a customer card, or look at the widget
 * as a visitor would" - this is the screen that was missing.
 *
 * <b>Gated on `customer:read`, not the console's usual `calendar:configure`.</b> Every other calendar
 * screen (`CalendarQueuePage`/`CalendarContactsPage`/`CalendarSetupPage`/`CalendarWorkersPage`/
 * `CalendarAvailabilityPage`) checks `calendar:configure` before rendering at all - the seeded
 * "Operator" role never holds it, only "Admin" does (`ago-chat`'s own
 * `RegisterSiteHandler.OperatorRolePermissions`/`AdminRolePermissions`), so today an ordinary operator
 * cannot reach *any* calendar screen from the nav, including the queue, whose own backend already
 * accepts `booking:reject`. The author's own scoping decision for this item names the operator, not
 * the administrator, as the floor - "покажем их как минимум роли оператора, чтобы он видел
 * заполненность мастера и дней" - so this screen deliberately checks `customer:read` instead, the
 * permission the seeded Operator role already holds and the same one
 * `GetConfirmedBookingsForTenantHandler` gates the read on server-side. `consoleNav.ts`'s own
 * `buildCalendarItems` carries the matching nav-visibility branch - see its own doc comment.
 *
 * <b>"Fullness", not a flat table.</b> The item's own instruction: "let an operator see, at a glance,
 * how loaded a given worker and a given day are... do not ship a bare table". A calendar-grid
 * percentage-of-capacity view was considered and rejected: it would need the availability engine's
 * own working-hours/buffer arithmetic layered on top of a read screen, the exact "a grid is a second
 * design conversation" the item's own Out of scope already rules out for the sibling case. What is
 * built instead is two-level grouping - a `Panel` per business-local day, a nested `quiet` `Panel` per
 * master inside it - each carrying a `Badge` with its own row count
 * (`calendarBookingsCountLabel`, deliberately not a pluralised sentence: "Записей: 5" needs no
 * grammatical agreement with the number the way "5 записей" would, the identical reasoning
 * `calendarSlotsHeadingPrefix`/`Suffix` already apply to a worker's name in a heading). A reader sees
 * a day's own total and, opened one level further, exactly how many visits each master has that day,
 * with no arithmetic of their own to do.
 *
 * <b>Masking is inherited, not reimplemented.</b> `ConfirmedBooking.phone` arrives from the server
 * already masked or real, the identical shape `CalendarContactsPage`/`CalendarQueuePage` already
 * render verbatim - there is no reveal control here (`23-30` is not done), so this screen renders
 * exactly what the other two already do: the string the read model produced.
 */
export function CalendarBookingsPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const timeZone = useMemo(() => resolveTimeZone(), []);
  const [rows, setRows] = useState<ConfirmedBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(defaultRange);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      try {
        setRows(await getConfirmedBookings(accessToken, range.from, range.to, signal));
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      }
    },
    [user?.access_token, range, strings],
  );

  useEffect(() => {
    if (!hasPermission("customer:read") || config.calendarApiBaseUrl === null) {
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
    // Loads the default booking window. `23-34` chose that window; choosing it again here would be deciding it twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("customer:read")) {
    // `23-21`/`23-24`'s own shared refusal - see `calendarAccess.tsx`'s own doc comment. This reuses
    // the identical component every other calendar screen's forbidden state does; only the permission
    // this page itself checks above differs.
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarBookings}
        forbiddenMessage={strings.calendarBookingsForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarBookings} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const weekdays = weekdayNames(strings);
  const groups = rows === null ? null : groupByDayThenWorker(rows);

  const columns: TableColumn<ConfirmedBooking>[] = [
    {
      key: "when",
      header: strings.calendarBookingsColumnWhen,
      render: (row) => {
        const startsAt = parseInstant(row.startsAt);
        const endsAt = parseInstant(row.endsAt);
        return (
          <span>
            {startsAt ? formatClockTime(startsAt, timeZone, strings) : "—"}
            {" – "}
            {endsAt ? formatClockTime(endsAt, timeZone, strings) : "—"}
          </span>
        );
      },
    },
    {
      key: "service",
      header: strings.calendarBookingsColumnService,
      render: (row) => row.serviceName ?? <span className="ago-meta">—</span>,
    },
    {
      key: "customer",
      header: strings.calendarBookingsColumnCustomer,
      render: (row) => row.customerDisplayName ?? <span className="ago-meta">{strings.calendarNotRecordedLabel}</span>,
    },
    { key: "phone", header: strings.calendarBookingsColumnPhone, render: (row) => row.phone },
  ];

  return (
    <>
      <PageHead
        title={strings.navCalendarBookings}
        description={strings.calendarBookingsDescription}
        aside={<Button onClick={() => void reload()}>{strings.calendarRefreshButton}</Button>}
      />

      <Panel>
        <form
          className="ago-row"
          onSubmit={(event) => {
            event.preventDefault();
            void reload();
          }}
        >
          <Field label={strings.calendarFromFieldLabel}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="date"
                value={range.from}
                onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))}
                required
              />
            )}
          </Field>
          <Field label={strings.calendarToFieldLabel}>
            {(controlProps) => (
              <Input
                {...controlProps}
                type="date"
                value={range.to}
                onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))}
                required
              />
            )}
          </Field>
          <Button type="submit">{strings.calendarRefreshButton}</Button>
        </form>
      </Panel>

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {groups === null && error === null ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : groups !== null && groups.length === 0 ? (
        <Panel>
          <p className="ago-meta">{strings.calendarBookingsEmpty}</p>
        </Panel>
      ) : groups !== null && groups.length > 0 ? (
        groups.map((day) => (
          <Panel
            key={day.localDate}
            title={weekdays[day.weekday]}
            description={day.localDate}
            actions={
              <Badge tone="neutral" mono>
                {strings.calendarBookingsCountLabel}: {day.count}
              </Badge>
            }
          >
            {day.workers.map((worker) => (
              <Panel
                key={worker.workerId}
                quiet
                title={worker.workerDisplayName}
                actions={
                  <Badge tone="neutral" mono>
                    {strings.calendarBookingsCountLabel}: {worker.rows.length}
                  </Badge>
                }
              >
                <Table
                  caption={`${strings.calendarBookingsDescription} ${weekdays[day.weekday]} ${day.localDate} ${worker.workerDisplayName}`}
                  columns={columns}
                  rows={worker.rows}
                  rowKey={(row) => row.bookingId}
                />
              </Panel>
            ))}
          </Panel>
        ))
      ) : null}
    </>
  );
}
