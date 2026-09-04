import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { getConfiguration, getWorkerSlots, type TenantConfiguration, type WorkerSlot } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { renderCustomer, renderPhone, slotStatusLabel, weekdayNames } from "../calendar/calendarFormat.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { Table, type TableColumn } from "../components/Table.js";
import { useStrings } from "../i18n/StringsContext.js";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 14);
  return { from: isoDate(today), to: isoDate(horizon) };
}

/** The business's own zone when known (from the calendar this worker is on); the reader's browser
 * zone only as a fallback for the instant between the page mounting and `getConfiguration` resolving.
 * `hour12: false` and no month/weekday fields mean no letters can appear regardless of locale, the
 * same "digits only, locale-invariant by construction" exemption `time/format.ts`'s own
 * `formatDurationSeconds` documents - unchanged from the source screen. */
function formatLocalTime(iso: string, timeZone: string | undefined): string {
  if (timeZone === undefined) {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

/**
 * `22-06`/`adr/0093`: `/calendar/workers/:workerId/slots` - the materialised slot view, moved from
 * `ago-calendar-console`'s own `WorkerSlotsPage.tsx` and rewritten against this console's closed
 * eleven-component set. Reached only from `CalendarWorkersPage`'s own row actions and from
 * `WorkerScheduleSection`'s "view slots" link - no nav entry of its own, unchanged from the source.
 *
 * <b>Every status is shown, not just the occupied ones.</b> Unchanged.
 *
 * <b>Local times are the calendar's own zone, not this browser's.</b> Unchanged.
 *
 * One simplification from the source screen: the visual "these rows are one multi-slot booking"
 * border grouping (`bookingGroupClassName`) is dropped rather than ported - it depended on the source
 * console's own bespoke stylesheet, which this rewrite does not carry over (`WorkersTable.tsx`'s own
 * doc comment has the "why a rewrite" reasoning), and inventing new CSS for one visual affordance on
 * one screen was judged not worth a new class outside the closed component set. The underlying data -
 * each row's own status, service, customer, phone - is unaffected; only the grouping cue is gone.
 */
export function CalendarWorkerSlotsPage() {
  const { workerId } = useParams<{ workerId: string }>();
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [slots, setSlots] = useState<WorkerSlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(defaultRange);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken || workerId === undefined) {
        return;
      }

      try {
        const [loadedConfiguration, loadedSlots] = await Promise.all([
          getConfiguration(accessToken, signal),
          getWorkerSlots(accessToken, workerId, range.from, range.to, signal),
        ]);
        setConfiguration(loadedConfiguration);
        setSlots(loadedSlots);
        setError(null);
      } catch (reason) {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(calendarErrorMessage(reason, strings));
        }
      }
    },
    [user?.access_token, workerId, range, strings],
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
    // `23-21`: the shared refusal - see `calendarAccess.tsx`'s own doc comment.
    return (
      <CalendarAccessRefusal
        title={strings.calendarSlotsHeadingFallback}
        forbiddenMessage={strings.calendarWorkerSlotsForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.calendarSlotsHeadingFallback} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const worker = configuration?.workers.find((candidate) => candidate.workerId === workerId);
  const calendar = configuration?.calendars.find((candidate) => candidate.workerIds.includes(workerId ?? ""));
  const weekdays = weekdayNames(strings);
  const heading =
    worker !== undefined
      ? `${strings.calendarSlotsHeadingPrefix}${worker.displayName}${strings.calendarSlotsHeadingSuffix}`
      : strings.calendarSlotsHeadingFallback;

  const columns: TableColumn<WorkerSlot>[] = [
    { key: "date", header: strings.calendarSlotsColumnDate, render: (slot) => slot.localDate },
    { key: "weekday", header: strings.calendarSlotsColumnWeekday, render: (slot) => weekdays[slot.weekday] },
    {
      key: "time",
      header: strings.calendarSlotsColumnTime,
      render: (slot) => `${formatLocalTime(slot.startsAt, calendar?.timeZone)}–${formatLocalTime(slot.endsAt, calendar?.timeZone)}`,
    },
    { key: "status", header: strings.calendarSlotsColumnStatus, render: (slot) => slotStatusLabel(slot.status, strings) },
    {
      key: "service",
      header: strings.calendarSlotsColumnService,
      render: (slot) => slot.serviceName ?? <span className="ago-meta">—</span>,
    },
    { key: "customer", header: strings.calendarSlotsColumnCustomer, render: (slot) => renderCustomer(slot, strings) },
    { key: "phone", header: strings.calendarSlotsColumnPhone, render: (slot) => renderPhone(slot, strings) },
  ];

  return (
    <>
      <PageHead title={heading} description={`${strings.calendarSlotsDescription}${calendar !== undefined ? `${strings.calendarSlotsTimezoneNotePrefix}${calendar.timeZone}${strings.calendarSlotsTimezoneNoteSuffix}` : ""}`} />

      <p>
        <Link to="/calendar/workers">← {strings.navCalendarWorkers}</Link>
      </p>

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
              <Input {...controlProps} type="date" value={range.from} onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))} required />
            )}
          </Field>
          <Field label={strings.calendarToFieldLabel}>
            {(controlProps) => (
              <Input {...controlProps} type="date" value={range.to} onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))} required />
            )}
          </Field>
          <Button type="submit">{strings.calendarRefreshButton}</Button>
        </form>
      </Panel>

      {error !== null && <Alert tone="danger">{error}</Alert>}

      {slots === null && error === null ? (
        <Panel>
          <Skeleton lines={4} label={strings.calendarLoading} />
        </Panel>
      ) : slots !== null && slots.length === 0 ? (
        <Panel>
          <p className="ago-meta">{strings.calendarSlotsEmpty}</p>
        </Panel>
      ) : slots !== null && slots.length > 0 ? (
        <Table caption={heading} columns={columns} rows={slots} rowKey={(slot) => slot.eventId} />
      ) : null}
    </>
  );
}
