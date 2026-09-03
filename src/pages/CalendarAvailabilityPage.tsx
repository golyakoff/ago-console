import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { deleteDayOff, editDayBoundary, getConfiguration, type TenantConfiguration } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `22-06`/`adr/0093`: `/calendar/availability` - the two manual edits ("this worker is closed on
 * this day" and "on this day they start late or finish early"), moved from
 * `ago-calendar-console`'s own `AvailabilityPage.tsx` and rewritten against this console's closed
 * eleven-component set.
 *
 * <b>Both address a business-local day, not an instant range.</b> Unchanged.
 * <b>Neither can touch a day that has a booking on it.</b> Unchanged - the server refuses.
 * <b>Undoing a day off is an edit, not an undo button.</b> Unchanged.
 */
export function CalendarAvailabilityPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      try {
        setConfiguration(await getConfiguration(accessToken, signal));
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
    void load(controller.signal);
    return () => controller.abort();
  }, [load, hasPermission]);

  if (permissions === null) {
    return <Spinner label={strings.siteConfigCheckingPermissions} />;
  }

  if (!hasPermission("calendar:configure")) {
    return (
      <>
        <PageHead title={strings.navCalendarAvailability} />
        <Alert tone="danger">{strings.calendarAvailabilityForbidden}</Alert>
        <p>
          <Link to="/">{strings.siteConfigBackToQueue}</Link>
        </p>
      </>
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarAvailability} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined) {
    return null;
  }

  const run = async (action: () => Promise<void>, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(done);
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  if (configuration === null) {
    return (
      <>
        <PageHead title={strings.navCalendarAvailability} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={4} label={strings.calendarLoading} /></Panel>}
      </>
    );
  }

  const workersWithCalendars = configuration.workers
    .map((worker) => ({ worker, calendar: configuration.calendars.find((calendar) => calendar.workerIds.includes(worker.workerId)) }))
    .filter(
      (pair): pair is { worker: (typeof configuration.workers)[number]; calendar: (typeof configuration.calendars)[number] } =>
        pair.calendar !== undefined,
    );

  if (workersWithCalendars.length === 0) {
    return (
      <>
        <PageHead title={strings.navCalendarAvailability} />
        <Alert tone="info">{strings.calendarAvailabilityNoWorkersNote}</Alert>
      </>
    );
  }

  return (
    <>
      <PageHead title={strings.navCalendarAvailability} />

      {message !== null && <Alert tone="success">{message}</Alert>}
      {error !== null && <Alert tone="danger">{error}</Alert>}

      <DayForm
        title={strings.calendarCloseDayTitle}
        description={strings.calendarCloseDayDescription}
        submitLabel={strings.calendarCloseDayButton}
        workers={workersWithCalendars}
        disabled={busy}
        strings={strings}
        onSubmit={(selection) =>
          void run(
            () => deleteDayOff(accessToken, { calendarId: selection.calendarId, workerId: selection.workerId, localDate: selection.localDate }),
            strings.calendarCloseDayDoneMessage,
          )
        }
      />

      <DayForm
        title={strings.calendarChangeDayHoursTitle}
        description={strings.calendarChangeDayHoursDescription}
        submitLabel={strings.calendarApplyNewHoursButton}
        workers={workersWithCalendars}
        disabled={busy}
        strings={strings}
        withTimes
        onSubmit={(selection) =>
          void run(
            () =>
              editDayBoundary(accessToken, {
                calendarId: selection.calendarId,
                workerId: selection.workerId,
                localDate: selection.localDate,
                opensAt: selection.opensAt,
                closesAt: selection.closesAt,
              }),
            strings.calendarChangeDayHoursDoneMessage,
          )
        }
      />
    </>
  );
}

interface DaySelection {
  calendarId: string;
  workerId: string;
  localDate: string;
  opensAt: string;
  closesAt: string;
}

function DayForm({
  title,
  description,
  submitLabel,
  workers,
  disabled,
  strings,
  withTimes = false,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  workers: { worker: { workerId: string; displayName: string }; calendar: { calendarId: string; name: string } }[];
  disabled: boolean;
  strings: ConsoleStrings;
  withTimes?: boolean;
  onSubmit: (selection: DaySelection) => void;
}) {
  const [workerId, setWorkerId] = useState(workers[0].worker.workerId);
  const [localDate, setLocalDate] = useState("");
  const [opensAt, setOpensAt] = useState("11:00");
  const [closesAt, setClosesAt] = useState("16:00");

  const selected = workers.find((pair) => pair.worker.workerId === workerId) ?? workers[0];

  return (
    <Panel title={title} description={description}>
      <form
        className="ago-stack"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          onSubmit({ calendarId: selected.calendar.calendarId, workerId: selected.worker.workerId, localDate, opensAt, closesAt });
        }}
      >
        <Field label={strings.calendarWorkerFieldLabel}>
          {(controlProps) => (
            <Select {...controlProps} value={workerId} onChange={(e) => setWorkerId(e.target.value)} disabled={disabled}>
              {workers.map((pair) => (
                <option key={pair.worker.workerId} value={pair.worker.workerId}>
                  {pair.worker.displayName} · {pair.calendar.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={strings.calendarDayFieldLabel}>
          {/* The shop's own business day, in the calendar's zone - not the reader's, unchanged. */}
          {(controlProps) => <Input {...controlProps} type="date" value={localDate} onChange={(e) => setLocalDate(e.target.value)} required disabled={disabled} />}
        </Field>

        {withTimes && (
          <>
            <Field label={strings.calendarOpensFieldLabel}>
              {(controlProps) => <Input {...controlProps} type="time" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} disabled={disabled} />}
            </Field>
            <Field label={strings.calendarClosesFieldLabel}>
              {(controlProps) => <Input {...controlProps} type="time" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} disabled={disabled} />}
            </Field>
          </>
        )}

        <div className="ago-row">
          <Button type="submit" variant="primary" disabled={disabled}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
