import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  addWorkingHoursRule,
  createCalendar,
  getBookingReadiness,
  getConfiguration,
  setAllowedOrigins,
  type CalendarReadiness,
  type TenantConfiguration,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { timeZoneOptions, weekdayNames } from "../calendar/calendarFormat.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { BookingReadiness } from "../calendar/BookingReadiness.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Textarea } from "../components/Textarea.js";
import { Select } from "../components/Select.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `22-06`/`adr/0093`: `/calendar/setup` - tenant setup (calendars, services, working hours, the
 * embed's own allowed origins), moved from `ago-calendar-console`'s own `ConfigurationPage.tsx` and
 * rewritten against this console's closed eleven-component set - see `calendar/WorkersTable.tsx`'s
 * own doc comment for why every calendar screen is a rewrite rather than a port.
 *
 * <b>One screen, three short forms, and a re-read after every write.</b> Unchanged from the source:
 * no optimistic update, no client-side cache - the authoritative answer is always the next `GET`.
 *
 * <b>`20-13`: workers stay on their own screen</b> (`/calendar/masters`) - this page's own working-
 * hours form still reads `configuration.workers` to name whose hours are whose, unchanged.
 *
 * <b>`23-31`: the services dictionary moved out, to `/calendar/services`.</b> This screen now owns
 * exactly the embed/calendars/working-hours forms - see `CalendarServicesPage`'s own doc comment for
 * the split's reasoning. `configuration.services` is still read by nothing here; the `<Panel>` that
 * once rendered it is gone, not merely hidden.
 */
