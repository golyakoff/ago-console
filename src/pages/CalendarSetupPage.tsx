import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import {
  addWorkingHoursRule,
  createCalendar,
  createService,
  getBookingReadiness,
  getConfiguration,
  setAllowedOrigins,
  type CalendarReadiness,
  type TenantConfiguration,
} from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { weekdayNames } from "../calendar/calendarFormat.js";
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
 * <b>`20-13`: workers stay on their own screen</b> (`/calendar/workers`) - this page's own working-
 * hours form still reads `configuration.workers` to name whose hours are whose, unchanged.
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

      try {
        const [loadedConfiguration, loadedReadiness] = await Promise.all([
          getConfiguration(accessToken, signal),
          getBookingReadiness(accessToken, signal),
        ]);
        setConfiguration(loadedConfiguration);
        setReadiness(loadedReadiness);
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

      <Panel title={strings.calendarSetupOriginsTitle} description={strings.calendarSetupEmbedDescription}>
        <pre aria-label={strings.calendarSetupEmbedSnippetAriaLabel}>{embedSnippet()}</pre>

        <p className="ago-field__description">
          {strings.calendarSetupEmbedSiteKeyHint} <Link to="/settings/install">{strings.navInstallWidget}</Link>
        </p>

        <p className="ago-field__description">{strings.calendarSetupOriginsDescription}</p>
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

      <Panel title={strings.calendarSetupServicesTitle}>
        <ul>
          {configuration.services.map((service) => (
            <li key={service.serviceId}>
              {service.name} · {service.durationMinutes}
              {strings.calendarSetupServiceMinutesSuffix}
            </li>
          ))}
        </ul>
        <ServiceForm disabled={busy} strings={strings} onSubmit={(body) => void run(() => createService(accessToken, body))} />
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

/**
 * `22-22`: every attribute here is one the widget actually reads, taken from
 * `ago-widget/src/config.ts` rather than remembered. Its `parseConfig` accepts exactly `data-site`,
 * `data-api`, `data-booking`, `data-demo-notice` and `data-public-demo` - nothing else.
 *
 * <b>Four things were wrong, and only one of them was visible.</b> The host was a literal ellipsis
 * and the filename was `ago-chat.js`; `#342` renamed the bundle to `widget.js`, and
 * {@link InstallSnippetPage} composes its own URL from `apiBaseUrl` for the reason its comment
 * gives, so this composes it the same way rather than keeping a second spelling that can drift.
 * `data-booking-api` was read by nothing at all. And `data-booking` was given this tenant`s calendar
 * public key while the widget tests `dataset["booking"] === "true"` - so a real key evaluated to
 * false and <b>the booking chip silently never rendered</b>: the widget loaded, chat worked, and
 * booking simply was not there. That is the one a tenant could not have diagnosed.
 *
 * <b>The site key stays a placeholder deliberately.</b> It is the chat site`s key, and reading it
 * needs `site:configure` (`GET /api/v1/sites/{siteId}/installation`) - a permission this screen does
 * not require, since `calendar:configure` reaches here. Fetching it would either fail for a
 * calendar-only operator or widen this screen`s own gate. The copy names where to get it instead.
 * Whether a tenant should meet two embed snippets at all is an information-architecture question
 * `22-22` records and does not answer.
 */
function embedSnippet(): string {
  return [
    `<script src="${config.apiBaseUrl}/widget/widget.js"`,
    `        data-site="YOUR-CHAT-SITE-KEY"`,
    `        data-booking="true"`,
    `        async></script>`,
  ].join("\n");
}

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

  useEffect(() => setText(origins.join("\n")), [origins]);

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
          <Textarea {...controlProps} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://shop.example" disabled={disabled} />
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
        {/* An IANA zone id, never an offset: wrong for half the year in any zone with DST, and this
            value can never change once slots exist - unchanged from the source. */}
        {(controlProps) => <Input {...controlProps} value={timeZone} onChange={(e) => setTimeZone(e.target.value)} required disabled={disabled} />}
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

function ServiceForm({
  disabled,
  strings,
  onSubmit,
}: {
  disabled: boolean;
  strings: ConsoleStrings;
  onSubmit: (body: { name: string; durationMinutes: number }) => void;
}) {
  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(45);

  return (
    <form
      className="ago-stack"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        onSubmit({ name, durationMinutes });
        setName("");
      }}
    >
      <Field label={strings.calendarSetupServiceNameLabel}>
        {(controlProps) => <Input {...controlProps} value={name} onChange={(e) => setName(e.target.value)} required disabled={disabled} />}
      </Field>

      <Field label={strings.calendarSetupServiceDurationLabel}>
        {(controlProps) => (
          <Input {...controlProps} type="number" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} disabled={disabled} />
        )}
      </Field>

      <div className="ago-row">
        <Button type="submit" variant="primary" disabled={disabled}>
          {strings.calendarSetupAddServiceButton}
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
