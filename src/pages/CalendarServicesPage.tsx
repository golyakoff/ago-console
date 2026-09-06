import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { usePermissions } from "../auth/PermissionsContext.js";
import { config } from "../config.js";
import { createService, getConfiguration, type TenantConfiguration } from "../api/calendarApi.js";
import { calendarErrorMessage } from "./calendarErrorMessage.js";
import { CalendarAccessRefusal } from "../calendar/calendarAccess.js";
import { PageHead } from "../shell/AppShell.js";
import { Panel } from "../components/Panel.js";
import { Field } from "../components/Field.js";
import { Input } from "../components/Input.js";
import { Button } from "../components/Button.js";
import { Alert } from "../components/Alert.js";
import { Skeleton, Spinner } from "../components/Spinner.js";
import { useStrings } from "../i18n/StringsContext.js";
import type { ConsoleStrings } from "../i18n/strings.js";

/**
 * `23-31`: `/calendar/services` - the services dictionary, carved out of `/calendar/setup`
 * (`CalendarSetupPage`) onto its own screen. The item's own table names why: dictionaries-first,
 * then what came of them, then configuration last, and a service is one of the dictionaries a
 * booking is built from (alongside masters and the schedule), not part of the embed/calendars/
 * working-hours configuration `/calendar/setup` still owns after this split.
 *
 * **No new API.** `TenantConfiguration.services` and `createService` already existed for
 * `CalendarSetupPage`'s own combined screen - this page reads and writes the identical fields, only
 * from a route of its own. Re-fetches the whole configuration on mount and after every write, the
 * same "no optimistic update, no client-side cache, the authoritative answer is always the next GET"
 * discipline `CalendarSetupPage`'s own doc comment states for the source screen this was split from.
 *
 * **Still only name and duration.** `23-31`'s own Out of scope: "the calendar's own service
 * dictionary gaining price and description - `23-35`, and it is a question before it is work." This
 * screen does not add fields `CalendarSetupPage`'s old `ServiceForm` did not already have; it only
 * gives the existing ones their own address.
 */
export function CalendarServicesPage() {
  const { user } = useAuth();
  const { permissions, hasPermission } = usePermissions();
  const strings = useStrings();
  const [configuration, setConfiguration] = useState<TenantConfiguration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const accessToken = user?.access_token;
      if (!accessToken) {
        return;
      }
      try {
        const loaded = await getConfiguration(accessToken, signal);
        setConfiguration(loaded);
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
      <CalendarAccessRefusal
        title={strings.navCalendarServices}
        forbiddenMessage={strings.calendarSetupForbidden}
        strings={strings}
      />
    );
  }

  if (config.calendarApiBaseUrl === null) {
    return (
      <>
        <PageHead title={strings.navCalendarServices} />
        <Alert tone="info">{strings.calendarNotConfigured}</Alert>
      </>
    );
  }

  const accessToken = user?.access_token;
  if (accessToken === undefined) {
    // `RequireAuth` guarantees a signed-in session by the time this renders - same "reaching here is
    // a wiring bug" reasoning `CalendarSetupPage`'s own equivalent check states.
    return null;
  }

  if (configuration === null) {
    return (
      <>
        <PageHead title={strings.navCalendarServices} />
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Panel><Skeleton lines={3} label={strings.calendarLoading} /></Panel>}
      </>
    );
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

  return (
    <>
      <PageHead title={strings.navCalendarServices} />

      {error !== null && <Alert tone="danger">{error}</Alert>}

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
    </>
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