export function CalendarSetupPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [readiness, setReadiness] = useState<CalendarReadiness[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }

      const critical = getConfiguration(accessToken, signal)
        .then((loadedConfiguration) => {
          setConfiguration(loadedConfiguration);
          setError(null);
        })
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) {
            setError(calendarErrorMessage(reason, strings));
          }
        });

      // `23-23`: readiness is supplementary, not critical - see `CalendarWorkersPage.reload`'s own
      // remarks on why this is caught independently rather than joined into the `Promise.all` above.
      const readinessLoad = getBookingReadiness(accessToken, signal)
        .then(setReadiness)
        .catch((reason: unknown) => {
          if (!(reason instanceof DOMException && reason.name === "AbortError")) {
            setReadiness(null);
          }
        });

      await Promise.all([critical, readinessLoad]);
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
    // `23-21`: the shared refusal - see `calendarAccess.tsx`'s own doc comment.
    return (
      <CalendarAccessRefusal
        title={strings.navCalendarSetup}
        forbiddenMessage={strings.calendarSetupForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarSetup} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined) {
    // `RequireAuth` guarantees a signed-in session by the time this renders - same
    // "reaching here is a wiring bug" reasoning `FaqModulePage`/`WidgetConfigPage` state for their
    // own equivalent check. Narrows `accessToken` to `string` for every closure built below, so the
    // three sub-forms' own `onSubmit` handlers need no repeated null check or assertion.
    return null;
  }

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await reload();
    } catch (reason) {
      setError(calendarErrorMessage(reason, strings));
    } finally {
      setBusy(false);
    }
  };

  if (configuration === null) {
    return (
      <>
        <PageHead title={strings.navCalendarSetup} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={5} label={strings.calendarLoading} /></Panel>}
      </>
    );
  }

  const days = weekdayNames(strings);

  return (
    <>
      <PageHead title={strings.navCalendarSetup} description={configuration.tenantName} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

      <BookingReadiness readiness={readiness} />

      <Panel title={strings.calendarSetupOriginsTitle} description={strings.calendarSetupOriginsDescription}>
        <p className="ago-field__description">{strings.calendarSetupBookingAutomaticNote}</p>
        <OriginsForm
          origins={configuration.allowedOrigins}
          disabled={busy}
          strings={strings}
          onSubmit={(origins) => void run(() => setAllowedOrigins(accessToken, origins))}
        />
      </Panel>

      <Panel title={strings.calendarSetupCalendarsTitle}>
        <ul>
          {configuration.calendars.map((calendar) => (
            <li key={calendar.calendarId}>
              <strong>{calendar.name}</strong> · {calendar.timeZone} ·{" "}
              {calendar.isPublished ? strings.calendarPublishedLabel : strings.calendarNotPublishedLabel}
              <ul>
                {calendar.workingHours.map((rule) => (
                  <li key={rule.ruleId}>
                    {days[rule.dayOfWeek]} {rule.startsAt}–{rule.endsAt} ·{" "}
                    {configuration.workers.find((worker) => worker.workerId === rule.workerId)?.displayName ?? rule.workerId}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
        <CalendarForm disabled={busy} strings={strings} onSubmit={(body) => void run(() => createCalendar(accessToken, body))} />
      </Panel>

      <Panel title={strings.calendarSetupWorkingHoursTitle} description={strings.calendarSetupWorkingHoursDescription}>
        <WorkingHoursForm
          configuration={configuration}
          disabled={busy}
          strings={strings}
          onSubmit={(body) => void run(() => addWorkingHoursRule(accessToken, body))}
        />
      </Panel>
    </>
  );
}

// `22-22` found and fixed this screen's embed snippet - `data-booking` was handed this tenant's
// calendar public key while the widget tested `dataset["booking"] === "true"`, so a real key
// evaluated to false and the booking chip silently never rendered. `23-105` (`docs/backlog/23-105-*
// .md`, `adr/0151`) found the snippet itself was the wrong fix: booking is an entitlement, and
// `adr/0151` says only the platform grants one - a shop's own page asserting it (via any attribute,
// spelled correctly or not) was never this screen's promise to keep. This screen no longer emits an
// embed snippet at all; `ago-widget` now learns whether booking is enabled from the same handshake
// response that already carries colour, position and locale (`VisitorSessionResponse.enabledModules`),
// so a page pasted before this shipped and never touched again gets booking the moment the platform
// grants it. `InstallSnippetPage` is unchanged and remains the one screen that emits an embed tag -
// it never carried `data-booking`, so after this there is exactly one snippet in the console and
// nothing product-specific in it, which is the information-architecture question `22-22` recorded.

function OriginsForm({
  origins,
  disabled,
  strings,
  onSubmit,
}: {
  origins: string[];
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (origins: string[]) => void;
}) {
  const [text, setText] = useState(origins.join("\n"));

  // `23-96`: adjusted during render, not in an effect - `react-hooks/set-state-in-effect` (v7) flags a
  // synchronous `setState` in an effect body; comparing against the previous `origins` here
  // (react.dev/learn/you-might-not-need-an-effect, "Adjusting some state when a prop changes")
  // re-seeds `text` on the same render `origins` changes, matching the old effect's behaviour exactly
  // (including that it has no "touched" guard - a fresh `origins` still overwrites unsaved local edits).
  const [prevOrigins, setPrevOrigins] = useState(origins);
  if (origins !== prevOrigins) {
    setPrevOrigins(origins);
    setText(origins.join("\n"));
  }

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit(
          text
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0),
        );
      }}
    >
      <Field label={strings.calendarSetupOriginsFieldLabel}>
        {(controlProps) => (
          <Textarea {...controlProps} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={strings.siteAddressPlaceholder} disabled={disabled} />
        )}
      </Field>
      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {strings.calendarSetupSaveOriginsButton}
        </Button>
      </div>
    </form>
  );
}

function CalendarForm({
  disabled,
  strings,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (body: { name: string; timeZone: string; publish: boolean }) => void;
}) {
  const [name, setName] = useState("");
  const [timeZone, setTimeZone] = useState("Europe/Moscow");
  const [publish, setPublish] = useState(true);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit({ name, timeZone, publish });
        setName("");
      }}
    >
      <Field label={strings.calendarSetupCalendarNameLabel}>
        {(controlProps) => <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} required disabled={disabled} />}
      </Field>

      <Field label={strings.calendarSetupCalendarZoneLabel}>
        {/* `25-16`: a curated, localized dropdown - never free text. The *stored* value is still an
            IANA zone id, never an offset (wrong for half the year in any zone with DST, and this
            value can never change once slots exist - unchanged from the source); only how a tenant
            picks it changed. `timeZoneOptions` also guarantees the currently-selected value always
            has a matching `<option>`, even for a saved zone outside the curated eleven. */}
        {(controlProps) => (
          <Select {...controlProps} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required disabled={disabled}>
            {timeZoneOptions(strings, timeZone).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <label className="ago-row">
        <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={disabled} />
        <span>{strings.calendarSetupCalendarPublishedLabel}</span>
      </label>

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {strings.calendarSetupAddCalendarButton}
        </Button>
      </div>
    </form>
  );
}

function WorkingHoursForm({
  configuration,
  disabled,
  strings,
  onSubmit,
}: {
  configuration: TenantConfiguration;
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (body: { calendarId: string; workerId: string; dayOfWeek: number; startsAt: string; endsAt: string }) => void;
}) {
  const [workerId, setWorkerId] = useState(configuration.workers[0]?.workerId ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("18:00");

  if (configuration.workers.length === 0) {
    return <p className="ago-meta">{strings.calendarSetupNoWorkersNote}</p>;
  }

  const worker = configuration.workers.find((candidate) => candidate.workerId === workerId) ?? configuration.workers[0];
  const calendar = configuration.calendars.find((candidate) => candidate.workerIds.includes(worker.workerId));
  const days = weekdayNames(strings);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (calendar === undefined) {
          return;
        }
        onSubmit({ calendarId: calendar.calendarId, workerId: worker.workerId, dayOfWeek, startsAt, endsAt });
      }}
    >
      <Field label={strings.calendarWorkerFieldLabel}>
        {(controlProps) => (
          <Select {...controlProps} value={worker.workerId} onChange={(e) => setWorkerId(e.target.value)} disabled={disabled}>
            {configuration.workers.map((candidate) => (
              <option key={candidate.workerId} value={candidate.workerId}>
                {candidate.displayName}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={strings.calendarDayFieldLabel}>
        {(controlProps) => (
          <Select {...controlProps} value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} disabled={disabled}>
            {days.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <Field label={strings.calendarOpensFieldLabel}>
        {(controlProps) => <Input {...controlProps} type="time" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={disabled} />}
      </Field>

      <Field label={strings.calendarClosesFieldLabel}>
        {(controlProps) => <Input {...controlProps} type="time" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={disabled} />}
      </Field>

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled || calendar === undefined}>
          {strings.calendarSetupAddWorkingHoursButton}
        </Button>
      </div>
      {calendar === undefined && <p className="ago-meta">{strings.calendarSetupWorkerNotOnCalendarNote}</p>}
    </form>
  );
}
